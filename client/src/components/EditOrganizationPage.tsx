import React, { useState, useLayoutEffect } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { ChevronLeft, Info, Layers, Trash2, Edit2 } from 'lucide-react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ColoredSelect } from './ColoredSelect';
import { ReferencesEditor, parseReferences, serializeReferences, type Reference } from './References';

export const EditOrganizationPage = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [searchParams] = useSearchParams();
  const isNew = !id || id === 'new' || id === 'undefined';

  const [loading, setLoading] = useState(false);
  const [hydrated, setHydrated] = useState(isNew);
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    type: 'Department',
    parentId: (isNew ? searchParams.get('parentId') : '') as string | null
  });
  const [references, setReferences] = useState<Reference[]>([]);

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

  // Populate formData from the DB before the form mounts. We gate rendering on
  // `hydrated` below so Radix Select instances never see stale default values —
  // they mount once with the correct DB-backed value, avoiding the case where
  // a placeholder briefly registers and overwrites the real selection.
  useLayoutEffect(() => {
    if (org && !isNew && !hydrated) {
      setFormData({
        name: org.name || '',
        description: org.description || '',
        type: org.type || 'Department',
        parentId: org.parentId || ''
      });
      setReferences(parseReferences(org.references));
      setHydrated(true);
    }
  }, [org, isNew, hydrated]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isNew && (!id || id === 'undefined' || id === 'new')) {
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
        body: JSON.stringify({ ...formData, parentId: formData.parentId === '' ? null : formData.parentId, references: serializeReferences(references) }),
      });

      if (res.ok) {
        const saved = await res.json();
        const finalId = isNew ? saved.id : id;
        await Promise.all([
          queryClient.invalidateQueries({ queryKey: ['organization', finalId] }),
          queryClient.invalidateQueries({ queryKey: ['organizations'] }),
          queryClient.invalidateQueries({ queryKey: ['applications'] }),
          queryClient.invalidateQueries({ queryKey: ['information-objects'] }),
          queryClient.invalidateQueries({ queryKey: ['search'] }),
        ]);
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
        await Promise.all([
          queryClient.invalidateQueries({ queryKey: ['organizations'] }),
          queryClient.invalidateQueries({ queryKey: ['applications'] }),
          queryClient.invalidateQueries({ queryKey: ['information-objects'] }),
          queryClient.invalidateQueries({ queryKey: ['search'] }),
        ]);
        navigate('/organizations');
      }
    } catch (err) { console.error(err); }
  };

  // Don't render the form until both the organization AND the lookup data are loaded,
  // AND formData has been hydrated from the DB. Otherwise dropdowns can mount with
  // default values that then get committed back, overwriting real DB values.
  if (!isNew && (isOrgLoading || !org)) return <div style={{ padding: '4rem', textAlign: 'center' }} className="loading-text">Loading artifact...</div>;
  if (!picklists || !allOrgs) return <div style={{ padding: '4rem', textAlign: 'center' }} className="loading-text">Loading configuration...</div>;
  if (!hydrated) return <div style={{ padding: '4rem', textAlign: 'center' }} className="loading-text">Loading artifact...</div>;

  const filteredOrgs = Array.isArray(allOrgs) ? allOrgs.filter(o => o.id !== id) : [];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: 'var(--background)' }}>
      <div style={{ padding: '0.6rem 1.25rem', borderBottom: '1px solid var(--border)', background: 'var(--card)', display: 'flex', alignItems: 'center', gap: '0.75rem', flexShrink: 0 }}>
        <button onClick={() => navigate(-1)} style={{ background: 'none', border: 'none', padding: '0.35rem', cursor: 'pointer', display: 'flex', alignItems: 'center', color: 'var(--muted-foreground)', borderRadius: '6px' }} className="row-hover">
          <ChevronLeft size={18} />
        </button>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.8rem' }}>
          <span style={{ color: 'var(--muted-foreground)', cursor: 'pointer' }} onClick={() => navigate('/organizations')}>Hierarchy</span>
          <span style={{ color: 'var(--border)', fontWeight: 300 }}>/</span>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', color: 'var(--foreground)', fontWeight: 600 }}>
            <Edit2 size={12} style={{ opacity: 0.6 }} />
            <span>{isNew ? 'New Organization' : 'Edit Artifact'}</span>
          </div>
        </div>
      </div>

      <div style={{ flex: 1, overflowY: 'auto' }}>
        <form onSubmit={handleSubmit} className="main-container" style={{ padding: '2rem 1.25rem 4rem 1.25rem', maxWidth: '800px' }}>
          <div style={{ marginBottom: '2rem', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
                <span style={{ fontSize: '0.6rem', fontWeight: 900, textTransform: 'uppercase', padding: '0.15rem 0.5rem', borderRadius: '4px', background: '#0b7285', color: 'white', letterSpacing: '0.05em', display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                  <Layers size={10} /> Organization Unit
                </span>
              </div>
              <h1 style={{ fontSize: '1.75rem', fontWeight: 800, margin: 0, letterSpacing: '-0.02em' }}>{isNew ? 'New Organization' : org?.name}</h1>
              <p style={{ color: 'var(--muted-foreground)', fontSize: '1rem', marginTop: '0.4rem' }}>Define accountability structures.</p>
            </div>
            <div style={{ display: 'flex', gap: '0.75rem' }}>
              <button type="button" onClick={() => navigate(-1)} className="secondary" style={{ height: '2.4rem', padding: '0 1.25rem', fontSize: '0.85rem' }}>Discard</button>
              <button type="submit" className="primary" disabled={loading} style={{ height: '2.4rem', padding: '0 1.5rem', fontWeight: 800, fontSize: '0.85rem' }}>
                {loading ? 'Saving...' : (isNew ? 'Create Artifact' : 'Save Changes')}
              </button>
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '2.5rem' }}>
            <section>
              <h3 style={{ fontSize: '0.75rem', fontWeight: 800, textTransform: 'uppercase', color: 'var(--muted-foreground)', marginBottom: '1.25rem', display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                <Info size={16} /> Definition
              </h3>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '1.25rem' }}>
                <div className="field">
                  <label className="label">Name</label>
                  <input required value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} style={{ padding: '0.75rem', fontSize: '1.1rem', fontWeight: 600, height: 'auto' }} placeholder="e.g. VP of HR or Finance Dept" />
                </div>
                <div className="field">
                  <label className="label">Description</label>
                  <textarea rows={3} value={formData.description} onChange={e => setFormData({...formData, description: e.target.value})} style={{ padding: '0.75rem' }} placeholder="Accountabilities and scope..." />
                </div>
                <div className="field">
                  <label className="label">Type</label>
                  <ColoredSelect
                    value={formData.type}
                    onChange={(val) => setFormData({ ...formData, type: val })}
                    options={orgTypeOptions}
                    style={{ height: '2rem', fontSize: '0.85rem' }}
                  />
                </div>
                <div className="field">
                  <label className="label">Parent Organization / Manager</label>
                  <ColoredSelect
                    value={formData.parentId || ''}
                    onChange={(val) => setFormData({ ...formData, parentId: val || null })}
                    options={[{ value: '', label: 'None (Top Level)' }, ...filteredOrgs.map((o: any) => ({ value: o.id, label: o.name }))]}
                    style={{ height: '2rem', fontSize: '0.85rem' }}
                  />
                </div>
              </div>
            </section>

            <ReferencesEditor value={references} onChange={setReferences} />

            {!isNew && (
              <section style={{ borderTop: '1px solid var(--border)', paddingTop: '3rem', display: 'flex', justifyContent: 'center' }}>
                <button type="button" onClick={handleDelete} className="secondary" style={{ color: 'var(--destructive)', borderColor: 'var(--destructive)', height: '2.5rem', padding: '0 1.5rem', fontSize: '0.85rem' }}>
                  <Trash2 size={16} style={{ marginRight: '0.6rem' }} /> Delete this artifact
                </button>
              </section>
            )}
          </div>
        </form>
      </div>
    </div>
  );
};
