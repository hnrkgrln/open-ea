import { useCallback, useEffect, useState, useSyncExternalStore } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useLocation, useNavigate } from 'react-router-dom';
import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import { ArrowLeft, GitBranch, GitCompareArrows, GitMerge, Pencil, Plus, Trash2 } from 'lucide-react';
import { landscapeStateHeader, setLandscapeStateId, subscribeLandscapeState } from '../landscapeState';

export type LandscapeState = {
  id: string;
  name: string;
  sourceStateId: string | null;
  isCurrent: boolean;
};

export type MergeDomain =
  | 'organizations'
  | 'applications'
  | 'capabilities'
  | 'strategicGoals'
  | 'informationObjects'
  | 'integrations';

type DomainMeta = {
  id: MergeDomain;
  label: string;
  description: string;
};

const MERGE_DOMAIN_META: readonly DomainMeta[] = [
  { id: 'organizations', label: 'Organizations', description: 'Organizational hierarchy, product areas & teams' },
  { id: 'applications', label: 'Applications', description: 'Application inventory, ownership & capability links' },
  { id: 'capabilities', label: 'Capabilities', description: 'Business capability hierarchy & criticality' },
  { id: 'strategicGoals', label: 'Strategic Goals', description: 'Goal hierarchy & required capabilities' },
  { id: 'informationObjects', label: 'Information Objects', description: 'Information catalog, CIA & owners' },
  { id: 'integrations', label: 'Integrations', description: 'Application data flows & payloads' },
];

const ALL_MERGE_DOMAINS: MergeDomain[] = MERGE_DOMAIN_META.map((d) => d.id);

type LandscapeStateSummary = {
  state: LandscapeState;
  counts: Record<MergeDomain, { current: number; target: number }>;
};

const PORTFOLIO_ROOTS = new Set([
  'applications',
  'application',
  'strategic-goals',
  'strategic-goal',
  'capabilities',
  'capability',
  'organizations',
  'organization',
  'information-objects',
  'information-object',
  'integrations',
  'integration',
  'search',
]);

const SECTION_LISTS = ['/apps', '/strategic-goals', '/capabilities', '/organizations', '/information', '/integrations'];

type Draft = {
  mode: 'create' | 'rename';
  id?: string;
  name: string;
  sourceId: string;
};

async function errorMessage(res: Response, fallback = 'Could not save the landscape state.') {
  try {
    const body = await res.json() as { error?: unknown };
    if (typeof body.error === 'string' && body.error.trim()) return body.error;
  } catch {
    // The status line is enough when the body is not JSON.
  }
  return fallback;
}

export function useLandscapeStateController() {
  const navigate = useNavigate();
  const location = useLocation();
  const queryClient = useQueryClient();
  const activeId = useSyncExternalStore(subscribeLandscapeState, landscapeStateHeader, () => 'current');
  const { data: states } = useQuery<LandscapeState[]>({
    queryKey: ['landscape-states'],
    queryFn: async () => {
      const res = await fetch('/api/landscape-states');
      if (!res.ok) throw new Error(await errorMessage(res));
      return res.json();
    },
  });

  const active = states?.find((state) => state.id === activeId);
  const isTarget = active ? !active.isCurrent : activeId !== 'current';
  const label = active?.name || (activeId === 'current' ? 'Current' : 'Target state');
  const sourceState = active?.sourceStateId
    ? states?.find((item) => item.id === active.sourceStateId) ?? null
    : null;

  const resetPortfolioQueries = useCallback(() => {
    const isPortfolioQuery = (query: { queryKey: readonly unknown[] }) => PORTFOLIO_ROOTS.has(String(query.queryKey[0]));
    void queryClient.cancelQueries({ predicate: isPortfolioQuery });
    void queryClient.resetQueries({ predicate: isPortfolioQuery });
  }, [queryClient]);

  const switchTo = useCallback((id: string, forceRefresh = false) => {
    const next = id || 'current';
    const changed = next !== landscapeStateHeader();
    if (!changed && !forceRefresh) return;
    if (changed) setLandscapeStateId(next);
    resetPortfolioQueries();
    const list = SECTION_LISTS.find((root) => location.pathname.startsWith(`${root}/`));
    if (list) navigate(list);
  }, [location.pathname, navigate, resetPortfolioQueries]);

  return {
    activeId,
    active,
    isTarget,
    label,
    states,
    sourceState,
    switchTo,
  };
}

