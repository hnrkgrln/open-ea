import React, { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ChevronLeft, Info, Network, Trash2, Edit2, Database, Share2, Activity } from 'lucide-react';
import { useQuery, useQueryClient } from '@tanstack/react-query';

export const EditIntegrationPage = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const isNew = id === 'new';

  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    sourceAppId: '',
    targetAppId: '',
    infoObjectId: '' as string | null,
    status: 'Active',
    pattern: 'REST API',
    frequency: 'Real-time',
    crud: 'Read'
  });

  const { data: item, isLoading: isItemLoading } = useQuery({
    queryKey: ['integration', id],
    queryFn: () => fetch(`/api/integrations/${id}`).then(res => res.json()),
    enabled: !isNew && !!id && id !== 'undefined'
  });

  const { data: apps } = useQuery<any[]>({ queryKey: ['applications'], queryFn: () => fetch('/api/applications').then(res => res.json()) });
  const { data: infoObjects } = useQuery<any[]>({ queryKey: ['information-objects'], queryFn: () => fetch('/api/information-objects').then(res => res.json()) });
  const { data: picklists } = useQuery<any[]>({ queryKey: ['picklists'], queryFn: () => fetch('/api/picklists').then(res => res.json()) });

  const statusOptions = picklists?.find(p => p.name === 'integration_status')?.options || [];
  const patternOptions = picklists?.find(p => p.name === 'integration_pattern')?.options || [];
  const freqOptions = picklists?.find(p => p.name === 'integration_frequency')?.options || [];
  const crudOptions = picklists?.find(p => p.name === 'integration_crud')?.options || [];

  useEffect(() => {
    if (item && !isNew) {
      setFormData({
        sourceAppId: item.sourceAppId || '',
        targetAppId: item.targetAppId || '',
        infoObjectId: item.infoObjectId || '',
        status: item.status || 'Active',
        pattern: item.pattern || 'REST API',
        frequency: item.frequency || 'Real-time',
        crud: item.crud || 'Read'
      });
    }
  }, [item, isNew]);

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
          infoObjectId: formData.infoObjectId === '' ? null : formData.infoObjectId 
        }),
      });

      if (res.ok) {
        const saved = await res.json();
        queryClient.invalidateQueries({ queryKey: ['integrations'] });
        navigate(`/integrations/${isNew ? saved.id : id}`);
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
        queryClient.invalidateQueries({ queryKey: ['integrations'] });
        navigate('/integrations');
      }
    } catch (err) { console.error(err); }
  };

  if (!isNew && isItemLoading) return <div style={{ padding: '4rem', textAlign: 'center' }} className="loading-text">Loading flow...</div>;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: 'var(--background)' }}>
      <div style={{ padding: '0.75rem 2rem', borderBottom: '1px solid var(--border)', background: 'var(--card)', display: 'flex', alignItems: 'center', gap: '1rem', flexShrink: 0 }}>
        <button onClick={() => navigate(-1)} style={{ background: 'none', border: 'none', padding: '0.5rem', cursor: 'pointer', display: 'flex', alignItems: 'center', color: 'var(--muted-foreground)', borderRadius: '6px' }} className="row-hover">
          <ChevronLeft size={20} />
        </button>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.875rem' }}>
          <span style={{ color: 'var(--muted-foreground)', cursor: 'pointer' }} onClick={() => navigate('/integrations')}>Integrations</span>
          <span style={{ color: 'var(--border)', fontWeight: 300 }}>/</span>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--foreground)', fontWeight: 600 }}>
            <Edit2 size={14} style={{ opacity: 0.6 }} />
            <span>{isNew ? 'New Integration' : 'Edit Flow'}</span>
          </div>
        </div>
      </div>

      <div style={{ flex: 1, overflowY: 'auto' }}>
        <form onSubmit={handleSubmit} className="main-container" style={{ padding: '3rem 2rem 6rem 2rem', maxWidth: '800px' }}>
          <div style={{ marginBottom: '3rem', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
            <div>
              <h1 style={{ fontSize: '2.5rem', fontWeight: 800, margin: 0, letterSpacing: '-0.03em' }}>{isNew ? 'New Data Flow' : 'Refine Integration'}</h1>
              <p style={{ color: 'var(--muted-foreground)', fontSize: '1.125rem', marginTop: '0.5rem' }}>Define how data moves between systems.</p>
            </div>
            <div style={{ display: 'flex', gap: '1rem' }}>
              <button type="button" onClick={() => navigate(-1)} className="secondary" style={{ height: '3rem', padding: '0 1.5rem' }}>Discard</button>
              <button type="submit" className="primary" disabled={loading} style={{ height: '3rem', padding: '0 2rem', fontWeight: 800 }}>
                {loading ? 'Saving...' : (isNew ? 'Establish Flow' : 'Save Changes')}
              </button>
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '3rem' }}>
            {/* SYSTEMS & PAYLOAD */}
            <section>
              <h3 style={{ fontSize: '0.875rem', fontWeight: 800, textTransform: 'uppercase', color: 'var(--muted-foreground)', marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                <Info size={18} /> Source & Payload
              </h3>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2rem' }}>
                <div className="field">
                  <label className="label">Source Application</label>
                  <select required value={formData.sourceAppId} onChange={e => setFormData({...formData, sourceAppId: e.target.value})} style={{ padding: '0.75rem' }}>
                    <option value="">Select Source...</option>
                    {Array.isArray(apps) && apps.map((a: any) => <option key={a.id} value={a.id}>{a.name}</option>)}
                  </select>
                </div>
                <div className="field">
                  <label className="label">Information Object Payload</label>
                  <select required value={formData.infoObjectId || ''} onChange={e => setFormData({...formData, infoObjectId: e.target.value})} style={{ padding: '0.75rem' }}>
                    <option value="">Select Payload...</option>
                    {Array.isArray(infoObjects) && infoObjects.map((io: any) => <option key={io.id} value={io.id}>{io.name}</option>)}
                  </select>
                </div>
                <div className="field" style={{ gridColumn: 'span 2' }}>
                  <label className="label">Target Application</label>
                  <select required value={formData.targetAppId} onChange={e => setFormData({...formData, targetAppId: e.target.value})} style={{ padding: '0.75rem' }}>
                    <option value="">Select Target...</option>
                    {Array.isArray(apps) && apps.map((a: any) => <option key={a.id} value={a.id}>{a.name}</option>)}
                  </select>
                </div>
              </div>
            </section>

            {/* TECHNICAL DETAILS */}
            <section style={{ background: 'var(--card)', padding: '2.5rem', borderRadius: '24px', border: '1px solid var(--border)' }}>
              <h3 style={{ fontSize: '0.875rem', fontWeight: 800, textTransform: 'uppercase', color: 'var(--muted-foreground)', marginBottom: '2rem', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                <Activity size={18} /> Delivery Context
              </h3>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2rem' }}>
                <div className="field">
                  <label className="label">Integration Pattern</label>
                  <select value={formData.pattern} onChange={e => setFormData({...formData, pattern: e.target.value})} style={{ padding: '0.75rem' }}>
                    {patternOptions.map((o: any) => <option key={o.id} value={o.value}>{o.label}</option>)}
                  </select>
                </div>
                <div className="field">
                  <label className="label">Frequency</label>
                  <select value={formData.frequency} onChange={e => setFormData({...formData, frequency: e.target.value})} style={{ padding: '0.75rem' }}>
                    {freqOptions.map((o: any) => <option key={o.id} value={o.value}>{o.label}</option>)}
                  </select>
                </div>
                <div className="field">
                  <label className="label">CRUD Operation</label>
                  <select value={formData.crud} onChange={e => setFormData({...formData, crud: e.target.value})} style={{ padding: '0.75rem' }}>
                    {crudOptions.map((o: any) => <option key={o.id} value={o.value}>{o.label}</option>)}
                  </select>
                </div>
                <div className="field">
                  <label className="label">Status</label>
                  <select value={formData.status} onChange={e => setFormData({...formData, status: e.target.value})} style={{ padding: '0.75rem' }}>
                    {statusOptions.map((o: any) => <option key={o.id} value={o.value}>{o.label}</option>)}
                  </select>
                </div>
              </div>
            </section>

            {!isNew && (
              <section style={{ borderTop: '1px solid var(--border)', paddingTop: '4rem', display: 'flex', justifyContent: 'center' }}>
                <button type="button" onClick={handleDelete} className="secondary" style={{ color: 'var(--destructive)', borderColor: 'var(--destructive)', height: '3.5rem', padding: '0 2rem' }}>
                  <Trash2 size={20} style={{ marginRight: '0.75rem' }} /> Decommission this flow
                </button>
              </section>
            )}
          </div>
        </form>
      </div>
    </div>
  );
};
