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

const NODE_W = 190;
const NODE_H = 60;
const ROOT_NODE_W = 260;
const ROOT_NODE_H = 84;

const ROOT_PALETTE = [
  '#fa5252', '#228be6', '#fcc419', '#51cf66', '#be4bdb', 
  '#ff922b', '#15aabf', '#7950f2', '#20c997', '#4c6ef5',
];

const SIBLING_HUE_SPREAD = 90;
const SHRINK_PER_DEPTH = 0.7;
const DEPTH_LIGHTEN = 9;
const DEPTH_DESATURATE = 3;
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

const OrgNode = ({ data }: NodeProps<{ org: Organization; picklists: Picklist[]; subtreeColor: string; isRoot: boolean; isStacked: boolean }>) => {
  const { org, picklists, subtreeColor, isRoot, isStacked } = data;
  const typeOpt = getTypeOption(picklists, org.type);
  const useColored = typeOpt?.color && typeOpt.color !== 'var(--secondary)';
  
  return (
    <div
      style={{
        width: isRoot ? ROOT_NODE_W : NODE_W,
        padding: isRoot ? '0.75rem 0.9rem' : '0.5rem 0.65rem',
        background: isRoot ? `${subtreeColor}1F` : 'var(--card)',
        color: 'var(--foreground)',
        border: '1px solid var(--border)',
        borderTop: `${isRoot ? 5 : 3}px solid ${subtreeColor}`,
        borderRadius: isRoot ? 10 : 8,
        boxShadow: isRoot
          ? `0 4px 10px rgba(0, 0, 0, 0.12), 0 0 0 1px ${subtreeColor}55`
          : '0 1px 3px rgba(0, 0, 0, 0.06)',
        cursor: 'pointer',
        fontSize: isRoot ? 14 : 12,
        textAlign: 'left',
        boxSizing: 'border-box',
      }}
    >
      <Handle type="target" position={isStacked ? Position.Left : Position.Top} style={{ opacity: 0 }} />
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
  const hasChildren = (id: string) => orgs.some(o => o.parentId === id);
  
  const siblingsOf = (parentId: string | null | undefined): Organization[] =>
    orgs
      .filter(o => (o.parentId || null) === (parentId || null) && (!o.parentId || byId.has(o.parentId)))
      .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));

  const roots = siblingsOf(null);
  const rootColor = new Map<string, string>();
  roots.forEach((r, i) => rootColor.set(r.id, ROOT_PALETTE[i % ROOT_PALETTE.length]));

  const colorByNode = new Map<string, string>();
  const depthByNode = new Map<string, number>();
  const colorOf = (id: string, depth = 0): string => {
    if (colorByNode.has(id)) return colorByNode.get(id)!;
    if (depth > 64) return ROOT_PALETTE[0];
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

      // Rule: If this node is a leaf (no children), inherit parent color exactly.
      if (!hasChildren(o.id)) {
        result = parentColor;
      } else {
        const siblings = siblingsOf(o.parentId);
        const idx = siblings.findIndex(s => s.id === o.id);
        const spread = SIBLING_HUE_SPREAD * Math.pow(SHRINK_PER_DEPTH, myDepth - 1);
        const hueShift = siblings.length > 1 ? ((idx / (siblings.length - 1)) - 0.5) * spread : 0;
        const [h, s, l] = hexToHsl(parentColor);
        result = hslToHex(((h + hueShift) % 360 + 360) % 360, Math.max(MIN_SATURATION, s - DEPTH_DESATURATE), Math.min(MAX_LIGHTNESS, l + DEPTH_LIGHTEN));
      }
    }
    colorByNode.set(id, result);
    return result;
  };
  orgs.forEach(o => colorOf(o.id));

  // HYBRID LAYOUT LOGIC
  const g = new dagre.graphlib.Graph();
  g.setGraph({ rankdir: 'TB', nodesep: 60, ranksep: 80, marginx: 40, marginy: 40 });
  g.setDefaultEdgeLabel(() => ({}));

  // Rule: Stack children if ALL of them are leaves.
  const isLeaf = (id: string) => !hasChildren(id);
  const stackParentIds = new Set<string>();
  
  orgs.forEach(o => {
    const children = siblingsOf(o.id);
    if (children.length > 1 && children.every(c => isLeaf(c.id))) {
      stackParentIds.add(o.id);
    }
  });

  const stackedNodeIds = new Set<string>();

  orgs.forEach(o => {
    if (o.parentId && stackParentIds.has(o.parentId)) {
      stackedNodeIds.add(o.id);
      return; 
    }
    const isRoot = !o.parentId;
    g.setNode(o.id, { width: isRoot ? ROOT_NODE_W : NODE_W, height: isRoot ? ROOT_NODE_H : NODE_H });
  });

  // Placeholder for leaf stacks
  stackParentIds.forEach(pId => {
    const leaves = siblingsOf(pId);
    const stackHeight = leaves.length * (NODE_H + 12);
    const stackWidth = NODE_W + 30;
    const placeholderId = `stack-${pId}`;
    g.setNode(placeholderId, { width: stackWidth, height: stackHeight });
    g.setEdge(pId, placeholderId);
  });

  orgs.forEach(o => {
    if (o.parentId && !stackedNodeIds.has(o.id)) {
      g.setEdge(o.parentId, o.id);
    }
  });

  dagre.layout(g);

  const finalNodes: Node[] = [];
  const finalEdges: Edge[] = [];

  orgs.forEach(o => {
    if (stackedNodeIds.has(o.id)) return;
    const pos = g.node(o.id);
    const isRoot = !o.parentId;
    const w = isRoot ? ROOT_NODE_W : NODE_W;
    const h = isRoot ? ROOT_NODE_H : NODE_H;
    finalNodes.push({
      id: o.id, type: 'org',
      position: { x: pos.x - w/2, y: pos.y - h/2 },
      data: { org: o, picklists, subtreeColor: colorByNode.get(o.id)!, isRoot, isStacked: false }
    });
  });

  stackParentIds.forEach(pId => {
    const placeholderPos = g.node(`stack-${pId}`);
    const leaves = siblingsOf(pId);
    let currentY = placeholderPos.y - placeholderPos.height/2;
    const indentX = placeholderPos.x - placeholderPos.width/2 + 20;

    leaves.forEach(leaf => {
      finalNodes.push({
        id: leaf.id, type: 'org',
        position: { x: indentX, y: currentY },
        data: { org: leaf, picklists, subtreeColor: colorByNode.get(leaf.id)!, isRoot: false, isStacked: true }
      });
      
      finalEdges.push({
        id: `${pId}->${leaf.id}`, source: pId, target: leaf.id,
        type: 'smoothstep',
        style: { stroke: colorByNode.get(leaf.id), strokeWidth: 2 }
      });
      
      currentY += NODE_H + 12;
    });
  });

  orgs.forEach(o => {
    if (o.parentId && !stackedNodeIds.has(o.id)) {
      finalEdges.push({
        id: `${o.parentId}->${o.id}`, source: o.parentId, target: o.id,
        type: 'smoothstep',
        style: { stroke: colorByNode.get(o.id), strokeWidth: o.parentId && !byId.get(o.parentId)?.parentId ? 2.5 : 2 }
      });
    }
  });

  return { nodes: finalNodes, edges: finalEdges };
};

