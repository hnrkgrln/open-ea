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
  type Node,
  type Edge,
  ReactFlowProvider
} from 'reactflow';
import 'reactflow/dist/style.css';
import dagre from '@dagrejs/dagre';
import { Database, Boxes } from 'lucide-react';

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
  integrations: Integration[];
  capabilities: Capability[];
  metaDefs: MetadataDefinition[];
  picklists: Picklist[];
  mode?: 'network' | 'landscape' | 'app-landscape';
  activeOverlay?: string | null;
  activeCustomOverlays?: string[];
  showApplications?: boolean;
  hideOrphanApps?: boolean;
  showCriticality?: boolean;
  filters?: any;
  groupingField?: string | null;
  relationSearch?: string;
  visible?: boolean;
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
  { label: 'Planning', color: '#1864ab', lightColor: '#e7f5ff' },
  { label: 'Deployment', color: '#5f3dc4', lightColor: '#f3f0ff' },
  { label: 'Maintenance', color: '#2b8a3e', lightColor: '#ebfbee' },
  { label: 'Sunset', color: '#d9480f', lightColor: '#fff4e6' },
  { label: 'Decommissioned', color: '#c92a2a', lightColor: '#fff5f5' }
];

const getLifecycleColor = (lifecycle: string, isDark: boolean) => {
  const lc = lifecycle?.toLowerCase() || 'planning';
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

const initialNodeTypes = {};
const initialEdgeTypes = {};

const DiagramInner = ({ 
  onNodeClick, 
  onCapabilityClick, 
  apps, 
  filteredApps, 
  integrations, 
  capabilities, 
  metaDefs: dbMetaDefs, 
  picklists, 
  mode = 'landscape', 
  activeOverlay = 'lifecycle', 
  activeCustomOverlays = [],
  showApplications = true, 
  hideOrphanApps = true,
  showCriticality = true, 
  filters = {},
  groupingField = null,
  relationSearch = '',
  visible = false
}: Props) => {
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const { setViewport, getNodes } = useReactFlow();
  const viewportWidth = useStore((s) => s.width);
  const isDark = document.documentElement.getAttribute('data-theme') === 'dark';

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
    const textColor = 'var(--foreground)';

    const getAppScore = (app: Application, fieldName: string, def?: MetadataDefinition) => {
      if (fieldName === 'criticality' && app.capabilities && app.capabilities.length > 0) {
        const capScores = app.capabilities.map(c => {
          const fullCap = capabilities.find(ac => ac.id === c.id);
          return Number(fullCap?.criticality || 1);
        });
        return Math.max(...capScores);
      }
      if (!def) return 0;
      return (app as any)[fieldName] || safeJsonParse(app.metadata)[fieldName] || def.min;
    };

    if (mode === 'network') {
      const search = (relationSearch || '').toLowerCase();
      const visibleAppIds = new Set(filteredApps.map(a => a.id));
      const filteredIntegrations = integrations.filter(i => {
        const sourceApp = apps.find(a => a.id === i.sourceAppId);
        const targetApp = apps.find(a => a.id === i.targetAppId);
        if (!sourceApp || !targetApp) return false;
        const iMatches = i.name?.toLowerCase().includes(search) || i.type?.toLowerCase().includes(search);
        const sMatches = sourceApp.name.toLowerCase().includes(search);
        const tMatches = targetApp.name.toLowerCase().includes(search);
        if (search) return iMatches || sMatches || tMatches;
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
              label: (
                <div style={{ 
                  background: 'var(--card)', 
                  padding: '2px 6px', 
                  borderRadius: '4px', 
                  fontSize: '10px', 
                  fontWeight: 600, 
                  color: textColor,
                  border: `1px solid ${isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)'}`,
                  whiteSpace: 'nowrap',
                  pointerEvents: 'none',
                  boxShadow: '0 1px 2px rgba(0,0,0,0.1)'
                }}>
                  {i.name || i.type}
                </div>
              ),
              type: 'default',
              style: { stroke: isDark ? '#5c5f66' : '#adb5bd', strokeWidth: 2 },
              markerEnd: { type: MarkerType.ArrowClosed, color: isDark ? '#5c5f66' : '#adb5bd' },
            });
          }
        });
        currentX += islandWidth + islandGap;
      });
      setNodes(islandNodes); setEdges(islandEdges);
    } else if (mode === 'landscape' || mode === 'app-landscape') {
      const allFinalNodes: Node[] = [];
      const capsMap = new Map<string, Capability>();
      capabilities.forEach(c => capsMap.set(c.id, c));

      const activeFilterGroups: { field: string, values: string[] }[] = [];
      if (groupingField) {
        const uniqueValues = Array.from(new Set(filteredApps.map(app => {
          const val = (app as any)[groupingField] || safeJsonParse(app.metadata)[groupingField];
          return val ? String(val) : 'Unspecified';
        })));

        // Sort unique values logically
        uniqueValues.sort((a, b) => {
          if (groupingField === 'lifecycle') {
            const order = LIFECYCLE_STAGES.map(s => s.label.toLowerCase());
            return order.indexOf(a.toLowerCase()) - order.indexOf(b.toLowerCase());
          }
          // Numeric sort for range fields (criticality, functionalFit, technicalFit)
          const numA = parseFloat(a);
          const numB = parseFloat(b);
          if (!isNaN(numA) && !isNaN(numB)) return numA - numB;
          return a.localeCompare(b);
        });

        activeFilterGroups.push({ field: groupingField, values: uniqueValues });
      } else {
        if (filters.lifecycle?.length > 0) activeFilterGroups.push({ field: 'lifecycle', values: filters.lifecycle });
        if (filters.owner?.length > 0) activeFilterGroups.push({ field: 'owner', values: filters.owner });
        if (filters.type?.length > 0) activeFilterGroups.push({ field: 'type', values: filters.type });
      }
      const primaryGroup = activeFilterGroups[0];

      const renderGroupContentNodes = (targetApps: Application[], containerId: string | undefined, baseOffsetX = 0, baseOffsetY = 0) => {
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
          const res = hasApps || children.some(c => isRelevant(c.id));
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
          const associatedCaps = app.capabilities || [];
          const innerCols = Math.max(1, Math.ceil(Math.sqrt(associatedCaps.length * 0.6)));
          const innerRows = Math.ceil(associatedCaps.length / innerCols);
          const childW = 220; const childH = 45; const gap = 10; const padding = 20; const headerH = 65;
          const nodeW = padding * 2 + (innerCols * childW) + (innerCols - 1) * gap;
          const nodeH = headerH + (innerRows * childH) + (innerRows - 1) * gap + padding;
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
          const colCount = containerId ? 2 : 4;
          const colHeights = new Array(colCount).fill(0); const colWidths = new Array(colCount).fill(350);
          roots.forEach(root => {
            if (!isRelevant(root.id)) return;
            const minH = Math.min(...colHeights); const cIdx = colHeights.indexOf(minH);
            const layout = renderCap(root.id, containerId, 0, 0, 0, colWidths[cIdx]);
            const nodeIdx = groupNodes.findIndex(n => n.id === `cap-${containerId || 'main'}-${root.id}`);
            if (nodeIdx !== -1) {
              const xPos = colWidths.slice(0, cIdx).reduce((sum, w) => sum + w + 60, 0);
              groupNodes[nodeIdx].position = { x: xPos + baseOffsetX, y: minH + baseOffsetY + 80 };
              colWidths[cIdx] = Math.max(colWidths[cIdx], layout.width); colHeights[cIdx] += layout.height + 60;
            }
          });
          return { nodes: groupNodes, width: colWidths.reduce((sum, w) => sum + w + 60, 0) + 60, height: Math.max(...colHeights) + 160 };
        } else {
          const colCount = Math.max(1, Math.floor((window.innerWidth - 120) / 500));
          const colHeights = new Array(colCount).fill(0);
          targetApps.forEach((app) => {
            const minH = Math.min(...colHeights); const cIdx = colHeights.indexOf(minH);
            const layout = renderAppInGrid(app);
            const nIdx = groupNodes.findIndex(n => n.id === `app-node-${containerId || 'main'}-${app.id}`);
            if (nIdx !== -1) {
              groupNodes[nIdx].position = { x: cIdx * 500 + baseOffsetX, y: minH + baseOffsetY + 80 };
              colHeights[cIdx] += layout.height + 60;
            }
          });
          return { nodes: groupNodes, width: colCount * 500 + 120, height: Math.max(...colHeights) + 160 };
        }
      };

      if (primaryGroup) {
        const validValues = primaryGroup.values.filter(val => filteredApps.some(app => String((app as any)[primaryGroup.field] || safeJsonParse(app.metadata)[primaryGroup.field] || 'Unspecified').toLowerCase() === val.toLowerCase()));

        // Calculate dynamic grid based on 3 columns
        const colCount = 3;
        const rowMaxH: number[] = [];
        const colMaxW: number[] = new Array(colCount).fill(0);

        const groups = validValues.map((groupVal, idx) => {
          const groupApps = filteredApps.filter(app => String((app as any)[primaryGroup.field] || safeJsonParse(app.metadata)[primaryGroup.field] || 'Unspecified').toLowerCase() === groupVal.toLowerCase());
          const containerId = `group-${primaryGroup.field}-${groupVal}`;
          const content = renderGroupContentNodes(groupApps, containerId, 40, 40);

          const row = Math.floor(idx / colCount);
          const col = idx % colCount;

          rowMaxH[row] = Math.max(rowMaxH[row] || 0, content.height);
          colMaxW[col] = Math.max(colMaxW[col], content.width);

          let color = 'var(--primary)';
          if (primaryGroup.field === 'lifecycle') color = LIFECYCLE_STAGES.find(s => s.label.toLowerCase() === groupVal.toLowerCase())?.color || color;
          else {
            const def = metaDefs.find(d => d.fieldName === primaryGroup.field && d.entityType === 'Application');
            if (def) color = getOverlayColor(groupVal, def, picklists).bg;
          }
          return { containerId, groupVal, color, row, col, width: content.width, height: content.height, nodes: content.nodes };
        });

        groups.forEach(g => {
          const currentX = colMaxW.slice(0, g.col).reduce((sum, w) => sum + w + 80, 0);
          const currentY = rowMaxH.slice(0, g.row).reduce((sum, h) => sum + h + 80, 0);

          allFinalNodes.push({
            id: g.containerId, data: { label: `${primaryGroup.field.toUpperCase()}: ${g.groupVal}` },
            position: { x: currentX, y: currentY },
            style: { background: isDark ? 'rgba(255,255,255,0.02)' : 'rgba(0,0,0,0.02)', border: `4px solid ${g.color}`, borderRadius: '32px', width: g.width, height: g.height, pointerEvents: 'none', zIndex: -100, fontSize: '20px', fontWeight: 900, color: g.color, textAlign: 'left', paddingLeft: '40px', paddingTop: '20px' }
          });
          allFinalNodes.push(...g.nodes);
        });
      } else {
        allFinalNodes.push(...renderGroupContentNodes(filteredApps, undefined, 0, 0).nodes);
      }
      setNodes(allFinalNodes); setEdges([]);
    }

    if (!groupingField && (filters.lifecycle?.length > 0 || filters.owner?.length > 0 || filters.type?.length > 0)) {
      setNodes(prev => {
        if (prev.length === 0) return prev;
        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        prev.forEach(n => {
          const x = n.position.x; const y = n.position.y;
          const w = n.width || (typeof n.style?.width === 'number' ? n.style.width : 300);
          const h = n.height || (typeof n.style?.height === 'number' ? n.style.height : 200);
          minX = Math.min(minX, x); minY = Math.min(minY, y); maxX = Math.max(maxX, x + w); maxY = Math.max(maxY, y + h);
        });
        const p = 60;
        return [{ id: 'filter-container', data: { label: 'Filtered Inventory' }, position: { x: minX - p, y: minY - p - 40 }, style: { width: (maxX - minX) + p * 2, height: (maxY - minY) + p * 2 + 40, background: isDark ? 'rgba(255, 255, 255, 0.02)' : 'rgba(0, 0, 0, 0.02)', border: '2px solid var(--primary)', borderRadius: '24px', pointerEvents: 'none', zIndex: -100 } }, ...prev];
      });
    }
  }, [apps, filteredApps, integrations, capabilities, metaDefs, picklists, mode, showApplications, hideOrphanApps, relationSearch, setNodes, setEdges, appOverlayDef, critDef, appCritDef, filters, groupingField, isDark]);
  
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
    <ReactFlow nodes={nodes} edges={edges} onNodesChange={onNodesChange} onEdgesChange={onEdgesChange} onNodeClick={onNodeInternalClick} nodesDraggable={false} nodesConnectable={false} elementsSelectable={false} panOnDrag={true} zoomOnScroll={true} minZoom={0.01} maxZoom={4} nodeTypes={initialNodeTypes} edgeTypes={initialEdgeTypes} style={{ width: '100%', height: '100%' }}>
      <Background color="var(--border)" gap={20} />
      <Controls showInteractive={false} />
      <Panel position="top-right" style={{ background: 'var(--card)', padding: '8px 12px', borderRadius: '8px', border: '1px solid var(--border)', fontSize: '12px', color: 'var(--foreground)', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
        <strong>{mode === 'network' ? 'Integrations' : (mode === 'landscape' ? 'Capability Landscape' : 'Application Landscape')}</strong>
        <div style={{ marginTop: '4px', fontSize: '10px' }}>Click objects to edit • Drag to pan</div>
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

export const ApplicationDiagram = (props: Props) => (
  <div style={{ width: '100%', height: '100%' }}>
    <ReactFlowProvider><DiagramInner {...props} /></ReactFlowProvider>
  </div>
);
