import React, { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { X, Edit2, CheckCircle2, Trash2, Search, Boxes, Info, Share2, Database, ChevronLeft, Plus } from 'lucide-react';
import { useQuery, useQueryClient } from '@tanstack/react-query';

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
  const isNew = !id || id === 'new' || id === 'undefined';

  const [loading, setLoading] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [appSearch, setAppSearch] = useState('');
  
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    parentId: '' as string | null,
    criticality: '3'
  });
  const [selectedAppIds, setSelectedAppIds] = useState<string[]>([]);
  const [dynamicValues, setDynamicValues] = useState<Record<string, any>>({});

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

  useEffect(() => {
    if (capability && !isNew) {
      setFormData({
        name: capability.name || '',
        description: capability.description || '',
        parentId: capability.parentId || '',
        criticality: capability.criticality || '3'
      });
      setSelectedAppIds(capability.applications?.map((a: any) => a.id) || []);
      setDynamicValues(safeJsonParse(capability.metadata));
    }
  }, [capability, isNew]);

  const criticalityOptions = picklists?.find(p => p.name === 'criticality')?.options || [];

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isNew && (!id || id === 'undefined')) {
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
          applicationIds: selectedAppIds
        }),
      });

      if (res.ok) {
        const saved = await res.json();
        const finalId = isNew ? saved.id : id;
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

  if (!isNew && isCapLoading) return <div style={{ padding: '4rem', textAlign: 'center' }} className="loading-text">Retrieving capability...</div>;

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
                  <select value={formData.parentId || ''} onChange={e => setFormData({...formData, parentId: e.target.value || null})} style={{ padding: '0.75rem' }}>
                    <option value="">None (Root Level Capability)</option>
                    {allCapabilities?.filter(c => c.id !== id).map((c: any) => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </div>
              </div>
            </section>

            {/* STRATEGIC IMPORTANCE */}
            <section style={{ background: 'var(--card)', padding: '2.5rem', borderRadius: '24px', border: '1px solid var(--border)' }}>
              <h3 style={{ fontSize: '0.875rem', fontWeight: 800, textTransform: 'uppercase', color: 'var(--muted-foreground)', marginBottom: '2rem', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                <Share2 size={18} /> Strategic Importance
              </h3>
              <div className="field">
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '1rem' }}>
                  <label className="label" style={{ fontSize: '1.125rem', fontWeight: 700 }}>Business Criticality</label>
                  <div style={{ fontSize: '1rem', fontWeight: 800, color: criticalityOptions.find((o:any) => o.value === formData.criticality)?.color }}>
                    {criticalityOptions.find((o:any) => o.value === formData.criticality)?.label}
                  </div>
                </div>
                <input type="range" min="1" max="5" step="1" style={{ background: getScaleGradient('importance') }} value={formData.criticality} onChange={e => setFormData({...formData, criticality: e.target.value})} />
              </div>
            </section>

            {/* SUPPORTING APPLICATIONS */}
            <section>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
                <h3 style={{ fontSize: '0.875rem', fontWeight: 800, textTransform: 'uppercase', color: 'var(--muted-foreground)', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                  <Database size={18} /> Supporting Applications
                </h3>
                <div style={{ position: 'relative', width: '300px' }}>
                  <Search size={16} style={{ position: 'absolute', left: '0.75rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--muted-foreground)' }} />
                  <input placeholder="Search applications..." value={appSearch} onChange={e => setAppSearch(e.target.value)} style={{ paddingLeft: '2.5rem', height: '2.5rem' }} />
                </div>
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
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2rem', background: 'var(--card)', padding: '2.5rem', borderRadius: '24px', border: '1px solid var(--border)' }}>
                  {otherMetaDefs.map(def => (
                    <div key={def.id} className="field">
                      <label className="label">{def.label}</label>
                      {def.fieldType === 'range' ? (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                          <input type="range" min={def.min ?? 0} max={def.max ?? 100} style={{ background: getScaleGradient(def.scaleType) }} value={dynamicValues[def.fieldName] ?? def.min ?? 0} onChange={e => setDynamicValues({...dynamicValues, [def.fieldName]: Number(e.target.value)})} />
                          <span style={{ fontWeight: 800 }}>{dynamicValues[def.fieldName] ?? def.min ?? 0}</span>
                        </div>
                      ) : (
                        <input value={dynamicValues[def.fieldName] || ''} onChange={e => setDynamicValues({...dynamicValues, [def.fieldName]: e.target.value})} />
                      )}
                    </div>
                  ))}
                </div>
              </section>
            )}

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
