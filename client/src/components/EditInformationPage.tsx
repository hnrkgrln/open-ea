import React, { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ChevronLeft, Info, Share2, Trash2, Edit2, ShieldCheck, Database, Plus } from 'lucide-react';
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
    case 'pii': return 'linear-gradient(to right, #ced4da, #fab005, #e67700, #c92a2a)';
    case 'low-high': return 'linear-gradient(to right, #e7f5ff, #1864ab)';
    case 'importance': return 'linear-gradient(to right, #dee2e6, #7048e8)';
    default: return 'linear-gradient(to right, var(--accent), var(--primary))';
  }
};

export const EditInformationPage = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const isNew = !id || id === 'new' || id === 'undefined';

  const [loading, setLoading] = useState(false);
  const [initialized, setInitialized] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    aliases: '',
    description: '',
    confidentiality: '1',
    integrity: '1',
    availability: '1',
    piiCategory: '1',
    type: 'Master Data',
    businessOwnerId: '' as string | null,
    appOwnerId: '' as string | null
  });
  const [dynamicValues, setDynamicValues] = useState<Record<string, any>>({});

  const { data: item, isLoading: isItemLoading } = useQuery({
    queryKey: ['information-object', id],
    queryFn: () => fetch(`/api/information-objects/${id}`).then(res => res.json()),
    enabled: !isNew && !!id && id !== 'undefined'
  });

  const { data: organizations } = useQuery<any[]>({ queryKey: ['organizations'], queryFn: () => fetch('/api/organizations').then(res => res.json()) });
  const { data: apps } = useQuery<any[]>({ queryKey: ['applications'], queryFn: () => fetch('/api/applications').then(res => res.json()) });
  const { data: picklists } = useQuery<any[]>({ queryKey: ['picklists'], queryFn: () => fetch('/api/picklists').then(res => res.json()) });
  const { data: metaDefs } = useQuery<any[]>({ queryKey: ['metadata-definitions'], queryFn: () => fetch('/api/metadata-definitions').then(res => res.json()) });

  const ciaOptions = picklists?.find(p => p.name === 'cia_scale')?.options || [];
  const piiOptions = picklists?.find(p => p.name === 'pii_category')?.options || [];
  const typeOptions = picklists?.find(p => p.name === 'information_type')?.options || [];

  useEffect(() => {
    if (item && !isNew && !initialized) {
      setFormData({
        name: item.name || '',
        aliases: item.aliases || '',
        description: item.description || '',
        confidentiality: String(item.confidentiality || '1'),
        integrity: String(item.integrity || '1'),
        availability: String(item.availability || '1'),
        piiCategory: String(item.piiCategory || '1'),
        type: item.type || 'Master Data',
        businessOwnerId: item.businessOwnerId || '',
        appOwnerId: item.appOwnerId || ''
      });
      setDynamicValues(safeJsonParse(item.metadata));
      setInitialized(true);
    }
  }, [item, isNew, initialized]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isNew && (!id || id === 'undefined')) {
      alert("Invalid ID. Cannot save changes.");
      return;
    }
    setLoading(true);
    const payload = { 
      ...formData, 
      metadata: JSON.stringify(dynamicValues),
      businessOwnerId: formData.businessOwnerId === '' ? null : formData.businessOwnerId,
      appOwnerId: formData.appOwnerId === '' ? null : formData.appOwnerId
    };
    try {
      const url = isNew ? '/api/information-objects' : `/api/information-objects/${id}`;
      const method = isNew ? 'POST' : 'PUT';
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (res.ok) {
        const saved = await res.json();
        const finalId = isNew ? saved.id : id;
        queryClient.invalidateQueries({ queryKey: ['information-object', finalId] });
        queryClient.invalidateQueries({ queryKey: ['information-objects'] });
        navigate(`/information/${finalId}`);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!item || isNew) return;
    if (!confirm(`Delete "${item.name}"?`)) return;
    try {
      const res = await fetch(`/api/information-objects/${id}`, { method: 'DELETE' });
      if (res.ok) {
        queryClient.invalidateQueries({ queryKey: ['information-objects'] });
        navigate('/information');
      }
    } catch (err) { console.error(err); }
  };

  if (!isNew && isItemLoading) return <div style={{ padding: '4rem', textAlign: 'center' }} className="loading-text">Loading artifact...</div>;

  const infoMetaDefs = metaDefs?.filter(d => d.entityType === 'InformationObject') || [];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: 'var(--background)' }}>
      <div style={{ padding: '0.75rem 2rem', borderBottom: '1px solid var(--border)', background: 'var(--card)', display: 'flex', alignItems: 'center', gap: '1rem', flexShrink: 0 }}>
        <button onClick={() => navigate(-1)} style={{ background: 'none', border: 'none', padding: '0.5rem', cursor: 'pointer', display: 'flex', alignItems: 'center', color: 'var(--muted-foreground)', borderRadius: '6px' }} className="row-hover">
          <ChevronLeft size={20} />
        </button>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.875rem' }}>
          <span style={{ color: 'var(--muted-foreground)', cursor: 'pointer' }} onClick={() => navigate('/information')}>Information Model</span>
          <span style={{ color: 'var(--border)', fontWeight: 300 }}>/</span>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--foreground)', fontWeight: 600 }}>
            <Edit2 size={14} style={{ opacity: 0.6 }} />
            <span>{isNew ? 'New Data Concept' : 'Edit Definition'}</span>
          </div>
        </div>
      </div>

      <div style={{ flex: 1, overflowY: 'auto' }}>
        <form onSubmit={handleSubmit} className="main-container" style={{ padding: '3rem 2rem 6rem 2rem', maxWidth: '800px' }}>
          <div style={{ marginBottom: '3rem', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.75rem' }}>
                <span style={{ fontSize: '0.65rem', fontWeight: 900, textTransform: 'uppercase', padding: '0.2rem 0.6rem', borderRadius: '4px', background: '#e67700', color: 'white', letterSpacing: '0.05em', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                  <Share2 size={12} /> Information Object
                </span>
              </div>
              <h1 style={{ fontSize: '2.5rem', fontWeight: 800, margin: 0, letterSpacing: '-0.03em' }}>{isNew ? 'New Data Concept' : item?.name}</h1>
              <p style={{ color: 'var(--muted-foreground)', fontSize: '1.125rem', marginTop: '0.5rem' }}>Define governed business data and its CIA profile.</p>
            </div>
            <div style={{ display: 'flex', gap: '1rem' }}>
              <button type="button" onClick={() => navigate(-1)} className="secondary" style={{ height: '3rem', padding: '0 1.5rem' }}>Discard</button>
              <button type="submit" className="primary" disabled={loading} style={{ height: '3rem', padding: '0 2rem', fontWeight: 800 }}>
                {loading ? 'Saving...' : (isNew ? 'Create Concept' : 'Save Changes')}
              </button>
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '4rem' }}>
            {/* DEFINITION */}
            <section>
              <h3 style={{ fontSize: '0.875rem', fontWeight: 800, textTransform: 'uppercase', color: 'var(--muted-foreground)', marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                <Info size={18} /> Functional Definition
              </h3>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '2rem' }}>
                <div className="field">
                  <label className="label">Governed Name</label>
                  <input required value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} style={{ padding: '1rem', fontSize: '1.25rem', fontWeight: 600 }} placeholder="e.g. Employee Record" />
                </div>
                <div className="field">
                  <label className="label">Aliases (Comma separated)</label>
                  <input value={formData.aliases} onChange={e => setFormData({...formData, aliases: e.target.value})} style={{ padding: '0.75rem' }} placeholder="e.g. Staff Data, Worker Profile" />
                </div>
                <div className="field">
                  <label className="label">Business Definition</label>
                  <textarea rows={4} value={formData.description} onChange={e => setFormData({...formData, description: e.target.value})} style={{ padding: '1rem' }} placeholder="Clear definition of what this concept represents..." />
                </div>
                <div className="field">
                  <label className="label">Information Type</label>
                  <select value={formData.type} onChange={e => setFormData({...formData, type: e.target.value})} style={{ padding: '0.75rem' }}>
                    {typeOptions.map((o: any) => <option key={o.id} value={o.value}>{o.label}</option>)}
                  </select>
                </div>
              </div>
            </section>

            {/* CIA TRIAD & PII */}
            <section style={{ background: 'var(--card)', padding: '2.5rem', borderRadius: '24px', border: '1px solid var(--border)' }}>
              <h3 style={{ fontSize: '0.875rem', fontWeight: 800, textTransform: 'uppercase', color: 'var(--muted-foreground)', marginBottom: '2rem', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                <ShieldCheck size={18} /> CIA Model & Compliance
              </h3>
              
              <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
                {[
                  { label: 'Confidentiality', key: 'confidentiality' },
                  { label: 'Integrity', key: 'integrity' },
                  { label: 'Availability', key: 'availability' }
                ].map(cia => {
                   const currentVal = (formData as any)[cia.key];
                   const opt = ciaOptions.find((o:any) => o.value === String(currentVal));
                   const maxVal = ciaOptions.length > 0 ? Math.max(...ciaOptions.map((o: any) => Number(o.value) || 0)) : 1;
                   
                   return (
                    <div key={cia.key} className="field">
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '1rem' }}>
                        <label className="label" style={{ fontSize: '1rem', fontWeight: 700 }}>{cia.label}</label>
                        <div style={{ fontSize: '0.875rem', fontWeight: 800, color: opt?.color }}>
                            {opt?.label || `${currentVal} - Not Set`}
                        </div>
                        </div>
                        <input type="range" min="1" max={maxVal} step="1" style={{ background: getScaleGradient('good-bad') }} value={currentVal} onChange={e => setFormData({...formData, [cia.key]: e.target.value})} />
                    </div>
                   );
                })}

                <div className="field" style={{ marginTop: '1rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '1rem' }}>
                    <label className="label" style={{ fontSize: '1rem', fontWeight: 700 }}>PII Category</label>
                    <div style={{ fontSize: '0.875rem', fontWeight: 800, color: piiOptions.find((o:any) => o.value === String(formData.piiCategory))?.color }}>
                      {piiOptions.find((o:any) => o.value === String(formData.piiCategory))?.label || `${formData.piiCategory} - Not Set`}
                    </div>
                  </div>
                  <input 
                    type="range" 
                    min="1" 
                    max={piiOptions.length > 0 ? Math.max(...piiOptions.map((o: any) => Number(o.value) || 0)) : 1} 
                    step="1" 
                    style={{ background: getScaleGradient('pii') }} 
                    value={formData.piiCategory} 
                    onChange={e => setFormData({...formData, piiCategory: e.target.value})} 
                  />
                </div>
              </div>
            </section>

            {/* ACCOUNTABILITY */}
            <section>
              <h3 style={{ fontSize: '0.875rem', fontWeight: 800, textTransform: 'uppercase', color: 'var(--muted-foreground)', marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                <Share2 size={18} /> Accountability
              </h3>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2rem' }}>
                <div className="field">
                  <label className="label">Business Owner (Organization/Role)</label>
                  <select value={formData.businessOwnerId || ''} onChange={e => setFormData({...formData, businessOwnerId: e.target.value || null})} style={{ padding: '0.75rem' }}>
                    <option value="">Select Owner...</option>
                    {Array.isArray(organizations) && organizations.map((o: any) => <option key={o.id} value={o.id}>{o.name}</option>)}
                  </select>
                </div>
                <div className="field">
                  <label className="label">Source of Truth (Primary Application)</label>
                  <select value={formData.appOwnerId || ''} onChange={e => setFormData({...formData, appOwnerId: e.target.value || null})} style={{ padding: '0.75rem' }}>
                    <option value="">Select System...</option>
                    {Array.isArray(apps) && apps.map((a: any) => <option key={a.id} value={a.id}>{a.name}</option>)}
                  </select>
                </div>
              </div>
            </section>

            {/* CUSTOM META */}
            {infoMetaDefs.length > 0 && (
              <section>
                <h3 style={{ fontSize: '0.875rem', fontWeight: 800, textTransform: 'uppercase', color: 'var(--muted-foreground)', marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                  <Edit2 size={18} /> Extended Metadata
                </h3>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2rem', background: 'var(--card)', padding: '2.5rem', borderRadius: '24px', border: '1px solid var(--border)' }}>
                  {infoMetaDefs.map(def => (
                    <div key={def.id} className="field">
                      <label className="label">{def.label}</label>
                      {def.fieldType === 'range' ? (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                          <input type="range" min={def.min ?? 0} max={def.max ?? 100} style={{ background: getScaleGradient(def.scaleType || 'neutral') }} value={dynamicValues[def.fieldName] ?? def.min ?? 0} onChange={e => setDynamicValues({...dynamicValues, [def.fieldName]: Number(e.target.value)})} />
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
                <button type="button" onClick={handleDelete} className="secondary" style={{ color: 'var(--destructive)', borderColor: 'var(--destructive)', height: '3.5rem', padding: '0 2rem' }}>
                  <Trash2 size={20} style={{ marginRight: '0.75rem' }} /> Delete this artifact
                </button>
              </section>
            )}
          </div>
        </form>
      </div>
    </div>
  );
};
