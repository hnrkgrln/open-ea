import React, { useMemo } from 'react';
import { Edit2, Layers, ChevronLeft, Database, Share2, Calendar, Info, User, Boxes } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';

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
    initialData: () => allOrgs?.find(o => o.id === orgId),
    enabled: !!orgId && orgId !== 'undefined'
  });

  const { data: picklists } = useQuery<any[]>({ queryKey: ['picklists'], queryFn: () => fetch('/api/picklists').then(res => res.json()) });

  const parent = useMemo(() => allOrgs?.find(o => o.id === org?.parentId), [allOrgs, org]);
  const children = useMemo(() => allOrgs?.filter(o => o.parentId === orgId) || [], [allOrgs, orgId]);

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
                  <Share2 size={16} /> Owned Information Objects
                </h3>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '1rem' }}>
                  {org.informationObjects && org.informationObjects.length > 0 ? org.informationObjects.map((io: any) => (
                    <div key={io.id} onClick={() => navigate(`/information/${io.id}`)} style={{ cursor: 'pointer', padding: '1.25rem', background: 'var(--card)', borderRadius: '12px', border: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: '0.75rem' }} className="row-hover">
                      <div style={{ background: 'var(--secondary)', padding: '0.4rem', borderRadius: '8px' }}>
                        <Share2 size={16} />
                      </div>
                      <span style={{ fontWeight: 700 }}>{io.name}</span>
                    </div>
                  )) : (
                    <div style={{ color: 'var(--muted-foreground)', fontSize: '0.875rem', fontStyle: 'italic' }}>No information objects currently owned by this role.</div>
                  )}
                </div>
              </section>

              {children.length > 0 && (
                <section>
                  <h3 style={{ fontSize: '0.8125rem', fontWeight: 700, textTransform: 'uppercase', color: 'var(--muted-foreground)', marginBottom: '1.5rem', letterSpacing: '0.1em', display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                    <Layers size={16} /> Child Organizations / Roles
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
        </div>
      </div>
    </div>
  );
};
