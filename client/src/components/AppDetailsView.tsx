import React, { useMemo } from 'react';
import { Edit2, Database, Boxes, ArrowRight, ArrowLeft, Calendar, User, Tag, Info, Network, Share2, ChevronLeft, ShieldCheck, ArrowUpRight } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { LifecycleBadge } from './LifecycleBadge';
import { EditAppDialog } from './EditAppDialog';

const safeJsonParse = (str: string | null | undefined, fallback: any = {}) => {
  if (!str) return fallback;
  try {
    return JSON.parse(str);
  } catch (e) {
    return fallback;
  }
};

interface Props {
  appId: string;
  onBack: () => void;
  onRefresh: () => void;
}

export const AppDetailsView = ({ appId, onBack, onRefresh }: Props) => {
  const [showEdit, setShowEdit] = React.useState(false);

  // Fetch all contextual data
  const { data: picklists } = useQuery<any[]>({ queryKey: ['picklists'], queryFn: () => fetch('/api/picklists').then(res => res.json()) });
  const { data: metaDefs } = useQuery<any[]>({ queryKey: ['metadata-definitions'], queryFn: () => fetch('/api/metadata-definitions').then(res => res.json()) });
  const { data: integrations } = useQuery<any[]>({ queryKey: ['integrations'], queryFn: () => fetch('/api/integrations').then(res => res.json()) });
  
  const { data: latestApps } = useQuery<any[]>({ 
    queryKey: ['applications'], 
    queryFn: () => fetch('/api/applications').then(res => res.json()),
    staleTime: 1000 * 60 * 5, // 5 minutes
  });

  const { data: app, isLoading } = useQuery<any>({
    queryKey: ['application', appId],
    queryFn: () => fetch(`/api/applications/${appId}`).then(res => res.json()),
    initialData: () => latestApps?.find(a => a.id === appId),
    enabled: !!appId
  });

  // Effective Criticality Logic (Inherited from max of capabilities)
  const effectiveCriticality = useMemo(() => {
    if (!app) return '3';
    if (!app.capabilities || app.capabilities.length === 0) return app.criticality || '3';
    
    const capCriticalities = app.capabilities.map((c: any) => Number(c.criticality || 1));
    return String(Math.max(...capCriticalities));
  }, [app]);

  const isInherited = app?.capabilities && app.capabilities.length > 0;

  if (isLoading || !app) return <div style={{ padding: '2rem', textAlign: 'center' }}>Loading application details...</div>;

  const meta = safeJsonParse(app.metadata);
  
  const getPicklistInfo = (picklistName: string, value: string) => {
    const list = picklists?.find(p => p.name === picklistName);
    const option = list?.options?.find((o: any) => o.value === String(value));
    return option || { label: value || 'Not Scored', color: 'var(--muted-foreground)' };
  };

  const incoming = integrations?.filter(i => i.targetAppId === app.id) || [];
  const outgoing = integrations?.filter(i => i.sourceAppId === app.id) || [];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: 'var(--background)' }}>
      <div style={{ flex: 1, overflowY: 'auto' }}>
        <div className="main-container" style={{ padding: '3rem 2rem 6rem 2rem', maxWidth: '1400px', position: 'relative' }}>
          <button 
            onClick={onBack} 
            style={{ 
              position: 'absolute', top: '3rem', left: '-1rem', // Floats slightly to the left of the container
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
              <div style={{ display: 'flex', gap: '1rem', alignItems: 'center', marginBottom: '1rem' }}>
                <h1 style={{ fontSize: '2.25rem', fontWeight: 800, margin: 0, letterSpacing: '-0.03em' }}>{app.name}</h1>
                <LifecycleBadge lifecycle={app.lifecycle} />
              </div>
              <p style={{ fontSize: '1.125rem', color: 'var(--foreground)', lineHeight: 1.6, margin: 0, maxWidth: '900px', opacity: 0.8 }}>
                {app.description || 'No description provided for this application.'}
              </p>
              <div style={{ display: 'flex', gap: '1rem', marginTop: '1.5rem' }}>
                <span style={{ fontSize: '0.875rem', color: 'var(--muted-foreground)', display: 'flex', alignItems: 'center', gap: '0.4rem', background: 'var(--card)', padding: '0.3rem 0.75rem', borderRadius: '8px', border: '1px solid var(--border)' }}>
                  <Tag size={16} /> {app.type || 'Generic Application'}
                </span>
                <span style={{ fontSize: '0.875rem', color: 'var(--muted-foreground)', display: 'flex', alignItems: 'center', gap: '0.4rem', background: 'var(--card)', padding: '0.3rem 0.75rem', borderRadius: '8px', border: '1px solid var(--border)' }}>
                  <User size={16} /> {app.owner || 'Unassigned Owner'}
                </span>
              </div>
            </div>
            <button onClick={() => setShowEdit(true)} className="primary" style={{ height: '3rem', gap: '0.75rem', padding: '0 1.5rem', fontSize: '1rem', boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1)' }}>
              <Edit2 size={18} /> Edit Application
            </button>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 350px', gap: '3rem' }}>
            {/* Left Column: Core Strategic Data */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '3rem' }}>
              
              {/* Strategic Health Section */}
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
                      <div key={score.label} style={{ padding: '1.5rem', background: 'var(--card)', borderRadius: '16px', border: '1px solid var(--border)', display: 'flex', flexDirection: 'column', alignItems: 'center', boxShadow: '0 1px 3px rgba(0,0,0,0.05)', position: 'relative' }}>
                        {score.inherited && (
                          <div style={{ position: 'absolute', top: '0.75rem', right: '0.75rem', color: 'var(--muted-foreground)', display: 'flex', alignItems: 'center', gap: '0.2rem', fontSize: '0.6rem', fontWeight: 800 }}>
                            <ArrowUpRight size={10} /> INHERITED
                          </div>
                        )}
                        <div style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--muted-foreground)', marginBottom: '0.75rem', textTransform: 'uppercase' }}>{score.label}</div>
                        <div style={{ fontSize: '1.25rem', fontWeight: 800, color: info.color }}>{info.label}</div>
                        <div style={{ marginTop: '0.75rem', width: '60px', height: '6px', borderRadius: '3px', background: info.color }} />
                      </div>
                    );
                  })}
                </div>
              </section>

              {/* Integrations Section */}
              <section>
                <h3 style={{ fontSize: '0.8125rem', fontWeight: 700, textTransform: 'uppercase', color: 'var(--muted-foreground)', marginBottom: '1.5rem', letterSpacing: '0.1em', display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                  <Network size={16} /> System Integrations
                </h3>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2rem' }}>
                  <div className="card" style={{ background: 'var(--card)', padding: '1.5rem' }}>
                    <div style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--muted-foreground)', marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <ArrowRight size={14} /> PROVIDING DATA TO
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                      {outgoing.length > 0 ? outgoing.map(i => (
                        <div key={i.id} style={{ padding: '1rem', background: 'var(--muted)', borderRadius: '12px', border: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <span style={{ fontSize: '0.925rem', fontWeight: 700 }}>{i.targetApp?.name}</span>
                          <span style={{ fontSize: '0.75rem', color: 'var(--muted-foreground)', background: 'var(--card)', padding: '0.2rem 0.5rem', borderRadius: '6px', fontWeight: 600 }}>{i.name || i.type}</span>
                        </div>
                      )) : <div style={{ fontSize: '0.875rem', color: 'var(--muted-foreground)', fontStyle: 'italic' }}>No outgoing integrations.</div>}
                    </div>
                  </div>
                  <div className="card" style={{ background: 'var(--card)', padding: '1.5rem' }}>
                    <div style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--muted-foreground)', marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <ArrowLeft size={14} /> CONSUMING DATA FROM
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                      {incoming.length > 0 ? incoming.map(i => (
                        <div key={i.id} style={{ padding: '1rem', background: 'var(--muted)', borderRadius: '12px', border: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <span style={{ fontSize: '0.925rem', fontWeight: 700 }}>{i.sourceApp?.name}</span>
                          <span style={{ fontSize: '0.75rem', color: 'var(--muted-foreground)', background: 'var(--card)', padding: '0.2rem 0.5rem', borderRadius: '6px', fontWeight: 600 }}>{i.name || i.type}</span>
                        </div>
                      )) : <div style={{ fontSize: '0.875rem', color: 'var(--muted-foreground)', fontStyle: 'italic' }}>No incoming integrations.</div>}
                    </div>
                  </div>
                </div>
              </section>

              {/* Supporting Capabilities Section */}
              <section>
                <h3 style={{ fontSize: '0.8125rem', fontWeight: 700, textTransform: 'uppercase', color: 'var(--muted-foreground)', marginBottom: '1.5rem', letterSpacing: '0.1em', display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                  <Boxes size={16} /> Supporting Business Capabilities
                </h3>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem' }}>
                  {app.capabilities && app.capabilities.length > 0 ? app.capabilities.map((cap: any) => (
                    <div key={cap.id} style={{ padding: '0.75rem 1.25rem', background: 'var(--secondary)', borderRadius: '12px', fontSize: '0.925rem', fontWeight: 700, border: '1px solid var(--border)', color: 'var(--secondary-foreground)', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <Boxes size={14} style={{ opacity: 0.6 }} /> {cap.name}
                    </div>
                  )) : (
                    <div style={{ color: 'var(--muted-foreground)', fontSize: '0.875rem', fontStyle: 'italic' }}>This application is not linked to any business capabilities.</div>
                  )}
                </div>
              </section>
            </div>

            {/* Right Column: Meta & Audit */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '2.5rem' }}>
              
              <section>
                <h3 style={{ fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', color: 'var(--muted-foreground)', marginBottom: '1.25rem', letterSpacing: '0.05em' }}>Accountability</h3>
                <div style={{ background: 'var(--card)', padding: '2rem 1.5rem', borderRadius: '16px', border: '1px solid var(--border)', boxShadow: '0 4px 12px rgba(0,0,0,0.05)', display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center' }}>
                  <div style={{ width: '72px', height: '72px', borderRadius: '24px', background: 'var(--primary)', color: 'var(--primary-foreground)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.75rem', fontWeight: 800, marginBottom: '1rem', boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1)' }}>
                    {app.owner?.substring(0, 2).toUpperCase() || '??'}
                  </div>
                  <div style={{ fontSize: '1.25rem', fontWeight: 800, marginBottom: '0.25rem', letterSpacing: '-0.01em' }}>{app.owner || 'Unassigned'}</div>
                  <div style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--muted-foreground)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '1.5rem' }}>Application Owner</div>
                  
                  <div style={{ width: '100%', paddingTop: '1.5rem', borderTop: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: '1rem', textAlign: 'left' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', fontSize: '0.875rem' }}>
                      <User size={16} style={{ opacity: 0.5 }} />
                      <span style={{ fontWeight: 600 }}>Primary Contact</span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', fontSize: '0.875rem' }}>
                      <ShieldCheck size={16} style={{ opacity: 0.5 }} />
                      <span style={{ fontWeight: 600 }}>Governance Lead</span>
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
                        <div key={key} style={{ background: 'var(--card)', padding: '1.25rem', borderRadius: '12px', border: '1px solid var(--border)', boxShadow: '0 1px 2px rgba(0,0,0,0.05)' }}>
                          <div style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--muted-foreground)', textTransform: 'uppercase', marginBottom: '0.5rem' }}>{def?.label || key}</div>
                          <div style={{ fontSize: '1rem', fontWeight: 700 }}>{String(val)}</div>
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
                      <span style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--muted-foreground)', textTransform: 'uppercase' }}>System Creation</span>
                      <span style={{ fontWeight: 700, fontSize: '0.925rem' }}>{new Date(app.createdAt).toLocaleDateString(undefined, { dateStyle: 'long' })}</span>
                    </div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: '1rem' }}>
                    <div style={{ background: 'var(--muted)', padding: '0.5rem', borderRadius: '8px' }}><Info size={18} style={{ opacity: 0.7 }} /></div>
                    <div style={{ display: 'flex', flexDirection: 'column' }}>
                      <span style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--muted-foreground)', textTransform: 'uppercase' }}>Last Refined</span>
                      <span style={{ fontWeight: 700, fontSize: '0.925rem' }}>{new Date(app.updatedAt).toLocaleDateString(undefined, { dateStyle: 'long' })}</span>
                    </div>
                  </div>
                </div>
              </section>
            </div>
          </div>
        </div>
      </div>

      {showEdit && (
        <EditAppDialog 
          app={app} 
          open={showEdit} 
          onOpenChange={setShowEdit} 
          onSuccess={() => { setShowEdit(false); onRefresh(); }} 
        />
      )}
    </div>
  );
};
