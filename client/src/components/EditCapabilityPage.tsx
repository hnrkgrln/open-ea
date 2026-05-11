import React, { useState, useEffect, useLayoutEffect, useMemo } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { X, Edit2, CheckCircle2, Trash2, Search, Boxes, Info, Share2, Database, ChevronLeft, Plus } from 'lucide-react';
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
        queryClient.invalidateQueries({ queryKey: ['capability', finalId] });
        queryClient.invalidateQueries({ queryKey: ['capabilities'] });
        queryClient.invalidateQueries({ queryKey: ['applications'] }); // Re-fetch apps as they might have new capability links
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
        queryClient.invalidateQueries({ queryKey: ['capabilities'] });
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
      <div style={{ padding: '0.75rem 2rem', borderBottom: '1px solid var(--border)', background: 'var(--card)', display: 'flex', alignItems: 'center', gap: '1rem', flexShrink: 0 }}>
        <button onClick={() => navigate(-1)} style={{ background: 'none', border: 'none', padding: '0.5rem', cursor: 'pointer', display: 'flex', alignItems: 'center', color: 'var(--muted-foreground)', borderRadius: '6px' }} className="row-hover">
          <ChevronLeft size={20} />
        </button>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.875rem' }}>
          <span style={{ color: 'var(--muted-foreground)', cursor: 'pointer' }} onClick={() => navigate('/capabilities')}>Hierarchy</span>
          <span style={{ color: 'var(--border)', fontWeight: 300 }}>/</span>
          {!isNew && <span style={{ color: 'var(--muted-foreground)', cursor: 'pointer' }} onClick={() => navigate(`/capabilities/${id}`)}>{capability?.name}</span>}
          {!isNew && <span style={{ color: 'var(--border)', fontWeight: 300 }}>/</span>}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--foreground)', fontWeight: 600 }}>
            <Edit2 size={14} style={{ opacity: 0.6 }} />
            <span>{isNew ? 'Define New Capability' : 'Edit Capability'}</span>
          </div>
        </div>
      </div>

      <div style={{ flex: 1, overflowY: 'auto' }}>
        <form onSubmit={handleSubmit} className="main-container" style={{ padding: '3rem 2rem 6rem 2rem', maxWidth: '1000px' }}>
          <div style={{ marginBottom: '3rem', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.75rem' }}>
                <span style={{ fontSize: '0.65rem', fontWeight: 900, textTransform: 'uppercase', padding: '0.2rem 0.6rem', borderRadius: '4px', background: '#7048e8', color: 'white', letterSpacing: '0.05em', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                  <Boxes size={12} /> Capability
                </span>
              </div>
              <h1 style={{ fontSize: '2.5rem', fontWeight: 800, margin: 0, letterSpacing: '-0.03em' }}>{isNew ? 'New Capability' : capability?.name}</h1>
              <p style={{ color: 'var(--muted-foreground)', fontSize: '1.125rem', marginTop: '0.5rem' }}>{isNew ? 'Establish a new functional area in your enterprise hierarchy.' : 'Refine functional scope and strategic importance.'}</p>
            </div>
            <div style={{ display: 'flex', gap: '1rem' }}>
              <button type="button" onClick={() => navigate(-1)} className="secondary" style={{ height: '3rem', padding: '0 1.5rem' }}>Discard Changes</button>
              <button type="submit" className="primary" disabled={loading} style={{ height: '3rem', padding: '0 2rem', fontWeight: 800 }}>
                {loading ? 'Saving...' : (isNew ? 'Create Capability' : 'Save Changes')}
              </button>
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '4rem' }}>
            {/* FUNCTIONAL DEFINITION */}
            <section>
              <h3 style={{ fontSize: '0.875rem', fontWeight: 800, textTransform: 'uppercase', color: 'var(--muted-foreground)', marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                <Info size={18} /> Functional Definition
              </h3>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2rem' }}>
                <div className="field" style={{ gridColumn: 'span 2' }}>
                  <label className="label">Capability Name</label>
                  <input required value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} style={{ padding: '1rem', fontSize: '1.25rem', fontWeight: 600 }} placeholder="e.g. Talent Management" />
                </div>
                <div className="field" style={{ gridColumn: 'span 2' }}>
                  <label className="label">Purpose & Outcome</label>
                  <textarea rows={4} value={formData.description} onChange={e => setFormData({...formData, description: e.target.value})} style={{ padding: '1rem', lineHeight: 1.6 }} placeholder="Describe the business outcomes this function delivers..." />
                </div>
                <div className="field" style={{ gridColumn: 'span 2' }}>
                  <label className="label">Parent Capability (Hierarchy Position)</label>
                  <ColoredSelect
                    value={formData.parentId || ''}
                    onChange={(val) => setFormData({ ...formData, parentId: val || null })}
                    options={[{ value: '', label: 'None (Root Level Capability)' }, ...((allCapabilities || []).filter((c: any) => c.id !== id).map((c: any) => ({ value: c.id, label: c.name })))]}
                  />
                </div>
              </div>
            </section>

            {/* STRATEGIC IMPORTANCE */}
            <section style={{ background: 'var(--card)', padding: '2.5rem', borderRadius: '24px', border: '1px solid var(--border)', opacity: isFieldDisabled ? 0.85 : 1 }}>
              <h3 style={{ fontSize: '0.875rem', fontWeight: 800, textTransform: 'uppercase', color: 'var(--muted-foreground)', marginBottom: '2rem', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                <Share2 size={18} /> Strategic Importance
              </h3>
              <div className="field">
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '1rem' }}>
                  <div style={{ display: 'flex', flexDirection: 'column' }}>
                    <label className="label" style={{ fontSize: '1.125rem', fontWeight: 700 }}>Business Criticality</label>
                    {isFieldDisabled
                      ? <span style={{ fontSize: '0.7rem', color: 'var(--brand-focus)', fontWeight: 800 }}>INHERITED FROM SUB-CAPABILITIES</span>
                      : <span style={{ fontSize: '0.7rem', color: 'var(--muted-foreground)', fontWeight: 600 }}>Direct Capability Attribute</span>
                    }
                  </div>
                  <div style={{ fontSize: '1rem', fontWeight: 800, display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
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
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
                <h3 style={{ fontSize: '0.875rem', fontWeight: 800, textTransform: 'uppercase', color: 'var(--muted-foreground)', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                  <Database size={18} /> Supporting Applications
                </h3>
                <InlineFilter value={appSearch} onChange={setAppSearch} placeholder="Search applications..." width="300px" size="md" />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: '1rem', maxHeight: '400px', overflowY: 'auto', padding: '1.5rem', background: 'var(--card)', borderRadius: '24px', border: '1px solid var(--border)' }}>
                {filteredApps.map(app => (
                  <button key={app.id} type="button" onClick={() => setSelectedAppIds(prev => prev.includes(app.id) ? prev.filter(a => a !== app.id) : [...prev, app.id])} style={{ height: 'auto', padding: '1rem', justifyContent: 'flex-start', background: selectedAppIds.includes(app.id) ? 'var(--primary)' : 'var(--background)', color: selectedAppIds.includes(app.id) ? 'var(--primary-foreground)' : 'var(--foreground)', border: '1px solid var(--border)', textAlign: 'left' }}>
                    {selectedAppIds.includes(app.id) ? <CheckCircle2 size={16} style={{ marginRight: '0.5rem' }} /> : <Plus size={16} style={{ marginRight: '0.5rem', opacity: 0.3 }} />}
                    {app.name}
                  </button>
                ))}
              </div>
            </section>

            {/* CUSTOM META */}
            {otherMetaDefs.length > 0 && (
              <section>
                <h3 style={{ fontSize: '0.875rem', fontWeight: 800, textTransform: 'uppercase', color: 'var(--muted-foreground)', marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                  <Edit2 size={18} /> Extended Metadata
                </h3>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '2rem', background: 'var(--card)', padding: '2rem', borderRadius: '24px', border: '1px solid var(--border)' }}>
                  {otherMetaDefs.map(def => (
                    <div key={def.id} style={{ display: 'flex', flexDirection: def.fieldType === 'boolean' ? 'row' : 'column', alignItems: def.fieldType === 'boolean' ? 'center' : 'flex-start', gap: '0.75rem' }}>
                      {def.fieldType === 'range' ? (
                        <div style={{ display: 'flex', flexDirection: 'column', width: '100%' }}>
                          <label className="label" style={{ marginBottom: '1rem' }}>{def.label}</label>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                            <input type="range" min={def.min ?? 0} max={def.max ?? 100} style={{ background: getScaleGradient(def.scaleType) }} value={dynamicValues[def.fieldName] ?? def.min ?? 0} onChange={e => setDynamicValues({...dynamicValues, [def.fieldName]: Number(e.target.value)})} />
                            <span style={{ fontWeight: 800 }}>{dynamicValues[def.fieldName] ?? def.min ?? 0}</span>
                          </div>
                        </div>
                      ) : def.fieldType === 'boolean' ? (
                        <>
                          <CustomCheckbox 
                            checked={!!dynamicValues[def.fieldName]} 
                            onChange={checked => setDynamicValues({...dynamicValues, [def.fieldName]: checked})} 
                          />
                          <label className="label" style={{ margin: 0, cursor: 'pointer' }}>{def.label}</label>
                        </>
                      ) : (
                        <>
                          <label className="label" style={{ marginBottom: '0.2rem' }}>{def.label}</label>
                          {def.fieldType === 'textarea' ? (
                            <textarea value={dynamicValues[def.fieldName] || ''} onChange={e => setDynamicValues({...dynamicValues, [def.fieldName]: e.target.value})} rows={3} style={{ marginTop: 0 }} />
                          ) : (
                            <input type={def.fieldType === 'date' ? 'date' : 'text'} value={dynamicValues[def.fieldName] || ''} onChange={e => setDynamicValues({...dynamicValues, [def.fieldName]: e.target.value})} style={{ marginTop: 0 }} />
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
              <section style={{ borderTop: '1px solid var(--border)', paddingTop: '4rem', display: 'flex', justifyContent: 'center' }}>
                <button type="button" onClick={handleDelete} disabled={deleting} className="secondary" style={{ color: 'var(--destructive)', borderColor: 'var(--destructive)', height: '3.5rem', padding: '0 2rem' }}>
                  <Trash2 size={20} style={{ marginRight: '0.75rem' }} /> Delete this capability artifact
                </button>
              </section>
            )}
          </div>
        </form>
      </div>
    </div>
  );
};
