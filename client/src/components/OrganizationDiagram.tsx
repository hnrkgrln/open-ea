import { useEffect, useMemo, useRef } from 'react';
import ReactFlow, {
  Background,
  Controls,
  Handle,
  Position,
  ReactFlowProvider,
  useEdgesState,
  useNodesState,
  useNodesInitialized,
  useReactFlow,
  type Node,
  type Edge,
  type NodeProps,
} from 'reactflow';
import 'reactflow/dist/style.css';
import dagre from '@dagrejs/dagre';
import { useNavigate } from 'react-router-dom';
import { Layers } from 'lucide-react';

interface Organization {
  id: string;
  name: string;
  type?: string;
  parentId?: string | null;
}

interface PicklistOption { value: string; label: string; color?: string; }
interface Picklist { name: string; options: PicklistOption[]; }

const NODE_W = 220;
const NODE_H = 70;
// Roots render larger and bolder so the top of the hierarchy stands out.
const ROOT_NODE_W = 300;
const ROOT_NODE_H = 96;

// Each root gets a base hue from this palette. Descendants derive their colors
// from their parent — same hue family, small offsets between siblings, and a
// lightness shift per depth — so the diagram visually highlights inheritance
// while still giving every node its own shade.
// Ordered for maximum perceptual contrast between adjacent roots — when there
// are only 2-4 root orgs (the common case), the most dissimilar hues are used.
const ROOT_PALETTE = [
  '#fa5252', // red
  '#228be6', // blue
  '#fcc419', // yellow
  '#51cf66', // green
  '#be4bdb', // magenta
  '#ff922b', // orange
  '#15aabf', // cyan
  '#7950f2', // violet
  '#20c997', // teal
  '#4c6ef5', // indigo
];

// Per-level hue spread: siblings fan out within ±SIBLING_HUE_SPREAD/2 around
// their parent's hue. The fan shrinks with depth (multiplied by SHRINK^depth)
// so the family identity holds, but more gradually than 1/depth.
const SIBLING_HUE_SPREAD = 90; // degrees fan across siblings at depth 1
const SHRINK_PER_DEPTH = 0.7;  // 70% of the previous level's spread
const DEPTH_LIGHTEN = 9;       // % L per level
const DEPTH_DESATURATE = 3;    // % S per level
const MAX_LIGHTNESS = 75;
const MIN_SATURATION = 35;

function hexToHsl(hex: string): [number, number, number] {
  const m = hex.replace('#', '');
  const r = parseInt(m.substring(0, 2), 16) / 255;
  const g = parseInt(m.substring(2, 4), 16) / 255;
  const b = parseInt(m.substring(4, 6), 16) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  let h = 0;
  let s = 0;
  const l = (max + min) / 2;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    if (max === r) h = (g - b) / d + (g < b ? 6 : 0);
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60;
  }
  return [h, s * 100, l * 100];
}

