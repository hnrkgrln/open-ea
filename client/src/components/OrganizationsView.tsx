import React, { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Layers, Plus, PlusCircle, List, Trash2, Edit2, ChevronRight, GitBranch } from 'lucide-react';
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
}

const getPicklistInfo = (picklists: any[] | undefined, picklistName: string, value: string | undefined) => {
  if (!value) return null;
  const list = picklists?.find(p => p.name === picklistName);
  const option = list?.options?.find((o: any) => o.value === String(value));
  return option || { label: value, color: 'var(--secondary)' };
};

const OrgListRow = ({ node, picklists, onRefresh, depth = 0 }: { node: Organization, picklists: any[], onRefresh: () => void, depth?: number }) => {
  const navigate = useNavigate();
  const hasChildren = node.children && node.children.length > 0;
  const typeInfo = getPicklistInfo(picklists, 'organization_type', node.type);

  return (
    <>
      <tr key={node.id} className="row-hover" style={{ borderBottom: '1px solid var(--border)' }}>
        <td style={{ padding: '1rem', fontSize: '0.875rem', fontWeight: 600, paddingLeft: `${1 + depth * 2}rem` }}>
          <div onClick={() => navigate(`/organizations/${node.id}`)} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
            {depth > 0 && <ChevronRight size={14} style={{ color: 'var(--muted-foreground)' }} />}
            <Layers size={14} style={{ color: 'var(--muted-foreground)' }} />
            {node.name}
          </div>
        </td>
        <td style={{ padding: '1rem', width: '120px' }}>
          <div style={{ display: 'flex', gap: '0.25rem' }}>
            <button onClick={() => navigate(`/organizations/new?parentId=${node.id}`)} className="secondary" style={{ height: '2rem', padding: '0 0.6rem' }} title="Add Sub-organization"><Plus size={14} /></button>
            <button onClick={() => navigate(`/organizations/${node.id}/edit`)} className="secondary" style={{ height: '2rem', width: '2rem', padding: 0 }}><Edit2 size={14} /></button>
            <button onClick={async () => { if(confirm('Delete?')) { await fetch(`/api/organizations/${node.id}`, {method: 'DELETE'}); onRefresh(); } }} className="secondary" style={{ height: '2rem', width: '2rem', padding: 0, color: 'var(--destructive)' }}><Trash2 size={14} /></button>
          </div>
        </td>
        <td style={{ padding: '1rem' }}>
          <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--muted-foreground)', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
            {typeInfo?.color && typeInfo.color !== 'var(--secondary)' && <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: typeInfo.color }} />}
            {typeInfo?.label || '—'}
          </span>
        </td>
        <td style={{ padding: '1rem', fontSize: '0.875rem', color: 'var(--muted-foreground)' }}>
          {node.description || '—'}
        </td>
      </tr>
      {hasChildren && node.children!.map(child => (
        <OrgListRow key={child.id} node={child} picklists={picklists} onRefresh={onRefresh} depth={depth + 1} />
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
      <div style={{ marginBottom: '2.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', flexShrink: 0 }}>
        <div>
          <h1 style={{ fontSize: '1.875rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '0.75rem' }}><Layers size={32} /> Organizations</h1>
          <p style={{ color: 'var(--muted-foreground)' }}>Accountable divisions, departments and teams. Showing <strong>{organizations?.length || 0}</strong> artifacts.</p>
        </div>
        <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
          <div style={{ display: 'flex', background: 'var(--secondary)', padding: '0.25rem', borderRadius: 'var(--radius)', gap: '0.25rem' }}>
            <button onClick={() => setViewMode('tree')} title="Diagram view" style={{ height: '2rem', padding: '0 0.75rem', border: 'none', background: viewMode === 'tree' ? 'var(--background)' : 'transparent', boxShadow: viewMode === 'tree' ? '0 1px 2px rgba(0,0,0,0.1)' : 'none', cursor: 'pointer' }}><GitBranch size={16} /></button>
            <button onClick={() => setViewMode('list')} title="Table view" style={{ height: '2rem', padding: '0 0.75rem', border: 'none', background: viewMode === 'list' ? 'var(--background)' : 'transparent', boxShadow: viewMode === 'list' ? '0 1px 2px rgba(0,0,0,0.1)' : 'none', cursor: 'pointer' }}><List size={16} /></button>
          </div>
          <button onClick={() => navigate('/organizations/new')} className="primary" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <PlusCircle size={18} />
            New Organization
          </button>
        </div>
      </div>

      {viewMode === 'list' && (
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border)', background: 'var(--muted)' }}>
                <th style={{ padding: '1rem', fontSize: '0.875rem' }}>Organization</th>
                <th style={{ padding: '1rem', fontSize: '0.875rem', width: '120px' }}>Actions</th>
                <th style={{ padding: '1rem', fontSize: '0.875rem' }}>Type</th>
                <th style={{ padding: '1rem', fontSize: '0.875rem' }}>Description</th>
              </tr>
            </thead>
            <tbody>
              {orgTree.map(org => (
                <OrgListRow key={org.id} node={org} picklists={picklists || []} onRefresh={onRefresh} />
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
          <div className="card" style={{ padding: '3rem', textAlign: 'center', color: 'var(--muted-foreground)', fontStyle: 'italic' }}>No organizations defined.</div>
        )
      )}
    </div>
  );
};
