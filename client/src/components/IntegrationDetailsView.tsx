import React, { useMemo } from 'react';
import { Edit2, Network, ChevronLeft, Database, Share2, Calendar, Info, ArrowRight, ArrowLeft, Activity, Tag } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';

interface Props {
  integrationId: string | null;
  onBack: () => void;
  onRefresh: () => void;
}

export const IntegrationDetailsView = ({ integrationId, onBack, onRefresh }: Props) => {
  const navigate = useNavigate();

  const { data: allIntegrations } = useQuery<any[]>({ 
    queryKey: ['integrations'], 
    queryFn: () => fetch('/api/integrations').then(res => res.json())
  });

  const { data: i, isLoading } = useQuery<any>({
    queryKey: ['integration', integrationId],
    queryFn: () => fetch(`/api/integrations/${integrationId}`).then(res => res.json()),
    initialData: () => allIntegrations?.find(int => int.id === integrationId),
    enabled: !!integrationId && integrationId !== 'undefined'
  });

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
              <p style={{ fontSize: '1.125rem', color: 'var(--foreground)', lineHeight: 1.6, margin: 0, maxWidth: '900px', opacity: 0.8 }}>
                System-to-system data exchange via {i.pattern || 'standard interface'}.
              </p>
            </div>
            <button onClick={() => navigate(`/integrations/${i.id}/edit`)} className="primary" style={{ height: '3rem', gap: '0.75rem', padding: '0 1.5rem', fontSize: '1rem', boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1)' }}>
              <Edit2 size={18} /> Edit Integration
            </button>
          </div>

          {/* Integration Visual Flow */}
          <div style={{ background: 'var(--card)', padding: '3rem', borderRadius: '24px', border: '1px solid var(--border)', marginBottom: '3rem', display: 'flex', alignItems: 'center', justifyContent: 'space-around', position: 'relative', overflow: 'hidden' }}>
            <div onClick={() => navigate(`/apps/${i.sourceAppId}`)} style={{ cursor: 'pointer', zIndex: 1, textAlign: 'center', flex: 1, maxWidth: '280px' }} className="row-hover">
              <div style={{ width: '64px', height: '64px', borderRadius: '16px', background: 'var(--secondary)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 1rem' }}>
                <Database size={32} />
              </div>
              <div style={{ fontWeight: 800, fontSize: '1.125rem' }}>{i.sourceApp?.name}</div>
              <div style={{ fontSize: '0.7rem', color: 'var(--muted-foreground)', textTransform: 'uppercase', fontWeight: 700 }}>Source System</div>
            </div>

            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1rem', position: 'relative' }}>
              <div style={{ position: 'absolute', width: '100%', height: '2px', background: 'var(--border)', top: '32px', left: 0, zIndex: 0 }} />
              <div onClick={() => i.infoObjectId && navigate(`/information/${i.infoObjectId}`)} style={{ cursor: i.infoObjectId ? 'pointer' : 'default', zIndex: 1, background: 'var(--card)', padding: '1.125rem 2rem', borderRadius: '16px', border: '2px solid var(--primary)', textAlign: 'center', minWidth: '200px' }} className={i.infoObjectId ? "row-hover" : ""}>
                <div style={{ fontSize: '0.7rem', color: 'var(--muted-foreground)', textTransform: 'uppercase', fontWeight: 800, marginBottom: '0.25rem' }}>Data Payload</div>
                <div style={{ fontWeight: 800, color: 'var(--foreground)', fontSize: '1rem' }}>{i.payload?.name || 'Undefined Information Object'}</div>
                <div style={{ display: 'flex', justifyContent: 'center', gap: '0.35rem', marginTop: '0.6rem', flexWrap: 'wrap' }}>
                  <span style={{ fontSize: '0.6rem', fontWeight: 800, background: 'var(--secondary)', padding: '0.15rem 0.5rem', borderRadius: '4px', textTransform: 'uppercase' }}>{i.pattern || 'API'}</span>
                  {i.crud?.split(',').filter(Boolean).map(op => (
                    <span key={op} style={{ fontSize: '0.6rem', fontWeight: 800, background: 'var(--primary)', color: 'var(--primary-foreground)', padding: '0.15rem 0.5rem', borderRadius: '4px', textTransform: 'uppercase' }}>{op}</span>
                  ))}
                </div>
              </div>
              <div style={{ zIndex: 1, fontSize: '0.75rem', fontWeight: 700, color: 'var(--muted-foreground)', background: 'var(--background)', padding: '0.2rem 0.75rem', borderRadius: '20px' }}>
                <Activity size={12} style={{ marginRight: '0.4rem' }} /> {i.frequency || 'Real-time'}
              </div>
            </div>

            <div onClick={() => navigate(`/apps/${i.targetAppId}`)} style={{ cursor: 'pointer', zIndex: 1, textAlign: 'center', flex: 1, maxWidth: '280px' }} className="row-hover">
              <div style={{ width: '64px', height: '64px', borderRadius: '16px', background: 'var(--secondary)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 1rem' }}>
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
                  <div style={{ fontSize: '1rem', fontWeight: 700 }}>{i.pattern || '—'}</div>
                </div>
                <div>
                  <div style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--muted-foreground)', textTransform: 'uppercase', marginBottom: '0.5rem' }}>Frequency</div>
                  <div style={{ fontSize: '1rem', fontWeight: 700 }}>{i.frequency || '—'}</div>
                </div>
                <div style={{ gridColumn: 'span 2' }}>
                  <div style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--muted-foreground)', textTransform: 'uppercase', marginBottom: '0.5rem' }}>CRUD Operations</div>
                  <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                    {i.crud?.split(',').filter(Boolean).map(op => (
                      <span key={op} style={{ fontSize: '0.875rem', fontWeight: 800, background: 'var(--primary)', color: 'var(--primary-foreground)', padding: '0.25rem 0.75rem', borderRadius: '6px', textTransform: 'uppercase' }}>{op}</span>
                    )) || '—'}
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
                    <span style={{ fontWeight: 700, fontSize: '0.925rem' }}>{i.createdAt ? new Date(i.createdAt).toLocaleDateString(undefined, { dateStyle: 'long' }) : '—'}</span>
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: '1rem' }}>
                  <div style={{ background: 'var(--muted)', padding: '0.5rem', borderRadius: '8px' }}><Info size={18} style={{ opacity: 0.7 }} /></div>
                  <div style={{ display: 'flex', flexDirection: 'column' }}>
                    <span style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--muted-foreground)', textTransform: 'uppercase' }}>Last Updated</span>
                    <span style={{ fontWeight: 700, fontSize: '0.925rem' }}>{i.updatedAt ? new Date(i.updatedAt).toLocaleDateString(undefined, { dateStyle: 'long' }) : '—'}</span>
                  </div>
                </div>
              </div>
            </section>
          </div>
        </div>
      </div>
    </div>
  );
};
