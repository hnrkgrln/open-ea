import React, { useState, useMemo, useCallback } from 'react';
import { QueryClient, QueryClientProvider, useQuery, useQueryClient } from '@tanstack/react-query';
import { LayoutDashboard, Database, Network, Search, Plus, Boxes, ChevronRight, ChevronDown, Edit2, LayoutGrid, List, Filter, X, Settings, Map as MapIcon } from 'lucide-react';
import { NewAppDialog } from './components/NewAppDialog';
import { EditAppDialog } from './components/EditAppDialog';
import { ApplicationDiagram } from './components/ApplicationDiagram';
import { EditCapabilityDialog } from './components/EditCapabilityDialog';
import { ThemeToggle } from './components/ThemeToggle';
import { UnifiedSearch } from './components/UnifiedSearch';
import { LifecycleBadge } from './components/LifecycleBadge';
import { PicklistsView } from './components/PicklistsView';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60, // 1 minute
      refetchOnWindowFocus: true,
    },
  },
});

// Types
interface Application {
  id: string;
  name: string;
  description: string;
  owner: string;
  lifecycle: string;
  type: string;
  capabilities?: Capability[];
}

interface Capability {
  id: string;
  name: string;
  description?: string;
  parentId?: string | null;
  children?: Capability[];
  applications?: { id: string }[];
}

interface Integration {
  id: string;
  name: string;
  sourceAppId: string;
  targetAppId: string;
  type: string;
  sourceApp: Application;
  targetApp: Application;
}

// Components
const AppContent = () => {
  const [activeTab, setActiveTab] = useState<'inventory' | 'capabilities' | 'diagrams' | 'settings'>('inventory');
  const [editingApp, setEditingApp] = useState<Application | null>(null);
  const [editingCapability, setEditingCapability] = useState<Capability | null>(null);
  const queryClient = useQueryClient();

  const handleRefresh = useCallback(() => {
    // Invalidate ALL related EA data to ensure UI consistency
    queryClient.invalidateQueries({ queryKey: ['applications'] });
    queryClient.invalidateQueries({ queryKey: ['integrations'] });
    queryClient.invalidateQueries({ queryKey: ['capabilities'] });
    queryClient.invalidateQueries({ queryKey: ['picklists'] });
    queryClient.invalidateQueries({ queryKey: ['search'] });
  }, [queryClient]);

  const { data: apps } = useQuery({
    queryKey: ['applications'],
    queryFn: async () => {
      const res = await fetch('/api/applications');
      return res.json() as Promise<Application[]>;
    }
  });

  const isFullWidth = activeTab === 'diagrams';

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <header className="header">
        <div style={{ display: 'flex', alignItems: 'center', gap: '2rem' }}>
          <a href="/" className="logo">MEAT</a>
          <nav className="nav">
            <button 
              className={`nav-link ${activeTab === 'inventory' ? 'active' : ''}`}
              onClick={() => setActiveTab('inventory')}
            >
              Applications
            </button>
            <button 
              className={`nav-link ${activeTab === 'capabilities' ? 'active' : ''}`}
              onClick={() => setActiveTab('capabilities')}
            >
              Capabilities
            </button>
            <button 
              className={`nav-link ${activeTab === 'diagrams' ? 'active' : ''}`}
              onClick={() => setActiveTab('diagrams')}
            >
              Diagrams
            </button>
            <button 
              className={`nav-link ${activeTab === 'settings' ? 'active' : ''}`}
              onClick={() => setActiveTab('settings')}
            >
              Settings
            </button>
          </nav>
        </div>
        <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
          <ThemeToggle />
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <UnifiedSearch onSelectApp={(app) => setEditingApp(app)} onSelectCapability={(cap) => setEditingCapability(cap)} />
            <NewAppDialog onSuccess={handleRefresh} />
          </div>
        </div>
      </header>

      <main className={isFullWidth ? "main-full" : "main-container"}>
        <div style={{ display: activeTab === 'inventory' ? 'block' : 'none' }}>
          <InventoryView apps={apps || []} onRefresh={handleRefresh} />
        </div>
        <div style={{ display: activeTab === 'capabilities' ? 'block' : 'none' }}>
          <CapabilitiesView onRefresh={handleRefresh} />
        </div>
        <div style={{ display: activeTab === 'diagrams' ? 'block' : 'none', height: '100%' }}>
          <DiagramsView 
            apps={apps || []} 
            onEditApp={(app) => setEditingApp(app)} 
            onEditCapability={(cap) => setEditingCapability(cap)}
          />
        </div>
        <div style={{ display: activeTab === 'settings' ? 'block' : 'none' }}>
          <PicklistsView />
        </div>
      </main>

      {/* Global Edit App Dialog for Diagram/Search Clicks */}
      {editingApp && (
        <EditAppDialog 
          app={editingApp} 
          open={!!editingApp}
          onOpenChange={(open) => {
            if (!open) setEditingApp(null);
          }}
          onSuccess={handleRefresh}
        />
      )}

      {/* Global Edit Capability Dialog for Diagram Clicks */}
      {editingCapability && (
        <EditCapabilityDialog
          capability={editingCapability}
          open={!!editingCapability}
          onOpenChange={(open) => {
            if (!open) setEditingCapability(null);
          }}
          onSuccess={handleRefresh}
        />
      )}
    </div>
  );
};

