import { useEffect, useRef } from 'react';
import type { CSSProperties } from 'react';
import { useStoreApi, type Node } from 'reactflow';

export const REVEAL_CLASS = 'diagram-box-revealed';

type Snap = {
  width: number;
  x: number;
  zIndex: CSSProperties['zIndex'];
  overflow: CSSProperties['overflow'];
  className?: string;
};

type Placement = {
  id: string;
  x: number;
  width: number;
  reveal: boolean;
  z: number;
};

type SetNodes = (update: (nodes: Node[]) => Node[]) => void;

const revealRef: { current: { open: (placements: Placement[]) => void; close: (rootId: string) => void } | null } = { current: null };

// The open container. Pointer moves onto a child are not a leave: those nodes are siblings in the DOM, not descendants.
let openRoot: string | null = null;

function textShortfall(el: HTMLElement): number {
  const cs = getComputedStyle(el);
  const probe = document.createElement('span');
  probe.textContent = el.textContent ?? '';
  probe.style.position = 'fixed';
  probe.style.left = '-9999px';
  probe.style.top = '0';
  probe.style.visibility = 'hidden';
  probe.style.whiteSpace = 'nowrap';
  probe.style.pointerEvents = 'none';
  probe.style.font = cs.font;
  probe.style.letterSpacing = cs.letterSpacing;
  probe.style.fontSynthesis = cs.fontSynthesis;
  document.body.appendChild(probe);
  const natural = probe.getBoundingClientRect().width;
  probe.remove();
  return natural - el.clientWidth;
}

