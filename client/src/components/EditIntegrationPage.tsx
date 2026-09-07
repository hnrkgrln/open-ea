import React, { useState, useEffect, useLayoutEffect } from 'react';
import { useNavigate, useParams, useLocation } from 'react-router-dom';
import { ChevronLeft, Info, Network, Trash2, Edit2, Activity } from 'lucide-react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { MultiSelect } from './FilterControls';
import { ColoredSelect } from './ColoredSelect';
import { ReferencesEditor, parseReferences, serializeReferences, type Reference } from './References';

export const EditIntegrationPage = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const queryClient = useQueryClient();
  const isNew = !id || id === 'new';

  const [loading, setLoading] = useState(false);
  const [hydrated, setHydrated] = useState(isNew);
  const [formData, setFormData] = useState({
    description: '',
    sourceAppId: '',
    targetAppId: '',
    infoObjectId: '' as string | null,
    pattern: 'REST API',
    frequency: 'Real-time',
    crud: [] as string[]
  });
  const [references, setReferences] = useState<Reference[]>([]);

  const { data: item, isLoading: isItemLoading } = useQuery({
    queryKey: ['integration', id],
    queryFn: () => fetch(`/api/integrations/${id}`).then(res => res.json()),
    enabled: !isNew && !!id && id !== 'undefined'
  });

  const { data: apps } = useQuery<any[]>({ queryKey: ['applications'], queryFn: () => fetch('/api/applications').then(res => res.json()) });
  const { data: infoObjects } = useQuery<any[]>({ queryKey: ['information-objects'], queryFn: () => fetch('/api/information-objects').then(res => res.json()) });
  const { data: picklists } = useQuery<any[]>({ queryKey: ['picklists'], queryFn: () => fetch('/api/picklists').then(res => res.json()) });

  const patternOptions = picklists?.find(p => p.name === 'integration_pattern')?.options || [];
  const freqOptions = picklists?.find(p => p.name === 'integration_frequency')?.options || [];
  let crudOptions = picklists?.find(p => p.name === 'integration_crud')?.options || [];
  
  if (crudOptions.length === 0) {
    crudOptions = [
      { value: 'CREATE', label: 'CREATE' },
      { value: 'READ', label: 'READ' },
      { value: 'UPDATE', label: 'UPDATE' },
      { value: 'DELETE', label: 'DELETE' },
    ];
  }

  // Handle pre-population for new integrations
  useEffect(() => {
    if (isNew) {
      const params = new URLSearchParams(location.search);
      const sourceAppId = params.get('sourceAppId');
      const targetAppId = params.get('targetAppId');
      if (sourceAppId || targetAppId) {
        setFormData(prev => ({
          ...prev,
          sourceAppId: sourceAppId || prev.sourceAppId,
          targetAppId: targetAppId || prev.targetAppId
        }));
      }
    }
  }, [isNew, location.search]);

  // Populate formData from the DB before the form mounts. We gate rendering on
  // `hydrated` below so Radix Select instances never see stale default values —
  // they mount once with the correct DB-backed value, avoiding the case where
  // a placeholder briefly registers and overwrites the real selection.
  useLayoutEffect(() => {
    if (item && !isNew && !hydrated) {
      setFormData({
        description: item.description || '',
        sourceAppId: item.sourceAppId || '',
        targetAppId: item.targetAppId || '',
        infoObjectId: item.infoObjectId || '',
        pattern: item.pattern || 'REST API',
        frequency: item.frequency || 'Real-time',
        crud: item.crud ? item.crud.split(',').filter(Boolean) : []
      });
      setReferences(parseReferences(item.references));
      setHydrated(true);
    }
  }, [item, isNew, hydrated]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isNew && (!id || id === 'undefined')) {
      alert("Invalid ID. Cannot save changes.");
      return;
    }
    if (formData.sourceAppId === formData.targetAppId) {
      alert("Source and Target applications cannot be the same.");
      return;
    }
    setLoading(true);
    try {
      const url = isNew ? '/api/integrations' : `/api/integrations/${id}`;
      const method = isNew ? 'POST' : 'PUT';
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          ...formData,
          infoObjectId: formData.infoObjectId === '' ? null : formData.infoObjectId,
          crud: formData.crud.join(','),
          references: serializeReferences(references)
        }),
      });

      if (res.ok) {
        const saved = await res.json();
        const finalId = isNew ? saved.id : id;
        await Promise.all([
          queryClient.invalidateQueries({ queryKey: ['integration', finalId] }),
          queryClient.invalidateQueries({ queryKey: ['integrations'] }),
          queryClient.invalidateQueries({ queryKey: ['applications'] }),
          queryClient.invalidateQueries({ queryKey: ['search'] }),
        ]);
        navigate(`/integrations/${finalId}`);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!item || isNew) return;
    if (!confirm(`Delete this integration flow?`)) return;
    try {
      const res = await fetch(`/api/integrations/${id}`, { method: 'DELETE' });
      if (res.ok) {
        await Promise.all([
          queryClient.invalidateQueries({ queryKey: ['integrations'] }),
          queryClient.invalidateQueries({ queryKey: ['applications'] }),
          queryClient.invalidateQueries({ queryKey: ['search'] }),
        ]);
        navigate('/integrations');
      }
    } catch (err) { console.error(err); }
  };

  // Don't render the form until both the integration AND the lookup data are loaded,
  // AND formData has been hydrated from the DB. Otherwise dropdowns can mount with
  // default values that then get committed back, overwriting real DB values.
  if (!isNew && (isItemLoading || !item)) return <div style={{ padding: '4rem', textAlign: 'center' }} className="loading-text">Loading flow...</div>;
  if (!picklists || !apps || !infoObjects) return <div style={{ padding: '4rem', textAlign: 'center' }} className="loading-text">Loading configuration...</div>;
  if (!hydrated) return <div style={{ padding: '4rem', textAlign: 'center' }} className="loading-text">Loading flow...</div>;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: 'var(--background)' }}>
      <div style={{ padding: '0.6rem 1.25rem', borderBottom: '1px solid var(--border)', background: 'var(--card)', display: 'flex', alignItems: 'center', gap: '0.75rem', flexShrink: 0 }}>
        <button onClick={() => navigate(-1)} style={{ background: 'none', border: 'none', padding: '0.35rem', cursor: 'pointer', display: 'flex', alignItems: 'center', color: 'var(--muted-foreground)', borderRadius: '6px' }} className="row-hover">
          <ChevronLeft size={18} />
        </button>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.8rem' }}>
          <span style={{ color: 'var(--muted-foreground)', cursor: 'pointer' }} onClick={() => navigate('/integrations')}>Integrations</span>
          <span style={{ color: 'var(--border)', fontWeight: 300 }}>/</span>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', color: 'var(--foreground)', fontWeight: 600 }}>
            <Edit2 size={12} style={{ opacity: 0.6 }} />
            <span>{isNew ? 'New Integration' : 'Edit Flow'}</span>
          </div>
        </div>
      </div>

      <div style={{ flex: 1, overflowY: 'auto' }}>
        <form onSubmit={handleSubmit} className="main-container" style={{ padding: '2rem 1.25rem 4rem 1.25rem', maxWidth: '800px' }}>
          <div style={{ marginBottom: '2rem', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
                <span style={{ fontSize: '0.6rem', fontWeight: 900, textTransform: 'uppercase', padding: '0.15rem 0.5rem', borderRadius: '4px', background: '#d6336c', color: 'white', letterSpacing: '0.05em', display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                  <Network size={10} /> Integration Flow
                </span>
              </div>
              <h1 style={{ fontSize: '1.75rem', fontWeight: 800, margin: 0, letterSpacing: '-0.02em' }}>{isNew ? 'New Data Flow' : 'Refine Integration'}</h1>
              <p style={{ color: 'var(--muted-foreground)', fontSize: '1rem', marginTop: '0.4rem' }}>Define how data moves between systems.</p>
            </div>
            <div style={{ display: 'flex', gap: '0.75rem' }}>
              <button type="button" onClick={() => navigate(-1)} className="secondary" style={{ height: '2.4rem', padding: '0 1.25rem', fontSize: '0.85rem' }}>Discard</button>
              <button type="submit" className="primary" disabled={loading} style={{ height: '2.4rem', padding: '0 1.5rem', fontWeight: 800, fontSize: '0.85rem' }}>
                {loading ? 'Saving...' : (isNew ? 'Establish Flow' : 'Save Changes')}
              </button>
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '2.5rem' }}>
            {/* SYSTEMS & PAYLOAD */}
            <section>
              <h3 style={{ fontSize: '0.75rem', fontWeight: 800, textTransform: 'uppercase', color: 'var(--muted-foreground)', marginBottom: '1.25rem', display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                <Info size={16} /> Source & Payload
              </h3>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem' }}>
                <div className="field" style={{ gridColumn: 'span 2' }}>
                  <label className="label">Description</label>
                  <textarea rows={2} value={formData.description} onChange={e => setFormData({ ...formData, description: e.target.value })} style={{ padding: '0.75rem' }} placeholder="Purpose of this data flow..." />
                </div>
                <div className="field">
                  <label className="label">Source Application</label>
                  <ColoredSelect
                    required
                    value={formData.sourceAppId}
                    onChange={(val) => setFormData({ ...formData, sourceAppId: val })}
                    options={[{ value: '', label: 'Select Source...' }, ...((Array.isArray(apps) ? apps : []).map((a: any) => ({ value: a.id, label: a.name })))]}
                    style={{ height: '2rem', fontSize: '0.85rem' }}
                  />
                </div>
                <div className="field">
                  <label className="label">Information Object Payload</label>
                  <ColoredSelect
                    required
                    value={formData.infoObjectId || ''}
                    onChange={(val) => setFormData({ ...formData, infoObjectId: val })}
                    options={[{ value: '', label: 'Select Payload...' }, ...((Array.isArray(infoObjects) ? infoObjects : []).map((io: any) => ({ value: io.id, label: io.name })))]}
                    style={{ height: '2rem', fontSize: '0.85rem' }}
                  />
                </div>
                <div className="field" style={{ gridColumn: 'span 2' }}>
                  <label className="label">Target Application</label>
                  <ColoredSelect
                    required
                    value={formData.targetAppId}
                    onChange={(val) => setFormData({ ...formData, targetAppId: val })}
                    options={[{ value: '', label: 'Select Target...' }, ...((Array.isArray(apps) ? apps : []).map((a: any) => ({ value: a.id, label: a.name })))]}
                    style={{ height: '2rem', fontSize: '0.85rem' }}
                  />
                </div>
              </div>
            </section>

            {/* TECHNICAL DETAILS */}
            <section style={{ background: 'var(--card)', padding: '1.5rem', borderRadius: '16px', border: '1px solid var(--border)' }}>
              <h3 style={{ fontSize: '0.75rem', fontWeight: 800, textTransform: 'uppercase', color: 'var(--muted-foreground)', marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                <Activity size={16} /> Delivery Context
              </h3>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem' }}>
                <div className="field">
                  <label className="label">Integration Pattern</label>
                  <ColoredSelect
                    value={formData.pattern}
                    onChange={(val) => setFormData({ ...formData, pattern: val })}
                    options={patternOptions}
                    style={{ height: '2rem', fontSize: '0.85rem' }}
                  />
                </div>
                <div className="field">
                  <label className="label">Frequency</label>
                  <ColoredSelect
                    value={formData.frequency}
                    onChange={(val) => setFormData({ ...formData, frequency: val })}
                    options={freqOptions}
                    style={{ height: '2rem', fontSize: '0.85rem' }}
                  />
                </div>
                <div className="field" style={{ gridColumn: 'span 2' }}>
                  <label className="label">CRUD Operations</label>
                  <MultiSelect
                    label="CRUD Operations"
                    options={crudOptions}
                    selectedValues={formData.crud}
                    onChange={(vals) => setFormData({...formData, crud: vals})}
                    placeholder="Select operations..."
                    style={{ height: '2rem', fontSize: '0.85rem' }}
                  />
                </div>
              </div>
            </section>

            <ReferencesEditor value={references} onChange={setReferences} />

            {!isNew && (
              <section style={{ borderTop: '1px solid var(--border)', paddingTop: '3rem', display: 'flex', justifyContent: 'center' }}>
                <button type="button" onClick={handleDelete} className="secondary" style={{ color: 'var(--destructive)', borderColor: 'var(--destructive)', height: '2.5rem', padding: '0 1.5rem', fontSize: '0.85rem' }}>
                  <Trash2 size={16} style={{ marginRight: '0.6rem' }} /> Decommission this flow
                </button>
              </section>
            )}
          </div>
        </form>
      </div>
    </div>
  );
};
