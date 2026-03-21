import React, { useEffect, useRef } from 'react';
import { Graph } from '@antv/x6';
import { useQuery } from '@tanstack/react-query';

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

export const ApplicationDiagram = ({ onNodeClick, onCapabilityClick, appsOverride, mode = 'network' }: Props) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const graphRef = useRef<Graph | null>(null);

  const { data: remoteApps } = useQuery({
    queryKey: ['applications'],
    queryFn: async () => {
      const res = await fetch('/api/applications');
      return res.json() as Promise<Application[]>;
    },
    enabled: !appsOverride
  });

  const apps = appsOverride || remoteApps;

  const { data: integrations } = useQuery({
    queryKey: ['integrations'],
    queryFn: async () => {
      const res = await fetch('/api/integrations');
      return res.json() as Promise<Integration[]>;
    }
  });

  const { data: capabilities } = useQuery({
    queryKey: ['capabilities'],
    queryFn: async () => {
      const res = await fetch('/api/capabilities?flat=true');
      return res.json() as Promise<Capability[]>;
    }
  });

  // 1. Initialize Graph with restricted editing
  useEffect(() => {
    if (!containerRef.current || graphRef.current) return;

    const graph = new Graph({
      container: containerRef.current,
      autoResize: true,
      panning: true,
      mousewheel: { enabled: true, modifiers: ['ctrl', 'meta'] },
      grid: {
        visible: true,
        type: 'doubleMesh',
        args: [
          { color: 'var(--border)', thickness: 1 },
          { color: 'var(--border)', thickness: 1, factor: 4 },
        ],
      },
      interacting: {
        nodeMovable: (view) => {
          return view.cell.getData()?.parent === true;
        },
        edgeMovable: false,
        arrowheadMovable: false,
        vertexMovable: false,
        vertexDeletable: false,
        edgeLabelMovable: false,
      },
      connecting: {
        router: 'manhattan',
        connector: { name: 'rounded' },
      },
    });

    graphRef.current = graph;

    return () => {
      graph.dispose();
      graphRef.current = null;
    };
  }, []);

  // 2. Data Update Logic (Clean Sweep + Explicit Removal)
  useEffect(() => {
    const graph = graphRef.current;
    if (!graph || !apps || !integrations) return;

    graph.clearCells();

    const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
    const nodeBg = isDark ? 'var(--secondary)' : '#ffffff';
    const textColor = 'var(--foreground)';
    const edgeColor = isDark ? '#52525b' : '#71717a';
    const labelBg = isDark ? '#1a1b1e' : '#ffffff';
    const groupBg = isDark ? 'rgba(44, 46, 51, 0.4)' : 'rgba(241, 243, 245, 0.4)';

    if (mode === 'network') {
      apps.forEach((app, index) => {
        const angle = (index / apps.length) * 2 * Math.PI;
        const radius = Math.min(Math.max(apps.length * 40, 150), 500);
        const centerX = 500;
        const centerY = 400;
        
        graph.addNode({
          id: app.id,
          x: centerX + radius * Math.cos(angle),
          y: centerY + radius * Math.sin(angle),
          width: 140,
          height: 50,
          label: app.name,
          data: { parent: false, type: 'app', originalId: app.id },
          attrs: {
            body: { fill: nodeBg, stroke: 'var(--border)', strokeWidth: 1, rx: 8, ry: 8, cursor: 'pointer' },
            label: { fontSize: 12, fill: textColor, cursor: 'pointer', fontWeight: 500 },
          },
        });
      });

      const visibleIds = new Set(apps.map(a => a.id));
      integrations.forEach((integ) => {
        if (visibleIds.has(integ.sourceAppId) && visibleIds.has(integ.targetAppId)) {
          graph.addEdge({
            source: integ.sourceAppId,
            target: integ.targetAppId,
            labels: [{
              attrs: {
                text: { text: integ.type || '', fill: textColor, fontSize: 10 },
                rect: { fill: labelBg, stroke: 'var(--border)', strokeWidth: 1, rx: 4, ry: 4 },
              },
            }],
            attrs: {
              line: { stroke: edgeColor, strokeWidth: 1, targetMarker: 'classic' },
            },
          });
        }
      });
    } else {
      // Landscape View
      const caps = new Map<string, { name: string; apps: Application[] }>();
      apps.forEach(app => {
        if (app.capabilities && app.capabilities.length > 0) {
          app.capabilities.forEach(cap => {
            if (!caps.has(cap.id)) caps.set(cap.id, { name: cap.name, apps: [] });
            caps.get(cap.id)!.apps.push(app);
          });
        }
      });

      let currentX = 50;
      let currentY = 50;
      const capWidth = 400;
      const appHeight = 60;
      const appPadding = 10;

      Array.from(caps.entries()).forEach(([id, data]) => {
        const groupHeight = Math.max(100, data.apps.length * (appHeight + appPadding) + 60);
        
        const parent = graph.addNode({
          id: `cap-${id}`,
          x: currentX,
          y: currentY,
          width: capWidth,
          height: groupHeight,
          label: data.name,
          zIndex: 1,
          data: { parent: true, type: 'capability', originalId: id },
          attrs: {
            body: { fill: groupBg, stroke: 'var(--border)', strokeWidth: 2, rx: 12, ry: 12, cursor: 'pointer' },
            label: { refY: 20, fontSize: 14, fontWeight: 700, fill: textColor, cursor: 'pointer' },
          },
        });

        data.apps.forEach((app, i) => {
          const child = graph.addNode({
            id: `${id}-${app.id}`,
            x: currentX + 20,
            y: currentY + 50 + (i * (appHeight + appPadding)),
            width: capWidth - 40,
            height: appHeight,
            label: app.name,
            zIndex: 10,
            data: { parent: false, type: 'app', originalId: app.id },
            attrs: {
              body: { fill: nodeBg, stroke: 'var(--border)', strokeWidth: 1, rx: 6, ry: 6, cursor: 'pointer' },
              label: { fontSize: 12, fill: textColor, cursor: 'pointer' },
            },
          });
          parent.addChild(child);
        });

        currentX += capWidth + 50;
        if (currentX > 1500) {
          currentX = 50;
          currentY += 600;
        }
      });
    }

    if (apps.length > 0) {
      const timer = setTimeout(() => {
        graph.centerContent();
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [apps, integrations, mode]);

  // 3. Click Handling
  useEffect(() => {
    const graph = graphRef.current;
    if (!graph) return;

    const handleClick = ({ node }: any) => {
      const data = node.getData();
      if (!data) return;

      if (data.type === 'app') {
        const app = apps?.find(a => a.id === data.originalId);
        if (app && onNodeClick) onNodeClick(app);
      } else if (data.type === 'capability') {
        const cap = capabilities?.find(c => c.id === data.originalId);
        if (cap && onCapabilityClick) onCapabilityClick(cap);
      }
    };

    graph.off('node:click');
    graph.on('node:click', handleClick);
  }, [apps, capabilities, onNodeClick, onCapabilityClick]);

  // 4. Cleanup & Visibility Handling
  useEffect(() => {
    if (!containerRef.current) return;
    const observer = new ResizeObserver(() => {
      if (graphRef.current) graphRef.current.resize();
    });
    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, []);

  return (
    <div style={{ width: '100%', height: '100%', position: 'relative' }}>
      <div ref={containerRef} style={{ width: '100%', height: '100%' }} />
      <div style={{ 
        position: 'absolute', 
        bottom: '1rem', 
        left: '1rem', 
        fontSize: '0.75rem', 
        color: 'var(--muted-foreground)',
        background: 'var(--card)',
        padding: '0.25rem 0.5rem',
        borderRadius: '4px',
        border: '1px solid var(--border)',
        opacity: 0.8
      }}>
        {mode === 'network' ? 'Network View (Locked)' : 'Landscape View (Click Capability or App)'} • Ctrl + Scroll to zoom
      </div>
    </div>
  );
};
