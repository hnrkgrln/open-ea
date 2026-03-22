import React, { useEffect, useMemo } from 'react';
import ReactFlow, { 
  Background, 
  Controls, 
  Panel,
  useNodesState,
  useEdgesState,
  MarkerType,
  type Node,
  type Edge
} from 'reactflow';
import 'reactflow/dist/style.css';
import { useQuery } from '@tanstack/react-query';
import dagre from '@dagrejs/dagre';

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
  appsOverride?: Application[];
  mode?: 'network' | 'landscape';
  activeOverlay?: string | null;
  showApplications?: boolean;
  relationSearch?: string;
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

export const ApplicationDiagram = ({ onNodeClick, onCapabilityClick, appsOverride, mode = 'network', activeOverlay, showApplications = true, relationSearch = '' }: Props) => {
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);

  const { data: remoteApps } = useQuery<Application[]>({
    queryKey: ['applications'],
    queryFn: async () => {
      const res = await fetch('/api/applications');
      return res.json();
    }
  });

  const allApps = remoteApps || [];
  const filteredAppsProps = appsOverride || allApps;

  const { data: integrations } = useQuery<Integration[]>({
    queryKey: ['integrations'],
    queryFn: async () => {
      const res = await fetch('/api/integrations');
      return res.json();
    }
  });

  const { data: allCapabilities } = useQuery<Capability[]>({
    queryKey: ['capabilities'],
    queryFn: async () => {
      const res = await fetch('/api/capabilities');
      return res.json();
    }
  });

  const { data: dbMetaDefs } = useQuery<MetadataDefinition[]>({
    queryKey: ['metadata-definitions'],
    queryFn: async () => {
      const res = await fetch('/api/metadata-definitions');
      return res.json();
    }
  });

  const { data: picklists } = useQuery<Picklist[]>({
    queryKey: ['picklists'],
    queryFn: async () => {
      const res = await fetch('/api/picklists');
      return res.json();
    }
  });

  const metaDefs = useMemo(() => {
    const defs = [...(dbMetaDefs || [])];
    STANDARD_DEFS.forEach(std => {
      if (!defs.some(d => d.fieldName === std.fieldName && d.entityType === std.entityType)) {
        defs.push(std);
      }
    });
    return defs;
  }, [dbMetaDefs]);

  useEffect(() => {
    if (!allApps.length || !integrations || !allCapabilities || !metaDefs || !picklists) return;

    const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
    const borderColor = 'var(--border)';
    const groupBg = isDark ? 'rgba(37, 38, 43, 0.6)' : 'rgba(255, 255, 255, 0.6)';
    const textColor = 'var(--foreground)';

    const fieldDefs = metaDefs.filter(d => d.fieldName === activeOverlay);
    const appDef = fieldDefs.find(d => d.entityType === 'Application');
    const capDef = fieldDefs.find(d => d.entityType === 'Capability');

    const getAppScore = (app: Application, fieldName: string, def: MetadataDefinition) => {
      if (fieldName === 'criticality' && app.capabilities && app.capabilities.length > 0) {
        const capScores = app.capabilities.map(c => {
          const fullCap = allCapabilities.find(ac => ac.id === c.id);
          return Number(fullCap?.criticality || 1);
        });
        return Math.max(...capScores);
      }
      return (app as any)[fieldName] || (app.metadata ? JSON.parse(app.metadata)[fieldName] : def.min);
    };

    if (mode === 'network') {
      const search = relationSearch.toLowerCase();
      const visibleAppIdsFromProps = new Set(filteredAppsProps.map(a => a.id));

      // --- Smart Integration Filter ---
      const filteredIntegrations = integrations.filter(i => {
        const sourceApp = allApps.find(a => a.id === i.sourceAppId);
        const targetApp = allApps.find(a => a.id === i.targetAppId);
        if (!sourceApp || !targetApp) return false;

        const iMatches = i.name?.toLowerCase().includes(search) || i.type?.toLowerCase().includes(search);
        const sMatches = sourceApp.name.toLowerCase().includes(search);
        const tMatches = targetApp.name.toLowerCase().includes(search);
        
        if (search) {
          // If searching, show the connection if IT matches OR its apps match
          return iMatches || sMatches || tMatches;
        } else {
          // If no search, only show connections between apps that passed the other filters (Owner, Lifecycle, etc)
          return visibleAppIdsFromProps.has(i.sourceAppId) && visibleAppIdsFromProps.has(i.targetAppId);
        }
      });

      // Final set of apps: those that passed filters + those involved in matching integrations
      const finalAppIds = new Set([
        ...filteredIntegrations.flatMap(i => [i.sourceAppId, i.targetAppId]),
        ...filteredAppsProps.map(a => a.id)
      ]);

      const networkNodes: Node[] = allApps
        .filter(app => finalAppIds.has(app.id))
        .map((app, index, list) => {
          const radius = Math.max(list.length * 50, 350);
          const centerX = 600;
          const centerY = 600;
          const angle = (index / list.length) * 2 * Math.PI;
          const x = centerX + radius * Math.cos(angle);
          const y = centerY + radius * Math.sin(angle);
          
          let colors = getLifecycleColor(app.lifecycle, isDark);
          if (activeOverlay && appDef) {
            const val = getAppScore(app, activeOverlay, appDef);
            colors = getOverlayColor(val, appDef, picklists);
          }

          return {
            id: app.id,
            data: { label: app.name, type: 'app', original: app },
            position: { x, y },
            style: { 
              background: colors.bg, 
              color: colors.text, 
              border: `1px solid ${isDark ? 'rgba(255,255,255,0.1)' : borderColor}`,
              borderRadius: '12px',
              width: 180,
              fontSize: '13px',
              fontWeight: 600,
              textAlign: 'center',
              padding: '12px',
              boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)'
            }
          };
        });

      const networkEdges: Edge[] = filteredIntegrations.map((i) => ({
        id: `e-${i.id}`,
        source: i.sourceAppId,
        target: i.targetAppId,
        label: i.name || i.type,
        type: 'default',
        labelStyle: { fill: textColor, fontSize: 10, fontWeight: 600 },
        labelBgStyle: { fill: 'var(--card)', fillOpacity: 0.9 },
        labelBgPadding: [4, 2],
        labelBgBorderRadius: 4,
        style: { stroke: isDark ? '#5c5f66' : '#adb5bd', strokeWidth: 2 },
        markerEnd: { type: MarkerType.ArrowClosed, color: isDark ? '#5c5f66' : '#adb5bd' },
      }));

      setNodes(networkNodes);
      setEdges(networkEdges);
    } else {
      const landscapeNodes: Node[] = [];
      const capsMap = new Map<string, Capability>();
      allCapabilities.forEach(c => capsMap.set(c.id, c));

      const appToCapMap = new Map<string, string>();
      const unassignedApps: Application[] = [];

      filteredAppsProps.forEach(app => {
        if (!app.capabilities || app.capabilities.length === 0) {
          unassignedApps.push(app);
          return;
        }
        let deepestCap = app.capabilities[0];
        app.capabilities.forEach(cap => {
          if (allCapabilities.some(c => c.id === cap.id && c.parentId === deepestCap.id)) deepestCap = cap;
        });
        appToCapMap.set(app.id, deepestCap.id);
      });

      const appsByCap = new Map<string, Application[]>();
      filteredAppsProps.forEach(app => {
        const assignedCapId = appToCapMap.get(app.id);
        if (assignedCapId) {
          if (!appsByCap.has(assignedCapId)) appsByCap.set(assignedCapId, []);
          appsByCap.get(assignedCapId)!.push(app);
        }
      });

      const renderCap = (capId: string, parentId?: string, depth = 0, rootX = 0, rootY = 0): { width: number; height: number } => {
        const cap = capsMap.get(capId)!;
        const children = allCapabilities.filter(c => c.parentId === capId);
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
          let colors = getLifecycleColor(app.lifecycle, isDark);
          if (activeOverlay && appDef) {
            const val = getAppScore(app, activeOverlay, appDef);
            colors = getOverlayColor(val, appDef, picklists);
          }
          landscapeNodes.push({
            id: `app-${capId}-${app.id}`,
            parentNode: `cap-${capId}`,
            data: { label: app.name, type: 'app', original: app },
            position: { x: padding, y: totalHeight + (i * (appHeight + 10)) },
            style: {
              background: colors.bg,
              color: colors.text,
              border: `1px solid ${isDark ? 'rgba(255,255,255,0.1)' : borderColor}`,
              borderRadius: '8px',
              width: maxWidth - (padding * 2),
              height: appHeight,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '13px',
              fontWeight: 600,
              zIndex: 100
            }
          });
        });

        const finalHeight = totalHeight + (associatedApps.length * (appHeight + 10)) + padding;

        let capBg = depth === 0 ? groupBg : 'rgba(0,0,0,0.03)';
        let capTextColor = 'var(--foreground)';
        if (activeOverlay && capDef) {
          const val = (cap as any)[activeOverlay] || (cap.metadata ? JSON.parse(cap.metadata)[activeOverlay] : capDef.min);
          const colors = getOverlayColor(val, capDef, picklists);
          capBg = colors.bg;
          capTextColor = colors.text;
        }

        landscapeNodes.push({
          id: `cap-${capId}`,
          data: { label: cap.name, type: 'capability', originalId: capId, original: cap },
          position: { x: depth === 0 ? rootX : 0, y: depth === 0 ? rootY : 0 },
          parentNode: parentId,
          style: {
            background: capBg,
            border: `2px ${depth === 0 ? 'solid' : 'dashed'} ${isDark ? '#373a40' : '#dee2e6'}`,
            width: maxWidth,
            height: finalHeight,
            borderRadius: depth === 0 ? '16px' : '8px',
            pointerEvents: 'all',
            zIndex: depth,
            color: capTextColor,
            fontWeight: 800,
            fontSize: '14px',
            textAlign: 'center',
            display: 'flex',
            justifyContent: 'center',
            paddingTop: '12px'
          }
        });

        return { width: maxWidth, height: finalHeight };
      };

      let currentX = 0;
      let currentY = 0;
      let maxRowHeight = 0;
      const horizontalGap = 100;
      const verticalGap = 100;
      const itemsPerRow = 5;

      const roots = allCapabilities.filter(c => !c.parentId);
      roots.forEach((root, index) => {
        if (index > 0 && index % itemsPerRow === 0) {
          currentX = 0;
          currentY += maxRowHeight + verticalGap;
          maxRowHeight = 0;
        }
        const layout = renderCap(root.id, undefined, 0, currentX, currentY);
        currentX += layout.width + horizontalGap;
        maxRowHeight = Math.max(maxRowHeight, layout.height);
      });

      if (showApplications && unassignedApps.length > 0) {
        if (roots.length % itemsPerRow === 0 && roots.length > 0) {
          currentX = 0;
          currentY += maxRowHeight + verticalGap;
          maxRowHeight = 0;
        }
        const appHeight = 50;
        const padding = 20;
        const titleHeight = 50;
        const maxWidth = 300;
        const finalHeight = titleHeight + (unassignedApps.length * (appHeight + 10)) + padding;

        landscapeNodes.push({
          id: 'cap-unassigned',
          data: { label: 'Unassigned Applications', type: 'capability', originalId: 'unassigned' },
          position: { x: currentX, y: currentY },
          style: {
            background: isDark ? 'rgba(255, 255, 255, 0.05)' : 'rgba(0, 0, 0, 0.05)',
            border: `2px solid ${isDark ? '#373a40' : '#dee2e6'}`,
            width: maxWidth,
            height: finalHeight,
            borderRadius: '16px',
            pointerEvents: 'all',
            color: 'var(--foreground)',
            fontWeight: 800,
            fontSize: '14px',
            textAlign: 'center',
            display: 'flex',
            justifyContent: 'center',
            paddingTop: '12px',
            opacity: 0.8
          }
        });

        unassignedApps.forEach((app, i) => {
          let colors = getLifecycleColor(app.lifecycle, isDark);
          if (activeOverlay && appDef) {
            const val = getAppScore(app, activeOverlay, appDef);
            colors = getOverlayColor(val, appDef, picklists);
          }
          landscapeNodes.push({
            id: `app-unassigned-${app.id}`,
            parentNode: 'cap-unassigned',
            data: { label: app.name, type: 'app', original: app },
            position: { x: padding, y: titleHeight + (i * (appHeight + 10)) },
            style: {
              background: colors.bg,
              color: colors.text,
              border: `1px solid ${isDark ? 'rgba(255,255,255,0.1)' : borderColor}`,
              borderRadius: '8px',
              width: maxWidth - (padding * 2),
              height: appHeight,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '13px',
              fontWeight: 600,
              zIndex: 100
            }
          });
        });
      }

      setNodes(landscapeNodes);
      setEdges([]);
    }
  }, [allApps, filteredAppsProps, integrations, allCapabilities, metaDefs, picklists, mode, activeOverlay, showApplications, relationSearch]);

  const onNodeInternalClick = (_: any, node: Node) => {
    if (node.data.type === 'app') onNodeClick?.(node.data.original);
    else if (node.data.type === 'capability' && node.data.originalId !== 'unassigned') onCapabilityClick?.(node.data.original);
  };

  const fieldDefs = metaDefs.filter(d => d.fieldName === activeOverlay);
  const activeDef = fieldDefs[0];
  const isDark = document.documentElement.getAttribute('data-theme') === 'dark';

  return (
    <div style={{ width: '100%', height: '100%' }}>
      <ReactFlow
        key={`${mode}-${activeOverlay}-${showApplications}`}
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onNodeClick={onNodeInternalClick}
        nodesDraggable={true}
        nodesConnectable={false}
        elementsSelectable={true}
        panOnDrag={true}
        zoomOnScroll={true}
        fitView
        fitViewOptions={{ padding: 0.2 }}
        minZoom={0.01}
        maxZoom={4}
      >
        <Background color="var(--border)" gap={20} />
        <Controls showInteractive={false} />
        
        <Panel position="top-right" style={{ 
          background: 'var(--card)', 
          padding: '8px 12px', 
          borderRadius: '8px', 
          border: '1px solid var(--border)',
          fontSize: '12px',
          color: 'var(--foreground)',
          boxShadow: '0 1px 3px rgba(0,0,0,0.1)'
        }}>
          <strong>{mode === 'network' ? 'Integrations' : 'Landscape'} View</strong>
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
          maxWidth: '220px'
        }}>
          <div style={{ fontWeight: 700, marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.025em', fontSize: '10px', color: 'var(--muted-foreground)' }}>
            {activeOverlay ? activeDef?.label : 'Application Lifecycle'}
          </div>
          
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            {!activeOverlay ? (
              LIFECYCLE_STAGES.map(stage => (
                <div key={stage.label} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <div style={{ width: '12px', height: '12px', borderRadius: '3px', background: isDark ? stage.color : stage.lightColor, border: `1px solid ${isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.05)'}` }} />
                  <span>{stage.label}</span>
                </div>
              ))
            ) : (
              picklists?.find(p => p.name.replace(/_/g, '').toLowerCase() === activeDef?.fieldName.toLowerCase()) ? (
                picklists.find(p => p.name.replace(/_/g, '').toLowerCase() === activeDef?.fieldName.toLowerCase())?.options.map(opt => (
                  <div key={opt.value} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <div style={{ width: '12px', height: '12px', borderRadius: '3px', background: opt.color, border: `1px solid ${isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.05)'}` }} />
                    <span>{opt.label}</span>
                  </div>
                ))
              ) : activeDef && (
                <div style={{ width: '100%' }}>
                  <div style={{ 
                    height: '10px', 
                    width: '100%', 
                    borderRadius: '5px', 
                    background: `linear-gradient(to right, ${getScaleColors(activeDef.scaleType).join(', ')})`,
                    marginBottom: '4px'
                  }} />
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '9px', fontWeight: 600 }}>
                    <span>{activeDef.min}</span>
                    <span>{activeDef.max}</span>
                  </div>
                </div>
              )
            )}
          </div>
        </Panel>
      </ReactFlow>
    </div>
  );
};