const DiagramInner = ({ organizations, picklists }: { organizations: Organization[]; picklists: Picklist[] }) => {
  const navigate = useNavigate();
  const { nodes: initialNodes, edges: initialEdges } = useMemo(() => layoutOrgs(organizations, picklists), [organizations, picklists]);
  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);
  const { fitView } = useReactFlow();
  const initialized = useNodesInitialized();
  const fittedKey = useRef('');

  useEffect(() => { setNodes(initialNodes); setEdges(initialEdges); }, [initialNodes, initialEdges, setNodes, setEdges]);

  useEffect(() => {
    const key = `${nodes.length}:${edges.length}`;
    if (initialized && nodes.length > 0 && fittedKey.current !== key) {
      fittedKey.current = key;
      requestAnimationFrame(() => fitView({ padding: 0.2, duration: 200 }));
    }
  }, [initialized, nodes.length, edges.length, fitView]);

  return (
    <ReactFlow
      nodes={nodes} edges={edges} onNodesChange={onNodesChange} onEdgesChange={onEdgesChange}
      nodeTypes={NODE_TYPES} onNodeClick={(_event, node) => navigate(`/organizations/${node.id}`)}
      proOptions={{ hideAttribution: true }} fitView minZoom={0.1} maxZoom={1.5}
      nodesDraggable={false} nodesConnectable={false} elementsSelectable={false}
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
