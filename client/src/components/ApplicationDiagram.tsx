import React, { useEffect } from 'react';
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
  capabilities?: { id: string; name: string }[];
}

interface Capability {
  id: string;
  name: string;
  description?: string;
  parentId?: string | null;
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
  fieldName: string;
  fieldType: string;
  label: string;
  min: number;
  max: number;
  scaleType: string;
}

interface Props {
  onNodeClick?: (app: Application) => void;
  onCapabilityClick?: (cap: Capability) => void;
  appsOverride?: Application[];
  mode?: 'network' | 'landscape';
  activeOverlay?: string | null; // fieldName of the range field to visualize
}

const getLayoutedElements = (nodes: Node[], edges: Edge[]) => {
  const dagreGraph = new dagre.graphlib.Graph();
  dagreGraph.setDefaultEdgeLabel(() => ({}));
  dagreGraph.setGraph({ rankdir: 'TB', nodesep: 150, ranksep: 200 });

  nodes.forEach((node) => {
    dagreGraph.setNode(node.id, { width: 200, height: 70 });
  });

  edges.forEach((edge) => {
    dagreGraph.setEdge(edge.source, edge.target);
  });

  dagre.layout(dagreGraph);

  return nodes.map((node) => {
    const nodeWithPosition = dagreGraph.node(node.id);
    return {
      ...node,
      position: {
        x: nodeWithPosition.x - 100,
        y: nodeWithPosition.y - 35,
      },
    };
  });
};

const getLifecycleColor = (lifecycle: string, isDark: boolean) => {
  const lc = lifecycle?.toLowerCase() || 'planning';
  const colors: any = {
    planning: isDark ? '#1864ab' : '#e7f5ff',
    deployment: isDark ? '#5f3dc4' : '#f3f0ff',
    maintenance: isDark ? '#2b8a3e' : '#ebfbee',
    sunset: isDark ? '#d9480f' : '#fff4e6',
    decommissioned: isDark ? '#c92a2a' : '#fff5f5'
  };
  const textColors: any = {
    planning: isDark ? '#d0ebff' : '#1971c2',
    deployment: isDark ? '#e5dbff' : '#6741d9',
    maintenance: isDark ? '#d3f9d8' : '#2b8a3e',
    sunset: isDark ? '#fff4e6' : '#e67700',
    decommissioned: isDark ? '#ffe3e3' : '#c92a2a'
  };
  return { bg: colors[lc] || colors.planning, text: textColors[lc] || textColors.planning };
};

// Helper to interpolate colors for gradients
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

const getOverlayColor = (value: number, def: MetadataDefinition, isDark: boolean) => {
  const min = def.min ?? 0;
  const max = def.max ?? 100;
  const range = max - min;
  const normalized = range === 0 ? 0.5 : (value - min) / range;

  let colors = ['#2b8a3e', '#fab005', '#c92a2a']; // good-bad default
  if (def.scaleType === 'bad-good') colors = ['#c92a2a', '#fab005', '#2b8a3e'];
  if (def.scaleType === 'low-high') colors = ['#e7f5ff', '#1864ab'];
  if (def.scaleType === 'importance') colors = ['#f1f3f5', '#5f3dc4'];
  if (def.scaleType === 'neutral') colors = ['#dee2e6', '#343a40'];

  let bg = '';
  if (colors.length === 3) {
    if (normalized < 0.5) bg = interpolateColor(colors[0], colors[1], normalized * 2);
    else bg = interpolateColor(colors[1], colors[2], (normalized - 0.5) * 2);
  } else {
    bg = interpolateColor(colors[0], colors[1], normalized);
  }

  return { bg, text: isDark ? '#ffffff' : '#000000' };
};

