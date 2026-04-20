import React, { useMemo } from 'react';
import { Edit2, Database, Boxes, ShieldCheck, ChevronLeft, Calendar, Info, Share2, Layers } from 'lucide-react';
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
  capabilityId: string | null;
  onBack: () => void;
  onRefresh: () => void;
}

export const CapabilityDetailsView = ({ capabilityId, onBack, onRefresh }: Props) => {
  const navigate = useNavigate();

  // Fetch all contextual data
  const { data: picklists } = useQuery<any[]>({ queryKey: ['picklists'], queryFn: () => fetch('/api/picklists').then(res => res.json()) });
  const { data: metaDefs } = useQuery<any[]>({ queryKey: ['metadata-definitions'], queryFn: () => fetch('/api/metadata-definitions').then(res => res.json()) });
  
  const { data: allCapabilities } = useQuery<any[]>({ 
    queryKey: ['capabilities'], 
    queryFn: () => fetch('/api/capabilities').then(res => res.json()),
    staleTime: 1000 * 60 * 5, // 5 minutes
  });

  const { data: capability, isLoading } = useQuery<any>({
    queryKey: ['capability', capabilityId],
    queryFn: () => fetch(`/api/capabilities/${capabilityId}`).then(res => res.json()),
    initialData: () => allCapabilities?.find(c => c.id === capabilityId),
    enabled: !!capabilityId && capabilityId !== 'undefined'
  });

  const parent = useMemo(() => allCapabilities?.find(c => c.id === capability?.parentId), [allCapabilities, capability]);
  const children = useMemo(() => allCapabilities?.filter(c => c.parentId === capabilityId) || [], [allCapabilities, capabilityId]);

  if (isLoading || !capability) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', gap: '1rem', opacity: 0.8 }}>
        <div className="loading-logo" style={{ fontSize: '1.5rem' }}>OpenEA</div>
        <div className="loading-text" style={{ fontSize: '0.75rem' }}>Retrieving capability details...</div>
      </div>
    );
  }

  const meta = safeJsonParse(capability.metadata);
  
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
                <h1 style={{ fontSize: '2.25rem', fontWeight: 800, margin: 0, letterSpacing: '-0.03em' }}>{capability.name}</h1>
              </div>
              <p style={{ fontSize: '1.125rem', color: 'var(--foreground)', lineHeight: 1.6, margin: 0, maxWidth: '900px', opacity: 0.8 }}>
                {capability.description || 'No description provided for this business capability.'}
              </p>
              {parent && (
                <div style={{ marginTop: '1.5rem' }}>
                  <span 
                    onClick={() => navigate(`/capabilities/${parent.id}`)}
                    style={{ fontSize: '0.875rem', color: 'var(--muted-foreground)', display: 'inline-flex', alignItems: 'center', gap: '0.4rem', cursor: 'pointer', padding: '0.25rem 0.5rem', borderRadius: '4px' }}
                    className="row-hover"
                  >
                    <Layers size={16} /> Part of <strong>{parent.name}</strong>
                  </span>
                </div>
              )}
            </div>
            <button onClick={() => navigate(`/capabilities/${capability.id}/edit`)} className="primary" style={{ height: '3rem', gap: '0.75rem', padding: '0 1.5rem', fontSize: '1rem', boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1)' }}>
              <Edit2 size={18} /> Edit Capability
            </button>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 350px', gap: '3rem' }}>
            {/* Left Column: Core Strategic Data */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '3rem' }}>
              
              {/* Strategic Assessment */}
              <section>
                <h3 style={{ fontSize: '0.8125rem', fontWeight: 700, textTransform: 'uppercase', color: 'var(--muted-foreground)', marginBottom: '1.5rem', letterSpacing: '0.1em', display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                  <Share2 size={16} /> Strategic Assessment
                </h3>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(1, 1fr)', maxWidth: '400px' }}>
                  {(() => {
                    const info = getPicklistInfo('criticality', capability.criticality);
                    return (
                      <div style={{ padding: '1.5rem', background: 'var(--card)', borderRadius: '16px', border: '1px solid var(--border)', display: 'flex', flexDirection: 'column', alignItems: 'center', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
                        <div style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--muted-foreground)', marginBottom: '0.75rem', textTransform: 'uppercase' }}>Business Criticality</div>
                        <div style={{ fontSize: '1.25rem', fontWeight: 800, color: info.color }}>{info.label}</div>
                        <div style={{ marginTop: '0.75rem', width: '60px', height: '6px', borderRadius: '3px', background: info.color }} />
                      </div>
                    );
                  })()}
                </div>
              </section>

              {/* Supported Applications Section */}
              <section>
                <h3 style={{ fontSize: '0.8125rem', fontWeight: 700, textTransform: 'uppercase', color: 'var(--muted-foreground)', marginBottom: '1.5rem', letterSpacing: '0.1em', display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                  <Database size={16} /> Supporting Applications
                </h3>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '1rem' }}>
                  {capability.applications && capability.applications.length > 0 ? capability.applications.map((app: any) => (
                    <div key={app.id} onClick={() => navigate(`/apps/${app.id}`)} style={{ cursor: 'pointer', padding: '1.25rem', background: 'var(--card)', borderRadius: '12px', border: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }} className="row-hover">
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                        <div style={{ background: 'var(--accent)', padding: '0.4rem', borderRadius: '8px' }}>
                          <Database size={16} />
                        </div>
                        <span style={{ fontWeight: 700 }}>{app.name}</span>
                      </div>
                      <ShieldCheck size={14} style={{ color: 'var(--muted-foreground)', opacity: 0.5 }} />
                    </div>
                  )) : (
                    <div style={{ color: 'var(--muted-foreground)', fontSize: '0.875rem', fontStyle: 'italic', gridColumn: '1 / -1' }}>No applications currently mapped to this capability.</div>
                  )}
                </div>
              </section>

              {/* Sub-Capabilities Section */}
              {children.length > 0 && (
                <section>
                  <h3 style={{ fontSize: '0.8125rem', fontWeight: 700, textTransform: 'uppercase', color: 'var(--muted-foreground)', marginBottom: '1.5rem', letterSpacing: '0.1em', display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                    <Layers size={16} /> Sub-Capabilities
                  </h3>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(250px, 1fr))', gap: '1rem' }}>
                    {children.map(child => (
                      <div key={child.id} onClick={() => navigate(`/capabilities/${child.id}`)} style={{ cursor: 'pointer', padding: '1.25rem', background: 'var(--card)', borderRadius: '12px', border: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: '0.75rem' }} className="row-hover">
                        <Boxes size={16} style={{ color: 'var(--primary)' }} />
                        <span style={{ fontWeight: 700 }}>{child.name}</span>
                      </div>
                    ))}
                  </div>
                </section>
              )}
            </div>

            {/* Right Column */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '2.5rem' }}>
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
                      <span style={{ fontWeight: 700, fontSize: '0.925rem' }}>{capability.createdAt ? new Date(capability.createdAt).toLocaleDateString(undefined, { dateStyle: 'long' }) : '—'}</span>
                    </div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: '1rem' }}>
                    <div style={{ background: 'var(--muted)', padding: '0.5rem', borderRadius: '8px' }}><Info size={18} style={{ opacity: 0.7 }} /></div>
                    <div style={{ display: 'flex', flexDirection: 'column' }}>
                      <span style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--muted-foreground)', textTransform: 'uppercase' }}>Last Refined</span>
                      <span style={{ fontWeight: 700, fontSize: '0.925rem' }}>{capability.updatedAt ? new Date(capability.updatedAt).toLocaleDateString(undefined, { dateStyle: 'long' }) : '—'}</span>
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
