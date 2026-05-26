import React, { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Layers, Plus, PlusCircle, List, Trash2, Edit2, ChevronRight, GitBranch, Database, FileText } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { useLocalStorage } from '../App'; // Need to export useLocalStorage from App.tsx or duplicate
import { OrganizationDiagram } from './OrganizationDiagram';

interface Organization {
  id: string;
  name: string;
  description?: string;
  type?: string;
  parentId?: string | null;
  children?: Organization[];
  ownedApplications?: any[];
  informationObjects?: any[];
  _count?: {
    ownedApplications: number;
    informationObjects: number;
  };
}

const getPicklistInfo = (picklists: any[] | undefined, picklistName: string, value: string | undefined) => {
  if (!value) return null;
  const list = picklists?.find(p => p.name === picklistName);
  const option = list?.options?.find((o: any) => o.value === String(value));
  return option || { label: value, color: 'var(--secondary)' };
};

const OrgListRow = ({ node, organizations, picklists, onRefresh, depth = 0 }: { node: Organization, organizations: Organization[], picklists: any[], onRefresh: () => void, depth?: number }) => {
  const navigate = useNavigate();
  const hasChildren = node.children && node.children.length > 0;
  const typeInfo = getPicklistInfo(picklists, 'organization_type', node.type);

  const getRecursiveCounts = (orgId: string): { apps: number; info: number } => {
    const org = organizations.find(o => o.id === orgId);
    const directApps = org?.ownedApplications?.length || 0;
    const directInfo = org?.informationObjects?.length || 0;
    
    let totalApps = directApps;
    let totalInfo = directInfo;
    
    const children = organizations.filter(o => o.parentId === orgId);
    for (const child of children) {
      const sub = getRecursiveCounts(child.id);
      totalApps += sub.apps;
      totalInfo += sub.info;
    }
    
    return { apps: totalApps, info: totalInfo };
  };

  const recursive = useMemo(() => getRecursiveCounts(node.id), [node.id, organizations]);

  return (
    <>
      <tr key={node.id} className="row-hover" style={{ borderBottom: '1px solid var(--border)' }}>
        <td style={{ padding: '0.6rem 1rem', fontSize: '0.75rem', fontWeight: 600, paddingLeft: `${0.75 + depth * 1.5}rem` }}>
          <div onClick={() => navigate(`/organizations/${node.id}`)} style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', cursor: 'pointer' }}>
            {depth > 0 && <ChevronRight size={12} style={{ color: 'var(--muted-foreground)' }} />}
            <Layers size={12} style={{ color: 'var(--muted-foreground)' }} />
            {node.name}
          </div>
        </td>
        <td style={{ padding: '0.6rem 1rem', width: '110px' }}>
          <div style={{ display: 'flex', gap: '0.2rem' }}>
            <button onClick={() => navigate(`/organizations/new?parentId=${node.id}`)} className="secondary" style={{ height: '1.6rem', padding: '0 0.5rem' }} title="Add Sub-organization"><Plus size={12} /></button>
            <button onClick={() => navigate(`/organizations/${node.id}/edit`)} className="secondary" style={{ height: '1.6rem', width: '1.6rem', padding: 0 }}><Edit2 size={12} /></button>
            <button onClick={async () => { if(confirm('Delete?')) { await fetch(`/api/organizations/${node.id}`, {method: 'DELETE'}); onRefresh(); } }} className="secondary" style={{ height: '1.6rem', width: '1.6rem', padding: 0, color: 'var(--destructive)' }}><Trash2 size={12} /></button>
          </div>
        </td>
        <td style={{ padding: '0.6rem 1rem' }}>
          <span style={{ fontSize: '0.7rem', fontWeight: 600, color: 'var(--muted-foreground)', display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
            {typeInfo?.color && typeInfo.color !== 'var(--secondary)' && <div style={{ width: '6px', height: '6px', borderRadius: '50%', background: typeInfo.color }} />}
            {typeInfo?.label || '—'}
          </span>
        </td>
        <td style={{ padding: '0.6rem 1rem', fontSize: '0.75rem' }}>
          {recursive.apps > 0 ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', color: 'var(--primary)', fontWeight: 700 }}>
              <Database size={12} /> {recursive.apps}
            </div>
          ) : <span style={{ opacity: 0.3 }}>—</span>}
        </td>
        <td style={{ padding: '0.6rem 1rem', fontSize: '0.75rem' }}>
          {recursive.info > 0 ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', color: 'var(--primary)', fontWeight: 700 }}>
              <FileText size={12} /> {recursive.info}
            </div>
          ) : <span style={{ opacity: 0.3 }}>—</span>}
        </td>
        <td style={{ padding: '0.6rem 1rem', fontSize: '0.75rem', color: 'var(--muted-foreground)' }}>
          {node.description || '—'}
        </td>
      </tr>
      {hasChildren && node.children!.map(child => (
        <OrgListRow key={child.id} node={child} organizations={organizations} picklists={picklists} onRefresh={onRefresh} depth={depth + 1} />
      ))}
    </>
  );
};

