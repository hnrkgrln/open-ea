import React, { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  ArrowRight,
  Calendar,
  CheckCircle2,
  Clock,
  GitBranch,
  GitCompareArrows,
  Layers,
  PauseCircle,
  PlayCircle,
  Plus,
  Search,
  Sparkles,
  Trash2,
  User,
  X,
} from 'lucide-react';
import { useLandscapeStateController, type LandscapeState } from './StateMenu';

const API_BASE = '/api';

export type TransformationStatus = 'Planned' | 'In Progress' | 'Completed' | 'On Hold';
export type TransformationEntityType = 'Application' | 'Integration' | 'Organization' | 'Capability';
export type TransformationAction =
  | 'REPLACE'
  | 'CONSOLIDATE'
  | 'SPLIT'
  | 'RETIRE'
  | 'INTRODUCE'
  | 'EVOLVE';

export interface TransformationListItem {
  id: string;
  name: string;
  description: string | null;
  status: TransformationStatus;
  owner: string | null;
  startDate: string | null;
  targetDate: string | null;
  fromStateId: string;
  toStateId: string;
  references: string | null;
  createdAt: string;
  updatedAt: string;
  fromState: LandscapeState;
  toState: LandscapeState;
  summary: {
    stepCount: number;
    predecessorAppCount: number;
    successorAppCount: number;
    predecessorOrgCount: number;
    successorOrgCount: number;
    predecessorIntCount: number;
    successorIntCount: number;
  };
}

export const STATUS_META: Record<
  TransformationStatus,
  { color: string; bg: string; border: string; icon: React.ReactNode }
> = {
  Planned: {
    color: '#6366f1',
    bg: 'rgba(99, 102, 241, 0.12)',
    border: 'rgba(99, 102, 241, 0.3)',
    icon: <Clock size={13} />,
  },
  'In Progress': {
    color: '#f59e0b',
    bg: 'rgba(245, 158, 11, 0.12)',
    border: 'rgba(245, 158, 11, 0.35)',
    icon: <PlayCircle size={13} />,
  },
  Completed: {
    color: '#10b981',
    bg: 'rgba(16, 185, 129, 0.12)',
    border: 'rgba(16, 185, 129, 0.35)',
    icon: <CheckCircle2 size={13} />,
  },
  'On Hold': {
    color: '#94a3b8',
    bg: 'rgba(148, 163, 184, 0.12)',
    border: 'rgba(148, 163, 184, 0.3)',
    icon: <PauseCircle size={13} />,
  },
};

function formatShortDate(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toISOString().slice(0, 10);
}

