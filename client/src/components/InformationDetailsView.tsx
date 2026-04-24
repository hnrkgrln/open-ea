import React, { useMemo } from 'react';
import { Edit2, Share2, ChevronLeft, ShieldCheck, Database, Calendar, Info, Network, ArrowRight } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';

const safeJsonParse = (str: string | null | undefined, fallback: any = {}) => {
  if (!str) return fallback;
  try {
    return JSON.parse(str);
  } catch (e) {
    return fallback;
  }
};

interface Props {
  infoId: string | null;
  onBack: () => void;
  onRefresh: () => void;
}

export const InformationDetailsView = ({ infoId, onBack, onRefresh }: Props) => {
  const navigate = useNavigate();

  const { data: latestInfo } = useQuery<any[]>({ 
    queryKey: ['information-objects'], 
    queryFn: () => fetch('/api/information-objects').then(res => res.json()),
    staleTime: 1000 * 60 * 5,
  });

  const { data: item, isLoading } = useQuery<any>({
    queryKey: ['information-object', infoId],
    queryFn: () => fetch(`/api/information-objects/${infoId}`).then(res => res.json()),
    initialData: () => latestInfo?.find(i => i.id === infoId),
    enabled: !!infoId && infoId !== 'undefined'
  });

  const { data: picklists } = useQuery<any[]>({ queryKey: ['picklists'], queryFn: () => fetch('/api/picklists').then(res => res.json()) });
  const { data: metaDefs } = useQuery<any[]>({ queryKey: ['metadata-definitions'], queryFn: () => fetch('/api/metadata-definitions').then(res => res.json()) });

  if (isLoading || !item) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', gap: '1rem', opacity: 0.8 }}>
        <div className="loading-logo" style={{ fontSize: '1.5rem' }}>OpenEA</div>
        <div className="loading-text" style={{ fontSize: '0.75rem' }}>Retrieving data concept details...</div>
      </div>
    );
  }

  const meta = safeJsonParse(item.metadata);
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

          <div style={{ marginBottom: '2.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div style={{ flex: 1 }}>
              <div style={{ display: 'flex', gap: '1rem', alignItems: 'center', marginBottom: '1rem' }}>
                <h1 style={{ fontSize: '2.25rem', fontWeight: 800, margin: 0, letterSpacing: '-0.03em' }}>{item.name}</h1>
                <span style={{ fontSize: '0.75rem', fontWeight: 800, textTransform: 'uppercase', padding: '0.2rem 0.75rem', borderRadius: '6px', background: 'var(--primary)', color: 'var(--primary-foreground)' }}>
                  {item.type || 'Information Object'}
                </span>
              </div>
              <p style={{ fontSize: '1.125rem', color: 'var(--foreground)', lineHeight: 1.6, margin: 0, maxWidth: '900px', opacity: 0.8 }}>
                {item.description || 'No description provided for this data concept.'}
              </p>
              {item.aliases && (
                <div style={{ display: 'flex', gap: '0.5rem', marginTop: '1rem' }}>
                  <span style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--muted-foreground)' }}>ALSO KNOWN AS:</span>
                  <span style={{ fontSize: '0.75rem', color: 'var(--foreground)' }}>{item.aliases}</span>
                </div>
              )}
            </div>
            <button onClick={() => navigate(`/information/${item.id}/edit`)} className="primary" style={{ height: '3rem', gap: '0.75rem', padding: '0 1.5rem', fontSize: '1rem', boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1)' }}>
              <Edit2 size={18} /> Edit Definition
            </button>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 350px', gap: '3rem' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '3rem' }}>
              
              {/* Compliance & Risk Section */}
              <section>
                <h3 style={{ fontSize: '0.8125rem', fontWeight: 700, textTransform: 'uppercase', color: 'var(--muted-foreground)', marginBottom: '1.5rem', letterSpacing: '0.1em', display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                  <ShieldCheck size={16} /> CIA Model & Compliance Profile
                </h3>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '1rem' }}>
                  {[
                    { label: 'Confidentiality', val: item.confidentiality, key: 'cia_scale' },
                    { label: 'Integrity', val: item.integrity, key: 'cia_scale' },
                    { label: 'Availability', val: item.availability, key: 'cia_scale' },
                    { label: 'PII Category', val: item.piiCategory, key: 'pii_category' }
                  ].map(score => {
                    const info = getPicklistInfo(score.key, score.val);
                    return (
                      <div key={score.label} style={{ padding: '1.25rem', background: 'var(--card)', borderRadius: '16px', border: '1px solid var(--border)', display: 'flex', flexDirection: 'column', alignItems: 'center', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
                        <div style={{ fontSize: '0.65rem', fontWeight: 700, color: 'var(--muted-foreground)', marginBottom: '0.5rem', textTransform: 'uppercase', textAlign: 'center' }}>{score.label}</div>
                        <div style={{ fontSize: '1.125rem', fontWeight: 800, color: info.color }}>{info.label.split(' - ')[0]}</div>
                        <div style={{ marginTop: '0.5rem', width: '40px', height: '4px', borderRadius: '2px', background: info.color }} />
                        <div style={{ fontSize: '0.6rem', color: 'var(--muted-foreground)', marginTop: '0.4rem' }}>{info.label.split(' - ')[1] || ''}</div>
                      </div>
                    );
                  })}
                </div>
              </section>

              {/* Integrations Flow Section */}
              <section>
                <h3 style={{ fontSize: '0.8125rem', fontWeight: 700, textTransform: 'uppercase', color: 'var(--muted-foreground)', marginBottom: '1.5rem', letterSpacing: '0.1em', display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                  <Network size={16} /> Data Flows (Active Integrations)
                </h3>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                  {item.integrations && item.integrations.length > 0 ? item.integrations.map((i: any) => (
                    <div key={i.id} style={{ padding: '1.25rem', background: 'var(--card)', borderRadius: '12px', border: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: '2rem' }}>
                      <div onClick={() => navigate(`/apps/${i.sourceAppId}`)} style={{ cursor: 'pointer', flex: 1, textAlign: 'right' }} className="row-hover">
                        <div style={{ fontSize: '0.7rem', color: 'var(--muted-foreground)', fontWeight: 600 }}>SOURCE</div>
                        <div style={{ fontWeight: 700 }}>{i.sourceApp?.name}</div>
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.25rem' }}>
                        <ArrowRight size={20} style={{ opacity: 0.3 }} />
                        <span style={{ fontSize: '0.6rem', fontWeight: 800, color: 'var(--primary)', background: 'var(--secondary)', padding: '0.1rem 0.4rem', borderRadius: '4px' }}>{i.pattern || 'API'}</span>
                      </div>
                      <div onClick={() => navigate(`/apps/${i.targetAppId}`)} style={{ cursor: 'pointer', flex: 1 }} className="row-hover">
                        <div style={{ fontSize: '0.7rem', color: 'var(--muted-foreground)', fontWeight: 600 }}>TARGET</div>
                        <div style={{ fontWeight: 700 }}>{i.targetApp?.name}</div>
                      </div>
                    </div>
                  )) : (
                    <div style={{ color: 'var(--muted-foreground)', fontSize: '0.875rem', fontStyle: 'italic' }}>No active integrations are currently moving this data payload.</div>
                  )}
                </div>
              </section>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '2.5rem' }}>
              <section>
                <h3 style={{ fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', color: 'var(--muted-foreground)', marginBottom: '1.25rem', letterSpacing: '0.05em' }}>Accountability</h3>
                <div style={{ background: 'var(--card)', padding: '1.5rem', borderRadius: '16px', border: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                  <div onClick={() => item.businessOwnerId && navigate(`/organizations/${item.businessOwnerId}`)} style={{ cursor: item.businessOwnerId ? 'pointer' : 'default', display: 'flex', alignItems: 'center', gap: '1rem' }} className={item.businessOwnerId ? "row-hover" : ""}>
                    <div style={{ background: 'var(--primary)', color: 'var(--primary-foreground)', padding: '0.5rem', borderRadius: '8px' }}><ShieldCheck size={18} /></div>
                    <div style={{ display: 'flex', flexDirection: 'column' }}>
                      <span style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--muted-foreground)', textTransform: 'uppercase' }}>Business Owner</span>
                      <span style={{ fontWeight: 700 }}>{item.businessOwner?.name || 'Unassigned'}</span>
                    </div>
                  </div>
                  <div onClick={() => item.appOwnerId && navigate(`/apps/${item.appOwnerId}`)} style={{ cursor: item.appOwnerId ? 'pointer' : 'default', display: 'flex', alignItems: 'center', gap: '1rem' }} className={item.appOwnerId ? "row-hover" : ""}>
                    <div style={{ background: 'var(--secondary)', color: 'var(--secondary-foreground)', padding: '0.5rem', borderRadius: '8px' }}><Database size={18} /></div>
                    <div style={{ display: 'flex', flexDirection: 'column' }}>
                      <span style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--muted-foreground)', textTransform: 'uppercase' }}>Source of Truth</span>
                      <span style={{ fontWeight: 700 }}>{item.appOwner?.name || 'Unknown'}</span>
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
                      <span style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--muted-foreground)', textTransform: 'uppercase' }}>Conceptualized</span>
                      <span style={{ fontWeight: 700, fontSize: '0.925rem' }}>{item.createdAt ? new Date(item.createdAt).toLocaleDateString(undefined, { dateStyle: 'long' }) : '—'}</span>
                    </div>
                  </div>
                </div>
              </section>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
