import React, { useState, useMemo, useCallback, useRef } from 'react';
import { QueryClient, QueryClientProvider, useQuery, useQueryClient } from '@tanstack/react-query';
import { Database, Network, Plus, Boxes, ChevronRight, ChevronDown, Edit2, LayoutGrid, List, Filter, X, Settings, Map as MapIcon, ShieldAlert, Activity, Eye, EyeOff, Trash2, Monitor, PlusCircle, Presentation } from 'lucide-react';
import { NewAppDialog } from './components/NewAppDialog';
import { EditAppDialog } from './components/EditAppDialog';
import { AppDetailsView } from './components/AppDetailsView';
import { ApplicationDiagram } from './components/ApplicationDiagram';
import { EditCapabilityDialog } from './components/EditCapabilityDialog';
import { ThemeToggle } from './components/ThemeToggle';
import { UnifiedSearch } from './components/UnifiedSearch';
import { LifecycleBadge } from './components/LifecycleBadge';
import { PicklistsView } from './components/PicklistsView';
import { SearchInput, MultiSelect } from './components/FilterControls';

// Helper for safe JSON parsing
const safeJsonParse = (str: string | null | undefined, fallback: any = {}) => {
  if (!str) return fallback;
  try {
    return JSON.parse(str);
  } catch (e) {
    // Try to heal simple unquoted JSON like {key:value} or {key:"value"}
    try {
      const healed = str
        .replace(/([{,])\s*([a-zA-Z0-9._-]+)\s*:/g, '$1"$2":') // Quote keys
        .replace(/:\s*([^",}\s][^,}\s]*)\s*([,}])/g, ':"$1"$2'); // Quote unquoted values
      return JSON.parse(healed);
    } catch (e2) {
      console.error('JSON Parse Error:', e, 'for string:', str);
      return fallback;
    }
  }
};

// Custom hook for persisted state
function useLocalStorage<T>(key: string, initialValue: T): [T, (value: T | ((val: T) => T)) => void] {
  const [storedValue, setStoredValue] = useState<T>(() => {
    try {
      const item = window.localStorage.getItem(key);
      return item ? JSON.parse(item) : initialValue;
    } catch (error) {
      return initialValue;
    }
  });

  const setValue = (value: T | ((val: T) => T)) => {
    try {
      const valueToStore = value instanceof Function ? value(storedValue) : value;
      setStoredValue(valueToStore);
      window.localStorage.setItem(key, JSON.stringify(valueToStore));
    } catch (error) {
      console.log(error);
    }
  };

  return [storedValue, setValue];
}

// Color Utilities for Overlays and Dots
const interpolateColor = (color1: string, color2: string, factor: number) => {
  if (!color1 || !color2) return '#adb5bd';
  const r1 = parseInt(color1.substring(1, 3), 16);
  const g1 = parseInt(color1.substring(3, 5), 16);
  const b1 = parseInt(color1.substring(5, 7), 16);
  const r2 = parseInt(color2.substring(1, 3), 16);
  const g2 = parseInt(color2.substring(3, 5), 16);
  const b2 = parseInt(color2.substring(5, 7), 16);
  const r = Math.round(r1 + factor * (r2 - r1));
  const g = Math.round(g1 + factor * (g2 - g1));
  const b = Math.round(b1 + factor * (b2 - b1));
  return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
};

const getOverlayColor = (value: number, def: any) => {
  const min = def.min ?? 0;
  const max = def.max ?? 100;
  const range = max - min;
  const normalized = range === 0 ? 0.5 : (value - min) / range;
  let colors = ['#2b8a3e', '#fab005', '#c92a2a']; 
  if (def.scaleType === 'bad-good') colors = ['#c92a2a', '#fab005', '#2b8a3e'];
  if (def.scaleType === 'low-high') colors = ['#e7f5ff', '#1864ab'];
  if (def.scaleType === 'importance') colors = ['#dee2e6', '#7048e8', '#311b92'];
  if (def.scaleType === 'neutral') colors = ['#dee2e6', '#343a40'];
  if (colors.length === 3) {
    if (normalized < 0.5) return interpolateColor(colors[0], colors[1], normalized * 2);
    return interpolateColor(colors[1], colors[2], (normalized - 0.5) * 2);
  }
  return interpolateColor(colors[0], colors[1], normalized);
};

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
  criticality: string;
  functionalFit: string;
  technicalFit: string;
  metadata?: string;
  capabilities?: Capability[];
  createdAt: string;
  updatedAt: string;
}

interface Capability {
  id: string;
  name: string;
  description?: string;
  criticality: string;
  parentId?: string | null;
  children?: Capability[];
  applications?: { id: string; name: string }[];
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
  const [activeTab, setActiveTab] = useLocalStorage<'inventory' | 'capabilities' | 'diagrams' | 'settings'>('openea_active_tab', 'inventory');
  const [brandName, setBrandName] = useLocalStorage<string>('openea_brand_name', 'OpenEA');
  const [selectedAppId, setSelectedAppId] = useState<string | null>(null);
  const [editingApp, setEditingApp] = useState<Application | null>(null);
  const [editingCapability, setEditingCapability] = useState<Capability | null>(null);
  const queryClient = useQueryClient();

  const handleRefresh = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ['applications'] });
    queryClient.invalidateQueries({ queryKey: ['integrations'] });
    queryClient.invalidateQueries({ queryKey: ['capabilities'] });
    queryClient.invalidateQueries({ queryKey: ['picklists'] });
    queryClient.invalidateQueries({ queryKey: ['search'] });
    queryClient.invalidateQueries({ queryKey: ['metadata-definitions'] });
  }, [queryClient]);

  const { data: apps } = useQuery({
    queryKey: ['applications'],
    queryFn: async () => {
      const res = await fetch('/api/applications');
      return res.json() as Promise<Application[]>;
    }
  });

  const { data: capabilities } = useQuery({
    queryKey: ['capabilities'],
    queryFn: async () => {
      const res = await fetch('/api/capabilities');
      return res.json() as Promise<Capability[]>;
    }
  });

  const { data: integrations } = useQuery({
    queryKey: ['integrations'],
    queryFn: async () => {
      const res = await fetch('/api/integrations');
      return res.json() as Promise<Integration[]>;
    }
  });
  const isFullWidth = activeTab === 'diagrams';
  if (selectedAppId) {
    return (
      <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
    <header className="header">
      <div style={{ display: 'flex', alignItems: 'center', gap: '2rem', flex: 1 }}>
        <button onClick={() => { setSelectedAppId(null); setActiveTab('inventory'); }} className="logo" style={{ border: 'none', background: 'none', padding: 0, cursor: 'pointer' }}>{brandName}</button>
        <nav className="nav">
          <button className={`nav-link ${activeTab === 'inventory' ? 'active' : ''}`} onClick={() => { setSelectedAppId(null); setActiveTab('inventory'); }} style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}><Database size={16} /> Applications</button>
          <button className={`nav-link ${activeTab === 'capabilities' ? 'active' : ''}`} onClick={() => { setSelectedAppId(null); setActiveTab('capabilities'); }} style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}><Boxes size={16} /> Capabilities</button>
          <button className={`nav-link ${activeTab === 'diagrams' ? 'active' : ''}`} onClick={() => { setSelectedAppId(null); setActiveTab('diagrams'); }} style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}><MapIcon size={16} /> Diagrams</button>
        </nav>
      </div>
      <div style={{ flex: 1, display: 'flex', justifyContent: 'center' }}>
        <UnifiedSearch onSelectApp={(app) => { setSelectedAppId(app.id); }} onSelectCapability={(cap) => { setSelectedAppId(null); setActiveTab('capabilities'); setEditingCapability(cap); }} />
      </div>
      <div style={{ flex: 1, display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: '1.5rem' }}>
        <button className={`nav-link ${activeTab === 'settings' ? 'active' : ''}`} onClick={() => { setSelectedAppId(null); setActiveTab('settings'); }} style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}><Settings size={18} /> Settings</button>
        <ThemeToggle />
      </div>
    </header>
          <AppDetailsView appId={selectedAppId} onBack={() => setSelectedAppId(null)} onRefresh={handleRefresh} />
          </div>
          );
          }

          return (
            <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
              <header className="header">
                <div style={{ display: 'flex', alignItems: 'center', gap: '2rem', flex: 1 }}>
                  <button onClick={() => setActiveTab('inventory')} className="logo" style={{ border: 'none', background: 'none', padding: 0, cursor: 'pointer' }}>{brandName}</button>
                  <nav className="nav">
                    <button className={`nav-link ${activeTab === 'inventory' ? 'active' : ''}`} onClick={() => setActiveTab('inventory')} style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}><Database size={16} /> Applications</button>
                    <button className={`nav-link ${activeTab === 'capabilities' ? 'active' : ''}`} onClick={() => setActiveTab('capabilities')} style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}><Boxes size={16} /> Capabilities</button>
                    <button className={`nav-link ${activeTab === 'diagrams' ? 'active' : ''}`} onClick={() => setActiveTab('diagrams')} style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}><MapIcon size={16} /> Diagrams</button>
                  </nav>
                  </div>
                  <div style={{ flex: 1, display: 'flex', justifyContent: 'center' }}>
                  <UnifiedSearch onSelectApp={(app) => setSelectedAppId(app.id)} onSelectCapability={(cap) => setEditingCapability(cap)} />
                  </div>
                  <div style={{ flex: 1, display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: '1.5rem' }}>
                  <button className={`nav-link ${activeTab === 'settings' ? 'active' : ''}`} onClick={() => setActiveTab('settings')} style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}><Settings size={18} /> Settings</button>
                  <ThemeToggle />
                  </div>
                  </header>

          <main className={isFullWidth ? "main-full" : "main-container"}>
          <div style={{ display: activeTab === 'inventory' ? 'block' : 'none' }}>
            <InventoryView 
              apps={apps || []} 
              onSelectApp={(id) => setSelectedAppId(id)} 
              onEditApp={setEditingApp} 
              onNewApp={<NewAppDialog onSuccess={handleRefresh} />}
            />
          </div>
        <div style={{ display: activeTab === 'capabilities' ? 'block' : 'none' }}>
          <CapabilitiesView capabilities={capabilities || []} onRefresh={handleRefresh} onSelectApp={(id) => setSelectedAppId(id)} />
        </div>
        <div style={{ display: activeTab === 'diagrams' ? 'block' : 'none', height: '100%' }}>
          <DiagramsView 
            apps={apps || []} 
            capabilities={capabilities || []}
            integrations={integrations || []}
            onEditApp={(id) => setSelectedAppId(id)} 
            onEditCapability={(cap) => setEditingCapability(cap)} 
            isVisible={activeTab === 'diagrams'}
          />
        </div>
        <div style={{ display: activeTab === 'settings' ? 'block' : 'none' }}>
          <PicklistsView brandName={brandName} onUpdateBrand={setBrandName} apps={apps || []} capabilities={capabilities || []} integrations={integrations || []} onRefresh={handleRefresh} />
        </div>
      </main>

      {editingApp && (
        <EditAppDialog 
          app={editingApp} 
          open={!!editingApp}
          onOpenChange={(open) => { if (!open) setEditingApp(null); }}
          onSuccess={handleRefresh}
        />
      )}

      {editingCapability && (
        <EditCapabilityDialog
          capability={editingCapability}
          open={!!editingCapability}
          onOpenChange={(open) => { if (!open) setEditingCapability(null); }}
          onSuccess={handleRefresh}
        />
      )}
    </div>
  );
};

