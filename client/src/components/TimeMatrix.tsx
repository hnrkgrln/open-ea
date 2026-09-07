import React, { useState, useMemo } from 'react';
import { type TimeThresholds } from '../App';

export interface TimeAppItem {
  id: string;
  name: string;
  technicalFit?: string | number;
  functionalFit?: string | number;
  criticality?: string | number;
  cost?: string | number;
}

export interface PlottedApp {
  app: TimeAppItem;
  quadrant: 'INVEST' | 'MIGRATE' | 'TOLERATE' | 'ELIMINATE';
  color: string;
  crit: number;
  cost: number;
  dotSize: number;
  techScore: number;
  funcScore: number;
  xPct: number;
  yPct: number;
}

/**
 * Calculates the horizontal percentage (X) on the symmetrical 2x2 TIME matrix.
 * Left half (0% to 50%) is for Low Tech Fit (scores < techCutoff).
 * Right half (50% to 100%) is for High Tech Fit (scores >= techCutoff).
 */
export const getTimeCoordinateX = (techScore: number, techCutoff: number = 3): number => {
  const tVal = Math.max(1, Math.min(5, techScore));
  const isHigh = tVal >= techCutoff;

  if (isHigh) {
    // Right half: range [56%, 88%]
    if (techCutoff >= 5) return 72;
    const progress = Math.max(0, Math.min(1, (tVal - techCutoff) / (5 - techCutoff)));
    return 56 + progress * 32;
  } else {
    // Left half: range [12%, 44%]
    if (techCutoff <= 2) return 28;
    const progress = Math.max(0, Math.min(1, (tVal - 1) / (techCutoff - 2)));
    return 12 + progress * 32;
  }
};

/**
 * Calculates the vertical percentage (Y) on the symmetrical 2x2 TIME matrix.
 * Top half (0% to 50%) is for High Functional Fit (scores >= funcCutoff).
 * Bottom half (50% to 100%) is for Low Functional Fit (scores < funcCutoff).
 * Note: CSS Y: 0% is top, 100% is bottom.
 */
export const getTimeCoordinateY = (funcScore: number, funcCutoff: number = 3): number => {
  const fVal = Math.max(1, Math.min(5, funcScore));
  const isHigh = fVal >= funcCutoff;

  if (isHigh) {
    // Top half: range [12%, 44%] (5 at top 12%, cutoff at 44%)
    if (funcCutoff >= 5) return 28;
    const progress = Math.max(0, Math.min(1, (fVal - funcCutoff) / (5 - funcCutoff)));
    return 44 - progress * 32;
  } else {
    // Bottom half: range [56%, 88%] (1 at bottom 88%, cutoff - 1 at 56%)
    if (funcCutoff <= 2) return 72;
    const progress = Math.max(0, Math.min(1, (fVal - 1) / (funcCutoff - 2)));
    return 88 - progress * 32;
  }
};

interface TimeMatrixProps {
  apps?: TimeAppItem[];
  singleApp?: TimeAppItem;
  selectedAppId?: string | null;
  hoveredAppId?: string | null;
  selectedQuadrant?: string | null;
  onSelectApp?: (appId: string) => void;
  onHoverApp?: (appId: string | null) => void;
  onSelectQuadrant?: (quadrant: string | null) => void;
  thresholds?: TimeThresholds;
  aspectRatio?: string;
  showLegend?: boolean;
  className?: string;
  style?: React.CSSProperties;
}

