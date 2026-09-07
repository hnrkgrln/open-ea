import React, { useState, useMemo, useRef, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Database, ExternalLink, Filter, Layers, Info } from 'lucide-react';
import { TIME_OPTIONS, DEFAULT_TIME_THRESHOLDS, type TimeThresholds } from '../App';
import { TimeMatrix, getTimeCoordinateX, getTimeCoordinateY, type PlottedApp } from './TimeMatrix';

interface Application {
  id: string;
  name: string;
  description: string;
  owner: string;
  ownerOrgId?: string;
  ownerOrg?: { id: string; name: string };
  lifecycle: string;
  type: string;
  criticality: string;
  cost?: string;
  functionalFit: string;
  technicalFit: string;
  metadata?: string;
  capabilities?: { id: string; name: string; criticality?: string }[];
  contractStartDate?: string;
  contractEndDate?: string;
  contractDetails?: string;
}

interface Props {
  apps: Application[];
  allCapabilities: any[];
  onSelectApp: (id: string) => void;
  onEditApp: (app: any) => void;
  activeTimeFilters: string[];
  onToggleTimeFilter: (timeVal: string) => void;
  thresholds?: TimeThresholds;
}

const QUADRANTS = [
  {
    id: 'MIGRATE',
    title: 'Migrate',
    action: 'Modernize / Replatform',
    sub: 'High Fit · Low Tech',
    color: '#e67700',
    bg: 'rgba(230, 119, 0, 0.04)',
    activeBg: 'rgba(230, 119, 0, 0.14)',
    border: 'rgba(230, 119, 0, 0.3)',
    desc: 'High business alignment, but compromised by technical debt or obsolete architecture.'
  },
  {
    id: 'INVEST',
    title: 'Invest',
    action: 'Grow / Expand / Innovate',
    sub: 'High Fit · High Tech',
    color: '#2b8a3e',
    bg: 'rgba(43, 138, 62, 0.04)',
    activeBg: 'rgba(43, 138, 62, 0.14)',
    border: 'rgba(43, 138, 62, 0.3)',
    desc: 'Mission-critical asset with superior technical health and high strategic alignment.'
  },
  {
    id: 'ELIMINATE',
    title: 'Eliminate',
    action: 'Retire / Decommission',
    sub: 'Low Fit · Low Tech',
    color: '#c92a2a',
    bg: 'rgba(201, 42, 42, 0.04)',
    activeBg: 'rgba(201, 42, 42, 0.14)',
    border: 'rgba(201, 42, 42, 0.3)',
    desc: 'Poor technical sustainability and low functional satisfaction. Candidate for decommission.'
  },
  {
    id: 'TOLERATE',
    title: 'Tolerate',
    action: 'Retain / Maintain',
    sub: 'Low Fit · High Tech',
    color: '#228be6',
    bg: 'rgba(34, 139, 230, 0.04)',
    activeBg: 'rgba(34, 139, 230, 0.14)',
    border: 'rgba(34, 139, 230, 0.3)',
    desc: 'Technically stable but lower functional fit. Retain as-is with minimal run costs.'
  }
];

