import { useEffect, useMemo, useState, useRef, useCallback } from 'react';
import ReactFlow, { 
  Background, 
  Controls, 
  Panel,
  useNodesState,
  useEdgesState,
  MarkerType,
  useReactFlow,
  useStore,
  useNodesInitialized,
  getBezierPath,
  getNodesBounds,
  getTransformForBounds,
  type Node,
  type Edge,
  type EdgeProps,
  ReactFlowProvider
} from 'reactflow';
import 'reactflow/dist/style.css';
import dagre from '@dagrejs/dagre';
import { toPng } from 'html-to-image';
import { Database, Boxes, Lock, Unlock, Maximize, Minimize, Map as MapIcon, ChevronDown, ChevronRight, Download, Loader2 } from 'lucide-react';

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
interface InformationObject {
  id: string;
  name: string;
  [key: string]: any;
}

interface Integration {
  id: string;
  sourceAppId: string;
  targetAppId: string;
  name?: string;
  infoObjectId?: string | null;
  pattern?: string;
  frequency?: string;
  crud?: string;
  payload?: InformationObject;
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
  onIntegrationClick?: (integration: Integration) => void;
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

const TIME_STAGES = [
  { value: 'TOLERATE', label: 'Tolerate', color: '#228be6', lightColor: 'rgba(34, 139, 230, 0.15)' },
  { value: 'INVEST', label: 'Invest', color: '#2b8a3e', lightColor: 'rgba(43, 138, 62, 0.15)' },
  { value: 'MIGRATE', label: 'Migrate', color: '#e67700', lightColor: 'rgba(230, 119, 0, 0.15)' },
  { value: 'ELIMINATE', label: 'Eliminate', color: '#c92a2a', lightColor: 'rgba(201, 42, 42, 0.15)' },
];

const getTimeValueForApp = (app: Application) => {
  const tech = Number(app.technicalFit);
  const func = Number(app.functionalFit);
  const hasTech = !isNaN(tech) && tech > 0;
  const hasFunc = !isNaN(func) && func > 0;
  if (!hasTech && !hasFunc) return null;

  const tVal = hasTech ? Math.max(1, Math.min(5, tech)) : 3;
  const fVal = hasFunc ? Math.max(1, Math.min(5, func)) : 3;
  const isTechHigh = tVal >= 3;
  const isFuncHigh = fVal >= 3;

  if (!isTechHigh && isFuncHigh) return 'MIGRATE';
  if (isTechHigh && isFuncHigh) return 'INVEST';
  if (isTechHigh && !isFuncHigh) return 'TOLERATE';
  return 'ELIMINATE';
};

const getTimeColor = (app: Application, isDark: boolean) => {
  const timeVal = getTimeValueForApp(app);
  if (!timeVal) return { bg: isDark ? '#2c2e33' : '#f1f3f5', text: 'var(--foreground)' };
  const stage = TIME_STAGES.find(s => s.value === timeVal);
  if (!stage) return { bg: isDark ? '#2c2e33' : '#f1f3f5', text: 'var(--foreground)' };
  const bg = isDark ? stage.color : stage.lightColor;
  return { bg, text: isDark ? getContrastColor(stage.color) : stage.color };
};

const getLifecycleColor = (lifecycle: string, isDark: boolean, picklists?: Picklist[]) => {
  if (picklists) {
    const picklist = picklists.find(p => p.name === 'lifecycle');
    if (picklist) {
      const option = picklist.options.find(o => o.value.toLowerCase() === lifecycle.toLowerCase() || o.label.toLowerCase() === lifecycle.toLowerCase());
      if (option && option.color) return { bg: option.color, text: getContrastColor(option.color) };
    }
  }
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

const PineTree = ({ size = 60, opacity = 0.35 }: { size?: number; opacity?: number }) => (
  <svg style={{ width: size * 0.5, height: size, display: 'block' }} viewBox="0 0 30 60">
    <g fill="currentColor" opacity={opacity}>
      <polygon points="15,4 6,22 24,22" />
      <polygon points="15,16 3,38 27,38" />
      <polygon points="15,28 0,54 30,54" />
      <rect x="13" y="54" width="4" height="6" />
    </g>
  </svg>
);

const Cloud = ({ width = 120, opacity = 0.2 }: { width?: number; opacity?: number }) => (
  <svg style={{ width, height: width * 0.4, display: 'block' }} viewBox="0 0 100 40">
    <g fill="currentColor" opacity={opacity}>
      <ellipse cx="22" cy="26" rx="20" ry="12" />
      <ellipse cx="50" cy="20" rx="26" ry="16" />
      <ellipse cx="78" cy="26" rx="20" ry="12" />
    </g>
  </svg>
);

const LandscapeArt = ({ isDark }: { isDark: boolean }) => (
  <div style={{ position: 'absolute', inset: 0, overflow: 'hidden', pointerEvents: 'none', zIndex: 0, opacity: isDark ? 0.07 : 0.04 }}>
    {/* Sun/Moon — fixed-size, top-right corner so it stays round at any aspect ratio */}
    <svg style={{ position: 'absolute', top: '10%', right: '8%', width: '110px', height: '110px' }} viewBox="0 0 100 100">
      <circle cx="50" cy="50" r="50" fill="currentColor" opacity="0.25" />
    </svg>

    {/* Birds — fixed-size, upper-left */}
    <svg style={{ position: 'absolute', top: '22%', left: '14%', width: '90px', height: '40px' }} viewBox="0 0 90 40">
      <g opacity="0.35" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
        <path d="M5 18 Q 12 8 19 18 Q 26 8 33 18" />
        <path d="M48 30 Q 55 20 62 30 Q 69 20 76 30" />
      </g>
    </svg>

    {/* Drifting clouds */}
    <div style={{ position: 'absolute', top: '14%', left: '38%' }}><Cloud width={140} opacity={0.18} /></div>
    <div style={{ position: 'absolute', top: '28%', left: '62%' }}><Cloud width={100} opacity={0.14} /></div>

    {/* Ridges — stretched horizontally at the bottom; vertical proportions stay consistent */}
    <svg style={{ position: 'absolute', bottom: 0, left: 0, width: '100%', height: '45%', minHeight: '180px' }} preserveAspectRatio="none" viewBox="0 0 1200 400" xmlns="http://www.w3.org/2000/svg">
      {/* Distant Ridge */}
      <path d="M0 110 C 300 30 600 200 900 70 C 1100 -10 1200 30 1200 30 L 1200 400 L 0 400 Z" fill="currentColor" opacity="0.1" />
      {/* Mid Ridge */}
      <path d="M0 220 C 400 130 800 320 1200 180 L 1200 400 L 0 400 Z" fill="currentColor" opacity="0.2" />
      {/* Near Ridge */}
      <path d="M0 310 C 600 260 1000 380 1200 300 L 1200 400 L 0 400 Z" fill="currentColor" opacity="0.3" />
    </svg>

    {/* Tree clusters — fixed-size, anchored above the bottom so they sit on the ridges */}
    <div style={{ position: 'absolute', bottom: '24%', left: '8%', display: 'flex', alignItems: 'flex-end', gap: '4px' }}>
      <PineTree size={48} opacity={0.4} />
      <PineTree size={68} opacity={0.5} />
      <PineTree size={42} opacity={0.35} />
    </div>
    <div style={{ position: 'absolute', bottom: '18%', right: '12%', display: 'flex', alignItems: 'flex-end', gap: '6px' }}>
      <PineTree size={56} opacity={0.4} />
      <PineTree size={80} opacity={0.55} />
    </div>
    <div style={{ position: 'absolute', bottom: '32%', left: '46%' }}>
      <PineTree size={36} opacity={0.3} />
    </div>
    <div style={{ position: 'absolute', bottom: '12%', left: '32%' }}>
      <PineTree size={64} opacity={0.45} />
    </div>
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
          style={{ pointerEvents: 'none', overflow: 'visible' }}
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
              pointerEvents: 'auto',
              cursor: 'pointer'
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
  // Normalize field names for matching: application_type, applicationType, ApplicationType -> applicationtype
  const normalize = (s: string) => s.toLowerCase().replace(/_/g, '').replace(/\s+/g, '');
  const fieldKey = normalize(def.fieldName);
  const picklist = picklists.find(p => normalize(p.name) === fieldKey);
  
  if (picklist) {
    const valStr = String(value);
    // Priority 1: Exact value match
    // Priority 2: Exact label match
    let option = picklist.options.find(o => String(o.value) === valStr || o.label === valStr);
    
    // Priority 3: Numeric rounding match (for range fields)
    if (!option && !isNaN(Number(value))) {
      const rounded = Math.round(Number(value));
      option = picklist.options.find(o => String(o.value) === String(rounded));
    }
    
    if (option && option.color) return { bg: option.color, text: getContrastColor(option.color) };
  }

  // Fallback to interpolation for numeric ranges
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
  onIntegrationClick,
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
  const { setViewport, getNodes, fitView } = useReactFlow();
  const viewportWidth = useStore((s) => s.width);
  const nodesInitialized = useNodesInitialized();
  const lastFitKey = useRef<string>('');
  const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
  const [lockNodes, setLockNodes] = useState(true);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [windowWidth, setWindowWidth] = useState(typeof window !== 'undefined' ? window.innerWidth : 1200);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const handleResize = () => setWindowWidth(window.innerWidth);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const onExport = async () => {
    const viewport = document.querySelector('.react-flow__viewport') as HTMLElement;
    if (!viewport) return;

    setIsExporting(true);
    try {
      const nodes = getNodes();
      const bounds = getNodesBounds(nodes);
      const imageWidth = bounds.width + 100;
      const imageHeight = bounds.height + 100;

      const dataUrl = await toPng(viewport, {
        backgroundColor: isDark ? '#1a1b1e' : '#f8f9fa',
        width: imageWidth,
        height: imageHeight,
        style: {
          width: `${imageWidth}px`,
          height: `${imageHeight}px`,
          transform: `translate(${-bounds.x + 50}px, ${-bounds.y + 50}px) scale(1)`,
        },
      });

      const link = document.createElement('a');
      link.download = `openea-diagram-${mode}-${new Date().toISOString().split('T')[0]}.png`;
      link.href = dataUrl;
      link.click();
    } catch (err) {
      console.error('Export failed:', err);
    } finally {
      setIsExporting(false);
    }
  };

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
  const [isLegendExpanded, setIsLegendExpanded] = useState(true);
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

  const getFieldLabel = (field: string) => {
    if (field === 'lifecycle') return 'Lifecycle';
    if (field === 'time') return 'TIME Assessment';
    return metaDefs.find(d => d.fieldName === field)?.label || field;
  };

  const getCustomLabels = useCallback((entity: any, entityType: string) => {
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
            const normalize = (s: string) => s.toLowerCase().replace(/_/g, '').replace(/\s+/g, '');
            const fieldKey = normalize(d.fieldName);
            const picklist = picklists?.find(p => normalize(p.name) === fieldKey);

            if (picklist) {
              const opt = picklist.options.find((o: any) => String(o.value) === valStr || o.label === valStr);
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
  }, [activeCustomOverlays, metaDefs, picklists]);

  useEffect(() => {
    if (!apps || !capabilities || !metaDefs || !picklists || apps.length === 0 || capabilities.length === 0) return;

    const borderColor = 'var(--border)';
    const groupBg = isDark ? 'rgba(37, 38, 43, 0.6)' : 'rgba(255, 255, 255, 0.6)';

    const getCapScore = (capId: string): number => {
      const cap = capabilities.find(c => c.id === capId);
      if (!cap) return 0;
      const localVal = Number(cap.criticality || 1);
      const childMax = capabilities
        .filter(c => c.parentId === capId)
        .map(c => getCapScore(c.id));
      return childMax.length > 0 ? Math.max(localVal, ...childMax) : localVal;
    };

    const getAppScore = (app: Application, fieldName: string, def?: MetadataDefinition) => {
      const localVal = Number((app as any)[fieldName] || safeJsonParse(app.metadata)[fieldName] || (def ? def.min : 1));
      
      if (fieldName === 'criticality' && app.capabilities && app.capabilities.length > 0) {
        const capScores = app.capabilities.map((c: any) => getCapScore(c.id)).filter((n: number) => !isNaN(n) && n > 0);
        
        if (capScores.length > 0) {
          return Math.max(...capScores);
        }
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
      if (field === 'time') {
        return getTimeValueForApp(app) || 'Unassessed';
      }
      const val = (app as any)[field] || safeJsonParse(app.metadata)[field];
      return val ? String(val) : 'Unspecified';
    };

    const getCapFieldValue = (cap: Capability, field: string) => {
      if (field === 'criticality') {
        return String(getCapScore(cap.id));
      }
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

        // Apply Information Type filter if present
        if (filters.infoType && filters.infoType.length > 0) {
          if (!i.payload || !i.payload.type || !filters.infoType.includes(i.payload.type)) return false;
        }

        if (search) {
          const iMatches = i.payload?.name?.toLowerCase().includes(search) || 
                          i.pattern?.toLowerCase().includes(search) ||
                          i.crud?.toLowerCase().includes(search);
                          
          const appMatchesSearch = (app: Application) => {
            return app.name.toLowerCase().includes(search) || 
              app.description?.toLowerCase().includes(search) ||
              app.owner?.toLowerCase().includes(search) ||
              app.lifecycle?.toLowerCase().includes(search) ||
              app.type?.toLowerCase().includes(search) ||
              app.capabilities?.some(c => c.name.toLowerCase().includes(search)) ||
              app.metadata?.toLowerCase().includes(search);
          };

          const sMatches = appMatchesSearch(sourceApp);
          const tMatches = appMatchesSearch(targetApp);
          
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
          if (activeOverlay === 'lifecycle') colors = getLifecycleColor(app.lifecycle, isDark, picklists);
          else if (activeOverlay === 'time') colors = getTimeColor(app, isDark);
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
            style: { background: colors.bg, color: colors.text, border: `1px solid ${isDark ? 'rgba(255,255,255,0.1)' : borderColor}`, borderRadius: '12px', width: nodeWidth, fontSize: '13px', fontWeight: 600, textAlign: 'center', padding: '12px', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)', cursor: 'pointer' }
          });
        });
        filteredIntegrations.forEach(i => {
          if (islandAppIds.includes(i.sourceAppId)) {
            islandEdges.push({
              id: `e-${i.id}`, source: i.sourceAppId, target: i.targetAppId,
              label: i.payload?.name ? `${i.payload.name} (${i.pattern || 'API'})` : (i.pattern || 'API'),
              type: 'centered',
              data: { original: i },
              style: { stroke: isDark ? '#5c5f66' : '#adb5bd', strokeWidth: 2, cursor: 'pointer' },
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
        if (filters.infoType?.length > 0) activeCategoricalFilters.push(`Info Type: ${filters.infoType.join(', ')}`);
        if (filters.custom) {
          Object.entries(filters.custom).forEach(([field, vals]) => {
            if (vals && (vals as any[]).length > 0) {
              const def = metaDefs.find(d => d.fieldName === field);
              activeCategoricalFilters.push(`${def?.label || field}: ${(vals as any[]).join(', ')}`);
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
          if (!cap) return false;
          const matchesFilter = !capFilter || (cap && capFilter(cap));
          
          // Match if capability name matches search query
          const nameMatches = relationSearch && cap.name.toLowerCase().includes(relationSearch.toLowerCase());
          
          let res = (matchesFilter && (hasApps || nameMatches)) || children.some(c => isRelevant(c.id));
          
          // In capability landscape mode, if no active search or categorical filter is present,
          // we should show the full capability hierarchy even if some nodes have no apps.
          const hasAnyAppFilter = filters.owner?.length > 0 || 
                                 filters.lifecycle?.length > 0 || 
                                 filters.type?.length > 0 || 
                                 filters.criticality?.length > 0 ||
                                 filters.functionalFit?.length > 0 ||
                                 filters.technicalFit?.length > 0 ||
                                 filters.capabilityId?.length > 0 ||
                                 (filters.custom && Object.values(filters.custom).some(v => (v as any[]).length > 0));

          if (mode === 'landscape' && !relationSearch && !capFilter && !hasAnyAppFilter) {
            res = true;
          }

          memoRelevant.set(capId, res); return res;
        };

        const renderCap = (capId: string, parentNodeId: string | undefined, depth = 0, rootX = 0, rootY = 0, targetWidth?: number): { width: number; height: number } => {
          const cap = capsMap.get(capId);
          if (!cap || !isRelevant(capId)) return { width: 0, height: 0 };

          const children = capabilities.filter(c => c.parentId === capId && isRelevant(c.id));
          const associatedApps = showApplications ? (appsByCap.get(capId) || []) : [];

          const padding = 8;
          const titleHeight = 34;
          const appChipW = 140;
          const appChipH = 26;
          const appGap = 4;
          const childGap = 5;

          // Inner width available for content
          const innerW = Math.max(170, (targetWidth || 250) - padding * 2);

          // Render children recursively — pass inner width so they fill the parent
          const childLayouts = children.map(child => ({
            id: child.id,
            ...renderCap(child.id, `cap-${containerId || 'main'}-${capId}`, depth + 1, 0, 0, innerW)
          }));

          // Effective inner width: the widest of desired innerW, any wider child, or the apps grid
          const appCols = Math.max(1, Math.floor((innerW + appGap) / (appChipW + appGap)));
          const appsGridW = associatedApps.length > 0
            ? Math.min(associatedApps.length, appCols) * (appChipW + appGap) - appGap
            : 0;
          const maxChildW = childLayouts.length > 0 ? Math.max(...childLayouts.map(l => l.width)) : 0;
          const effectiveInnerW = Math.max(innerW, maxChildW, appsGridW);

          // Stack children vertically (capCols = 1 — prevents width doubling at each depth)
          let childY = titleHeight;
          childLayouts.forEach((l, i) => {
            const nIdx = groupNodes.findIndex(n => n.id === `cap-${containerId || 'main'}-${children[i].id}`);
            if (nIdx !== -1) {
              groupNodes[nIdx].position = { x: padding, y: childY };
              // Stretch child to fill the effective inner width; never let it exceed parent bounds
              if (groupNodes[nIdx].style) (groupNodes[nIdx].style as any).width = effectiveInnerW;
            }
            childY += l.height + childGap;
          });

          // Apps rendered as compact chips below children
          const appRows = associatedApps.length > 0 ? Math.ceil(associatedApps.length / appCols) : 0;
          const appsStartY = childY + (children.length > 0 ? childGap : 0);

          associatedApps.forEach((app, i) => {
            const c = i % appCols; const r = Math.floor(i / appCols);
            let colors = { bg: 'var(--card)', text: 'var(--foreground)' };
            if (activeOverlay === 'lifecycle') colors = getLifecycleColor(app.lifecycle, isDark, picklists);
            else if (activeOverlay === 'time') colors = getTimeColor(app, isDark);
            else if (appOverlayDef) colors = getOverlayColor(getAppScore(app, activeOverlay!, appOverlayDef), appOverlayDef, picklists);

            groupNodes.push({
              id: `app-${containerId || 'main'}-${capId}-${app.id}`, parentNode: `cap-${containerId || 'main'}-${capId}`,
              data: { label: (
                <div style={{ display: 'flex', alignItems: 'center', gap: '4px', width: '100%', overflow: 'hidden' }}>
                  <Database size={9} style={{ flexShrink: 0, opacity: 0.7 }} />
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: '10px' }}>{app.name}</span>
                  {getCustomLabels(app, 'Application').length > 0 && <div style={{ display: 'flex', gap: '1.5px', marginLeft: 'auto', flexShrink: 0 }}>{getCustomLabels(app, 'Application')}</div>}
                </div>
              ), type: 'app', original: app },
              position: { x: padding + c * (appChipW + appGap), y: appsStartY + r * (appChipH + appGap) },
              style: { background: colors.bg, color: colors.text, border: `1px solid ${isDark ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.1)'}`, borderRadius: '5px', width: appChipW, height: appChipH, display: 'flex', alignItems: 'center', padding: '0 5px', fontSize: '10px', fontWeight: 600, overflow: 'hidden', zIndex: 100, cursor: 'pointer' }
            });
          });

          const appsH = appRows > 0 ? appRows * (appChipH + appGap) - appGap : 0;
          // +padding on bottom, +1 extra pixel insurance so border doesn't clip last row
          const finalHeight = appsStartY + appsH + padding + 1;
          const finalWidth = effectiveInnerW + padding * 2;

          const capColors = (showCriticality && critDef)
            ? getOverlayColor(getCapScore(capId), critDef, picklists)
            : {
                bg: depth === 0 ? groupBg : (isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.025)'),
                text: 'var(--foreground)'
              };

          groupNodes.unshift({
            id: `cap-${containerId || 'main'}-${capId}`, parentNode: parentNodeId,
            data: { label: (
              <div style={{ display: 'flex', alignItems: 'center', gap: '5px', width: '100%', overflow: 'hidden', padding: '0 2px' }}>
                <Boxes size={depth === 0 ? 14 : 11} style={{ flexShrink: 0 }} />
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: depth === 0 ? '12px' : '11px' }}>{cap.name}</span>
                {getCustomLabels(cap, 'Capability').length > 0 && <div style={{ display: 'flex', gap: '1.5px', marginLeft: 'auto', flexShrink: 0 }}>{getCustomLabels(cap, 'Capability')}</div>}
              </div>
            ), type: 'capability', originalId: capId, original: cap },
            position: { x: rootX, y: rootY },
            style: {
              background: capColors.bg,
              border: `${depth === 0 ? 2 : 1}px ${depth === 0 ? 'solid' : 'dashed'} ${isDark ? 'rgba(255,255,255,0.18)' : 'rgba(0,0,0,0.1)'}`,
              width: finalWidth, height: finalHeight,
              borderRadius: depth === 0 ? '10px' : '7px',
              color: capColors.text, fontWeight: depth === 0 ? 800 : 700,
              fontSize: depth === 0 ? '12px' : '11px',
              display: 'flex', alignItems: 'flex-start', justifyContent: 'flex-start',
              paddingTop: '8px', paddingLeft: '4px',
              cursor: 'pointer',
              zIndex: 10 + depth
            }
          });
          return { width: finalWidth, height: finalHeight };
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
          if (activeOverlay === 'lifecycle') colors = getLifecycleColor(app.lifecycle, isDark, picklists);
          else if (activeOverlay === 'time') colors = getTimeColor(app, isDark);
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
            style: { background: colors.bg, color: colors.text, border: `2px solid ${isDark ? 'rgba(255,255,255,0.1)' : borderColor}`, borderRadius: '16px', width: nodeW, height: nodeH, fontWeight: 800, fontSize: '14px', textAlign: 'center', display: 'flex', justifyContent: 'center', alignItems: 'flex-start', paddingTop: '16px', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)', cursor: 'pointer' }
          });

          associatedCaps.forEach((c, i) => {
            if (!showCapabilities) return;
            const fullCap = capabilities.find(ac => ac.id === c.id);
            const col = i % innerCols; const row = Math.floor(i / innerCols);
            let capColors = { bg: 'var(--secondary)', text: 'var(--foreground)' };
            if (critDef && fullCap) capColors = getOverlayColor(getCapScore(fullCap.id), critDef, picklists);
            groupNodes.push({
              id: `cap-in-app-${containerId || 'main'}-${app.id}-${c.id}`, parentNode: `app-node-${containerId || 'main'}-${app.id}`,
              data: { label: (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '2px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}><Boxes size={12} /><span>{c.name}</span></div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '2px', justifyContent: 'center' }}>{getCustomLabels(fullCap, 'Capability')}</div>
                </div>
              ), type: 'capability', original: fullCap },
              position: { x: padding + col * (childW + gap), y: headerH + row * (childH + gap) },
              style: { background: capColors.bg, color: capColors.text, border: `1px solid ${isDark ? 'rgba(255,255,255,0.1)' : borderColor}`, borderRadius: '8px', width: childW, height: childH, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '12px', fontWeight: 600, zIndex: 100, cursor: 'pointer' }
            });
          });
          return { width: nodeW, height: nodeH };
        };

        if (mode === 'landscape') {
          const roots = capabilities.filter(c => !c.parentId);
          const relevantRoots = roots.filter(r => isRelevant(r.id));
          
          // Dynamic columns based on width and count
          let colCount = 2;
          if (windowWidth > 2400) colCount = 6;
          else if (windowWidth > 2000) colCount = 5;
          else if (windowWidth > 1600) colCount = 4;
          else if (windowWidth > 1200) colCount = 3;
          else if (windowWidth < 800) colCount = 1;
          
          // Don't have more columns than roots
          colCount = Math.min(colCount, relevantRoots.length || 1);

          const colGap = 16;
          const rowGap = 14;
          const colStartW = 250;
          const colHeights = new Array(colCount).fill(0);
          const colWidths = new Array(colCount).fill(colStartW);

          // First pass: render all root caps and track column heights/widths
          const nodeAssignments = relevantRoots.map(root => {
            const minH = Math.min(...colHeights);
            const cIdx = colHeights.indexOf(minH);
            const layout = renderCap(root.id, containerId, 0, 0, 0, colWidths[cIdx]);

            colWidths[cIdx] = Math.max(colWidths[cIdx], layout.width);
            const currentY = colHeights[cIdx];
            colHeights[cIdx] += layout.height + rowGap;

            return { root, cIdx, currentY, layout };
          });

          // Second pass: position using final column widths, then measure true bounds
          let maxRight = 0;
          let maxBottom = 0;
          nodeAssignments.forEach(asgn => {
            const nIdx = groupNodes.findIndex(n => n.id === `cap-${containerId || 'main'}-${asgn.root.id}`);
            const xPos = colWidths.slice(0, asgn.cIdx).reduce((sum, w) => sum + w + colGap, 0);
            const nodeX = xPos + baseOffsetX + 20;
            const nodeY = asgn.currentY + baseOffsetY + 50;
            if (nIdx !== -1) {
              groupNodes[nIdx].position = { x: nodeX, y: nodeY };
            }
            maxRight = Math.max(maxRight, nodeX + asgn.layout.width);
            maxBottom = Math.max(maxBottom, nodeY + asgn.layout.height);
          });

          return {
            nodes: groupNodes,
            width: Math.max(maxRight + 24, 300),
            height: Math.max(maxBottom + 24, 200)
          };
        } else {
          let colCount = 2;
          if (windowWidth > 2000) colCount = 4;
          else if (windowWidth > 1400) colCount = 3;
          else if (windowWidth < 800) colCount = 1;
          
          const colHeights = new Array(colCount).fill(0);
          const colWidths = new Array(colCount).fill(400); // More room for app detail in landscape
          
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

        // Calculate masonry grid for the top-level groups (e.g. LifeCycle groups)
        let colCount = 2;
        if (windowWidth > 2000) colCount = 4;
        else if (windowWidth > 1400) colCount = 3;
        else if (windowWidth < 800) colCount = 1;
        
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
          if (primaryGroup.field === 'lifecycle') {
            color = getLifecycleColor(groupVal, isDark, picklists).bg;
          } else {
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
        if (filters.infoType?.length > 0) activeCategoricalFilters.push(`Info Type: ${filters.infoType.join(', ')}`);
        if (filters.custom) {
          Object.entries(filters.custom).forEach(([field, vals]) => {
            if (vals && (vals as any[]).length > 0) {
              const def = metaDefs.find(d => d.fieldName === field);
              activeCategoricalFilters.push(`${def?.label || field}: ${(vals as any[]).join(', ')}`);
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
  }, [apps, filteredApps, categoricalFilteredApps, integrations, capabilities, metaDefs, picklists, mode, activeOverlay, activeCustomOverlays, showApplications, showCapabilities, hideOrphanApps, showCriticality, relationSearch, setNodes, setEdges, appOverlayDef, critDef, appCritDef, filters, groupingField, isDark, getCustomLabels, windowWidth]);
  useEffect(() => {
    const fitKey = `${nodes.length}-${visible}-${viewportWidth}-${mode}-${relationSearch}`;
    if (nodes.length > 0 && visible && viewportWidth > 0 && nodesInitialized && lastFitKey.current !== fitKey) {
      const timer = setTimeout(() => {
        const currentNodes = getNodes(); if (currentNodes.length === 0) return;
        let minX = Infinity; let maxX = -Infinity;
        currentNodes.forEach(n => {
          const x = n.position.x; 
          const w = n.width || (typeof n.style?.width === 'number' ? n.style.width : parseInt(n.style?.width as string)) || 200;
          minX = Math.min(minX, x); maxX = Math.max(maxX, x + w);
        });
        if (minX === Infinity || maxX === -Infinity) return;
        const zoom = Math.min(1, (viewportWidth - 120) / (maxX - minX));
        setViewport({ x: (viewportWidth - (maxX - minX) * zoom) / 2 - minX * zoom, y: 50, zoom }, { duration: 800 });
        lastFitKey.current = fitKey;
      }, 150);
      return () => clearTimeout(timer);
    }
  }, [nodes, visible, viewportWidth, nodesInitialized, mode, relationSearch, setViewport, getNodes]);

  const onNodeInternalClick = (_: any, node: Node) => {
    if (node.data.type === 'app') onNodeClick?.(node.data.original);
    else if (node.data.type === 'capability' && node.data.originalId !== 'unassigned') onCapabilityClick?.(node.data.original);
  };

  const onEdgeInternalClick = (_: any, edge: Edge) => {
    const integration = edge.data?.original as Integration | undefined;
    if (integration) onIntegrationClick?.(integration);
  };

  return (
    <ReactFlow
      nodes={nodes} edges={edges} onNodesChange={onNodesChange} onEdgesChange={onEdgesChange} onNodeClick={onNodeInternalClick} onEdgeClick={onEdgeInternalClick}
      nodesDraggable={!lockNodes} nodesConnectable={false} elementsSelectable={!lockNodes} panOnDrag={true} zoomOnScroll={true} minZoom={0.01} maxZoom={4}
      nodeTypes={nodeTypes} edgeTypes={edgeTypes}
      style={{ width: '100%', height: '100%' }}
    >
      {(mode === 'landscape' || mode === 'app-landscape') && <LandscapeArt isDark={isDark} />}
      {mode === 'network' && <NetworkArt isDark={isDark} />}
      <Background color="transparent" />
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
        minWidth: '220px'
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
            onClick={onExport}
            disabled={isExporting}
            title="Export diagram as PNG"
            style={{
              background: 'transparent',
              color: 'var(--muted-foreground)',
              border: '1px solid var(--border)',
              borderRadius: '6px',
              padding: '0 8px',
              height: '28px',
              flex: 1,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '6px',
              cursor: isExporting ? 'wait' : 'pointer',
              transition: 'all 0.2s',
              fontSize: '10px',
              fontWeight: 700,
              textTransform: 'uppercase',
              opacity: isExporting ? 0.6 : 1
            }}
          >
            {isExporting ? <Loader2 size={12} className="spin" /> : <Download size={12} />}
            {isExporting ? '...' : 'Export'}
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
        padding: isLegendExpanded ? '16px' : '8px 12px', 
        borderRadius: '12px', 
        border: '1px solid var(--border)', 
        fontSize: '11px', 
        color: 'var(--foreground)', 
        boxShadow: '0 4px 12px rgba(0,0,0,0.15)', 
        width: isLegendExpanded ? '220px' : 'auto', 
        display: 'flex', 
        flexDirection: 'column', 
        gap: '16px',
        margin: 0,
        transform: `translate(${legendPos.x}px, ${legendPos.y}px)`,
        cursor: 'grab',
        userSelect: 'none',
        zIndex: 1000,
        transition: 'width 0.2s ease, padding 0.2s ease'
      }} onMouseDown={onLegendMouseDown}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--muted-foreground)' }}>
            <MapIcon size={14} />
            <span style={{ fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', fontSize: '10px' }}>Legend</span>
          </div>
          <button 
            onClick={(e) => { e.stopPropagation(); setIsLegendExpanded(!isLegendExpanded); }}
            style={{ border: 'none', background: 'var(--secondary)', color: 'var(--secondary-foreground)', width: '20px', height: '20px', borderRadius: '4px', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', padding: 0 }}
          >
            {isLegendExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
          </button>
        </div>

        {isLegendExpanded && (
          <>
          <div>
            <div style={{ fontWeight: 700, marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.025em', fontSize: '10px', color: 'var(--muted-foreground)' }}>Business Criticality</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              {mode === 'landscape' && !showCriticality ? ( 
                <div style={{ fontStyle: 'italic', color: 'var(--muted-foreground)', fontSize: '10px' }}>Toggled Off</div> 
              ) : ( 
                (picklists?.find(p => p.name === 'criticality')?.options || []).map(opt => ( 
                  <div key={opt.value} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <div style={{ width: '12px', height: '12px', borderRadius: '3px', background: opt.color, border: `1px solid ${isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.05)'}` }} />
                    <span>{opt.label}</span>
                  </div> 
                )) 
              )}
            </div>
          </div>

          {groupingField && (
            <div>
              <div style={{ fontWeight: 700, marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.025em', fontSize: '10px', color: 'var(--primary)' }}>
                Grouped By: {getFieldLabel(groupingField)}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                {groupingField === 'lifecycle' ? (
                  (picklists?.find(p => p.name === 'lifecycle')?.options || LIFECYCLE_STAGES).map(opt => {
                    const lightColor = 'lightColor' in opt ? (opt as { lightColor?: string }).lightColor : undefined;
                    const bg = opt.color && opt.color.startsWith('#') ? (isDark ? opt.color : (lightColor || opt.color)) : (isDark ? (opt.color || '#adb5bd') : (lightColor || opt.color || '#e9ecef'));
                    return (
                      <div key={opt.label} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <div style={{ width: '12px', height: '12px', borderRadius: '3px', background: bg, border: `1px solid ${isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.05)'}` }} />
                        <span>{opt.label}</span>
                      </div>
                    );
                  })
                ) : groupingField === 'time' ? (
                  TIME_STAGES.map(opt => (
                    <div key={opt.value} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <div style={{ width: '12px', height: '12px', borderRadius: '3px', background: isDark ? opt.color : opt.lightColor, border: `1px solid ${opt.color}` }} />
                      <span style={{ fontWeight: 600 }}>{opt.label}</span>
                    </div>
                  ))
                ) : (
                  picklists?.find(p => p.name.toLowerCase().replace(/_/g, '') === groupingField.toLowerCase().replace(/_/g, ''))?.options.map(opt => (
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
            <div style={{ fontWeight: 700, marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.025em', fontSize: '10px', color: 'var(--muted-foreground)' }}>
              Application {getFieldLabel(activeOverlay!)}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              {activeOverlay === 'lifecycle' ? ( 
                (picklists?.find(p => p.name === 'lifecycle')?.options || LIFECYCLE_STAGES).map(opt => {
                  const lightColor = 'lightColor' in opt ? (opt as { lightColor?: string }).lightColor : undefined;
                  const bg = opt.color && opt.color.startsWith('#') ? (isDark ? opt.color : (lightColor || opt.color)) : (isDark ? (opt.color || '#adb5bd') : (lightColor || opt.color || '#e9ecef'));
                  return (
                    <div key={opt.label} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <div style={{ width: '12px', height: '12px', borderRadius: '3px', background: bg, border: `1px solid ${isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.05)'}` }} />
                      <span>{opt.label}</span>
                    </div>
                  );
                })
              ) : activeOverlay === 'time' ? (
                TIME_STAGES.map(opt => (
                  <div key={opt.value} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <div style={{ width: '12px', height: '12px', borderRadius: '3px', background: isDark ? opt.color : opt.lightColor, border: `1px solid ${opt.color}` }} />
                    <span style={{ fontWeight: 600 }}>{opt.label}</span>
                  </div>
                ))
              ) : ( 
                picklists?.find(p => p.name.toLowerCase().replace(/_/g, '') === activeOverlay?.toLowerCase().replace(/_/g, ''))?.options.map(opt => ( 
                  <div key={opt.value} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <div style={{ width: '12px', height: '12px', borderRadius: '3px', background: opt.color, border: `1px solid ${isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.05)'}` }} />
                    <span>{opt.label}</span>
                  </div> 
                )) 
              )}
            </div>
          </div>
          </>
        )}
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