const InventoryView = ({ apps, onSelectApp, onEditApp, onNewApp }: { apps: Application[], onSelectApp: (id: string) => void, onEditApp: (app: any) => void, onNewApp: React.ReactNode }) => {
  const [viewMode, setViewMode] = useLocalStorage<'grid' | 'list'>('openea_inventory_view', 'grid');
  const [filters, setFilters] = useLocalStorage('openea_inventory_filters', { 
    search: '', 
    owner: [] as string[], 
    lifecycle: [] as string[], 
    type: [] as string[],
    criticality: [] as string[],
    functionalFit: [] as string[],
    technicalFit: [] as string[],
    custom: {} as Record<string, string[]>
  });
  
  const { data: picklists } = useQuery<any[]>({
    queryKey: ['picklists'],
    queryFn: async () => {
      const res = await fetch('/api/picklists');
      return res.json();
    }
  });

  const { data: metaDefs } = useQuery<any[]>({
    queryKey: ['metadata-definitions'],
    queryFn: async () => {
      const res = await fetch('/api/metadata-definitions');
      return res.json();
    }
  });

  const appMetaDefs = useMemo(() => metaDefs?.filter(d => d.entityType === 'Application') || [], [metaDefs]);

  // Auto-show filters if any are active
  const isAnyFilterActive = useMemo(() => {
    const hasCustom = Object.values(filters.custom || {}).some(vals => vals.length > 0);
    return filters.search !== '' || filters.owner.length > 0 || filters.lifecycle.length > 0 || filters.type.length > 0 || filters.criticality.length > 0 || filters.functionalFit.length > 0 || filters.technicalFit.length > 0 || hasCustom;
  }, [filters]);

  const [showFilters, setShowFilters] = useState(isAnyFilterActive);

  const lifecycleOptions = picklists?.find(p => p.name === 'lifecycle')?.options || [];
  const ownerOptions = picklists?.find(p => p.name === 'owner')?.options || [];
  const appTypeOptions = picklists?.find(p => p.name === 'application_type')?.options || [];
  
  const criticalityOptions = picklists?.find(p => p.name === 'criticality')?.options || [];
  const funcFitOptions = picklists?.find(p => p.name === 'functional_fit')?.options || [];
  const techFitOptions = picklists?.find(p => p.name === 'technical_fit')?.options || [];

  const scoreFields = [
    { id: 'crit', fieldName: 'criticality', label: 'Criticality', scaleType: 'importance', min: 1, max: 5 },
    { id: 'func', fieldName: 'functionalFit', label: 'Functional Fit', scaleType: 'bad-good', min: 1, max: 5 },
    { id: 'tech', fieldName: 'technicalFit', label: 'Technical Fit', scaleType: 'bad-good', min: 1, max: 5 },
  ];
  const customRangeFields = appMetaDefs.filter(d => d.fieldType === 'range' && !['criticality', 'functionalFit', 'technicalFit'].includes(d.fieldName)) || [];
  const allRangeFields = [...scoreFields, ...customRangeFields];

  const filteredApps = useMemo(() => {
    if (!apps) return [];
    return apps.filter(app => {
      const matchSearch = !filters.search || 
        app.name.toLowerCase().includes(filters.search.toLowerCase()) || 
        app.description?.toLowerCase().includes(filters.search.toLowerCase()) ||
        app.owner?.toLowerCase().includes(filters.search.toLowerCase()) ||
        app.lifecycle?.toLowerCase().includes(filters.search.toLowerCase()) ||
        app.type?.toLowerCase().includes(filters.search.toLowerCase()) ||
        app.capabilities?.some(c => c.name.toLowerCase().includes(filters.search.toLowerCase())) ||
        app.metadata?.toLowerCase().includes(filters.search.toLowerCase());
      const matchOwner = filters.owner.length === 0 || filters.owner.includes(app.owner) || filters.owner.includes(app.owner?.toLowerCase());
      const matchLifecycle = filters.lifecycle.length === 0 || filters.lifecycle.includes(app.lifecycle) || filters.lifecycle.includes(app.lifecycle?.toLowerCase());
      const matchType = filters.type.length === 0 || filters.type.includes(app.type) || filters.type.includes(app.type?.toLowerCase());
      
      const localCrit = Number(app.criticality || 1);
      const inheritedCrit = (app.capabilities && app.capabilities.length > 0) 
        ? String(Math.max(localCrit, ...app.capabilities.map(c => Number(c.criticality || 1))))
        : String(localCrit);

      const matchCrit = filters.criticality.length === 0 || filters.criticality.includes(inheritedCrit);

      const matchFunc = filters.functionalFit.length === 0 || filters.functionalFit.includes(app.functionalFit);
      const matchTech = filters.technicalFit.length === 0 || filters.technicalFit.includes(app.technicalFit);
      
      // Custom Meta Filters
      let matchCustom = true;
      if (filters.custom) {
        const appMeta = safeJsonParse(app.metadata);
        for (const [fieldName, selectedVals] of Object.entries(filters.custom)) {
          if (selectedVals.length > 0) {
            const val = String(appMeta[fieldName] || '');
            if (!selectedVals.includes(val)) {
              matchCustom = false;
              break;
            }
          }
        }
      }

      return matchSearch && matchOwner && matchLifecycle && matchType && matchCrit && matchFunc && matchTech && matchCustom;
    });
  }, [apps, filters]);

  const clearFilters = () => setFilters({ 
    search: '', owner: [], lifecycle: [], type: [], 
    criticality: [], functionalFit: [], technicalFit: [],
    custom: {}
  });

  const getCustomOptions = (fieldName: string) => {
    if (!apps) return [];
    const values = new Set<string>();
    apps.forEach(app => {
      try {
        const meta = safeJsonParse(app.metadata);
        if (meta[fieldName] !== undefined && meta[fieldName] !== null && meta[fieldName] !== '') {
          values.add(String(meta[fieldName]));
        }
      } catch (e) { /* ignore */ }
    });
    return Array.from(values).sort().map(v => ({ value: v, label: v }));
  };

  return (
    <div>
      <div style={{ marginBottom: '2rem', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
        <div>
          <h1 style={{ fontSize: '1.875rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '0.75rem' }}><Database size={32} /> Application Inventory</h1>
          <p style={{ color: 'var(--muted-foreground)' }}>Total of <strong>{apps?.length || 0}</strong> applications. Showing <strong>{filteredApps.length}</strong> after filters.</p>
        </div>
        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
          <button onClick={() => setShowFilters(!showFilters)} style={{ height: '2rem', padding: '0 0.75rem', border: '1px solid var(--border)', background: showFilters ? 'var(--accent)' : 'var(--background)' }}><Filter size={16} style={{ marginRight: '0.5rem' }} /> Filters</button>
          <div style={{ display: 'flex', background: 'var(--secondary)', padding: '0.25rem', borderRadius: 'var(--radius)', gap: '0.25rem' }}>
            <button onClick={() => setViewMode('grid')} style={{ height: '2rem', padding: '0 0.75rem', border: 'none', background: viewMode === 'grid' ? 'var(--background)' : 'transparent', boxShadow: viewMode === 'grid' ? '0 1px 2px rgba(0,0,0,0.1)' : 'none' }}><LayoutGrid size={16} /></button>
            <button onClick={() => setViewMode('list')} style={{ height: '2rem', padding: '0 0.75rem', border: 'none', background: viewMode === 'list' ? 'var(--background)' : 'transparent', boxShadow: viewMode === 'list' ? '0 1px 2px rgba(0,0,0,0.1)' : 'none' }}><List size={16} /></button>
          </div>
          {onNewApp}
        </div>
      </div>
      {showFilters && (
        <div className="card" style={{ marginBottom: '2rem', background: 'var(--background)', padding: '1.25rem' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '1rem', alignItems: 'flex-end' }}>
            <SearchInput label="Search" value={filters.search} onChange={(val) => setFilters({...filters, search: val})} placeholder="Search..." />
            <MultiSelect label="Owner" options={ownerOptions} selectedValues={filters.owner} onChange={(val) => setFilters({...filters, owner: val})} placeholder="All Owners" />
            <MultiSelect label="Type" options={appTypeOptions} selectedValues={filters.type} onChange={(val) => setFilters({...filters, type: val})} placeholder="All Types" />
            <MultiSelect label="Lifecycle" options={lifecycleOptions} selectedValues={filters.lifecycle} onChange={(val) => setFilters({...filters, lifecycle: val})} placeholder="All Lifecycles" />
            
            <MultiSelect label="Criticality" options={criticalityOptions} selectedValues={filters.criticality} onChange={(val) => setFilters({...filters, criticality: val})} placeholder="All" />
            <MultiSelect label="Functional Fit" options={funcFitOptions} selectedValues={filters.functionalFit} onChange={(val) => setFilters({...filters, functionalFit: val})} placeholder="All" />
            <MultiSelect label="Technical Fit" options={techFitOptions} selectedValues={filters.technicalFit} onChange={(val) => setFilters({...filters, technicalFit: val})} placeholder="All" />

            {/* Custom Field Filters */}
            {appMetaDefs.filter(d => d.fieldType !== 'range').map(def => (
              <MultiSelect 
                key={def.id} 
                label={def.label} 
                options={getCustomOptions(def.fieldName)} 
                selectedValues={(filters.custom || {})[def.fieldName] || []} 
                onChange={(val) => setFilters({...filters, custom: { ...(filters.custom || {}), [def.fieldName]: val }})} 
                placeholder={`All ${def.label}s`} 
              />
            ))}

            <button onClick={clearFilters} style={{ height: '2.5rem', borderColor: 'transparent', color: 'var(--muted-foreground)' }}><X size={16} style={{ marginRight: '0.5rem' }} /> Clear</button>
          </div>
        </div>
      )}
      {viewMode === 'grid' ? (
        <div className="grid">
          {filteredApps.map(app => {
            const meta = safeJsonParse(app.metadata);
            const isInherited = app.capabilities && app.capabilities.length > 0;
            const inheritedCrit = isInherited 
              ? String(Math.max(...app.capabilities!.map(c => Number(c.criticality || 1))))
              : app.criticality;

            return (
              <div key={app.id} className="card" onClick={() => onSelectApp(app.id)} style={{ cursor: 'pointer' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '1rem', alignItems: 'flex-start' }}>
                  <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                    <div style={{ background: 'var(--accent)', padding: '0.5rem', borderRadius: 'var(--radius)' }}><Database size={20} /></div>
                    <div style={{ display: 'flex', gap: '4px' }}>
                      {allRangeFields.map(def => {
                        const val = def.fieldName === 'criticality' ? inheritedCrit : ((app as any)[def.fieldName] || meta[def.fieldName] || def.min);
                        const isThisInherited = def.fieldName === 'criticality' && isInherited;
                        return (
                          <div 
                            key={def.id} 
                            title={`${def.label}: ${val}${isThisInherited ? ' (Inherited)' : ''}`}
                            style={{ 
                              width: '10px', height: '10px', borderRadius: '50%', 
                              background: getOverlayColor(Number(val), def),
                              border: isThisInherited ? '1px solid var(--primary)' : 'none'
                            }} 
                          />
                        );
                      })}
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                    <LifecycleBadge lifecycle={app.lifecycle} />
                    <button 
                      onClick={(e) => { e.stopPropagation(); onEditApp(app); }} 
                      className="secondary" 
                      style={{ border: 'none', height: '2rem', width: '2rem', padding: 0, background: 'transparent' }}
                    >
                      <Edit2 size={14} />
                    </button>
                  </div>
                </div>
                <h3 style={{ marginBottom: '0.5rem' }}>{app.name}</h3>
                <p style={{ fontSize: '0.875rem', color: 'var(--muted-foreground)', marginBottom: '1rem', display: '-webkit-box', WebkitLineClamp: '2', WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{app.description || 'No description provided.'}</p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', fontSize: '0.75rem', borderTop: '1px solid var(--border)', paddingTop: '1rem', marginTop: 'auto' }}>
                  <div><strong>Owner:</strong> {ownerOptions.find((o: any) => o.value === app.owner)?.label || app.owner || 'Unassigned'}</div>
                  <div><strong>Type:</strong> {appTypeOptions.find((o: any) => o.value === app.type)?.label || app.type || 'Unspecified'}</div>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
            <thead><tr style={{ borderBottom: '1px solid var(--border)', background: 'var(--muted)' }}><th style={{ padding: '1rem', fontSize: '0.875rem' }}>Name</th><th style={{ padding: '1rem', fontSize: '0.875rem' }}>Owner</th><th style={{ padding: '1rem', fontSize: '0.875rem' }}>Type</th><th style={{ padding: '1rem', fontSize: '0.875rem' }}>Status</th><th style={{ padding: '1rem', fontSize: '0.875rem' }}>Lifecycle</th><th style={{ padding: '1rem', fontSize: '0.875rem' }}>Capabilities</th><th style={{ padding: '1rem', fontSize: '0.875rem', textAlign: 'right' }}>Actions</th></tr></thead>
            <tbody>{filteredApps.map(app => {
              const meta = safeJsonParse(app.metadata);
              const isInherited = app.capabilities && app.capabilities.length > 0;
              const inheritedCrit = isInherited 
                ? String(Math.max(...app.capabilities!.map(c => Number(c.criticality || 1))))
                : app.criticality;

              return (
                <tr key={app.id} onClick={() => onSelectApp(app.id)} style={{ borderBottom: '1px solid var(--border)', cursor: 'pointer' }}>
                  <td style={{ padding: '1rem', fontSize: '0.875rem', fontWeight: 500, display: 'flex', alignItems: 'center', gap: '0.5rem' }}><Database size={14} style={{ color: 'var(--muted-foreground)' }} /> {app.name}</td>
                  <td style={{ padding: '1rem', fontSize: '0.875rem' }}>{ownerOptions.find((o: any) => o.value === app.owner)?.label || app.owner || '—'}</td>
                  <td style={{ padding: '1rem', fontSize: '0.875rem' }}>{appTypeOptions.find((o: any) => o.value === app.type)?.label || app.type || '—'}</td>
                  <td style={{ padding: '1rem' }}>
                    <div style={{ display: 'flex', gap: '4px' }}>
                      {allRangeFields.map(def => {
                        const val = def.fieldName === 'criticality' ? inheritedCrit : ((app as any)[def.fieldName] || meta[def.fieldName] || def.min);
                        const isThisInherited = def.fieldName === 'criticality' && isInherited;
                        return (
                          <div key={def.id} title={`${def.label}: ${val}${isThisInherited ? ' (Inherited)' : ''}`} style={{ width: '8px', height: '8px', borderRadius: '50%', background: getOverlayColor(Number(val), def), border: isThisInherited ? '1px solid var(--primary)' : 'none' }} />
                        );
                      })}
                    </div>
                  </td>
                  <td style={{ padding: '1rem', fontSize: '0.875rem' }}><LifecycleBadge lifecycle={app.lifecycle} /></td>
                  <td style={{ padding: '1rem', fontSize: '0.875rem' }}><div style={{ display: 'flex', gap: '0.25rem', flexWrap: 'wrap' }}>{app.capabilities?.map(cap => (<span key={cap.id} style={{ background: 'var(--accent)', padding: '0.1rem 0.4rem', borderRadius: '4px', fontSize: '0.7rem' }}>{cap.name}</span>))}{(!app.capabilities || app.capabilities.length === 0) && <span style={{ color: 'var(--muted-foreground)' }}>—</span>}</div></td>
                  <td style={{ padding: '1rem', textAlign: 'right' }}>
                    <button 
                      onClick={(e) => { e.stopPropagation(); onEditApp(app); }} 
                      className="secondary" 
                      style={{ border: 'none', height: '2rem', width: '2rem', padding: 0, background: 'transparent' }}
                    >
                      <Edit2 size={14} />
                    </button>
                  </td>
                </tr>
              );
            })}</tbody>
          </table>
        </div>
      )}
    </div>
  );
};

const CapabilityNode = ({ node, onRefresh, onSelectApp, criticalityOptions, depth = 0 }: { node: Capability, onRefresh: () => void, onSelectApp: (id: string) => void, criticalityOptions: any[], depth?: number }) => {
  const [expanded, setExpanded] = useState(true);
  const hasChildren = node.children && node.children.length > 0;
  const appCount = node.applications?.length || 0;
  const criticality = criticalityOptions.find(o => o.value === node.criticality);

  return (
    <div className={depth === 0 ? "" : "nested-node"} style={{ width: '100%' }}>
      <div className="card" style={{ 
        padding: '1.25rem', 
        display: 'flex', 
        flexDirection: 'column', 
        gap: '1rem', 
        borderLeft: `4px solid ${criticality?.color || 'var(--border)'}`,
        background: depth % 2 === 0 ? 'var(--card)' : 'rgba(0,0,0,0.02)',
        height: '100%',
        boxShadow: depth === 0 ? '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)' : 'none'
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem', alignItems: 'center' }}>
            {hasChildren && (
              <button onClick={() => setExpanded(!expanded)} style={{ border: 'none', background: 'none', padding: 0, height: 'auto', display: 'flex', alignItems: 'center' }}>
                {expanded ? <ChevronDown size={20} /> : <ChevronRight size={20} />}
              </button>
            )}
            <span style={{ fontWeight: 800, fontSize: depth === 0 ? '1.125rem' : '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}><Boxes size={depth === 0 ? 20 : 16} style={{ color: 'var(--muted-foreground)' }} /> {node.name}</span>
            {criticality && (
              <span style={{ fontSize: '0.65rem', fontWeight: 800, textTransform: 'uppercase', padding: '0.15rem 0.6rem', borderRadius: '4px', background: `${criticality.color}20`, color: criticality.color, border: `1px solid ${criticality.color}40` }}>
                {criticality.label}
              </span>
            )}
            <span style={{ fontSize: '0.75rem', background: 'var(--secondary)', color: 'var(--secondary-foreground)', padding: '0.15rem 0.6rem', borderRadius: '12px', fontWeight: 600 }}>
              {appCount} Supporting App{appCount !== 1 ? 's' : ''}
            </span>
          </div>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <EditCapabilityDialog onSuccess={onRefresh} parentId={node.id} trigger={<button className="secondary" style={{ height: '2rem', padding: '0 0.6rem' }} title="Add Sub-capability"><Plus size={14} /></button>} />
            <EditCapabilityDialog capability={node} onSuccess={onRefresh} trigger={<button className="secondary" style={{ height: '2rem', width: '2rem', padding: 0 }}><Edit2 size={14} /></button>} />
            <button onClick={async () => { if(confirm('Delete?')) { await fetch(`/api/capabilities/${node.id}`, {method: 'DELETE'}); onRefresh(); } }} className="secondary" style={{ height: '2rem', width: '2rem', padding: 0, color: 'var(--destructive)' }}><Trash2 size={14} /></button>
          </div>
        </div>
        
        {node.description && <p style={{ fontSize: '0.875rem', color: 'var(--muted-foreground)', margin: 0, maxWidth: '800px' }}>{node.description}</p>}
        
        {node.applications && node.applications.length > 0 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', background: 'var(--muted)', padding: '0.75rem', borderRadius: 'var(--radius)' }}>
            {node.applications.map(app => (
              <div key={app.id} onClick={() => onSelectApp(app.id)} style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.75rem', background: 'var(--card)', padding: '0.25rem 0.6rem', borderRadius: '4px', color: 'var(--card-foreground)', fontWeight: 600, border: '1px solid var(--border)' }}>
                <Database size={12} /> {app.name}
              </div>
            ))}
          </div>
        )}

        {expanded && hasChildren && (
          <div style={{ 
            marginTop: '0.5rem', 
            paddingLeft: '1rem', 
            borderLeft: '1px dashed var(--border)',
            display: 'flex',
            flexDirection: 'column',
            gap: '1rem'
          }}>
            {node.children!.map(child => (
              <CapabilityNode key={child.id} node={child} onRefresh={onRefresh} onSelectApp={onSelectApp} criticalityOptions={criticalityOptions} depth={depth + 1} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

const CapabilityListRow = ({ node, onRefresh, onSelectApp, criticalityOptions, depth = 0 }: { node: Capability, onRefresh: () => void, onSelectApp: (id: string) => void, criticalityOptions: any[], depth?: number }) => {
  const crit = criticalityOptions.find(o => o.value === node.criticality);
  const hasChildren = node.children && node.children.length > 0;

  return (
    <>
      <tr key={node.id} className="row-hover" style={{ borderBottom: '1px solid var(--border)' }}>
        <td style={{ padding: '1rem', fontSize: '0.875rem', fontWeight: 600, paddingLeft: `${1 + depth * 2}rem` }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            {depth > 0 && <ChevronRight size={14} style={{ color: 'var(--muted-foreground)' }} />}
            <Boxes size={14} style={{ color: 'var(--muted-foreground)' }} />
            {node.name}
          </div>
        </td>
        <td style={{ padding: '1rem', width: '120px' }}>
          <div style={{ display: 'flex', gap: '0.25rem' }}>
            <EditCapabilityDialog onSuccess={onRefresh} parentId={node.id} trigger={<button className="secondary" style={{ height: '2rem', padding: '0 0.6rem' }} title="Add Sub-capability"><Plus size={14} /></button>} />
            <EditCapabilityDialog capability={node} onSuccess={onRefresh} trigger={<button className="secondary" style={{ height: '2rem', width: '2rem', padding: 0 }}><Edit2 size={14} /></button>} />
            <button onClick={async () => { if(confirm('Delete?')) { await fetch(`/api/capabilities/${node.id}`, {method: 'DELETE'}); onRefresh(); } }} className="secondary" style={{ height: '2rem', width: '2rem', padding: 0, color: 'var(--destructive)' }}><Trash2 size={14} /></button>
          </div>
        </td>
        <td style={{ padding: '1rem' }}>
          {crit && (
            <span style={{ fontSize: '0.65rem', fontWeight: 800, textTransform: 'uppercase', padding: '0.15rem 0.6rem', borderRadius: '4px', background: `${crit.color}20`, color: crit.color, border: `1px solid ${crit.color}40` }}>
              {crit.label}
            </span>
          )}
        </td>
        <td style={{ padding: '1rem', fontSize: '0.875rem' }}>
          <div style={{ display: 'flex', gap: '0.25rem', flexWrap: 'wrap' }}>
            {node.applications?.map(app => (
              <span key={app.id} onClick={() => onSelectApp(app.id)} style={{ cursor: 'pointer', background: 'var(--accent)', padding: '0.1rem 0.4rem', borderRadius: '4px', fontSize: '0.7rem', fontWeight: 500, display: 'flex', alignItems: 'center', gap: '0.25rem' }}><Database size={10} /> {app.name}</span>
            ))}
            {(!node.applications || node.applications.length === 0) && <span style={{ color: 'var(--muted-foreground)' }}>—</span>}
          </div>
        </td>
      </tr>
      {hasChildren && node.children!.map(child => (
        <CapabilityListRow key={child.id} node={child} onRefresh={onRefresh} onSelectApp={onSelectApp} criticalityOptions={criticalityOptions} depth={depth + 1} />
      ))}
    </>
  );
};

const CapabilitiesView = ({ capabilities, onRefresh, onSelectApp }: { capabilities: Capability[], onRefresh: () => void, onSelectApp: (id: string) => void }) => {
  const [viewMode, setViewMode] = useLocalStorage<'grid' | 'list'>('openea_capabilities_view', 'grid');
  
  const { data: picklists } = useQuery<any[]>({
    queryKey: ['picklists'],
    queryFn: async () => {
      const res = await fetch('/api/picklists');
      return res.json();
    }
  });

  const criticalityOptions = picklists?.find(p => p.name === 'criticality')?.options || [];

  const capabilityTree = useMemo(() => {
    if (!capabilities) return [];
    const map = new Map<string, Capability>();
    const roots: Capability[] = [];
    capabilities.forEach(cap => map.set(cap.id, { ...cap, children: [] }));
    map.forEach(cap => { 
      const parentId = cap.parentId === '' ? null : cap.parentId;
      if (parentId && map.has(parentId)) map.get(parentId)!.children!.push(cap); 
      else roots.push(cap); 
    });
    return roots;
  }, [capabilities]);

  return (
    <div>
      <div style={{ marginBottom: '2.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
        <div>
          <h1 style={{ fontSize: '1.875rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '0.75rem' }}><Boxes size={32} /> Business Capabilities</h1>
          <p style={{ color: 'var(--muted-foreground)' }}>Strategic functions of your enterprise. Showing <strong>{capabilities?.length || 0}</strong> areas.</p>
        </div>
        <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
          <div style={{ display: 'flex', background: 'var(--secondary)', padding: '0.25rem', borderRadius: 'var(--radius)', gap: '0.25rem' }}>
            <button onClick={() => setViewMode('grid')} style={{ height: '2rem', padding: '0 0.75rem', border: 'none', background: viewMode === 'grid' ? 'var(--background)' : 'transparent', boxShadow: viewMode === 'grid' ? '0 1px 2px rgba(0,0,0,0.1)' : 'none' }}><LayoutGrid size={16} /></button>
            <button onClick={() => setViewMode('list')} style={{ height: '2rem', padding: '0 0.75rem', border: 'none', background: viewMode === 'list' ? 'var(--background)' : 'transparent', boxShadow: viewMode === 'list' ? '0 1px 2px rgba(0,0,0,0.1)' : 'none' }}><List size={16} /></button>
          </div>
          <EditCapabilityDialog 
            onSuccess={onRefresh} 
            trigger={
              <button className="primary" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <PlusCircle size={18} />
                New Capability
              </button>
            } 
          />
        </div>
      </div>

      {viewMode === 'grid' ? (
        <div className="masonry-grid">
          {capabilityTree.map(cap => (
            <div key={cap.id} className="masonry-item">
              <CapabilityNode node={cap} onRefresh={onRefresh} onSelectApp={onSelectApp} criticalityOptions={criticalityOptions} />
            </div>
          ))}
        </div>
      ) : (
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border)', background: 'var(--muted)' }}>
                <th style={{ padding: '1rem', fontSize: '0.875rem' }}>Capability Name (Hierarchy)</th>
                <th style={{ padding: '1rem', fontSize: '0.875rem', width: '120px' }}>Actions</th>
                <th style={{ padding: '1rem', fontSize: '0.875rem' }}>Criticality</th>
                <th style={{ padding: '1rem', fontSize: '0.875rem' }}>Supporting Applications</th>
              </tr>
            </thead>
            <tbody>
              {capabilityTree.map(cap => (
                <CapabilityListRow key={cap.id} node={cap} onRefresh={onRefresh} onSelectApp={onSelectApp} criticalityOptions={criticalityOptions} />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

const DiagramsView = ({ apps, capabilities, integrations, onEditApp, onEditCapability, isVisible }: { apps: Application[], capabilities: Capability[], integrations: any[], onEditApp: (id: string) => void, onEditCapability: (cap: any) => void, isVisible: boolean }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [filters, setFilters] = useLocalStorage('openea_diagram_filters', { 
 
    search: '', 
    owner: [] as string[], 
    lifecycle: [] as string[], 
    type: [] as string[],
    capabilityId: [] as string[]
  });
  
  // Auto-show filters if any are active
  const isAnyFilterActive = useMemo(() => {
    return filters.search !== '' || filters.owner.length > 0 || filters.lifecycle.length > 0 || filters.type.length > 0 || filters.capabilityId.length > 0;
  }, [filters]);

  const [showFilters, setShowFilters] = useState(isAnyFilterActive);

  const [mode, setMode] = useLocalStorage<'network' | 'landscape' | 'app-landscape'>('openea_diagram_mode', 'landscape');
  const [activeOverlay, setActiveOverlay] = useLocalStorage<string | null>('openea_diagram_overlay', 'lifecycle');
  const [activeCustomOverlays, setActiveCustomOverlays] = useLocalStorage<string[]>('openea_diagram_custom_overlays', []);
  const [showCriticality, setShowCriticality] = useLocalStorage<boolean>('openea_diagram_show_crit', true);
  const [showApplications, setShowApplications] = useLocalStorage<boolean>('meat_diagram_show_apps', true);
  const [showCapabilities, setShowCapabilities] = useLocalStorage<boolean>('meat_diagram_show_caps', true);
  const [hideOrphanApps, setHideOrphanApps] = useLocalStorage<boolean>('meat_diagram_hide_orphans', true);

  const [groupingField, setGroupingField] = useLocalStorage<string | null>('openea_diagram_grouping', null);

  const toggleFullscreen = () => {
    if (!containerRef.current) return;
    if (!document.fullscreenElement) {
      containerRef.current.requestFullscreen().catch(err => {
        console.error(`Error attempting to enable full-screen mode: ${err.message} (${err.name})`);
      });
    } else {
      document.exitFullscreen();
    }
  };

  const { data: picklists } = useQuery<any[]>({ queryKey: ['picklists'], queryFn: async () => { const res = await fetch('/api/picklists'); return res.json(); } });

  const { data: metaDefs } = useQuery<any[]>({ queryKey: ['metadata-definitions'], queryFn: async () => { const res = await fetch('/api/metadata-definitions'); return res.json(); } });

  const overlayMetaDefs = useMemo(() => metaDefs?.filter(d => !['criticality', 'functionalFit', 'technicalFit'].includes(d.fieldName)) || [], [metaDefs]);

  const lifecycleOptions = picklists?.find(p => p.name === 'lifecycle')?.options || [];
  const ownerOptions = picklists?.find(p => p.name === 'owner')?.options || [];
  
  const scoreFields = [
    { id: 'lc', fieldName: 'lifecycle', label: 'Lifecycle', icon: <Activity size={16} style={{ marginRight: '0.5rem' }} /> },
    { id: 'crit', fieldName: 'criticality', label: 'Business Criticality', icon: <ShieldAlert size={16} style={{ marginRight: '0.5rem' }} /> },
    { id: 'func', fieldName: 'functionalFit', label: 'Functional Fit', scaleType: 'bad-good', icon: <Boxes size={16} style={{ marginRight: '0.5rem' }} /> },
    { id: 'tech', fieldName: 'technicalFit', label: 'Technical Fit', scaleType: 'bad-good', icon: <Monitor size={16} style={{ marginRight: '0.5rem' }} /> },
  ];
  const allRangeFields = [...scoreFields];

  const filteredApps = useMemo(() => {
    return apps.filter(app => {
      const matchOwner = filters.owner.length === 0 || filters.owner.includes(app.owner) || filters.owner.includes(app.owner?.toLowerCase());
      const matchLifecycle = filters.lifecycle.length === 0 || filters.lifecycle.includes(app.lifecycle) || filters.lifecycle.includes(app.lifecycle?.toLowerCase());
      const matchType = filters.type.length === 0 || filters.type.includes(app.type) || filters.type.includes(app.type?.toLowerCase());
      
      // Capability Filter Logic
      let matchCap = true;
      if (filters.capabilityId.length > 0) {
        const getDescendantIds = (id: string): string[] => {
          const children = capabilities?.filter(c => c.parentId === id) || [];
          return [id, ...children.flatMap(c => getDescendantIds(c.id))];
        };
        const allTargetIds = filters.capabilityId.flatMap(id => getDescendantIds(id));
        matchCap = app.capabilities?.some(c => allTargetIds.includes(c.id)) || false;
      }

      // --- UNIFIED SEARCH LOGIC ---
      let matchSearch = true;
      if (filters.search) {
        const query = filters.search.toLowerCase();
        const appMatches = app.name.toLowerCase().includes(query) || 
          app.description?.toLowerCase().includes(query) ||
          app.owner?.toLowerCase().includes(query) ||
          app.lifecycle?.toLowerCase().includes(query) ||
          app.type?.toLowerCase().includes(query) ||
          app.capabilities?.some(c => c.name.toLowerCase().includes(query)) ||
          app.metadata?.toLowerCase().includes(query);
        
        // Also match if any of the app's integrations match the query
        const integrationMatches = integrations?.some(i => 
          (i.sourceAppId === app.id || i.targetAppId === app.id) && 
          (i.name?.toLowerCase().includes(query) || i.type?.toLowerCase().includes(query))
        ) || false;

        matchSearch = appMatches || integrationMatches;
      }

      return matchSearch && matchOwner && matchLifecycle && matchType && matchCap;
    });
  }, [apps, filters, capabilities, integrations]);

  const orphanCount = useMemo(() => {
    const appsWithIntegrations = new Set(integrations?.flatMap(i => [i.sourceAppId, i.targetAppId]));
    return filteredApps.filter(a => !appsWithIntegrations.has(a.id)).length;
  }, [filteredApps, integrations]);

  return (
    <div ref={containerRef} style={{ display: 'flex', flexDirection: 'column', height: '100%', position: 'relative', background: 'var(--background)' }}>
      <div style={{ padding: '1rem 2rem', borderBottom: '1px solid var(--border)', background: 'var(--card)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>

        <div><h1 style={{ fontSize: '1.25rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '0.5rem' }}><MapIcon size={24} /> Landscape Diagrams</h1><p style={{ fontSize: '0.75rem', color: 'var(--muted-foreground)' }}>Viewing {filteredApps.length} applications</p></div>
        <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
          
          <div style={{ display: 'flex', background: 'var(--secondary)', padding: '0.25rem', borderRadius: 'var(--radius)', gap: '0.25rem' }}>
            <button onClick={() => setMode('landscape')} style={{ height: '2rem', padding: '0 0.75rem', border: 'none', background: mode === 'landscape' ? 'var(--background)' : 'transparent', boxShadow: mode === 'landscape' ? '0 1px 2px rgba(0,0,0,0.1)' : 'none' }}><Boxes size={16} style={{ marginRight: '0.5rem' }} /> Capability Landscape</button>
            <button onClick={() => setMode('app-landscape')} style={{ height: '2rem', padding: '0 0.75rem', border: 'none', background: mode === 'app-landscape' ? 'var(--background)' : 'transparent', boxShadow: mode === 'app-landscape' ? '0 1px 2px rgba(0,0,0,0.1)' : 'none' }}><Database size={16} style={{ marginRight: '0.5rem' }} /> Application Landscape</button>
            <button onClick={() => setMode('network')} style={{ height: '2rem', padding: '0 0.75rem', border: 'none', background: mode === 'network' ? 'var(--background)' : 'transparent', boxShadow: mode === 'network' ? '0 1px 2px rgba(0,0,0,0.1)' : 'none' }}><Network size={16} style={{ marginRight: '0.5rem' }} /> Integrations</button>
            <button 
              onClick={toggleFullscreen} 
              title="Presentation Mode (Fullscreen)"
              style={{ height: '2rem', padding: '0 0.75rem', border: 'none', background: 'transparent', color: 'var(--muted-foreground)' }}
            >
              <Presentation size={16} style={{ marginRight: '0.5rem' }} /> 
              Presentation
            </button>
          </div>
          {(mode === 'landscape' || mode === 'app-landscape') && (
            <div style={{ display: 'flex', background: 'var(--secondary)', padding: '0.25rem', borderRadius: 'var(--radius)', gap: '0.25rem', alignItems: 'center' }}>
              <span style={{ fontSize: '10px', fontWeight: 700, textTransform: 'uppercase', padding: '0 0.5rem', opacity: 0.6 }}>Group By</span>
              <select 
                value={groupingField || ''} 
                onChange={(e) => setGroupingField(e.target.value || null)}
                style={{ 
                  height: '2rem', 
                  background: 'var(--background)', 
                  border: '1px solid var(--border)', 
                  borderRadius: '4px', 
                  fontSize: '12px', 
                  padding: '0 0.5rem', 
                  cursor: 'pointer', 
                  color: groupingField ? 'var(--primary)' : 'var(--foreground)',
                  fontWeight: groupingField ? 600 : 400,
                  outline: 'none'
                }}
              >
                <option value="">None</option>
                <option value="lifecycle">Lifecycle</option>
                <option value="criticality">Business Criticality</option>
                <option value="functionalFit">Functional Fit</option>
                <option value="technicalFit">Technical Fit</option>
              </select>
            </div>
          )}

          <div style={{ display: 'flex', background: 'var(--secondary)', padding: '0.25rem', borderRadius: 'var(--radius)', gap: '0.25rem' }}>
            {allRangeFields.filter(def => (mode === 'network' || mode === 'app-landscape') || def.fieldName !== 'criticality').map(def => (
              <button key={def.id} onClick={() => setActiveOverlay(def.fieldName)} style={{ height: '2rem', padding: '0 0.75rem', border: 'none', background: activeOverlay === def.fieldName ? 'var(--background)' : 'transparent', boxShadow: activeOverlay === def.fieldName ? '0 1px 2px rgba(0,0,0,0.1)' : 'none', color: activeOverlay === def.fieldName ? 'var(--primary)' : 'var(--muted-foreground)', fontWeight: activeOverlay === def.fieldName ? 600 : 400 }}>{def.icon || null}{def.label}</button>
            ))}
          </div>

          <div style={{ display: 'flex', background: 'var(--secondary)', padding: '0.25rem', borderRadius: 'var(--radius)', gap: '0.25rem' }}>
            {mode === 'landscape' && (
              <button 
                onClick={() => setShowCriticality(!showCriticality)} 
                style={{ height: '2rem', padding: '0 0.75rem', border: 'none', background: showCriticality ? 'var(--background)' : 'transparent', boxShadow: showCriticality ? '0 1px 2px rgba(0,0,0,0.1)' : 'none', color: showCriticality ? 'var(--primary)' : 'var(--muted-foreground)' }}
              >
                <ShieldAlert size={16} style={{ marginRight: '0.5rem' }} />
                Business Criticality
              </button>
            )}
            {mode === 'landscape' && (
              <button 
                onClick={() => setShowApplications(!showApplications)} 
                style={{ height: '2rem', padding: '0 0.75rem', border: 'none', background: showApplications ? 'var(--background)' : 'transparent', boxShadow: showApplications ? '0 1px 2px rgba(0,0,0,0.1)' : 'none', color: showApplications ? 'var(--primary)' : 'var(--muted-foreground)' }}
              >
                {showApplications ? <Eye size={16} style={{ marginRight: '0.5rem' }} /> : <EyeOff size={16} style={{ marginRight: '0.5rem' }} />}
                Apps
              </button>
            )}
            {mode === 'app-landscape' && (
              <button 
                onClick={() => setShowCapabilities(!showCapabilities)} 
                style={{ height: '2rem', padding: '0 0.75rem', border: 'none', background: showCapabilities ? 'var(--background)' : 'transparent', boxShadow: showCapabilities ? '0 1px 2px rgba(0,0,0,0.1)' : 'none', color: showCapabilities ? 'var(--primary)' : 'var(--muted-foreground)' }}
              >
                {showCapabilities ? <Eye size={16} style={{ marginRight: '0.5rem' }} /> : <EyeOff size={16} style={{ marginRight: '0.5rem' }} />}
                Capabilities
              </button>
            )}

            {mode === 'network' && (
              <button 
                onClick={() => setHideOrphanApps(!hideOrphanApps)} 
                title={hideOrphanApps ? `Currently hiding ${orphanCount} apps without integrations` : "Show apps without integrations"}
                style={{ height: '2rem', padding: '0 0.75rem', border: 'none', background: hideOrphanApps ? 'var(--background)' : 'transparent', boxShadow: hideOrphanApps ? '0 1px 2px rgba(0,0,0,0.1)' : 'none', color: hideOrphanApps ? 'var(--primary)' : 'var(--muted-foreground)' }}
              >
                {hideOrphanApps ? <EyeOff size={16} style={{ marginRight: '0.5rem' }} /> : <Eye size={16} style={{ marginRight: '0.5rem' }} />}
                Hide Orphans {hideOrphanApps && orphanCount > 0 ? `(${orphanCount})` : ''}
              </button>
            )}
          </div>
          
          {overlayMetaDefs.length > 0 && (
            <div style={{ width: '180px' }}>
              <MultiSelect 
                label=""
                options={overlayMetaDefs.map(d => ({ value: d.fieldName, label: `${d.label} (${d.entityType === 'Application' ? 'App' : 'Cap'})` }))}
                selectedValues={activeCustomOverlays}
                onChange={setActiveCustomOverlays}
                placeholder="Custom Labels..."
              />
            </div>
          )}

          <button onClick={() => setShowFilters(!showFilters)} style={{ height: '2.5rem', padding: '0 0.75rem', border: '1px solid var(--border)', background: showFilters ? 'var(--accent)' : 'var(--background)', marginTop: '0.25rem' }}><Filter size={16} style={{ marginRight: '0.5rem' }} /> Filters</button>
        </div>
      </div>
      {showFilters && (
        <div style={{ padding: '1rem 2rem', borderBottom: '1px solid var(--border)', background: 'var(--card)', flexShrink: 0 }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '1rem', alignItems: 'flex-end' }}>
            <SearchInput label="Diagram Search" value={filters.search} onChange={(val) => setFilters({...filters, search: val})} placeholder="App or Integration name..." />
            <MultiSelect label="Owner" options={ownerOptions} selectedValues={filters.owner} onChange={(val) => setFilters({...filters, owner: val})} placeholder="All Owners" />
            <MultiSelect label="Capability Area" options={capabilities?.map((c: any) => ({ value: c.id, label: c.name })) || []} selectedValues={filters.capabilityId} onChange={(val) => setFilters({...filters, capabilityId: val})} placeholder="All Areas" />
            <MultiSelect label="Lifecycle" options={lifecycleOptions} selectedValues={filters.lifecycle} onChange={(val) => setFilters({...filters, lifecycle: val})} placeholder="All Lifecycles" />
            
            <button onClick={() => setFilters({ search: '', owner: [], lifecycle: [], type: [], capabilityId: [] })} style={{ height: '2.5rem', borderColor: 'transparent', color: 'var(--muted-foreground)' }}><X size={16} style={{ marginRight: '0.5rem' }} /> Clear</button>
          </div>
        </div>
      )}
      <div style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
        <ApplicationDiagram 
          onNodeClick={(app) => onEditApp(app.id)} 
          onCapabilityClick={onEditCapability} 
          apps={apps || []}
          filteredApps={filteredApps}
          integrations={integrations || []}
          capabilities={capabilities || []}
          metaDefs={metaDefs || []}
          picklists={picklists || []}

          mode={mode} 
          activeOverlay={activeOverlay} 
          activeCustomOverlays={activeCustomOverlays}
          showApplications={showApplications} 
          showCapabilities={showCapabilities}
          hideOrphanApps={hideOrphanApps}
          showCriticality={showCriticality} 
          filters={filters}
          groupingField={groupingField}
          relationSearch={filters.search} 
          visible={isVisible}
        />
      </div>
    </div>
  );
};

export default function App() { return ( <QueryClientProvider client={queryClient}><AppContent /></QueryClientProvider> ); }
