import React, { useMemo } from 'react';
import { Edit2, Database, Boxes, ShieldCheck, ChevronLeft, Calendar, Info, Share2, Layers } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
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
    enabled: !!capabilityId && capabilityId !== 'undefined'
  });

  const parent = useMemo(() => allCapabilities?.find(c => c.id === capability?.parentId), [allCapabilities, capability]);
  const children = useMemo(() => allCapabilities?.filter(c => c.parentId === capabilityId) || [], [allCapabilities, capabilityId]);

  // Roll up applications from sub-capabilities (recursive). Each app appears
  // once: if it's both directly linked AND comes via a sub-capability, "direct"
  // wins. For inherited apps, record the nearest sub-capability that provides
  // them so we can show a "via X" hint.
  const supportingApps = useMemo(() => {
    if (!capability) return [];
    type Entry = { app: any; isDirect: boolean; viaCapName?: string };
    const byId = new Map<string, Entry>();

    // Direct apps first so they win on dedupe.
    for (const a of (capability.applications || [])) {
      byId.set(a.id, { app: a, isDirect: true });
    }

    // Recurse through descendants. We track the *immediate* sub-capability
    // under this capability so the "via" label is meaningful (rather than
    // pointing at some deeply-nested grandchild).
    const walk = (parentId: string, viaCapName: string) => {
      const descendants = (allCapabilities || []).filter(c => c.parentId === parentId);
      for (const d of descendants) {
        for (const a of (d.applications || [])) {
          if (!byId.has(a.id)) {
            byId.set(a.id, { app: a, isDirect: false, viaCapName });
          }
        }
        walk(d.id, viaCapName);
      }
    };
    for (const child of (allCapabilities || []).filter(c => c.parentId === capability.id)) {
      // Each immediate child contributes its sub-tree under its own name.
      for (const a of (child.applications || [])) {
        if (!byId.has(a.id)) byId.set(a.id, { app: a, isDirect: false, viaCapName: child.name });
      }
      walk(child.id, child.name);
    }

    return Array.from(byId.values()).sort((a, b) =>
      a.app.name.localeCompare(b.app.name, undefined, { numeric: true })
    );
  }, [allCapabilities, capability]);

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

  const getEffectiveCapabilityCriticality = (nodeId: string): number => {
    const node = allCapabilities?.find(c => c.id === nodeId);
    if (!node) return 1;
    const local = Number(node.criticality || 1);
    const nodeChildren = allCapabilities?.filter(c => c.parentId === nodeId) || [];
    const childMax = nodeChildren.length > 0 
      ? Math.max(...nodeChildren.map(c => getEffectiveCapabilityCriticality(c.id)))
      : 0;
    return Math.max(local, childMax);
  };

  const effectiveCritValue = String(getEffectiveCapabilityCriticality(capabilityId!));
  const isInherited = effectiveCritValue !== capability.criticality && children.length > 0;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: 'var(--background)' }}>
      <div style={{ flex: 1, overflowY: 'auto' }}>
        <div className="main-container" style={{ padding: '2rem 1.25rem 4rem 1.25rem', maxWidth: '1400px', position: 'relative' }}>
          <button 
            onClick={onBack} 
            style={{ 
              position: 'absolute', top: '2rem', left: '-0.75rem', // Floats slightly to the left of the container
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
                <span style={{ fontSize: '0.6rem', fontWeight: 900, textTransform: 'uppercase', padding: '0.15rem 0.5rem', borderRadius: '4px', background: '#7048e8', color: 'white', letterSpacing: '0.05em', display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                  <Boxes size={10} /> Capability
                </span>
              </div>
              <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', marginBottom: '0.75rem' }}>
                <h1 style={{ fontSize: '1.75rem', fontWeight: 800, margin: 0, letterSpacing: '-0.02em' }}>{capability.name}</h1>
              </div>
              <p style={{ fontSize: '1rem', color: 'var(--foreground)', lineHeight: 1.5, margin: 0, maxWidth: '900px', opacity: 0.8 }}>
                {capability.description || 'No description provided for this business capability.'}
              </p>
              {parent && (
                <div style={{ marginTop: '1rem' }}>
                  <span 
                    onClick={() => navigate(`/capabilities/${parent.id}`)}
                    style={{ fontSize: '0.8rem', color: 'var(--muted-foreground)', display: 'inline-flex', alignItems: 'center', gap: '0.3rem', cursor: 'pointer', padding: '0.2rem 0.4rem', borderRadius: '4px' }}
                    className="row-hover"
                  >
                    <Layers size={14} /> Part of <strong>{parent.name}</strong>
                  </span>
                </div>
              )}
            </div>
            <button onClick={() => navigate(`/capabilities/${capability.id}/edit`)} className="primary" style={{ height: '2.4rem', gap: '0.5rem', padding: '0 1rem', fontSize: '0.9rem', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)' }}>
              <Edit2 size={16} /> Edit Capability
            </button>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 300px', gap: '2rem' }}>
            {/* Left Column: Core Strategic Data */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
              
              {/* Strategic Assessment */}
              <section>
                <h3 style={{ fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', color: 'var(--muted-foreground)', marginBottom: '1rem', letterSpacing: '0.05em', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <Share2 size={14} /> Strategic Assessment
                </h3>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(1, 1fr)', maxWidth: '400px' }}>
                  {(() => {
                    const info = getPicklistInfo('criticality', effectiveCritValue);
                    return (
                      <div style={{ padding: '1rem', background: 'var(--card)', borderRadius: '12px', border: isInherited ? `2px dashed ${info.color}` : '1px solid var(--border)', display: 'flex', flexDirection: 'column', alignItems: 'center', boxShadow: '0 1px 2px rgba(0,0,0,0.05)' }}>
                        <div style={{ fontSize: '0.6rem', fontWeight: 600, color: 'var(--muted-foreground)', marginBottom: '0.5rem', textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                          Business Criticality
                          {isInherited && <span style={{ fontSize: '0.55rem', background: info.color, color: 'white', padding: '0.1rem 0.35rem', borderRadius: '4px' }}>INHERITED</span>}
                        </div>
                        <div style={{ fontSize: '1.1rem', fontWeight: 800, display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                            {info.color && <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: info.color }} />}
                            {info.label}
                        </div>
                        <div style={{ marginTop: '0.5rem', width: '40px', height: '4px', borderRadius: '2px', background: info.color }} />
                        {isInherited && <div style={{ fontSize: '0.6rem', color: 'var(--muted-foreground)', marginTop: '0.4rem', fontStyle: 'italic' }}>Value inherited from the highest-rated sub-capability.</div>}
                      </div>
                    );
                  })()}
                </div>
              </section>

              {/* Supported Applications Section */}
              <section>
                <h3 style={{ fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', color: 'var(--muted-foreground)', marginBottom: '1rem', letterSpacing: '0.05em', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <Database size={14} /> Supporting Applications
                  <span style={{ fontSize: '0.65rem', fontWeight: 600, color: 'var(--muted-foreground)', textTransform: 'none', letterSpacing: 0, marginLeft: '0.5rem' }}>
                    {supportingApps.length} total
                    {children.length > 0 && supportingApps.some(s => !s.isDirect) && ' · includes apps from sub-capabilities'}
                  </span>
                </h3>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: '0.75rem' }}>
                  {supportingApps.length > 0 ? supportingApps.map(({ app, isDirect, viaCapName }) => (
                    <div key={app.id} onClick={() => navigate(`/apps/${app.id}`)} style={{ cursor: 'pointer', padding: '0.85rem', background: 'var(--card)', borderRadius: '10px', border: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.6rem' }} className="row-hover">
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', minWidth: 0 }}>
                        <div style={{ background: 'var(--accent)', padding: '0.35rem', borderRadius: '8px', flexShrink: 0 }}>
                          <Database size={14} />
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
                          <span style={{ fontWeight: 700, fontSize: '0.85rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{app.name}</span>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                            {app.ownerOrg && (
                              <span style={{ fontSize: '0.65rem', color: 'var(--primary)', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: '0.2rem' }}>
                                <Layers size={10} /> {app.ownerOrg.name}
                              </span>
                            )}
                            {!isDirect && viaCapName && (
                              <span style={{ fontSize: '0.65rem', color: 'var(--muted-foreground)', fontStyle: 'italic', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={`Inherited from sub-capability: ${viaCapName}`}>
                                {app.ownerOrg && ' • '}via {viaCapName}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                      <ShieldCheck size={12} style={{ color: 'var(--muted-foreground)', opacity: 0.5, flexShrink: 0 }} />
                    </div>
                  )) : (
                    <div style={{ color: 'var(--muted-foreground)', fontSize: '0.8rem', fontStyle: 'italic', gridColumn: '1 / -1' }}>No applications currently mapped to this capability.</div>
                  )}
                </div>
              </section>

              {/* Sub-Capabilities Section */}
              {children.length > 0 && (
                <section>
                  <h3 style={{ fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', color: 'var(--muted-foreground)', marginBottom: '1rem', letterSpacing: '0.05em', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <Layers size={14} /> Sub-Capabilities
                  </h3>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '0.75rem' }}>
                    {children.map(child => {
                      const childInfo = getPicklistInfo('criticality', child.criticality);
                      const childHasOwnChildren = (allCapabilities || []).some(c => c.parentId === child.id);
                      return (
                        <div
                          key={child.id}
                          onClick={() => navigate(`/capabilities/${child.id}`)}
                          style={{
                            cursor: 'pointer',
                            padding: '0.85rem',
                            background: 'var(--card)',
                            borderRadius: '10px',
                            border: '1px solid var(--border)',
                            borderLeft: `4px solid ${childInfo.color || 'var(--border)'}`,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            gap: '0.6rem'
                          }}
                          className="row-hover"
                        >
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', minWidth: 0 }}>
                            <Boxes size={14} style={{ color: 'var(--primary)', flexShrink: 0 }} />
                            <span style={{ fontWeight: 700, fontSize: '0.85rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{child.name}</span>
                          </div>
                          <span
                            title={childHasOwnChildren ? 'Inherited from sub-capability' : 'Direct capability attribute'}
                            style={{
                              flexShrink: 0,
                              fontSize: '0.6rem',
                              fontWeight: 800,
                              textTransform: 'uppercase',
                              padding: '0.1rem 0.4rem',
                              borderRadius: '4px',
                              background: `${childInfo.color}20`,
                              color: childInfo.color,
                              border: childHasOwnChildren ? `1px dashed ${childInfo.color}` : `1px solid ${childInfo.color}40`
                            }}
                          >
                            {childInfo.label}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </section>
              )}
            </div>

            {/* Right Column */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
              {/* Dynamic Metadata Section */}
              {Object.keys(meta).length > 0 && (
                <section>
                  <h3 style={{ fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase', color: 'var(--muted-foreground)', marginBottom: '1rem', letterSpacing: '0.05em' }}>Extended Attributes</h3>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                    {Object.entries(meta).map(([key, val]: [string, any]) => {
                      const def = metaDefs?.find(d => d.fieldName === key);
                      return (
                        <div key={key} style={{ background: 'var(--card)', padding: '1rem', borderRadius: '10px', border: '1px solid var(--border)', boxShadow: '0 1px 2px rgba(0,0,0,0.05)' }}>
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
                      <span style={{ fontSize: '0.65rem', fontWeight: 700, color: 'var(--muted-foreground)', textTransform: 'uppercase' }}>System Creation</span>
                      <span style={{ fontWeight: 700, fontSize: '0.85rem' }}>{capability.createdAt ? new Date(capability.createdAt).toLocaleDateString(undefined, { dateStyle: 'long' }) : '—'}</span>
                    </div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.75rem' }}>
                    <div style={{ background: 'var(--muted)', padding: '0.4rem', borderRadius: '8px' }}><Info size={16} style={{ opacity: 0.7 }} /></div>
                    <div style={{ display: 'flex', flexDirection: 'column' }}>
                      <span style={{ fontSize: '0.65rem', fontWeight: 700, color: 'var(--muted-foreground)', textTransform: 'uppercase' }}>Last Refined</span>
                      <span style={{ fontWeight: 700, fontSize: '0.85rem' }}>{capability.updatedAt ? new Date(capability.updatedAt).toLocaleDateString(undefined, { dateStyle: 'long' }) : '—'}</span>
                    </div>
                  </div>
                </div>
              </section>
            </div>
          </div>

          <ReferencesList raw={capability.references} />
        </div>
      </div>
    </div>
  );
};
