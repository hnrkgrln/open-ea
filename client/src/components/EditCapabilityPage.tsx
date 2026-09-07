import React, { useState, useEffect, useLayoutEffect, useMemo } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { Edit2, CheckCircle2, Trash2, Boxes, Info, Share2, Database, ChevronLeft, Plus } from 'lucide-react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
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

export const EditCapabilityPage = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [searchParams] = useSearchParams();
  const isNew = !id || id === 'new' || id === 'undefined';

  const [loading, setLoading] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [appSearch, setAppSearch] = useState('');
  const [hydrated, setHydrated] = useState(isNew);

  const [formData, setFormData] = useState({
    name: '',
    description: '',
    parentId: (isNew ? searchParams.get('parentId') : '') as string | null,
    criticality: '3'
  });
  const [selectedAppIds, setSelectedAppIds] = useState<string[]>([]);
  const [dynamicValues, setDynamicValues] = useState<Record<string, any>>({});
  const [references, setReferences] = useState<Reference[]>([]);

  // Data Fetching
  const { data: capability, isLoading: isCapLoading } = useQuery({
    queryKey: ['capability', id],
    queryFn: () => fetch(`/api/capabilities/${id}`).then(res => res.json()),
    enabled: !isNew
  });

  const { data: allCapabilities } = useQuery<any[]>({ queryKey: ['capabilities'], queryFn: () => fetch('/api/capabilities?flat=true').then(res => res.json()) });
  const { data: allApps } = useQuery<any[]>({ queryKey: ['applications'], queryFn: () => fetch('/api/applications').then(res => res.json()) });
  const { data: picklists } = useQuery<any[]>({ queryKey: ['picklists'], queryFn: () => fetch('/api/picklists').then(res => res.json()) });
  const { data: metaDefs } = useQuery<any[]>({ queryKey: ['metadata-definitions'], queryFn: () => fetch('/api/metadata-definitions').then(res => res.json()) });

  // Populate formData from the DB before the form mounts. We gate rendering on
  // `hydrated` below so Radix Select instances never see stale default values —
  // they mount once with the correct DB-backed value, avoiding the case where
  // a placeholder briefly registers and overwrites the real selection.
  useLayoutEffect(() => {
    if (capability && !isNew && !hydrated) {
      setFormData({
        name: capability.name || '',
        description: capability.description || '',
        parentId: capability.parentId || '',
        criticality: String(capability.criticality || '3')
      });
      setSelectedAppIds(capability.applications?.map((a: any) => a.id) || []);
      setDynamicValues(safeJsonParse(capability.metadata));
      setReferences(parseReferences(capability.references));
      setHydrated(true);
    }
  }, [capability, isNew, hydrated]);

  const criticalityOptions = picklists?.find(p => p.name === 'criticality')?.options || [];

  // Inheritance: a capability with sub-capabilities takes max(children.criticality).
  // Mirrors the EditAppPage pattern. Recurses through grandchildren as a safety
  // net even though the server cascade keeps each level's stored value as the
  // max of its own children — handles in-flight client state too.
  const { inheritedValue, isFieldDisabled } = useMemo(() => {
    if (!allCapabilities || isNew || !id) return { inheritedValue: null, isFieldDisabled: false };
    const getRecursiveMaxCrit = (parentId: string): number => {
      const childIds = allCapabilities.filter(c => c.parentId === parentId).map(c => c.id);
      let max = 0;
      childIds.forEach(cid => {
        const cap = allCapabilities.find(c => c.id === cid);
        if (cap) {
          max = Math.max(max, Number(cap.criticality || 1));
          max = Math.max(max, getRecursiveMaxCrit(cid));
        }
      });
      return max;
    };
    const maxScore = getRecursiveMaxCrit(id);
    if (maxScore > 0) {
      return { inheritedValue: String(maxScore), isFieldDisabled: true };
    }
    return { inheritedValue: null, isFieldDisabled: false };
  }, [allCapabilities, id, isNew]);

  useEffect(() => {
    if (inheritedValue !== null) {
      setFormData(prev => ({ ...prev, criticality: inheritedValue }));
    }
  }, [inheritedValue]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isNew && (!id || id === 'undefined' || id === 'new')) {
      alert("Invalid ID. Cannot save changes.");
      return;
    }
    setLoading(true);

    const url = isNew ? '/api/capabilities' : `/api/capabilities/${id}`;
    const method = isNew ? 'POST' : 'PUT';

    try {
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...formData,
          parentId: formData.parentId === '' ? null : formData.parentId,
          metadata: JSON.stringify(dynamicValues),
          applicationIds: selectedAppIds,
          references: serializeReferences(references)
        }),
      });

      if (res.ok) {
        const saved = await res.json();
        const finalId = isNew ? saved.id : id;
        await Promise.all([
          queryClient.invalidateQueries({ queryKey: ['capability', finalId] }),
          queryClient.invalidateQueries({ queryKey: ['capabilities'] }),
          queryClient.invalidateQueries({ queryKey: ['applications'] }),
          queryClient.invalidateQueries({ queryKey: ['search'] }),
        ]);
        navigate(`/capabilities/${finalId}`);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!capability || isNew) return;
    if (!confirm(`Are you sure you want to delete "${capability.name}"? This will also delete all sub-capabilities.`)) return;
    
    setDeleting(true);
    try {
      const res = await fetch(`/api/capabilities/${id}`, { method: 'DELETE' });
      if (res.ok) {
        await Promise.all([
          queryClient.invalidateQueries({ queryKey: ['capabilities'] }),
          queryClient.invalidateQueries({ queryKey: ['applications'] }),
          queryClient.invalidateQueries({ queryKey: ['search'] }),
        ]);
        navigate('/capabilities');
      }
    } catch (err) { console.error(err); } finally { setDeleting(false); }
  };

  // Don't render the form until both the capability AND the lookup data are loaded,
  // AND formData has been hydrated from the DB. Otherwise dropdowns can mount with
  // default values that then get committed back, overwriting real DB values.
  if (!isNew && (isCapLoading || !capability)) return <div style={{ padding: '4rem', textAlign: 'center' }} className="loading-text">Retrieving capability...</div>;
  if (!picklists || !allCapabilities) return <div style={{ padding: '4rem', textAlign: 'center' }} className="loading-text">Loading configuration...</div>;
  if (!hydrated) return <div style={{ padding: '4rem', textAlign: 'center' }} className="loading-text">Retrieving capability...</div>;

  const filteredApps = (allApps || []).filter(app => 
    app.name.toLowerCase().includes(appSearch.toLowerCase()) || 
    selectedAppIds.includes(app.id)
  );

  const capMetaDefs = metaDefs?.filter(d => d.entityType === 'Capability') || [];
  const standardFieldNames = ['criticality'];
  const otherMetaDefs = capMetaDefs.filter(d => !standardFieldNames.includes(d.fieldName));

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: 'var(--background)' }}>
      {/* Navigation Header */}
      <div style={{ padding: '0.6rem 1.25rem', borderBottom: '1px solid var(--border)', background: 'var(--card)', display: 'flex', alignItems: 'center', gap: '0.75rem', flexShrink: 0 }}>
        <button onClick={() => navigate(-1)} style={{ background: 'none', border: 'none', padding: '0.35rem', cursor: 'pointer', display: 'flex', alignItems: 'center', color: 'var(--muted-foreground)', borderRadius: '6px' }} className="row-hover">
          <ChevronLeft size={18} />
        </button>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.8rem' }}>
          <span style={{ color: 'var(--muted-foreground)', cursor: 'pointer' }} onClick={() => navigate('/capabilities')}>Hierarchy</span>
          <span style={{ color: 'var(--border)', fontWeight: 300 }}>/</span>
          {!isNew && <span style={{ color: 'var(--muted-foreground)', cursor: 'pointer' }} onClick={() => navigate(`/capabilities/${id}`)}>{capability?.name}</span>}
          {!isNew && <span style={{ color: 'var(--border)', fontWeight: 300 }}>/</span>}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', color: 'var(--foreground)', fontWeight: 600 }}>
            <Edit2 size={12} style={{ opacity: 0.6 }} />
            <span>{isNew ? 'Define New Capability' : 'Edit Capability'}</span>
          </div>
        </div>
      </div>

      <div style={{ flex: 1, overflowY: 'auto' }}>
        <form onSubmit={handleSubmit} className="main-container" style={{ padding: '2rem 1.25rem 4rem 1.25rem', maxWidth: '1000px' }}>
          <div style={{ marginBottom: '2rem', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
                <span style={{ fontSize: '0.6rem', fontWeight: 900, textTransform: 'uppercase', padding: '0.15rem 0.5rem', borderRadius: '4px', background: '#7048e8', color: 'white', letterSpacing: '0.05em', display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                  <Boxes size={10} /> Capability
                </span>
              </div>
              <h1 style={{ fontSize: '1.75rem', fontWeight: 800, margin: 0, letterSpacing: '-0.02em' }}>{isNew ? 'New Capability' : capability?.name}</h1>
              <p style={{ color: 'var(--muted-foreground)', fontSize: '1rem', marginTop: '0.4rem' }}>{isNew ? 'Establish a new functional area.' : 'Refine functional scope and strategic importance.'}</p>
            </div>
            <div style={{ display: 'flex', gap: '0.75rem' }}>
              <button type="button" onClick={() => navigate(-1)} className="secondary" style={{ height: '2.4rem', padding: '0 1.25rem', fontSize: '0.85rem' }}>Discard</button>
              <button type="submit" className="primary" disabled={loading} style={{ height: '2.4rem', padding: '0 1.5rem', fontWeight: 800, fontSize: '0.85rem' }}>
                {loading ? 'Saving...' : (isNew ? 'Create Capability' : 'Save Changes')}
              </button>
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '2.5rem' }}>
            {/* FUNCTIONAL DEFINITION */}
            <section>
              <h3 style={{ fontSize: '0.75rem', fontWeight: 800, textTransform: 'uppercase', color: 'var(--muted-foreground)', marginBottom: '1.25rem', display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                <Info size={16} /> Functional Definition
              </h3>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem' }}>
                <div className="field" style={{ gridColumn: 'span 2' }}>
                  <label className="label">Capability Name</label>
                  <input required value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} style={{ padding: '0.75rem', fontSize: '1.1rem', fontWeight: 600, height: 'auto' }} placeholder="e.g. Talent Management" />
                </div>
                <div className="field" style={{ gridColumn: 'span 2' }}>
                  <label className="label">Purpose & Outcome</label>
                  <textarea rows={3} value={formData.description} onChange={e => setFormData({...formData, description: e.target.value})} style={{ padding: '0.75rem', lineHeight: 1.5 }} placeholder="Describe the business outcomes..." />
                </div>
                <div className="field" style={{ gridColumn: 'span 2' }}>
                  <label className="label">Parent Capability</label>
                  <ColoredSelect
                    value={formData.parentId || ''}
                    onChange={(val) => setFormData({ ...formData, parentId: val || null })}
                    options={[{ value: '', label: 'None (Root Level Capability)' }, ...((allCapabilities || []).filter((c: any) => c.id !== id).map((c: any) => ({ value: c.id, label: c.name })))]}
                    style={{ height: '2rem', fontSize: '0.85rem' }}
                  />
                </div>
              </div>
            </section>

            {/* STRATEGIC IMPORTANCE */}
            <section style={{ background: 'var(--card)', padding: '1.5rem', borderRadius: '16px', border: '1px solid var(--border)', opacity: isFieldDisabled ? 0.85 : 1 }}>
              <h3 style={{ fontSize: '0.75rem', fontWeight: 800, textTransform: 'uppercase', color: 'var(--muted-foreground)', marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                <Share2 size={16} /> Strategic Importance
              </h3>
              <div className="field">
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.75rem' }}>
                  <div style={{ display: 'flex', flexDirection: 'column' }}>
                    <label className="label" style={{ fontSize: '0.85rem', fontWeight: 700 }}>Business Criticality</label>
                    {isFieldDisabled
                      ? <span style={{ fontSize: '0.65rem', color: 'var(--brand-focus)', fontWeight: 800 }}>INHERITED FROM SUB-CAPABILITIES</span>
                      : <span style={{ fontSize: '0.65rem', color: 'var(--muted-foreground)', fontWeight: 600 }}>Direct Capability Attribute</span>
                    }
                  </div>
                  <div style={{ fontSize: '0.8rem', fontWeight: 800, display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                    {criticalityOptions.find((o:any) => o.value === formData.criticality)?.color && <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: criticalityOptions.find((o:any) => o.value === formData.criticality)?.color }} />}
                    {criticalityOptions.find((o:any) => o.value === formData.criticality)?.label || '1 - Low'}
                  </div>
                </div>
                <input
                  type="range"
                  min="1"
                  max="5"
                  step="1"
                  disabled={isFieldDisabled}
                  style={{ background: getScaleGradient('importance'), cursor: isFieldDisabled ? 'not-allowed' : 'pointer' }}
                  value={formData.criticality}
                  onChange={e => setFormData({...formData, criticality: e.target.value})}
                />
              </div>
            </section>

            {/* SUPPORTING APPLICATIONS */}
            <section>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
                <h3 style={{ fontSize: '0.75rem', fontWeight: 800, textTransform: 'uppercase', color: 'var(--muted-foreground)', display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                  <Database size={16} /> Supporting Applications
                </h3>
                <InlineFilter value={appSearch} onChange={setAppSearch} placeholder="Search applications..." width="250px" />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: '0.75rem', maxHeight: '350px', overflowY: 'auto', padding: '1rem', background: 'var(--card)', borderRadius: '16px', border: '1px solid var(--border)' }}>
                {filteredApps.map(app => (
                  <button key={app.id} type="button" onClick={() => setSelectedAppIds(prev => prev.includes(app.id) ? prev.filter(a => a !== app.id) : [...prev, app.id])} style={{ height: 'auto', padding: '0.75rem', justifyContent: 'flex-start', background: selectedAppIds.includes(app.id) ? 'var(--primary)' : 'var(--background)', color: selectedAppIds.includes(app.id) ? 'var(--primary-foreground)' : 'var(--foreground)', border: '1px solid var(--border)', textAlign: 'left', fontSize: '0.8rem' }}>
                    {selectedAppIds.includes(app.id) ? <CheckCircle2 size={14} style={{ marginRight: '0.4rem' }} /> : <Plus size={14} style={{ marginRight: '0.4rem', opacity: 0.3 }} />}
                    {app.name}
                  </button>
                ))}
              </div>
            </section>

            {/* CUSTOM META */}
            {otherMetaDefs.length > 0 && (
              <section>
                <h3 style={{ fontSize: '0.75rem', fontWeight: 800, textTransform: 'uppercase', color: 'var(--muted-foreground)', marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                  <Edit2 size={16} /> Extended Metadata
                </h3>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '1.5rem', background: 'var(--card)', padding: '1.5rem', borderRadius: '16px', border: '1px solid var(--border)' }}>
                  {otherMetaDefs.map(def => (
                    <div key={def.id} style={{ display: 'flex', flexDirection: def.fieldType === 'boolean' ? 'row' : 'column', alignItems: def.fieldType === 'boolean' ? 'center' : 'flex-start', gap: '0.6rem' }}>
                      {def.fieldType === 'range' ? (
                        <div style={{ display: 'flex', flexDirection: 'column', width: '100%' }}>
                          <label className="label" style={{ marginBottom: '0.75rem', fontSize: '0.75rem' }}>{def.label}</label>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                            <input type="range" min={def.min ?? 0} max={def.max ?? 100} style={{ background: getScaleGradient(def.scaleType) }} value={dynamicValues[def.fieldName] ?? def.min ?? 0} onChange={e => setDynamicValues({...dynamicValues, [def.fieldName]: Number(e.target.value)})} />
                            <span style={{ fontWeight: 800, fontSize: '0.8rem' }}>{dynamicValues[def.fieldName] ?? def.min ?? 0}</span>
                          </div>
                        </div>
                      ) : def.fieldType === 'boolean' ? (
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
                <button type="button" onClick={handleDelete} disabled={deleting} className="secondary" style={{ color: 'var(--destructive)', borderColor: 'var(--destructive)', height: '2.5rem', padding: '0 1.5rem', fontSize: '0.85rem' }}>
                  <Trash2 size={16} style={{ marginRight: '0.6rem' }} /> Delete this capability artifact
                </button>
              </section>
            )}
          </div>
        </form>
      </div>
    </div>
  );
};
