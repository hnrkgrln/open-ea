import React, { useEffect, useMemo, useState } from 'react';
import ReactFlow, { 
  Background, 
  Controls, 
  Panel,
  useNodesState,
  useEdgesState,
  MarkerType,
  useReactFlow,
  type Node,
  type Edge,
  ReactFlowProvider
} from 'reactflow';
import 'reactflow/dist/style.css';
import dagre from '@dagrejs/dagre';
import { Database, Boxes, ArrowUpRight } from 'lucide-react';

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
  showApplications?: boolean;
  showCriticality?: boolean;
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

// Define outside to prevent React Flow warnings
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
  showApplications = true, 
  showCriticality = true, 
  relationSearch = '',
  visible = false
}: Props) => {
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const { fitView } = useReactFlow();

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

  useEffect(() => {
    if (!apps || !capabilities || !metaDefs || !picklists || apps.length === 0 || capabilities.length === 0) return;

    const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
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
      return (app as any)[fieldName] || (app.metadata ? JSON.parse(app.metadata)[fieldName] : def.min);
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

      const finalAppIds = Array.from(new Set([
        ...filteredIntegrations.flatMap(i => [i.sourceAppId, i.targetAppId]),
        ...filteredApps.map(a => a.id)
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
          const island: string[] = [];
          const stack = [id];
          visited.add(id);
          while(stack.length > 0) {
            const curr = stack.pop()!;
            island.push(curr);
            adj.get(curr)?.forEach(neighbor => {
              if (!visited.has(neighbor)) {
                visited.add(neighbor);
                stack.push(neighbor);
              }
            });
          }
          islands.push(island);
        }
      });

      const islandNodes: Node[] = [];
      const islandEdges: Edge[] = [];
      let currentX = 0;
      const islandGap = 150;
      const nodeWidth = 180;
      const nodeHeight = 60;

      islands.forEach((islandAppIds) => {
        const g = new dagre.graphlib.Graph();
        g.setGraph({ rankdir: 'TB', nodesep: 50, ranksep: 100 });
        g.setDefaultEdgeLabel(() => ({}));

        islandAppIds.forEach(id => g.setNode(id, { width: nodeWidth, height: nodeHeight }));
        filteredIntegrations.forEach(i => {
          if (islandAppIds.includes(i.sourceAppId)) g.setEdge(i.sourceAppId, i.targetAppId);
        });

        dagre.layout(g);

        const islandBox = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: Infinity };
        g.nodes().forEach(v => {
          const node = g.node(v);
          islandBox.minX = Math.min(islandBox.minX, node.x - nodeWidth / 2);
          islandBox.minY = Math.min(islandBox.minY, node.y - nodeHeight / 2);
          islandBox.maxX = Math.max(islandBox.maxX, node.x + nodeWidth / 2);
          islandBox.maxY = Math.max(islandBox.maxY, node.y + nodeHeight / 2);
        });

        const islandWidth = islandBox.maxX - islandBox.minX;

        islandAppIds.forEach(id => {
          const app = apps.find(a => a.id === id)!;
          if (!app) return;
          const dNode = g.node(id);
          
          let colors = { bg: 'var(--card)', text: 'var(--foreground)' };
          if (activeOverlay === 'lifecycle') {
            colors = getLifecycleColor(app.lifecycle, isDark);
          } else {
            const overlayToUse = activeOverlay === 'criticality' ? metaDefs.find(d => d.fieldName === 'criticality' && d.entityType === 'Application') : appOverlayDef;
            if (overlayToUse) {
              const val = getAppScore(app, activeOverlay!, overlayToUse);
              colors = getOverlayColor(val, overlayToUse, picklists);
            }
          }

          islandNodes.push({
            id: app.id,
            data: { 
              label: (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem' }}>
                  <Database size={14} />
                  <span>{app.name}</span>
                </div>
              ), 
              type: 'app', 
              original: app 
            },
            position: { x: currentX + (dNode.x - islandBox.minX), y: (dNode.y - islandBox.minY) },
            style: { 
              background: colors.bg, color: colors.text, 
              border: `1px solid ${isDark ? 'rgba(255,255,255,0.1)' : borderColor}`,
              borderRadius: '12px', width: nodeWidth, fontSize: '13px', fontWeight: 600,
              textAlign: 'center', padding: '12px', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)'
            }
          });
        });

        filteredIntegrations.forEach(i => {
          if (islandAppIds.includes(i.sourceAppId)) {
            islandEdges.push({
              id: `e-${i.id}`, source: i.sourceAppId, target: i.targetAppId,
              label: i.name || i.type, type: 'default',
              labelStyle: { fill: textColor, fontSize: 10, fontWeight: 600 },
              labelBgStyle: { fill: 'var(--card)', fillOpacity: 0.9 },
              labelBgPadding: [4, 2], labelBgBorderRadius: 4,
              style: { stroke: isDark ? '#5c5f66' : '#adb5bd', strokeWidth: 2 },
              markerEnd: { type: MarkerType.ArrowClosed, color: isDark ? '#5c5f66' : '#adb5bd' },
            });
          }
        });

        currentX += islandWidth + islandGap;
      });

      setNodes(islandNodes);
      setEdges(islandEdges);
    } else if (mode === 'landscape') {
      const landscapeNodes: Node[] = [];
      const capsMap = new Map<string, Capability>();
      capabilities.forEach(c => capsMap.set(c.id, c));

      const unassignedApps: Application[] = [];
      const appsByCap = new Map<string, Application[]>();

      filteredApps.forEach(app => {
        if (!app.capabilities || app.capabilities.length === 0) {
          unassignedApps.push(app);
          return;
        }
        app.capabilities.forEach(capRef => {
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
        memoRelevant.set(capId, res);
        return res;
      };

      const renderCap = (capId: string, parentId?: string, depth = 0, rootX = 0, rootY = 0): { width: number; height: number } => {
        if (!isRelevant(capId)) return { width: 0, height: 0 };
        const cap = capsMap.get(capId);
        if (!cap) return { width: 0, height: 0 };

        const children = capabilities.filter(c => c.parentId === capId && isRelevant(c.id));
        const associatedApps = showApplications ? (appsByCap.get(capId) || []) : [];
        const appHeight = 50;
        const padding = 20;
        const titleHeight = 50;
        let totalHeight = titleHeight;
        let maxWidth = 300;

        const childLayouts: any[] = [];
        children.forEach(child => {
          const layout = renderCap(child.id, `cap-${capId}`, depth + 1);
          childLayouts.push({ id: child.id, ...layout });
          maxWidth = Math.max(maxWidth, layout.width + (padding * 2));
        });

        let currentYOffset = titleHeight;
        children.forEach((child, i) => {
          const nodeIdx = landscapeNodes.findIndex(n => n.id === `cap-${child.id}`);
          if (nodeIdx !== -1) {
            landscapeNodes[nodeIdx].position = { x: padding, y: currentYOffset };
            currentYOffset += childLayouts[i].height + 15;
          }
        });

        if (children.length > 0) totalHeight = currentYOffset;

        associatedApps.forEach((app, i) => {
          let colors = { bg: 'var(--card)', text: 'var(--foreground)' };
          if (activeOverlay === 'lifecycle') {
            colors = getLifecycleColor(app.lifecycle, isDark);
          } else if (activeOverlay !== 'criticality' && appOverlayDef) {
            const val = getAppScore(app, activeOverlay!, appOverlayDef);
            colors = getOverlayColor(val, appOverlayDef, picklists);
          }

          landscapeNodes.push({
            id: `app-${capId}-${app.id}`, parentNode: `cap-${capId}`,
            data: { 
              label: (
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <Database size={12} />
                  <span>{app.name}</span>
                </div>
              ), 
              type: 'app', 
              original: app 
            },
            position: { x: padding, y: totalHeight + (i * (appHeight + 10)) },
            style: {
              background: colors.bg, color: colors.text,
              border: `1px solid ${isDark ? 'rgba(255,255,255,0.1)' : borderColor}`,
              borderRadius: '8px', width: maxWidth - (padding * 2), height: appHeight,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: '13px', fontWeight: 600, zIndex: 100
            }
          });
        });

        const finalHeight = totalHeight + (associatedApps.length * (appHeight + 10)) + padding;
        let capBg = depth === 0 ? groupBg : 'rgba(0,0,0,0.03)';
        let capTextColor = 'var(--foreground)';
        
        if (showCriticality && critDef) {
          const val = (cap as any).criticality || (cap.metadata ? JSON.parse(cap.metadata).criticality : critDef.min);
          const colors = getOverlayColor(val, critDef, picklists);
          capBg = colors.bg; capTextColor = colors.text;
        }

        landscapeNodes.push({
          id: `cap-${capId}`, 
          data: { 
            label: (
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', justifyContent: 'center' }}>
                <Boxes size={16} />
                <span>{cap.name}</span>
              </div>
            ), 
            type: 'capability', 
            originalId: capId, 
            original: cap 
          },
          position: { x: depth === 0 ? rootX : 0, y: depth === 0 ? rootY : 0 },
          parentNode: parentId,
          style: {
            background: capBg, border: `2px ${depth === 0 ? 'solid' : 'dashed'} ${isDark ? '#373a40' : '#dee2e6'}`,
            width: maxWidth, height: finalHeight, borderRadius: depth === 0 ? '16px' : '8px',
            pointerEvents: 'all', zIndex: depth, color: capTextColor, fontWeight: 800,
            fontSize: '14px', textAlign: 'center', display: 'flex', justifyContent: 'center', alignItems: 'flex-start', paddingTop: '12px'
          }
        });
        return { width: maxWidth, height: finalHeight };
      };

      const roots = capabilities.filter(c => !c.parentId);
      const itemsPerRow = 5;
      const columnHeights = new Array(itemsPerRow).fill(0);
      const horizontalGap = 100;
      const verticalGap = 100;
      const columnWidth = 300;

      roots.forEach((root) => {
        if (!isRelevant(root.id)) return;
        const minHeight = Math.min(...columnHeights);
        const columnIndex = columnHeights.indexOf(minHeight);
        const currentX = columnIndex * (columnWidth + horizontalGap);
        const layout = renderCap(root.id, undefined, 0, currentX, minHeight);
        columnHeights[columnIndex] += layout.height + verticalGap;
      });

      if (showApplications && unassignedApps.length > 0) {
        const minHeight = Math.min(...columnHeights);
        const columnIndex = columnHeights.indexOf(minHeight);
        const currentX = columnIndex * (columnWidth + horizontalGap);
        const finalHeight = 50 + (unassignedApps.length * 60) + 20;

        landscapeNodes.push({
          id: 'cap-unassigned', data: { label: 'Unassigned Applications', type: 'capability', originalId: 'unassigned' },
          position: { x: currentX, y: minHeight },
          style: {
            background: isDark ? 'rgba(255, 255, 255, 0.05)' : 'rgba(0, 0, 0, 0.05)',
            border: `2px solid ${isDark ? '#373a40' : '#dee2e6'}`, width: columnWidth,
            height: finalHeight, borderRadius: '16px', pointerEvents: 'all', color: 'var(--foreground)',
            fontWeight: 800, fontSize: '14px', textAlign: 'center', display: 'flex', justifyContent: 'center', alignItems: 'flex-start',
            paddingTop: '12px', opacity: 0.8
          }
        });

        unassignedApps.forEach((app, i) => {
          let colors = { bg: 'var(--card)', text: 'var(--foreground)' };
          if (activeOverlay === 'lifecycle') {
            colors = getLifecycleColor(app.lifecycle, isDark);
          } else if (activeOverlay !== 'criticality' && appOverlayDef) {
            const val = getAppScore(app, activeOverlay!, appOverlayDef);
            colors = getOverlayColor(val, appOverlayDef, picklists);
          }
          landscapeNodes.push({
            id: `app-unassigned-${app.id}`, parentNode: 'cap-unassigned',
            data: { 
              label: (
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <Database size={12} />
                  <span>{app.name}</span>
                </div>
              ), 
              type: 'app', 
              original: app 
            },
            position: { x: 20, y: 50 + (i * 60) },
            style: {
              background: colors.bg, color: colors.text, border: `1px solid ${isDark ? 'rgba(255,255,255,0.1)' : borderColor}`,
              borderRadius: '8px', width: columnWidth - 40, height: 50, display: 'flex', alignItems: 'center',
              justifyContent: 'center', fontSize: '13px', fontWeight: 600, zIndex: 100
            }
          });
        });
      }
      setNodes(landscapeNodes); setEdges([]);
    } else if (mode === 'app-landscape') {
      const appNodes: Node[] = [];
      const itemsPerRow = 5;
      const horizontalGap = 100;
      const verticalGap = 100;
      const columnWidth = 300;
      const columnHeights = new Array(itemsPerRow).fill(0);

      filteredApps.forEach((app) => {
        const minHeight = Math.min(...columnHeights);
        const columnIndex = columnHeights.indexOf(minHeight);
        const currentX = columnIndex * (columnWidth + horizontalGap);
        const associatedCaps = app.capabilities || [];
        const finalHeight = 60 + (associatedCaps.length * 48) + 20;

        let colors = { bg: 'var(--card)', text: 'var(--foreground)' };
        if (activeOverlay === 'lifecycle') {
          colors = getLifecycleColor(app.lifecycle, isDark);
        } else {
          const overlayToUse = activeOverlay === 'criticality' ? appCritDef : appOverlayDef;
          if (overlayToUse) {
            const val = getAppScore(app, activeOverlay!, overlayToUse);
            colors = getOverlayColor(val, overlayToUse, picklists);
          }
        }

        appNodes.push({
          id: `app-container-${app.id}`, 
          data: { 
            label: (
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', justifyContent: 'center' }}>
                <Database size={16} />
                <span>{app.name}</span>
              </div>
            ), 
            type: 'app', 
            original: app 
          },
          position: { x: currentX, y: minHeight },
          style: {
            background: colors.bg, color: colors.text, border: `2px solid ${isDark ? 'rgba(255,255,255,0.1)' : borderColor}`,
            borderRadius: '16px', width: columnWidth, height: finalHeight, fontWeight: 800, fontSize: '14px',
            textAlign: 'center', display: 'flex', justifyContent: 'center', alignItems: 'flex-start', paddingTop: '16px', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)'
          }
        });

        associatedCaps.forEach((c, i) => {
          const fullCap = capabilities.find(ac => ac.id === c.id);
          let capColors = { bg: 'var(--secondary)', text: 'var(--foreground)' };
          if (critDef && fullCap) {
            const val = fullCap.criticality || critDef.min;
            capColors = getOverlayColor(val, critDef, picklists);
          }
          appNodes.push({
            id: `cap-in-app-${app.id}-${c.id}`, parentNode: `app-container-${app.id}`,
            data: { 
              label: (
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <Boxes size={12} />
                  <span>{c.name}</span>
                </div>
              ), 
              type: 'capability', 
              original: fullCap 
            },
            position: { x: 20, y: 60 + (i * 48) },
            style: {
              background: capColors.bg, color: capColors.text, border: `1px solid ${isDark ? 'rgba(255,255,255,0.1)' : borderColor}`,
              borderRadius: '8px', width: columnWidth - 40, height: 40, display: 'flex', alignItems: 'center',
              justifyContent: 'center', fontSize: '12px', fontWeight: 600, zIndex: 100
            }
          });
        });
        columnHeights[columnIndex] += finalHeight + verticalGap;
      });
      setNodes(appNodes); setEdges([]);
    }
  }, [apps, filteredApps, integrations, capabilities, metaDefs, picklists, mode, activeOverlay, showApplications, showCriticality, relationSearch, setNodes, setEdges, appOverlayDef, critDef, appCritDef]);

  useEffect(() => {
    if (nodes.length > 0 && visible) {
      const timer = setTimeout(() => { fitView({ padding: 0.2, duration: 800 }); }, 150);
      return () => clearTimeout(timer);
    }
  }, [nodes.length, mode, visible, fitView]);

  const onNodeInternalClick = (_: any, node: Node) => {
    if (node.data.type === 'app') onNodeClick?.(node.data.original);
    else if (node.data.type === 'capability' && node.data.originalId !== 'unassigned') onCapabilityClick?.(node.data.original);
  };

  const isDark = document.documentElement.getAttribute('data-theme') === 'dark';

  return (
    <ReactFlow
      nodes={nodes} edges={edges} onNodesChange={onNodesChange} onEdgesChange={onEdgesChange} onNodeClick={onNodeInternalClick}
      nodesDraggable={true} nodesConnectable={false} elementsSelectable={true} panOnDrag={true} zoomOnScroll={true} minZoom={0.01} maxZoom={4}
      nodeTypes={initialNodeTypes} edgeTypes={initialEdgeTypes}
    >
      <Background color="var(--border)" gap={20} />
      <Controls showInteractive={false} />
      <Panel position="top-right" style={{ background: 'var(--card)', padding: '8px 12px', borderRadius: '8px', border: '1px solid var(--border)', fontSize: '12px', color: 'var(--foreground)', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
        <strong>{mode === 'network' ? 'Integrations' : (mode === 'landscape' ? 'Capability Landscape' : 'Application Landscape')}</strong>
        <div style={{ marginTop: '4px', fontSize: '10px' }}>Click objects to edit • Drag to pan</div>
      </Panel>
      <Panel position="top-left" style={{ background: 'var(--card)', padding: '12px', borderRadius: '12px', border: '1px solid var(--border)', fontSize: '11px', color: 'var(--foreground)', boxShadow: '0 4px 12px rgba(0,0,0,0.15)', maxWidth: '220px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
        <div>
          <div style={{ fontWeight: 700, marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.025em', fontSize: '10px', color: 'var(--muted-foreground)' }}>Business Criticality</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            {mode === 'landscape' && !showCriticality ? (
              <div style={{ fontStyle: 'italic', color: 'var(--muted-foreground)', fontSize: '10px' }}>Toggled Off</div>
            ) : (
              picklists?.find(p => p.name === 'criticality')?.options.map(opt => (
                <div key={opt.value} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <div style={{ width: '12px', height: '12px', borderRadius: '3px', background: opt.color, border: `1px solid ${isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.05)'}` }} />
                  <span>{opt.label}</span>
                </div>
              ))
            )}
          </div>
        </div>
        <div>
          <div style={{ fontWeight: 700, marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.025em', fontSize: '10px', color: 'var(--muted-foreground)' }}>
            Application {activeOverlay === 'lifecycle' ? 'Lifecycle' : (activeOverlay === 'criticality' ? 'Business Criticality' : (activeOverlay === 'functionalFit' ? 'Functional Fit' : 'Technical Fit'))}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            {activeOverlay === 'lifecycle' ? (
              LIFECYCLE_STAGES.map(stage => (
                <div key={stage.label} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <div style={{ width: '12px', height: '12px', borderRadius: '3px', background: isDark ? stage.color : stage.lightColor, border: `1px solid ${isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.05)'}` }} />
                  <span>{stage.label}</span>
                </div>
              ))
            ) : (
              picklists?.find(p => p.name.replace(/_/g, '').toLowerCase() === activeOverlay?.toLowerCase())?.options.map(opt => (
                <div key={opt.value} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <div style={{ width: '12px', height: '12px', borderRadius: '3px', background: opt.color, border: `1px solid ${isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.05)'}` }} />
                  <span>{opt.label}</span>
                </div>
              ))
            )}
          </div>
        </div>
      </Panel>
    </ReactFlow>
  );
};

export const ApplicationDiagram = (props: Props) => (
  <div style={{ width: '100%', height: '100%' }}>
    <ReactFlowProvider>
      <DiagramInner {...props} />
    </ReactFlowProvider>
  </div>
);