export const TimeDashboardView: React.FC<Props> = ({
  apps,
  allCapabilities,
  onSelectApp,
  onEditApp,
  activeTimeFilters,
  onToggleTimeFilter,
  thresholds = DEFAULT_TIME_THRESHOLDS
}) => {
  const [selectedAppId, setSelectedAppId] = useState<string | null>(null);
  const [hoveredAppId, setHoveredAppId] = useState<string | null>(null);
  const [selectedQuadrant, setSelectedQuadrant] = useState<string | null>(null);
  const itemRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const leftColRef = useRef<HTMLDivElement>(null);
  const [leftColHeight, setLeftColHeight] = useState<number | null>(null);

  const { data: picklists } = useQuery<any[]>({
    queryKey: ['picklists'],
    queryFn: () => fetch('/api/picklists').then(res => res.json())
  });
  const costOptions = useMemo(() => picklists?.find((p: any) => p.name === 'application_cost')?.options || [], [picklists]);

  // Measure left column height dynamically to ensure the app list is exactly as tall as the matrix
  useEffect(() => {
    if (!leftColRef.current) return;
    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        if (entry.contentRect.height > 0) {
          setLeftColHeight(Math.round(entry.contentRect.height));
        }
      }
    });
    ro.observe(leftColRef.current);
    return () => ro.disconnect();
  }, []);

  // Auto-scroll list to selected app inside the scrollable container
  useEffect(() => {
    if (selectedAppId && itemRefs.current[selectedAppId]) {
      itemRefs.current[selectedAppId]?.scrollIntoView({
        behavior: 'smooth',
        block: 'nearest'
      });
    }
  }, [selectedAppId]);

  // Helper to calculate recursive criticality
  const getAppCriticality = (app: Application) => {
    let max = Number(app.criticality || 1);
    if (app.capabilities && app.capabilities.length > 0) {
      const getRecursive = (capIds: string[]): number => {
        let localMax = 0;
        capIds.forEach(id => {
          const cap = allCapabilities.find((c: any) => c.id === id);
          if (cap) {
            localMax = Math.max(localMax, Number(cap.criticality || 1));
            const childIds = (allCapabilities.filter((c: any) => c.parentId === id) || []).map((c: any) => c.id);
            if (childIds.length > 0) localMax = Math.max(localMax, getRecursive(childIds));
          }
        });
        return localMax;
      };
      max = Math.max(max, getRecursive(app.capabilities.map(c => c.id)));
    }
    return max;
  };

  // Memoize apps with effective inherited criticality for matrix plotting
  const appsWithEffectiveCrit = useMemo(() => {
    return apps.map(app => ({
      ...app,
      criticality: getAppCriticality(app)
    }));
  }, [apps, allCapabilities]);

  // Compute coordinate and TIME quadrant for each app
  const appPlots = useMemo(() => {
    // Group apps by identical (techScore, funcScore) to jitter overlapping coordinates slightly
    const coordGroups: Record<string, Application[]> = {};

    apps.forEach(app => {
      const tech = Number(app.technicalFit);
      const func = Number(app.functionalFit);
      const tVal = !isNaN(tech) && tech > 0 ? Math.max(1, Math.min(5, tech)) : 3;
      const fVal = !isNaN(func) && func > 0 ? Math.max(1, Math.min(5, func)) : 3;
      const key = `${tVal}_${fVal}`;
      if (!coordGroups[key]) coordGroups[key] = [];
      coordGroups[key].push(app);
    });

    const techCutoff = thresholds?.technicalFit ?? 3;
    const funcCutoff = thresholds?.functionalFit ?? 3;
    const critCutoff = thresholds?.businessCriticality ?? 4;
    const costCutoff = thresholds?.cost ?? 4;

    return apps.map(app => {
      const tech = Number(app.technicalFit);
      const func = Number(app.functionalFit);
      const hasTech = !isNaN(tech) && tech > 0;
      const hasFunc = !isNaN(func) && func > 0;
      const tVal = hasTech ? Math.max(1, Math.min(5, tech)) : 3;
      const fVal = hasFunc ? Math.max(1, Math.min(5, func)) : 3;
      const isTechHigh = tVal >= techCutoff;
      const isFuncHigh = fVal >= funcCutoff;

      let quadrant: 'INVEST' | 'MIGRATE' | 'TOLERATE' | 'ELIMINATE';
      let color = '#2b8a3e';
      if (!isTechHigh && isFuncHigh) {
        quadrant = 'MIGRATE';
        color = '#e67700';
      } else if (isTechHigh && isFuncHigh) {
        quadrant = 'INVEST';
        color = '#2b8a3e';
      } else if (isTechHigh && !isFuncHigh) {
        quadrant = 'TOLERATE';
        color = '#228be6';
      } else {
        quadrant = 'ELIMINATE';
        color = '#c92a2a';
      }

      const crit = getAppCriticality(app);
      const costNum = Number(app.cost);
      const costVal = !isNaN(costNum) && costNum > 0 ? Math.max(1, Math.min(5, costNum)) : 1;
      const isHighCost = costVal >= costCutoff;
      const isMissionCritical = crit >= critCutoff;
      const dotSize = isMissionCritical ? 20 + (crit - critCutoff) * 3 : 11 + (crit - 1) * 2;

      // Symmetrical threshold-aware coordinates:
      // Guarantees that apps are positioned strictly within their classified quadrant
      let baseX = getTimeCoordinateX(tVal, techCutoff);
      let baseY = getTimeCoordinateY(fVal, funcCutoff);

      // Subtle jitter if multiple apps share the exact coordinate
      const groupKey = `${tVal}_${fVal}`;
      const group = coordGroups[groupKey] || [app];
      const indexInGroup = group.findIndex(a => a.id === app.id);
      if (group.length > 1 && indexInGroup >= 0) {
        const angle = (indexInGroup / group.length) * 2 * Math.PI;
        const radius = Math.min(4.5, 1.8 + group.length * 0.4);
        baseX += Math.cos(angle) * radius;
        baseY += Math.sin(angle) * radius;
      }

      // Clamp strictly within the quadrant boundaries so jitter never pushes an app across the 50% divider
      const xPct = isTechHigh
        ? Math.max(52, Math.min(94, baseX))
        : Math.max(6, Math.min(48, baseX));
      const yPct = isFuncHigh
        ? Math.max(6, Math.min(48, baseY))
        : Math.max(52, Math.min(94, baseY));

      return {
        app,
        quadrant,
        color,
        crit,
        cost: costVal,
        dotSize,
        techScore: tVal,
        funcScore: fVal,
        xPct,
        yPct,
        isHighCost,
        isMissionCritical
      };
    });
  }, [apps, allCapabilities, thresholds]);

  // Quadrant summary stats
  const quadrantStats = useMemo(() => {
    const counts: Record<string, number> = {
      INVEST: 0,
      MIGRATE: 0,
      TOLERATE: 0,
      ELIMINATE: 0
    };
    appPlots.forEach(p => {
      counts[p.quadrant] = (counts[p.quadrant] || 0) + 1;
    });
    return counts;
  }, [appPlots]);

  const displayedPlots = useMemo(() => {
    if (!selectedQuadrant) return appPlots;
    return appPlots.filter(p => p.quadrant === selectedQuadrant);
  }, [appPlots, selectedQuadrant]);

  // Active plot: Shows hovered app while mouse is over it, otherwise returns to clicked/selected app
  const inspectedPlot = useMemo(() => {
    const targetId = hoveredAppId || selectedAppId;
    if (targetId) {
      const match = appPlots.find(p => p.app.id === targetId);
      if (match) return match;
    }
    return displayedPlots[0] || appPlots[0] || null;
  }, [hoveredAppId, selectedAppId, appPlots, displayedPlots]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
      {/* 4 Quadrant Summary Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '0.85rem' }}>
        {QUADRANTS.map(q => {
          const count = quadrantStats[q.id] || 0;
          const pct = apps.length > 0 ? Math.round((count / apps.length) * 100) : 0;
          const isSelected = selectedQuadrant === q.id;
          const isFilteredIn = activeTimeFilters.length === 0 || activeTimeFilters.includes(q.id);

          return (
            <div
              key={q.id}
              onClick={() => setSelectedQuadrant(prev => prev === q.id ? null : q.id)}
              className="row-hover"
              style={{
                cursor: 'pointer',
                background: isSelected ? q.activeBg : 'var(--card)',
                borderRadius: '12px',
                border: isSelected ? `2px solid ${q.color}` : '1px solid var(--border)',
                padding: '0.9rem 1.1rem',
                position: 'relative',
                boxShadow: isSelected ? `0 4px 12px ${q.color}22` : '0 1px 3px rgba(0,0,0,0.03)',
                transition: 'all 0.2s ease',
                opacity: isFilteredIn ? 1 : 0.6
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.35rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <div style={{ width: '10px', height: '10px', borderRadius: '3px', background: q.color }} />
                  <span style={{ fontWeight: 800, fontSize: '0.9rem', color: q.color, letterSpacing: '0.03em' }}>{q.title}</span>
                </div>
                <span style={{ fontSize: '1.25rem', fontWeight: 900, color: 'var(--foreground)' }}>
                  {count}
                  <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--muted-foreground)', marginLeft: '0.25rem' }}>
                    ({pct}%)
                  </span>
                </span>
              </div>
              <div style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--foreground)' }}>{q.action}</div>
              <div style={{ fontSize: '0.65rem', color: 'var(--muted-foreground)', marginTop: '0.2rem' }}>{q.sub}</div>
              {isSelected && (
                <div style={{ 
                  marginTop: '0.5rem', 
                  fontSize: '0.65rem', 
                  fontWeight: 800, 
                  color: q.color, 
                  textTransform: 'uppercase',
                  letterSpacing: '0.05em' 
                }}>
                  Showing only {q.title} apps (click to clear)
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Main 2x2 TIME Diagram Card */}
      <div 
        className="card time-dashboard-grid" 
        style={{ 
          padding: '1.75rem', 
          background: 'var(--card)', 
          borderRadius: '16px', 
          boxShadow: '0 2px 10px rgba(0,0,0,0.04)'
        }}
      >
        {/* 2x2 Interactive Chart Container */}
        <div ref={leftColRef} style={{ display: 'flex', flexDirection: 'column', width: '100%', minWidth: 0 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', minHeight: '1.75rem' }}>
            <div style={{ fontSize: '0.8rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--muted-foreground)' }}>
              TIME Assessment Matrix
            </div>
            <div style={{ fontSize: '0.75rem', color: 'var(--muted-foreground)' }}>
              Showing <strong>{displayedPlots.length}</strong> of {apps.length} apps
            </div>
          </div>

          <TimeMatrix
            apps={appsWithEffectiveCrit}
            selectedAppId={selectedAppId}
            hoveredAppId={hoveredAppId}
            selectedQuadrant={selectedQuadrant}
            onSelectApp={setSelectedAppId}
            onHoverApp={setHoveredAppId}
            onSelectQuadrant={setSelectedQuadrant}
            thresholds={thresholds}
            aspectRatio="1 / 1"
            showLegend={true}
          />
        </div>

        {/* Right Side: Sticky/Hover Inspection Card + Scrollable Application List */}
        <div 
          className="time-dashboard-right-col"
          style={{ 
            height: leftColHeight ? `${leftColHeight}px` : undefined,
            maxHeight: leftColHeight ? `${leftColHeight}px` : undefined
          }}
        >
          {/* Header row aligned with left column header */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', minHeight: '1.75rem', flexShrink: 0 }}>
            <div style={{ fontSize: '0.8rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--muted-foreground)' }}>
              Application Inspector
            </div>
            {inspectedPlot && (
              <div style={{ fontSize: '0.75rem', color: 'var(--muted-foreground)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '240px' }}>
                Active: <strong style={{ color: inspectedPlot.color }}>{inspectedPlot.app.name}</strong>
              </div>
            )}
          </div>
          
          {/* Static height inspector box showing hover preview OR locked clicked app */}
          <div 
            style={{ 
              height: '165px', 
              borderRadius: '12px', 
              border: inspectedPlot ? `1.5px solid ${inspectedPlot.color}` : '1.5px dashed var(--border)', 
              background: 'var(--card)',
              boxShadow: inspectedPlot ? `0 4px 16px ${inspectedPlot.color}15` : 'none',
              padding: '0.9rem 1.15rem',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'space-between',
              transition: 'border-color 0.2s, box-shadow 0.2s',
              overflow: 'hidden',
              flexShrink: 0
            }}
          >
            {inspectedPlot ? (
              <>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '0.5rem' }}>
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.2rem' }}>
                      <span style={{ 
                        fontSize: '0.62rem', 
                        fontWeight: 900, 
                        letterSpacing: '0.06em', 
                        textTransform: 'uppercase', 
                        padding: '0.12rem 0.45rem', 
                        borderRadius: '4px', 
                        background: `${inspectedPlot.color}18`, 
                        color: inspectedPlot.color,
                        border: `1px solid ${inspectedPlot.color}44`
                      }}>
                        {inspectedPlot.quadrant}
                      </span>
                      {hoveredAppId && hoveredAppId !== selectedAppId && (
                        <span style={{ fontSize: '0.62rem', color: 'var(--muted-foreground)', fontStyle: 'italic' }}>
                          (Hovering preview)
                        </span>
                      )}
                      <span style={{ fontSize: '0.72rem', color: 'var(--muted-foreground)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {inspectedPlot.app.owner || 'Unassigned'} {inspectedPlot.app.ownerOrg && `• ${inspectedPlot.app.ownerOrg.name}`}
                      </span>
                    </div>
                    <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 800, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {inspectedPlot.app.name}
                    </h3>
                  </div>
                  <button 
                    onClick={() => onSelectApp(inspectedPlot.app.id)}
                    className="primary"
                    style={{ height: '1.85rem', padding: '0 0.7rem', fontSize: '0.75rem', gap: '0.3rem', flexShrink: 0 }}
                    title="Open full application details page"
                  >
                    Details <ExternalLink size={12} />
                  </button>
                </div>

                <p style={{ 
                  margin: 0, 
                  fontSize: '0.72rem', 
                  color: 'var(--foreground)', 
                  opacity: 0.85, 
                  lineHeight: 1.35,
                  display: '-webkit-box',
                  WebkitLineClamp: 2,
                  WebkitBoxOrient: 'vertical',
                  overflow: 'hidden'
                }}>
                  {inspectedPlot.app.description || 'No description provided.'}
                </p>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '0.5rem', background: 'var(--secondary)', padding: '0.4rem 0.65rem', borderRadius: '8px' }}>
                  <div>
                    <div style={{ fontSize: '0.58rem', color: 'var(--muted-foreground)', fontWeight: 700, textTransform: 'uppercase' }}>Technical Fit</div>
                    <div style={{ fontSize: '0.88rem', fontWeight: 800, color: inspectedPlot.techScore >= (thresholds?.technicalFit ?? 3) ? '#2b8a3e' : '#c92a2a' }}>
                      {inspectedPlot.techScore}/5
                    </div>
                  </div>
                  <div>
                    <div style={{ fontSize: '0.58rem', color: 'var(--muted-foreground)', fontWeight: 700, textTransform: 'uppercase' }}>Functional Fit</div>
                    <div style={{ fontSize: '0.88rem', fontWeight: 800, color: inspectedPlot.funcScore >= (thresholds?.functionalFit ?? 3) ? '#2b8a3e' : '#c92a2a' }}>
                      {inspectedPlot.funcScore}/5
                    </div>
                  </div>
                  <div>
                    <div style={{ fontSize: '0.58rem', color: 'var(--muted-foreground)', fontWeight: 700, textTransform: 'uppercase' }}>Criticality</div>
                    <div style={{ fontSize: '0.88rem', fontWeight: 800, color: inspectedPlot.crit >= (thresholds?.businessCriticality ?? 4) ? '#c92a2a' : 'var(--foreground)' }}>
                      {inspectedPlot.crit}/5
                    </div>
                  </div>
                  <div>
                    <div style={{ fontSize: '0.58rem', color: 'var(--muted-foreground)', fontWeight: 700, textTransform: 'uppercase' }}>Cost</div>
                    {(() => {
                      const costCutoff = thresholds?.cost ?? 4;
                      const isHighCost = inspectedPlot.cost >= costCutoff;
                      const opt = costOptions.find((o: any) => String(o.value) === String(inspectedPlot.cost));
                      return (
                        <div 
                          style={{ 
                            fontSize: '0.88rem', 
                            fontWeight: 800, 
                            color: isHighCost ? '#fd7e14' : (opt?.color || 'var(--foreground)'), 
                            display: 'flex', 
                            alignItems: 'center', 
                            gap: '0.25rem', 
                            overflow: 'hidden', 
                            textOverflow: 'ellipsis', 
                            whiteSpace: 'nowrap' 
                          }} 
                          title={opt?.label ? `Cost: ${opt.label} (${isHighCost ? 'High Cost ≥ ' + costCutoff : 'Normal / Low < ' + costCutoff})` : `Cost: ${inspectedPlot.cost}/5`}
                        >
                          {opt?.color && <div style={{ width: '6px', height: '6px', borderRadius: '50%', background: opt.color, flexShrink: 0 }} />}
                          <span>{inspectedPlot.cost}/5</span>
                          <span style={{ fontSize: '0.62rem', fontWeight: 700, color: isHighCost ? '#fd7e14' : '#2b8a3e' }}>
                            ({isHighCost ? 'High' : 'Low'})
                          </span>
                        </div>
                      );
                    })()}
                  </div>
                </div>
              </>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', gap: '0.5rem', color: 'var(--muted-foreground)' }}>
                <Info size={20} style={{ opacity: 0.5 }} />
                <span style={{ fontSize: '0.8rem', fontWeight: 600 }}>Click or hover an application to inspect details</span>
              </div>
            )}
          </div>

          {/* Application List Header */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border)', paddingBottom: '0.5rem', marginTop: '1.1rem', flexShrink: 0 }}>
            <div style={{ fontSize: '0.8rem', fontWeight: 800 }}>
              {selectedQuadrant ? `${selectedQuadrant} Applications (${displayedPlots.length})` : `All Filtered Applications (${displayedPlots.length})`}
            </div>
            {selectedQuadrant && (
              <button 
                onClick={() => setSelectedQuadrant(null)} 
                style={{ background: 'none', border: 'none', color: 'var(--primary)', fontSize: '0.75rem', fontWeight: 700, cursor: 'pointer' }}
              >
                Show All ({appPlots.length})
              </button>
            )}
          </div>

          {/* List of Applications in Quadrant or Overall */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.45rem', flex: 1, minHeight: 0, overflowY: 'auto', overscrollBehavior: 'contain', paddingRight: '0.35rem', marginTop: '0.75rem' }}>
            {displayedPlots.map(plot => {
              const isSelected = selectedAppId === plot.app.id;
              const isHovered = hoveredAppId === plot.app.id;
              const isInspected = inspectedPlot?.app.id === plot.app.id;

              return (
                <div
                  key={plot.app.id}
                  ref={el => { itemRefs.current[plot.app.id] = el; }}
                  onClick={() => setSelectedAppId(plot.app.id)}
                  onMouseEnter={() => setHoveredAppId(plot.app.id)}
                  onMouseLeave={() => setHoveredAppId(null)}
                  style={{
                    padding: '0.6rem 0.85rem',
                    borderRadius: '8px',
                    border: isSelected
                      ? `1.5px solid ${plot.color}`
                      : isHovered
                      ? `1.5px solid ${plot.color}80`
                      : '1.5px solid transparent',
                    background: isSelected
                      ? `${plot.color}1a`
                      : isHovered
                      ? `${plot.color}0f`
                      : 'var(--muted)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    cursor: 'pointer',
                    transition: 'all 0.15s ease'
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', minWidth: 0, flex: 1 }}>
                    <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: plot.color, flexShrink: 0 }} />
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: '0.8rem', fontWeight: isSelected ? 800 : 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {plot.app.name}
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', flexWrap: 'wrap', marginTop: '0.15rem' }}>
                        {plot.app.lifecycle && (
                          <span style={{ 
                            fontSize: '0.65rem', 
                            padding: '0.05rem 0.35rem', 
                            borderRadius: '3px', 
                            background: 'var(--accent)', 
                            color: 'var(--foreground)',
                            fontWeight: 600,
                            lineHeight: 1.2
                          }}>
                            {plot.app.lifecycle}
                          </span>
                        )}
                        {plot.app.type && (
                          <span style={{ 
                            fontSize: '0.65rem', 
                            padding: '0.05rem 0.35rem', 
                            borderRadius: '3px', 
                            background: 'var(--accent)', 
                            color: 'var(--muted-foreground)',
                            lineHeight: 1.2
                          }}>
                            {plot.app.type}
                          </span>
                        )}
                        {(plot.app.owner || plot.app.ownerOrg) && (
                          <span style={{ fontSize: '0.65rem', color: 'var(--muted-foreground)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {plot.app.owner || plot.app.ownerOrg?.name}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', flexShrink: 0, marginLeft: '0.5rem' }}>
                    <span style={{ 
                      fontSize: '0.6rem', 
                      fontWeight: 800, 
                      letterSpacing: '0.04em',
                      textTransform: 'uppercase', 
                      padding: '0.1rem 0.4rem', 
                      borderRadius: '4px', 
                      background: `${plot.color}15`, 
                      color: plot.color 
                    }}>
                      {plot.quadrant}
                    </span>
                    <span style={{ fontSize: '0.7rem', color: 'var(--muted-foreground)', fontWeight: 600 }}>
                      T:{plot.techScore} F:{plot.funcScore}
                    </span>
                    {plot.isMissionCritical && (
                      <span 
                        style={{ 
                          fontSize: '0.6rem', 
                          fontWeight: 800, 
                          padding: '0.08rem 0.35rem', 
                          borderRadius: '3px', 
                          background: 'rgba(201, 42, 42, 0.12)', 
                          border: '1px solid rgba(201, 42, 42, 0.3)',
                          color: '#c92a2a'
                        }}
                        title={`Mission-Critical Urgency (Criticality ${plot.crit} ≥ ${thresholds?.businessCriticality ?? 4})`}
                      >
                        Urgent
                      </span>
                    )}
                    {(() => {
                      const opt = costOptions.find((o: any) => String(o.value) === String(plot.cost));
                      const isHigh = plot.isHighCost;
                      return (
                        <span 
                          style={{ 
                            fontSize: '0.65rem', 
                            fontWeight: 700, 
                            padding: '0.05rem 0.35rem', 
                            borderRadius: '3px', 
                            background: isHigh ? 'rgba(253, 126, 20, 0.12)' : 'var(--card)', 
                            border: isHigh ? '1px solid #fd7e14' : '1px solid var(--border)',
                            color: isHigh ? '#fd7e14' : 'var(--foreground)',
                            display: 'flex', 
                            alignItems: 'center', 
                            gap: '0.25rem' 
                          }}
                          title={`Cost: ${opt?.label || `${plot.cost}/5`}${isHigh ? ' (High Cost Alert ≥ ' + (thresholds?.cost ?? 4) + ')' : ''}`}
                        >
                          {isHigh ? <span style={{ width: '5px', height: '5px', borderRadius: '50%', background: '#fd7e14' }} /> : opt?.color && <span style={{ width: '5px', height: '5px', borderRadius: '50%', background: opt.color }} />}
                          ${plot.cost}
                        </span>
                      );
                    })()}
                  </div>
                </div>
              );
            })}
            {displayedPlots.length === 0 && (
              <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--muted-foreground)', fontSize: '0.85rem' }}>
                No applications found matching the current filters.
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