function numericWidth(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const parsed = parseFloat(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function snapOf(node: Node): Snap | undefined {
  return (node.data as { revealSnap?: Snap } | undefined)?.revealSnap;
}

function baseGeom(node: Node): { x: number; y: number; width: number } | null {
  const snap = snapOf(node);
  const width = snap?.width ?? numericWidth(node.style?.width);
  if (width == null) return null;
  return { x: snap?.x ?? node.position.x, y: node.position.y, width };
}

function nodeElement(id: string): HTMLElement | null {
  return document.querySelector(`.react-flow__node[data-id="${CSS.escape(id)}"]`);
}

function measuredBox(id: string, base: number): { width: number; reveal: boolean } {
  const el = nodeElement(id);
  if (!el) return { width: base, reveal: false };
  // A box that is already open keeps its width. Measuring the stretched label would shrink it.
  if (el.classList.contains(REVEAL_CLASS)) {
    const current = parseFloat(el.style.width);
    return { width: Number.isFinite(current) ? current : base, reveal: true };
  }
  const text = el.querySelector('[data-box-label]') as HTMLElement | null;
  if (!text) return { width: base, reveal: false };
  const shortfall = textShortfall(text);
  if (shortfall <= 0.5) return { width: base, reveal: false };
  return { width: Math.ceil(base + shortfall + 8), reveal: true };
}

function childrenByParent(nodes: Node[]): Map<string, Node[]> {
  const map = new Map<string, Node[]>();
  for (const node of nodes) {
    if (!node.parentNode) continue;
    const list = map.get(node.parentNode);
    if (list) list.push(node);
    else map.set(node.parentNode, [node]);
  }
  return map;
}

function containsNode(nodes: Node[], rootId: string, nodeId: string): boolean {
  if (nodeId === rootId) return true;
  const byId = new Map(nodes.map((node) => [node.id, node]));
  let current: string | undefined = nodeId;
  const seen = new Set<string>();
  while (current && !seen.has(current)) {
    if (current === rootId) return true;
    seen.add(current);
    current = byId.get(current)?.parentNode;
  }
  return false;
}

// Lay the hovered box and everything inside it out from their original sizes.
// Truncated names widen, siblings in a row shift right, and the container grows to cover them.
function planOpen(nodes: Node[], rootId: string): Placement[] | null {
  const byId = new Map(nodes.map((node) => [node.id, node]));
  if (!byId.has(rootId)) return null;
  const childMap = childrenByParent(nodes);
  const placed = new Map<string, Placement>();
  const seen = new Set<string>();

  const place = (id: string, depth: number) => {
    if (seen.has(id)) return;
    const node = byId.get(id);
    const base = node ? baseGeom(node) : null;
    if (!node || !base) return;
    seen.add(id);
    const kids = (childMap.get(id) ?? []).filter((child) => baseGeom(child));
    for (const kid of kids) place(kid.id, depth + 1);
    const own = measuredBox(id, base.width);
    const rows = new Map<number, Node[]>();
    for (const kid of kids) {
      const geom = baseGeom(kid)!;
      let key = geom.y;
      for (const existing of rows.keys()) {
        if (Math.abs(existing - geom.y) <= 4) {
          key = existing;
          break;
        }
      }
      const row = rows.get(key);
      if (row) row.push(kid);
      else rows.set(key, [kid]);
    }
    let contentRight = 0;
    let rowIndex = 0;
    for (const row of rows.values()) {
      row.sort((a, b) => baseGeom(a)!.x - baseGeom(b)!.x);
      const last = baseGeom(row[row.length - 1])!;
      const rightInset = Math.max(0, base.width - (last.x + last.width));
      let cursor = baseGeom(row[0])!.x;
      for (let i = 0; i < row.length; i++) {
        const child = row[i];
        const childBase = baseGeom(child)!;
        if (i > 0) {
          const prev = baseGeom(row[i - 1])!;
          cursor += Math.max(0, childBase.x - (prev.x + prev.width));
        }
        const existing = placed.get(child.id);
        const childWidth = existing?.width ?? childBase.width;
        placed.set(child.id, {
          id: child.id,
          x: cursor,
          width: childWidth,
          reveal: existing?.reveal ?? false,
          z: 10000 + (depth + 1) * 200 + rowIndex * 30 + i,
        });
        cursor += childWidth;
      }
      contentRight = Math.max(contentRight, cursor + rightInset);
      rowIndex += 1;
    }
    placed.set(id, {
      id,
      x: base.x,
      width: kids.length ? Math.max(own.width, contentRight) : own.width,
      reveal: own.reveal,
      z: 10000 + depth * 200,
    });
  };

  place(rootId, 0);
  const placements = [...placed.values()];
  const changed = placements.some((placement) => {
    const node = byId.get(placement.id);
    const base = node ? baseGeom(node) : null;
    if (!base) return false;
    return placement.reveal || Math.abs(placement.width - base.width) > 0.5 || Math.abs(placement.x - base.x) > 0.5;
  });
  return changed ? placements : null;
}

function withClass(className: string | undefined): string {
  if (!className) return REVEAL_CLASS;
  return className.split(' ').includes(REVEAL_CLASS) ? className : `${className} ${REVEAL_CLASS}`;
}

// The saved size lives on the node. A ref mutated inside setNodes is wrong in
// development: React runs the updater twice, the discarded pass eats the ref,
// and the pass that commits leaves the box expanded.
function withOpen(nodes: Node[], placements: Placement[]): Node[] {
  const byId = new Map(placements.map((placement) => [placement.id, placement]));
  let changed = false;
  const next = nodes.map((node) => {
    const placement = byId.get(node.id);
    if (!placement) return node;
    const existing = snapOf(node);
    const snap: Snap = existing ?? {
      width: numericWidth(node.style?.width) ?? placement.width,
      x: node.position.x,
      zIndex: node.style?.zIndex,
      overflow: node.style?.overflow,
      className: node.className,
    };
    const className = placement.reveal ? withClass(node.className) : node.className;
    const overflow = placement.reveal ? 'visible' as const : node.style?.overflow;
    const same = !!existing
      && node.position.x === placement.x
      && node.style?.width === placement.width
      && node.style?.zIndex === placement.z
      && node.className === className
      && node.style?.overflow === overflow;
    if (same) return node;
    changed = true;
    return {
      ...node,
      className,
      position: node.position.x === placement.x ? node.position : { ...node.position, x: placement.x },
      data: { ...(node.data as object), revealSnap: snap },
      style: { ...node.style, width: placement.width, zIndex: placement.z, overflow },
    };
  });
  return changed ? next : nodes;
}

function subtreeIds(nodes: Node[], rootId: string): Set<string> {
  const childMap = childrenByParent(nodes);
  const ids = new Set<string>();
  const stack = [rootId];
  while (stack.length) {
    const id = stack.pop()!;
    if (ids.has(id)) continue;
    ids.add(id);
    for (const child of childMap.get(id) ?? []) stack.push(child.id);
  }
  return ids;
}

function withClose(nodes: Node[], rootId: string): Node[] {
  const closing = subtreeIds(nodes, rootId);
  let changed = false;
  const next = nodes.map((node) => {
    if (!closing.has(node.id)) return node;
    const snap = snapOf(node);
    if (!snap) return node;
    changed = true;
    const data = { ...(node.data as object) };
    delete (data as { revealSnap?: Snap }).revealSnap;
    return {
      ...node,
      data,
      className: snap.className,
      position: node.position.x === snap.x ? node.position : { ...node.position, x: snap.x },
      style: { ...node.style, width: snap.width, zIndex: snap.zIndex, overflow: snap.overflow },
    };
  });
  return changed ? next : nodes;
}

export function revealWidth(node: Node): number | undefined {
  return snapOf(node)?.width;
}

export function useDiagramReveal(setNodes: SetNodes) {
  revealRef.current = {
    open: (placements) => setNodes((current) => withOpen(current, placements)),
    close: (rootId) => setNodes((current) => withClose(current, rootId)),
  };
}

function nodeIdFromTarget(target: EventTarget | null): string | null {
  const element = target instanceof Element ? target : null;
  return element?.closest('.react-flow__node')?.getAttribute('data-id') ?? null;
}

function nodeIdAt(x: number, y: number): string | null {
  const hit = document.elementFromPoint(x, y);
  return hit?.closest('.react-flow__node')?.getAttribute('data-id') ?? null;
}

export function BoxLabel({ id, name, style }: { id: string; name: string; style: CSSProperties }) {
  const ref = useRef<HTMLSpanElement>(null);
  const store = useStoreApi();
  useEffect(() => {
    const text = ref.current;
    const node = text?.closest('.react-flow__node') as HTMLElement | null;
    if (!text || !node) return;
    const host = getComputedStyle(node).pointerEvents === 'none'
      ? ((text.closest('[data-box-row]') as HTMLElement | null) || text)
      : node;
    let hovering = false;
    let frame = 0;
    const widen = () => {
      if (!hovering || openRoot !== id) return;
      const placements = planOpen(store.getState().getNodes(), id);
      if (!placements) return;
      revealRef.current?.open(placements);
    };
    const reveal = () => {
      const nodes = store.getState().getNodes();
      if (openRoot && openRoot !== id && containsNode(nodes, openRoot, id)) {
        hovering = true;
        return;
      }
      openRoot = id;
      hovering = true;
      widen();
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => widen());
    };
    const hide = (event: MouseEvent) => {
      const nodes = store.getState().getNodes();
      const related = nodeIdFromTarget(event.relatedTarget);
      const under = nodeIdAt(event.clientX, event.clientY);
      const nextId = [related, under].find((candidate) => candidate && openRoot && containsNode(nodes, openRoot, candidate)) ?? related ?? under;
      if (openRoot && nextId && containsNode(nodes, openRoot, nextId)) return;
      const root = openRoot && containsNode(nodes, openRoot, id) ? openRoot : id;
      if (openRoot === root) openRoot = null;
      hovering = false;
      cancelAnimationFrame(frame);
      revealRef.current?.close(root);
    };
    host.addEventListener('mouseenter', reveal);
    host.addEventListener('mouseleave', hide);
    return () => {
      hovering = false;
      cancelAnimationFrame(frame);
      host.removeEventListener('mouseenter', reveal);
      host.removeEventListener('mouseleave', hide);
      if (openRoot === id) openRoot = null;
    };
  }, [id, store]);
  return <span ref={ref} data-box-label="" style={style}>{name}</span>;
}
