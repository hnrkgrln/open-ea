import React, { useState, useMemo, useRef, useEffect } from 'react';
import { Database, ExternalLink, Filter, Layers, Info } from 'lucide-react';
import { TIME_OPTIONS } from '../App';

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
  onToggleTimeFilter
}) => {
  const [selectedAppId, setSelectedAppId] = useState<string | null>(null);
  const [hoveredAppId, setHoveredAppId] = useState<string | null>(null);
  const [selectedQuadrant, setSelectedQuadrant] = useState<string | null>(null);
  const itemRefs = useRef<Record<string, HTMLDivElement | null>>({});

  // Auto-scroll list to selected app
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

    return apps.map(app => {
      const tech = Number(app.technicalFit);
      const func = Number(app.functionalFit);
      const hasTech = !isNaN(tech) && tech > 0;
      const hasFunc = !isNaN(func) && func > 0;
      const tVal = hasTech ? Math.max(1, Math.min(5, tech)) : 3;
      const fVal = hasFunc ? Math.max(1, Math.min(5, func)) : 3;
      const isTechHigh = tVal >= 3;
      const isFuncHigh = fVal >= 3;

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
      const dotSize = 12 + (crit - 1) * 3.5;

      // Base coordinates
      let baseX = 12 + ((tVal - 1) / 4) * 76;
      let baseY = 88 - ((fVal - 1) / 4) * 76;

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

      return {
        app,
        quadrant,
        color,
        crit,
        dotSize,
        techScore: tVal,
        funcScore: fVal,
        xPct: Math.max(5, Math.min(95, baseX)),
        yPct: Math.max(5, Math.min(95, baseY))
      };
    });
  }, [apps, allCapabilities]);

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
        className="card" 
        style={{ 
          padding: '1.5rem', 
          background: 'var(--card)', 
          borderRadius: '16px', 
          boxShadow: '0 2px 10px rgba(0,0,0,0.04)',
          display: 'grid',
          gridTemplateColumns: '1.55fr minmax(320px, 390px)',
          gap: '2.5rem',
          alignItems: 'start'
        }}
      >
        {/* 2x2 Interactive Chart Container */}
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
            <div style={{ fontSize: '0.75rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--muted-foreground)' }}>
              TIME Assessment Matrix
            </div>
            <div style={{ fontSize: '0.7rem', color: 'var(--muted-foreground)' }}>
              Showing <strong>{displayedPlots.length}</strong> of {apps.length} apps
            </div>
          </div>

          <div style={{ position: 'relative', width: '100%', aspectRatio: '1 / 1', maxWidth: '640px', margin: '1rem auto 1.75rem auto' }}>
            {/* Quadrant grid box */}
            <div style={{ 
              width: '100%', 
              height: '100%', 
              borderRadius: '14px', 
              overflow: 'hidden', 
              border: '1.5px solid var(--border)', 
              display: 'grid', 
              gridTemplateColumns: '1fr 1fr', 
              gridTemplateRows: '1fr 1fr',
              position: 'relative',
              background: 'var(--background)'
            }}>
              {/* Top-Left: MIGRATE */}
              <div style={{ 
                padding: '0.75rem 0.85rem', 
                background: selectedQuadrant === 'MIGRATE' ? 'rgba(230, 119, 0, 0.18)' : 'rgba(230, 119, 0, 0.05)',
                borderRight: '1px dashed var(--border)',
                borderBottom: '1px dashed var(--border)',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'flex-start',
                cursor: 'pointer',
                transition: 'background 0.2s'
              }}
              onClick={() => setSelectedQuadrant(prev => prev === 'MIGRATE' ? null : 'MIGRATE')}
              >
                <span style={{ fontSize: '0.8rem', fontWeight: 800, color: '#e67700', letterSpacing: '0.04em' }}>MIGRATE</span>
                <span style={{ fontSize: '0.62rem', color: 'var(--muted-foreground)', marginTop: '0.15rem' }}>High Fit · Low Tech</span>
              </div>

              {/* Top-Right: INVEST */}
              <div style={{ 
                padding: '0.75rem 0.85rem', 
                background: selectedQuadrant === 'INVEST' ? 'rgba(43, 138, 62, 0.18)' : 'rgba(43, 138, 62, 0.05)',
                borderBottom: '1px dashed var(--border)',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'flex-start',
                alignItems: 'flex-end',
                textAlign: 'right',
                cursor: 'pointer',
                transition: 'background 0.2s'
              }}
              onClick={() => setSelectedQuadrant(prev => prev === 'INVEST' ? null : 'INVEST')}
              >
                <span style={{ fontSize: '0.8rem', fontWeight: 800, color: '#2b8a3e', letterSpacing: '0.04em' }}>INVEST</span>
                <span style={{ fontSize: '0.62rem', color: 'var(--muted-foreground)', marginTop: '0.15rem' }}>High Fit · High Tech</span>
              </div>

              {/* Bottom-Left: ELIMINATE */}
              <div style={{ 
                padding: '0.75rem 0.85rem', 
                background: selectedQuadrant === 'ELIMINATE' ? 'rgba(201, 42, 42, 0.18)' : 'rgba(201, 42, 42, 0.05)',
                borderRight: '1px dashed var(--border)',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'flex-end',
                cursor: 'pointer',
                transition: 'background 0.2s'
              }}
              onClick={() => setSelectedQuadrant(prev => prev === 'ELIMINATE' ? null : 'ELIMINATE')}
              >
                <span style={{ fontSize: '0.8rem', fontWeight: 800, color: '#c92a2a', letterSpacing: '0.04em' }}>ELIMINATE</span>
                <span style={{ fontSize: '0.62rem', color: 'var(--muted-foreground)', marginTop: '0.15rem' }}>Low Fit · Low Tech</span>
              </div>

              {/* Bottom-Right: TOLERATE */}
              <div style={{ 
                padding: '0.75rem 0.85rem', 
                background: selectedQuadrant === 'TOLERATE' ? 'rgba(34, 139, 230, 0.18)' : 'rgba(34, 139, 230, 0.05)',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'flex-end',
                alignItems: 'flex-end',
                textAlign: 'right',
                cursor: 'pointer',
                transition: 'background 0.2s'
              }}
              onClick={() => setSelectedQuadrant(prev => prev === 'TOLERATE' ? null : 'TOLERATE')}
              >
                <span style={{ fontSize: '0.8rem', fontWeight: 800, color: '#228be6', letterSpacing: '0.04em' }}>TOLERATE</span>
                <span style={{ fontSize: '0.62rem', color: 'var(--muted-foreground)', marginTop: '0.15rem' }}>Low Fit · High Tech</span>
              </div>

              {/* Center divider node */}
              <div style={{ 
                position: 'absolute', 
                top: '50%', 
                left: '50%', 
                transform: 'translate(-50%, -50%)',
                width: '10px',
                height: '10px',
                borderRadius: '50%',
                background: 'var(--border)',
                zIndex: 2
              }} />

              {/* Plotted Application Dots */}
              {displayedPlots.map(plot => {
                const isSelected = selectedAppId === plot.app.id;
                const isHovered = hoveredAppId === plot.app.id;
                const isInspected = inspectedPlot?.app.id === plot.app.id;

                return (
                  <div
                    key={plot.app.id}
                    onClick={() => setSelectedAppId(plot.app.id)}
                    onMouseEnter={() => setHoveredAppId(plot.app.id)}
                    onMouseLeave={() => setHoveredAppId(null)}
                    style={{
                      position: 'absolute',
                      left: `${plot.xPct}%`,
                      top: `${plot.yPct}%`,
                      transform: (isHovered || isSelected) ? 'translate(-50%, -50%) scale(1.3)' : 'translate(-50%, -50%) scale(1)',
                      width: `${plot.dotSize}px`,
                      height: `${plot.dotSize}px`,
                      borderRadius: '50%',
                      backgroundColor: plot.color,
                      border: '2px solid #ffffff',
                      boxShadow: isSelected 
                        ? `0 0 0 3.5px ${plot.color}, 0 6px 14px rgba(0,0,0,0.35)` 
                        : isHovered
                        ? `0 0 0 2.5px ${plot.color}aa, 0 4px 10px rgba(0,0,0,0.25)`
                        : isInspected
                        ? `0 0 0 2px ${plot.color}77, 0 2px 6px rgba(0,0,0,0.18)`
                        : `0 0 0 1.5px ${plot.color}44, 0 2px 5px rgba(0,0,0,0.15)`,
                      zIndex: isHovered ? 45 : isSelected ? 30 : isInspected ? 20 : 10,
                      cursor: 'pointer',
                      transition: 'transform 0.18s cubic-bezier(0.34, 1.56, 0.64, 1), box-shadow 0.18s ease'
                    }}
                  >
                    {/* Rich custom hover tooltip */}
                    {isHovered && (
                      <div
                        style={{
                          position: 'absolute',
                          bottom: plot.yPct < 22 ? 'auto' : 'calc(100% + 10px)',
                          top: plot.yPct < 22 ? 'calc(100% + 10px)' : 'auto',
                          left: plot.xPct > 70 ? 'auto' : plot.xPct < 30 ? '0' : '50%',
                          right: plot.xPct > 70 ? '0' : 'auto',
                          transform: (plot.xPct <= 70 && plot.xPct >= 30) ? 'translateX(-50%)' : 'none',
                          background: 'rgba(24, 24, 27, 0.92)',
                          backdropFilter: 'blur(8px)',
                          color: '#ffffff',
                          padding: '0.55rem 0.75rem',
                          borderRadius: '8px',
                          boxShadow: '0 8px 24px rgba(0,0,0,0.3), 0 0 0 1px rgba(255,255,255,0.12)',
                          zIndex: 100,
                          pointerEvents: 'none',
                          minWidth: '170px',
                          maxWidth: '240px',
                          animation: 'fadeIn 0.12s ease-out'
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.5rem', marginBottom: '0.3rem' }}>
                          <span style={{ fontWeight: 800, fontSize: '0.78rem', color: '#fff', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {plot.app.name}
                          </span>
                          <span style={{ 
                            fontSize: '0.58rem', 
                            fontWeight: 800, 
                            letterSpacing: '0.04em',
                            padding: '0.08rem 0.35rem', 
                            borderRadius: '4px', 
                            background: plot.color, 
                            color: '#fff',
                            flexShrink: 0
                          }}>
                            {plot.quadrant}
                          </span>
                        </div>

                        <div style={{ display: 'flex', gap: '0.6rem', fontSize: '0.65rem', color: '#a1a1aa' }}>
                          <span>Tech: <strong style={{ color: '#fff' }}>{plot.techScore}/5</strong></span>
                          <span>Func: <strong style={{ color: '#fff' }}>{plot.funcScore}/5</strong></span>
                          <span>Crit: <strong style={{ color: '#fff' }}>{plot.crit}/5</strong></span>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {/* X-Axis Labels */}
            <div style={{ 
              position: 'absolute', 
              bottom: '-1.4rem', 
              left: 0, 
              right: 0, 
              display: 'flex', 
              justifyContent: 'space-between', 
              fontSize: '0.62rem', 
              fontWeight: 700, 
              color: 'var(--muted-foreground)',
              textTransform: 'uppercase',
              letterSpacing: '0.04em'
            }}>
              <span>Low Tech Fit (1)</span>
              <span style={{ fontWeight: 800, color: 'var(--foreground)' }}>Technical Fit →</span>
              <span>High Tech Fit (5)</span>
            </div>

            {/* Y-Axis Labels: Top (High), Center (Title), Bottom (Low) */}
            <div style={{
              position: 'absolute',
              top: 0,
              left: '-1.8rem',
              fontSize: '0.62rem',
              fontWeight: 700,
              color: 'var(--muted-foreground)',
              textTransform: 'uppercase',
              letterSpacing: '0.04em',
              writingMode: 'vertical-rl',
              transform: 'rotate(180deg)',
              whiteSpace: 'nowrap'
            }}>
              High Functional (5)
            </div>
            <div style={{
              position: 'absolute',
              top: '50%',
              left: '-1.8rem',
              transform: 'translateY(-50%) rotate(180deg)',
              writingMode: 'vertical-rl',
              fontSize: '0.62rem',
              fontWeight: 800,
              color: 'var(--foreground)',
              textTransform: 'uppercase',
              letterSpacing: '0.04em',
              whiteSpace: 'nowrap'
            }}>
              Functional Fit →
            </div>
            <div style={{
              position: 'absolute',
              bottom: 0,
              left: '-1.8rem',
              fontSize: '0.62rem',
              fontWeight: 700,
              color: 'var(--muted-foreground)',
              textTransform: 'uppercase',
              letterSpacing: '0.04em',
              writingMode: 'vertical-rl',
              transform: 'rotate(180deg)',
              whiteSpace: 'nowrap'
            }}>
              Low Functional (1)
            </div>
          </div>

          <div style={{ display: 'flex', justifyContent: 'center', gap: '1rem', fontSize: '0.7rem', color: 'var(--muted-foreground)', marginTop: '1.25rem' }}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}>
              <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: 'var(--muted-foreground)', opacity: 0.5 }} /> Bubble size scales with Business Criticality (1–5) · Click to lock selection
            </span>
          </div>
        </div>

        {/* Right Side: Sticky/Hover Inspection Card + Scrollable Application List */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem', minWidth: 0 }}>
          
          {/* Static height inspector box showing hover preview OR locked clicked app */}
          <div 
            style={{ 
              height: '190px', 
              borderRadius: '12px', 
              border: inspectedPlot ? `1.5px solid ${inspectedPlot.color}` : '1.5px dashed var(--border)', 
              background: 'var(--card)',
              boxShadow: inspectedPlot ? `0 4px 16px ${inspectedPlot.color}15` : 'none',
              padding: '1.1rem 1.25rem',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'space-between',
              transition: 'border-color 0.2s, box-shadow 0.2s',
              overflow: 'hidden'
            }}
          >
            {inspectedPlot ? (
              <>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '0.5rem' }}>
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.3rem' }}>
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
                    <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 800, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {inspectedPlot.app.name}
                    </h3>
                  </div>
                  <button 
                    onClick={() => onSelectApp(inspectedPlot.app.id)}
                    className="primary"
                    style={{ height: '1.9rem', padding: '0 0.75rem', fontSize: '0.75rem', gap: '0.3rem', flexShrink: 0 }}
                    title="Open full application details page"
                  >
                    Details <ExternalLink size={12} />
                  </button>
                </div>

                <p style={{ 
                  margin: 0, 
                  fontSize: '0.75rem', 
                  color: 'var(--foreground)', 
                  opacity: 0.85, 
                  lineHeight: 1.4,
                  display: '-webkit-box',
                  WebkitLineClamp: 2,
                  WebkitBoxOrient: 'vertical',
                  overflow: 'hidden'
                }}>
                  {inspectedPlot.app.description || 'No description provided.'}
                </p>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.5rem', background: 'var(--secondary)', padding: '0.5rem 0.75rem', borderRadius: '8px' }}>
                  <div>
                    <div style={{ fontSize: '0.58rem', color: 'var(--muted-foreground)', fontWeight: 700, textTransform: 'uppercase' }}>Technical Fit</div>
                    <div style={{ fontSize: '0.9rem', fontWeight: 800, color: inspectedPlot.techScore >= 3 ? '#2b8a3e' : '#c92a2a' }}>
                      {inspectedPlot.techScore}/5
                    </div>
                  </div>
                  <div>
                    <div style={{ fontSize: '0.58rem', color: 'var(--muted-foreground)', fontWeight: 700, textTransform: 'uppercase' }}>Functional Fit</div>
                    <div style={{ fontSize: '0.9rem', fontWeight: 800, color: inspectedPlot.funcScore >= 3 ? '#2b8a3e' : '#c92a2a' }}>
                      {inspectedPlot.funcScore}/5
                    </div>
                  </div>
                  <div>
                    <div style={{ fontSize: '0.58rem', color: 'var(--muted-foreground)', fontWeight: 700, textTransform: 'uppercase' }}>Criticality</div>
                    <div style={{ fontSize: '0.9rem', fontWeight: 800 }}>
                      {inspectedPlot.crit}/5
                    </div>
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
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border)', paddingBottom: '0.5rem' }}>
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
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.45rem', height: '440px', overflowY: 'auto', paddingRight: '0.35rem' }}>
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

                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexShrink: 0, marginLeft: '0.5rem' }}>
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