const MergeStateDialog = ({
  targetState,
  onClose,
  onMerged,
}: {
  targetState: LandscapeState;
  onClose: () => void;
  onMerged: () => void;
}) => {
  const queryClient = useQueryClient();
  const [selectedDomains, setSelectedDomains] = useState<Set<MergeDomain>>(() => new Set(ALL_MERGE_DOMAINS));
  const [backupCurrent, setBackupCurrent] = useState(true);
  const [backupName, setBackupName] = useState(() => {
    const today = new Date().toISOString().slice(0, 10);
    return `Before ${targetState.name} (${today})`.slice(0, 80);
  });
  const [deleteSource, setDeleteSource] = useState(false);
  const [merging, setMerging] = useState(false);
  const [error, setError] = useState('');

  const { data: summary, isLoading: loadingSummary } = useQuery<LandscapeStateSummary>({
    queryKey: ['landscape-state-summary', targetState.id],
    queryFn: async () => {
      const res = await fetch(`/api/landscape-states/${targetState.id}/summary`);
      if (!res.ok) throw new Error(await errorMessage(res, 'Could not load state summary.'));
      return res.json();
    },
  });

  const allSelected = selectedDomains.size === ALL_MERGE_DOMAINS.length;

  const toggleDomain = (domain: MergeDomain) => {
    setSelectedDomains((prev) => {
      const next = new Set(prev);
      if (next.has(domain)) next.delete(domain);
      else next.add(domain);
      return next;
    });
  };

  const selectPreset = (domains: readonly MergeDomain[]) => {
    setSelectedDomains(new Set(domains));
  };

  const handleMerge = async () => {
    if (merging || selectedDomains.size === 0) return;
    setMerging(true);
    setError('');
    try {
      const res = await fetch(`/api/landscape-states/${targetState.id}/merge`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          domains: ALL_MERGE_DOMAINS.filter((d) => selectedDomains.has(d)),
          backupCurrent,
          backupName: backupCurrent ? backupName.trim() : undefined,
          deleteSource,
        }),
      });
      if (!res.ok) {
        setError(await errorMessage(res, 'Could not merge target state into Current.'));
        return;
      }
      await queryClient.invalidateQueries({ queryKey: ['landscape-states'] });
      onMerged();
    } finally {
      setMerging(false);
    }
  };

  return (
    <div className="state-dialog-backdrop" onMouseDown={() => { if (!merging) onClose(); }}>
      <form
        className="state-dialog state-merge-dialog"
        onMouseDown={(event) => event.stopPropagation()}
        onSubmit={(event) => {
          event.preventDefault();
          void handleMerge();
        }}
      >
        <div className="state-merge-header">
          <span className="target-state-pill">
            <GitMerge size={12} />
            Merge into Current
          </span>
          <h2>Promote "{targetState.name}" to Current</h2>
          <p>
            Replaces the selected artifact domains in <strong>Current</strong> with the evolved data from <strong>{targetState.name}</strong>. Cross-domain links to unselected domains are preserved by name.
          </p>
        </div>

        <div className="state-merge-presets">
          <span className="label" style={{ margin: 0 }}>Scope</span>
          <div className="state-merge-preset-buttons">
            <button
              type="button"
              className={`secondary${allSelected ? ' active' : ''}`}
              disabled={merging}
              onClick={() => selectPreset(ALL_MERGE_DOMAINS)}
            >
              Entire portfolio ({ALL_MERGE_DOMAINS.length})
            </button>
            <button
              type="button"
              className={`secondary${selectedDomains.size === 2 && selectedDomains.has('organizations') && selectedDomains.has('applications') ? ' active' : ''}`}
              disabled={merging}
              onClick={() => selectPreset(['organizations', 'applications'])}
            >
              Organizations & Applications
            </button>
          </div>
        </div>

        <div className="state-merge-domains" role="group" aria-label="Artifact domains to merge">
          {MERGE_DOMAIN_META.map((domain) => {
            const checked = selectedDomains.has(domain.id);
            const count = summary?.counts[domain.id];
            const delta = count ? count.target - count.current : 0;
            return (
              <label key={domain.id} className={`state-merge-domain-row${checked ? ' selected' : ''}`}>
                <input
                  type="checkbox"
                  className="table-select-check"
                  checked={checked}
                  disabled={merging}
                  onChange={() => toggleDomain(domain.id)}
                />
                <span className="state-merge-domain-copy">
                  <span className="state-merge-domain-title">{domain.label}</span>
                  <span className="state-merge-domain-desc">{domain.description}</span>
                </span>
                <span className="state-merge-counts">
                  {loadingSummary || !count ? (
                    <span className="state-merge-count-pair">…</span>
                  ) : (
                    <>
                      <span className="state-merge-count-pair" title={`Current: ${count.current}, Target: ${count.target}`}>
                        {count.current} → <strong>{count.target}</strong>
                      </span>
                      {delta !== 0 && (
                        <span className={`state-merge-delta ${delta > 0 ? 'plus' : 'minus'}`}>
                          {delta > 0 ? `+${delta}` : delta}
                        </span>
                      )}
                    </>
                  )}
                </span>
              </label>
            );
          })}
        </div>

        <div className="state-merge-options">
          <label className="state-merge-option-check">
            <input
              type="checkbox"
              className="table-select-check"
              checked={backupCurrent}
              disabled={merging}
              onChange={(event) => setBackupCurrent(event.target.checked)}
            />
            <span>Save a backup copy of Current before merging</span>
          </label>
          {backupCurrent && (
            <input
              value={backupName}
              maxLength={80}
              disabled={merging}
              placeholder="Backup state name"
              aria-label="Backup state name"
              onChange={(event) => setBackupName(event.target.value)}
            />
          )}
          <label className="state-merge-option-check">
            <input
              type="checkbox"
              className="table-select-check"
              checked={deleteSource}
              disabled={merging}
              onChange={(event) => setDeleteSource(event.target.checked)}
            />
            <span>Delete target state "{targetState.name}" after merge</span>
          </label>
        </div>

        {error && <p className="state-dialog-error">{error}</p>}

        <div className="state-dialog-actions">
          <button type="button" className="secondary" disabled={merging} onClick={onClose}>
            Cancel
          </button>
          <button
            type="submit"
            className="primary"
            disabled={merging || selectedDomains.size === 0 || (backupCurrent && !backupName.trim())}
          >
            <GitMerge size={14} />
            {merging ? 'Merging into Current…' : `Merge ${selectedDomains.size === ALL_MERGE_DOMAINS.length ? 'all domains' : `${selectedDomains.size} ${selectedDomains.size === 1 ? 'domain' : 'domains'}`} into Current`}
          </button>
        </div>
      </form>
    </div>
  );
};