export const OrganizationsView = ({ organizations, onRefresh }: { organizations: Organization[], onRefresh: () => void }) => {
  const navigate = useNavigate();
  // Tree (diagram) is the default. Stored values from older sessions ('grid')
  // are normalized to 'tree' so existing users land in the new default view.
  const [storedView, setViewMode] = useLocalStorage<string>('openea_organizations_view', 'tree');
  const viewMode: 'list' | 'tree' = storedView === 'list' ? 'list' : 'tree';
  const { data: picklists } = useQuery<any[]>({ queryKey: ['picklists'], queryFn: () => fetch('/api/picklists').then(res => res.json()) });

  const orgTree = useMemo(() => {
    if (!Array.isArray(organizations)) return [];
    const map = new Map<string, Organization>();
    const roots: Organization[] = [];
    organizations.forEach(org => map.set(org.id, { ...org, children: [] }));
    map.forEach(org => {
      const parentId = org.parentId === '' ? null : org.parentId;
      if (parentId && map.has(parentId)) map.get(parentId)!.children!.push(org);
      else roots.push(org);
    });
    return roots;
  }, [organizations]);

  // In diagram mode, the page becomes a flex column so the canvas can claim
  // all remaining vertical space below the page header. Other modes flow
  // naturally so long lists/grids scroll within the main container as before.
  const isDiagram = viewMode === 'tree';

  return (
    <div style={isDiagram ? { display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 } : undefined}>
      <div style={{ marginBottom: '1.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', flexShrink: 0 }}>
        <div>
          <h1 style={{ fontSize: '1.25rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '0.6rem' }}><Layers size={24} /> Organizations</h1>
          <p style={{ color: 'var(--muted-foreground)', fontSize: '0.8rem' }}>Accountable divisions, departments and teams. Showing <strong>{organizations?.length || 0}</strong> artifacts.</p>
        </div>
        <div style={{ display: 'flex', gap: '0.65rem', alignItems: 'center' }}>
          <div style={{ display: 'flex', background: 'var(--secondary)', padding: '0.15rem', borderRadius: 'var(--radius)', gap: '0.15rem' }}>
            <button onClick={() => setViewMode('tree')} title="Diagram view" style={{ height: '1.8rem', padding: '0 0.6rem', border: 'none', background: viewMode === 'tree' ? 'var(--background)' : 'transparent', boxShadow: viewMode === 'tree' ? '0 1px 2px rgba(0,0,0,0.1)' : 'none', cursor: 'pointer' }}><GitBranch size={14} /></button>
            <button onClick={() => setViewMode('list')} title="Table view" style={{ height: '1.8rem', padding: '0 0.6rem', border: 'none', background: viewMode === 'list' ? 'var(--background)' : 'transparent', boxShadow: viewMode === 'list' ? '0 1px 2px rgba(0,0,0,0.1)' : 'none', cursor: 'pointer' }}><List size={14} /></button>
          </div>
          <button onClick={() => navigate('/organizations/new')} className="primary" style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', height: '1.8rem', fontSize: '0.8rem' }}>
            <PlusCircle size={14} />
            New Organization
          </button>
        </div>
      </div>

      {viewMode === 'list' && (
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border)', background: 'var(--muted)' }}>
                <th style={{ padding: '0.6rem 1rem', fontSize: '0.75rem' }}>Organization</th>
                <th style={{ padding: '0.6rem 1rem', fontSize: '0.75rem', width: '110px' }}>Actions</th>
                <th style={{ padding: '0.6rem 1rem', fontSize: '0.75rem' }}>Type</th>
                <th style={{ padding: '0.6rem 1rem', fontSize: '0.75rem' }}>Apps</th>
                <th style={{ padding: '0.6rem 1rem', fontSize: '0.75rem' }}>Info Objects</th>
                <th style={{ padding: '0.6rem 1rem', fontSize: '0.75rem' }}>Description</th>
              </tr>
            </thead>
            <tbody>
              {orgTree.map(org => (
                <OrgListRow key={org.id} node={org} organizations={organizations} picklists={picklists || []} onRefresh={onRefresh} />
              ))}
            </tbody>
          </table>
        </div>
      )}

      {viewMode === 'tree' && (
        organizations && organizations.length > 0 ? (
          <div style={{ flex: 1, minHeight: 0, display: 'flex' }}>
            <OrganizationDiagram organizations={organizations} picklists={picklists || []} />
          </div>
        ) : (
          <div className="card" style={{ padding: '2rem', textAlign: 'center', color: 'var(--muted-foreground)', fontStyle: 'italic', fontSize: '0.8rem' }}>No organizations defined.</div>
        )
      )}
    </div>
  );
};