export const ApplicationDiagram = ({ onNodeClick, onCapabilityClick, appsOverride, mode = 'network', activeOverlay }: Props) => {
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);

  const { data: remoteApps } = useQuery<Application[]>({
    queryKey: ['applications'],
    queryFn: async () => {
      const res = await fetch('/api/applications');
      return res.json();
    },
    enabled: !appsOverride
  });

  const apps = appsOverride || remoteApps;

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

  const { data: metaDefs } = useQuery<MetadataDefinition[]>({
    queryKey: ['metadata-definitions'],
    queryFn: async () => {
      const res = await fetch('/api/metadata-definitions');
      return res.json();
    }
  });

  useEffect(() => {
    if (!apps || !integrations || !allCapabilities || !metaDefs) return;

    const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
    const borderColor = 'var(--border)';
    const groupBg = isDark ? 'rgba(37, 38, 43, 0.6)' : 'rgba(255, 255, 255, 0.6)';
    const textColor = 'var(--foreground)';

    const activeDef = metaDefs.find(d => d.fieldName === activeOverlay);

    if (mode === 'network') {
      const networkNodes: Node[] = apps.map((app) => {
        let colors = getLifecycleColor(app.lifecycle, isDark);
        
        if (activeOverlay && activeDef) {
          try {
            const meta = app.metadata ? JSON.parse(app.metadata) : {};
            const val = meta[activeOverlay] ?? activeDef.min;
            colors = getOverlayColor(Number(val), activeDef, isDark);
          } catch (e) {}
        }

        return {
          id: app.id,
          data: { label: app.name, type: 'app', original: app },
          position: { x: 0, y: 0 },
          style: { 
            background: colors.bg, 
            color: colors.text, 
            border: `1px solid ${isDark ? 'transparent' : borderColor}`,
            borderRadius: '8px',
            width: 200,
            fontSize: '13px',
            fontWeight: 600,
            textAlign: 'center',
            padding: '12px',
            boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)'
          }
        };
      });

      const visibleIds = new Set(apps.map(a => a.id));
      const networkEdges: Edge[] = integrations
        .filter(i => visibleIds.has(i.sourceAppId) && visibleIds.has(i.targetAppId))
        .map((i) => ({
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

      const layoutedNodes = getLayoutedElements(networkNodes, networkEdges);
      setNodes(layoutedNodes);
      setEdges(networkEdges);
    } else {
      const landscapeNodes: Node[] = [];
      const capsMap = new Map<string, Capability>();
      allCapabilities.forEach(c => capsMap.set(c.id, c));

      const appToCapMap = new Map<string, string>();
      apps.forEach(app => {
        if (!app.capabilities || app.capabilities.length === 0) return;
        let deepestCap = app.capabilities[0];
        app.capabilities.forEach(cap => {
          if (allCapabilities.some(c => c.id === cap.id && c.parentId === deepestCap.id)) deepestCap = cap;
        });
        appToCapMap.set(app.id, deepestCap.id);
      });

      const appsByCap = new Map<string, Application[]>();
      apps.forEach(app => {
        const assignedCapId = appToCapMap.get(app.id);
        if (assignedCapId) {
          if (!appsByCap.has(assignedCapId)) appsByCap.set(assignedCapId, []);
          appsByCap.get(assignedCapId)!.push(app);
        }
      });

      let currentRootX = 0;
      const rootGap = 100;

      const renderCap = (capId: string, parentId?: string, depth = 0): { width: number; height: number } => {
        const cap = capsMap.get(capId)!;
        const children = allCapabilities.filter(c => c.parentId === capId);
        const associatedApps = appsByCap.get(capId) || [];
        const appHeight = 50;
        const appWidth = 240;
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
          if (activeOverlay && activeDef) {
            try {
              const meta = app.metadata ? JSON.parse(app.metadata) : {};
              const val = meta[activeOverlay] ?? activeDef.min;
              colors = getOverlayColor(Number(val), activeDef, isDark);
            } catch (e) {}
          }

          landscapeNodes.push({
            id: `app-${capId}-${app.id}`,
            parentNode: `cap-${capId}`,
            data: { label: app.name, type: 'app', original: app },
            position: { x: padding, y: totalHeight + (i * (appHeight + 10)) },
            style: {
              background: colors.bg,
              color: colors.text,
              border: `1px solid ${isDark ? 'transparent' : borderColor}`,
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

        landscapeNodes.push({
          id: `cap-${capId}`,
          data: { label: cap.name, type: 'capability', originalId: capId },
          position: { x: depth === 0 ? currentRootX : 0, y: 0 },
          parentNode: parentId,
          style: {
            background: depth === 0 ? groupBg : 'rgba(0,0,0,0.03)',
            border: `2px ${depth === 0 ? 'solid' : 'dashed'} ${isDark ? '#373a40' : '#dee2e6'}`,
            width: maxWidth,
            height: finalHeight,
            borderRadius: depth === 0 ? '16px' : '8px',
            pointerEvents: 'all',
            zIndex: depth,
          }
        });

        return { width: maxWidth, height: finalHeight };
      };

      const roots = allCapabilities.filter(c => !c.parentId);
      roots.forEach(root => {
        const layout = renderCap(root.id);
        currentRootX += layout.width + rootGap;
      });

      setNodes(landscapeNodes);
      setEdges([]);
    }
  }, [apps, integrations, allCapabilities, metaDefs, mode, activeOverlay]);

  const onNodeInternalClick = (_: any, node: Node) => {
    if (node.data.type === 'app') {
      onNodeClick?.(node.data.original);
    } else if (node.data.type === 'capability') {
      const cap = allCapabilities?.find(c => c.id === node.data.originalId);
      if (cap) onCapabilityClick?.(cap);
    }
  };

  return (
    <div style={{ width: '100%', height: '100%' }}>
      <ReactFlow
        key={`${mode}-${activeOverlay}`}
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
          {activeOverlay && <div style={{ color: 'var(--primary)', fontWeight: 600, marginTop: '4px' }}>Overlay: {metaDefs?.find(d => d.fieldName === activeOverlay)?.label}</div>}
          <div style={{ marginTop: '4px', fontSize: '10px' }}>Click objects to edit • Drag to pan</div>
        </Panel>
      </ReactFlow>
    </div>
  );
};
