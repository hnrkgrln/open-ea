import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Edit2, Trash2, X } from 'lucide-react';

export type TableSelection = {
  ids: string[];
  count: number;
  total: number;
  all: boolean;
  some: boolean;
  has: (id: string) => boolean;
  toggle: (id: string) => void;
  toggleAll: () => void;
  clear: () => void;
  forget: (ids: readonly string[]) => void;
};

type TreeNode = { id: string; children?: TreeNode[] };

export function collectTreeIds(nodes: readonly TreeNode[]): string[] {
  const ids: string[] = [];
  const walk = (list: readonly TreeNode[]) => {
    for (const node of list) {
      ids.push(node.id);
      if (node.children && node.children.length > 0) walk(node.children);
    }
  };
  walk(nodes);
  return ids;
}

// Selection follows the rows on screen. A filter change drops ids that are
// no longer visible, so Delete cannot reach rows the table is hiding.
export function useTableSelection(visibleIds: readonly string[]): TableSelection {
  const [picked, setPicked] = useState<ReadonlySet<string>>(() => new Set());
  const visible = useMemo(() => new Set(visibleIds), [visibleIds]);

  useEffect(() => {
    setPicked((prev) => {
      for (const id of prev) {
        if (!visible.has(id)) {
          const next = new Set<string>();
          for (const kept of prev) if (visible.has(kept)) next.add(kept);
          return next;
        }
      }
      return prev;
    });
  }, [visible]);

  const ids = useMemo(() => visibleIds.filter((id) => picked.has(id)), [visibleIds, picked]);

  const toggle = useCallback((id: string) => {
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const toggleAll = useCallback(() => {
    setPicked((prev) => {
      if (visibleIds.length === 0) return prev;
      const next = new Set(prev);
      const every = visibleIds.every((id) => next.has(id));
      if (every) for (const id of visibleIds) next.delete(id);
      else for (const id of visibleIds) next.add(id);
      return next;
    });
  }, [visibleIds]);

  const clear = useCallback(() => setPicked(new Set()), []);

  const forget = useCallback((drop: readonly string[]) => {
    if (drop.length === 0) return;
    setPicked((prev) => {
      const next = new Set(prev);
      for (const id of drop) next.delete(id);
      return next;
    });
  }, []);

  return {
    ids,
    count: ids.length,
    total: visibleIds.length,
    all: visibleIds.length > 0 && ids.length === visibleIds.length,
    some: ids.length > 0 && ids.length < visibleIds.length,
    has: (id: string) => picked.has(id) && visible.has(id),
    toggle,
    toggleAll,
    clear,
    forget,
  };
}

function SelectionCheck({
  checked,
  indeterminate = false,
  label,
  disabled = false,
  onChange,
}: {
  checked: boolean;
  indeterminate?: boolean;
  label: string;
  disabled?: boolean;
  onChange: () => void;
}) {
  return (
    <input
      ref={(node) => {
        if (node) node.indeterminate = indeterminate && !checked;
      }}
      type="checkbox"
      className="table-select-check"
      checked={checked}
      disabled={disabled}
      aria-label={label}
      onClick={(event) => event.stopPropagation()}
      onChange={() => onChange()}
    />
  );
}

function toggleFromCell(event: React.MouseEvent<HTMLTableCellElement>, toggle: () => void) {
  event.stopPropagation();
  if (event.target === event.currentTarget) toggle();
}

export function SelectionHeader({ selection, style }: { selection: TableSelection; style?: React.CSSProperties }) {
  return (
    <th className="table-select-cell" style={style} onClick={(event) => toggleFromCell(event, selection.toggleAll)}>
      <SelectionCheck
        checked={selection.all}
        indeterminate={selection.some}
        disabled={selection.total === 0}
        label="Select all rows"
        onChange={selection.toggleAll}
      />
    </th>
  );
}

export function SelectionRowCheck({ selection, id, label }: { selection: TableSelection; id: string; label: string }) {
  return (
    <td className="table-select-cell" onClick={(event) => toggleFromCell(event, () => selection.toggle(id))}>
      <SelectionCheck checked={selection.has(id)} label={`Select ${label}`} onChange={() => selection.toggle(id)} />
    </td>
  );
}

async function eachLimited(ids: readonly string[], limit: number, job: (id: string) => Promise<void>) {
  let index = 0;
  const workers = Array.from({ length: Math.min(limit, ids.length) }, async () => {
    while (index < ids.length) {
      const id = ids[index];
      index += 1;
      await job(id);
    }
  });
  await Promise.all(workers);
}

export function SelectionBar({
  selection,
  singular,
  plural,
  detail,
  deletePath,
  editPath,
  onRefresh,
}: {
  selection: TableSelection;
  singular: string;
  plural: string;
  detail?: (count: number) => string;
  deletePath: (id: string) => string;
  editPath: (id: string) => string;
  onRefresh: () => void;
}) {
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  if (selection.count === 0) return null;

  const label = selection.count === 1 ? `1 ${singular}` : `${selection.count} ${plural}`;
  const extra = detail?.(selection.count);
  const message = extra ? `Delete ${label}? ${extra}` : `Delete ${label}?`;

  const remove = async () => {
    if (busy) return;
    const targets = [...selection.ids];
    if (targets.length === 0) return;
    if (!window.confirm(message)) return;
    setBusy(true);
    const gone: string[] = [];
    let failed = 0;
    try {
      await eachLimited(targets, 6, async (id) => {
        try {
          const res = await fetch(deletePath(id), { method: 'DELETE' });
          if (res.ok || res.status === 404) gone.push(id);
          else failed += 1;
        } catch {
          failed += 1;
        }
      });
      selection.forget(gone);
      onRefresh();
      if (failed > 0) {
        window.alert(failed === 1 ? '1 row could not be deleted.' : `${failed} rows could not be deleted.`);
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="table-selection-bar" role="toolbar" aria-label="Selection actions">
      <span className="table-selection-count">{label} selected</span>
      {selection.count === 1 && (
        <button type="button" disabled={busy} onClick={() => navigate(editPath(selection.ids[0]))}>
          <Edit2 size={14} /> Edit
        </button>
      )}
      <button type="button" className="table-selection-delete" disabled={busy} onClick={() => void remove()}>
        <Trash2 size={14} /> {busy ? 'Deleting…' : 'Delete'}
      </button>
      <button type="button" disabled={busy} onClick={selection.clear}>
        <X size={14} /> Clear
      </button>
    </div>
  );
}
