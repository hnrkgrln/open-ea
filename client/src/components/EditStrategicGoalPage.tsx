import React, { useLayoutEffect, useMemo, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { Boxes, CheckCircle2, ChevronLeft, Edit2, Info, Plus, Target, Trash2 } from 'lucide-react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ColoredSelect } from './ColoredSelect';
import { InlineFilter } from './FilterControls';
import { ReferencesEditor, parseReferences, serializeReferences, type Reference } from './References';
import { nativeFieldEnabled, type NativeFieldId } from '../nativeFields';
import { fetchWorkspaceSettings } from '../workspaceSettings';

export const EditStrategicGoalPage = () => {
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
    parentId: (isNew ? searchParams.get('parentId') : '') as string | null,
  });
  const [references, setReferences] = useState<Reference[]>([]);
  const [selectedCapIds, setSelectedCapIds] = useState<string[]>([]);
  const [capSearch, setCapSearch] = useState('');

  const { data: goal, isLoading: isGoalLoading } = useQuery({
    queryKey: ['strategic-goal', id],
    queryFn: () => fetch(`/api/strategic-goals/${id}`).then((res) => res.json()),
    enabled: !isNew && !!id && id !== 'undefined',
  });

  const { data: capabilities } = useQuery<any[]>({
    queryKey: ['capabilities'],
    queryFn: () => fetch('/api/capabilities').then((res) => res.json()),
  });
  const { data: allGoals } = useQuery<any[]>({
    queryKey: ['strategic-goals'],
    queryFn: () => fetch('/api/strategic-goals').then((res) => res.json()),
  });
  const { data: workspace } = useQuery({ queryKey: ['workspace'], queryFn: fetchWorkspaceSettings });

  const filteredCaps = useMemo(() => {
    if (!capabilities) return [];
    const query = capSearch.trim().toLowerCase();
    const rows = query ? capabilities.filter((capability) => capability.name.toLowerCase().includes(query)) : capabilities;
    return [...rows].sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
  }, [capabilities, capSearch]);

  useLayoutEffect(() => {
    if (goal && !isNew && !hydrated) {
      setFormData({
        name: goal.name || '',
        description: goal.description || '',
        parentId: goal.parentId || '',
      });
      setReferences(parseReferences(goal.references));
      setSelectedCapIds((goal.capabilities || []).map((capability: { id: string }) => capability.id));
      setHydrated(true);
    }
  }, [goal, isNew, hydrated]);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!isNew && (!id || id === 'undefined' || id === 'new')) {
      alert('Invalid ID. Cannot save changes.');
      return;
    }
    setLoading(true);
    try {
      const url = isNew ? '/api/strategic-goals' : `/api/strategic-goals/${id}`;
      const method = isNew ? 'POST' : 'PUT';
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...formData,
          parentId: formData.parentId === '' ? null : formData.parentId,
          references: serializeReferences(references),
          capabilityIds: selectedCapIds,
        }),
      });
      if (res.ok) {
        const saved = await res.json();
        const finalId = isNew ? saved.id : id;
        await Promise.all([
          queryClient.invalidateQueries({ queryKey: ['strategic-goal', finalId] }),
          queryClient.invalidateQueries({ queryKey: ['strategic-goals'] }),
          queryClient.invalidateQueries({ queryKey: ['capability'] }),
          queryClient.invalidateQueries({ queryKey: ['search'] }),
        ]);
        navigate(`/strategic-goals/${finalId}`);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!goal || isNew) return;
    const hasChildren = (allGoals || []).some((item) => item.parentId === id);
    const message = hasChildren
      ? `Are you sure you want to delete "${goal.name}" and its sub-goals?`
      : `Are you sure you want to delete "${goal.name}"?`;
    if (!confirm(message)) return;
    try {
      const res = await fetch(`/api/strategic-goals/${id}`, { method: 'DELETE' });
      if (res.ok) {
        await Promise.all([
          queryClient.invalidateQueries({ queryKey: ['strategic-goals'] }),
          queryClient.invalidateQueries({ queryKey: ['capability'] }),
          queryClient.invalidateQueries({ queryKey: ['search'] }),
        ]);
        navigate('/strategic-goals');
      }
    } catch (err) {
      console.error(err);
    }
  };

  if (!isNew && (isGoalLoading || !goal)) return <div style={{ padding: '4rem', textAlign: 'center' }} className="loading-text">Loading artifact...</div>;
  if (!capabilities || !allGoals) return <div style={{ padding: '4rem', textAlign: 'center' }} className="loading-text">Loading configuration...</div>;
  if (!hydrated) return <div style={{ padding: '4rem', textAlign: 'center' }} className="loading-text">Loading artifact...</div>;

  const showField = (fieldId: NativeFieldId) => nativeFieldEnabled(workspace?.disabledNativeFields, fieldId);
  const blockedParentIds = new Set<string>();
  if (!isNew && id) {
    const walk = (parentId: string) => {
      allGoals.filter((item) => item.parentId === parentId).forEach((child) => {
        if (blockedParentIds.has(child.id)) return;
        blockedParentIds.add(child.id);
        walk(child.id);
      });
    };
    blockedParentIds.add(id);
    walk(id);
  }
  const parentOptions = [...allGoals]
    .filter((item) => !blockedParentIds.has(item.id))
    .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }))
    .map((item) => ({ value: item.id, label: item.name }));

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: 'var(--background)' }}>
      <div style={{ padding: '0.6rem 1.25rem', borderBottom: '1px solid var(--border)', background: 'var(--card)', display: 'flex', alignItems: 'center', gap: '0.75rem', flexShrink: 0 }}>
        <button onClick={() => navigate(-1)} style={{ background: 'none', border: 'none', padding: '0.35rem', cursor: 'pointer', display: 'flex', alignItems: 'center', color: 'var(--muted-foreground)', borderRadius: '6px' }} className="row-hover">
          <ChevronLeft size={18} />
        </button>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.8rem' }}>
          <span style={{ color: 'var(--muted-foreground)', cursor: 'pointer' }} onClick={() => navigate('/strategic-goals')}>Strategic Goals</span>
          <span style={{ color: 'var(--border)', fontWeight: 300 }}>/</span>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', color: 'var(--foreground)', fontWeight: 600 }}>
            <Edit2 size={12} style={{ opacity: 0.6 }} />
            <span>{isNew ? 'New Strategic Goal' : 'Edit Artifact'}</span>
          </div>
        </div>
      </div>

      <div style={{ flex: 1, overflowY: 'auto' }}>
        <form onSubmit={handleSubmit} className="main-container" style={{ padding: '2rem 1.25rem 4rem 1.25rem', maxWidth: '800px' }}>
          <div style={{ marginBottom: '2rem', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', gap: '1rem' }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
                <span style={{ fontSize: '0.6rem', fontWeight: 900, textTransform: 'uppercase', padding: '0.15rem 0.5rem', borderRadius: '4px', background: '#5f3dc4', color: 'white', letterSpacing: '0.05em', display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                  <Target size={10} /> Strategic Goal
                </span>
              </div>
              <h1 style={{ fontSize: '1.75rem', fontWeight: 800, margin: 0, letterSpacing: '-0.02em' }}>{isNew ? 'New Strategic Goal' : goal?.name}</h1>
              <p style={{ color: 'var(--muted-foreground)', fontSize: '1rem', marginTop: '0.4rem' }}>Name the outcome and the capabilities it requires.</p>
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
                  <input required value={formData.name} onChange={(event) => setFormData({ ...formData, name: event.target.value })} style={{ padding: '0.75rem', fontSize: '1.1rem', fontWeight: 600, height: 'auto' }} placeholder="e.g. Reduce time to hire" />
                </div>
                {showField('strategicGoal.description') && (
                  <div className="field">
                    <label className="label">Description</label>
                    <textarea rows={3} value={formData.description} onChange={(event) => setFormData({ ...formData, description: event.target.value })} style={{ padding: '0.75rem' }} placeholder="The outcome this goal is meant to achieve..." />
                  </div>
                )}
                {showField('strategicGoal.parent') && (
                  <div className="field">
                    <label className="label">Parent Goal</label>
                    <ColoredSelect
                      value={formData.parentId || ''}
                      onChange={(val) => setFormData({ ...formData, parentId: val || null })}
                      options={[{ value: '', label: 'None (Top Level Goal)' }, ...parentOptions]}
                      style={{ height: '2rem', fontSize: '0.85rem' }}
                    />
                  </div>
                )}
              </div>
            </section>

            {showField('strategicGoal.capabilities') && (
              <section>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem', gap: '1rem' }}>
                  <h3 style={{ fontSize: '0.75rem', fontWeight: 800, textTransform: 'uppercase', color: 'var(--muted-foreground)', display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                    <Boxes size={16} /> Required Capabilities
                  </h3>
                  <InlineFilter value={capSearch} onChange={setCapSearch} placeholder="Search capabilities..." width="250px" />
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: '0.75rem', maxHeight: '350px', overflowY: 'auto', padding: '1rem', background: 'var(--card)', borderRadius: '16px', border: '1px solid var(--border)' }}>
                  {filteredCaps.length === 0 ? (
                    <div style={{ color: 'var(--muted-foreground)', fontSize: '0.8rem', fontStyle: 'italic', gridColumn: '1 / -1' }}>
                      {capabilities.length === 0 ? 'No capabilities defined yet.' : 'No matches.'}
                    </div>
                  ) : filteredCaps.map((capability) => (
                    <button key={capability.id} type="button" onClick={() => setSelectedCapIds((prev) => prev.includes(capability.id) ? prev.filter((item) => item !== capability.id) : [...prev, capability.id])} style={{ height: 'auto', padding: '0.75rem', justifyContent: 'flex-start', background: selectedCapIds.includes(capability.id) ? 'var(--primary)' : 'var(--background)', color: selectedCapIds.includes(capability.id) ? 'var(--primary-foreground)' : 'var(--foreground)', border: '1px solid var(--border)', textAlign: 'left', fontSize: '0.8rem' }}>
                      {selectedCapIds.includes(capability.id) ? <CheckCircle2 size={14} style={{ marginRight: '0.4rem' }} /> : <Plus size={14} style={{ marginRight: '0.4rem', opacity: 0.3 }} />}
                      {capability.name}
                    </button>
                  ))}
                </div>
              </section>
            )}

            {showField('strategicGoal.references') && <ReferencesEditor value={references} onChange={setReferences} />}

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