export const TimeMatrix: React.FC<TimeMatrixProps> = ({
  apps,
  singleApp,
  selectedAppId,
  hoveredAppId,
  selectedQuadrant,
  onSelectApp,
  onHoverApp,
  onSelectQuadrant,
  thresholds,
  aspectRatio = '1 / 1',
  showLegend = true,
  className,
  style
}) => {
  const [internalHoveredId, setInternalHoveredId] = useState<string | null>(null);
  const activeHoverId = hoveredAppId !== undefined ? hoveredAppId : internalHoveredId;

  const appList = useMemo(() => {
    if (apps && apps.length > 0) return apps;
    if (singleApp) return [singleApp];
    return [];
  }, [apps, singleApp]);

  const plots = useMemo(() => {
    const coordGroups: Record<string, TimeAppItem[]> = {};
    appList.forEach(app => {
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

    return appList.map(app => {
      const tech = Number(app.technicalFit);
      const func = Number(app.functionalFit);
      const crit = Number(app.criticality);
      const cost = Number(app.cost);

      const hasTech = !isNaN(tech) && tech > 0;
      const hasFunc = !isNaN(func) && func > 0;
      const hasCrit = !isNaN(crit) && crit > 0;
      const hasCost = !isNaN(cost) && cost > 0;

      const tVal = hasTech ? Math.max(1, Math.min(5, tech)) : 3;
      const fVal = hasFunc ? Math.max(1, Math.min(5, func)) : 3;
      const cVal = hasCrit ? Math.max(1, Math.min(5, crit)) : 3;
      const costVal = hasCost ? Math.max(1, Math.min(5, cost)) : 1;

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

      // Bubble size scales with business criticality: (1: 13px, 3: 20px, 5: 27px)
      const dotSize = singleApp ? 14 + (cVal - 1) * 3.5 : 12 + (cVal - 1) * 3.5;

      // Symmetrical threshold-aware coordinates:
      // Guarantees that apps are positioned strictly within their classified quadrant
      let baseX = getTimeCoordinateX(tVal, techCutoff);
      let baseY = getTimeCoordinateY(fVal, funcCutoff);

      // Subtle jitter if multiple apps share identical score
      if (appList.length > 1) {
        const groupKey = `${tVal}_${fVal}`;
        const group = coordGroups[groupKey] || [app];
        const indexInGroup = group.findIndex(a => a.id === app.id);
        if (group.length > 1 && indexInGroup >= 0) {
          const angle = (indexInGroup / group.length) * 2 * Math.PI;
          const radius = Math.min(4.5, 1.8 + group.length * 0.4);
          baseX += Math.cos(angle) * radius;
          baseY += Math.sin(angle) * radius;
        }
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
        crit: cVal,
        cost: costVal,
        dotSize,
        techScore: tVal,
        funcScore: fVal,
        xPct,
        yPct
      };
    });
  }, [appList, singleApp, thresholds]);

  const displayedPlots = useMemo(() => {
    if (!selectedQuadrant) return plots;
    return plots.filter(p => p.quadrant === selectedQuadrant);
  }, [plots, selectedQuadrant]);

  const handleQuadClick = (quad: string) => {
    if (!onSelectQuadrant) return;
    onSelectQuadrant(selectedQuadrant === quad ? null : quad);
  };

  return (
    <div className={className} style={{ display: 'flex', flexDirection: 'column', width: '100%', minWidth: 0, ...style }}>
      {/* 2x2 Symmetrical Matrix Box with dedicated left gutter for Y-axis labels */}
      <div style={{ position: 'relative', width: 'calc(100% - 2.4rem)', aspectRatio, margin: '0.25rem 0 2.2rem 2.4rem' }}>
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
          background: 'var(--card)'
        }}>
          {/* Top-Left: MIGRATE */}
          <div 
            onClick={() => handleQuadClick('MIGRATE')}
            style={{ 
              padding: '0.75rem 0.85rem', 
              background: selectedQuadrant === 'MIGRATE' ? 'rgba(230, 119, 0, 0.18)' : 'rgba(230, 119, 0, 0.05)',
              borderRight: '1px dashed var(--border)',
              borderBottom: '1px dashed var(--border)',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'flex-start',
              cursor: onSelectQuadrant ? 'pointer' : 'default',
              transition: 'background 0.2s'
            }}
          >
            <span style={{ fontSize: '0.78rem', fontWeight: 800, color: '#e67700', letterSpacing: '0.04em' }}>MIGRATE</span>
            <span style={{ fontSize: '0.6rem', color: 'var(--muted-foreground)', marginTop: '0.15rem' }}>High Fit · Low Tech</span>
          </div>

          {/* Top-Right: INVEST */}
          <div 
            onClick={() => handleQuadClick('INVEST')}
            style={{ 
              padding: '0.75rem 0.85rem', 
              background: selectedQuadrant === 'INVEST' ? 'rgba(43, 138, 62, 0.18)' : 'rgba(43, 138, 62, 0.05)',
              borderBottom: '1px dashed var(--border)',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'flex-start',
              alignItems: 'flex-end',
              textAlign: 'right',
              cursor: onSelectQuadrant ? 'pointer' : 'default',
              transition: 'background 0.2s'
            }}
          >
            <span style={{ fontSize: '0.78rem', fontWeight: 800, color: '#2b8a3e', letterSpacing: '0.04em' }}>INVEST</span>
            <span style={{ fontSize: '0.6rem', color: 'var(--muted-foreground)', marginTop: '0.15rem' }}>High Fit · High Tech</span>
          </div>

          {/* Bottom-Left: ELIMINATE */}
          <div 
            onClick={() => handleQuadClick('ELIMINATE')}
            style={{ 
              padding: '0.75rem 0.85rem', 
              background: selectedQuadrant === 'ELIMINATE' ? 'rgba(201, 42, 42, 0.18)' : 'rgba(201, 42, 42, 0.05)',
              borderRight: '1px dashed var(--border)',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'flex-end',
              cursor: onSelectQuadrant ? 'pointer' : 'default',
              transition: 'background 0.2s'
            }}
          >
            <span style={{ fontSize: '0.78rem', fontWeight: 800, color: '#c92a2a', letterSpacing: '0.04em' }}>ELIMINATE</span>
            <span style={{ fontSize: '0.6rem', color: 'var(--muted-foreground)', marginTop: '0.15rem' }}>Low Fit · Low Tech</span>
          </div>

          {/* Bottom-Right: TOLERATE */}
          <div 
            onClick={() => handleQuadClick('TOLERATE')}
            style={{ 
              padding: '0.75rem 0.85rem', 
              background: selectedQuadrant === 'TOLERATE' ? 'rgba(34, 139, 230, 0.18)' : 'rgba(34, 139, 230, 0.05)',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'flex-end',
              alignItems: 'flex-end',
              textAlign: 'right',
              cursor: onSelectQuadrant ? 'pointer' : 'default',
              transition: 'background 0.2s'
            }}
          >
            <span style={{ fontSize: '0.78rem', fontWeight: 800, color: '#228be6', letterSpacing: '0.04em' }}>TOLERATE</span>
            <span style={{ fontSize: '0.6rem', color: 'var(--muted-foreground)', marginTop: '0.15rem' }}>Low Fit · High Tech</span>
          </div>

          {/* Center symmetrical intersection node */}
          <div style={{ 
            position: 'absolute', 
            top: '50%', 
            left: '50%', 
            transform: 'translate(-50%, -50%)',
            width: '8px',
            height: '8px',
            borderRadius: '50%',
            background: 'var(--border)',
            zIndex: 2
          }} />

          {/* Application Dots */}
          {displayedPlots.map(plot => {
            const isSelected = selectedAppId === plot.app.id;
            const isHovered = activeHoverId === plot.app.id;

            return (
              <div
                key={plot.app.id}
                onClick={() => onSelectApp && onSelectApp(plot.app.id)}
                onMouseEnter={() => {
                  setInternalHoveredId(plot.app.id);
                  onHoverApp && onHoverApp(plot.app.id);
                }}
                onMouseLeave={() => {
                  setInternalHoveredId(null);
                  onHoverApp && onHoverApp(null);
                }}
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
                    : `0 0 0 1.5px ${plot.color}44, 0 2px 5px rgba(0,0,0,0.15)`,
                  zIndex: isHovered ? 45 : isSelected ? 30 : 10,
                  cursor: onSelectApp ? 'pointer' : 'default',
                  transition: 'transform 0.18s cubic-bezier(0.34, 1.56, 0.64, 1), box-shadow 0.18s ease'
                }}
              >
                {/* Tooltip on hover */}
                {isHovered && (
                  <div
                    style={{
                      position: 'absolute',
                      bottom: plot.yPct < 22 ? 'auto' : 'calc(100% + 10px)',
                      top: plot.yPct < 22 ? 'calc(100% + 10px)' : 'auto',
                      left: plot.xPct > 70 ? 'auto' : plot.xPct < 30 ? '0' : '50%',
                      right: plot.xPct > 70 ? '0' : 'auto',
                      transform: (plot.xPct <= 70 && plot.xPct >= 30) ? 'translateX(-50%)' : 'none',
                      background: 'rgba(24, 24, 27, 0.94)',
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

                    <div style={{ display: 'flex', gap: '0.6rem', fontSize: '0.65rem', color: '#a1a1aa', flexWrap: 'wrap' }}>
                      <span>Tech: <strong style={{ color: '#fff' }}>{plot.techScore}/5</strong></span>
                      <span>Func: <strong style={{ color: '#fff' }}>{plot.funcScore}/5</strong></span>
                      <span>Crit: <strong style={{ color: '#fff' }}>{plot.crit}/5</strong></span>
                      <span>Cost: <strong style={{ color: plot.cost >= (thresholds?.cost ?? 4) ? '#fd7e14' : '#fff' }}>{plot.cost}/5{plot.cost >= (thresholds?.cost ?? 4) ? ' (High)' : ''}</strong></span>
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
          <span>High Tech Fit (5)</span>
        </div>

        {/* Y-Axis Labels: Top (High), Bottom (Low) */}
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
          whiteSpace: 'nowrap',
          pointerEvents: 'none'
        }}>
          High Functional (5)
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
          whiteSpace: 'nowrap',
          pointerEvents: 'none'
        }}>
          Low Functional (1)
        </div>
      </div>

      {/* Legend Footer */}
      {showLegend && (
        <div style={{ display: 'flex', justifyContent: 'center', gap: '1rem', fontSize: '0.7rem', color: 'var(--muted-foreground)', marginTop: '0.25rem', paddingLeft: '2.4rem' }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}>
            <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: 'var(--muted-foreground)', opacity: 0.5 }} />
            Bubble size scales with Business Criticality (1–5){appList.length > 1 ? ' · Click to lock selection' : ''}
          </span>
        </div>
      )}
    </div>
  );
};
