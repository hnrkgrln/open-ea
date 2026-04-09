import { useEffect, useMemo, useState, useRef } from 'react';
import ReactFlow, { 
  Background, 
  Controls, 
  Panel,
  useNodesState,
  useEdgesState,
  MarkerType,
  useReactFlow,
  useStore,
  getBezierPath,
  type Node,
  type Edge,
  type EdgeProps,
  ReactFlowProvider
} from 'reactflow';
import 'reactflow/dist/style.css';
import dagre from '@dagrejs/dagre';
import { Database, Boxes, Lock, Unlock, Maximize, Minimize } from 'lucide-react';

const safeJsonParse = (str: string | null | undefined, fallback: any = {}) => {
  if (!str) return fallback;
  try {
    return JSON.parse(str);
  } catch (e) {
    try {
      const healed = str
        .replace(/([{,])\s*([a-zA-Z0-9._-]+)\s*:/g, '$1"$2":')
        .replace(/:\s*([^",}\s][^,}\s]*)\s*([,}])/g, ':"$1"$2');
      return JSON.parse(healed);
    } catch (e2) {
      return fallback;
    }
  }
};

interface Application {
  id: string;
  name: string;
  description: string;
  owner: string;
  lifecycle: string;
  type: string;
  metadata?: string;
  criticality: string;
  functionalFit: string;
  technicalFit: string;
  capabilities?: { id: string; name: string; criticality: string }[];
}

interface Capability {
  id: string;
  name: string;
  description?: string;
  parentId?: string | null;
  metadata?: string;
  criticality: string;
  applications?: { id: string }[];
}

interface Integration {
  id: string;
  sourceAppId: string;
  targetAppId: string;
  name?: string;
  type?: string;
  sourceApp?: Application;
  targetApp?: Application;
}

interface MetadataDefinition {
  id: string;
  entityType: string;
  fieldName: string;
  fieldType: string;
  label: string;
  min: number;
  max: number;
  scaleType: string;
}

interface Picklist {
  id: string;
  name: string;
  options: { value: string; color: string; label: string }[];
}

interface Props {
  onNodeClick?: (app: Application) => void;
  onCapabilityClick?: (cap: Capability) => void;
  apps: Application[];
  filteredApps: Application[];
  categoricalFilteredApps: Application[];
  integrations: Integration[];
  capabilities: Capability[];
  metaDefs: MetadataDefinition[];
  picklists: Picklist[];
  mode?: 'network' | 'landscape' | 'app-landscape';
  activeOverlay?: string | null;
  activeCustomOverlays?: string[];
  showApplications?: boolean;
  showCapabilities?: boolean;
  hideOrphanApps?: boolean;
  showCriticality?: boolean;
  filters?: any;
  groupingField?: string | null;
  relationSearch?: string;
  visible?: boolean;
  containerRef?: React.RefObject<HTMLDivElement | null>;
}

const STANDARD_DEFS: MetadataDefinition[] = [
  { id: 'crit-app', entityType: 'Application', fieldName: 'criticality', fieldType: 'range', label: 'Business Criticality', min: 1, max: 5, scaleType: 'importance' },
  { id: 'crit-cap', entityType: 'Capability', fieldName: 'criticality', fieldType: 'range', label: 'Business Criticality', min: 1, max: 5, scaleType: 'importance' },
  { id: 'func-app', entityType: 'Application', fieldName: 'functionalFit', fieldType: 'range', label: 'Functional Fit', min: 1, max: 5, scaleType: 'bad-good' },
  { id: 'tech-app', entityType: 'Application', fieldName: 'technicalFit', fieldType: 'range', label: 'Technical Fit', min: 1, max: 5, scaleType: 'bad-good' },
];

const getContrastColor = (hexcolor: string) => {
  if (!hexcolor || hexcolor === 'transparent') return 'var(--foreground)';
  if (hexcolor.startsWith('#')) {
    const r = parseInt(hexcolor.substring(1, 3), 16);
    const g = parseInt(hexcolor.substring(3, 5), 16);
    const b = parseInt(hexcolor.substring(5, 7), 16);
    const yiq = ((r * 299) + (g * 587) + (b * 114)) / 1000;
    return (yiq >= 128) ? '#000000' : '#ffffff';
  }
  return 'var(--foreground)';
};

const LIFECYCLE_STAGES = [
  { label: 'Discovery', color: '#1864ab', lightColor: '#e7f5ff', description: 'Market research, security vetting, and business case development.' },
  { label: 'Onboarding', color: '#5f3dc4', lightColor: '#f3f0ff', description: 'Installation, configuration, and user training.' },
  { label: 'Mainstream', color: '#2b8a3e', lightColor: '#ebfbee', description: 'The primary solution for the given business capability.' },
  { label: 'Legacy', color: '#d9480f', lightColor: '#fff4e6', description: 'Suboptimal solution kept for specialized needs or pending migration.' },
  { label: 'Decommissioned', color: '#c92a2a', lightColor: '#fff5f5', description: 'Contract terminated and data archived.' }
];

const getLifecycleColor = (lifecycle: string, isDark: boolean) => {
  const lc = lifecycle?.toLowerCase() || 'discovery';
  const stage = LIFECYCLE_STAGES.find(s => s.label.toLowerCase() === lc) || LIFECYCLE_STAGES[0];
  const bg = isDark ? stage.color : stage.lightColor;
  return { bg, text: getContrastColor(bg) };
};

const interpolateColor = (color1: string, color2: string, factor: number) => {
  const r1 = parseInt(color1.substring(1, 3), 16);
  const g1 = parseInt(color1.substring(3, 5), 16);
  const b1 = parseInt(color1.substring(5, 7), 16);
  const r2 = parseInt(color2.substring(1, 3), 16);
  const g2 = parseInt(color2.substring(3, 5), 16);
  const b2 = parseInt(color2.substring(5, 7), 16);
  const r = Math.round(r1 + factor * (r2 - r1));
  const g = Math.round(g1 + factor * (g2 - g1));
  const b = Math.round(b1 + factor * (b2 - b1));
  return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
};

const getScaleColors = (scaleType: string) => {
  switch (scaleType) {
    case 'good-bad': return ['#2b8a3e', '#fab005', '#c92a2a'];
    case 'bad-good': return ['#c92a2a', '#fab005', '#2b8a3e'];
    case 'low-high': return ['#e7f5ff', '#1864ab'];
    case 'importance': return ['#dee2e6', '#7048e8', '#311b92'];
    default: return ['#dee2e6', '#343a40'];
  }
};

const LandscapeArt = ({ isDark }: { isDark: boolean }) => (
  <div style={{ position: 'absolute', inset: 0, overflow: 'hidden', pointerEvents: 'none', zIndex: 0, opacity: isDark ? 0.07 : 0.04 }}>
    <svg width="100%" height="100%" preserveAspectRatio="none" viewBox="0 0 1200 800" xmlns="http://www.w3.org/2000/svg">
      {/* Subtle Sun/Moon */}
      <circle cx="1000" cy="150" r="50" fill="currentColor" opacity="0.2" />
      
      {/* Distant Ridge */}
      <path d="M0 500 C 300 400 600 600 900 450 C 1100 350 1200 400 1200 400 L 1200 800 L 0 800 Z" fill="currentColor" opacity="0.1" />
      
      {/* Mid Ridge */}
      <path d="M0 600 C 400 500 800 700 1200 550 L 1200 800 L 0 800 Z" fill="currentColor" opacity="0.2" />
      
      {/* Near Ridge */}
      <path d="M0 700 C 600 650 1000 800 1200 700 L 1200 800 L 0 800 Z" fill="currentColor" opacity="0.3" />

      {/* Tiny Birds */}
      <g opacity="0.3">
        <path d="M200 200 Q 205 190 210 200 Q 215 190 220 200" fill="none" stroke="currentColor" strokeWidth="2" />
        <path d="M240 220 Q 245 210 250 220 Q 255 210 260 220" fill="none" stroke="currentColor" strokeWidth="2" />
      </g>
    </svg>
  </div>
);

const NetworkArt = ({ isDark }: { isDark: boolean }) => (
  <div style={{ position: 'absolute', inset: 0, overflow: 'hidden', pointerEvents: 'none', zIndex: 0, opacity: isDark ? 0.15 : 0.1 }}>
    <style>{`
      @keyframes twinkle {
        0%, 100% { opacity: 0.4; transform: scale(0.9); }
        50% { opacity: 0.9; transform: scale(1.1); }
      }
      .star {
        animation: twinkle 8s infinite ease-in-out;
      }
    `}</style>
    <svg width="100%" height="100%" preserveAspectRatio="none" viewBox="0 0 1200 800" xmlns="http://www.w3.org/2000/svg">
      {/* Starry background dots with twinkling */}
      <circle className="star" cx="100" cy="100" r="1.5" fill="currentColor" style={{ animationDelay: '0s' }} />
      <circle className="star" cx="300" cy="150" r="1" fill="currentColor" style={{ animationDelay: '1.2s' }} />
      <circle className="star" cx="500" cy="80" r="1.2" fill="currentColor" style={{ animationDelay: '0.5s' }} />
      <circle className="star" cx="700" cy="200" r="1.5" fill="currentColor" style={{ animationDelay: '2.1s' }} />
      <circle className="star" cx="900" cy="120" r="1" fill="currentColor" style={{ animationDelay: '0.8s' }} />
      <circle className="star" cx="1100" cy="180" r="1.2" fill="currentColor" style={{ animationDelay: '1.5s' }} />
      <circle className="star" cx="50" cy="400" r="1" fill="currentColor" style={{ animationDelay: '2.5s' }} />
      <circle className="star" cx="250" cy="450" r="1.5" fill="currentColor" style={{ animationDelay: '0.3s' }} />
      <circle className="star" cx="450" cy="380" r="1.2" fill="currentColor" style={{ animationDelay: '1.7s' }} />
      <circle className="star" cx="650" cy="500" r="1.5" fill="currentColor" style={{ animationDelay: '0.9s' }} />
      <circle className="star" cx="850" cy="420" r="1" fill="currentColor" style={{ animationDelay: '2.2s' }} />
      <circle className="star" cx="1050" cy="480" r="1.2" fill="currentColor" style={{ animationDelay: '1.1s' }} />
      <circle className="star" cx="150" cy="700" r="1.2" fill="currentColor" style={{ animationDelay: '0.6s' }} />
      <circle className="star" cx="350" cy="750" r="1" fill="currentColor" style={{ animationDelay: '1.9s' }} />
      <circle className="star" cx="550" cy="680" r="1.5" fill="currentColor" style={{ animationDelay: '0.4s' }} />
      <circle className="star" cx="750" cy="780" r="1.2" fill="currentColor" style={{ animationDelay: '2.7s' }} />
      <circle className="star" cx="950" cy="720" r="1.5" fill="currentColor" style={{ animationDelay: '1.3s' }} />
      <circle className="star" cx="1150" cy="760" r="1" fill="currentColor" style={{ animationDelay: '0.2s' }} />

      {/* Interconnected constellations */}
      <g stroke="currentColor" strokeWidth="0.8" opacity="0.4" fill="none">
        <path d="M100 100 L300 150 L500 80 L700 200 L900 120 L1100 180" />
        <path d="M50 400 L250 450 L450 380 L650 500 L850 420 L1050 480" />
        <path d="M150 700 L350 750 L550 680 L750 780 L950 720 L1150 760" />
        <path d="M300 150 L250 450 L350 750" />
        <path d="M700 200 L650 500 L750 780" />
        <path d="M900 120 L850 420 L950 720" />
      </g>
    </svg>
  </div>
);

const CenteredEdge = ({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  style = {},
  markerEnd,
  label,
}: EdgeProps) => {
  const [edgePath, labelX, labelY] = getBezierPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
  });

  return (
    <>
      <path
        id={id}
        style={style}
        className="react-flow__edge-path"
        d={edgePath}
        markerEnd={markerEnd}
      />
      {label && (
        <foreignObject
          width={200}
          height={40}
          x={labelX - 100}
          y={labelY - 20}
          style={{ pointerEvents: 'none' }}
        >
          <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', width: '100%', height: '100%' }}>
            <div style={{
              background: 'var(--card)',
              padding: '2px 8px',
              borderRadius: '4px',
              fontSize: '10px',
              fontWeight: 600,
              color: 'var(--foreground)',
              border: '1px solid var(--border)',
              whiteSpace: 'nowrap',
              boxShadow: '0 1px 2px rgba(0,0,0,0.1)',
              pointerEvents: 'none'
            }}>
              {label}
            </div>
          </div>
        </foreignObject>
      )}
    </>
  );
};

const getOverlayColor = (value: string | number, def: MetadataDefinition, picklists: Picklist[]) => {
  const targetName = def.fieldName.replace(/([A-Z])/g, '_$1').toLowerCase();
  const picklist = picklists.find(p => p.name === targetName || p.name === def.fieldName);
  
  if (picklist) {
    const rounded = Math.round(Number(value));
    const option = picklist.options.find(o => o.value === String(rounded));
    if (option) return { bg: option.color, text: getContrastColor(option.color) };
  }

  const numVal = Number(value);
  const min = def.min ?? 0;
  const max = def.max ?? 100;
  const range = max - min;
  const normalized = range === 0 ? 0.5 : Math.max(0, Math.min(1, (numVal - min) / range));
  const colors = getScaleColors(def.scaleType);

  let bg = '';
  if (colors.length === 3) {
    if (normalized < 0.5) bg = interpolateColor(colors[0], colors[1], normalized * 2);
    else bg = interpolateColor(colors[1], colors[2], (normalized - 0.5) * 2);
  } else {
    bg = interpolateColor(colors[0], colors[1], normalized);
  }
  return { bg, text: getContrastColor(bg) };
};

const NODE_TYPES = {};
const EDGE_TYPES = {
  centered: CenteredEdge
};

const DiagramInner = ({ 
  onNodeClick, 
  onCapabilityClick, 
  apps, 
  filteredApps, 
  categoricalFilteredApps,
  integrations, 
  capabilities, 
  metaDefs: dbMetaDefs, 
  picklists, 
  mode = 'landscape', 
  activeOverlay = 'lifecycle', 
  activeCustomOverlays = [],
  showApplications = true, 
  showCapabilities = true,
  hideOrphanApps = true,
  showCriticality = true, 
  filters = {},
  groupingField = null,
  relationSearch = '',
  visible = false,
  containerRef
}: Props) => {
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const { setViewport, getNodes } = useReactFlow();
  const viewportWidth = useStore((s) => s.width);
  const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
  const [lockNodes, setLockNodes] = useState(true);
  const [isFullscreen, setIsFullscreen] = useState(false);

  const nodeTypes = useMemo(() => NODE_TYPES, []);
  const edgeTypes = useMemo(() => EDGE_TYPES, []);

  const toggleFullscreen = () => {
    if (!containerRef?.current) return;
    if (!document.fullscreenElement) {
      containerRef.current.requestFullscreen().catch(err => {
        console.error(`Error attempting to enable full-screen mode: ${err.message} (${err.name})`);
      });
    } else {
      document.exitFullscreen();
    }
  };

  useEffect(() => {
    const handler = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', handler);
    return () => document.removeEventListener('fullscreenchange', handler);
  }, []);

  const [legendPos, setLegendPos] = useState({ x: 20, y: 20 });
  const isDraggingLegend = useRef(false);
  const dragStart = useRef({ x: 0, y: 0 });

  const onLegendMouseDown = (e: React.MouseEvent) => {
    isDraggingLegend.current = true;
    dragStart.current = { x: e.clientX - legendPos.x, y: e.clientY - legendPos.y };
    e.stopPropagation();
  };

  useEffect(() => {
    const onMouseMove = (e: MouseEvent) => {
      if (!isDraggingLegend.current) return;
      setLegendPos({
        x: e.clientX - dragStart.current.x,
        y: e.clientY - dragStart.current.y
      });
    };
    const onMouseUp = () => { isDraggingLegend.current = false; };
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
    return () => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };
  }, [legendPos]);

  const metaDefs = useMemo(() => {
    const defs = [...(dbMetaDefs || [])];
    STANDARD_DEFS.forEach(std => {
      if (!defs.some(d => d.fieldName === std.fieldName && d.entityType === std.entityType)) {
        defs.push(std);
      }
    });
    return defs;
  }, [dbMetaDefs]);

  const critDef = metaDefs.find(d => d.fieldName === 'criticality' && d.entityType === 'Capability');
  const appCritDef = metaDefs.find(d => d.fieldName === 'criticality' && d.entityType === 'Application');
  const appOverlayDef = metaDefs.find(d => d.fieldName === activeOverlay && d.entityType === 'Application');

  const getCustomLabels = (entity: any, entityType: string) => {
    try {
      if (!activeCustomOverlays || activeCustomOverlays.length === 0) return [];
      const meta = safeJsonParse(entity.metadata);
      return metaDefs
        .filter(d => d.entityType === entityType && meta[d.fieldName] && activeCustomOverlays.includes(d.fieldName))
        .map(d => {
          const valStr = String(meta[d.fieldName]);
          let bg = 'var(--accent)';
          let text = 'var(--foreground)';
          if (d.fieldType === 'range') {
            const colors = getOverlayColor(valStr, d, picklists || []);
            bg = colors.bg; text = colors.text;
          } else {
            const picklist = picklists?.find(p => p.name === d.fieldName || p.name === d.fieldName.replace(/([A-Z])/g, '_$1').toLowerCase());
            if (picklist) {
              const opt = picklist.options.find((o: any) => o.value === valStr || o.label === valStr);
              if (opt && opt.color) {
                bg = opt.color; text = getContrastColor(bg);
              }
            }
          }
          return (
            <div key={d.id} style={{ fontSize: '10px', padding: '2px 6px', borderRadius: '4px', background: bg, color: text, border: '1px solid var(--border)', whiteSpace: 'nowrap', fontWeight: 500 }}>
              {d.label}: {valStr}
            </div>
          );
        });
    } catch (e) { return []; }
  };

  useEffect(() => {
    if (!apps || !capabilities || !metaDefs || !picklists || apps.length === 0 || capabilities.length === 0) return;

    const borderColor = 'var(--border)';
    const groupBg = isDark ? 'rgba(37, 38, 43, 0.6)' : 'rgba(255, 255, 255, 0.6)';

    const getAppScore = (app: Application, fieldName: string, def?: MetadataDefinition) => {
      const localVal = Number((app as any)[fieldName] || safeJsonParse(app.metadata)[fieldName] || (def ? def.min : 1));
      
      if (fieldName === 'criticality' && app.capabilities && app.capabilities.length > 0) {
        const capScores = app.capabilities.map(c => {
          const fullCap = capabilities.find(ac => ac.id === c.id);
          return Number(fullCap?.criticality || 1);
        });
        return Math.max(localVal, ...capScores);
      }
      return localVal;
    };

    const getFieldValue = (app: Application, field: string) => {
      if (field === 'criticality') {
        return String(getAppScore(app, 'criticality', appCritDef));
      }
      if (field === 'functionalFit') {
        const def = metaDefs.find(d => d.fieldName === 'functionalFit' && d.entityType === 'Application');
        return String(getAppScore(app, 'functionalFit', def));
      }
      if (field === 'technicalFit') {
        const def = metaDefs.find(d => d.fieldName === 'technicalFit' && d.entityType === 'Application');
        return String(getAppScore(app, 'technicalFit', def));
      }
      const val = (app as any)[field] || safeJsonParse(app.metadata)[field];
      return val ? String(val) : 'Unspecified';
    };

    const getCapFieldValue = (cap: Capability, field: string) => {
      const def = metaDefs.find(d => d.fieldName === field && d.entityType === 'Capability');
      const val = (cap as any)[field] || safeJsonParse(cap.metadata)[field] || (def ? def.min : 'Unspecified');
      return String(val);
    };

    if (mode === 'network') {
      const search = (relationSearch || '').toLowerCase();
      const visibleAppIds = new Set(filteredApps.map(a => a.id));
      const catAppIds = new Set(categoricalFilteredApps.map(a => a.id));

      const filteredIntegrations = integrations.filter(i => {
        // Categorical filters are applied first: both apps must be in the categorical set
        if (!catAppIds.has(i.sourceAppId) || !catAppIds.has(i.targetAppId)) return false;

        const sourceApp = apps.find(a => a.id === i.sourceAppId);
        const targetApp = apps.find(a => a.id === i.targetAppId);
        if (!sourceApp || !targetApp) return false;

        if (search) {
          const iMatches = i.name?.toLowerCase().includes(search) || i.type?.toLowerCase().includes(search);
          const sMatches = sourceApp.name.toLowerCase().includes(search);
          const tMatches = targetApp.name.toLowerCase().includes(search);
          return iMatches || sMatches || tMatches;
        }

        return visibleAppIds.has(i.sourceAppId) && visibleAppIds.has(i.targetAppId);
      });
      const appsWithIntegrations = new Set(filteredIntegrations.flatMap(i => [i.sourceAppId, i.targetAppId]));
      const finalAppIds = Array.from(new Set([
        ...Array.from(appsWithIntegrations),
        ...(hideOrphanApps ? [] : filteredApps.map(a => a.id))
      ]));
      const adj = new Map<string, string[]>();
      finalAppIds.forEach(id => adj.set(id, []));
      filteredIntegrations.forEach(i => {
        adj.get(i.sourceAppId)?.push(i.targetAppId);
        adj.get(i.targetAppId)?.push(i.sourceAppId);
      });
      const visited = new Set<string>();
      const islands: string[][] = [];
      finalAppIds.forEach(id => {
        if (!visited.has(id)) {
          const island: string[] = []; const stack = [id]; visited.add(id);
          while(stack.length > 0) {
            const curr = stack.pop()!; island.push(curr);
            adj.get(curr)?.forEach(neighbor => { if (!visited.has(neighbor)) { visited.add(neighbor); stack.push(neighbor); } });
          }
          islands.push(island);
        }
      });
      const islandNodes: Node[] = []; const islandEdges: Edge[] = [];
      let currentX = 0; const islandGap = 150; const nodeWidth = 180; const nodeHeight = 60;
      islands.forEach((islandAppIds) => {
        const g = new dagre.graphlib.Graph(); g.setGraph({ rankdir: 'TB', nodesep: 50, ranksep: 100 }); g.setDefaultEdgeLabel(() => ({}));
        islandAppIds.forEach(id => g.setNode(id, { width: nodeWidth, height: nodeHeight }));
        filteredIntegrations.forEach(i => { if (islandAppIds.includes(i.sourceAppId)) g.setEdge(i.sourceAppId, i.targetAppId); });
        dagre.layout(g);
        const islandBox = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: Infinity };
        g.nodes().forEach(v => {
          const node = g.node(v); islandBox.minX = Math.min(islandBox.minX, node.x - nodeWidth / 2); islandBox.minY = Math.min(islandBox.minY, node.y - nodeHeight / 2);
          islandBox.maxX = Math.max(islandBox.maxX, node.x + nodeWidth / 2); islandBox.maxY = Math.max(islandBox.maxY, node.y + nodeHeight / 2);
        });
        const islandWidth = islandBox.maxX - islandBox.minX;
        islandAppIds.forEach(id => {
          const app = apps.find(a => a.id === id)!; if (!app) return;
          const dNode = g.node(id); let colors = { bg: 'var(--card)', text: 'var(--foreground)' };
          if (activeOverlay === 'lifecycle') colors = getLifecycleColor(app.lifecycle, isDark);
          else {
            const overlayToUse = activeOverlay === 'criticality' ? appCritDef : appOverlayDef;
            if (overlayToUse) { colors = getOverlayColor(getAppScore(app, activeOverlay!, overlayToUse), overlayToUse, picklists); }
          }
          islandNodes.push({
            id: app.id,
            data: { label: (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px', width: '100%', overflow: 'hidden' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem', width: '100%' }}>
                  <Database size={14} />
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{app.name}</span>
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '2px', justifyContent: 'center' }}>{getCustomLabels(app, 'Application')}</div>
              </div>
            ), type: 'app', original: app },

            position: { x: currentX + (dNode.x - islandBox.minX), y: (dNode.y - islandBox.minY) },
            style: { background: colors.bg, color: colors.text, border: `1px solid ${isDark ? 'rgba(255,255,255,0.1)' : borderColor}`, borderRadius: '12px', width: nodeWidth, fontSize: '13px', fontWeight: 600, textAlign: 'center', padding: '12px', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)' }
          });
        });
        filteredIntegrations.forEach(i => {
          if (islandAppIds.includes(i.sourceAppId)) {
            islandEdges.push({
              id: `e-${i.id}`, source: i.sourceAppId, target: i.targetAppId, 
              label: i.name || i.type,
              type: 'centered',
              style: { stroke: isDark ? '#5c5f66' : '#adb5bd', strokeWidth: 2 },
              markerEnd: { type: MarkerType.ArrowClosed, color: isDark ? '#5c5f66' : '#adb5bd' },
            });
          }
        });
        currentX += islandWidth + islandGap;
      });

      // --- ADD FILTER FEEDBACK TO NETWORK VIEW ---
      const activeCategoricalFilters: string[] = [];
      if (!groupingField) {
        if (filters.lifecycle?.length > 0) activeCategoricalFilters.push(`Lifecycle: ${filters.lifecycle.join(', ')}`);
        if (filters.owner?.length > 0) activeCategoricalFilters.push(`Owner: ${filters.owner.join(', ')}`);
        if (filters.type?.length > 0) activeCategoricalFilters.push(`Type: ${filters.type.join(', ')}`);
        if (filters.capabilityId?.length > 0) {
          const capNames = filters.capabilityId.map((id: string) => capabilities.find(c => c.id === id)?.name).filter(Boolean);
          activeCategoricalFilters.push(`Capabilities: ${capNames.join(', ')}`);
        }
        if (filters.criticality?.length > 0) activeCategoricalFilters.push(`Criticality: ${filters.criticality.join(', ')}`);
        if (filters.functionalFit?.length > 0) activeCategoricalFilters.push(`Functional Fit: ${filters.functionalFit.join(', ')}`);
        if (filters.technicalFit?.length > 0) activeCategoricalFilters.push(`Technical Fit: ${filters.technicalFit.join(', ')}`);
        if (filters.custom) {
          Object.entries(filters.custom).forEach(([field, vals]) => {
            if (vals && vals.length > 0) {
              const def = metaDefs.find(d => d.fieldName === field);
              activeCategoricalFilters.push(`${def?.label || field}: ${vals.join(', ')}`);
            }
          });
        }
      }

      if (activeCategoricalFilters.length > 0 && islandNodes.length > 0) {
        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        islandNodes.forEach(n => {
          const x = n.position.x; const y = n.position.y;
          const w = n.width || 180; const h = n.height || 60;
          minX = Math.min(minX, x); minY = Math.min(minY, y); maxX = Math.max(maxX, x + w); maxY = Math.max(maxY, y + h);
        });
        const p = 60;
        islandNodes.unshift({ id: 'filter-container', data: { label: 'Filtered Network' }, position: { x: minX - p, y: minY - p - 40 }, style: { width: (maxX - minX) + p * 2, height: (maxY - minY) + p * 2 + 40, background: isDark ? 'rgba(255, 255, 255, 0.02)' : 'rgba(0, 0, 0, 0.02)', border: '2px solid var(--primary)', borderRadius: '24px', pointerEvents: 'none', zIndex: -100 } });
      }
      // ------------------------------------------

      setNodes(islandNodes); setEdges(islandEdges);
    } else if (mode === 'landscape' || mode === 'app-landscape') {
      const allFinalNodes: Node[] = [];
      const capsMap = new Map<string, Capability>();
      capabilities.forEach(c => capsMap.set(c.id, c));

      const activeFilterGroups: { field: string, values: string[], entityType: string }[] = [];
      if (groupingField) {
        const isCapField = metaDefs.some(d => d.fieldName === groupingField && d.entityType === 'Capability');
        
        if (isCapField && mode === 'landscape') {
          const uniqueValues = Array.from(new Set(capabilities.map(cap => getCapFieldValue(cap, groupingField))));
          
          uniqueValues.sort((a, b) => {
            const numA = parseFloat(a); const numB = parseFloat(b);
            if (!isNaN(numA) && !isNaN(numB)) return numA - numB;
            return a.localeCompare(b);
          });
          
          activeFilterGroups.push({ field: groupingField, values: uniqueValues, entityType: 'Capability' });
        } else {
          const uniqueValues = Array.from(new Set(filteredApps.map(app => getFieldValue(app, groupingField))));

          uniqueValues.sort((a, b) => {
            if (groupingField === 'lifecycle') {
              const order = LIFECYCLE_STAGES.map(s => s.label.toLowerCase());
              return order.indexOf(a.toLowerCase()) - order.indexOf(b.toLowerCase());
            }
            const numA = parseFloat(a);
            const numB = parseFloat(b);
            if (!isNaN(numA) && !isNaN(numB)) return numA - numB;
            return a.localeCompare(b);
          });

          activeFilterGroups.push({ field: groupingField, values: uniqueValues, entityType: 'Application' });
        }
      } else {
        if (filters.lifecycle?.length > 0) activeFilterGroups.push({ field: 'lifecycle', values: filters.lifecycle, entityType: 'Application' });
        if (filters.owner?.length > 0) activeFilterGroups.push({ field: 'owner', values: filters.owner, entityType: 'Application' });
        if (filters.type?.length > 0) activeFilterGroups.push({ field: 'type', values: filters.type, entityType: 'Application' });
      }
      const primaryGroup = activeFilterGroups[0];

      const renderGroupContentNodes = (targetApps: Application[], containerId: string | undefined, baseOffsetX = 0, baseOffsetY = 0, capFilter?: (c: Capability) => boolean) => {
        const groupNodes: Node[] = [];
        const appsByCap = new Map<string, Application[]>();
        const unassignedApps: Application[] = [];
        targetApps.forEach(app => {
          if (!app.capabilities || app.capabilities.length === 0) unassignedApps.push(app);
          else app.capabilities.forEach(capRef => {
            if (!appsByCap.has(capRef.id)) appsByCap.set(capRef.id, []);
            appsByCap.get(capRef.id)!.push(app);
          });
        });

        const memoRelevant = new Map<string, boolean>();
        const isRelevant = (capId: string): boolean => {
          if (memoRelevant.has(capId)) return memoRelevant.get(capId)!;
          const hasApps = appsByCap.has(capId) && appsByCap.get(capId)!.length > 0;
          const children = capabilities.filter(c => c.parentId === capId);
          
          const cap = capsMap.get(capId);
          const matchesFilter = !capFilter || (cap && capFilter(cap));
          
          const res = (matchesFilter && hasApps) || children.some(c => isRelevant(c.id));
          memoRelevant.set(capId, res); return res;
        };

        const renderCap = (capId: string, parentNodeId: string | undefined, depth = 0, rootX = 0, rootY = 0, targetWidth?: number): { width: number; height: number } => {
          const cap = capsMap.get(capId);
          if (!cap || !isRelevant(capId)) return { width: 0, height: 0 };

          const children = capabilities.filter(c => c.parentId === capId && isRelevant(c.id));
          const associatedApps = showApplications ? (appsByCap.get(capId) || []) : [];
          const padding = 20; const titleHeight = 55; const appWidth = 220; const appHeight = 50; const appGap = 10;

          const childLayouts = children.map(child => ({ id: child.id, ...renderCap(child.id, `cap-${containerId || 'main'}-${capId}`, depth + 1, 0, 0, (targetWidth || 300) - padding * 2) }));

          const appCols = Math.max(1, Math.ceil(Math.sqrt(associatedApps.length * 0.8)));
          const appRows = Math.ceil(associatedApps.length / appCols);
          const appsW = associatedApps.length > 0 ? (appCols * appWidth) + (appCols - 1) * appGap : 0;
          
          const capCols = Math.max(1, Math.ceil(Math.sqrt(children.length * 1.2)));
          const capRows = Math.ceil(children.length / capCols);
          const colW = new Array(capCols).fill(0); const rowH = new Array(capRows).fill(0);
          childLayouts.forEach((l, i) => {
            const c = i % capCols; const r = Math.floor(i / capCols);
            colW[c] = Math.max(colW[c], l.width); rowH[r] = Math.max(rowH[r], l.height);
          });
          const capsW = colW.reduce((sum, w) => sum + w, 0) + (capCols > 1 ? (capCols - 1) * 15 : 0);
          const capsH = rowH.reduce((sum, h) => sum + h, 0) + (capRows > 1 ? (capRows - 1) * 15 : 0);

          const maxWidth = Math.max(targetWidth || 280, appsW + padding * 2, capsW + padding * 2);
          
          if (children.length > 0) {
            childLayouts.forEach((l, i) => {
              const c = i % capCols; const r = Math.floor(i / capCols);
              const nIdx = groupNodes.findIndex(n => n.id === `cap-${containerId || 'main'}-${l.id}`);
              if (nIdx !== -1) {
                groupNodes[nIdx].position = {
                  x: padding + colW.slice(0, c).reduce((sum, w) => sum + w + 15, 0),
                  y: titleHeight + rowH.slice(0, r).reduce((sum, h) => sum + h + 15, 0)
                };
              }
            });
          }

          const appsStartY = titleHeight + (children.length > 0 ? capsH + 15 : 0);
          associatedApps.forEach((app, i) => {
            const c = i % appCols; const r = Math.floor(i / appCols);
            let colors = { bg: 'var(--card)', text: 'var(--foreground)' };
            if (activeOverlay === 'lifecycle') colors = getLifecycleColor(app.lifecycle, isDark);
            else if (appOverlayDef) colors = getOverlayColor(getAppScore(app, activeOverlay!, appOverlayDef), appOverlayDef, picklists);

            groupNodes.push({
              id: `app-${containerId || 'main'}-${capId}-${app.id}`, parentNode: `cap-${containerId || 'main'}-${capId}`,
              data: { label: (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '2px', width: '100%', overflow: 'hidden' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', justifyContent: 'center', width: '100%' }}>
                    <Database size={12} />
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{app.name}</span>
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '2px', justifyContent: 'center' }}>{getCustomLabels(app, 'Application')}</div>
                </div>
              ), type: 'app', original: app },
              position: { x: padding + c * (appWidth + appGap), y: appsStartY + r * (appHeight + appGap) },
              style: { background: colors.bg, color: colors.text, border: `1px solid ${isDark ? 'rgba(255,255,255,0.1)' : borderColor}`, borderRadius: '8px', width: appWidth, height: appHeight, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '13px', fontWeight: 600, zIndex: 100 }
            });
          });

          const finalHeight = appsStartY + (appRows * (appHeight + appGap)) + padding;
          let capColors = { bg: depth === 0 ? groupBg : 'rgba(0,0,0,0.03)', text: 'var(--foreground)' };
          if (showCriticality && critDef) {
            const colors = getOverlayColor((cap as any).criticality || safeJsonParse(cap.metadata).criticality || critDef.min, critDef, picklists);
            capColors.bg = colors.bg; capColors.text = colors.text;
          }

          groupNodes.push({
            id: `cap-${containerId || 'main'}-${capId}`, parentNode: parentNodeId,
            data: { label: (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '2px', width: '100%', overflow: 'hidden' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', justifyContent: 'center', width: '100%' }}>
                  <Boxes size={16} />
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{cap.name}</span>
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '2px', justifyContent: 'center' }}>{getCustomLabels(cap, 'Capability')}</div>
              </div>
            ), type: 'capability', originalId: capId, original: cap },
            position: { x: rootX, y: rootY },
            style: { background: capColors.bg, border: `2px ${depth === 0 ? 'solid' : 'dashed'} ${isDark ? '#373a40' : '#dee2e6'}`, width: maxWidth, height: finalHeight, borderRadius: depth === 0 ? '16px' : '8px', color: capColors.text, fontWeight: 800, fontSize: '14px', textAlign: 'center', display: 'flex', justifyContent: 'center', alignItems: 'flex-start', paddingTop: '12px' }
          });
          return { width: maxWidth, height: finalHeight };
        };

        const renderAppInGrid = (app: Application) => {
          const associatedCaps = showCapabilities ? (app.capabilities || []) : [];
          const innerCols = Math.max(1, Math.ceil(Math.sqrt(associatedCaps.length * 0.6)));
          const innerRows = Math.ceil(associatedCaps.length / innerCols);
          const childW = 220; const childH = 45; const gap = 10; const padding = 20; const headerH = 65;
          const nodeW = padding * 2 + (innerCols * childW) + (innerCols - 1) * gap;
          const nodeH = associatedCaps.length > 0 
            ? headerH + (innerRows * childH) + (innerRows - 1) * gap + padding
            : headerH + 15;

          let colors = { bg: 'var(--card)', text: 'var(--foreground)' };
          if (activeOverlay === 'lifecycle') colors = getLifecycleColor(app.lifecycle, isDark);
          else if (appOverlayDef) colors = getOverlayColor(getAppScore(app, activeOverlay!, appOverlayDef), appOverlayDef, picklists);

          groupNodes.push({
            id: `app-node-${containerId || 'main'}-${app.id}`, parentNode: containerId,
            data: { label: (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px', width: '100%', overflow: 'hidden' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', justifyContent: 'center', width: '100%' }}>
                  <Database size={16} />
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{app.name}</span>
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '2px', justifyContent: 'center' }}>{getCustomLabels(app, 'Application')}</div>
              </div>
            ), type: 'app', original: app },
            position: { x: 0, y: 0 }, 
            style: { background: colors.bg, color: colors.text, border: `2px solid ${isDark ? 'rgba(255,255,255,0.1)' : borderColor}`, borderRadius: '16px', width: nodeW, height: nodeH, fontWeight: 800, fontSize: '14px', textAlign: 'center', display: 'flex', justifyContent: 'center', alignItems: 'flex-start', paddingTop: '16px', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)' }
          });

          associatedCaps.forEach((c, i) => {
            if (!showCapabilities) return;
            const fullCap = capabilities.find(ac => ac.id === c.id);
            const col = i % innerCols; const row = Math.floor(i / innerCols);
            let capColors = { bg: 'var(--secondary)', text: 'var(--foreground)' };
            if (critDef && fullCap) capColors = getOverlayColor(fullCap.criticality || critDef.min, critDef, picklists);
            groupNodes.push({
              id: `cap-in-app-${containerId || 'main'}-${app.id}-${c.id}`, parentNode: `app-node-${containerId || 'main'}-${app.id}`,
              data: { label: (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '2px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}><Boxes size={12} /><span>{c.name}</span></div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '2px', justifyContent: 'center' }}>{getCustomLabels(fullCap, 'Capability')}</div>
                </div>
              ), type: 'capability', original: fullCap },
              position: { x: padding + col * (childW + gap), y: headerH + row * (childH + gap) },
              style: { background: capColors.bg, color: capColors.text, border: `1px solid ${isDark ? 'rgba(255,255,255,0.1)' : borderColor}`, borderRadius: '8px', width: childW, height: childH, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '12px', fontWeight: 600, zIndex: 100 }
            });
          });
          return { width: nodeW, height: nodeH };
        };

        if (mode === 'landscape') {
          const roots = capabilities.filter(c => !c.parentId);
          const dynamicColCount = Math.max(2, Math.floor((window.innerWidth - 120) / 280));
          const colCount = containerId ? 2 : dynamicColCount;
          const colHeights = new Array(colCount).fill(0); 
          const colWidths = new Array(colCount).fill(280);
          
          // First pass: Assign to columns and calculate widths/heights
          const nodeAssignments = roots.filter(r => isRelevant(r.id)).map(root => {
            const minH = Math.min(...colHeights); 
            const cIdx = colHeights.indexOf(minH);
            const layout = renderCap(root.id, containerId, 0, 0, 0, colWidths[cIdx]);
            
            colWidths[cIdx] = Math.max(colWidths[cIdx], layout.width);
            const currentY = colHeights[cIdx];
            colHeights[cIdx] += layout.height + 60;
            
            return { root, cIdx, currentY, layout };
          });

          // Second pass: Position based on final colWidths
          nodeAssignments.forEach(asgn => {
            const nIdx = groupNodes.findIndex(n => n.id === `cap-${containerId || 'main'}-${asgn.root.id}`);
            if (nIdx !== -1) {
              const xPos = colWidths.slice(0, asgn.cIdx).reduce((sum, w) => sum + w + 60, 0);
              groupNodes[nIdx].position = { x: xPos + baseOffsetX + 60, y: asgn.currentY + baseOffsetY + 80 };
            }
          });

          const totalW = colWidths.reduce((sum, w) => sum + w + 60, 0) + 60;
          return { nodes: groupNodes, width: Math.max(totalW, 400), height: Math.max(...colHeights) + 160 };
        } else {
          const colCount = Math.max(1, Math.floor((window.innerWidth - 120) / 350));
          const colHeights = new Array(colCount).fill(0);
          const colWidths = new Array(colCount).fill(300);
          
          // First pass for apps
          const appAssignments = targetApps.map(app => {
            const minH = Math.min(...colHeights); 
            const cIdx = colHeights.indexOf(minH);
            const layout = renderAppInGrid(app);
            
            colWidths[cIdx] = Math.max(colWidths[cIdx], layout.width);
            const currentY = colHeights[cIdx];
            colHeights[cIdx] += layout.height + 60;
            
            return { app, cIdx, currentY, layout };
          });

          // Second pass for apps
          appAssignments.forEach(asgn => {
            const nIdx = groupNodes.findIndex(n => n.id === `app-node-${containerId || 'main'}-${asgn.app.id}`);
            if (nIdx !== -1) {
              const xPos = colWidths.slice(0, asgn.cIdx).reduce((sum, w) => sum + w + 60, 0);
              groupNodes[nIdx].position = { x: xPos + baseOffsetX + 60, y: asgn.currentY + baseOffsetY + 80 };
            }
          });

          const totalW = colWidths.reduce((sum, w) => sum + w + 60, 0) + 120;
          return { nodes: groupNodes, width: totalW, height: Math.max(...colHeights) + 160 };
        }
      };

      if (primaryGroup) {
        const validValues = primaryGroup.values.filter(val => {
          if (primaryGroup.entityType === 'Capability') {
            return capabilities.some(c => getCapFieldValue(c, primaryGroup.field).toLowerCase() === val.toLowerCase());
          }
          return filteredApps.some(app => getFieldValue(app, primaryGroup.field).toLowerCase() === val.toLowerCase());
        });

        // Calculate dynamic grid based on screen width
        const colCount = Math.max(2, Math.floor((window.innerWidth - 120) / 550));
        const columnHeights = new Array(colCount).fill(0);
        const colMaxW = new Array(colCount).fill(0);

        const groups = validValues.map((groupVal) => {
          let groupApps = filteredApps;
          let capFilter: ((c: Capability) => boolean) | undefined = undefined;

          if (primaryGroup.entityType === 'Capability') {
            capFilter = (c: Capability) => getCapFieldValue(c, primaryGroup.field).toLowerCase() === groupVal.toLowerCase();
          } else {
            groupApps = filteredApps.filter(app => getFieldValue(app, primaryGroup.field).toLowerCase() === groupVal.toLowerCase());
          }

          const containerId = `group-${primaryGroup.field}-${groupVal}`;
          const content = renderGroupContentNodes(groupApps, containerId, 40, 40, capFilter);

          // Masonry assignment: choose the shortest column
          const minH = Math.min(...columnHeights);
          const col = columnHeights.indexOf(minH);
          const currentY = minH;

          columnHeights[col] += content.height + 80;
          colMaxW[col] = Math.max(colMaxW[col], content.width);

          let color = 'var(--primary)';
          if (primaryGroup.field === 'lifecycle') color = LIFECYCLE_STAGES.find(s => s.label.toLowerCase() === groupVal.toLowerCase())?.color || color;
          else {
            const entType = primaryGroup.entityType === 'Capability' ? 'Capability' : 'Application';
            const def = metaDefs.find(d => d.fieldName === primaryGroup.field && d.entityType === entType);
            if (def) color = getOverlayColor(groupVal, def, picklists).bg;
          }
          return { containerId, groupVal, color, col, currentY, width: content.width, height: content.height, nodes: content.nodes };
        });

        groups.forEach(g => {
          const currentX = colMaxW.slice(0, g.col).reduce((sum, w) => sum + w + 80, 0);
          allFinalNodes.push({
            id: g.containerId, data: { label: `${primaryGroup.field.toUpperCase()}: ${g.groupVal}` },
            position: { x: currentX, y: g.currentY },
            style: { background: isDark ? 'rgba(255,255,255,0.02)' : 'rgba(0,0,0,0.02)', border: `4px solid ${g.color}`, borderRadius: '32px', width: g.width, height: g.height, pointerEvents: 'none', zIndex: -100, fontSize: '20px', fontWeight: 900, color: g.color, textAlign: 'left', paddingLeft: '40px', paddingTop: '20px' }
          });
          allFinalNodes.push(...g.nodes);
        });

      } else {
        allFinalNodes.push(...renderGroupContentNodes(filteredApps, undefined, 0, 0).nodes);
      }

      // Restore activeCategoricalFilters calculation
      const activeCategoricalFilters: string[] = [];
      if (!groupingField) {
        if (filters.lifecycle?.length > 0) activeCategoricalFilters.push(`Lifecycle: ${filters.lifecycle.join(', ')}`);
        if (filters.owner?.length > 0) activeCategoricalFilters.push(`Owner: ${filters.owner.join(', ')}`);
        if (filters.type?.length > 0) activeCategoricalFilters.push(`Type: ${filters.type.join(', ')}`);
        if (filters.capabilityId?.length > 0) {
          const capNames = filters.capabilityId.map((id: string) => capabilities.find(c => c.id === id)?.name).filter(Boolean);
          activeCategoricalFilters.push(`Capabilities: ${capNames.join(', ')}`);
        }
        if (filters.criticality?.length > 0) activeCategoricalFilters.push(`Criticality: ${filters.criticality.join(', ')}`);
        if (filters.functionalFit?.length > 0) activeCategoricalFilters.push(`Functional Fit: ${filters.functionalFit.join(', ')}`);
        if (filters.technicalFit?.length > 0) activeCategoricalFilters.push(`Technical Fit: ${filters.technicalFit.join(', ')}`);
        
        if (filters.custom) {
          Object.entries(filters.custom).forEach(([field, vals]) => {
            if (vals && vals.length > 0) {
              const def = metaDefs.find(d => d.fieldName === field);
              activeCategoricalFilters.push(`${def?.label || field}: ${vals.join(', ')}`);
            }
          });
        }
      }

      if (activeCategoricalFilters.length > 0 && (mode === 'landscape' || mode === 'app-landscape')) {

      // Find bounding box of current nodes
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      allFinalNodes.forEach(n => {
        const x = n.position.x; const y = n.position.y;
        const w = n.width || (typeof n.style?.width === 'number' ? n.style.width : 300);
        const h = n.height || (typeof n.style?.height === 'number' ? n.style.height : 200);
        minX = Math.min(minX, x); minY = Math.min(minY, y); maxX = Math.max(maxX, x + w); maxY = Math.max(maxY, y + h);
      });
      const p = 60;
      allFinalNodes.unshift({ id: 'filter-container', data: { label: 'Filtered Inventory' }, position: { x: minX - p, y: minY - p - 40 }, style: { width: (maxX - minX) + p * 2, height: (maxY - minY) + p * 2 + 40, background: isDark ? 'rgba(255, 255, 255, 0.02)' : 'rgba(0, 0, 0, 0.02)', border: '2px solid var(--primary)', borderRadius: '24px', pointerEvents: 'none', zIndex: -100 } });
    }

    setNodes(allFinalNodes); setEdges([]);
    }
    }, [apps, filteredApps, categoricalFilteredApps, integrations, capabilities, metaDefs, picklists, mode, activeOverlay, activeCustomOverlays, showApplications, showCapabilities, hideOrphanApps, showCriticality, relationSearch, setNodes, setEdges, appOverlayDef, critDef, appCritDef, filters, groupingField, isDark]);
  useEffect(() => {
    if (nodes.length > 0 && visible && viewportWidth > 0) {
      const timer = setTimeout(() => {
        const currentNodes = getNodes(); if (currentNodes.length === 0) return;
        let minX = Infinity; let maxX = -Infinity;
        currentNodes.forEach(n => {
          const x = n.position.x; const w = n.width || (typeof n.style?.width === 'number' ? n.style.width : parseInt(n.style?.width as string)) || 200;
          minX = Math.min(minX, x); maxX = Math.max(maxX, x + w);
        });
        const zoom = Math.min(1, (viewportWidth - 120) / (maxX - minX));
        setViewport({ x: (viewportWidth - (maxX - minX) * zoom) / 2 - minX * zoom, y: 50, zoom }, { duration: 800 });
      }, 250);
      return () => clearTimeout(timer);
    }
  }, [nodes, visible, setViewport, getNodes]);

  const onNodeInternalClick = (_: any, node: Node) => {
    if (node.data.type === 'app') onNodeClick?.(node.data.original);
    else if (node.data.type === 'capability' && node.data.originalId !== 'unassigned') onCapabilityClick?.(node.data.original);
  };

  return (
    <ReactFlow
      nodes={nodes} edges={edges} onNodesChange={onNodesChange} onEdgesChange={onEdgesChange} onNodeClick={onNodeInternalClick}
      nodesDraggable={!lockNodes} nodesConnectable={false} elementsSelectable={!lockNodes} panOnDrag={true} zoomOnScroll={true} minZoom={0.01} maxZoom={4}
      nodeTypes={nodeTypes} edgeTypes={edgeTypes}
      style={{ width: '100%', height: '100%' }}
    >
      {(mode === 'landscape' || mode === 'app-landscape') && <LandscapeArt isDark={isDark} />}
      {mode === 'network' && <NetworkArt isDark={isDark} />}
      <Background color="var(--border)" gap={20} />
      <Controls showInteractive={false} />
      <Panel position="top-right" style={{ 
        background: 'var(--card)', 
        padding: '10px 14px', 
        borderRadius: '10px', 
        border: '1px solid var(--border)', 
        fontSize: '12px', 
        color: 'var(--foreground)', 
        boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
        display: 'flex',
        flexDirection: 'column',
        gap: '8px',
        minWidth: '180px'
      }}>
        <div style={{ fontSize: '11px', fontWeight: 700, borderBottom: '1px solid var(--border)', paddingBottom: '6px', marginBottom: '2px' }}>
          {mode === 'network' ? 'Integrations' : (mode === 'landscape' ? 'Capability Landscape' : 'Application Landscape')}
        </div>
        <div style={{ display: 'flex', gap: '6px' }}>
          <button 
            onClick={toggleFullscreen}
            title={isFullscreen ? "Exit Presentation Mode" : "Presentation Mode (Fullscreen)"}
            style={{
              background: isFullscreen ? 'var(--primary)' : 'transparent',
              color: isFullscreen ? 'var(--primary-foreground)' : 'var(--muted-foreground)',
              border: `1px solid ${isFullscreen ? 'var(--primary)' : 'var(--border)'}`,
              borderRadius: '6px',
              padding: '0 8px',
              height: '28px',
              flex: 1,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '6px',
              cursor: 'pointer',
              transition: 'all 0.2s',
              fontSize: '10px',
              fontWeight: 700,
              textTransform: 'uppercase'
            }}
          >
            {isFullscreen ? <Minimize size={12} /> : <Maximize size={12} />}
            {isFullscreen ? 'Exit' : 'Present'}
          </button>
          <button 
            onClick={() => setLockNodes(!lockNodes)}
            title={lockNodes ? "Unlock nodes to move them" : "Lock nodes in place"}
            style={{
              background: lockNodes ? 'transparent' : 'var(--primary)',
              color: lockNodes ? 'var(--muted-foreground)' : 'var(--primary-foreground)',
              border: `1px solid ${lockNodes ? 'var(--border)' : 'var(--primary)'}`,
              borderRadius: '6px',
              padding: '0 8px',
              height: '28px',
              flex: 1,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '6px',
              cursor: 'pointer',
              transition: 'all 0.2s',
              fontSize: '10px',
              fontWeight: 700,
              textTransform: 'uppercase'
            }}
          >
            {lockNodes ? <Lock size={12} /> : <Unlock size={12} />}
            {lockNodes ? 'Locked' : 'Unlocked'}
          </button>
        </div>
        <div style={{ fontSize: '10px', opacity: 0.7, borderTop: '1px solid var(--border)', paddingTop: '6px' }}>
          {lockNodes ? 'Click objects to edit • Drag to pan' : 'Drag nodes to reposition • Selection enabled'}
        </div>
      </Panel>
      <Panel position="top-left" style={{ 
        background: 'var(--card)', 
        padding: '12px', 
        borderRadius: '12px', 
        border: '1px solid var(--border)', 
        fontSize: '11px', 
        color: 'var(--foreground)', 
        boxShadow: '0 4px 12px rgba(0,0,0,0.15)', 
        maxWidth: '220px', 
        display: 'flex', 
        flexDirection: 'column', 
        gap: '16px',
        margin: 0,
        transform: `translate(${legendPos.x}px, ${legendPos.y}px)`,
        cursor: 'grab',
        userSelect: 'none',
        zIndex: 1000
      }} onMouseDown={onLegendMouseDown}>

          <div>
            <div style={{ fontWeight: 700, marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.025em', fontSize: '10px', color: 'var(--muted-foreground)' }}>Business Criticality</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              {mode === 'landscape' && !showCriticality ? ( <div style={{ fontStyle: 'italic', color: 'var(--muted-foreground)', fontSize: '10px' }}>Toggled Off</div> ) : ( picklists?.find(p => p.name === 'criticality')?.options.map(opt => ( <div key={opt.value} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}><div style={{ width: '12px', height: '12px', borderRadius: '3px', background: opt.color, border: `1px solid ${isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.05)'}` }} /><span>{opt.label}</span></div> )) )}
            </div>
          </div>

          {groupingField && (
            <div>
              <div style={{ fontWeight: 700, marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.025em', fontSize: '10px', color: 'var(--primary)' }}>Grouped By: {groupingField === 'lifecycle' ? 'Lifecycle' : (groupingField === 'criticality' ? 'Business Criticality' : (groupingField === 'functionalFit' ? 'Functional Fit' : 'Technical Fit'))}</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                {groupingField === 'lifecycle' ? (
                  LIFECYCLE_STAGES.map(stage => (
                    <div key={stage.label} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <div style={{ width: '12px', height: '12px', borderRadius: '3px', background: isDark ? stage.color : stage.lightColor, border: `1px solid ${isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.05)'}` }} />
                      <span>{stage.label}</span>
                    </div>
                  ))
                ) : (
                  picklists?.find(p => p.name.replace(/_/g, '').toLowerCase() === groupingField?.toLowerCase())?.options.map(opt => (
                    <div key={opt.value} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <div style={{ width: '12px', height: '12px', borderRadius: '3px', background: opt.color, border: `1px solid ${isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.05)'}` }} />
                      <span>{opt.label}</span>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}

          <div>
            <div style={{ fontWeight: 700, marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.025em', fontSize: '10px', color: 'var(--muted-foreground)' }}>Application {activeOverlay === 'lifecycle' ? 'Lifecycle' : (activeOverlay === 'criticality' ? 'Business Criticality' : (activeOverlay === 'functionalFit' ? 'Functional Fit' : (activeOverlay === 'technicalFit' ? 'Technical Fit' : 'Overlay')))}</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              {activeOverlay === 'lifecycle' ? ( LIFECYCLE_STAGES.map(stage => ( <div key={stage.label} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}><div style={{ width: '12px', height: '12px', borderRadius: '3px', background: isDark ? stage.color : stage.lightColor, border: `1px solid ${isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.05)'}` }} /><span>{stage.label}</span></div> )) ) : ( picklists?.find(p => p.name.replace(/_/g, '').toLowerCase() === activeOverlay?.toLowerCase())?.options.map(opt => ( <div key={opt.value} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}><div style={{ width: '12px', height: '12px', borderRadius: '3px', background: opt.color, border: `1px solid ${isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.05)'}` }} /><span>{opt.label}</span></div> )) )}
            </div>
          </div>
        </Panel>
      </ReactFlow>
  );
};

export const ApplicationDiagram = (props: Props) => {
  const containerRef = useRef<HTMLDivElement>(null);
  return (
    <div ref={containerRef} style={{ width: '100%', height: '100%', background: 'var(--background)' }}>
      <ReactFlowProvider>
        <DiagramInner {...props} containerRef={containerRef} />
      </ReactFlowProvider>
    </div>
  );
};
