import React, { useState } from 'react';
import { Edit2, FileText, ChevronLeft, ShieldCheck, Database, Calendar, Network, ArrowRight } from 'lucide-react';
import { InlineFilter } from './FilterControls';
import { ReferencesList } from './References';
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
  const [flowFilter, setFlowFilter] = useState('');

  const { data: latestInfo } = useQuery<any[]>({
    queryKey: ['information-objects'],
    queryFn: () => fetch('/api/information-objects').then(res => res.json()),
  });

  const { data: item, isLoading } = useQuery<any>({
    queryKey: ['information-object', infoId],
    queryFn: () => fetch(`/api/information-objects/${infoId}`).then(res => res.json()),
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

          <div style={{ marginBottom: '1.75rem', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div style={{ flex: 1 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
                <span style={{ fontSize: '0.6rem', fontWeight: 900, textTransform: 'uppercase', padding: '0.15rem 0.5rem', borderRadius: '4px', background: '#e67700', color: 'white', letterSpacing: '0.05em', display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                  <FileText size={10} /> Information Object
                </span>
              </div>
              <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', marginBottom: '0.75rem' }}>
                <h1 style={{ fontSize: '1.75rem', fontWeight: 800, margin: 0, letterSpacing: '-0.02em' }}>{item.name}</h1>
                {(() => {
                  const typeInfo = getPicklistInfo('information_type', item.type);
                  return (
                    <span style={{ fontSize: '0.7rem', fontWeight: 800, textTransform: 'uppercase', padding: '0.15rem 0.6rem', borderRadius: '6px', background: typeInfo.color !== 'var(--secondary)' ? typeInfo.color : 'var(--secondary)', color: typeInfo.color !== 'var(--secondary)' ? 'white' : 'var(--secondary-foreground)', textShadow: typeInfo.color !== 'var(--secondary)' ? '0 1px 2px rgba(0,0,0,0.3)' : undefined, border: typeInfo.color === 'var(--secondary)' ? '1px solid var(--border)' : 'none' }}>
                      {typeInfo.label || item.type || 'Generic Object'}
                    </span>
                  );
                })()}
              </div>
              <p style={{ fontSize: '1rem', color: 'var(--foreground)', lineHeight: 1.5, margin: 0, maxWidth: '900px', opacity: 0.8 }}>
                {item.description || 'No description provided for this data concept.'}
              </p>
              {item.aliases && (
                <div style={{ display: 'flex', gap: '0.4rem', marginTop: '0.75rem' }}>
                  <span style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--muted-foreground)' }}>ALSO KNOWN AS:</span>
                  <span style={{ fontSize: '0.7rem', color: 'var(--foreground)' }}>{item.aliases}</span>
                </div>
              )}
            </div>
            <button onClick={() => navigate(`/information/${item.id}/edit`)} className="primary" style={{ height: '2.4rem', gap: '0.5rem', padding: '0 1rem', fontSize: '0.9rem', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)' }}>
              <Edit2 size={16} /> Edit Definition
            </button>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 300px', gap: '2rem' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
              
              {/* Compliance & Risk Section */}
              <section>
                <h3 style={{ fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', color: 'var(--muted-foreground)', marginBottom: '1rem', letterSpacing: '0.05em', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <ShieldCheck size={14} /> CIA Model & Compliance Profile
                </h3>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '0.75rem' }}>
                  {[
                    { label: 'Confidentiality', val: item.confidentiality, key: 'cia_scale' },
                    { label: 'Integrity', val: item.integrity, key: 'cia_scale' },
                    { label: 'Availability', val: item.availability, key: 'cia_scale' },
                    { label: 'PII Category', val: item.piiCategory, key: 'pii_category' }
                  ].map(score => {
                    const info = getPicklistInfo(score.key, score.val);
                    return (
                      <div key={score.label} style={{ padding: '1rem', background: 'var(--card)', borderRadius: '12px', border: '1px solid var(--border)', display: 'flex', flexDirection: 'column', alignItems: 'center', boxShadow: '0 1px 2px rgba(0,0,0,0.05)' }}>
                        <div style={{ fontSize: '0.6rem', fontWeight: 700, color: 'var(--muted-foreground)', marginBottom: '0.4rem', textTransform: 'uppercase', textAlign: 'center' }}>{score.label}</div>
                        <div style={{ fontSize: '1rem', fontWeight: 800, display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                            {info.color && <div style={{ width: '6px', height: '6px', borderRadius: '50%', background: info.color }} />}
                            {info.label.split(' - ')[0]}
                        </div>
                        <div style={{ marginTop: '0.4rem', width: '40px', height: '4px', borderRadius: '2px', background: info.color }} />
                        <div style={{ fontSize: '0.55rem', color: 'var(--muted-foreground)', marginTop: '0.3rem', textAlign: 'center' }}>{info.label.split(' - ')[1] || ''}</div>
                      </div>
                    );
                  })}
                </div>
              </section>

              {/* Processing Applications Section */}
              <section>
                <h3 style={{ fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', color: 'var(--muted-foreground)', marginBottom: '1rem', letterSpacing: '0.05em', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <Database size={14} /> Processed by
                </h3>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: '0.75rem' }}>
                  {item.processingApplications && item.processingApplications.length > 0 ? item.processingApplications.map((app: any) => (
                    <div key={app.id} onClick={() => navigate(`/apps/${app.id}`)} style={{ cursor: 'pointer', padding: '0.85rem', background: 'var(--card)', borderRadius: '10px', border: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: '0.6rem' }} className="row-hover">
                      <div style={{ background: 'var(--secondary)', padding: '0.35rem', borderRadius: '6px' }}>
                        <Database size={14} />
                      </div>
                      <span style={{ fontWeight: 700, fontSize: '0.85rem' }}>{app.name}</span>
                    </div>
                  )) : (
                    <div style={{ color: 'var(--muted-foreground)', fontSize: '0.8rem', fontStyle: 'italic' }}>No applications process this information object.</div>
                  )}
                </div>
              </section>

              {/* Integrations Flow Section */}
              <section>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.75rem', marginBottom: '1rem' }}>
                  <h3 style={{ fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', color: 'var(--muted-foreground)', letterSpacing: '0.05em', display: 'flex', alignItems: 'center', gap: '0.5rem', margin: 0 }}>
                    <Network size={14} /> Data Flows (Active Integrations)
                  </h3>
                  {item.integrations && item.integrations.length > 0 && (
                    <InlineFilter value={flowFilter} onChange={setFlowFilter} placeholder="Filter by app or type..." />
                  )}
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                  {(() => {
                    const allIntegrations = item.integrations || [];
                    if (allIntegrations.length === 0) {
                      return <div style={{ color: 'var(--muted-foreground)', fontSize: '0.8rem', fontStyle: 'italic' }}>No active integrations are currently moving this data payload.</div>;
                    }
                    const q = flowFilter.trim().toLowerCase();
                    const filtered = q
                      ? allIntegrations.filter((i: any) => {
                          const src = i.sourceApp?.name?.toLowerCase() || '';
                          const tgt = i.targetApp?.name?.toLowerCase() || '';
                          const pat = (i.pattern || '').toLowerCase();
                          return src.includes(q) || tgt.includes(q) || pat.includes(q);
                        })
                      : allIntegrations;
                    if (filtered.length === 0) {
                      return <div style={{ color: 'var(--muted-foreground)', fontSize: '0.8rem', fontStyle: 'italic' }}>No integrations match "{flowFilter}".</div>;
                    }
                    return filtered.map((i: any) => (
                      <div key={i.id} style={{ padding: '1rem', background: 'var(--card)', borderRadius: '10px', border: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: '1.5rem' }}>
                        <div onClick={() => navigate(`/apps/${i.sourceAppId}`)} style={{ cursor: 'pointer', flex: 1, textAlign: 'right' }} className="row-hover">
                          <div style={{ fontSize: '0.65rem', color: 'var(--muted-foreground)', fontWeight: 600 }}>SOURCE</div>
                          <div style={{ fontWeight: 700, fontSize: '0.9rem' }}>{i.sourceApp?.name}</div>
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.2rem' }}>
                          <ArrowRight size={16} style={{ opacity: 0.3 }} />
                          <span style={{ fontSize: '0.55rem', fontWeight: 800, color: 'var(--primary)', background: 'var(--secondary)', padding: '0.1rem 0.35rem', borderRadius: '4px' }}>{i.pattern || 'API'}</span>
                        </div>
                        <div onClick={() => navigate(`/apps/${i.targetAppId}`)} style={{ cursor: 'pointer', flex: 1 }} className="row-hover">
                          <div style={{ fontSize: '0.65rem', color: 'var(--muted-foreground)', fontWeight: 600 }}>TARGET</div>
                          <div style={{ fontWeight: 700, fontSize: '0.9rem' }}>{i.targetApp?.name}</div>
                        </div>
                      </div>
                    ));
                  })()}
                </div>
              </section>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
              <section>
                <h3 style={{ fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase', color: 'var(--muted-foreground)', marginBottom: '1rem', letterSpacing: '0.05em' }}>Accountability</h3>
                <div style={{ background: 'var(--card)', padding: '1.25rem', borderRadius: '12px', border: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                  <div onClick={() => item.businessOwnerId && navigate(`/organizations/${item.businessOwnerId}`)} style={{ cursor: item.businessOwnerId ? 'pointer' : 'default', display: 'flex', alignItems: 'center', gap: '0.75rem' }} className={item.businessOwnerId ? "row-hover" : ""}>
                    <div style={{ background: 'var(--primary)', color: 'var(--primary-foreground)', padding: '0.4rem', borderRadius: '8px' }}><ShieldCheck size={16} /></div>
                    <div style={{ display: 'flex', flexDirection: 'column' }}>
                      <span style={{ fontSize: '0.65rem', fontWeight: 700, color: 'var(--muted-foreground)', textTransform: 'uppercase' }}>Business Owner</span>
                      <span style={{ fontWeight: 700, fontSize: '0.9rem' }}>{item.businessOwner?.name || 'Unassigned'}</span>
                    </div>
                  </div>
                  <div onClick={() => item.appOwnerId && navigate(`/apps/${item.appOwnerId}`)} style={{ cursor: item.appOwnerId ? 'pointer' : 'default', display: 'flex', alignItems: 'center', gap: '0.75rem' }} className={item.appOwnerId ? "row-hover" : ""}>
                    <div style={{ background: 'var(--secondary)', color: 'var(--secondary-foreground)', padding: '0.4rem', borderRadius: '8px' }}><Database size={16} /></div>
                    <div style={{ display: 'flex', flexDirection: 'column' }}>
                      <span style={{ fontSize: '0.65rem', fontWeight: 700, color: 'var(--muted-foreground)', textTransform: 'uppercase' }}>Source of Truth</span>
                      <span style={{ fontWeight: 700, fontSize: '0.9rem' }}>{item.appOwner?.name || 'Unknown'}</span>
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
                      <span style={{ fontSize: '0.65rem', fontWeight: 700, color: 'var(--muted-foreground)', textTransform: 'uppercase' }}>Conceptualized</span>
                      <span style={{ fontWeight: 700, fontSize: '0.85rem' }}>{item.createdAt ? item.createdAt.split('T')[0] : '—'}</span>
                    </div>
                  </div>
                </div>
              </section>
            </div>
          </div>

          <ReferencesList raw={item.references} />
        </div>
      </div>
    </div>
  );
};
