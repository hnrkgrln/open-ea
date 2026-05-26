import React, { useState, useEffect, useLayoutEffect, useMemo } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Edit2, Plus, Trash2, CheckCircle2, Database, Boxes, ShieldCheck, Info, Network, User, ArrowUpRight, ChevronLeft, LogOut, LogIn, FileText } from 'lucide-react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { DatePicker } from './DatePicker';
import { ColoredSelect } from './ColoredSelect';
import { InlineFilter } from './FilterControls';
import { CustomCheckbox } from './CustomCheckbox';
import { ReferencesEditor, parseReferences, serializeReferences, type Reference } from './References';

const safeJsonParse = (str: string | null | undefined, fallback: any = {}) => {
  if (!str) return fallback;
  try {
    return JSON.parse(str);
  } catch (e) {
    return fallback;
  }
};

const getScaleGradient = (scaleType: string) => {
  switch (scaleType) {
    case 'good-bad': return 'linear-gradient(to right, #2b8a3e, #fab005, #c92a2a)';
    case 'bad-good': return 'linear-gradient(to right, #c92a2a, #fab005, #2b8a3e)';
    case 'low-high': return 'linear-gradient(to right, #e7f5ff, #1864ab)';
    case 'importance': return 'linear-gradient(to right, #dee2e6, #7048e8)';
    default: return 'linear-gradient(to right, var(--accent), var(--primary))';
  }
};