export const TransformationsView: React.FC = () => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const { states, active, activeId, isTarget, label } = useLandscapeStateController();

  const initialStateFilter = searchParams.get('state') || 'all';
  const [stateFilter, setStateFilter] = useState<string>(initialStateFilter);
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [createOpen, setCreateOpen] = useState<boolean>(false);

  const fromStateOptions = useMemo(
    () => (states || []).filter((s) => s.id !== activeId),
    [states, activeId],
  );

  const [newName, setNewName] = useState('');
  const [newDescription, setNewDescription] = useState('');
  const [newStatus, setNewStatus] = useState<TransformationStatus>('Planned');
  const [newOwner, setNewOwner] = useState('');
  const [newStartDate, setNewStartDate] = useState('');
  const [newTargetDate, setNewTargetDate] = useState('');
  const [newFromStateId, setNewFromStateId] = useState('current');
  const [autoPopulate, setAutoPopulate] = useState(true);
  const [creating, setCreating] = useState(false);
  const [formError, setFormError] = useState('');

  const { data: transformations = [], isLoading } = useQuery<TransformationListItem[]>({
    queryKey: ['transformations'],
    queryFn: async () => {
      const res = await fetch(`${API_BASE}/transformations`);
      if (!res.ok) throw new Error('Failed to load transformations');
      return res.json();
    },
  });

  const { data: diffPreview, isFetching: loadingDiffPreview } = useQuery<{
    suggestions: Array<{ key: string; entityType: string; action: string; title: string }>;
  }>({
    queryKey: ['transformation-diff-preview', newFromStateId, activeId],
    enabled: createOpen && isTarget && !!newFromStateId && newFromStateId !== activeId,
    queryFn: async () => {
      const res = await fetch(
        `${API_BASE}/transformations/diff-preview?fromStateId=${encodeURIComponent(
          newFromStateId,
        )}&toStateId=${encodeURIComponent(activeId)}`,
      );
      if (!res.ok) throw new Error('Failed to preview diff');
      return res.json();
    },
  });

  const openCreateModal = () => {
    if (!isTarget || activeId === 'current') return;
    const sourceId = active?.sourceStateId;
    const fromId =
      sourceId && sourceId !== activeId && fromStateOptions.some((s) => s.id === sourceId)
        ? sourceId
        : 'current';
    setNewFromStateId(fromId);
    setNewName(active?.name ? `Transformation to ${active.name}` : `Transformation to ${label}`);
    setNewDescription('');
    setNewStatus('Planned');
    setNewOwner('');
    setNewStartDate(new Date().toISOString().slice(0, 10));
    setNewTargetDate('');
    setAutoPopulate(true);
    setFormError('');
    setCreateOpen(true);
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isTarget || activeId === 'current') {
      setFormError('The current state reflects the present. Create a target state and switch to it before creating a transformation.');
      return;
    }
    if (!newName.trim()) {
      setFormError('Give the transformation a name.');
      return;
    }
    if (!newFromStateId || newFromStateId === activeId) {
      setFormError('Choose a predecessor state other than this target.');
      return;
    }
    setCreating(true);
    setFormError('');
    try {
      const res = await fetch(`${API_BASE}/transformations`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newName.trim(),
          description: newDescription.trim() || null,
          status: newStatus,
          owner: newOwner.trim() || null,
          startDate: newStartDate || null,
          targetDate: newTargetDate || null,
          fromStateId: newFromStateId,
          toStateId: activeId,
          autoPopulateFromDiff: autoPopulate,
        }),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(body?.error || 'Could not create transformation.');
      }
      await queryClient.invalidateQueries({ queryKey: ['transformations'] });
      setCreateOpen(false);
      navigate(`/transformations/${body.id}`);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Could not create transformation.');
    } finally {
      setCreating(false);
    }
  };

  const handleDelete = async (e: React.MouseEvent, item: TransformationListItem) => {
    e.stopPropagation();
    if (!window.confirm(`Delete transformation "${item.name}"? This will not delete any landscape states or artifacts.`)) {
      return;
    }
    await fetch(`${API_BASE}/transformations/${item.id}`, { method: 'DELETE' });
    queryClient.invalidateQueries({ queryKey: ['transformations'] });
  };

  const filtered = useMemo(() => {
    return transformations.filter((t) => {
      if (stateFilter !== 'all' && t.fromStateId !== stateFilter && t.toStateId !== stateFilter) {
        return false;
      }
      if (statusFilter !== 'all' && t.status !== statusFilter) {
        return false;
      }
      if (searchTerm.trim()) {
        const q = searchTerm.toLowerCase();
        const hay = `${t.name} ${t.description || ''} ${t.owner || ''} ${t.fromState.name} ${t.toState.name}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [transformations, stateFilter, statusFilter, searchTerm]);

  const stats = useMemo(() => {
    return {
      total: transformations.length,
      planned: transformations.filter((t) => t.status === 'Planned').length,
      inProgress: transformations.filter((t) => t.status === 'In Progress').length,
      completed: transformations.filter((t) => t.status === 'Completed').length,
      totalSteps: transformations.reduce((acc, t) => acc + t.summary.stepCount, 0),
    };
  }, [transformations]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      {/* Header */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          gap: '1rem',
          flexWrap: 'wrap',
        }}
      >
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
            <GitCompareArrows size={24} style={{ color: 'var(--brand-focus)' }} />
            <h1 style={{ margin: 0, fontSize: '1.65rem', fontWeight: 700 }}>Transformations</h1>
          </div>
          <p style={{ margin: '0.35rem 0 0', color: 'var(--muted-foreground)', fontSize: '0.92rem', maxWidth: '52rem' }}>
            {isTarget
              ? <>Model how the landscape moves into <strong>{label}</strong>. This target state is the basis of a new transformation.</>
              : <>Current state reflects the present, so transformations can only be viewed here. Create a target state and switch to it — that target is the basis of a transformation.</>}
          </p>
        </div>

        {isTarget && (
          <button
            type="button"
            className="primary"
            onClick={openCreateModal}
            style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', padding: '0.6rem 1.1rem' }}
          >
            <Plus size={16} />
            <span>New Transformation</span>
          </button>
        )}
      </div>

      {/* KPI Summary Cards */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))',
          gap: '0.85rem',
        }}
      >
        {[
          { label: 'Total Transformations', value: stats.total, color: 'var(--brand-focus)' },
          { label: 'Planned', value: stats.planned, color: '#6366f1' },
          { label: 'In Progress', value: stats.inProgress, color: '#f59e0b' },
          { label: 'Completed', value: stats.completed, color: '#10b981' },
          { label: 'Transition Steps', value: stats.totalSteps, color: '#38bdf8' },
        ].map((kpi) => (
          <div
            key={kpi.label}
            className="card"
            style={{
              padding: '0.9rem 1.1rem',
              display: 'flex',
              flexDirection: 'column',
              gap: '0.25rem',
              borderLeft: `3px solid ${kpi.color}`,
            }}
          >
            <span style={{ fontSize: '0.75rem', color: 'var(--muted-foreground)', textTransform: 'uppercase', letterSpacing: '0.04em', fontWeight: 600 }}>
              {kpi.label}
            </span>
            <span style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--foreground)' }}>
              {kpi.value}
            </span>
          </div>
        ))}
      </div>

      {/* Filter Bar */}
      <div
        className="card"
        style={{
          padding: '0.85rem 1rem',
          display: 'flex',
          alignItems: 'center',
          gap: '0.85rem',
          flexWrap: 'wrap',
        }}
      >
        <div style={{ position: 'relative', flex: '1 1 240px' }}>
          <Search
            size={15}
            style={{
              position: 'absolute',
              left: '0.75rem',
              top: '50%',
              transform: 'translateY(-50%)',
              color: 'var(--muted-foreground)',
            }}
          />
          <input
            type="text"
            placeholder="Search transformations by name, owner, or state..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            style={{ width: '100%', paddingLeft: '2.2rem' }}
          />
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <label style={{ fontSize: '0.8rem', color: 'var(--muted-foreground)', fontWeight: 600 }}>
            State:
          </label>
          <select
            value={stateFilter}
            onChange={(e) => {
              const next = e.target.value;
              setStateFilter(next);
              if (next === 'all') {
                searchParams.delete('state');
              } else {
                searchParams.set('state', next);
              }
              setSearchParams(searchParams, { replace: true });
            }}
            style={{ minWidth: '170px' }}
          >
            <option value="all">All Landscape States</option>
            {(states || []).map((s) => (
              <option key={s.id} value={s.id}>
                {s.name} {s.isCurrent ? '(Current)' : '(Target)'}
              </option>
            ))}
          </select>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <label style={{ fontSize: '0.8rem', color: 'var(--muted-foreground)', fontWeight: 600 }}>
            Status:
          </label>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            style={{ minWidth: '140px' }}
          >
            <option value="all">All Statuses</option>
            <option value="Planned">Planned</option>
            <option value="In Progress">In Progress</option>
            <option value="Completed">Completed</option>
            <option value="On Hold">On Hold</option>
          </select>
        </div>
      </div>

      {/* Transformations Grid / Empty State */}
      {isLoading ? (
        <div className="card" style={{ padding: '3rem', textAlign: 'center', color: 'var(--muted-foreground)' }}>
          Loading transformations…
        </div>
      ) : filtered.length === 0 ? (
        <div
          className="card"
          style={{
            padding: '3rem 2rem',
            textAlign: 'center',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: '0.85rem',
          }}
        >
          <div
            style={{
              width: '3.2rem',
              height: '3.2rem',
              borderRadius: '50%',
              background: 'rgba(99, 102, 241, 0.12)',
              color: 'var(--brand-focus)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <GitCompareArrows size={24} />
          </div>
          <h3 style={{ margin: 0, fontSize: '1.15rem' }}>No transformations modelled yet</h3>
          <p style={{ margin: 0, color: 'var(--muted-foreground)', maxWidth: '34rem', fontSize: '0.9rem' }}>
            {isTarget
              ? <>Create a transformation based on <strong>{label}</strong> to map how applications, integrations, and organizations move into this target.</>
              : <>Transformations are listed here for review. Current state reflects the present, so a new one cannot be created until you add a target state and switch to it.</>}
          </p>
          {isTarget ? (
            <button
              type="button"
              className="primary"
              onClick={openCreateModal}
              style={{ marginTop: '0.35rem', display: 'flex', alignItems: 'center', gap: '0.45rem' }}
            >
              <Plus size={16} />
              <span>Create First Transformation</span>
            </button>
          ) : (
            <p style={{ margin: 0, fontSize: '0.82rem', color: '#f59e0b' }}>
              Use the state menu in the top-right header to create a target state, then switch to it.
            </p>
          )}
        </div>
      ) : (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(380px, 1fr))',
            gap: '1rem',
          }}
        >
          {filtered.map((item) => {
            const st = STATUS_META[item.status] || STATUS_META.Planned;
            return (
              <div
                key={item.id}
                className="card"
                onClick={() => navigate(`/transformations/${item.id}`)}
                style={{
                  padding: '1.2rem 1.3rem',
                  cursor: 'pointer',
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'space-between',
                  gap: '1rem',
                  transition: 'transform 0.12s ease, border-color 0.12s ease',
                }}
              >
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.7rem' }}>
                  {/* Top row: State flow pill + Status badge */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                    <div
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '0.4rem',
                        fontSize: '0.76rem',
                        fontWeight: 600,
                        padding: '0.24rem 0.6rem',
                        borderRadius: '999px',
                        background: 'var(--muted)',
                        border: '1px solid var(--border)',
                        color: 'var(--foreground)',
                      }}
                    >
                      <GitBranch size={12} style={{ color: 'var(--brand-focus)' }} />
                      <span>{item.fromState.name}</span>
                      <ArrowRight size={12} style={{ color: 'var(--muted-foreground)' }} />
                      <span style={{ color: '#f59e0b' }}>{item.toState.name}</span>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                      <span
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '0.3rem',
                          fontSize: '0.74rem',
                          fontWeight: 600,
                          padding: '0.2rem 0.55rem',
                          borderRadius: '999px',
                          color: st.color,
                          background: st.bg,
                          border: `1px solid ${st.border}`,
                        }}
                      >
                        {st.icon}
                        {item.status}
                      </span>
                      {isTarget && item.toStateId === activeId && (
                        <button
                          type="button"
                          onClick={(e) => handleDelete(e, item)}
                          title="Delete transformation"
                          style={{
                            background: 'transparent',
                            border: 'none',
                            color: 'var(--muted-foreground)',
                            padding: '0.25rem',
                            cursor: 'pointer',
                            borderRadius: '0.35rem',
                          }}
                        >
                          <Trash2 size={14} />
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Title & Description */}
                  <div>
                    <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 700, color: 'var(--foreground)' }}>
                      {item.name}
                    </h3>
                    {item.description && (
                      <p
                        style={{
                          margin: '0.35rem 0 0',
                          fontSize: '0.84rem',
                          color: 'var(--muted-foreground)',
                          display: '-webkit-box',
                          WebkitLineClamp: 2,
                          WebkitBoxOrient: 'vertical',
                          overflow: 'hidden',
                        }}
                      >
                        {item.description}
                      </p>
                    )}
                  </div>

                  {/* Owner & Dates */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap', fontSize: '0.78rem', color: 'var(--muted-foreground)' }}>
                    {item.owner && (
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.3rem' }}>
                        <User size={13} />
                        {item.owner}
                      </span>
                    )}
                    {(item.startDate || item.targetDate) && (
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.3rem' }}>
                        <Calendar size={13} />
                        {formatShortDate(item.startDate)} → {formatShortDate(item.targetDate)}
                      </span>
                    )}
                  </div>
                </div>

                {/* Bottom Metrics Bar */}
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: '0.5rem',
                    paddingTop: '0.75rem',
                    borderTop: '1px solid var(--border)',
                    fontSize: '0.78rem',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.55rem', flexWrap: 'wrap' }}>
                    <span
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '0.3rem',
                        padding: '0.2rem 0.5rem',
                        borderRadius: '0.35rem',
                        background: 'rgba(99, 102, 241, 0.1)',
                        color: 'var(--brand-focus)',
                        fontWeight: 600,
                      }}
                    >
                      <Layers size={12} />
                      {item.summary.stepCount} {item.summary.stepCount === 1 ? 'step' : 'steps'}
                    </span>

                    <span style={{ color: 'var(--muted-foreground)' }}>
                      Apps: <strong>{item.summary.predecessorAppCount}</strong> pred →{' '}
                      <strong>{item.summary.successorAppCount}</strong> succ
                    </span>

                    {(item.summary.predecessorOrgCount > 0 || item.summary.successorOrgCount > 0) && (
                      <span style={{ color: 'var(--muted-foreground)' }}>
                        · Orgs: <strong>{item.summary.predecessorOrgCount}→{item.summary.successorOrgCount}</strong>
                      </span>
                    )}
                  </div>

                  <span
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '0.25rem',
                      color: 'var(--brand-focus)',
                      fontWeight: 600,
                      whiteSpace: 'nowrap',
                    }}
                  >
                    Open <ArrowRight size={13} />
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* New Transformation Modal */}
      {createOpen && (
        <div className="state-dialog-backdrop" onMouseDown={() => !creating && setCreateOpen(false)}>
          <form
            className="state-dialog state-merge-dialog"
            style={{ width: 'min(38rem, calc(100vw - 2rem))' }}
            onMouseDown={(e) => e.stopPropagation()}
            onSubmit={handleCreate}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div className="state-merge-header" style={{ marginBottom: 0 }}>
                <span className="target-state-pill">
                  <GitCompareArrows size={12} />
                  Cross-State Transition
                </span>
                <h2 style={{ margin: '0.25rem 0 0' }}>New Transformation</h2>
              </div>
              <button
                type="button"
                onClick={() => setCreateOpen(false)}
                style={{ background: 'transparent', border: 'none', color: 'var(--muted-foreground)', cursor: 'pointer' }}
              >
                <X size={18} />
              </button>
            </div>

            <p style={{ margin: '0.5rem 0 1rem', fontSize: '0.86rem', color: 'var(--muted-foreground)' }}>
              This transformation is based on <strong>{label}</strong>. Predecessors come from another state, usually Current.
            </p>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr auto 1fr', gap: '0.6rem', alignItems: 'end', marginBottom: '0.9rem' }}>
              <div>
                <label className="label">From State (Predecessors)</label>
                <select
                  value={newFromStateId}
                  onChange={(e) => setNewFromStateId(e.target.value)}
                  disabled={creating}
                >
                  {fromStateOptions.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name} {s.isCurrent ? '(Current)' : ''}
                    </option>
                  ))}
                </select>
              </div>
              <div style={{ paddingBottom: '0.65rem', color: 'var(--muted-foreground)' }}>
                <ArrowRight size={18} />
              </div>
              <div>
                <label className="label">Target State (basis)</label>
                <input value={label} readOnly disabled />
              </div>
            </div>

            <label className="label" htmlFor="trans-name">
              Transformation Name
            </label>
            <input
              id="trans-name"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="e.g. ERP Consolidation Wave 1 / Shift to Product Organization"
              autoFocus
              disabled={creating}
            />

            <label className="label" htmlFor="trans-desc" style={{ marginTop: '0.75rem' }}>
              Business Case / Scope Description
            </label>
            <textarea
              id="trans-desc"
              rows={3}
              value={newDescription}
              onChange={(e) => setNewDescription(e.target.value)}
              placeholder="Describe the architectural goal, scope of predecessor systems, and target architecture outcome..."
              disabled={creating}
              style={{ resize: 'vertical' }}
            />

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', marginTop: '0.75rem' }}>
              <div>
                <label className="label">Status</label>
                <select
                  value={newStatus}
                  onChange={(e) => setNewStatus(e.target.value as TransformationStatus)}
                  disabled={creating}
                >
                  <option value="Planned">Planned</option>
                  <option value="In Progress">In Progress</option>
                  <option value="Completed">Completed</option>
                  <option value="On Hold">On Hold</option>
                </select>
              </div>
              <div>
                <label className="label">Transformation Owner</label>
                <input
                  value={newOwner}
                  onChange={(e) => setNewOwner(e.target.value)}
                  placeholder="e.g. Enterprise Architecture / PMO"
                  disabled={creating}
                />
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', marginTop: '0.75rem' }}>
              <div>
                <label className="label">Start Date</label>
                <input
                  type="date"
                  value={newStartDate}
                  onChange={(e) => setNewStartDate(e.target.value)}
                  disabled={creating}
                />
              </div>
              <div>
                <label className="label">Target Completion Date</label>
                <input
                  type="date"
                  value={newTargetDate}
                  onChange={(e) => setNewTargetDate(e.target.value)}
                  disabled={creating}
                />
              </div>
            </div>

            {/* Auto-populate from state diff */}
            <div className="state-merge-options" style={{ marginTop: '1rem' }}>
              <label className="state-merge-option-check" style={{ alignItems: 'flex-start' }}>
                <input
                  type="checkbox"
                  className="table-select-check"
                  checked={autoPopulate}
                  onChange={(e) => setAutoPopulate(e.target.checked)}
                  disabled={creating}
                  style={{ marginTop: '0.2rem' }}
                />
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem' }}>
                  <strong style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.84rem' }}>
                    <Sparkles size={13} style={{ color: '#f59e0b' }} />
                    Auto-populate transition steps from state differences
                  </strong>
                  <span style={{ fontSize: '0.78rem', color: 'var(--muted-foreground)' }}>
                    Automatically detect replaced, consolidated, retired, newly introduced, and evolved artifacts
                    between the two states. You can refine or add steps afterward.
                  </span>
                  {newFromStateId !== activeId && (
                    <div style={{ marginTop: '0.2rem', fontSize: '0.78rem', color: 'var(--brand-focus)', fontWeight: 600 }}>
                      {loadingDiffPreview
                        ? 'Scanning state differences…'
                        : diffPreview
                          ? `${diffPreview.suggestions.length} candidate transition steps detected between selected states`
                          : null}
                    </div>
                  )}
                </div>
              </label>
            </div>

            {formError && <p className="state-dialog-error">{formError}</p>}

            <div className="state-dialog-actions" style={{ marginTop: '1.1rem' }}>
              <button type="button" className="secondary" onClick={() => setCreateOpen(false)} disabled={creating}>
                Cancel
              </button>
              <button
                type="submit"
                className="primary"
                disabled={creating || !isTarget || !newFromStateId || newFromStateId === activeId}
              >
                <Plus size={14} />
                {creating ? 'Creating…' : 'Create Transformation'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};