export const TargetStateBanner = () => {
  const navigate = useNavigate();
  const { active, activeId, isTarget, label, sourceState, switchTo } = useLandscapeStateController();
  const [mergingOpen, setMergingOpen] = useState(false);
  if (!isTarget) return null;

  const sourceLabel = sourceState?.name || (active?.sourceStateId === 'current' || !active?.sourceStateId ? 'Current' : 'another state');
  const mergeTarget: LandscapeState = active || {
    id: activeId,
    name: label,
    sourceStateId: 'current',
    isCurrent: false,
  };

  return (
    <>
      <div className="target-state-banner" role="region" aria-label="Target state context">
        <div className="target-state-banner-info">
          <span className="target-state-pill">
            <GitBranch size={12} />
            Target state
          </span>
          <strong className="target-state-name">{label}</strong>
          <span className="target-state-lineage">
            Future evolution of <strong>{sourceLabel}</strong> — changes here are isolated from the current state.
          </span>
        </div>
        <div className="target-state-banner-actions">
          <button
            type="button"
            className="target-state-return"
            onClick={() => navigate(`/transformations?state=${encodeURIComponent(activeId)}`)}
            title={`Model or inspect transformations involving "${label}"`}
          >
            <GitCompareArrows size={13} />
            <span>Transformations</span>
          </button>
          <button
            type="button"
            className="target-state-merge"
            onClick={() => setMergingOpen(true)}
            title={`Merge "${label}" into the Current state`}
          >
            <GitMerge size={13} />
            <span>Merge into Current…</span>
          </button>
          <button
            type="button"
            className="target-state-return"
            onClick={() => switchTo('current')}
            title="Switch back to the default Current state"
          >
            <ArrowLeft size={13} />
            <span>Return to Current</span>
          </button>
        </div>
      </div>
      {mergingOpen && (
        <MergeStateDialog
          targetState={mergeTarget}
          onClose={() => setMergingOpen(false)}
          onMerged={() => {
            setMergingOpen(false);
            switchTo('current', true);
          }}
        />
      )}
    </>
  );
};

