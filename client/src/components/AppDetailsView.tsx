import React, { useMemo, useState } from 'react';
import { Edit2, Database, Boxes, ArrowRight, ArrowLeft, Calendar, User, Tag, Info, Network, Share2, ChevronLeft, ShieldCheck, ArrowUpRight, Activity, FileText, Layers, FileSignature } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { LifecycleBadge } from './LifecycleBadge';
import { InlineFilter } from './FilterControls';
import { ReferencesList } from './References';
import { useLocalStorage, DEFAULT_TIME_THRESHOLDS, type TimeThresholds } from '../App';
import { TimeMatrix } from './TimeMatrix';

const safeJsonParse = (str: string | null | undefined, fallback: any = {}) => {
  if (!str) return fallback;
  try {
    return JSON.parse(str);
  } catch (e) {
    return fallback;
  }
};

interface Props {
  appId: string | null;
  onBack: () => void;
  onRefresh: () => void;
  thresholds?: TimeThresholds;
}

export const AppDetailsView = ({ appId, onBack, onRefresh, thresholds: propThresholds }: Props) => {
  const navigate = useNavigate();
  const [flowFilter, setFlowFilter] = useState('');
  const [storedThresholds] = useLocalStorage<TimeThresholds>('openea_time_thresholds', DEFAULT_TIME_THRESHOLDS);
  const thresholds = propThresholds || storedThresholds;

  const { data: app, isLoading } = useQuery<any>({
    queryKey: ['application', appId],
    queryFn: () => fetch(`/api/applications/${appId}`).then(res => res.json()),
    enabled: !!appId && appId !== 'undefined'
  });

  const { data: picklists } = useQuery<any[]>({ queryKey: ['picklists'], queryFn: () => fetch('/api/picklists').then(res => res.json()) });
  const { data: metaDefs } = useQuery<any[]>({ queryKey: ['metadata-definitions'], queryFn: () => fetch('/api/metadata-definitions').then(res => res.json()) });

  // Effective Criticality Logic
  const { effectiveCriticality, isInherited } = useMemo(() => {
    if (!app) return { effectiveCriticality: '3', isInherited: false };
    
    // Find highest criticality from linked capabilities
    const capCriticalities = (app.capabilities || [])
        .map((c: any) => Number(c.criticality))
        .filter((n: number) => !isNaN(n) && n > 0);
    
    if (capCriticalities.length > 0) {
        return { 
            effectiveCriticality: String(Math.max(...capCriticalities)), 
            isInherited: true 
        };
    }
    
    // Fallback to manual application criticality
    return { 
        effectiveCriticality: app.criticality || '3', 
        isInherited: false 
    };
  }, [app]);

  // TIME Assessment Logic (Gartner TIME Framework)
  const timeAssessment = useMemo(() => {
    const tech = Number(app?.technicalFit);
    const func = Number(app?.functionalFit);
    const crit = Number(effectiveCriticality);

    const hasTech = !isNaN(tech) && tech > 0;
    const hasFunc = !isNaN(func) && func > 0;
    const hasCrit = !isNaN(crit) && crit > 0;

    if (!hasTech && !hasFunc) {
      return {
        quadrant: null,
        title: 'Unassessed',
        action: 'Incomplete Assessment',
        description: 'Provide Technical Fit and Functional Fit ratings to place this application on the TIME quadrant.',
        color: 'var(--muted-foreground)',
        bg: 'var(--secondary)',
        border: 'var(--border)',
        techScore: 0,
        funcScore: 0,
        critScore: hasCrit ? crit : 0,
        xPct: 50,
        yPct: 50,
        dotSize: 14,
      };
    }

    const tVal = hasTech ? Math.max(1, Math.min(5, tech)) : 3;
    const fVal = hasFunc ? Math.max(1, Math.min(5, func)) : 3;
    const cVal = hasCrit ? Math.max(1, Math.min(5, crit)) : 3;

    const techCutoff = thresholds?.technicalFit ?? 3;
    const funcCutoff = thresholds?.functionalFit ?? 3;
    const critCutoff = thresholds?.businessCriticality ?? 4;
    const costCutoff = thresholds?.cost ?? 4;

    const costNum = Number(app?.cost);
    const costVal = !isNaN(costNum) && costNum > 0 ? Math.max(1, Math.min(5, costNum)) : 1;
    const isCostHigh = costVal >= costCutoff;

    const isTechHigh = tVal >= techCutoff;
    const isFuncHigh = fVal >= funcCutoff;

    let quadrant: 'TOLERATE' | 'INVEST' | 'MIGRATE' | 'ELIMINATE';
    let title: string;
    let action: string;
    let description: string;
    let color: string;
    let bg: string;
    let border: string;

    if (!isTechHigh && isFuncHigh) {
      quadrant = 'MIGRATE';
      title = 'Migrate';
      action = 'Modernize / Replatform / Upgrade';
      description = cVal >= critCutoff
        ? `High business alignment and capability support, but compromised by technical debt or obsolete architecture. Urgent re-platforming, cloud migration, or refactoring required${isCostHigh ? ', with high expenditure offering significant potential TCO savings' : ''}.`
        : `Good functional fit with aging or restrictive technical foundations. Target for modernization or SaaS migration${isCostHigh ? ' to eliminate elevated run costs' : ''}.`;
      color = '#e67700';
      bg = 'rgba(230, 119, 0, 0.12)';
      border = 'rgba(230, 119, 0, 0.35)';
    } else if (isTechHigh && isFuncHigh) {
      quadrant = 'INVEST';
      title = 'Invest';
      action = 'Grow / Expand / Innovate';
      description = cVal >= critCutoff
        ? `Mission-critical asset with superior technical health and high strategic alignment. Priority recipient for ongoing discretionary investment and ecosystem integration${isCostHigh ? ' (ensure high enterprise adoption justifies premium cost)' : ''}.`
        : `High technical stability and good user satisfaction. Continue expanding features and standardizing adoption${isCostHigh ? ', monitoring cost efficiency' : ''}.`;
      color = '#2b8a3e';
      bg = 'rgba(43, 138, 62, 0.12)';
      border = 'rgba(43, 138, 62, 0.35)';
    } else if (isTechHigh && !isFuncHigh) {
      quadrant = 'TOLERATE';
      title = 'Tolerate';
      action = 'Retain / Maintain / Low Discretionary Spend';
      description = isCostHigh
        ? 'Robust technical architecture but limited functional alignment, coupled with high run costs. Strongly evaluate renegotiating contract terms or consolidating onto alternatives to eliminate excessive maintenance spend.'
        : (cVal >= critCutoff
            ? 'Robust and stable technical architecture that satisfies baseline operational requirements, but does not provide deep functional coverage. Maintain with minimal run costs.'
            : 'Technically sound with low maintenance overhead and modest business impact. Retain as-is without significant new investment.');
      color = '#228be6';
      bg = 'rgba(34, 139, 230, 0.12)';
      border = 'rgba(34, 139, 230, 0.35)';
    } else {
      quadrant = 'ELIMINATE';
      title = 'Eliminate';
      action = 'Retire / Decommission / Consolidate';
      description = isCostHigh
        ? 'Poor technical sustainability, low functional utility, and high ongoing cost. Prime candidate for contract termination or decommissioning, yielding immediate budget savings.'
        : (cVal >= critCutoff
            ? 'Poor technical sustainability and low functional satisfaction despite high organizational reliance. Urgent replacement or capability transfer needed to avoid critical outage.'
            : 'Low business utility and poor technical health. Immediate candidate for rationalization, decommission, or replacement.');
      color = '#c92a2a';
      bg = 'rgba(201, 42, 42, 0.12)';
      border = 'rgba(201, 42, 42, 0.35)';
    }

    return {
      quadrant,
      title,
      action,
      description,
      color,
      bg,
      border,
      techScore: tVal,
      funcScore: fVal,
      critScore: cVal,
      costScore: costVal,
      isCostHigh
    };
  }, [app, effectiveCriticality, thresholds]);

  if (isLoading || !app) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', gap: '1rem', opacity: 0.8 }}>
        <div className="loading-logo" style={{ fontSize: '1.5rem' }}>OpenEA</div>
        <div className="loading-text" style={{ fontSize: '0.75rem' }}>Retrieving application details...</div>
      </div>
    );
  }

  const meta = safeJsonParse(app.metadata);
  const getPicklistInfo = (picklistName: string, value: string) => {
    const list = picklists?.find(p => p.name === picklistName);
    const option = list?.options?.find((o: any) => o.value === String(value));
    return option || { label: value || 'Not Scored', color: 'var(--muted-foreground)' };
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: 'var(--background)' }}>
      <div style={{ flex: 1, overflowY: 'auto' }}>
        <div className="main-container" style={{ padding: '2rem 1.25rem 4rem 1.25rem', maxWidth: '1400px', position: 'relative' }}>
          <button 
            onClick={onBack} 
            style={{ 
              position: 'absolute', top: '2rem', left: '-0.75rem',
              background: 'none', border: 'none', padding: '0.4rem', cursor: 'pointer', 
              display: 'flex', alignItems: 'center', color: 'var(--muted-foreground)', 
              borderRadius: '6px', transition: 'all 0.2s' 
            }} 
            className="row-hover"
            title="Go Back"
          >
            <ChevronLeft size={20} />
          </button>

          {/* Hero Header */}
          <div style={{ marginBottom: '1.75rem', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div style={{ flex: 1 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
                <span style={{ fontSize: '0.6rem', fontWeight: 900, textTransform: 'uppercase', padding: '0.15rem 0.5rem', borderRadius: '4px', background: 'var(--primary)', color: 'var(--primary-foreground)', letterSpacing: '0.05em', display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                  <Database size={10} /> Application
                </span>
              </div>
              <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', marginBottom: '0.75rem' }}>
                <h1 style={{ fontSize: '1.75rem', fontWeight: 800, margin: 0, letterSpacing: '-0.02em' }}>{app.name}</h1>
                <LifecycleBadge lifecycle={app.lifecycle} color={getPicklistInfo('lifecycle', app.lifecycle).color} />
              </div>
              <p style={{ fontSize: '1rem', color: 'var(--foreground)', lineHeight: 1.5, margin: 0, maxWidth: '900px', opacity: 0.8 }}>
                {app.description || 'No description provided for this application.'}
              </p>
            </div>
            <button onClick={() => navigate(`/apps/${app.id}/edit`)} className="primary" style={{ height: '2.4rem', gap: '0.5rem', padding: '0 1rem', fontSize: '0.9rem', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)' }}>
              <Edit2 size={16} /> Edit Application
            </button>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 300px', gap: '2rem' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
              
              {/* Strategic Scores & TIME Assessment Dashboard */}
              <section>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                  <h3 style={{ fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', color: 'var(--muted-foreground)', margin: 0, letterSpacing: '0.05em', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <Share2 size={14} /> Strategic Assessment & TIME Quadrant
                  </h3>
                  {timeAssessment.quadrant && (
                    <span style={{ 
                      fontSize: '0.65rem', 
                      fontWeight: 800, 
                      letterSpacing: '0.06em', 
                      textTransform: 'uppercase', 
                      padding: '0.2rem 0.65rem', 
                      borderRadius: '999px', 
                      background: timeAssessment.bg, 
                      color: timeAssessment.color, 
                      border: `1px solid ${timeAssessment.border}` 
                    }}>
                      TIME: {timeAssessment.title}
                    </span>
                  )}
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                  {/* TIME Quadrant Visualization Card */}
                  <div style={{ 
                    background: 'var(--card)', 
                    borderRadius: '16px', 
                    border: '1px solid var(--border)', 
                    padding: '1.25rem 1.5rem', 
                    boxShadow: '0 2px 8px rgba(0,0,0,0.04)',
                    display: 'grid',
                    gridTemplateColumns: 'minmax(280px, 340px) 1fr',
                    gap: '1.75rem',
                    alignItems: 'center'
                  }}>
                    {/* Interactive 2x2 TIME Diagram */}
                    <div style={{ maxWidth: '340px', width: '100%', margin: '0 auto' }}>
                      <TimeMatrix
                        singleApp={{
                          id: app.id,
                          name: app.name,
                          technicalFit: app.technicalFit,
                          functionalFit: app.functionalFit,
                          criticality: effectiveCriticality,
                          cost: app.cost
                        }}
                        thresholds={thresholds}
                        aspectRatio="1 / 1"
                        showLegend={true}
                      />
                    </div>

                    {/* TIME Assessment Narrative & Decision Breakdown */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                      <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.6rem' }}>
                        <span style={{ 
                          fontSize: '1.6rem', 
                          fontWeight: 900, 
                          letterSpacing: '-0.02em', 
                          color: timeAssessment.color 
                        }}>
                          {timeAssessment.title}
                        </span>
                        <span style={{ 
                          fontSize: '0.85rem', 
                          fontWeight: 700, 
                          color: 'var(--foreground)' 
                        }}>
                          — {timeAssessment.action}
                        </span>
                      </div>

                      <p style={{ 
                        margin: 0, 
                        fontSize: '0.85rem', 
                        lineHeight: 1.55, 
                        color: 'var(--foreground)', 
                        opacity: 0.85 
                      }}>
                        {timeAssessment.description}
                      </p>

                      {/* Strategic Driver Breakdown badges */}
                      <div style={{ 
                        marginTop: '0.25rem', 
                        padding: '0.65rem 0.85rem', 
                        background: 'var(--secondary)', 
                        borderRadius: '8px', 
                        display: 'flex', 
                        flexWrap: 'wrap', 
                        gap: '0.75rem 1.25rem',
                        alignItems: 'center',
                        fontSize: '0.72rem'
                      }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                          <span style={{ color: 'var(--muted-foreground)', fontWeight: 600 }}>Tech Fit:</span>
                          <span style={{ fontWeight: 800, color: timeAssessment.techScore >= (thresholds?.technicalFit ?? 3) ? '#2b8a3e' : '#c92a2a' }}>
                            {timeAssessment.techScore}/5 ({timeAssessment.techScore >= (thresholds?.technicalFit ?? 3) ? 'High' : 'Low'})
                          </span>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                          <span style={{ color: 'var(--muted-foreground)', fontWeight: 600 }}>Functional Fit:</span>
                          <span style={{ fontWeight: 800, color: timeAssessment.funcScore >= (thresholds?.functionalFit ?? 3) ? '#2b8a3e' : '#c92a2a' }}>
                            {timeAssessment.funcScore}/5 ({timeAssessment.funcScore >= (thresholds?.functionalFit ?? 3) ? 'High' : 'Low'})
                          </span>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                          <span style={{ color: 'var(--muted-foreground)', fontWeight: 600 }}>Criticality:</span>
                          <span style={{ fontWeight: 800, color: timeAssessment.critScore >= (thresholds?.businessCriticality ?? 4) ? '#c92a2a' : 'var(--foreground)' }}>
                            {timeAssessment.critScore}/5 {isInherited ? '(Inherited)' : ''} ({timeAssessment.critScore >= (thresholds?.businessCriticality ?? 4) ? 'High / Urgent' : 'Normal'})
                          </span>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                          <span style={{ color: 'var(--muted-foreground)', fontWeight: 600 }}>Cost:</span>
                          <span style={{ fontWeight: 800, color: timeAssessment.isCostHigh ? '#fd7e14' : '#2b8a3e' }}>
                            {timeAssessment.costScore}/5 ({timeAssessment.isCostHigh ? 'High Cost' : 'Normal / Low'})
                          </span>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                          <span style={{ color: 'var(--muted-foreground)', fontWeight: 600 }}>Marker Size:</span>
                          <span style={{ fontStyle: 'italic', color: 'var(--muted-foreground)' }}>Scales with Criticality</span>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Compact Scores Row (Criticality, Cost, Functional Fit, Technical Fit) */}
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '0.75rem' }}>
                    {[
                      { label: 'Criticality', val: effectiveCriticality, key: 'criticality', inherited: isInherited },
                      { label: 'Cost', val: app.cost, key: 'application_cost', inherited: false },
                      { label: 'Functional Fit', val: app.functionalFit, key: 'functional_fit', inherited: false },
                      { label: 'Technical Fit', val: app.technicalFit, key: 'technical_fit', inherited: false }
                    ].map(score => {
                      const info = getPicklistInfo(score.key, score.val);
                      return (
                        <div key={score.label} style={{ 
                          padding: '0.75rem 1rem', 
                          background: 'var(--card)', 
                          borderRadius: '10px', 
                          border: '1px solid var(--border)', 
                          display: 'flex', 
                          justifyContent: 'space-between',
                          alignItems: 'center', 
                          boxShadow: '0 1px 2px rgba(0,0,0,0.03)' 
                        }}>
                          <div>
                            <div style={{ fontSize: '0.6rem', fontWeight: 700, color: 'var(--muted-foreground)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{score.label}</div>
                            <div style={{ fontSize: '0.95rem', fontWeight: 800, display: 'flex', alignItems: 'center', gap: '0.35rem', marginTop: '0.15rem' }}>
                              {info.color && <div style={{ width: '7px', height: '7px', borderRadius: '50%', background: info.color, flexShrink: 0 }} />}
                              {info.label}
                            </div>
                          </div>
                          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '0.25rem' }}>
                            {score.inherited && <span style={{ fontSize: '0.5rem', fontWeight: 800, color: 'var(--primary)', background: 'var(--secondary)', padding: '0.1rem 0.35rem', borderRadius: '4px' }}>INHERITED</span>}
                            <div style={{ width: '28px', height: '3px', borderRadius: '2px', background: info.color }} />
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {/* Aggregated Data Risk Profile Row */}
                  {app.processedInformationObjects && app.processedInformationObjects.length > 0 && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                      <div style={{ fontSize: '0.65rem', fontWeight: 800, color: 'var(--muted-foreground)', textTransform: 'uppercase', letterSpacing: '0.08em', marginLeft: '0.25rem' }}>Aggregated Data Sensitivity (Max Rating)</div>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '1rem' }}>
                        {(() => {
                          const getHigh = (field: string) => {
                            const vals = app.processedInformationObjects.map((io: any) => parseInt(io[field] || '1')).filter((v: number) => !isNaN(v));
                            return vals.length > 0 ? String(Math.max(...vals)) : '1';
                          };
                          
                          const risks = [
                            { label: 'Confidentiality', val: getHigh('confidentiality'), key: 'cia_scale' },
                            { label: 'Integrity', val: getHigh('integrity'), key: 'cia_scale' },
                            { label: 'Availability', val: getHigh('availability'), key: 'cia_scale' },
                            { label: 'PII Risk', val: getHigh('piiCategory'), key: 'pii_category' }
                          ];
                          
                          return risks.map(risk => {
                            const info = getPicklistInfo(risk.key, risk.val);
                            return (
                              <div key={risk.label} style={{ padding: '1rem', background: 'var(--card)', borderRadius: '12px', border: '1px solid var(--border)', display: 'flex', flexDirection: 'column', alignItems: 'center', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
                                <div style={{ fontSize: '0.6rem', fontWeight: 700, color: 'var(--muted-foreground)', marginBottom: '0.4rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{risk.label}</div>
                                <div style={{ fontSize: '1rem', fontWeight: 800, display: 'flex', alignItems: 'center', gap: '0.4rem', textAlign: 'center' }}>
                                    <div style={{ width: '6px', height: '6px', borderRadius: '50%', background: info.color }} />
                                    {info.label.split(' - ')[0]}
                                </div>
                                <div style={{ marginTop: '0.6rem', width: '30px', height: '3px', borderRadius: '2px', background: info.color }} />
                              </div>
                            );
                          });
                        })()}
                      </div>
                    </div>
                  )}
                </div>
              </section>

              {/* Capabilities Table */}
              <section>
                <h3 style={{ fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', color: 'var(--muted-foreground)', marginBottom: '1rem', letterSpacing: '0.05em', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <Boxes size={14} /> Supported Capabilities
                </h3>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: '0.75rem' }}>
                  {app.capabilities && app.capabilities.length > 0 ? app.capabilities.map((c: any) => (
                    <div key={c.id} onClick={() => navigate(`/capabilities/${c.id}`)} style={{ cursor: 'pointer', padding: '0.85rem', background: 'var(--card)', borderRadius: '10px', border: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: '0.6rem' }} className="row-hover">
                      <div style={{ background: 'var(--secondary)', padding: '0.35rem', borderRadius: '6px' }}>
                        <Boxes size={14} />
                      </div>
                      <span style={{ fontWeight: 700, fontSize: '0.85rem' }}>{c.name}</span>
                    </div>
                  )) : (
                    <div style={{ color: 'var(--muted-foreground)', fontSize: '0.8rem', fontStyle: 'italic' }}>No capabilities linked to this application.</div>
                  )}
                </div>
              </section>

              {/* Processed Information Objects */}
              <section>
                <h3 style={{ fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', color: 'var(--muted-foreground)', marginBottom: '1rem', letterSpacing: '0.05em', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <FileText size={14} /> Processed Information
                </h3>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '0.75rem' }}>
                  {app.processedInformationObjects && app.processedInformationObjects.length > 0 ? app.processedInformationObjects.map((io: any) => {
                    const piiInfo = getPicklistInfo('pii_category', io.piiCategory || '1');
                    const confInfo = getPicklistInfo('cia_scale', io.confidentiality || '1');
                    const integInfo = getPicklistInfo('cia_scale', io.integrity || '1');
                    const availInfo = getPicklistInfo('cia_scale', io.availability || '1');
                    
                    return (
                    <div key={io.id} onClick={() => navigate(`/information/${io.id}`)} style={{ cursor: 'pointer', padding: '1rem', background: 'var(--card)', borderRadius: '12px', border: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: '0.75rem' }} className="row-hover">
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                        <div style={{ background: 'var(--secondary)', padding: '0.35rem', borderRadius: '6px' }}>
                          <FileText size={14} />
                        </div>
                        <span style={{ fontWeight: 700, fontSize: '0.9rem' }}>{io.name}</span>
                      </div>
                      
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.35rem' }}>
                        <span title={`Confidentiality: ${confInfo.label}`} style={{ fontSize: '0.55rem', fontWeight: 900, textTransform: 'uppercase', padding: '0.1rem 0.4rem', borderRadius: '4px', background: confInfo.color, color: 'white' }}>
                          C: {confInfo.label.split(' - ')[0]}
                        </span>
                        <span title={`Integrity: ${integInfo.label}`} style={{ fontSize: '0.55rem', fontWeight: 900, textTransform: 'uppercase', padding: '0.1rem 0.4rem', borderRadius: '4px', background: integInfo.color, color: 'white' }}>
                          I: {integInfo.label.split(' - ')[0]}
                        </span>
                        <span title={`Availability: ${availInfo.label}`} style={{ fontSize: '0.55rem', fontWeight: 900, textTransform: 'uppercase', padding: '0.1rem 0.4rem', borderRadius: '4px', background: availInfo.color, color: 'white' }}>
                          A: {availInfo.label.split(' - ')[0]}
                        </span>
                        <span title={`PII Category: ${piiInfo.label}`} style={{ fontSize: '0.55rem', fontWeight: 900, textTransform: 'uppercase', padding: '0.1rem 0.4rem', borderRadius: '4px', background: piiInfo.color, color: 'white' }}>
                          PII: {piiInfo.label.split(' - ')[0]}
                        </span>
                      </div>
                    </div>
                  )}) : (
                    <div style={{ color: 'var(--muted-foreground)', fontSize: '0.8rem', fontStyle: 'italic' }}>No information objects linked to this application.</div>
                  )}
                </div>
              </section>

              {/* Integrations Section */}
              <section>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.75rem', marginBottom: '1rem' }}>
                  <h3 style={{ fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', color: 'var(--muted-foreground)', letterSpacing: '0.05em', display: 'flex', alignItems: 'center', gap: '0.5rem', margin: 0 }}>
                    <Network size={14} /> Integrations & Data Flows
                  </h3>
                  {((app.sourceOf?.length || 0) + (app.targetOf?.length || 0)) > 0 && (
                    <InlineFilter value={flowFilter} onChange={setFlowFilter} placeholder="Filter by app or type..." />
                  )}
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                  {(() => {
                    const totalCount = (app.sourceOf?.length || 0) + (app.targetOf?.length || 0);
                    if (totalCount === 0) {
                      return <div style={{ color: 'var(--muted-foreground)', fontSize: '0.8rem', fontStyle: 'italic' }}>No integrations recorded for this system.</div>;
                    }
                    const q = flowFilter.trim().toLowerCase();
                    const matches = (i: any, otherName: string) => {
                      if (!q) return true;
                      const pat = (i.pattern || '').toLowerCase();
                      return otherName.toLowerCase().includes(q) || pat.includes(q);
                    };
                    const outgoing = (app.sourceOf || []).filter((i: any) => matches(i, i.targetApp?.name || ''));
                    const incoming = (app.targetOf || []).filter((i: any) => matches(i, i.sourceApp?.name || ''));
                    if (q && outgoing.length === 0 && incoming.length === 0) {
                      return <div style={{ color: 'var(--muted-foreground)', fontSize: '0.8rem', fontStyle: 'italic' }}>No integrations match "{flowFilter}".</div>;
                    }
                    return (
                      <>
                        {outgoing.map((i: any) => (
                          <div key={i.id} onClick={() => navigate(`/integrations/${i.id}`)} style={{ padding: '1rem', background: 'var(--card)', borderRadius: '10px', border: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: '0.75rem', cursor: 'pointer' }} className="row-hover">
                            <ArrowRight size={16} style={{ color: 'var(--primary)' }} />
                            <div style={{ flex: 1 }}>
                              <div style={{ fontSize: '0.65rem', color: 'var(--muted-foreground)', fontWeight: 600 }}>PROVIDES TO</div>
                              <div style={{ fontWeight: 700, fontSize: '0.9rem' }}>{i.targetApp?.name}</div>
                            </div>
                            <div style={{ textAlign: 'right' }}>
                              <div style={{ fontSize: '0.55rem', fontWeight: 800, color: 'var(--primary)', background: 'var(--secondary)', padding: '0.1rem 0.35rem', borderRadius: '4px' }}>{i.pattern || 'API'}</div>
                            </div>
                          </div>
                        ))}
                        {incoming.map((i: any) => (
                          <div key={i.id} onClick={() => navigate(`/integrations/${i.id}`)} style={{ padding: '1rem', background: 'var(--card)', borderRadius: '10px', border: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: '0.75rem', cursor: 'pointer' }} className="row-hover">
                            <ArrowLeft size={16} style={{ color: 'var(--muted-foreground)' }} />
                            <div style={{ flex: 1 }}>
                              <div style={{ fontSize: '0.65rem', color: 'var(--muted-foreground)', fontWeight: 600 }}>CONSUMES FROM</div>
                              <div style={{ fontWeight: 700, fontSize: '0.9rem' }}>{i.sourceApp?.name}</div>
                            </div>
                            <div style={{ textAlign: 'right' }}>
                              <div style={{ fontSize: '0.55rem', fontWeight: 800, color: 'var(--primary)', background: 'var(--secondary)', padding: '0.1rem 0.35rem', borderRadius: '4px' }}>{i.pattern || 'API'}</div>
                            </div>
                          </div>
                        ))}
                      </>
                    );
                  })()}
                </div>
              </section>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
              <section>
                <h3 style={{ fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase', color: 'var(--muted-foreground)', marginBottom: '1rem', letterSpacing: '0.05em' }}>Ownership</h3>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                  <div className="card" style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '1.25rem' }}>
                    <div style={{ background: 'var(--accent)', padding: '0.4rem', borderRadius: '8px' }}><User size={16} /></div>
                    <div style={{ display: 'flex', flexDirection: 'column' }}>
                      <span style={{ fontSize: '0.65rem', fontWeight: 700, color: 'var(--muted-foreground)', textTransform: 'uppercase' }}>Business Owner</span>
                      <span style={{ fontWeight: 700, fontSize: '0.9rem' }}>{app.owner || 'Unassigned'}</span>
                    </div>
                  </div>

                  {app.ownerOrg && (
                    <div className="card row-hover" onClick={() => navigate(`/organizations/${app.ownerOrgId}`)} style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '1.25rem', cursor: 'pointer' }}>
                      <div style={{ background: 'var(--accent)', padding: '0.4rem', borderRadius: '8px' }}><Layers size={16} /></div>
                      <div style={{ display: 'flex', flexDirection: 'column' }}>
                        <span style={{ fontSize: '0.65rem', fontWeight: 700, color: 'var(--muted-foreground)', textTransform: 'uppercase' }}>Owning Organization</span>
                        <span style={{ fontWeight: 700, fontSize: '0.9rem', color: 'var(--primary)' }}>{app.ownerOrg.name}</span>
                      </div>
                    </div>
                  )}
                </div>
              </section>

              <section>
                <h3 style={{ fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase', color: 'var(--muted-foreground)', marginBottom: '1rem', letterSpacing: '0.05em' }}>Technical Profile</h3>
                <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem', padding: '1.25rem' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                    <div style={{ background: 'var(--accent)', padding: '0.4rem', borderRadius: '8px' }}><Tag size={16} /></div>
                    <div style={{ display: 'flex', flexDirection: 'column' }}>
                      <span style={{ fontSize: '0.65rem', fontWeight: 700, color: 'var(--muted-foreground)', textTransform: 'uppercase' }}>App Type</span>
                      <span style={{ fontWeight: 700, fontSize: '0.9rem', display: 'inline-flex', alignItems: 'center', gap: '0.3rem' }}>{getPicklistInfo('application_type', app.type).color !== 'var(--muted-foreground)' && <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: getPicklistInfo('application_type', app.type).color }} />} {getPicklistInfo('application_type', app.type).label || app.type || 'Internal'}</span>
                    </div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                    <div style={{ background: 'var(--accent)', padding: '0.4rem', borderRadius: '8px' }}><Activity size={16} /></div>
                    <div style={{ display: 'flex', flexDirection: 'column' }}>
                      <span style={{ fontSize: '0.65rem', fontWeight: 700, color: 'var(--muted-foreground)', textTransform: 'uppercase' }}>Lifecycle</span>
                      <span style={{ fontWeight: 700, fontSize: '0.9rem', display: 'inline-flex', alignItems: 'center', gap: '0.3rem' }}>{getPicklistInfo('lifecycle', app.lifecycle).color !== 'var(--muted-foreground)' && <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: getPicklistInfo('lifecycle', app.lifecycle).color }} />} {getPicklistInfo('lifecycle', app.lifecycle).label || app.lifecycle || 'Discovery'}</span>
                      {(app.lifecycleStartDate || app.lifecycleEndDate) && (
                        <div style={{ fontSize: '0.7rem', color: 'var(--muted-foreground)', marginTop: '0.2rem' }}>
                          {app.lifecycleStartDate && <span>Starts: {app.lifecycleStartDate.split('T')[0]}</span>}
                          {app.lifecycleStartDate && app.lifecycleEndDate && <span> • </span>}
                          {app.lifecycleEndDate && <span>Ends: {app.lifecycleEndDate.split('T')[0]}</span>}
                        </div>
                      )}
                    </div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.75rem' }}>
                    <div style={{ background: 'var(--accent)', padding: '0.4rem', borderRadius: '8px' }}><FileSignature size={16} /></div>
                    <div style={{ display: 'flex', flexDirection: 'column' }}>
                      <span style={{ fontSize: '0.65rem', fontWeight: 700, color: 'var(--muted-foreground)', textTransform: 'uppercase' }}>Contract</span>
                      {app.contractStartDate || app.contractEndDate ? (
                        <div style={{ fontSize: '0.85rem', fontWeight: 700 }}>
                          {app.contractStartDate && <span>{app.contractStartDate.split('T')[0]}</span>}
                          {app.contractStartDate && app.contractEndDate && <span> to </span>}
                          {app.contractEndDate && <span>{app.contractEndDate.split('T')[0]}</span>}
                        </div>
                      ) : (
                        <span style={{ fontSize: '0.85rem', color: 'var(--muted-foreground)', fontStyle: 'italic' }}>No active contract dates</span>
                      )}
                      {app.contractDetails && (
                        <div style={{ fontSize: '0.75rem', color: 'var(--muted-foreground)', marginTop: '0.25rem', whiteSpace: 'pre-wrap', lineHeight: 1.4 }}>
                          {app.contractDetails}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </section>

              {/* Dynamic Metadata Section */}
              {Object.keys(meta).length > 0 && (
                <section>
                  <h3 style={{ fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase', color: 'var(--muted-foreground)', marginBottom: '1rem', letterSpacing: '0.05em' }}>Extended Attributes</h3>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                    {Object.entries(meta).map(([key, val]: [string, any]) => {
                      const def = metaDefs?.find(d => d.fieldName === key);
                      return (
                        <div key={key} style={{ background: 'var(--card)', padding: '1rem', borderRadius: '10px', border: '1px solid var(--border)' }}>
                          <div style={{ fontSize: '0.65rem', fontWeight: 700, color: 'var(--muted-foreground)', textTransform: 'uppercase', marginBottom: '0.4rem' }}>{def?.label || key}</div>
                          <div style={{ fontSize: '0.9rem', fontWeight: 700 }}>
                            {def?.fieldType === 'boolean' ? (val ? 'Yes' : 'No') : String(val)}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </section>
              )}

              <section>
                <h3 style={{ fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase', color: 'var(--muted-foreground)', marginBottom: '1rem', letterSpacing: '0.05em' }}>Audit Trail</h3>
                <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem', padding: '1.25rem' }}>
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.75rem' }}>
                    <div style={{ background: 'var(--muted)', padding: '0.4rem', borderRadius: '8px' }}><Calendar size={16} style={{ opacity: 0.7 }} /></div>
                    <div style={{ display: 'flex', flexDirection: 'column' }}>
                      <span style={{ fontSize: '0.65rem', fontWeight: 700, color: 'var(--muted-foreground)', textTransform: 'uppercase' }}>Inventory Date</span>
                      <span style={{ fontWeight: 700, fontSize: '0.85rem' }}>{new Date(app.createdAt).toLocaleDateString(undefined, { dateStyle: 'long' })}</span>
                    </div>
                  </div>
                </div>
              </section>
            </div>
          </div>

          <ReferencesList raw={app.references} />
        </div>
      </div>
    </div>
  );
};
