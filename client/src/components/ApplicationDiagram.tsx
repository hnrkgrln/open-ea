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

interface Props {
  onNodeClick?: (app: Application) => void;
  onCapabilityClick?: (cap: Capability) => void;
  appsOverride?: Application[];
  mode?: 'network' | 'landscape';
}

const dagreGraph = new dagre.graphlib.Graph();
dagreGraph.setDefaultEdgeLabel(() => ({}));

const getLayoutedElements = (nodes: Node[], edges: Edge[]) => {
  dagreGraph.setGraph({ rankdir: 'LR', nodesep: 80, ranksep: 200 }); // Left-to-Right layout

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

export const ApplicationDiagram = ({ onNodeClick, onCapabilityClick, appsOverride, mode = 'network' }: Props) => {
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

  useEffect(() => {
    if (!apps || !integrations || !allCapabilities) return;

    const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
    const borderColor = 'var(--border)';
    const groupBg = isDark ? 'rgba(37, 38, 43, 0.6)' : 'rgba(255, 255, 255, 0.6)';
    const textColor = 'var(--foreground)';

    if (mode === 'network') {
      // --- Integrations View ---
      const networkNodes: Node[] = apps.map((app) => {
        const colors = getLifecycleColor(app.lifecycle, isDark);
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
          labelStyle: { fill: textColor, fontSize: 11, fontWeight: 600 },
          labelBgStyle: { fill: 'var(--card)', fillOpacity: 0.9 },
          labelBgPadding: [6, 4],
          labelBgBorderRadius: 4,
          style: { stroke: isDark ? '#5c5f66' : '#adb5bd', strokeWidth: 2 },
          markerEnd: { type: MarkerType.ArrowClosed, color: isDark ? '#5c5f66' : '#adb5bd', width: 20, height: 20 },
        }));

      const layoutedNodes = getLayoutedElements(networkNodes, networkEdges);
      setNodes(layoutedNodes);
      setEdges(networkEdges);
    } else {
      // --- Landscape View ---
      const landscapeNodes: Node[] = [];
      const capsMap = new Map<string, Capability>();
      allCapabilities.forEach(c => capsMap.set(c.id, c));

      // Map apps to their deepest capability
      const appsByCap = new Map<string, Application[]>();
      apps.forEach(app => {
        if (!app.capabilities || app.capabilities.length === 0) return;
        let deepestCap = app.capabilities[0];
        app.capabilities.forEach(cap => {
          if (allCapabilities.some(c => c.id === cap.id && c.parentId === deepestCap.id)) {
            deepestCap = cap;
          }
        });
        if (!appsByCap.has(deepestCap.id)) appsByCap.set(deepestCap.id, []);
        appsByCap.get(deepestCap.id)!.push(app);
      });

      let currentRootX = 0;
      const rootGap = 100;

      const renderCap = (capId: string, parentId?: string, depth = 0): { width: number; height: number } => {
        const cap = capsMap.get(capId)!;
        const children = allCapabilities.filter(c => c.parentId === capId);
        const associatedApps = appsByCap.get(capId) || [];

        const appHeight = 50;
        const appWidth = 200;
        const padding = 20;
        const titleHeight = 40;

        let totalChildWidth = 0;
        let maxChildHeight = 0;
        const childLayouts: any[] = [];

        children.forEach(child => {
          const layout = renderCap(child.id, `cap-${capId}`, depth + 1);
          childLayouts.push({ id: child.id, ...layout });
          totalChildWidth += layout.width + 20;
          maxChildHeight = Math.max(maxChildHeight, layout.height);
        });

        const appsHeight = associatedApps.length > 0 ? (associatedApps.length * (appHeight + 10)) + padding : 0;
        const nodeWidth = Math.max(totalChildWidth + (padding * 2), appWidth + (padding * 2), 300);
        const nodeHeight = titleHeight + Math.max(maxChildHeight, appsHeight) + padding;

        landscapeNodes.push({
          id: `cap-${capId}`,
          data: { label: cap.name, type: 'capability', originalId: capId },
          position: { x: depth === 0 ? currentRootX : 0, y: 0 },
          parentNode: parentId,
          style: {
            background: depth === 0 ? groupBg : 'rgba(0,0,0,0.05)',
            border: `2px ${depth === 0 ? 'solid' : 'dashed'} ${isDark ? '#373a40' : '#dee2e6'}`,
            width: nodeWidth,
            height: nodeHeight,
            borderRadius: depth === 0 ? '16px' : '8px',
            pointerEvents: 'all',
            zIndex: depth,
          }
        });

        let offsetX = padding;
        children.forEach((child, i) => {
          const nodeIdx = landscapeNodes.findIndex(n => n.id === `cap-${child.id}`);
          if (nodeIdx !== -1) {
            landscapeNodes[nodeIdx].position = { x: offsetX, y: titleHeight };
            offsetX += childLayouts[i].width + 20;
          }
        });

        associatedApps.forEach((app, i) => {
          const colors = getLifecycleColor(app.lifecycle, isDark);
          landscapeNodes.push({
            id: `app-${capId}-${app.id}`,
            parentNode: `cap-${capId}`,
            data: { label: app.name, type: 'app', original: app },
            position: { x: nodeWidth - appWidth - padding, y: titleHeight + (i * (appHeight + 10)) },
            style: {
              background: colors.bg,
              color: colors.text,
              border: `1px solid ${isDark ? 'transparent' : borderColor}`,
              borderRadius: '6px',
              width: appWidth,
              height: appHeight,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '12px',
              fontWeight: 600,
              zIndex: 100
            }
          });
        });

        return { width: nodeWidth, height: nodeHeight };
      };

      const roots = allCapabilities.filter(c => !c.parentId);
      roots.forEach(root => {
        const layout = renderCap(root.id);
        currentRootX += layout.width + rootGap;
      });

      setNodes(landscapeNodes);
      setEdges([]);
    }
  }, [apps, integrations, allCapabilities, mode]);

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
        key={mode} // Force fresh mount on mode change to clear parent/child state artifacts
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
          <strong>{mode === 'network' ? 'Integrations' : 'Landscape'} View</strong><br/>
          Click objects to edit • Drag to pan
        </Panel>
      </ReactFlow>
    </div>
  );
};
