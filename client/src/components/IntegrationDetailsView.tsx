import React from 'react';
import { Edit2, Network, ChevronLeft, Database, Calendar, Info, ArrowRight, Activity } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { getContrastColor } from '../utils/colors';
import { ReferencesList } from './References';

interface Props {
  integrationId: string | null;
  onBack: () => void;
  onRefresh: () => void;
}

export const IntegrationDetailsView = ({ integrationId, onBack, onRefresh }: Props) => {
  const navigate = useNavigate();

  const parentRef = React.useRef<HTMLDivElement>(null);
  const sourceIconRef = React.useRef<HTMLDivElement>(null);
  const payloadCardRef = React.useRef<HTMLDivElement>(null);
  const targetIconRef = React.useRef<HTMLDivElement>(null);

  const [coords, setCoords] = React.useState({
    x1: 0, y1: 0,
    x2: 0, y2: 0,
    x3: 0, y3: 0,
    x4: 0, y4: 0,
  });

  const { data: allIntegrations } = useQuery<any[]>({ 
    queryKey: ['integrations'], 
    queryFn: () => fetch('/api/integrations').then(res => res.json())
  });

  const { data: i, isLoading } = useQuery<any>({
    queryKey: ['integration', integrationId],
    queryFn: () => fetch(`/api/integrations/${integrationId}`).then(res => res.json()),
    enabled: !!integrationId && integrationId !== 'undefined'
  });

  React.useEffect(() => {
    const updateCoordinates = () => {
      if (
        parentRef.current &&
        sourceIconRef.current &&
        payloadCardRef.current &&
        targetIconRef.current
      ) {
        const parentRect = parentRef.current.getBoundingClientRect();
        const sourceRect = sourceIconRef.current.getBoundingClientRect();
        const payloadRect = payloadCardRef.current.getBoundingClientRect();
        const targetRect = targetIconRef.current.getBoundingClientRect();

        // Source icon center-right (connecting point)
        const x1 = sourceRect.right - parentRect.left;
        const y1 = (sourceRect.top + sourceRect.bottom) / 2 - parentRect.top;

        // Payload card left edge center
        const x2 = payloadRect.left - parentRect.left;
        const y2 = (payloadRect.top + payloadRect.bottom) / 2 - parentRect.top;

        // Payload card right edge center
        const x3 = payloadRect.right - parentRect.left;
        const y3 = (payloadRect.top + payloadRect.bottom) / 2 - parentRect.top;

        // Target icon center-left (connecting point)
        const x4 = targetRect.left - parentRect.left;
        const y4 = (targetRect.top + targetRect.bottom) / 2 - parentRect.top;

        setCoords({ x1, y1, x2, y2, x3, y3, x4, y4 });
      }
    };

    updateCoordinates();

    const resizeObserver = new ResizeObserver(() => {
      updateCoordinates();
    });

    if (parentRef.current) {
      resizeObserver.observe(parentRef.current);
    }

    window.addEventListener('resize', updateCoordinates);
    const timer = setTimeout(updateCoordinates, 150);

    return () => {
      resizeObserver.disconnect();
      window.removeEventListener('resize', updateCoordinates);
      clearTimeout(timer);
    };
  }, [i]);

  const { data: picklists } = useQuery<any[]>({ queryKey: ['picklists'], queryFn: () => fetch('/api/picklists').then(res => res.json()) });

  const getPicklistInfo = (picklistName: string, value: string | undefined) => {
    if (!value) return null;
    const list = picklists?.find(p => p.name === picklistName);
    const option = list?.options?.find((o: any) => o.value === String(value));
    return option || { label: value, color: 'var(--secondary)' };
  };

  if (isLoading || !i) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', gap: '1rem', opacity: 0.8 }}>
        <div className="loading-logo" style={{ fontSize: '1.5rem' }}>OpenEA</div>
        <div className="loading-text" style={{ fontSize: '0.75rem' }}>Retrieving integration details...</div>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: 'var(--background)' }}>
      <div style={{ flex: 1, overflowY: 'auto' }}>
        <div className="main-container" style={{ padding: '3rem 2rem 6rem 2rem', maxWidth: '1400px', position: 'relative' }}>
          <button 
            onClick={onBack} 
            style={{ 
              position: 'absolute', top: '3rem', left: '-1rem',
              background: 'none', border: 'none', padding: '0.5rem', cursor: 'pointer', 
              display: 'flex', alignItems: 'center', color: 'var(--muted-foreground)', 
              borderRadius: '6px', transition: 'all 0.2s' 
            }} 
            className="row-hover"
            title="Go Back"
          >
            <ChevronLeft size={24} />
          </button>

          <div style={{ marginBottom: '2.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div style={{ flex: 1 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.75rem' }}>
                <span style={{ fontSize: '0.65rem', fontWeight: 900, textTransform: 'uppercase', padding: '0.2rem 0.6rem', borderRadius: '4px', background: '#d6336c', color: 'white', letterSpacing: '0.05em', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                  <Network size={12} /> Integration Flow
                </span>
              </div>
              <div style={{ display: 'flex', gap: '1rem', alignItems: 'center', marginBottom: '1rem' }}>
                <h1 style={{ fontSize: '2.25rem', fontWeight: 800, margin: 0, letterSpacing: '-0.03em' }}>
                  {i.sourceApp?.name} <ArrowRight size={24} style={{ opacity: 0.3, margin: '0 0.5rem' }} /> {i.targetApp?.name}
                </h1>
              </div>
              <p style={{ fontSize: '1.125rem', color: 'var(--foreground)', lineHeight: 1.6, margin: 0, maxWidth: '900px', opacity: 0.8, whiteSpace: 'pre-wrap' }}>
                {i.description || `System-to-system data exchange via ${getPicklistInfo('integration_pattern', i.pattern)?.label || i.pattern || 'standard interface'}.`}
              </p>
            </div>
            <button onClick={() => navigate(`/integrations/${i.id}/edit`)} className="primary" style={{ height: '3rem', gap: '0.75rem', padding: '0 1.5rem', fontSize: '1rem', boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1)' }}>
              <Edit2 size={18} /> Edit Integration
            </button>
          </div>

          {/* Integration Visual Flow */}
          <div 
            ref={parentRef}
            style={{ 
              background: 'var(--card)', 
              padding: '3rem', 
              borderRadius: '24px', 
              border: '1px solid var(--border)', 
              marginBottom: '3rem', 
              display: 'flex', 
              alignItems: 'center', 
              justifyContent: 'space-around', 
              position: 'relative', 
              overflow: 'hidden' 
            }}
          >
            <style dangerouslySetInnerHTML={{__html: `
              @keyframes lineFlow {
                from {
                  stroke-dashoffset: 24;
                }
                to {
                  stroke-dashoffset: 0;
                }
              }
              .flow-line-animated {
                stroke-dasharray: 6, 6;
                animation: lineFlow 1.8s linear infinite;
              }
              .flow-particle {
                animation: particleFade 2.5s infinite ease-in-out;
              }
              @keyframes particleFade {
                0%, 100% {
                  opacity: 0.6;
                }
                50% {
                  opacity: 1;
                }
              }
            `}} />

            {/* Dynamic Connecting SVG Lines */}
            {coords.x1 > 0 && (
              <svg 
                shapeRendering="geometricPrecision"
                style={{ 
                  position: 'absolute', 
                  inset: 0, 
                  width: '100%', 
                  height: '100%', 
                  pointerEvents: 'none', 
                  zIndex: 0 
                }}
              >
                <defs>
                  <linearGradient id="single-flow-grad" x1="0%" y1="0%" x2="100%" y2="0%">
                    <stop offset="0%" stopColor="var(--border)" stopOpacity="0.4" />
                    <stop offset="35%" stopColor="var(--primary)" stopOpacity="0.6" />
                    <stop offset="50%" stopColor="var(--primary)" stopOpacity="0.8" />
                    <stop offset="65%" stopColor="var(--primary)" stopOpacity="0.6" />
                    <stop offset="100%" stopColor="var(--border)" stopOpacity="0.4" />
                  </linearGradient>
                </defs>

                {(() => {
                  const fullPath = `M ${coords.x1} ${coords.y1} C ${(coords.x1 + coords.x2) / 2} ${coords.y1}, ${(coords.x1 + coords.x2) / 2} ${coords.y2}, ${coords.x2} ${coords.y2} L ${coords.x3} ${coords.y3} C ${(coords.x3 + coords.x4) / 2} ${coords.y3}, ${(coords.x3 + coords.x4) / 2} ${coords.y4}, ${coords.x4} ${coords.y4}`;
                  return (
                    <>
                      {/* Base Connection Line */}
                      <path 
                        d={fullPath} 
                        fill="none" 
                        stroke="var(--border)" 
                        strokeWidth="1.5" 
                        strokeLinecap="round" 
                        opacity="0.5"
                      />

                      {/* Dashed animated flow */}
                      <path 
                        d={fullPath} 
                        fill="none" 
                        stroke="url(#single-flow-grad)" 
                        strokeWidth="1.5" 
                        strokeLinecap="round"
                        className="flow-line-animated"
                      />

                      {/* Flowing animated elegant particle */}
                      <circle r="3.5" fill="var(--primary)" className="flow-particle">
                        <animateMotion 
                          dur="3.5s" 
                          repeatCount="indefinite" 
                          path={fullPath} 
                        />
                      </circle>
                    </>
                  );
                })()}
              </svg>
            )}

            <div onClick={() => navigate(`/apps/${i.sourceAppId}`)} style={{ cursor: 'pointer', zIndex: 1, textAlign: 'center', flex: 1, maxWidth: '280px' }} className="glow-hover">
              <div ref={sourceIconRef} style={{ width: '64px', height: '64px', borderRadius: '16px', background: 'var(--secondary)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 1rem' }}>
                <Database size={32} />
              </div>
              <div style={{ fontWeight: 800, fontSize: '1.125rem' }}>{i.sourceApp?.name}</div>
              <div style={{ fontSize: '0.7rem', color: 'var(--muted-foreground)', textTransform: 'uppercase', fontWeight: 700 }}>Source System</div>
            </div>

            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1rem', position: 'relative' }}>
              <div ref={payloadCardRef} onClick={() => i.infoObjectId && navigate(`/information/${i.infoObjectId}`)} style={{ cursor: i.infoObjectId ? 'pointer' : 'default', zIndex: 1, background: 'var(--card)', padding: '1.125rem 2rem', borderRadius: '16px', border: '2px solid var(--primary)', textAlign: 'center', minWidth: '200px' }} className={i.infoObjectId ? "glow-hover" : ""}>
                <div style={{ fontSize: '0.7rem', color: 'var(--muted-foreground)', textTransform: 'uppercase', fontWeight: 800, marginBottom: '0.25rem' }}>Data Payload</div>
                <div style={{ fontWeight: 800, color: 'var(--foreground)', fontSize: '1rem' }}>{i.payload?.name || 'Undefined Information Object'}</div>
                <div style={{ display: 'flex', justifyContent: 'center', gap: '0.35rem', marginTop: '0.6rem', flexWrap: 'wrap' }}>
                  {(() => {
                    const patternInfo = getPicklistInfo('integration_pattern', i.pattern);
                    const hasColor = patternInfo?.color && patternInfo.color !== 'var(--secondary)';
                    const bg = hasColor ? patternInfo!.color : 'var(--secondary)';
                    const text = hasColor ? getContrastColor(patternInfo!.color) : 'var(--secondary-foreground)';
                    return (
                      <span style={{ fontSize: '0.6rem', fontWeight: 800, background: bg, color: text, padding: '0.15rem 0.5rem', borderRadius: '4px', textTransform: 'uppercase' }}>{patternInfo?.label || i.pattern || 'API'}</span>
                    );
                  })()}
                  {i.crud?.split(',').filter(Boolean).map((op: string) => {
                    const crudInfo = getPicklistInfo('integration_crud', op);
                    const hasColor = crudInfo?.color && crudInfo.color !== 'var(--secondary)';
                    const bg = hasColor ? crudInfo!.color : 'var(--primary)';
                    const text = hasColor ? getContrastColor(crudInfo!.color) : 'var(--primary-foreground)';
                    return (
                      <span key={op} style={{ fontSize: '0.6rem', fontWeight: 800, background: bg, color: text, padding: '0.15rem 0.5rem', borderRadius: '4px', textTransform: 'uppercase' }}>{crudInfo?.label || op}</span>
                    )})}
                </div>
              </div>
              {(() => {
                const freqInfo = getPicklistInfo('integration_frequency', i.frequency);
                return (
                  <div style={{ zIndex: 1, fontSize: '0.75rem', fontWeight: 700, color: freqInfo?.color !== 'var(--secondary)' ? freqInfo?.color : 'var(--muted-foreground)', background: 'var(--background)', padding: '0.2rem 0.75rem', borderRadius: '20px' }}>
                    <Activity size={12} style={{ marginRight: '0.4rem' }} /> {freqInfo?.label || i.frequency || 'Real-time'}
                  </div>
                );
              })()}
            </div>

            <div onClick={() => navigate(`/apps/${i.targetAppId}`)} style={{ cursor: 'pointer', zIndex: 1, textAlign: 'center', flex: 1, maxWidth: '280px' }} className="glow-hover">
              <div ref={targetIconRef} style={{ width: '64px', height: '64px', borderRadius: '16px', background: 'var(--secondary)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 1rem' }}>
                <Database size={32} />
              </div>
              <div style={{ fontWeight: 800, fontSize: '1.125rem' }}>{i.targetApp?.name}</div>
              <div style={{ fontSize: '0.7rem', color: 'var(--muted-foreground)', textTransform: 'uppercase', fontWeight: 700 }}>Target System</div>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2rem' }}>
            <section className="card" style={{ padding: '2rem' }}>
              <h3 style={{ fontSize: '0.8125rem', fontWeight: 700, textTransform: 'uppercase', color: 'var(--muted-foreground)', marginBottom: '1.5rem', letterSpacing: '0.1em' }}>Technical Details</h3>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2rem' }}>
                <div>
                  <div style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--muted-foreground)', textTransform: 'uppercase', marginBottom: '0.5rem' }}>Integration Pattern</div>
                  <div style={{ fontSize: '1rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '0.4rem' }}>{getPicklistInfo('integration_pattern', i.pattern)?.color !== 'var(--secondary)' && <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: getPicklistInfo('integration_pattern', i.pattern)?.color }} />}{getPicklistInfo('integration_pattern', i.pattern)?.label || i.pattern || '—'}</div>
                </div>
                <div>
                  <div style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--muted-foreground)', textTransform: 'uppercase', marginBottom: '0.5rem' }}>Frequency</div>
                  <div style={{ fontSize: '1rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '0.4rem' }}>{getPicklistInfo('integration_frequency', i.frequency)?.color !== 'var(--secondary)' && <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: getPicklistInfo('integration_frequency', i.frequency)?.color }} />}{getPicklistInfo('integration_frequency', i.frequency)?.label || i.frequency || '—'}</div>
                </div>
                <div style={{ gridColumn: 'span 2' }}>
                  <div style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--muted-foreground)', textTransform: 'uppercase', marginBottom: '0.5rem' }}>CRUD Operations</div>
                  <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                    {i.crud?.split(',').filter(Boolean).map((op: string) => {
                      const crudInfo = getPicklistInfo('integration_crud', op);
                      const hasColor = crudInfo?.color && crudInfo.color !== 'var(--secondary)';
                      const bg = hasColor ? crudInfo!.color : 'var(--primary)';
                      const text = hasColor ? getContrastColor(crudInfo!.color) : 'var(--primary-foreground)';
                      return (
                        <span key={op} style={{ fontSize: '0.875rem', fontWeight: 800, background: bg, color: text, padding: '0.25rem 0.75rem', borderRadius: '6px', textTransform: 'uppercase' }}>{crudInfo?.label || op}</span>
                      )
                    }) || '—'}
                  </div>
                </div>
              </div>
            </section>

            <section className="card" style={{ padding: '2rem' }}>
              <h3 style={{ fontSize: '0.8125rem', fontWeight: 700, textTransform: 'uppercase', color: 'var(--muted-foreground)', marginBottom: '1.5rem', letterSpacing: '0.1em' }}>Audit Trail</h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: '1rem' }}>
                  <div style={{ background: 'var(--muted)', padding: '0.5rem', borderRadius: '8px' }}><Calendar size={18} style={{ opacity: 0.7 }} /></div>
                  <div style={{ display: 'flex', flexDirection: 'column' }}>
                    <span style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--muted-foreground)', textTransform: 'uppercase' }}>Established</span>
                    <span style={{ fontWeight: 700, fontSize: '0.925rem' }}>{i.createdAt ? i.createdAt.split('T')[0] : '—'}</span>
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: '1rem' }}>
                  <div style={{ background: 'var(--muted)', padding: '0.5rem', borderRadius: '8px' }}><Info size={18} style={{ opacity: 0.7 }} /></div>
                  <div style={{ display: 'flex', flexDirection: 'column' }}>
                    <span style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--muted-foreground)', textTransform: 'uppercase' }}>Last Updated</span>
                    <span style={{ fontWeight: 700, fontSize: '0.925rem' }}>{i.updatedAt ? i.updatedAt.split('T')[0] : '—'}</span>
                  </div>
                </div>
              </div>
            </section>

            <ReferencesList raw={i.references} />
          </div>
        </div>
      </div>
    </div>
  );
};