export const StateMenu = () => {
  const queryClient = useQueryClient();
  const { activeId, isTarget, label, states, switchTo } = useLandscapeStateController();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [mergeTarget, setMergeTarget] = useState<LandscapeState | null>(null);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');

  const targets = (states || []).filter((state) => !state.isCurrent);

  const selectState = (id: string, forceRefresh = false) => {
    setOpen(false);
    switchTo(id, forceRefresh);
  };

  useEffect(() => {
    if (!states) return;
    const latest = queryClient.getQueryData<LandscapeState[]>(['landscape-states']) ?? states;
    if (latest.some((state) => state.id === activeId)) return;
    switchTo('current');
    // The stored state was deleted. Return to Current once the list confirms it.
  }, [states, activeId, queryClient, switchTo]);

  const remember = (state: LandscapeState) => {
    queryClient.setQueryData<LandscapeState[]>(['landscape-states'], (existing) => {
      const rows = existing ?? [];
      return rows.some((item) => item.id === state.id)
        ? rows.map((item) => item.id === state.id ? state : item)
        : [...rows, state];
    });
  };

  const submitDraft = async () => {
    if (!draft || saving) return;
    setSaving(true);
    setFormError('');
    try {
      if (draft.mode === 'create') {
        const res = await fetch('/api/landscape-states', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ name: draft.name, sourceStateId: draft.sourceId }),
        });
        if (!res.ok) {
          setFormError(await errorMessage(res));
          return;
        }
        const created = await res.json() as LandscapeState;
        remember(created);
        setDraft(null);
        selectState(created.id);
      } else if (draft.id) {
        const res = await fetch(`/api/landscape-states/${draft.id}`, {
          method: 'PUT',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ name: draft.name }),
        });
        if (!res.ok) {
          setFormError(await errorMessage(res));
          return;
        }
        remember(await res.json() as LandscapeState);
        setDraft(null);
      }
    } finally {
      setSaving(false);
    }
  };

  const removeState = async (state: LandscapeState) => {
    if (!window.confirm(`Delete target state "${state.name}"? This removes that copy of the landscape.`)) return;
    const res = await fetch(`/api/landscape-states/${state.id}`, { method: 'DELETE' });
    if (!res.ok) return;
    queryClient.setQueryData<LandscapeState[]>(['landscape-states'], (existing) => (existing || []).filter((item) => item.id !== state.id));
    if (landscapeStateHeader() === state.id) selectState('current');
    setOpen(false);
  };

  const sourceName = (state: LandscapeState) => {
    if (!state.sourceStateId) return 'Future evolution';
    return `Evolved from ${states?.find((item) => item.id === state.sourceStateId)?.name || 'Current'}`;
  };

  return (
    <>
      <DropdownMenu.Root open={open} onOpenChange={setOpen} modal={false}>
        <DropdownMenu.Trigger
          className={`model-menu-trigger state-menu-trigger${isTarget ? ' state-target' : ' state-current'}`}
          aria-label={`Landscape state, ${isTarget ? `Target: ${label}` : label}`}
          title={isTarget ? `Target state: ${label}` : 'Current state (default)'}
        >
          <GitBranch size={15} />
          <span className={`state-trigger-badge${isTarget ? ' target' : ' current'}`}>
            {isTarget ? 'Target' : 'Current'}
          </span>
          {isTarget && <span className="header-label state-trigger-name">{label}</span>}
        </DropdownMenu.Trigger>
        <DropdownMenu.Portal>
          <DropdownMenu.Content className="model-menu-panel state-menu-panel" sideOffset={10} align="end" collisionPadding={12}>
            <DropdownMenu.Label className="state-menu-heading">Default state</DropdownMenu.Label>
            {(states || [{ id: 'current', name: 'Current', sourceStateId: null, isCurrent: true }]).filter((state) => state.isCurrent).map((state) => (
              <DropdownMenu.Item
                key={state.id}
                className={`model-menu-item${state.id === activeId ? ' active' : ''}`}
                onSelect={() => selectState(state.id)}
              >
                <span className="state-menu-row">
                  <span className="model-menu-copy">
                    <span className="model-menu-label">Current</span>
                    <span className="model-menu-desc">The landscape as it is now (default)</span>
                  </span>
                  <span className="state-menu-tag">Default</span>
                </span>
              </DropdownMenu.Item>
            ))}
            {targets.length > 0 && <DropdownMenu.Label className="state-menu-heading">Target states (future evolutions)</DropdownMenu.Label>}
            {targets.map((state) => (
              <DropdownMenu.Item
                key={state.id}
                className={`model-menu-item${state.id === activeId ? ' active' : ''}`}
                onSelect={() => selectState(state.id)}
              >
                <span className="state-menu-row">
                  <span className="model-menu-copy">
                    <span className="model-menu-label">{state.name}</span>
                    <span className="model-menu-desc">{sourceName(state)}</span>
                  </span>
                  <span className="state-menu-actions">
                    <button
                      type="button"
                      data-state-action="merge"
                      title="Merge into Current"
                      aria-label={`Merge ${state.name} into Current`}
                      onClick={(event) => {
                        event.preventDefault();
                        event.stopPropagation();
                        setOpen(false);
                        setMergeTarget(state);
                      }}
                    >
                      <GitMerge size={13} />
                    </button>
                    <button
                      type="button"
                      data-state-action="rename"
                      title="Rename"
                      aria-label={`Rename ${state.name}`}
                      onClick={(event) => {
                        event.preventDefault();
                        event.stopPropagation();
                        setOpen(false);
                        setFormError('');
                        setDraft({ mode: 'rename', id: state.id, name: state.name, sourceId: state.sourceStateId || 'current' });
                      }}
                    >
                      <Pencil size={13} />
                    </button>
                    <button
                      type="button"
                      data-state-action="delete"
                      title="Delete"
                      aria-label={`Delete ${state.name}`}
                      onClick={(event) => {
                        event.preventDefault();
                        event.stopPropagation();
                        void removeState(state);
                      }}
                    >
                      <Trash2 size={13} />
                    </button>
                  </span>
                </span>
              </DropdownMenu.Item>
            ))}
            <DropdownMenu.Separator className="state-menu-separator" />
            <DropdownMenu.Item
              className="model-menu-item"
              onSelect={() => {
                setFormError('');
                setDraft({ mode: 'create', name: '', sourceId: activeId || 'current' });
              }}
            >
              <span className="model-menu-icon"><Plus size={16} /></span>
              <span className="model-menu-copy">
                <span className="model-menu-label">New target state…</span>
                <span className="model-menu-desc">Evolve a future state from an existing landscape</span>
              </span>
            </DropdownMenu.Item>
          </DropdownMenu.Content>
        </DropdownMenu.Portal>
      </DropdownMenu.Root>
      {draft && (
        <div className="state-dialog-backdrop" onMouseDown={() => { if (!saving) setDraft(null); }}>
          <form
            className="state-dialog"
            onMouseDown={(event) => event.stopPropagation()}
            onSubmit={(event) => {
              event.preventDefault();
              void submitDraft();
            }}
          >
            <h2>{draft.mode === 'create' ? 'New target state' : 'Rename target state'}</h2>
            <p>{draft.mode === 'create' ? 'Creates an isolated future evolution from the selected state. Edits in the target state never modify Current.' : 'The copy itself does not change.'}</p>
            <label className="label" htmlFor="landscape-state-name">Name</label>
            <input
              id="landscape-state-name"
              value={draft.name}
              autoFocus
              maxLength={80}
              disabled={saving}
              onChange={(event) => setDraft({ ...draft, name: event.target.value })}
            />
            {draft.mode === 'create' && (
              <>
                <label className="label" htmlFor="landscape-state-source">Evolve from</label>
                <select
                  id="landscape-state-source"
                  value={draft.sourceId}
                  disabled={saving}
                  onChange={(event) => setDraft({ ...draft, sourceId: event.target.value })}
                >
                  {(states || []).map((state) => (
                    <option key={state.id} value={state.id}>{state.isCurrent ? `${state.name} (default)` : state.name}</option>
                  ))}
                </select>
              </>
            )}
            {formError && <p className="state-dialog-error">{formError}</p>}
            <div className="state-dialog-actions">
              <button type="button" className="secondary" disabled={saving} onClick={() => setDraft(null)}>Cancel</button>
              <button type="submit" className="primary" disabled={saving || !draft.name.trim()}>
                {saving
                  ? (draft.mode === 'create' ? 'Copying the landscape…' : 'Saving…')
                  : (draft.mode === 'create' ? 'Create target state' : 'Save')}
              </button>
            </div>
          </form>
        </div>
      )}
      {mergeTarget && (
        <MergeStateDialog
          targetState={mergeTarget}
          onClose={() => setMergeTarget(null)}
          onMerged={() => {
            setMergeTarget(null);
            selectState('current', true);
          }}
        />
      )}
    </>
  );
};