function hslToHex(h: number, s: number, l: number): string {
  const sN = s / 100;
  const lN = l / 100;
  const c = (1 - Math.abs(2 * lN - 1)) * sN;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = lN - c / 2;
  let r = 0;
  let g = 0;
  let b = 0;
  if (h < 60) { r = c; g = x; }
  else if (h < 120) { r = x; g = c; }
  else if (h < 180) { g = c; b = x; }
  else if (h < 240) { g = x; b = c; }
  else if (h < 300) { r = x; b = c; }
  else { r = c; b = x; }
  const toHex = (n: number) => {
    const v = Math.round((n + m) * 255);
    return v.toString(16).padStart(2, '0');
  };
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

const getTypeOption = (picklists: Picklist[], type?: string): PicklistOption | undefined => {
  if (!type) return undefined;
  return picklists.find(p => p.name === 'organization_type')?.options.find(o => o.value === String(type));
};

const OrgNode = ({ data }: NodeProps<{ org: Organization; picklists: Picklist[]; subtreeColor: string; isRoot: boolean }>) => {
  const { org, picklists, subtreeColor, isRoot } = data;
  const typeOpt = getTypeOption(picklists, org.type);
  const useColored = typeOpt?.color && typeOpt.color !== 'var(--secondary)';
  return (
    <div
      style={{
        width: isRoot ? ROOT_NODE_W : NODE_W,
        padding: isRoot ? '0.85rem 1rem' : '0.55rem 0.75rem',
        // Subtle tint on roots so they read as anchor points; descendants stay
        // on the plain card background to keep the page calm.
        background: isRoot ? `${subtreeColor}1F` : 'var(--card)',
        color: 'var(--foreground)',
        border: '1px solid var(--border)',
        borderTop: `${isRoot ? 6 : 3}px solid ${subtreeColor}`,
        borderRadius: isRoot ? 12 : 10,
        boxShadow: isRoot
          ? `0 6px 14px rgba(0, 0, 0, 0.12), 0 0 0 1px ${subtreeColor}55`
          : '0 2px 4px rgba(0, 0, 0, 0.06)',
        cursor: 'pointer',
        fontSize: isRoot ? 15 : 13,
        textAlign: 'left',
        boxSizing: 'border-box',
      }}
    >
      <Handle type="target" position={Position.Top} style={{ opacity: 0 }} />
      <Handle type="source" position={Position.Bottom} style={{ opacity: 0 }} />
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: isRoot ? 8 : 6,
          fontWeight: isRoot ? 800 : 700,
          fontSize: isRoot ? 16 : 13,
          letterSpacing: isRoot ? '-0.01em' : 0,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}
      >
        <Layers size={isRoot ? 18 : 13} style={{ color: subtreeColor, flexShrink: 0 }} />
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{org.name}</span>
      </div>
      {typeOpt && (
        <span
          style={{
            marginTop: isRoot ? 8 : 6,
            display: 'inline-block',
            fontSize: isRoot ? '0.65rem' : '0.6rem',
            fontWeight: 800,
            textTransform: 'uppercase',
            padding: isRoot ? '0.15rem 0.6rem' : '0.1rem 0.5rem',
            borderRadius: 4,
            background: useColored ? typeOpt.color : 'var(--secondary)',
            color: useColored ? 'white' : 'var(--secondary-foreground)',
            textShadow: useColored ? '0 1px 2px rgba(0,0,0,0.3)' : undefined,
            border: !useColored ? '1px solid var(--border)' : 'none',
          }}
        >
          {typeOpt.label}
        </span>
      )}
    </div>
  );
};

const NODE_TYPES = { org: OrgNode };

const layoutOrgs = (orgs: Organization[], picklists: Picklist[]): { nodes: Node[]; edges: Edge[] } => {
  if (!orgs.length) return { nodes: [], edges: [] };

  const byId = new Map(orgs.map(o => [o.id, o] as const));

  // Sibling lookup, sorted by name natural order — used both for sibling
  // index assignment when deriving colors, and as a stable iteration order.
  const siblingsOf = (parentId: string | null | undefined): Organization[] =>
    orgs
      .filter(o => (o.parentId || null) === (parentId || null) && (!o.parentId || byId.has(o.parentId)))
      .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));

  // Roots in stable order — each gets a base color from the palette.
  const roots = siblingsOf(null);
  const rootColor = new Map<string, string>();
  roots.forEach((r, i) => rootColor.set(r.id, ROOT_PALETTE[i % ROOT_PALETTE.length]));

  // Memoized per-node color. Recurses up to parent then derives a hue/L/S
  // shift based on depth and sibling position so children stay in the parent's
  // family while remaining individually distinguishable.
  const colorByNode = new Map<string, string>();
  const depthByNode = new Map<string, number>();
  const colorOf = (id: string, depth = 0): string => {
    if (colorByNode.has(id)) return colorByNode.get(id)!;
    if (depth > 64) return ROOT_PALETTE[0]; // cycle guard
    const o = byId.get(id);
    if (!o) return ROOT_PALETTE[0];
    let result: string;
    if (!o.parentId || !byId.has(o.parentId)) {
      result = rootColor.get(o.id) || ROOT_PALETTE[0];
      depthByNode.set(o.id, 0);
    } else {
      const parentColor = colorOf(o.parentId, depth + 1);
      const parentDepth = depthByNode.get(o.parentId) ?? 0;
      const myDepth = parentDepth + 1;
      depthByNode.set(o.id, myDepth);

      const siblings = siblingsOf(o.parentId);
      const idx = siblings.findIndex(s => s.id === o.id);
      const n = siblings.length;

      // Spread siblings around the parent's hue. Spread shrinks with depth
      // (multiplicative — gentler falloff than 1/d) so deep descendants stay
      // in the family while the spread at level 1 is wide enough that direct
      // siblings actually look distinct.
      const spread = SIBLING_HUE_SPREAD * Math.pow(SHRINK_PER_DEPTH, myDepth - 1);
      const hueShift = n > 1 ? ((idx / (n - 1)) - 0.5) * spread : 0;

      const [h, s, l] = hexToHsl(parentColor);
      const newH = ((h + hueShift) % 360 + 360) % 360;
      const newS = Math.max(MIN_SATURATION, s - DEPTH_DESATURATE);
      const newL = Math.min(MAX_LIGHTNESS, l + DEPTH_LIGHTEN);
      result = hslToHex(newH, newS, newL);
    }
    colorByNode.set(id, result);
    return result;
  };
  // Pre-compute so layout/render order doesn't matter.
  for (const o of orgs) colorOf(o.id);
  const colorFor = (id: string) => colorByNode.get(id) || ROOT_PALETTE[0];

  const isRootId = (id: string) => {
    const o = byId.get(id);
    return !!o && (!o.parentId || !byId.has(o.parentId));
  };

  const g = new dagre.graphlib.Graph();
  g.setGraph({ rankdir: 'TB', nodesep: 40, ranksep: 90, marginx: 24, marginy: 24 });
  g.setDefaultEdgeLabel(() => ({}));

  for (const o of orgs) {
    const isRoot = isRootId(o.id);
    g.setNode(o.id, {
      width: isRoot ? ROOT_NODE_W : NODE_W,
      height: isRoot ? ROOT_NODE_H : NODE_H,
    });
  }
  for (const o of orgs) {
    if (o.parentId && byId.has(o.parentId)) g.setEdge(o.parentId, o.id);
  }
  dagre.layout(g);

  const nodes: Node[] = orgs.map(o => {
    const pos = g.node(o.id);
    const isRoot = isRootId(o.id);
    const w = isRoot ? ROOT_NODE_W : NODE_W;
    const h = isRoot ? ROOT_NODE_H : NODE_H;
    return {
      id: o.id,
      type: 'org',
      position: { x: pos.x - w / 2, y: pos.y - h / 2 },
      data: { org: o, picklists, subtreeColor: colorFor(o.id), isRoot },
      draggable: false,
    };
  });

  const edges: Edge[] = [];
  for (const o of orgs) {
    if (o.parentId && byId.has(o.parentId)) {
      // Edges leaving a root are slightly thicker, reinforcing the root's
      // anchor role visually as the line travels down.
      const fromRoot = isRootId(o.parentId);
      edges.push({
        id: `${o.parentId}->${o.id}`,
        source: o.parentId,
        target: o.id,
        type: 'smoothstep',
        style: { stroke: colorFor(o.id), strokeWidth: fromRoot ? 2.5 : 2 },
      });
    }
  }

  return { nodes, edges };
};

