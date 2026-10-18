import React, { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Layers, Plus, PlusCircle, List, Trash2, Edit2, ChevronRight, GitBranch, Database, FileText, Filter, X } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { useLocalStorage } from '../App'; // Need to export useLocalStorage from App.tsx or duplicate
import { OrganizationDiagram } from './OrganizationDiagram';
import { FilterDot, MultiSelect, SearchInput } from './FilterControls';

interface Organization {
  id: string;
  name: string;
  description?: string;
  type?: string;
  parentId?: string | null;
  children?: Organization[];
  ownedApplications?: any[];
  informationObjects?: any[];
  supportedCapabilities?: { id: string; name: string }[];
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

const EMPTY_ORG_FILTERS = { search: '', type: [] as string[], parentId: [] as string[] };

export const OrganizationsView = ({ organizations, onRefresh }: { organizations: Organization[], onRefresh: () => void }) => {
  const navigate = useNavigate();
  // Tree (diagram) is the default. Stored values from older sessions ('grid')
  // are normalized to 'tree' so existing users land in the new default view.
  const [storedView, setViewMode] = useLocalStorage<string>('openea_organizations_view', 'tree');
  const viewMode: 'list' | 'tree' = storedView === 'list' ? 'list' : 'tree';
  const [filters, setFilters] = useLocalStorage('openea_organizations_filters', EMPTY_ORG_FILTERS);
  const { data: picklists } = useQuery<any[]>({ queryKey: ['picklists'], queryFn: () => fetch('/api/picklists').then(res => res.json()) });

  const orgList = useMemo(() => Array.isArray(organizations) ? organizations : [], [organizations]);

  const typeLabel = (value?: string | null) => {
    if (!value) return '';
    const option = picklists?.find((list: any) => list.name === 'organization_type')?.options?.find((item: any) => String(item.value) === String(value));
    return option?.label || value;
  };

  const typeOptions = useMemo(() => {
    const fromPicklist = (picklists?.find((list: any) => list.name === 'organization_type')?.options || [])
      .map((option: any) => ({ value: String(option.value), label: option.label || String(option.value) }));
    const known = new Set(fromPicklist.map((option: { value: string }) => option.value));
    const extras = new Set<string>();
    for (const org of orgList) {
      if (org.type && !known.has(org.type)) extras.add(org.type);
    }
    return [
      ...fromPicklist,
      ...[...extras].sort((a, b) => a.localeCompare(b)).map((value) => ({ value, label: value })),
    ];
  }, [picklists, orgList]);

  const parentOptions = useMemo(() => {
    const ids = new Set(orgList.map((org) => org.id));
    const byParent = new Map<string | null, Organization[]>();
    for (const org of orgList) {
      const parent = org.parentId && org.parentId !== org.id && ids.has(org.parentId) ? org.parentId : null;
      const list = byParent.get(parent) ?? [];
      list.push(org);
      byParent.set(parent, list);
    }
    for (const list of byParent.values()) list.sort((a, b) => a.name.localeCompare(b.name));
    const options: { value: string; label: string }[] = [];
    const seen = new Set<string>();
    const walk = (parentId: string | null, depth: number) => {
      for (const org of byParent.get(parentId) ?? []) {
        if (seen.has(org.id)) continue;
        seen.add(org.id);
        const kind = typeLabel(org.type);
        options.push({
          value: org.id,
          label: `${depth > 0 ? `${'– '.repeat(depth)}` : ''}${org.name}${kind ? ` · ${kind}` : ''}`,
        });
        walk(org.id, depth + 1);
      }
    };
    walk(null, 0);
    return options;
  }, [orgList, picklists]);

  const visibleOrgs = useMemo(() => {
    const ids = new Set(orgList.map((org) => org.id));
    const byId = new Map(orgList.map((org) => [org.id, org]));
    const children = new Map<string, Organization[]>();
    for (const org of orgList) {
      const parent = org.parentId && org.parentId !== org.id && ids.has(org.parentId) ? org.parentId : '';
      const list = children.get(parent) ?? [];
      list.push(org);
      children.set(parent, list);
    }
    const selectedParents = new Set(filters.parentId || []);
    const inParentScope = (orgId: string) => {
      if (selectedParents.size === 0) return true;
      const seen = new Set<string>();
      let current: string | undefined = orgId;
      while (current && !seen.has(current)) {
        if (selectedParents.has(current)) return true;
        seen.add(current);
        const parent = byId.get(current)?.parentId;
        current = parent && ids.has(parent) && parent !== current ? parent : undefined;
      }
      return false;
    };
    const typeOk = (org: Organization) => {
      const selected = filters.type || [];
      if (selected.length === 0) return true;
      const value = org.type || '';
      return selected.includes(value) || selected.includes(value.toLowerCase());
    };
    const needle = (filters.search || '').trim().toLowerCase();
    const textOf = (org: Organization) => [
      org.name,
      org.description,
      org.type,
      typeLabel(org.type),
      ...(org.ownedApplications || []).map((app: any) => app?.name),
      ...(org.informationObjects || []).map((item: any) => item?.name),
      ...(org.supportedCapabilities || []).map((capability) => capability?.name),
    ].filter(Boolean).join(' ').toLowerCase();

    const direct = new Set<string>();
    for (const org of orgList) {
      if (!inParentScope(org.id) || !typeOk(org)) continue;
      if (needle && !textOf(org).includes(needle)) continue;
      direct.add(org.id);
    }
    const visible = new Set(direct);
    // A text match keeps the units under it, still limited by Type and Part of.
    if (needle) {
      const walk = (orgId: string, seen: Set<string>) => {
        for (const child of children.get(orgId) ?? []) {
          if (seen.has(child.id)) continue;
          seen.add(child.id);
          if (inParentScope(child.id) && typeOk(child)) visible.add(child.id);
          walk(child.id, seen);
        }
      };
      for (const orgId of direct) walk(orgId, new Set([orgId]));
    }
    for (const orgId of [...visible]) {
      const seen = new Set<string>();
      let parent = byId.get(orgId)?.parentId;
      while (parent && ids.has(parent) && !seen.has(parent)) {
        seen.add(parent);
        visible.add(parent);
        parent = byId.get(parent)?.parentId;
      }
    }
    return orgList.filter((org) => visible.has(org.id));
  }, [orgList, filters, picklists]);

  const orgTree = useMemo(() => {
    const map = new Map<string, Organization>();
    const roots: Organization[] = [];
    visibleOrgs.forEach(org => map.set(org.id, { ...org, children: [] }));
    map.forEach(org => {
      const parentId = org.parentId === '' ? null : org.parentId;
      if (parentId && map.has(parentId)) map.get(parentId)!.children!.push(org);
      else roots.push(org);
    });
    return roots;
  }, [visibleOrgs]);

  const isPanelFilterActive = (filters.type?.length || 0) > 0 || (filters.parentId?.length || 0) > 0;
  const [showFilters, setShowFilters] = useState(isPanelFilterActive);
  const filtersActive = isPanelFilterActive || (filters.search || '').trim().length > 0;
  const clearFilters = () => setFilters(EMPTY_ORG_FILTERS);

  // In diagram mode, the page becomes a flex column so the canvas can claim
  // all remaining vertical space below the page header. Other modes flow
  // naturally so long lists/grids scroll within the main container as before.
  const isDiagram = viewMode === 'tree';

  return (
    <div style={isDiagram ? { display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 } : undefined}>
      <div style={{ marginBottom: '1.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', flexShrink: 0 }}>
        <div>
          <h1 style={{ fontSize: '1.25rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '0.6rem' }}><Layers size={24} /> Organizations</h1>
          <p style={{ color: 'var(--muted-foreground)', fontSize: '0.8rem' }}>
            Accountable divisions, departments and teams. Showing <strong>{visibleOrgs.length}</strong>{filtersActive ? <> of <strong>{orgList.length}</strong></> : null} organizations.
          </p>
        </div>
        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
          <div style={{ width: '220px' }}>
            <SearchInput
              value={filters.search || ''}
              onChange={(val) => setFilters({ ...filters, search: val })}
              placeholder="Quick filter"
              ariaLabel="Quick filter"
              style={{ height: '2.2rem', fontSize: '0.9rem' }}
            />
          </div>
          <button
            onClick={() => setShowFilters(!showFilters)}
            aria-expanded={showFilters}
            aria-label={isPanelFilterActive ? 'Filters, applied' : 'Filters'}
            style={{ position: 'relative', height: '2.2rem', padding: isPanelFilterActive ? '0 1.15rem 0 0.6rem' : '0 0.6rem', border: `1px solid ${isPanelFilterActive ? 'var(--brand-focus)' : 'var(--border)'}`, background: showFilters ? 'var(--accent)' : 'var(--background)', fontSize: '0.9rem' }}
          >
            <Filter size={16} style={{ marginRight: '0.4rem', color: isPanelFilterActive ? 'var(--brand-focus)' : undefined }} />
            Filters
            {isPanelFilterActive && <FilterDot badge />}
          </button>
          <div style={{ display: 'flex', background: 'var(--secondary)', padding: '0.15rem', borderRadius: 'var(--radius)', gap: '0.15rem' }}>
            <button onClick={() => setViewMode('tree')} title="Diagram view" style={{ height: '2.2rem', padding: '0 0.6rem', border: 'none', background: viewMode === 'tree' ? 'var(--background)' : 'transparent', boxShadow: viewMode === 'tree' ? '0 1px 2px rgba(0,0,0,0.1)' : 'none', cursor: 'pointer' }}><GitBranch size={14} /></button>
            <button onClick={() => setViewMode('list')} title="Table view" style={{ height: '2.2rem', padding: '0 0.6rem', border: 'none', background: viewMode === 'list' ? 'var(--background)' : 'transparent', boxShadow: viewMode === 'list' ? '0 1px 2px rgba(0,0,0,0.1)' : 'none', cursor: 'pointer' }}><List size={14} /></button>
          </div>
          <button onClick={() => navigate('/organizations/new')} className="primary" style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', height: '2.2rem', fontSize: '0.9rem' }}>
            <PlusCircle size={14} />
            New Organization
          </button>
        </div>
      </div>

      {showFilters && (
        <div className="card" style={{ marginBottom: '1.25rem', background: 'var(--background)', padding: '1rem', flexShrink: 0 }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: '0.75rem', alignItems: 'flex-end' }}>
            <MultiSelect label="Type" options={typeOptions} selectedValues={filters.type || []} onChange={(val) => setFilters({ ...filters, type: val })} placeholder="All" style={{ height: '2.2rem', fontSize: '0.9rem' }} />
            <MultiSelect label="Part of" options={parentOptions} selectedValues={filters.parentId || []} onChange={(val) => setFilters({ ...filters, parentId: val })} placeholder="All" style={{ height: '2.2rem', fontSize: '0.9rem' }} />
            <button onClick={clearFilters} style={{ height: '2.2rem', borderColor: 'transparent', color: 'var(--muted-foreground)', fontSize: '0.9rem' }}><X size={16} style={{ marginRight: '0.4rem' }} /> Clear</button>
          </div>
        </div>
      )}

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
              {orgTree.length === 0 ? (
                <tr>
                  <td colSpan={6} style={{ padding: '2rem', textAlign: 'center', color: 'var(--muted-foreground)', fontStyle: 'italic', fontSize: '0.8rem' }}>
                    {orgList.length === 0 ? 'No organizations defined.' : 'No organizations match the filter.'}
                  </td>
                </tr>
              ) : orgTree.map(org => (
                <OrgListRow key={org.id} node={org} organizations={organizations} picklists={picklists || []} onRefresh={onRefresh} />
              ))}
            </tbody>
          </table>
        </div>
      )}

      {viewMode === 'tree' && (
        visibleOrgs.length > 0 ? (
          <div style={{ flex: 1, minHeight: 0, display: 'flex' }}>
            <OrganizationDiagram organizations={visibleOrgs} picklists={picklists || []} />
          </div>
        ) : (
          <div className="card" style={{ padding: '2rem', textAlign: 'center', color: 'var(--muted-foreground)', fontStyle: 'italic', fontSize: '0.8rem' }}>
            {orgList.length === 0 ? 'No organizations defined.' : 'No organizations match the filter.'}
          </div>
        )
      )}
    </div>
  );
};