export const EditAppPage = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const isNew = !id || id === 'new' || id === 'undefined';

  const [loading, setLoading] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [capSearch, setCapSearch] = useState('');
  const [hydrated, setHydrated] = useState(isNew);

  const [formData, setFormData] = useState({
    name: '',
    description: '',
    owner: '',
    ownerOrgId: '',
    lifecycle: '',
    lifecycleStartDate: '',
    lifecycleEndDate: '',
    type: '',
    criticality: '3',
    functionalFit: '3',
    technicalFit: '3',
  });
  const [selectedCapIds, setSelectedCapIds] = useState<string[]>([]);
  const [selectedInfoIds, setSelectedInfoIds] = useState<string[]>([]);
  const [infoSearch, setInfoSearch] = useState('');
  const [dynamicValues, setDynamicValues] = useState<Record<string, any>>({});
  const [references, setReferences] = useState<Reference[]>([]);

  const { data: app, isLoading: isAppLoading } = useQuery({
    queryKey: ['application', id],
    queryFn: () => fetch(`/api/applications/${id}`).then(res => res.json()),
    enabled: !isNew && !!id && id !== 'undefined'
  });

  const { data: apps } = useQuery<any[]>({ queryKey: ['applications'], queryFn: () => fetch('/api/applications').then(res => res.json()) });
  const { data: capabilities } = useQuery<any[]>({ queryKey: ['capabilities'], queryFn: () => fetch('/api/capabilities').then(res => res.json()) });
  const { data: organizations } = useQuery<any[]>({ queryKey: ['organizations'], queryFn: () => fetch('/api/organizations').then(res => res.json()) });
  const { data: picklists } = useQuery<any[]>({ queryKey: ['picklists'], queryFn: () => fetch('/api/picklists').then(res => res.json()) });
  const { data: metaDefs } = useQuery<any[]>({ queryKey: ['metadata-definitions'], queryFn: () => fetch('/api/metadata-definitions').then(res => res.json()) });
  const { data: allIntegrations } = useQuery<any[]>({ queryKey: ['integrations'], queryFn: () => fetch('/api/integrations').then(res => res.json()) });
  const { data: informationObjects } = useQuery<any[]>({ queryKey: ['information-objects'], queryFn: () => fetch('/api/information-objects').then(res => res.json()) });

  // Populate formData from the DB before the form mounts. We gate rendering on
  // `hydrated` below so Radix Select instances never see stale default values —
  // they mount once with the correct DB-backed value, avoiding the case where
  // a placeholder briefly registers and overwrites the real selection.
  useLayoutEffect(() => {
    if (app && !isNew && !hydrated) {
      setFormData({
        name: app.name || '',
        description: app.description || '',
        owner: app.owner || '',
        ownerOrgId: app.ownerOrgId || '',
        lifecycle: app.lifecycle || '',
        lifecycleStartDate: app.lifecycleStartDate ? app.lifecycleStartDate.split('T')[0] : '',
        lifecycleEndDate: app.lifecycleEndDate ? app.lifecycleEndDate.split('T')[0] : '',
        type: app.type || '',
        criticality: String(app.criticality || '3'),
        functionalFit: String(app.functionalFit || '3'),
        technicalFit: String(app.technicalFit || '3'),
      });
      setSelectedCapIds(app.capabilities?.map((c: any) => c.id) || []);
      setSelectedInfoIds(app.processedInformationObjects?.map((io: any) => io.id) || []);
      setDynamicValues(safeJsonParse(app.metadata));
      setReferences(parseReferences(app.references));
      setHydrated(true);
    }
  }, [app, isNew, hydrated]);

  // Inheritance Logic
  const { inheritedValue, isFieldDisabled } = useMemo(() => {
    if (!capabilities || selectedCapIds.length === 0) return { inheritedValue: null, isFieldDisabled: false };
    
    const getRecursiveMaxCrit = (capIds: string[]): number => {
        let max = 0;
        capIds.forEach(id => {
            const cap = capabilities.find(c => c.id === id);
            if (cap) {
                max = Math.max(max, Number(cap.criticality || 1));
                const childIds = capabilities.filter(c => c.parentId === id).map(c => c.id);
                if (childIds.length > 0) max = Math.max(max, getRecursiveMaxCrit(childIds));
            }
        });
        return max;
    };

    const maxScore = getRecursiveMaxCrit(selectedCapIds);
    if (maxScore > 0) {
        return { 
            inheritedValue: String(maxScore), 
            isFieldDisabled: true 
        };
    }
    
    return { inheritedValue: null, isFieldDisabled: false };
  }, [capabilities, selectedCapIds]);

  // Update form data if inherited value changes
  useEffect(() => {
    if (inheritedValue !== null) {
      setFormData(prev => ({ ...prev, criticality: inheritedValue }));
    }
  }, [inheritedValue]);

  const appIntegrations = useMemo(() => {
    if (!allIntegrations || isNew) return [];
    return allIntegrations.filter(i => i.sourceAppId === id || i.targetAppId === id);
  }, [allIntegrations, id, isNew]);

  const filteredCaps = useMemo(() => {
    if (!capabilities) return [];
    if (!capSearch) return capabilities;
    return capabilities.filter(c => c.name.toLowerCase().includes(capSearch.toLowerCase()));
  }, [capabilities, capSearch]);

  const filteredInfoObjects = useMemo(() => {
    if (!informationObjects) return [];
    const q = infoSearch.trim().toLowerCase();
    if (!q) return informationObjects;
    return informationObjects.filter(io =>
      io.name.toLowerCase().includes(q) ||
      (io.aliases || '').toLowerCase().includes(q)
    );
  }, [informationObjects, infoSearch]);

  const appMetaDefs = metaDefs?.filter(d => d.entityType === 'Application') || [];
  
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isNew && (!id || id === 'undefined')) {
      alert("Invalid ID. Cannot save changes.");
      return;
    }
    setLoading(true);
    const payload = { 
      ...formData, 
      ownerOrgId: formData.ownerOrgId === '' ? null : formData.ownerOrgId,
      lifecycleStartDate: formData.lifecycleStartDate ? new Date(formData.lifecycleStartDate).toISOString() : null,
      lifecycleEndDate: formData.lifecycleEndDate ? new Date(formData.lifecycleEndDate).toISOString() : null,
      capabilityIds: selectedCapIds,
      processedInformationObjectIds: selectedInfoIds,
      metadata: JSON.stringify(dynamicValues),
      references: serializeReferences(references)
    };

    try {
      const url = isNew ? '/api/applications' : `/api/applications/${id}`;
      const method = isNew ? 'POST' : 'PUT';
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (res.ok) {
        const saved = await res.json();
        const appId = isNew ? saved.id : id;
        queryClient.invalidateQueries({ queryKey: ['application', appId] });
        queryClient.invalidateQueries({ queryKey: ['applications'] });
        queryClient.invalidateQueries({ queryKey: ['integrations'] });
        queryClient.invalidateQueries({ queryKey: ['organizations'] });
        queryClient.invalidateQueries({ queryKey: ['organization'] });
        navigate(`/apps/${appId}`);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!app || isNew) return;
    if (!confirm(`Are you sure you want to delete "${app.name}"?`)) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/applications/${id}`, { method: 'DELETE' });
      if (res.ok) {
        queryClient.invalidateQueries({ queryKey: ['applications'] });
        navigate('/apps');
      }
    } catch (err) { console.error(err); } finally { setDeleting(false); }
  };

  // Don't render the form until both the application AND the picklists are loaded,
  // AND formData has been hydrated from the DB. Otherwise dropdowns can mount with
  // default values that then get committed back, overwriting real DB values.
  if (!isNew && (isAppLoading || !app)) return <div style={{ padding: '4rem', textAlign: 'center' }} className="loading-text">Loading application...</div>;
  if (!picklists) return <div style={{ padding: '4rem', textAlign: 'center' }} className="loading-text">Loading picklists...</div>;
  if (!hydrated) return <div style={{ padding: '4rem', textAlign: 'center' }} className="loading-text">Loading application...</div>;

  const strategicPicklists = [
    { label: 'Business Criticality', key: 'criticality', options: picklists?.find(p => p.name === 'criticality')?.options || [] },
    { label: 'Functional Fit', key: 'functionalFit', options: picklists?.find(p => p.name === 'functional_fit')?.options || [] },
    { label: 'Technical Fit', key: 'technicalFit', options: picklists?.find(p => p.name === 'technical_fit')?.options || [] },
  ];

  const otherMetaDefs = appMetaDefs.filter(d => d.fieldType !== 'range');
  const rangeMetaDefs = appMetaDefs.filter(d => d.fieldType === 'range');

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: 'var(--background)' }}>
      <div style={{ padding: '0.6rem 1.25rem', borderBottom: '1px solid var(--border)', background: 'var(--card)', display: 'flex', alignItems: 'center', gap: '0.75rem', flexShrink: 0 }}>
        <button onClick={() => navigate(-1)} style={{ background: 'none', border: 'none', padding: '0.35rem', cursor: 'pointer', display: 'flex', alignItems: 'center', color: 'var(--muted-foreground)', borderRadius: '6px' }} className="row-hover">
          <ChevronLeft size={18} />
        </button>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.8rem' }}>
          <span style={{ color: 'var(--muted-foreground)', cursor: 'pointer' }} onClick={() => navigate('/apps')}>Inventory</span>
          <span style={{ color: 'var(--border)', fontWeight: 300 }}>/</span>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', color: 'var(--foreground)', fontWeight: 600 }}>
            <Edit2 size={12} style={{ opacity: 0.6 }} />
            <span>{isNew ? 'New Application' : 'Edit Application'}</span>
          </div>
        </div>
      </div>

      <div style={{ flex: 1, overflowY: 'auto' }}>
        <form onSubmit={handleSubmit} className="main-container" style={{ padding: '2rem 1.25rem 4rem 1.25rem', maxWidth: '1000px' }}>
          <div style={{ marginBottom: '2rem', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
                <span style={{ fontSize: '0.6rem', fontWeight: 900, textTransform: 'uppercase', padding: '0.15rem 0.5rem', borderRadius: '4px', background: 'var(--primary)', color: 'var(--primary-foreground)', letterSpacing: '0.05em', display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                  <Database size={10} /> Application
                </span>
              </div>
              <h1 style={{ fontSize: '1.75rem', fontWeight: 800, margin: 0, letterSpacing: '-0.02em' }}>{isNew ? 'New Application' : app?.name}</h1>
              <p style={{ color: 'var(--muted-foreground)', fontSize: '1rem', marginTop: '0.4rem' }}>Define technical characteristics and strategic fit.</p>
            </div>
            <div style={{ display: 'flex', gap: '0.75rem' }}>
              <button type="button" onClick={() => navigate(-1)} className="secondary" style={{ height: '2.4rem', padding: '0 1.25rem', fontSize: '0.85rem' }}>Discard</button>
              <button type="submit" className="primary" disabled={loading} style={{ height: '2.4rem', padding: '0 1.5rem', fontWeight: 800, fontSize: '0.85rem' }}>
                {loading ? 'Saving...' : (isNew ? 'Create Application' : 'Save Changes')}
              </button>
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '2.5rem' }}>
            {/* BASIC INFO */}
            <section>
              <h3 style={{ fontSize: '0.75rem', fontWeight: 800, textTransform: 'uppercase', color: 'var(--muted-foreground)', marginBottom: '1.25rem', display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                <Info size={16} /> Basic Information
              </h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                <div className="field" style={{ marginBottom: 0 }}>
                  <label className="label">Application Name</label>
                  <input required value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} style={{ padding: '0.75rem', fontSize: '1.1rem', fontWeight: 600, height: 'auto' }} placeholder="e.g. Core Banking System" />
                </div>
                <div className="field" style={{ marginBottom: 0 }}>
                  <label className="label">Description</label>
                  <textarea rows={3} value={formData.description} onChange={e => setFormData({...formData, description: e.target.value})} style={{ padding: '0.75rem' }} placeholder="Purpose and primary functions..." />
                </div>
                
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem' }}>
                  <div className="field" style={{ marginBottom: 0 }}>
                    <label className="label">Business Owner (Individual)</label>
                    <input value={formData.owner} onChange={e => setFormData({...formData, owner: e.target.value})} style={{ padding: '0.6rem 0.8rem', fontSize: '0.9rem', height: '2rem' }} placeholder="e.g. John Doe" />
                  </div>
                  <div className="field" style={{ marginBottom: 0 }}>
                    <label className="label">Owning Organization</label>
                    <ColoredSelect
                      value={formData.ownerOrgId}
                      onChange={(val) => setFormData({ ...formData, ownerOrgId: val })}
                      placeholder="Select organization..."
                      options={[
                        { value: '', label: 'Unassigned' },
                        ...((organizations || []).map((o: any) => ({ value: o.id, label: o.name })))
                      ]}
                      style={{ height: '2rem', fontSize: '0.85rem' }}
                    />
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem' }}>
                  <div className="field" style={{ marginBottom: 0 }}>
                    <label className="label">Application Type</label>
                    <ColoredSelect
                      value={formData.type}
                      onChange={(val) => setFormData({ ...formData, type: val })}
                      options={[{ value: '', label: 'Select Type...' }, ...(picklists?.find(p => p.name === 'application_type')?.options || [])]}
                      style={{ height: '2rem', fontSize: '0.85rem' }}
                    />
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '1rem', background: 'rgba(0,0,0,0.02)', padding: '1rem', borderRadius: '12px', border: '1px solid var(--border)' }}>
                  <div className="field" style={{ marginBottom: 0 }}>
                    <label className="label">Lifecycle Status</label>
                    <ColoredSelect
                      value={formData.lifecycle}
                      onChange={(val) => setFormData({ ...formData, lifecycle: val })}
                      options={picklists?.find(p => p.name === 'lifecycle')?.options || []}
                      placeholder="Select lifecycle..."
                      style={{ height: '2rem', fontSize: '0.85rem' }}
                    />
                  </div>
                  <div style={{ marginBottom: 0 }}>
                    <DatePicker 
                      label="Lifecycle Start Date" 
                      value={formData.lifecycleStartDate} 
                      onChange={val => setFormData({...formData, lifecycleStartDate: val})} 
                    />
                  </div>
                  <div style={{ marginBottom: 0 }}>
                    <DatePicker 
                      label="Lifecycle End Date" 
                      value={formData.lifecycleEndDate} 
                      onChange={val => setFormData({...formData, lifecycleEndDate: val})} 
                    />
                  </div>
                </div>
              </div>
            </section>

            {/* STRATEGIC ASSESSMENT */}
            <section style={{ background: 'var(--card)', padding: '1.5rem', borderRadius: '16px', border: '1px solid var(--border)' }}>
              <h3 style={{ fontSize: '0.75rem', fontWeight: 800, textTransform: 'uppercase', color: 'var(--muted-foreground)', marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                <ShieldCheck size={16} /> Strategic Assessment
              </h3>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '2rem' }}>
                  {strategicPicklists.map(item => {
                    const isDisabled = item.key === 'criticality' && isFieldDisabled;
                    return (
                        <div key={item.key} className="field" style={{ opacity: isDisabled ? 0.6 : 1 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.75rem' }}>
                            <div style={{ display: 'flex', flexDirection: 'column' }}>
                                <label className="label" style={{ fontSize: '0.85rem', fontWeight: 700 }}>{item.label}</label>
                                {isDisabled && <span style={{ fontSize: '0.65rem', color: 'var(--brand-focus)', fontWeight: 800 }}>INHERITED FROM CAPABILITIES</span>}
                                {!isDisabled && item.key === 'criticality' && <span style={{ fontSize: '0.65rem', color: 'var(--muted-foreground)', fontWeight: 600 }}>Direct Application Attribute</span>}
                            </div>
                            <div style={{ fontSize: '0.8rem', fontWeight: 800, display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                            {item.options.find((o:any) => o.value === (formData as any)[item.key])?.color && <div style={{ width: '6px', height: '6px', borderRadius: '50%', background: item.options.find((o:any) => o.value === (formData as any)[item.key])?.color }} />}
                            {item.options.find((o:any) => o.value === (formData as any)[item.key])?.label}
                            </div>
                        </div>
                        <input 
                            type="range" 
                            min="1" 
                            max="5" 
                            step="1" 
                            disabled={isDisabled}
                            style={{ background: getScaleGradient(item.key === 'criticality' ? 'importance' : 'bad-good'), cursor: isDisabled ? 'not-allowed' : 'pointer' }} 
                            value={(formData as any)[item.key]} 
                            onChange={e => setFormData({...formData, [item.key]: e.target.value})} 
                        />
                        </div>
                    );
                  })}
                  {rangeMetaDefs.map(def => (
                    <div key={def.id} className="field">
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.75rem' }}>
                        <label className="label" style={{ fontSize: '0.85rem', fontWeight: 700 }}>{def.label}</label>
                        <div style={{ fontSize: '0.8rem', fontWeight: 800 }}>{dynamicValues[def.fieldName] ?? def.min ?? 0}</div>
                      </div>
                      <input type="range" min={def.min ?? 0} max={def.max ?? 100} step="1" style={{ background: getScaleGradient(def.scaleType) }} value={dynamicValues[def.fieldName] ?? def.min ?? 0} onChange={e => setDynamicValues({...dynamicValues, [def.fieldName]: Number(e.target.value)})} />
                    </div>
                  ))}
              </div>
            </section>

            {/* CAPABILITIES */}
            <section>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
                <h3 style={{ fontSize: '0.75rem', fontWeight: 800, textTransform: 'uppercase', color: 'var(--muted-foreground)', display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                  <Boxes size={16} /> Business Capabilities
                </h3>
                <InlineFilter value={capSearch} onChange={setCapSearch} placeholder="Search capabilities..." width="250px" />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: '0.75rem', maxHeight: '350px', overflowY: 'auto', padding: '1rem', background: 'var(--card)', borderRadius: '16px', border: '1px solid var(--border)' }}>
                {filteredCaps.map(cap => (
                  <button key={cap.id} type="button" onClick={() => setSelectedCapIds(prev => prev.includes(cap.id) ? prev.filter(c => c !== cap.id) : [...prev, cap.id])} style={{ height: 'auto', padding: '0.75rem', justifyContent: 'flex-start', background: selectedCapIds.includes(cap.id) ? 'var(--primary)' : 'var(--background)', color: selectedCapIds.includes(cap.id) ? 'var(--primary-foreground)' : 'var(--foreground)', border: '1px solid var(--border)', textAlign: 'left', fontSize: '0.8rem' }}>
                    {selectedCapIds.includes(cap.id) ? <CheckCircle2 size={14} style={{ marginRight: '0.4rem' }} /> : <Plus size={14} style={{ marginRight: '0.4rem', opacity: 0.3 }} />}
                    {cap.name}
                  </button>
                ))}
              </div>
            </section>

            {/* PROCESSED INFORMATION OBJECTS */}
            <section>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
                <h3 style={{ fontSize: '0.75rem', fontWeight: 800, textTransform: 'uppercase', color: 'var(--muted-foreground)', display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                  <FileText size={16} /> Processed Information
                </h3>
                <InlineFilter value={infoSearch} onChange={setInfoSearch} placeholder="Search information objects..." width="250px" />
              </div>
              <p style={{ fontSize: '0.75rem', color: 'var(--muted-foreground)', marginTop: '-0.75rem', marginBottom: '0.75rem' }}>
                Information objects this application processes. New integrations involving this app auto-link the payload here for convenience.
              </p>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: '0.75rem', maxHeight: '350px', overflowY: 'auto', padding: '1rem', background: 'var(--card)', borderRadius: '16px', border: '1px solid var(--border)' }}>
                {filteredInfoObjects.length === 0 ? (
                  <div style={{ color: 'var(--muted-foreground)', fontSize: '0.8rem', fontStyle: 'italic', gridColumn: '1 / -1' }}>
                    {informationObjects && informationObjects.length === 0 ? 'No information objects defined yet.' : 'No matches.'}
                  </div>
                ) : filteredInfoObjects.map((io: any) => (
                  <button
                    key={io.id}
                    type="button"
                    onClick={() => setSelectedInfoIds(prev => prev.includes(io.id) ? prev.filter(x => x !== io.id) : [...prev, io.id])}
                    style={{
                      height: 'auto',
                      padding: '0.75rem',
                      justifyContent: 'flex-start',
                      background: selectedInfoIds.includes(io.id) ? 'var(--primary)' : 'var(--background)',
                      color: selectedInfoIds.includes(io.id) ? 'var(--primary-foreground)' : 'var(--foreground)',
                      border: '1px solid var(--border)',
                      textAlign: 'left',
                      fontSize: '0.8rem'
                    }}
                  >
                    {selectedInfoIds.includes(io.id) ? <CheckCircle2 size={14} style={{ marginRight: '0.4rem' }} /> : <Plus size={14} style={{ marginRight: '0.4rem', opacity: 0.3 }} />}
                    {io.name}
                  </button>
                ))}
              </div>
            </section>

            {/* INTEGRATIONS */}
            <section>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
                <h3 style={{ fontSize: '0.75rem', fontWeight: 800, textTransform: 'uppercase', color: 'var(--muted-foreground)', display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                  <Network size={16} /> Integrations & Data Flows
                </h3>
              </div>
              
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                {appIntegrations.length > 0 ? (
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '0.4rem' }}>
                    {appIntegrations.map(int => {
                      const isSource = int.sourceAppId === id;
                      const otherApp = isSource ? int.targetApp : int.sourceApp;
                      return (
                        <div 
                          key={int.id} 
                          onClick={() => navigate(`/integrations/${int.id}/edit`)}
                          className="card row-hover" 
                          style={{ padding: '0.75rem 1rem', display: 'flex', alignItems: 'center', gap: '1rem', cursor: 'pointer' }}
                        >
                          <div style={{ background: isSource ? '#d6336c' : 'var(--primary)', color: 'white', padding: '0.35rem', borderRadius: '6px', display: 'flex' }}>
                            {isSource ? <LogOut size={14} aria-label="Outgoing" /> : <LogIn size={14} aria-label="Incoming" />}
                          </div>
                          <div style={{ flex: 1 }}>
                            <div style={{ fontWeight: 700, fontSize: '0.85rem' }}>{otherApp?.name || 'Unknown System'}</div>
                            <div style={{ fontSize: '0.7rem', color: 'var(--muted-foreground)' }}>
                              Payload: <strong>{int.payload?.name || 'Generic Object'}</strong> • {int.pattern || 'API'}
                            </div>
                          </div>
                          <ArrowUpRight size={14} style={{ opacity: 0.3 }} />
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div style={{ padding: '2rem', background: 'var(--card)', borderRadius: '16px', border: '1px dashed var(--border)', textAlign: 'center' }}>
                    <Network size={24} style={{ color: 'var(--muted-foreground)', opacity: 0.2, marginBottom: '0.75rem' }} />
                    <div style={{ color: 'var(--muted-foreground)', fontSize: '0.8rem' }}>No integrations defined for this application.</div>
                  </div>
                )}

                {!isNew && (
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', marginTop: '0.4rem' }}>
                    <button 
                      type="button" 
                      className="secondary" 
                      onClick={() => navigate(`/integrations/new?sourceAppId=${id}`)}
                      style={{ height: '2.5rem', gap: '0.6rem', justifyContent: 'center', padding: '0 1rem', fontSize: '0.85rem' }}
                    >
                      <Plus size={14} /> Establish Outbound
                    </button>
                    <button 
                      type="button" 
                      className="secondary" 
                      onClick={() => navigate(`/integrations/new?targetAppId=${id}`)}
                      style={{ height: '2.5rem', gap: '0.6rem', justifyContent: 'center', padding: '0 1rem', fontSize: '0.85rem' }}
                    >
                      <Plus size={14} /> Establish Inbound
                    </button>
                  </div>
                )}
              </div>
            </section>

            {/* CUSTOM META */}
            {otherMetaDefs.length > 0 && (
              <section>
                <h3 style={{ fontSize: '0.75rem', fontWeight: 800, textTransform: 'uppercase', color: 'var(--muted-foreground)', marginBottom: '1.25rem', display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                  <User size={16} /> Extended Metadata
                </h3>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '1.5rem', background: 'var(--card)', padding: '1.5rem', borderRadius: '16px', border: '1px solid var(--border)' }}>
                  {otherMetaDefs.map(def => (
                    <div key={def.id} style={{ display: 'flex', flexDirection: def.fieldType === 'boolean' ? 'row' : 'column', alignItems: def.fieldType === 'boolean' ? 'center' : 'flex-start', gap: '0.6rem' }}>
                      {def.fieldType === 'boolean' ? (
                        <>
                          <CustomCheckbox 
                            checked={!!dynamicValues[def.fieldName]} 
                            onChange={checked => setDynamicValues({...dynamicValues, [def.fieldName]: checked})} 
                          />
                          <label className="label" style={{ margin: 0, cursor: 'pointer', fontSize: '0.8rem' }}>{def.label}</label>
                        </>
                      ) : (
                        <>
                          <label className="label" style={{ marginBottom: '0.15rem', fontSize: '0.75rem' }}>{def.label}</label>
                          {def.fieldType === 'textarea' ? (
                            <textarea value={dynamicValues[def.fieldName] || ''} onChange={e => setDynamicValues({...dynamicValues, [def.fieldName]: e.target.value})} rows={3} style={{ marginTop: 0, fontSize: '0.85rem' }} />
                          ) : (
                            <input type={def.fieldType === 'date' ? 'date' : 'text'} value={dynamicValues[def.fieldName] || ''} onChange={e => setDynamicValues({...dynamicValues, [def.fieldName]: e.target.value})} style={{ marginTop: 0, fontSize: '0.85rem', height: '2rem' }} />
                          )}
                        </>
                      )}
                    </div>
                  ))}
                </div>
              </section>
            )}

            <ReferencesEditor value={references} onChange={setReferences} />

            {!isNew && (
              <section style={{ borderTop: '1px solid var(--border)', paddingTop: '3rem', display: 'flex', justifyContent: 'center' }}>
                <button type="button" onClick={handleDelete} className="secondary" style={{ color: 'var(--destructive)', borderColor: 'var(--destructive)', height: '2.5rem', padding: '0 1.5rem', fontSize: '0.85rem' }} disabled={deleting}>
                  <Trash2 size={16} style={{ marginRight: '0.6rem' }} /> {deleting ? 'Deleting...' : 'Decommission Application'}
                </button>
              </section>
            )}
          </div>
        </form>
      </div>
    </div>
  );
};