const DiagramInner = ({ organizations, picklists }: { organizations: Organization[]; picklists: Picklist[] }) => {
  const navigate = useNavigate();

  const { nodes: initialNodes, edges: initialEdges } = useMemo(
    () => layoutOrgs(organizations, picklists),
    [organizations, picklists]
  );

  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);
  const { fitView } = useReactFlow();
  const initialized = useNodesInitialized();
  const fittedKey = useRef('');

  // Re-layout when input data changes.
  useEffect(() => {
    setNodes(initialNodes);
    setEdges(initialEdges);
  }, [initialNodes, initialEdges, setNodes, setEdges]);

  // Fit once after the first layout settles, and again whenever the dataset
  // changes shape (different node count).
  useEffect(() => {
    const key = `${nodes.length}:${edges.length}`;
    if (initialized && nodes.length > 0 && fittedKey.current !== key) {
      fittedKey.current = key;
      requestAnimationFrame(() => fitView({ padding: 0.2, duration: 200 }));
    }
  }, [initialized, nodes.length, edges.length, fitView]);

  const nodeTypes = useMemo(() => NODE_TYPES, []);

  return (
    <ReactFlow
      nodes={nodes}
      edges={edges}
      onNodesChange={onNodesChange}
      onEdgesChange={onEdgesChange}
      nodeTypes={nodeTypes}
      onNodeClick={(_event, node) => navigate(`/organizations/${node.id}`)}
      proOptions={{ hideAttribution: true }}
      fitView
      minZoom={0.2}
      maxZoom={1.5}
      nodesDraggable={false}
      nodesConnectable={false}
      elementsSelectable={false}
    >
      <Background gap={20} size={1} color="var(--border)" />
      <Controls showInteractive={false} />
    </ReactFlow>
  );
};

export const OrganizationDiagram = ({ organizations, picklists }: { organizations: Organization[]; picklists: Picklist[] }) => {
  return (
    <div style={{ width: '100%', height: '100%', minHeight: 0, background: 'var(--background)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', overflow: 'hidden' }}>
      <ReactFlowProvider>
        <DiagramInner organizations={organizations} picklists={picklists} />
      </ReactFlowProvider>
    </div>
  );
};
