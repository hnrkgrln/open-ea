import React, { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ChevronLeft, Info, Layers, Trash2, Edit2 } from 'lucide-react';
import { useQuery, useQueryClient } from '@tanstack/react-query';

export const EditOrganizationPage = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const isNew = !id || id === 'new' || id === 'undefined';

  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    type: 'Department',
    parentId: '' as string | null
  });

  const { data: org, isLoading: isOrgLoading } = useQuery({
    queryKey: ['organization', id],
    queryFn: () => fetch(`/api/organizations/${id}`).then(res => res.json()),
    enabled: !isNew && !!id && id !== 'undefined'
  });

  const { data: allOrgs } = useQuery<any[]>({ 
    queryKey: ['organizations'], 
    queryFn: () => fetch('/api/organizations').then(res => res.json()) 
  });

  const { data: picklists } = useQuery<any[]>({ 
    queryKey: ['picklists'], 
    queryFn: () => fetch('/api/picklists').then(res => res.json()) 
  });

  const orgTypeOptions = picklists?.find(p => p.name === 'organization_type')?.options || [];

  useEffect(() => {
    if (org && !isNew) {
      setFormData({
        name: org.name || '',
        description: org.description || '',
        type: org.type || 'Department',
        parentId: org.parentId || ''
      });
    }
  }, [org, isNew]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isNew && (!id || id === 'undefined')) {
      alert("Invalid ID. Cannot save changes.");
      return;
    }
    setLoading(true);
    try {
      const url = isNew ? '/api/organizations' : `/api/organizations/${id}`;
      const method = isNew ? 'POST' : 'PUT';
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...formData, parentId: formData.parentId === '' ? null : formData.parentId }),
      });

      if (res.ok) {
        const saved = await res.json();
        const finalId = isNew ? saved.id : id;
        queryClient.invalidateQueries({ queryKey: ['organization', finalId] });
        queryClient.invalidateQueries({ queryKey: ['organizations'] });
        navigate(`/organizations/${finalId}`);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!org || isNew) return;
    if (!confirm(`Are you sure you want to delete "${org.name}"?`)) return;
    try {
      const res = await fetch(`/api/organizations/${id}`, { method: 'DELETE' });
      if (res.ok) {
        queryClient.invalidateQueries({ queryKey: ['organizations'] });
        navigate('/organizations');
      }
    } catch (err) { console.error(err); }
  };

  if (!isNew && isOrgLoading) return <div style={{ padding: '4rem', textAlign: 'center' }} className="loading-text">Loading artifact...</div>;

  const filteredOrgs = Array.isArray(allOrgs) ? allOrgs.filter(o => o.id !== id) : [];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: 'var(--background)' }}>
      <div style={{ padding: '0.75rem 2rem', borderBottom: '1px solid var(--border)', background: 'var(--card)', display: 'flex', alignItems: 'center', gap: '1rem', flexShrink: 0 }}>
        <button onClick={() => navigate(-1)} style={{ background: 'none', border: 'none', padding: '0.5rem', cursor: 'pointer', display: 'flex', alignItems: 'center', color: 'var(--muted-foreground)', borderRadius: '6px' }} className="row-hover">
          <ChevronLeft size={20} />
        </button>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.875rem' }}>
          <span style={{ color: 'var(--muted-foreground)', cursor: 'pointer' }} onClick={() => navigate('/organizations')}>Hierarchy</span>
          <span style={{ color: 'var(--border)', fontWeight: 300 }}>/</span>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--foreground)', fontWeight: 600 }}>
            <Edit2 size={14} style={{ opacity: 0.6 }} />
            <span>{isNew ? 'New Organization' : 'Edit Artifact'}</span>
          </div>
        </div>
      </div>

      <div style={{ flex: 1, overflowY: 'auto' }}>
        <form onSubmit={handleSubmit} className="main-container" style={{ padding: '3rem 2rem 6rem 2rem', maxWidth: '800px' }}>
          <div style={{ marginBottom: '3rem', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
            <div>
              <h1 style={{ fontSize: '2.5rem', fontWeight: 800, margin: 0, letterSpacing: '-0.03em' }}>{isNew ? 'New Organization' : org?.name}</h1>
              <p style={{ color: 'var(--muted-foreground)', fontSize: '1.125rem', marginTop: '0.5rem' }}>Define accountability structures and roles.</p>
            </div>
            <div style={{ display: 'flex', gap: '1rem' }}>
              <button type="button" onClick={() => navigate(-1)} className="secondary" style={{ height: '3rem', padding: '0 1.5rem' }}>Discard</button>
              <button type="submit" className="primary" disabled={loading} style={{ height: '3rem', padding: '0 2rem', fontWeight: 800 }}>
                {loading ? 'Saving...' : (isNew ? 'Create Artifact' : 'Save Changes')}
              </button>
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '3rem' }}>
            <section>
              <h3 style={{ fontSize: '0.875rem', fontWeight: 800, textTransform: 'uppercase', color: 'var(--muted-foreground)', marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                <Info size={18} /> Definition
              </h3>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '2rem' }}>
                <div className="field">
                  <label className="label">Name</label>
                  <input required value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} style={{ padding: '1rem', fontSize: '1.25rem', fontWeight: 600 }} placeholder="e.g. VP of HR or Finance Dept" />
                </div>
                <div className="field">
                  <label className="label">Description</label>
                  <textarea rows={4} value={formData.description} onChange={e => setFormData({...formData, description: e.target.value})} style={{ padding: '1rem' }} placeholder="Accountabilities and scope..." />
                </div>
                <div className="field">
                  <label className="label">Type</label>
                  <select value={formData.type} onChange={e => setFormData({...formData, type: e.target.value})} style={{ padding: '0.75rem' }}>
                    {orgTypeOptions.map((o: any) => <option key={o.id} value={o.value}>{o.label}</option>)}
                  </select>
                </div>
                <div className="field">
                  <label className="label">Parent Organization / Manager</label>
                  <select value={formData.parentId || ''} onChange={e => setFormData({...formData, parentId: e.target.value || null})} style={{ padding: '0.75rem' }}>
                    <option value="">None (Top Level)</option>
                    {filteredOrgs.map((o: any) => <option key={o.id} value={o.id}>{o.name}</option>)}
                  </select>
                </div>
              </div>
            </section>

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
