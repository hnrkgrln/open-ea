import React, { useMemo, useState } from 'react';
import { Edit2, Database, Boxes, ArrowRight, ArrowLeft, Calendar, User, Tag, Info, Network, Share2, ChevronLeft, ShieldCheck, ArrowUpRight, Activity, FileText } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { LifecycleBadge } from './LifecycleBadge';
import { InlineFilter } from './FilterControls';
import { ReferencesList } from './References';

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
}

export const AppDetailsView = ({ appId, onBack, onRefresh }: Props) => {
  const navigate = useNavigate();
  const [flowFilter, setFlowFilter] = useState('');

  const { data: latestApps } = useQuery<any[]>({ 
    queryKey: ['applications'], 
    queryFn: () => fetch('/api/applications').then(res => res.json()),
    staleTime: 1000 * 60 * 5,
  });

  const { data: app, isLoading } = useQuery<any>({
    queryKey: ['application', appId],
    queryFn: () => fetch(`/api/applications/${appId}`).then(res => res.json()),
    initialData: () => latestApps?.find(a => a.id === appId),
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

          {/* Hero Header */}
          <div style={{ marginBottom: '2.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div style={{ flex: 1 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.75rem' }}>
                <span style={{ fontSize: '0.65rem', fontWeight: 900, textTransform: 'uppercase', padding: '0.2rem 0.6rem', borderRadius: '4px', background: 'var(--primary)', color: 'var(--primary-foreground)', letterSpacing: '0.05em', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                  <Database size={12} /> Application
                </span>
              </div>
              <div style={{ display: 'flex', gap: '1rem', alignItems: 'center', marginBottom: '1rem' }}>
                <h1 style={{ fontSize: '2.25rem', fontWeight: 800, margin: 0, letterSpacing: '-0.03em' }}>{app.name}</h1>
                <LifecycleBadge lifecycle={app.lifecycle} color={getPicklistInfo('lifecycle', app.lifecycle).color} />
              </div>
              <p style={{ fontSize: '1.125rem', color: 'var(--foreground)', lineHeight: 1.6, margin: 0, maxWidth: '900px', opacity: 0.8 }}>
                {app.description || 'No description provided for this application.'}
              </p>
            </div>
            <button onClick={() => navigate(`/apps/${app.id}/edit`)} className="primary" style={{ height: '3rem', gap: '0.75rem', padding: '0 1.5rem', fontSize: '1rem', boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1)' }}>
              <Edit2 size={18} /> Edit Application
            </button>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 350px', gap: '3rem' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '3rem' }}>
              
              {/* Strategic Scores */}
              <section>
                <h3 style={{ fontSize: '0.8125rem', fontWeight: 700, textTransform: 'uppercase', color: 'var(--muted-foreground)', marginBottom: '1.5rem', letterSpacing: '0.1em', display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                  <Share2 size={16} /> Strategic Assessment
                </h3>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '1.5rem' }}>
                  {[
                    { label: 'Criticality', val: effectiveCriticality, key: 'criticality', inherited: isInherited },
                    { label: 'Functional Fit', val: app.functionalFit, key: 'functional_fit', inherited: false },
                    { label: 'Technical Fit', val: app.technicalFit, key: 'technical_fit', inherited: false }
                  ].map(score => {
                    const info = getPicklistInfo(score.key, score.val);
                    return (
                      <div key={score.label} style={{ padding: '1.5rem', background: 'var(--card)', borderRadius: '16px', border: '1px solid var(--border)', display: 'flex', flexDirection: 'column', alignItems: 'center', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
                        <div style={{ fontSize: '0.65rem', fontWeight: 700, color: 'var(--muted-foreground)', marginBottom: '0.5rem', textTransform: 'uppercase' }}>{score.label}</div>
                        <div style={{ fontSize: '1.25rem', fontWeight: 800, display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                            {info.color && <div style={{ width: '10px', height: '10px', borderRadius: '50%', background: info.color }} />}
                            {info.label}
                        </div>
                        {score.inherited && <div style={{ fontSize: '0.6rem', fontWeight: 800, color: 'var(--primary)', background: 'var(--secondary)', padding: '0.1rem 0.4rem', borderRadius: '4px', marginTop: '0.25rem' }}>INHERITED</div>}
                        <div style={{ marginTop: '0.75rem', width: '60px', height: '6px', borderRadius: '3px', background: info.color }} />
                      </div>
                    );
                  })}
                </div>
              </section>

              {/* Capabilities Table */}
              <section>
                <h3 style={{ fontSize: '0.8125rem', fontWeight: 700, textTransform: 'uppercase', color: 'var(--muted-foreground)', marginBottom: '1.5rem', letterSpacing: '0.1em', display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                  <Boxes size={16} /> Supported Capabilities
                </h3>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '1rem' }}>
                  {app.capabilities && app.capabilities.length > 0 ? app.capabilities.map((c: any) => (
                    <div key={c.id} onClick={() => navigate(`/capabilities/${c.id}`)} style={{ cursor: 'pointer', padding: '1.25rem', background: 'var(--card)', borderRadius: '12px', border: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: '0.75rem' }} className="row-hover">
                      <div style={{ background: 'var(--secondary)', padding: '0.4rem', borderRadius: '8px' }}>
                        <Boxes size={16} />
                      </div>
                      <span style={{ fontWeight: 700 }}>{c.name}</span>
                    </div>
                  )) : (
                    <div style={{ color: 'var(--muted-foreground)', fontSize: '0.875rem', fontStyle: 'italic' }}>No capabilities linked to this application.</div>
                  )}
                </div>
              </section>

              {/* Processed Information Objects */}
              <section>
                <h3 style={{ fontSize: '0.8125rem', fontWeight: 700, textTransform: 'uppercase', color: 'var(--muted-foreground)', marginBottom: '1.5rem', letterSpacing: '0.1em', display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                  <FileText size={16} /> Processed Information
                </h3>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '1rem' }}>
                  {app.processedInformationObjects && app.processedInformationObjects.length > 0 ? app.processedInformationObjects.map((io: any) => (
                    <div key={io.id} onClick={() => navigate(`/information/${io.id}`)} style={{ cursor: 'pointer', padding: '1.25rem', background: 'var(--card)', borderRadius: '12px', border: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: '0.75rem' }} className="row-hover">
                      <div style={{ background: 'var(--secondary)', padding: '0.4rem', borderRadius: '8px' }}>
                        <FileText size={16} />
                      </div>
                      <span style={{ fontWeight: 700 }}>{io.name}</span>
                    </div>
                  )) : (
                    <div style={{ color: 'var(--muted-foreground)', fontSize: '0.875rem', fontStyle: 'italic' }}>No information objects linked to this application.</div>
                  )}
                </div>
              </section>

              {/* Integrations Section */}
              <section>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '1rem', marginBottom: '1.5rem' }}>
                  <h3 style={{ fontSize: '0.8125rem', fontWeight: 700, textTransform: 'uppercase', color: 'var(--muted-foreground)', letterSpacing: '0.1em', display: 'flex', alignItems: 'center', gap: '0.6rem', margin: 0 }}>
                    <Network size={16} /> Integrations & Data Flows
                  </h3>
                  {((app.sourceOf?.length || 0) + (app.targetOf?.length || 0)) > 0 && (
                    <InlineFilter value={flowFilter} onChange={setFlowFilter} placeholder="Filter by app or type..." />
                  )}
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                  {(() => {
                    const totalCount = (app.sourceOf?.length || 0) + (app.targetOf?.length || 0);
                    if (totalCount === 0) {
                      return <div style={{ color: 'var(--muted-foreground)', fontSize: '0.875rem', fontStyle: 'italic' }}>No integrations recorded for this system.</div>;
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
                      return <div style={{ color: 'var(--muted-foreground)', fontSize: '0.875rem', fontStyle: 'italic' }}>No integrations match "{flowFilter}".</div>;
                    }
                    return (
                      <>
                        {outgoing.map((i: any) => (
                          <div key={i.id} onClick={() => navigate(`/integrations/${i.id}`)} style={{ padding: '1.25rem', background: 'var(--card)', borderRadius: '12px', border: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: '1rem', cursor: 'pointer' }} className="row-hover">
                            <ArrowRight size={18} style={{ color: 'var(--primary)' }} />
                            <div style={{ flex: 1 }}>
                              <div style={{ fontSize: '0.7rem', color: 'var(--muted-foreground)', fontWeight: 600 }}>PROVIDES TO</div>
                              <div style={{ fontWeight: 700 }}>{i.targetApp?.name}</div>
                            </div>
                            <div style={{ textAlign: 'right' }}>
                              <div style={{ fontSize: '0.6rem', fontWeight: 800, color: 'var(--primary)', background: 'var(--secondary)', padding: '0.1rem 0.4rem', borderRadius: '4px' }}>{i.pattern || 'API'}</div>
                            </div>
                          </div>
                        ))}
                        {incoming.map((i: any) => (
                          <div key={i.id} onClick={() => navigate(`/integrations/${i.id}`)} style={{ padding: '1.25rem', background: 'var(--card)', borderRadius: '12px', border: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: '1rem', cursor: 'pointer' }} className="row-hover">
                            <ArrowLeft size={18} style={{ color: 'var(--muted-foreground)' }} />
                            <div style={{ flex: 1 }}>
                              <div style={{ fontSize: '0.7rem', color: 'var(--muted-foreground)', fontWeight: 600 }}>CONSUMES FROM</div>
                              <div style={{ fontWeight: 700 }}>{i.sourceApp?.name}</div>
                            </div>
                            <div style={{ textAlign: 'right' }}>
                              <div style={{ fontSize: '0.6rem', fontWeight: 800, color: 'var(--primary)', background: 'var(--secondary)', padding: '0.1rem 0.4rem', borderRadius: '4px' }}>{i.pattern || 'API'}</div>
                            </div>
                          </div>
                        ))}
                      </>
                    );
                  })()}
                </div>
              </section>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '2.5rem' }}>
              <section>
                <h3 style={{ fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', color: 'var(--muted-foreground)', marginBottom: '1.25rem', letterSpacing: '0.05em' }}>Ownership</h3>
                <div className="card" style={{ display: 'flex', alignItems: 'center', gap: '1rem', padding: '1.5rem' }}>
                  <div style={{ background: 'var(--accent)', padding: '0.5rem', borderRadius: '8px' }}><User size={18} /></div>
                  <div style={{ display: 'flex', flexDirection: 'column' }}>
                    <span style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--muted-foreground)', textTransform: 'uppercase' }}>Business Owner</span>
                    <span style={{ fontWeight: 700 }}>{app.owner || 'Unassigned'}</span>
                  </div>
                </div>
              </section>

              <section>
                <h3 style={{ fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', color: 'var(--muted-foreground)', marginBottom: '1.25rem', letterSpacing: '0.05em' }}>Technical Profile</h3>
                <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem', padding: '1.5rem' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                    <div style={{ background: 'var(--accent)', padding: '0.5rem', borderRadius: '8px' }}><Tag size={18} /></div>
                    <div style={{ display: 'flex', flexDirection: 'column' }}>
                      <span style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--muted-foreground)', textTransform: 'uppercase' }}>App Type</span>
                      <span style={{ fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}>{getPicklistInfo('application_type', app.type).color !== 'var(--muted-foreground)' && <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: getPicklistInfo('application_type', app.type).color }} />} {getPicklistInfo('application_type', app.type).label || app.type || 'Internal'}</span>
                    </div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                    <div style={{ background: 'var(--accent)', padding: '0.5rem', borderRadius: '8px' }}><Activity size={18} /></div>
                    <div style={{ display: 'flex', flexDirection: 'column' }}>
                      <span style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--muted-foreground)', textTransform: 'uppercase' }}>Lifecycle</span>
                      <span style={{ fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}>{getPicklistInfo('lifecycle', app.lifecycle).color !== 'var(--muted-foreground)' && <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: getPicklistInfo('lifecycle', app.lifecycle).color }} />} {getPicklistInfo('lifecycle', app.lifecycle).label || app.lifecycle || 'Discovery'}</span>
                      {(app.lifecycleStartDate || app.lifecycleEndDate) && (
                        <div style={{ fontSize: '0.75rem', color: 'var(--muted-foreground)', marginTop: '0.25rem' }}>
                          {app.lifecycleStartDate && <span>Starts: {app.lifecycleStartDate.split('T')[0]}</span>}
                          {app.lifecycleStartDate && app.lifecycleEndDate && <span> • </span>}
                          {app.lifecycleEndDate && <span>Ends: {app.lifecycleEndDate.split('T')[0]}</span>}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </section>

              {/* Dynamic Metadata Section */}
              {Object.keys(meta).length > 0 && (
                <section>
                  <h3 style={{ fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', color: 'var(--muted-foreground)', marginBottom: '1.25rem', letterSpacing: '0.05em' }}>Extended Attributes</h3>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                    {Object.entries(meta).map(([key, val]: [string, any]) => {
                      const def = metaDefs?.find(d => d.fieldName === key);
                      return (
                        <div key={key} style={{ background: 'var(--card)', padding: '1.25rem', borderRadius: '12px', border: '1px solid var(--border)' }}>
                          <div style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--muted-foreground)', textTransform: 'uppercase', marginBottom: '0.5rem' }}>{def?.label || key}</div>
                          <div style={{ fontSize: '1rem', fontWeight: 700 }}>
                            {def?.fieldType === 'boolean' ? (val ? 'Yes' : 'No') : String(val)}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </section>
              )}

              <section>
                <h3 style={{ fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', color: 'var(--muted-foreground)', marginBottom: '1.25rem', letterSpacing: '0.05em' }}>Audit Trail</h3>
                <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem', padding: '1.5rem' }}>
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: '1rem' }}>
                    <div style={{ background: 'var(--muted)', padding: '0.5rem', borderRadius: '8px' }}><Calendar size={18} style={{ opacity: 0.7 }} /></div>
                    <div style={{ display: 'flex', flexDirection: 'column' }}>
                      <span style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--muted-foreground)', textTransform: 'uppercase' }}>Inventory Date</span>
                      <span style={{ fontWeight: 700, fontSize: '0.925rem' }}>{new Date(app.createdAt).toLocaleDateString(undefined, { dateStyle: 'long' })}</span>
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
