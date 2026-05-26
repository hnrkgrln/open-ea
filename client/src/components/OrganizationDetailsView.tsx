import React, { useMemo } from 'react';
import { Edit2, Layers, ChevronLeft, FileText, Calendar, Info, Database } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { ReferencesList } from './References';

interface Props {
  orgId: string | null;
  onBack: () => void;
  onRefresh: () => void;
}

export const OrganizationDetailsView = ({ orgId, onBack, onRefresh }: Props) => {
  const navigate = useNavigate();

  const { data: allOrgs, isLoading: isAllLoading } = useQuery<any[]>({ 
    queryKey: ['organizations'], 
    queryFn: () => fetch('/api/organizations').then(res => res.json())
  });

  const { data: org, isLoading } = useQuery<any>({
    queryKey: ['organization', orgId],
    queryFn: () => fetch(`/api/organizations/${orgId}`).then(res => res.json()),
    enabled: !!orgId && orgId !== 'undefined'
  });

  const { data: picklists } = useQuery<any[]>({ queryKey: ['picklists'], queryFn: () => fetch('/api/picklists').then(res => res.json()) });

  const parent = useMemo(() => allOrgs?.find(o => o.id === org?.parentId), [allOrgs, org]);
  const children = useMemo(() => allOrgs?.filter(o => o.parentId === orgId) || [], [allOrgs, orgId]);

  // Recursively collect all descendant organization IDs
  const getDescendantIds = (parentId: string): string[] => {
    if (!allOrgs) return [];
    const childIds = allOrgs.filter(o => o.parentId === parentId).map(o => o.id);
    let allIds = [...childIds];
    for (const id of childIds) {
      allIds = [...allIds, ...getDescendantIds(id)];
    }
    return allIds;
  };

  // Roll up applications and information objects from sub-organizations (recursive).
  const rolledUpApps = useMemo(() => {
    if (!org || !allOrgs) return [];
    type Entry = { app: any; isDirect: boolean; viaOrgName?: string };
    const byId = new Map<string, Entry>();

    // 1. Direct apps first
    if (org.ownedApplications) {
      org.ownedApplications.forEach((a: any) => byId.set(a.id, { app: a, isDirect: true }));
    }

    // 2. Walk descendants
    const walk = (parentId: string, topChildName: string) => {
      const children = allOrgs.filter(o => o.parentId === parentId);
      for (const child of children) {
        if (child.ownedApplications) {
          child.ownedApplications.forEach((a: any) => {
            if (!byId.has(a.id)) {
              byId.set(a.id, { app: a, isDirect: false, viaOrgName: topChildName });
            }
          });
        }
        walk(child.id, topChildName);
      }
    };
    
    const immediateChildren = allOrgs.filter(o => o.parentId === org.id);
    for (const child of immediateChildren) {
      if (child.ownedApplications) {
        child.ownedApplications.forEach((a: any) => {
          if (!byId.has(a.id)) byId.set(a.id, { app: a, isDirect: false, viaOrgName: child.name });
        });
      }
      walk(child.id, child.name);
    }
    
    return Array.from(byId.values()).sort((a, b) =>
      a.app.name.localeCompare(b.app.name, undefined, { numeric: true })
    );
  }, [allOrgs, org]);

  const rolledUpInfo = useMemo(() => {
    if (!org || !allOrgs) return [];
    type Entry = { io: any; isDirect: boolean; viaOrgName?: string };
    const byId = new Map<string, Entry>();

    // 1. Direct info first
    if (org.informationObjects) {
      org.informationObjects.forEach((io: any) => byId.set(io.id, { io, isDirect: true }));
    }

    // 2. Walk descendants
    const walk = (parentId: string, topChildName: string) => {
      const children = allOrgs.filter(o => o.parentId === parentId);
      for (const child of children) {
        if (child.informationObjects) {
          child.informationObjects.forEach((io: any) => {
            if (!byId.has(io.id)) {
              byId.set(io.id, { io, isDirect: false, viaOrgName: topChildName });
            }
          });
        }
        walk(child.id, topChildName);
      }
    };

    const immediateChildren = allOrgs.filter(o => o.parentId === org.id);
    for (const child of immediateChildren) {
      if (child.informationObjects) {
        child.informationObjects.forEach((io: any) => {
          if (!byId.has(io.id)) byId.set(io.id, { io, isDirect: false, viaOrgName: child.name });
        });
      }
      walk(child.id, child.name);
    }

    return Array.from(byId.values()).sort((a, b) =>
      a.io.name.localeCompare(b.io.name, undefined, { numeric: true })
    );
  }, [allOrgs, org]);

  if (isLoading || !org) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', gap: '1rem', opacity: 0.8 }}>
        <div className="loading-logo" style={{ fontSize: '1.5rem' }}>OpenEA</div>
        <div className="loading-text" style={{ fontSize: '0.75rem' }}>Retrieving organization details...</div>
      </div>
    );
  }

  const getPicklistInfo = (picklistName: string, value: string) => {
    const list = picklists?.find(p => p.name === picklistName);
    const option = list?.options?.find((o: any) => o.value === String(value));
    return option || { label: value || '—', color: 'var(--secondary)' };
  };

  const orgTypeInfo = org.type ? getPicklistInfo('organization_type', org.type) : null;

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
                <span style={{ fontSize: '0.65rem', fontWeight: 900, textTransform: 'uppercase', padding: '0.2rem 0.6rem', borderRadius: '4px', background: '#0b7285', color: 'white', letterSpacing: '0.05em', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                  <Layers size={12} /> Organization Unit
                </span>
              </div>
              <div style={{ display: 'flex', gap: '1rem', alignItems: 'center', marginBottom: '1rem' }}>
                <h1 style={{ fontSize: '2.25rem', fontWeight: 800, margin: 0, letterSpacing: '-0.03em' }}>{org.name}</h1>
                {orgTypeInfo && (
                  <span style={{ fontSize: '0.75rem', fontWeight: 800, textTransform: 'uppercase', padding: '0.2rem 0.75rem', borderRadius: '6px', background: orgTypeInfo.color !== 'var(--secondary)' ? orgTypeInfo.color : 'var(--primary)', color: orgTypeInfo.color !== 'var(--secondary)' ? 'white' : 'var(--primary-foreground)', textShadow: orgTypeInfo.color !== 'var(--secondary)' ? '0 1px 2px rgba(0,0,0,0.3)' : undefined }}>
                    {orgTypeInfo.label}
                  </span>
                )}
              </div>
              <p style={{ fontSize: '1.125rem', color: 'var(--foreground)', lineHeight: 1.6, margin: 0, maxWidth: '900px', opacity: 0.8 }}>
                {org.description || 'No description provided for this organization artifact.'}
              </p>
              {parent && (
                <div style={{ marginTop: '1.5rem' }}>
                  <span 
                    onClick={() => navigate(`/organizations/${parent.id}`)}
                    style={{ fontSize: '0.875rem', color: 'var(--muted-foreground)', display: 'inline-flex', alignItems: 'center', gap: '0.4rem', cursor: 'pointer', padding: '0.25rem 0.5rem', borderRadius: '4px' }}
                    className="row-hover"
                  >
                    <Layers size={16} /> Reports to <strong>{parent.name}</strong>
                  </span>
                </div>
              )}
            </div>
            <button onClick={() => navigate(`/organizations/${org.id}/edit`)} className="primary" style={{ height: '3rem', gap: '0.75rem', padding: '0 1.5rem', fontSize: '1rem', boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1)' }}>
              <Edit2 size={18} /> Edit Organization
            </button>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 350px', gap: '3rem' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '3rem' }}>
              
              <section>
                <h3 style={{ fontSize: '0.8125rem', fontWeight: 700, textTransform: 'uppercase', color: 'var(--muted-foreground)', marginBottom: '1.5rem', letterSpacing: '0.1em', display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                  <Database size={16} /> Owned Applications
                </h3>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '1rem' }}>
                  {rolledUpApps.length > 0 ? rolledUpApps.map(({ app, isDirect, viaOrgName }) => (
                    <div key={app.id} onClick={() => navigate(`/apps/${app.id}`)} style={{ cursor: 'pointer', padding: '1.25rem', background: 'var(--card)', borderRadius: '12px', border: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: '0.5rem' }} className="row-hover">
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                        <div style={{ background: 'var(--secondary)', padding: '0.4rem', borderRadius: '8px' }}>
                          <Database size={16} />
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column' }}>
                            <span style={{ fontWeight: 700 }}>{app.name}</span>
                            {!isDirect && viaOrgName && <span style={{ fontSize: '0.65rem', color: 'var(--muted-foreground)', fontStyle: 'italic' }}>via {viaOrgName}</span>}
                        </div>
                      </div>
                    </div>
                  )) : (
                    <div style={{ color: 'var(--muted-foreground)', fontSize: '0.875rem', fontStyle: 'italic' }}>No applications currently owned by this organization.</div>
                  )}
                </div>
              </section>

              <section>
                <h3 style={{ fontSize: '0.8125rem', fontWeight: 700, textTransform: 'uppercase', color: 'var(--muted-foreground)', marginBottom: '1.5rem', letterSpacing: '0.1em', display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                  <FileText size={16} /> Owned Information Objects
                </h3>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '1rem' }}>
                  {rolledUpInfo.length > 0 ? rolledUpInfo.map(({ io, isDirect, viaOrgName }) => {
                    const piiInfo = getPicklistInfo('pii_category', io.piiCategory || '1');
                    const confInfo = getPicklistInfo('cia_scale', io.confidentiality || '1');
                    const integInfo = getPicklistInfo('cia_scale', io.integrity || '1');
                    const availInfo = getPicklistInfo('cia_scale', io.availability || '1');

                    return (
                    <div key={io.id} onClick={() => navigate(`/information/${io.id}`)} style={{ cursor: 'pointer', padding: '1.25rem', background: 'var(--card)', borderRadius: '12px', border: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: '1rem' }} className="row-hover">
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                        <div style={{ background: 'var(--secondary)', padding: '0.4rem', borderRadius: '8px' }}>
                          <FileText size={16} />
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column' }}>
                            <span style={{ fontWeight: 700 }}>{io.name}</span>
                            {!isDirect && viaOrgName && <span style={{ fontSize: '0.65rem', color: 'var(--muted-foreground)', fontStyle: 'italic' }}>via {viaOrgName}</span>}
                        </div>
                      </div>

                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem' }}>
                        <span title={`Confidentiality: ${confInfo.label}`} style={{ fontSize: '0.6rem', fontWeight: 900, textTransform: 'uppercase', padding: '0.15rem 0.5rem', borderRadius: '4px', background: confInfo.color, color: 'white' }}>
                          C: {confInfo.label.split(' - ')[0]}
                        </span>
                        <span title={`Integrity: ${integInfo.label}`} style={{ fontSize: '0.6rem', fontWeight: 900, textTransform: 'uppercase', padding: '0.15rem 0.5rem', borderRadius: '4px', background: integInfo.color, color: 'white' }}>
                          I: {integInfo.label.split(' - ')[0]}
                        </span>
                        <span title={`Availability: ${availInfo.label}`} style={{ fontSize: '0.6rem', fontWeight: 900, textTransform: 'uppercase', padding: '0.15rem 0.5rem', borderRadius: '4px', background: availInfo.color, color: 'white' }}>
                          A: {availInfo.label.split(' - ')[0]}
                        </span>
                        <span title={`PII Category: ${piiInfo.label}`} style={{ fontSize: '0.6rem', fontWeight: 900, textTransform: 'uppercase', padding: '0.15rem 0.5rem', borderRadius: '4px', background: piiInfo.color, color: 'white' }}>
                          PII: {piiInfo.label.split(' - ')[0]}
                        </span>
                      </div>
                    </div>
                  )}) : (
                    <div style={{ color: 'var(--muted-foreground)', fontSize: '0.875rem', fontStyle: 'italic' }}>No information objects currently owned by this organization.</div>
                  )}
                </div>
              </section>

              {children.length > 0 && (
                <section>
                  <h3 style={{ fontSize: '0.8125rem', fontWeight: 700, textTransform: 'uppercase', color: 'var(--muted-foreground)', marginBottom: '1.5rem', letterSpacing: '0.1em', display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                    <Layers size={16} /> Child Organizations
                  </h3>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(250px, 1fr))', gap: '1rem' }}>
                    {children.map(child => (
                      <div key={child.id} onClick={() => navigate(`/organizations/${child.id}`)} style={{ cursor: 'pointer', padding: '1.25rem', background: 'var(--card)', borderRadius: '12px', border: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: '0.75rem' }} className="row-hover">
                        <Layers size={16} style={{ color: 'var(--primary)' }} />
                        <span style={{ fontWeight: 700 }}>{child.name}</span>
                      </div>
                    ))}
                  </div>
                </section>
              )}
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '2.5rem' }}>
              <section>
                <h3 style={{ fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', color: 'var(--muted-foreground)', marginBottom: '1.25rem', letterSpacing: '0.05em' }}>Audit Trail</h3>
                <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem', padding: '1.5rem' }}>
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: '1rem' }}>
                    <div style={{ background: 'var(--muted)', padding: '0.5rem', borderRadius: '8px' }}><Calendar size={18} style={{ opacity: 0.7 }} /></div>
                    <div style={{ display: 'flex', flexDirection: 'column' }}>
                      <span style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--muted-foreground)', textTransform: 'uppercase' }}>System Creation</span>
                      <span style={{ fontWeight: 700, fontSize: '0.925rem' }}>{org.createdAt ? org.createdAt.split('T')[0] : '—'}</span>
                    </div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: '1rem' }}>
                    <div style={{ background: 'var(--muted)', padding: '0.5rem', borderRadius: '8px' }}><Info size={18} style={{ opacity: 0.7 }} /></div>
                    <div style={{ display: 'flex', flexDirection: 'column' }}>
                      <span style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--muted-foreground)', textTransform: 'uppercase' }}>Last Refined</span>
                      <span style={{ fontWeight: 700, fontSize: '0.925rem' }}>{org.updatedAt ? org.updatedAt.split('T')[0] : '—'}</span>
                    </div>
                  </div>
                </div>
              </section>
            </div>
          </div>

          <ReferencesList raw={org.references} />
        </div>
      </div>
    </div>
  );
};