const InventoryView = ({ apps, onRefresh }: { apps: Application[], onRefresh: () => void }) => {
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [filters, setFilters] = useState({
    search: '',
    owner: '',
    lifecycle: '',
    type: ''
  });
  const [showFilters, setShowFilters] = useState(false);

  const { data: picklists } = useQuery<any[]>({
    queryKey: ['picklists'],
    queryFn: async () => {
      const res = await fetch('/api/picklists');
      return res.json();
    }
  });

  const lifecycleOptions = picklists?.find(p => p.name === 'lifecycle')?.options || [];
  const ownerOptions = picklists?.find(p => p.name === 'owner')?.options || [];
  const appTypeOptions = picklists?.find(p => p.name === 'application_type')?.options || [];

  const filteredApps = useMemo(() => {
    if (!apps) return [];
    return apps.filter(app => {
      const matchSearch = !filters.search || 
                          app.name.toLowerCase().includes(filters.search.toLowerCase()) || 
                          app.description?.toLowerCase().includes(filters.search.toLowerCase());
      const matchOwner = !filters.owner || app.owner === filters.owner || app.owner?.toLowerCase() === filters.owner.toLowerCase();
      const matchLifecycle = !filters.lifecycle || app.lifecycle === filters.lifecycle || app.lifecycle?.toLowerCase() === filters.lifecycle.toLowerCase();
      const matchType = !filters.type || app.type === filters.type || app.type?.toLowerCase() === filters.type.toLowerCase();
      
      return matchSearch && matchOwner && matchLifecycle && matchType;
    });
  }, [apps, filters]);

  const clearFilters = () => {
    setFilters({ search: '', owner: '', lifecycle: '', type: '' });
  };

  return (
    <div>
      <div style={{ marginBottom: '2rem', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
        <div>
          <h1 style={{ fontSize: '1.875rem', fontWeight: 700 }}>Application Inventory</h1>
          <p style={{ color: 'var(--muted-foreground)' }}>
            Total of <strong>{apps?.length || 0}</strong> applications. Showing <strong>{filteredApps.length}</strong> after filters.
          </p>
        </div>
        
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <button 
            onClick={() => setShowFilters(!showFilters)}
            style={{ 
              height: '2rem', padding: '0 0.75rem', border: '1px solid var(--border)',
              background: showFilters ? 'var(--accent)' : 'var(--background)'
            }}
          >
            <Filter size={16} style={{ marginRight: '0.5rem' }} /> Filters
          </button>
          <div style={{ display: 'flex', background: 'var(--secondary)', padding: '0.25rem', borderRadius: 'var(--radius)', gap: '0.25rem' }}>
            <button 
              onClick={() => setViewMode('grid')}
              style={{ 
                height: '2rem', padding: '0 0.75rem', border: 'none',
                background: viewMode === 'grid' ? 'var(--background)' : 'transparent',
                boxShadow: viewMode === 'grid' ? '0 1px 2px rgba(0,0,0,0.1)' : 'none'
              }}
            >
              <LayoutGrid size={16} />
            </button>
            <button 
              onClick={() => setViewMode('list')}
              style={{ 
                height: '2rem', padding: '0 0.75rem', border: 'none',
                background: viewMode === 'list' ? 'var(--background)' : 'transparent',
                boxShadow: viewMode === 'list' ? '0 1px 2px rgba(0,0,0,0.1)' : 'none'
              }}
            >
              <List size={16} />
            </button>
          </div>
        </div>
      </div>

      {showFilters && (
        <div className="card" style={{ marginBottom: '2rem', background: 'var(--background)', padding: '1rem' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '1rem', alignItems: 'flex-end' }}>
            <div className="field" style={{ margin: 0 }}>
              <label className="label">Search</label>
              <input 
                value={filters.search} 
                onChange={(e) => setFilters({...filters, search: e.target.value})}
                placeholder="Name or Desc..."
                style={{ marginTop: '0.25rem' }}
              />
            </div>
            <div className="field" style={{ margin: 0 }}>
              <label className="label">Owner</label>
              <select 
                value={filters.owner} 
                onChange={(e) => setFilters({...filters, owner: e.target.value})}
                style={{ marginTop: '0.25rem' }}
              >
                <option value="">All Owners</option>
                {ownerOptions.map((o: any) => <option key={o.id} value={o.value}>{o.label}</option>)}
              </select>
            </div>
            <div className="field" style={{ margin: 0 }}>
              <label className="label">Type</label>
              <select 
                value={filters.type} 
                onChange={(e) => setFilters({...filters, type: e.target.value})}
                style={{ marginTop: '0.25rem' }}
              >
                <option value="">All Types</option>
                {appTypeOptions.map((o: any) => <option key={o.id} value={o.value}>{o.label}</option>)}
              </select>
            </div>
            <div className="field" style={{ margin: 0 }}>
              <label className="label">Lifecycle</label>
              <select 
                value={filters.lifecycle} 
                onChange={(e) => setFilters({...filters, lifecycle: e.target.value})}
                style={{ marginTop: '0.25rem' }}
              >
                <option value="">All Lifecycles</option>
                {lifecycleOptions.map((opt: any) => (
                  <option key={opt.id} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            </div>
            <button onClick={clearFilters} style={{ height: '2.5rem', borderColor: 'transparent', color: 'var(--muted-foreground)' }}>
              <X size={16} style={{ marginRight: '0.5rem' }} /> Clear
            </button>
          </div>
        </div>
      )}

      {viewMode === 'grid' ? (
        <div className="grid">
          {filteredApps.map(app => (
            <div key={app.id} className="card">
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '1rem', alignItems: 'flex-start' }}>
                <div style={{ background: 'var(--accent)', padding: '0.5rem', borderRadius: 'var(--radius)' }}>
                  <Database size={20} />
                </div>
                <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                  <LifecycleBadge lifecycle={app.lifecycle} />
                  <EditAppDialog app={app} onSuccess={onRefresh} />
                </div>
              </div>
              <h3 style={{ marginBottom: '0.5rem' }}>{app.name}</h3>
              <p style={{ fontSize: '0.875rem', color: 'var(--muted-foreground)', marginBottom: '1rem' }}>
                {app.description || 'No description provided.'}
              </p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', fontSize: '0.75rem', borderTop: '1px solid var(--border)', paddingTop: '1rem', marginTop: 'auto' }}>
                <div><strong>Owner:</strong> {ownerOptions.find((o: any) => o.value === app.owner)?.label || app.owner || 'Unassigned'}</div>
                <div><strong>Type:</strong> {appTypeOptions.find((o: any) => o.value === app.type)?.label || app.type || 'Unspecified'}</div>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border)', background: 'var(--muted)' }}>
                <th style={{ padding: '1rem', fontSize: '0.875rem' }}>Name</th>
                <th style={{ padding: '1rem', fontSize: '0.875rem' }}>Owner</th>
                <th style={{ padding: '1rem', fontSize: '0.875rem' }}>Type</th>
                <th style={{ padding: '1rem', fontSize: '0.875rem' }}>Lifecycle</th>
                <th style={{ padding: '1rem', fontSize: '0.875rem' }}>Capabilities</th>
                <th style={{ padding: '1rem', fontSize: '0.875rem', textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredApps.map(app => (
                <tr key={app.id} style={{ borderBottom: '1px solid var(--border)' }}>
                  <td style={{ padding: '1rem', fontSize: '0.875rem', fontWeight: 500 }}>{app.name}</td>
                  <td style={{ padding: '1rem', fontSize: '0.875rem' }}>{ownerOptions.find((o: any) => o.value === app.owner)?.label || app.owner || '—'}</td>
                  <td style={{ padding: '1rem', fontSize: '0.875rem' }}>{appTypeOptions.find((o: any) => o.value === app.type)?.label || app.type || '—'}</td>
                  <td style={{ padding: '1rem', fontSize: '0.875rem' }}>
                    <LifecycleBadge lifecycle={app.lifecycle} />
                  </td>
                  <td style={{ padding: '1rem', fontSize: '0.875rem' }}>
                    <div style={{ display: 'flex', gap: '0.25rem', flexWrap: 'wrap' }}>
                      {app.capabilities?.map(cap => (
                        <span key={cap.id} style={{ background: 'var(--accent)', padding: '0.1rem 0.4rem', borderRadius: '4px', fontSize: '0.7rem' }}>
                          {cap.name}
                        </span>
                      ))}
                      {(!app.capabilities || app.capabilities.length === 0) && <span style={{ color: 'var(--muted-foreground)' }}>—</span>}
                    </div>
                  </td>
                  <td style={{ padding: '1rem', textAlign: 'right' }}>
                    <EditAppDialog app={app} onSuccess={onRefresh} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {filteredApps.length === 0 && (
        <div className="card" style={{ textAlign: 'center', padding: '4rem' }}>
          <Boxes size={48} style={{ margin: '0 auto 1rem', color: 'var(--muted-foreground)' }} />
          <h3>No applications found</h3>
          <p style={{ color: 'var(--muted-foreground)' }}>Try adjusting your filters or search terms.</p>
        </div>
      )}
    </div>
  );
};

const CapabilityNode = ({ node, onRefresh }: { node: Capability, onRefresh: () => void }) => {
  const [expanded, setExpanded] = useState(true);
  const hasChildren = node.children && node.children.length > 0;

  return (
    <div style={{ marginLeft: '1.5rem', marginTop: '0.5rem' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
        <button 
          onClick={() => setExpanded(!expanded)} 
          style={{ border: 'none', background: 'none', padding: 0, height: 'auto', visibility: hasChildren ? 'visible' : 'hidden' }}
        >
          {expanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
        </button>
        <div className="card" style={{ 
          padding: '0.5rem 1rem', 
          flex: 1, 
          display: 'flex', 
          justifyContent: 'space-between', 
          alignItems: 'center',
          maxWidth: '600px'
        }}>
          <div>
            <span style={{ fontWeight: 600, fontSize: '0.875rem' }}>{node.name}</span>
            {node.description && <p style={{ fontSize: '0.75rem', color: 'var(--muted-foreground)' }}>{node.description}</p>}
          </div>
          <div style={{ display: 'flex', gap: '0.25rem' }}>
            <EditCapabilityDialog 
              onSuccess={onRefresh} 
              parentId={node.id} 
              trigger={<button style={{ border: 'none', height: '1.5rem', width: '1.5rem', padding: 0 }}><Plus size={14} /></button>}
            />
            <EditCapabilityDialog 
              capability={node} 
              onSuccess={onRefresh} 
              trigger={<button style={{ border: 'none', height: '1.5rem', width: '1.5rem', padding: 0 }}><Edit2 size={14} /></button>}
            />
          </div>
        </div>
      </div>
      {expanded && hasChildren && (
        <div>
          {node.children!.map(child => (
            <CapabilityNode key={child.id} node={child} onRefresh={onRefresh} />
          ))}
        </div>
      )}
    </div>
  );
};

const CapabilitiesView = ({ onRefresh }: { onRefresh: () => void }) => {
  const { data: flatCapabilities, isLoading } = useQuery<Capability[]>({
    queryKey: ['capabilities'],
    queryFn: async () => {
      const res = await fetch('/api/capabilities');
      return res.json();
    }
  });

  const capabilityTree = useMemo(() => {
    if (!flatCapabilities) return [];
    
    const map = new Map<string, Capability>();
    const roots: Capability[] = [];

    flatCapabilities.forEach(cap => {
      map.set(cap.id, { ...cap, children: [] });
    });

    map.forEach(cap => {
      if (cap.parentId && map.has(cap.parentId)) {
        map.get(cap.parentId)!.children!.push(cap);
      } else {
        roots.push(cap);
      }
    });

    return roots;
  }, [flatCapabilities]);

  if (isLoading) return <div>Loading capabilities...</div>;

  return (
    <div>
      <div style={{ marginBottom: '2rem', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <h1 style={{ fontSize: '1.875rem', fontWeight: 700 }}>Business Capabilities</h1>
          <p style={{ color: 'var(--muted-foreground)' }}>Define and map the core functions of your enterprise.</p>
        </div>
        <EditCapabilityDialog onSuccess={onRefresh} />
      </div>
      
      <div style={{ marginLeft: '-1.5rem' }}>
        {capabilityTree.map(cap => (
          <CapabilityNode key={cap.id} node={cap} onRefresh={onRefresh} />
        ))}
      </div>
    </div>
  );
};

const DiagramsView = ({ apps, onEditApp, onEditCapability }: { apps: Application[], onEditApp: (app: Application) => void, onEditCapability: (cap: any) => void }) => {
  const [filters, setFilters] = useState({
    search: '',
    owner: '',
    lifecycle: '',
    type: ''
  });
  const [mode, setMode] = useState<'network' | 'landscape'>('network');
  const [showFilters, setShowFilters] = useState(false);

  const { data: picklists } = useQuery<any[]>({
    queryKey: ['picklists'],
    queryFn: async () => {
      const res = await fetch('/api/picklists');
      return res.json();
    }
  });

  const lifecycleOptions = picklists?.find(p => p.name === 'lifecycle')?.options || [];
  const ownerOptions = picklists?.find(p => p.name === 'owner')?.options || [];
  const appTypeOptions = picklists?.find(p => p.name === 'application_type')?.options || [];

  const filteredApps = useMemo(() => {
    return apps.filter(app => {
      const matchSearch = !filters.search || 
                          app.name.toLowerCase().includes(filters.search.toLowerCase()) || 
                          app.description?.toLowerCase().includes(filters.search.toLowerCase());
      const matchOwner = !filters.owner || app.owner === filters.owner || app.owner?.toLowerCase() === filters.owner.toLowerCase();
      const matchLifecycle = !filters.lifecycle || app.lifecycle === filters.lifecycle || app.lifecycle?.toLowerCase() === filters.lifecycle.toLowerCase();
      const matchType = !filters.type || app.type === filters.type || app.type?.toLowerCase() === filters.type.toLowerCase();
      
      return matchSearch && matchOwner && matchLifecycle && matchType;
    });
  }, [apps, filters]);

  const clearFilters = () => {
    setFilters({ search: '', owner: '', lifecycle: '', type: '' });
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', position: 'relative' }}>
      <div style={{ padding: '1rem 2rem', borderBottom: '1px solid var(--border)', background: 'var(--card)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
        <div>
          <h1 style={{ fontSize: '1.25rem', fontWeight: 700 }}>Landscape Diagrams</h1>
          <p style={{ fontSize: '0.75rem', color: 'var(--muted-foreground)' }}>Viewing {filteredApps.length} applications</p>
        </div>
        
        <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
          <div style={{ display: 'flex', background: 'var(--secondary)', padding: '0.25rem', borderRadius: 'var(--radius)', gap: '0.25rem' }}>
            <button 
              onClick={() => setMode('network')}
              style={{ 
                height: '2rem', padding: '0 0.75rem', border: 'none',
                background: mode === 'network' ? 'var(--background)' : 'transparent',
                boxShadow: mode === 'network' ? '0 1px 2px rgba(0,0,0,0.1)' : 'none'
              }}
            >
              <Network size={16} style={{ marginRight: '0.5rem' }} /> Integrations
            </button>
            <button 
              onClick={() => setMode('landscape')}
              style={{ 
                height: '2rem', padding: '0 0.75rem', border: 'none',
                background: mode === 'landscape' ? 'var(--background)' : 'transparent',
                boxShadow: mode === 'landscape' ? '0 1px 2px rgba(0,0,0,0.1)' : 'none'
              }}
            >
              <MapIcon size={16} style={{ marginRight: '0.5rem' }} /> Landscape
            </button>
          </div>

          <button 
            onClick={() => setShowFilters(!showFilters)}
            style={{ 
              height: '2.5rem', padding: '0 0.75rem', border: '1px solid var(--border)',
              background: showFilters ? 'var(--accent)' : 'var(--background)'
            }}
          >
            <Filter size={16} style={{ marginRight: '0.5rem' }} /> Filters
          </button>
        </div>
      </div>

      {showFilters && (
        <div style={{ padding: '1rem 2rem', borderBottom: '1px solid var(--border)', background: 'var(--card)', flexShrink: 0 }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '1rem', alignItems: 'flex-end' }}>
            <div className="field" style={{ margin: 0 }}>
              <label className="label">Search</label>
              <input 
                value={filters.search} 
                onChange={(e) => setFilters({...filters, search: e.target.value})}
                placeholder="Name or Desc..."
                style={{ marginTop: '0.25rem' }}
              />
            </div>
            <div className="field" style={{ margin: 0 }}>
              <label className="label">Owner</label>
              <select 
                value={filters.owner} 
                onChange={(e) => setFilters({...filters, owner: e.target.value})}
                style={{ marginTop: '0.25rem' }}
              >
                <option value="">All Owners</option>
                {ownerOptions.map((o: any) => <option key={o.id} value={o.value}>{o.label}</option>)}
              </select>
            </div>
            <div className="field" style={{ margin: 0 }}>
              <label className="label">Type</label>
              <select 
                value={filters.type} 
                onChange={(e) => setFilters({...filters, type: e.target.value})}
                style={{ marginTop: '0.25rem' }}
              >
                <option value="">All Types</option>
                {appTypeOptions.map((o: any) => <option key={o.id} value={o.value}>{o.label}</option>)}
              </select>
            </div>
            <div className="field" style={{ margin: 0 }}>
              <label className="label">Lifecycle</label>
              <select 
                value={filters.lifecycle} 
                onChange={(e) => setFilters({...filters, lifecycle: e.target.value})}
                style={{ marginTop: '0.25rem' }}
              >
                <option value="">All Lifecycles</option>
                {lifecycleOptions.map((opt: any) => (
                  <option key={opt.id} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            </div>
            <button onClick={clearFilters} style={{ height: '2.5rem', borderColor: 'transparent', color: 'var(--muted-foreground)' }}>
              <X size={16} style={{ marginRight: '0.5rem' }} /> Clear
            </button>
          </div>
        </div>
      )}

      <div style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
        <ApplicationDiagram onNodeClick={onEditApp} onCapabilityClick={onEditCapability} appsOverride={filteredApps} mode={mode} />
      </div>
    </div>
  );
};

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AppContent />
    </QueryClientProvider>
  );
}
