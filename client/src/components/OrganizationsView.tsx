import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Layers, PlusCircle, LayoutGrid, List, Search, Download, Trash2, Edit2, ChevronRight, Boxes } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { useLocalStorage } from '../App'; // Need to export useLocalStorage from App.tsx or duplicate

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

const OrgNode = ({ node, picklists, onRefresh, depth = 0 }: { node: Organization, picklists: any[], onRefresh: () => void, depth?: number }) => {
  const navigate = useNavigate();
  const hasChildren = node.children && node.children.length > 0;
  const typeInfo = getPicklistInfo(picklists, 'organization_type', node.type);

  return (
    <div className={depth === 0 ? "" : "nested-node"} style={{ width: '100%' }}>
      <div className="card" style={{ 
        padding: '1.25rem', 
        display: 'flex', 
        flexDirection: 'column', 
        gap: '1rem', 
        borderLeft: `4px solid var(--primary)`,
        background: depth % 2 === 0 ? 'var(--card)' : 'rgba(0,0,0,0.02)',
        height: '100%',
        boxShadow: depth === 0 ? '0 4px 6px -1px rgba(0, 0, 0, 0.1)' : 'none'
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem', alignItems: 'center' }}>
            <span 
              onClick={() => navigate(`/organizations/${node.id}`)}
              style={{ fontWeight: 800, fontSize: depth === 0 ? '1.125rem' : '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}
            >
              <Layers size={depth === 0 ? 20 : 16} style={{ color: 'var(--muted-foreground)' }} /> {node.name}
            </span>
            {typeInfo && (
              <span style={{ fontSize: '0.65rem', fontWeight: 800, textTransform: 'uppercase', padding: '0.15rem 0.6rem', borderRadius: '4px', background: typeInfo.color !== 'var(--secondary)' ? typeInfo.color : 'var(--secondary)', color: typeInfo.color !== 'var(--secondary)' ? 'white' : 'var(--secondary-foreground)', textShadow: typeInfo.color !== 'var(--secondary)' ? '0 1px 2px rgba(0,0,0,0.3)' : undefined, border: typeInfo.color === 'var(--secondary)' ? '1px solid var(--border)' : 'none' }}>
                {typeInfo.label}
              </span>
            )}
          </div>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <button onClick={() => navigate(`/organizations/${node.id}/edit`)} className="secondary" style={{ height: '2rem', width: '2rem', padding: 0 }}><Edit2 size={14} /></button>
            <button onClick={async () => { if(confirm('Delete organization?')) { await fetch(`/api/organizations/${node.id}`, {method: 'DELETE'}); onRefresh(); } }} className="secondary" style={{ height: '2rem', width: '2rem', padding: 0, color: 'var(--destructive)' }}><Trash2 size={14} /></button>
          </div>
        </div>
        
        {node.description && <p style={{ fontSize: '0.875rem', color: 'var(--muted-foreground)', margin: 0, maxWidth: '800px' }}>{node.description}</p>}

        {hasChildren && (
          <div style={{ 
            marginTop: '0.5rem', 
            paddingLeft: '1rem', 
            borderLeft: '1px dashed var(--border)',
            display: 'flex',
            flexDirection: 'column',
            gap: '1rem'
          }}>
            {node.children!.map(child => (
              <OrgNode key={child.id} node={child} picklists={picklists} onRefresh={onRefresh} depth={depth + 1} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
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
  const [viewMode, setViewMode] = useLocalStorage<'grid' | 'list'>('openea_organizations_view', 'grid');
  const { data: picklists } = useQuery<any[]>({ queryKey: ['picklists'], queryFn: () => fetch('/api/picklists').then(res => res.json()) });

  const orgTree = React.useMemo(() => {
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

  return (
    <div>
      <div style={{ marginBottom: '2.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
        <div>
          <h1 style={{ fontSize: '1.875rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '0.75rem' }}><Layers size={32} /> Organizations & Roles</h1>
          <p style={{ color: 'var(--muted-foreground)' }}>Accountable departments and roles. Showing <strong>{organizations?.length || 0}</strong> artifacts.</p>
        </div>
        <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
          <div style={{ display: 'flex', background: 'var(--secondary)', padding: '0.25rem', borderRadius: 'var(--radius)', gap: '0.25rem' }}>
            <button onClick={() => setViewMode('grid')} style={{ height: '2rem', padding: '0 0.75rem', border: 'none', background: viewMode === 'grid' ? 'var(--background)' : 'transparent', boxShadow: viewMode === 'grid' ? '0 1px 2px rgba(0,0,0,0.1)' : 'none', cursor: 'pointer' }}><LayoutGrid size={16} /></button>
            <button onClick={() => setViewMode('list')} style={{ height: '2rem', padding: '0 0.75rem', border: 'none', background: viewMode === 'list' ? 'var(--background)' : 'transparent', boxShadow: viewMode === 'list' ? '0 1px 2px rgba(0,0,0,0.1)' : 'none', cursor: 'pointer' }}><List size={16} /></button>
          </div>
          <button onClick={() => navigate('/organizations/new')} className="primary" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <PlusCircle size={18} />
            New Organization
          </button>
        </div>
      </div>

      {viewMode === 'grid' ? (
        <div className="masonry-grid">
          {orgTree.map(org => (
            <div key={org.id} className="masonry-item">
              <OrgNode node={org} picklists={picklists || []} onRefresh={onRefresh} />
            </div>
          ))}
        </div>
      ) : (
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border)', background: 'var(--muted)' }}>
                <th style={{ padding: '1rem', fontSize: '0.875rem' }}>Organization / Role</th>
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
    </div>
  );
};
