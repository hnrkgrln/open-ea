import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Boxes, ChevronDown, ChevronRight, ChevronsDown, ChevronsUp, Edit2, LayoutGrid, List, Plus, PlusCircle, Target, Trash2 } from 'lucide-react';
import { useLocalStorage } from '../App';
import { SearchInput } from './FilterControls';
import { SelectionBar, SelectionHeader, SelectionRowCheck, collectTreeIds, useTableSelection, type TableSelection } from './TableSelection';

interface RequiredCapability {
  id: string;
  name: string;
}

export interface StrategicGoal {
  id: string;
  name: string;
  description?: string | null;
  parentId?: string | null;
  capabilities?: RequiredCapability[];
  children?: StrategicGoal[];
}

const byName = (a: { name: string }, b: { name: string }) => a.name.localeCompare(b.name, undefined, { numeric: true });

const requiredNames = (goal: StrategicGoal) => [...(goal.capabilities || [])].sort(byName);

const buildTree = (goals: StrategicGoal[]) => {
  const map = new Map<string, StrategicGoal>();
  const roots: StrategicGoal[] = [];
  goals.forEach((goal) => map.set(goal.id, { ...goal, children: [] }));
  map.forEach((goal) => {
    const parentId = goal.parentId || null;
    if (parentId && map.has(parentId)) map.get(parentId)!.children!.push(goal);
    else roots.push(goal);
  });
  const sortTree = (nodes: StrategicGoal[]) => {
    nodes.sort(byName);
    nodes.forEach((node) => sortTree(node.children || []));
  };
  sortTree(roots);
  return roots;
};

const matchesQuery = (goal: StrategicGoal, query: string) =>
  goal.name.toLowerCase().includes(query) ||
  (goal.description || '').toLowerCase().includes(query) ||
  (goal.capabilities || []).some((capability) => capability.name.toLowerCase().includes(query));

const confirmDelete = async (goal: StrategicGoal, onRefresh: () => void) => {
  const hasChildren = (goal.children || []).length > 0;
  const message = hasChildren ? `Delete "${goal.name}" and its sub-goals?` : `Delete "${goal.name}"?`;
  if (!confirm(message)) return;
  await fetch(`/api/strategic-goals/${goal.id}`, { method: 'DELETE' });
  onRefresh();
};

const GoalNode = ({ goal, onRefresh, depth = 0, forceExpand }: { goal: StrategicGoal; onRefresh: () => void; depth?: number; forceExpand?: { state: boolean; timestamp: number } }) => {
  const navigate = useNavigate();
  const [expanded, setExpanded] = useState(true);
  const hasChildren = (goal.children || []).length > 0;
  const required = requiredNames(goal);

  useEffect(() => {
    if (forceExpand && forceExpand.timestamp > 0) setExpanded(forceExpand.state);
  }, [forceExpand]);

  return (
    <div style={{ width: '100%' }}>
      <div className="card" style={{
        padding: '1.25rem',
        display: 'flex',
        flexDirection: 'column',
        gap: '0.85rem',
        borderLeft: '4px solid #5f3dc4',
        background: depth % 2 === 0 ? 'var(--card)' : 'rgba(0,0,0,0.02)',
        height: 'auto',
        boxShadow: depth === 0 ? '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)' : 'none',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '0.75rem' }}>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.65rem', alignItems: 'center', minWidth: 0 }}>
            {hasChildren && (
              <button type="button" onClick={() => setExpanded(!expanded)} style={{ border: 'none', background: 'none', padding: 0, height: 'auto', display: 'flex', alignItems: 'center' }} title={expanded ? 'Collapse' : 'Expand'}>
                {expanded ? <ChevronDown size={20} /> : <ChevronRight size={20} />}
              </button>
            )}
            <span onClick={() => navigate(`/strategic-goals/${goal.id}`)} style={{ fontWeight: 800, fontSize: depth === 0 ? '1.125rem' : '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
              <Target size={depth === 0 ? 20 : 16} style={{ color: '#5f3dc4' }} /> {goal.name}
            </span>
          </div>
          <div style={{ display: 'flex', gap: '0.5rem', flexShrink: 0 }}>
            <button type="button" onClick={() => navigate(`/strategic-goals/new?parentId=${goal.id}`)} className="secondary" style={{ height: '2rem', padding: '0 0.6rem' }} title="Add sub-goal"><Plus size={16} /></button>
            <button type="button" onClick={() => navigate(`/strategic-goals/${goal.id}/edit`)} className="secondary" style={{ height: '2rem', width: '2rem', padding: 0 }} title="Edit"><Edit2 size={16} /></button>
            <button type="button" onClick={() => confirmDelete(goal, onRefresh)} className="secondary" style={{ height: '2rem', width: '2rem', padding: 0, color: 'var(--destructive)' }} title="Delete"><Trash2 size={16} /></button>
          </div>
        </div>
        {goal.description && <p style={{ fontSize: '0.875rem', color: 'var(--muted-foreground)', margin: 0, maxWidth: '800px' }}>{goal.description}</p>}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.35rem' }}>
          {required.length > 0 ? required.map((capability) => (
            <span key={capability.id} style={{ fontSize: '0.65rem', fontWeight: 700, padding: '0.15rem 0.4rem', borderRadius: '4px', background: 'var(--accent)', display: 'inline-flex', alignItems: 'center', gap: '0.25rem' }}>
              <Boxes size={10} /> {capability.name}
            </span>
          )) : (
            <span style={{ fontSize: '0.7rem', color: 'var(--muted-foreground)', fontStyle: 'italic' }}>Requires no capabilities yet</span>
          )}
        </div>
        {expanded && hasChildren && (
          <div style={{ marginTop: '0.25rem', paddingLeft: '1rem', borderLeft: '1px dashed var(--border)', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            {goal.children!.map((child) => <GoalNode key={child.id} goal={child} onRefresh={onRefresh} depth={depth + 1} forceExpand={forceExpand} />)}
          </div>
        )}
      </div>
    </div>
  );
};

const GoalListRow = ({ goal, onRefresh, selection, depth = 0 }: { goal: StrategicGoal; onRefresh: () => void; selection: TableSelection; depth?: number }) => {
  const navigate = useNavigate();
  const required = requiredNames(goal);
  return (
    <>
      <tr className={selection.has(goal.id) ? 'row-hover table-row-selected' : 'row-hover'} style={{ borderBottom: '1px solid var(--border)', cursor: 'pointer' }} onClick={() => navigate(`/strategic-goals/${goal.id}`)}>
        <SelectionRowCheck selection={selection} id={goal.id} label={goal.name} />
        <td style={{ padding: '0.6rem 1rem', fontWeight: 700, fontSize: '0.85rem', paddingLeft: `${0.75 + depth * 1.5}rem` }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem' }}>
            {depth > 0 && <ChevronRight size={12} style={{ color: 'var(--muted-foreground)' }} />}
            <Target size={12} style={{ color: '#5f3dc4' }} /> {goal.name}
          </span>
        </td>
        <td style={{ padding: '0.6rem 1rem', width: '110px' }} onClick={(event) => event.stopPropagation()}>
          <div style={{ display: 'flex', gap: '0.2rem' }}>
            <button type="button" onClick={() => navigate(`/strategic-goals/new?parentId=${goal.id}`)} className="secondary" style={{ height: '1.6rem', padding: '0 0.5rem' }} title="Add sub-goal"><Plus size={12} /></button>
            <button type="button" onClick={() => navigate(`/strategic-goals/${goal.id}/edit`)} className="secondary" style={{ height: '1.6rem', width: '1.6rem', padding: 0 }} title="Edit"><Edit2 size={12} /></button>
            <button type="button" onClick={() => confirmDelete(goal, onRefresh)} className="secondary" style={{ height: '1.6rem', width: '1.6rem', padding: 0, color: 'var(--destructive)' }} title="Delete"><Trash2 size={12} /></button>
          </div>
        </td>
        <td style={{ padding: '0.6rem 1rem', fontSize: '0.75rem' }}>
          {required.length > 0 ? required.map((capability) => capability.name).join(', ') : <span style={{ color: 'var(--muted-foreground)' }}>—</span>}
        </td>
        <td style={{ padding: '0.6rem 1rem', fontSize: '0.75rem', color: 'var(--muted-foreground)' }}>{goal.description || '—'}</td>
      </tr>
      {(goal.children || []).map((child) => <GoalListRow key={child.id} goal={child} onRefresh={onRefresh} selection={selection} depth={depth + 1} />)}
    </>
  );
};

export const StrategicGoalsView = ({ goals, onRefresh }: { goals: StrategicGoal[]; onRefresh: () => void }) => {
  const navigate = useNavigate();
  const [viewMode, setViewMode] = useLocalStorage<'grid' | 'list'>('openea_strategic_goals_view', 'grid');
  const [search, setSearch] = useLocalStorage('openea_strategic_goals_search', '');
  const [forceExpand, setForceExpand] = useState({ state: true, timestamp: 0 });
  const query = search.trim().toLowerCase();
  const rows = Array.isArray(goals) ? goals : [];

  const visible = useMemo(() => {
    if (!query) return buildTree(rows);
    const byId = new Map(rows.map((goal) => [goal.id, goal]));
    const keep = new Set<string>();
    const addDescendants = (id: string) => {
      rows.filter((goal) => goal.parentId === id).forEach((child) => {
        if (keep.has(child.id)) return;
        keep.add(child.id);
        addDescendants(child.id);
      });
    };
    rows.filter((goal) => matchesQuery(goal, query)).forEach((match) => {
      let cursor: StrategicGoal | undefined = match;
      while (cursor && !keep.has(cursor.id)) {
        keep.add(cursor.id);
        cursor = cursor.parentId ? byId.get(cursor.parentId) : undefined;
      }
      addDescendants(match.id);
    });
    return buildTree(rows.filter((goal) => keep.has(goal.id)));
  }, [rows, query]);

  const visibleGoalIds = useMemo(() => collectTreeIds(visible), [visible]);
  const selection = useTableSelection(visibleGoalIds);

  return (
    <div style={{ width: '100%', minWidth: 0, paddingBottom: '3rem' }}>
      <div style={{ marginBottom: '1.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', gap: '1rem', flexWrap: 'wrap' }}>
        <div>
          <h1 style={{ fontSize: '1.25rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '0.6rem' }}><Target size={24} /> Strategic Goals</h1>
          <p style={{ color: 'var(--muted-foreground)', fontSize: '0.8rem' }}>Outcomes the business is aiming for. A goal can contain sub-goals, and each one requires capabilities.</p>
        </div>
        <div style={{ display: 'flex', gap: '0.65rem', alignItems: 'center', flexWrap: 'wrap' }}>
          <div style={{ width: '220px' }}>
            <SearchInput value={search} onChange={setSearch} placeholder="Quick filter" ariaLabel="Quick filter" />
          </div>
          {viewMode === 'grid' && (
            <button type="button" onClick={() => setForceExpand((prev) => ({ state: !prev.state, timestamp: Date.now() }))} className="secondary" style={{ height: '1.8rem', padding: '0 0.7rem', display: 'flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.8rem' }}>
              {forceExpand.state ? <ChevronsUp size={14} /> : <ChevronsDown size={14} />}
              {forceExpand.state ? 'Collapse' : 'Expand'}
            </button>
          )}
          <div style={{ display: 'flex', background: 'var(--secondary)', padding: '0.15rem', borderRadius: 'var(--radius)', gap: '0.15rem' }}>
            <button type="button" onClick={() => setViewMode('grid')} style={{ height: '1.8rem', padding: '0 0.6rem', border: 'none', background: viewMode === 'grid' ? 'var(--background)' : 'transparent', boxShadow: viewMode === 'grid' ? '0 1px 2px rgba(0,0,0,0.1)' : 'none', cursor: 'pointer' }} title="Cards"><LayoutGrid size={14} /></button>
            <button type="button" onClick={() => setViewMode('list')} style={{ height: '1.8rem', padding: '0 0.6rem', border: 'none', background: viewMode === 'list' ? 'var(--background)' : 'transparent', boxShadow: viewMode === 'list' ? '0 1px 2px rgba(0,0,0,0.1)' : 'none', cursor: 'pointer' }} title="List"><List size={14} /></button>
          </div>
          <button type="button" onClick={() => navigate('/strategic-goals/new')} className="primary" style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', height: '1.8rem', fontSize: '0.8rem' }}>
            <PlusCircle size={14} />
            New
          </button>
        </div>
      </div>

      {visible.length === 0 ? (
        <div className="card" style={{ padding: '2.5rem', textAlign: 'center', color: 'var(--muted-foreground)' }}>
          {query ? 'No strategic goals match the filter.' : 'No strategic goals yet.'}
        </div>
      ) : viewMode === 'grid' ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {visible.map((goal) => <GoalNode key={goal.id} goal={goal} onRefresh={onRefresh} forceExpand={forceExpand} />)}
        </div>
      ) : (
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          <SelectionBar
            selection={selection}
            singular="strategic goal"
            plural="strategic goals"
            detail={() => 'Sub-goals are removed with a selected parent.'}
            deletePath={(id) => `/api/strategic-goals/${id}`}
            editPath={(id) => `/strategic-goals/${id}/edit`}
            onRefresh={onRefresh}
          />
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border)', background: 'var(--muted)' }}>
                <SelectionHeader selection={selection} />
                <th style={{ padding: '0.6rem 1rem', fontSize: '0.75rem' }}>Name</th>
                <th style={{ padding: '0.6rem 1rem', fontSize: '0.75rem' }}>Actions</th>
                <th style={{ padding: '0.6rem 1rem', fontSize: '0.75rem' }}>Requires</th>
                <th style={{ padding: '0.6rem 1rem', fontSize: '0.75rem' }}>Description</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((goal) => <GoalListRow key={goal.id} goal={goal} onRefresh={onRefresh} selection={selection} />)}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};
