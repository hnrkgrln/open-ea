import React, { useState, useMemo, useCallback, useEffect, useLayoutEffect, useRef, useTransition } from 'react';
import { QueryClient, QueryClientProvider, useQuery, useQueryClient } from '@tanstack/react-query';
import { BrowserRouter, Routes, Route, useNavigate, useParams, Link, NavLink, Navigate, useLocation, useSearchParams } from 'react-router-dom';
import { Database, Network, Plus, Boxes, ChevronRight, ChevronDown, ChevronsDown, ChevronsUp, Edit2, LayoutGrid, List, Filter, X, Settings, Map as MapIcon, ShieldAlert, Eye, EyeOff, Trash2, PlusCircle, Download, Layers, LayoutDashboard, Lightbulb } from 'lucide-react';
import { AppDetailsView } from './components/AppDetailsView';
import { ApplicationDiagram } from './components/ApplicationDiagram';
import { CapabilityDetailsView } from './components/CapabilityDetailsView';
import { EditAppPage } from './components/EditAppPage';
import { EditCapabilityPage } from './components/EditCapabilityPage';
import { OrganizationsView } from './components/OrganizationsView';
import { OrganizationDetailsView } from './components/OrganizationDetailsView';
import { EditOrganizationPage } from './components/EditOrganizationPage';
import { InformationView } from './components/InformationView';
import { InformationDetailsView } from './components/InformationDetailsView';
import { EditInformationPage } from './components/EditInformationPage';
import { IntegrationsView } from './components/IntegrationsView';
import { IntegrationDetailsView } from './components/IntegrationDetailsView';
import { EditIntegrationPage } from './components/EditIntegrationPage';
import { ThemeToggle } from './components/ThemeToggle';
import { UnifiedSearch } from './components/UnifiedSearch';
import { LifecycleBadge } from './components/LifecycleBadge';
import { PicklistsView } from './components/PicklistsView';
import { FilterDot, SearchInput, MultiSelect } from './components/FilterControls';
import { ColoredSelect } from './components/ColoredSelect';
import { TimeDashboardView } from './components/TimeDashboardView';
import { InsightsView } from './components/InsightsView';
import { PortfolioChatProvider } from './components/PortfolioChat';
import { ModelMenu } from './components/ModelMenu';
import { AspectsMenu } from './components/AspectsMenu';
import { TIME_OPTIONS, DEFAULT_TIME_THRESHOLDS, getAppTimeAssessment, type TimeThresholds } from './timeAssessment';

export { TIME_OPTIONS, DEFAULT_TIME_THRESHOLDS, getAppTimeAssessment, readStoredTimeThresholds } from './timeAssessment';
export type { TimeThresholds } from './timeAssessment';

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

const selectedValue = (selected: string[] | undefined, value: string | null | undefined) => {
  if (!selected || selected.length === 0) return true;
  const raw = value ?? '';
  const lower = raw.toLowerCase();
  return selected.some((item) => item === raw || item.toLowerCase() === lower);
};

const selectedCrud = (selected: string[] | undefined, crud: string | null | undefined) => {
  if (!selected || selected.length === 0) return true;
  const ops = (crud || '').split(',').map((part) => part.trim()).filter(Boolean);
  return selected.some((item) => ops.some((op) => op === item || op.toLowerCase() === item.toLowerCase()));
};

const matchesAnyValue = (selected: string[] | undefined, values: Array<string | null | undefined>) => {
  if (!selected || selected.length === 0) return true;
  return values.some((value) => {
    const raw = value ?? '';
    const lower = raw.toLowerCase();
    return selected.some((item) => item === raw || item.toLowerCase() === lower);
  });
};

// Custom hook for persisted state
export function useLocalStorage<T>(key: string, initialValue: T): [T, (value: T | ((val: T) => T)) => void] {
  const [storedValue, setStoredValue] = useState<T>(() => {
    try {
      const item = window.localStorage.getItem(key);
      if (!item) return initialValue;
      const parsed = JSON.parse(item);
      if (typeof initialValue === 'object' && initialValue !== null && !Array.isArray(initialValue)) {
        return { ...initialValue, ...parsed };
      }
      return parsed;
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
      staleTime: 0,
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
  ownerOrgId?: string;
  ownerOrg?: Organization;
  lifecycle: string;
  lifecycleStartDate?: string;
  lifecycleEndDate?: string;
  contractStartDate?: string;
  contractEndDate?: string;
  contractDetails?: string;
  vendorName?: string;
  vendorUrl?: string;
  vendorSummary?: string;
  type: string;
  criticality: string;
  cost?: string;
  functionalFit: string;
  technicalFit: string;
  timeRationale?: string;
  metadata?: string;
  references?: string;
  capabilities?: Capability[];
  processedInformationObjects?: InformationObject[];
  createdAt: string;
  updatedAt: string;
}

interface Capability {
  id: string;
  name: string;
  description?: string;
  criticality: string;
  parentId?: string | null;
  references?: string;
  children?: Capability[];
  applications?: { id: string; name: string }[];
}

interface Organization {
  id: string;
  name: string;
  description?: string;
  type?: string;
  parentId?: string | null;
  children?: Organization[];
  informationObjects?: InformationObject[];
  ownedApplications?: Application[];
}

interface InformationObject {
  id: string;
  name: string;
  aliases?: string;
  description?: string;
  confidentiality?: string;
  integrity?: string;
  availability?: string;
  piiCategory?: string;
  type?: string;
  metadata?: string;
  businessOwnerId?: string | null;
  businessOwner?: Organization;
  appOwnerId?: string | null;
  appOwner?: Application;
  integrations?: Integration[];
}

interface Integration {
  id: string;
  name: string;
  sourceAppId: string;
  targetAppId: string;
  infoObjectId?: string | null;
  pattern?: string;
  frequency?: string;
  crud?: string;
  sourceApp: Application;
  targetApp: Application;
  payload?: InformationObject;
}

// Layout component for shared UI elements
const Layout = ({ children, brandName, onRefresh }: { children: React.ReactNode, brandName: string, onRefresh: () => void }) => {
  const navigate = useNavigate();
  const location = useLocation();
  const isFullWidth = location.pathname.startsWith('/diagrams');
  const headerRef = useRef<HTMLElement>(null);

  // The search stays a fixed 280px control centered on the header when that fits.
  // A narrower window, or a long brand name, would otherwise cover Diagrams, so
  // place it in the gap between the nav and Settings, narrow it if that gap is
  // tight, and only then collapse the labels to icons.
  useLayoutEffect(() => {
    const header = headerRef.current;
    if (!header) return;
    const start = header.querySelector<HTMLElement>('.header-start');
    const search = header.querySelector<HTMLElement>('.header-search');
    const end = header.querySelector<HTMLElement>('.header-end');
    if (!start || !search || !end) return;

    const GAP = 12;
    const MAX_WIDTH = 280;
    const MIN_WIDTH = 168;

    const place = () => {
      delete header.dataset.headerFit;
      search.style.left = '';
      search.style.width = '';
      search.style.transform = '';

      const limits = () => {
        const headerBox = header.getBoundingClientRect();
        const leftLimit = start.getBoundingClientRect().right + GAP;
        const rightLimit = end.getBoundingClientRect().left - GAP;
        return { headerBox, leftLimit, rightLimit, available: rightLimit - leftLimit };
      };

      let box = limits();
      if (box.available < MIN_WIDTH) {
        header.dataset.headerFit = 'compact';
        box = limits();
      }

      const width = Math.min(MAX_WIDTH, Math.max(0, box.available));
      const naturalLeft = box.headerBox.left + (box.headerBox.width - width) / 2;
      const fitsCenter = naturalLeft >= box.leftLimit - 0.5 && naturalLeft + width <= box.rightLimit + 0.5;
      if (fitsCenter && width >= MAX_WIDTH - 0.5) return;

      const leftEdge = fitsCenter
        ? naturalLeft
        : box.leftLimit + Math.max(0, (box.available - width) / 2);
      search.style.width = `${width}px`;
      search.style.left = `${leftEdge - box.headerBox.left}px`;
      search.style.transform = 'translateY(-50%)';
    };

    place();
    const observer = new ResizeObserver(place);
    observer.observe(header);
    let cancelled = false;
    document.fonts?.ready.then(() => {
      if (!cancelled) place();
    });
    return () => {
      cancelled = true;
      observer.disconnect();
    };
  }, [brandName]);

  return (
    <PortfolioChatProvider>
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', minHeight: 0 }}>
      <header ref={headerRef} className="header" style={{ flexShrink: 0, position: 'relative' }}>
        <div className="header-start">
          <Link to="/insights" className="logo" title={brandName} style={{ textDecoration: 'none', fontSize: '1.25rem' }}>{brandName}</Link>
          <nav className="nav">
            <NavLink to="/insights" title="Insights" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`} style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.9rem' }}><Lightbulb size={16} /><span className="header-label">Insights</span></NavLink>
            <NavLink to="/apps" title="Applications" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`} style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.9rem' }}><Database size={16} /><span className="header-label">Applications</span></NavLink>
            <ModelMenu />
            <NavLink to="/diagrams" title="Diagrams" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`} style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.9rem' }}><MapIcon size={16} /><span className="header-label">Diagrams</span></NavLink>
          </nav>
        </div>
        <div className="header-search">
          <UnifiedSearch />
        </div>
        <div className="header-end">
          <NavLink to="/settings" title="Settings" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.9rem' }}><Settings size={20} /><span className="header-label">Settings</span></NavLink>
          <ThemeToggle />
        </div>
      </header>
      <main className={isFullWidth ? "main-full" : "main-container"}>
        {children}
      </main>
    </div>
    </PortfolioChatProvider>
  );
};

// Application Detail Wrapper for Route
// Default: go "up a level" to the list/index page. This avoids landing on a
// stale create form after saving. Honor browser history only when the page was
// opened from a context-rich origin (e.g. a diagram), signaled via location.state.from.
const useSmartBack = (fallback: string) => {
  const navigate = useNavigate();
  const location = useLocation();
  return () => {
    const from = (location.state as { from?: string } | null)?.from;
    if (from && location.key !== 'default') navigate(-1);
    else navigate(fallback);
  };
};

const AppDetailWrapper = ({ onRefresh, timeThresholds }: { onRefresh: () => void; timeThresholds?: TimeThresholds }) => {
  const { id } = useParams<{ id: string }>();
  return <AppDetailsView appId={id || ''} onBack={useSmartBack('/apps')} onRefresh={onRefresh} thresholds={timeThresholds} />;
};

// Capability Detail Wrapper for Route
const CapabilityDetailWrapper = ({ onRefresh }: { onRefresh: () => void }) => {
  const { id } = useParams<{ id: string }>();
  return <CapabilityDetailsView capabilityId={id || ''} onBack={useSmartBack('/capabilities')} onRefresh={onRefresh} />;
};

// Organization Detail Wrapper for Route
const OrganizationDetailWrapper = ({ onRefresh }: { onRefresh: () => void }) => {
  const { id } = useParams<{ id: string }>();
  return <OrganizationDetailsView orgId={id || ''} onBack={useSmartBack('/organizations')} onRefresh={onRefresh} />;
};

// Information Object Detail Wrapper for Route
const InformationDetailWrapper = ({ onRefresh }: { onRefresh: () => void }) => {
  const { id } = useParams<{ id: string }>();
  return <InformationDetailsView infoId={id || ''} onBack={useSmartBack('/information')} onRefresh={onRefresh} />;
};

// Integration Detail Wrapper for Route
const IntegrationDetailWrapper = ({ onRefresh }: { onRefresh: () => void }) => {
  const { id } = useParams<{ id: string }>();
  return <IntegrationDetailsView integrationId={id || ''} onBack={useSmartBack('/integrations')} onRefresh={onRefresh} />;
};

const DEFAULT_BRAND_NAME = 'OpenEA';
const LEGACY_BRAND_KEY = 'openea_brand_name';

function readLegacyBrandName(): string | null {
  try {
    const raw = window.localStorage.getItem(LEGACY_BRAND_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (typeof parsed !== 'string') return null;
    const name = parsed.trim();
    return name || null;
  } catch {
    return null;
  }
}

const AppContent = () => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { data: workspace, isLoading: isWorkspaceLoading, isError: isWorkspaceError } = useQuery<{ brandName: string }>({
    queryKey: ['workspace'],
    queryFn: async () => {
      const res = await fetch('/api/workspace');
      if (!res.ok) throw new Error('Could not load workspace settings');
      return res.json();
    },
  });
  const [brandName, setBrandNameState] = useState(DEFAULT_BRAND_NAME);
  const [brandError, setBrandError] = useState('');
  const brandDirty = useRef(false);
  const brandWrite = useRef(0);
  const brandSaveTimer = useRef<number | null>(null);
  const brandMigrated = useRef(false);

  const saveBrandName = useCallback(async (name: string, writeId: number) => {
    const res = await fetch('/api/workspace', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ brandName: name }),
    });
    if (writeId !== brandWrite.current) return;
    if (!res.ok) {
      setBrandError('Could not save the brand name.');
      return;
    }
    const saved = await res.json() as { brandName: string };
    queryClient.setQueryData(['workspace'], saved);
    brandDirty.current = false;
    setBrandError('');
    setBrandNameState(saved.brandName);
  }, [queryClient]);

  useEffect(() => {
    if (!workspace || brandDirty.current) return;
    setBrandNameState(workspace.brandName || DEFAULT_BRAND_NAME);
  }, [workspace]);

  useEffect(() => {
    document.title = brandName.trim() || DEFAULT_BRAND_NAME;
  }, [brandName]);

  useEffect(() => {
    if (!workspace || brandMigrated.current) return;
    brandMigrated.current = true;
    const legacy = readLegacyBrandName();
    window.localStorage.removeItem(LEGACY_BRAND_KEY);
    if (!legacy || legacy === workspace.brandName || workspace.brandName !== DEFAULT_BRAND_NAME) return;
    brandDirty.current = true;
    brandWrite.current += 1;
    setBrandNameState(legacy);
    void saveBrandName(legacy, brandWrite.current);
  }, [workspace, saveBrandName]);

  useEffect(() => () => {
    if (brandSaveTimer.current) window.clearTimeout(brandSaveTimer.current);
  }, []);

  const setBrandName = useCallback((value: string) => {
    brandDirty.current = true;
    setBrandError('');
    setBrandNameState(value);
    const writeId = ++brandWrite.current;
    if (brandSaveTimer.current) window.clearTimeout(brandSaveTimer.current);
    brandSaveTimer.current = window.setTimeout(() => {
      if (writeId !== brandWrite.current) return;
      const trimmed = value.trim();
      if (!trimmed) {
        brandDirty.current = false;
        const current = queryClient.getQueryData<{ brandName: string }>(['workspace']);
        setBrandNameState(current?.brandName || DEFAULT_BRAND_NAME);
        return;
      }
      void saveBrandName(trimmed, writeId);
    }, 400);
  }, [queryClient, saveBrandName]);

  const [timeThresholds, setTimeThresholds] = useLocalStorage<TimeThresholds>('openea_time_thresholds', DEFAULT_TIME_THRESHOLDS);

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

  const { data: organizations } = useQuery({
    queryKey: ['organizations'],
    queryFn: async () => {
      const res = await fetch('/api/organizations');
      return res.json() as Promise<Organization[]>;
    }
  });

  const { data: informationObjects } = useQuery({
    queryKey: ['information-objects'],
    queryFn: async () => {
      const res = await fetch('/api/information-objects');
      return res.json() as Promise<InformationObject[]>;
    }
  });

  const { data: integrations } = useQuery({
    queryKey: ['integrations'],
    queryFn: async () => {
      const res = await fetch('/api/integrations');
      return res.json() as Promise<Integration[]>;
    }
  });

  const { data: picklists, isLoading: isPicklistsLoading } = useQuery({
    queryKey: ['picklists'],
    queryFn: async () => {
      const res = await fetch('/api/picklists');
      return res.json();
    }
  });

  const isInitialLoading = !apps || !capabilities || !organizations || !informationObjects || !integrations || isPicklistsLoading || (isWorkspaceLoading && !isWorkspaceError);

  if (isInitialLoading) {
    return (
      <div className="loading-overlay">
        <div className="loading-logo">{brandName}</div>
        <div className="loading-text">Architecting your enterprise...</div>
      </div>
    );
  }

  return (
    <Layout brandName={brandName} onRefresh={handleRefresh}>
      <Routes>
        <Route path="/" element={<Navigate to="/insights" replace />} />
        <Route path="/insights" element={
          <InsightsView
            apps={apps || []}
            capabilities={capabilities || []}
            organizations={organizations || []}
            informationObjects={informationObjects || []}
            integrations={integrations || []}
            thresholds={timeThresholds}
          />
        } />

        {/* Application Routes */}
        <Route path="/apps" element={
          <InventoryView
            apps={apps || []}
            capabilities={capabilities || []}
            organizations={organizations || []}
            onSelectApp={(id) => navigate(`/apps/${id}`)}
            onEditApp={(app) => navigate(`/apps/${app.id}/edit`)}
            onNewApp={<button onClick={() => navigate('/apps/new')} className="primary" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}><PlusCircle size={18} /> New Application</button>}
            timeThresholds={timeThresholds}
          />
        } />
        <Route path="/apps/new" element={<EditAppPage timeThresholds={timeThresholds} />} />
        <Route path="/apps/:id" element={<AppDetailWrapper onRefresh={handleRefresh} timeThresholds={timeThresholds} />} />
        <Route path="/apps/:id/edit" element={<EditAppPage timeThresholds={timeThresholds} />} />

        {/* Capability Routes */}
        <Route path="/capabilities" element={
          <CapabilitiesView capabilities={capabilities || []} onRefresh={handleRefresh} onSelectApp={(id) => navigate(`/apps/${id}`)} />
        } />
        <Route path="/capabilities/new" element={<EditCapabilityPage />} />
        <Route path="/capabilities/:id" element={<CapabilityDetailWrapper onRefresh={handleRefresh} />} />
        <Route path="/capabilities/:id/edit" element={<EditCapabilityPage />} />

        {/* Organization Routes */}
        <Route path="/organizations" element={
          <OrganizationsView organizations={organizations || []} onRefresh={handleRefresh} />
        } />
        <Route path="/organizations/new" element={<EditOrganizationPage />} />
        <Route path="/organizations/:id" element={<OrganizationDetailWrapper onRefresh={handleRefresh} />} />
        <Route path="/organizations/:id/edit" element={<EditOrganizationPage />} />

        {/* Information Routes */}
        <Route path="/information" element={
          <InformationView informationObjects={informationObjects || []} onRefresh={handleRefresh} />
        } />
        <Route path="/information/new" element={<EditInformationPage />} />
        <Route path="/information/:id" element={<InformationDetailWrapper onRefresh={handleRefresh} />} />
        <Route path="/information/:id/edit" element={<EditInformationPage />} />

        {/* Integration Routes */}
        <Route path="/integrations" element={
          <IntegrationsView integrations={integrations || []} onRefresh={handleRefresh} />
        } />
        <Route path="/integrations/new" element={<EditIntegrationPage />} />
        <Route path="/integrations/:id" element={<IntegrationDetailWrapper onRefresh={handleRefresh} />} />
        <Route path="/integrations/:id/edit" element={<EditIntegrationPage />} />

        <Route path="/diagrams" element={
          <DiagramsView 
            apps={apps || []} 
            capabilities={capabilities || []}
            organizations={organizations || []}
            informationObjects={informationObjects || []}
            integrations={integrations || []}
            isVisible={true}
            timeThresholds={timeThresholds}
          />
        } />
        <Route path="/settings" element={
          <PicklistsView 
            brandName={brandName} 
            onUpdateBrand={setBrandName}
            brandError={brandError} 
            apps={apps || []} 
            capabilities={capabilities || []} 
            organizations={organizations || []} 
            informationObjects={informationObjects || []} 
            integrations={integrations || []} 
            onRefresh={handleRefresh} 
            timeThresholds={timeThresholds}
            onUpdateTimeThresholds={setTimeThresholds}
          />
        } />
      </Routes>
    </Layout>
  );
};
const InventoryView = ({ apps, capabilities: allCapabilities, organizations, onSelectApp, onEditApp, onNewApp, timeThresholds = DEFAULT_TIME_THRESHOLDS }: { apps: Application[], capabilities: Capability[], organizations: any[], onSelectApp: (id: string) => void, onEditApp: (app: any) => void, onNewApp: React.ReactNode, timeThresholds?: TimeThresholds }) => {
  const navigate = useNavigate();
  const [viewMode, setViewMode] = useLocalStorage<'grid' | 'list' | 'dashboard'>('openea_inventory_view', 'grid');
  const [filters, setFilters] = useLocalStorage('openea_inventory_filters', { 
    search: '', 
    owner: [] as string[], 
    ownerOrgId: [] as string[],
    lifecycle: [] as string[], 
    type: [] as string[],
    criticality: [] as string[],
    cost: [] as string[],
    functionalFit: [] as string[],
    technicalFit: [] as string[],
    time: [] as string[],
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

  // Auto-show the filters panel when a panel filter is already applied. Quick filter stays outside that panel.
  const isPanelFilterActive = useMemo(() => {
    const hasCustom = Object.values(filters.custom || {}).some(vals => vals.length > 0);
    return filters.owner.length > 0 || (filters.ownerOrgId?.length || 0) > 0 || filters.lifecycle.length > 0 || filters.type.length > 0 || filters.criticality.length > 0 || (filters.cost?.length || 0) > 0 || filters.functionalFit.length > 0 || filters.technicalFit.length > 0 || (filters.time?.length || 0) > 0 || hasCustom;
  }, [filters]);

  const [showFilters, setShowFilters] = useState(isPanelFilterActive);

  const lifecycleOptions = picklists?.find(p => p.name === 'lifecycle')?.options || [];
  const ownerOptions = picklists?.find(p => p.name === 'owner')?.options || [];
  const appTypeOptions = picklists?.find(p => p.name === 'application_type')?.options || [];
  
  const criticalityOptions = picklists?.find(p => p.name === 'criticality')?.options || [];
  const costOptions = picklists?.find(p => p.name === 'application_cost')?.options || [];
  const funcFitOptions = picklists?.find(p => p.name === 'functional_fit')?.options || [];
  const techFitOptions = picklists?.find(p => p.name === 'technical_fit')?.options || [];

  const scoreFields = [
    { id: 'crit', fieldName: 'criticality', label: 'Criticality', scaleType: 'importance', min: 1, max: 5 },
    { id: 'cost', fieldName: 'cost', label: 'Cost', scaleType: 'good-bad', min: 1, max: 5 },
    { id: 'func', fieldName: 'functionalFit', label: 'Functional Fit', scaleType: 'bad-good', min: 1, max: 5 },
    { id: 'tech', fieldName: 'technicalFit', label: 'Technical Fit', scaleType: 'bad-good', min: 1, max: 5 },
  ];
  const customRangeFields = appMetaDefs.filter(d => d.fieldType === 'range' && !['criticality', 'cost', 'functionalFit', 'technicalFit'].includes(d.fieldName)) || [];
  const allRangeFields = [...scoreFields, ...customRangeFields];

  // Active applications (excluding decommissioned)
  const activeApps = useMemo(() => {
    if (!apps) return [];
    return apps.filter(app => (app.lifecycle || '').toLowerCase() !== 'decommissioned');
  }, [apps]);

  const filteredApps = useMemo(() => {
    if (!apps) return [];
    return apps.filter(app => {
      const isDecommissioned = (app.lifecycle || '').toLowerCase() === 'decommissioned';
      
      // If user hasn't explicitly selected lifecycle filters, hide decommissioned apps by default
      if (filters.lifecycle.length === 0 && isDecommissioned) {
        return false;
      }

      const matchSearch = !filters.search || 
        app.name.toLowerCase().includes(filters.search.toLowerCase()) || 
        app.description?.toLowerCase().includes(filters.search.toLowerCase()) ||
        app.owner?.toLowerCase().includes(filters.search.toLowerCase()) ||
        app.lifecycle?.toLowerCase().includes(filters.search.toLowerCase()) ||
        app.type?.toLowerCase().includes(filters.search.toLowerCase()) ||
        app.timeRationale?.toLowerCase().includes(filters.search.toLowerCase()) ||
        app.vendorName?.toLowerCase().includes(filters.search.toLowerCase()) ||
        app.vendorSummary?.toLowerCase().includes(filters.search.toLowerCase()) ||
        app.capabilities?.some(c => c.name.toLowerCase().includes(filters.search.toLowerCase())) ||
        app.metadata?.toLowerCase().includes(filters.search.toLowerCase());
      const matchOwner = filters.owner.length === 0 || filters.owner.includes(app.owner) || filters.owner.includes(app.owner?.toLowerCase());
      const matchOwnerOrg = (filters.ownerOrgId?.length || 0) === 0 || filters.ownerOrgId.includes(app.ownerOrgId || '');
      const matchLifecycle = filters.lifecycle.length === 0 || filters.lifecycle.includes(app.lifecycle) || filters.lifecycle.includes(app.lifecycle?.toLowerCase());
      const matchType = filters.type.length === 0 || filters.type.includes(app.type) || filters.type.includes(app.type?.toLowerCase());
      
      const getRecursiveMaxCrit = (capIds: string[]): number => {
        let max = 0;
        capIds.forEach(id => {
          const cap = allCapabilities.find(c => c.id === id);
          if (cap) {
            max = Math.max(max, Number(cap.criticality || 1));
            const childIds = (allCapabilities.filter(c => c.parentId === id) || []).map(c => c.id);
            if (childIds.length > 0) max = Math.max(max, getRecursiveMaxCrit(childIds));
          }
        });
        return max;
      };

      const inheritedCrit = (app.capabilities && app.capabilities.length > 0)
        ? String(Math.max(Number(app.criticality || 1), getRecursiveMaxCrit(app.capabilities.map(c => c.id))))
        : String(app.criticality || 1);

      const matchCrit = filters.criticality.length === 0 || filters.criticality.includes(inheritedCrit);
      const matchCost = (filters.cost?.length || 0) === 0 || filters.cost.includes(app.cost || '1');
      const matchFunc = filters.functionalFit.length === 0 || filters.functionalFit.includes(app.functionalFit);
      const matchTech = filters.technicalFit.length === 0 || filters.technicalFit.includes(app.technicalFit);
      
      const appTime = getAppTimeAssessment(app, timeThresholds)?.value;
      const matchTime = (filters.time?.length || 0) === 0 || (appTime && filters.time.includes(appTime));

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

      return matchSearch && matchOwner && matchOwnerOrg && matchLifecycle && matchType && matchCrit && matchCost && matchFunc && matchTech && matchTime && matchCustom;
    });
  }, [apps, filters, timeThresholds]);

  const clearFilters = () => setFilters({ 
    search: '', owner: [], ownerOrgId: [], lifecycle: [], type: [], 
    criticality: [], cost: [], functionalFit: [], technicalFit: [], time: [],
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

  const exportToCSV = () => {
    if (filteredApps.length === 0) return;
    
    // Define headers
    const headers = ['Name', 'Description', 'Owner', 'Owning Organization', 'Type', 'Lifecycle', 'Lifecycle Start', 'Lifecycle End', 'Contract Start', 'Contract End', 'Contract Details', 'Vendor', 'Vendor Home Page', 'Vendor Summary', 'Criticality', 'Cost', 'Functional Fit', 'Technical Fit', 'TIME Rationale', 'Capabilities', 'Processed Information', 'References'];
    const customHeaders = appMetaDefs.map(d => d.label);
    const allHeaders = [...headers, ...customHeaders];

    const csvContent = [
      allHeaders.join(','),
      ...filteredApps.map(app => {
        const meta = safeJsonParse(app.metadata);
        const caps = (app.capabilities || []).map(c => c.name).join('; ');
        const processed = (app.processedInformationObjects || []).map(io => io.name).join('; ');
        const cell = (value: unknown) => `"${String(value ?? '').replace(/"/g, '""')}"`;
        
        const row = [
          cell(app.name),
          cell(app.description),
          cell(ownerOptions.find((o: any) => o.value === app.owner)?.label || app.owner),
          cell(app.ownerOrg?.name),
          cell(appTypeOptions.find((o: any) => o.value === app.type)?.label || app.type),
          cell(app.lifecycle),
          cell(app.lifecycleStartDate ? app.lifecycleStartDate.split('T')[0] : ''),
          cell(app.lifecycleEndDate ? app.lifecycleEndDate.split('T')[0] : ''),
          cell(app.contractStartDate ? app.contractStartDate.split('T')[0] : ''),
          cell(app.contractEndDate ? app.contractEndDate.split('T')[0] : ''),
          cell(app.contractDetails),
          cell(app.vendorName),
          cell(app.vendorUrl),
          cell(app.vendorSummary),
          cell(app.criticality),
          cell(app.cost),
          cell(app.functionalFit),
          cell(app.technicalFit),
          cell(app.timeRationale),
          cell(caps),
          cell(processed),
          cell(app.references)
        ];

        // Add custom fields
        appMetaDefs.forEach(def => {
          row.push(`"${meta[def.fieldName] || ''}"`);
        });

        return row.join(',');
      })
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `openea_inventory_export_${new Date().toISOString().split('T')[0]}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div>
      <div style={{ marginBottom: '1.25rem', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
        <div>
          <h1 style={{ fontSize: '1.25rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '0.6rem' }}><Database size={24} /> Application Inventory</h1>
          <p style={{ color: 'var(--muted-foreground)', fontSize: '0.9rem' }}>
            Total of <strong>{activeApps.length}</strong> active applications{apps && apps.length > activeApps.length && ` (${apps.length - activeApps.length} decommissioned)`}. Showing <strong>{filteredApps.length}</strong> after filters.
          </p>
        </div>
        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
          <div style={{ width: '220px' }}>
            <SearchInput
              value={filters.search}
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
            <button title="TIME Dashboard" onClick={() => setViewMode('dashboard')} style={{ height: '2.2rem', padding: '0 0.6rem', border: 'none', background: viewMode === 'dashboard' ? 'var(--background)' : 'transparent', boxShadow: viewMode === 'dashboard' ? '0 1px 2px rgba(0,0,0,0.1)' : 'none' }}><LayoutDashboard size={16} /></button>
            <button title="Grid View" onClick={() => setViewMode('grid')} style={{ height: '2.2rem', padding: '0 0.6rem', border: 'none', background: viewMode === 'grid' ? 'var(--background)' : 'transparent', boxShadow: viewMode === 'grid' ? '0 1px 2px rgba(0,0,0,0.1)' : 'none' }}><LayoutGrid size={16} /></button>
            <button title="Table View" onClick={() => setViewMode('list')} style={{ height: '2.2rem', padding: '0 0.6rem', border: 'none', background: viewMode === 'list' ? 'var(--background)' : 'transparent', boxShadow: viewMode === 'list' ? '0 1px 2px rgba(0,0,0,0.1)' : 'none' }}><List size={16} /></button>
          </div>
          {React.cloneElement(onNewApp as React.ReactElement<any>, { style: { ...(onNewApp as React.ReactElement<any>).props?.style, height: '2.2rem', fontSize: '0.9rem' } })}
        </div>
      </div>
      {showFilters && (
        <div className="card" style={{ marginBottom: '1.25rem', background: 'var(--background)', padding: '1rem' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: '0.75rem', alignItems: 'flex-end' }}>
            <MultiSelect label="Owning Org" options={organizations?.map(o => ({ value: o.id, label: o.name })) || []} selectedValues={filters.ownerOrgId || []} onChange={(val) => setFilters({...filters, ownerOrgId: val})} placeholder="All" style={{ height: '2.2rem', fontSize: '0.9rem' }} />
            <MultiSelect label="Owner" options={ownerOptions} selectedValues={filters.owner || []} onChange={(val) => setFilters({...filters, owner: val})} placeholder="All" style={{ height: '2.2rem', fontSize: '0.9rem' }} />
            <MultiSelect label="Type" options={appTypeOptions} selectedValues={filters.type || []} onChange={(val) => setFilters({...filters, type: val})} placeholder="All" style={{ height: '2.2rem', fontSize: '0.9rem' }} />
            <MultiSelect label="Lifecycle" options={lifecycleOptions} selectedValues={filters.lifecycle || []} onChange={(val) => setFilters({...filters, lifecycle: val})} placeholder="All" style={{ height: '2.2rem', fontSize: '0.9rem' }} />
            
            <MultiSelect label="Criticality" options={criticalityOptions} selectedValues={filters.criticality || []} onChange={(val) => setFilters({...filters, criticality: val})} placeholder="All" style={{ height: '2.2rem', fontSize: '0.9rem' }} />
            <MultiSelect label="Cost" options={costOptions} selectedValues={filters.cost || []} onChange={(val) => setFilters({...filters, cost: val})} placeholder="All" style={{ height: '2.2rem', fontSize: '0.9rem' }} />
            <MultiSelect label="Functional Fit" options={funcFitOptions} selectedValues={filters.functionalFit || []} onChange={(val) => setFilters({...filters, functionalFit: val})} placeholder="All" style={{ height: '2.2rem', fontSize: '0.9rem' }} />
            <MultiSelect label="Technical Fit" options={techFitOptions} selectedValues={filters.technicalFit || []} onChange={(val) => setFilters({...filters, technicalFit: val})} placeholder="All" style={{ height: '2.2rem', fontSize: '0.9rem' }} />
            <MultiSelect label="TIME" options={TIME_OPTIONS} selectedValues={filters.time || []} onChange={(val) => setFilters({...filters, time: val})} placeholder="All" style={{ height: '2.2rem', fontSize: '0.9rem' }} />

            {/* Custom Field Filters */}
            {appMetaDefs.filter(d => d.fieldType !== 'range').map(def => (
              <MultiSelect 
                key={def.id} 
                label={def.label} 
                options={getCustomOptions(def.fieldName)} 
                selectedValues={(filters.custom || {})[def.fieldName] || []} 
                onChange={(val) => setFilters({...filters, custom: { ...(filters.custom || {}), [def.fieldName]: val }})} 
                placeholder="All" 
                style={{ height: '2.2rem', fontSize: '0.9rem' }}
              />
            ))}

            <button onClick={clearFilters} style={{ height: '2.2rem', borderColor: 'transparent', color: 'var(--muted-foreground)', fontSize: '0.9rem' }}><X size={16} style={{ marginRight: '0.4rem' }} /> Clear</button>
          </div>
        </div>
      )}

      {viewMode === 'list' && (
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '0.75rem' }}>
          <button onClick={exportToCSV} className="secondary" style={{ height: '2.2rem', padding: '0 0.75rem', display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.9rem' }}>
            <Download size={16} /> Export CSV
          </button>
        </div>
      )}
      {viewMode === 'dashboard' ? (
        <TimeDashboardView 
          apps={filteredApps} 
          allCapabilities={allCapabilities} 
          onSelectApp={onSelectApp} 
          onEditApp={onEditApp}
          activeTimeFilters={filters.time || []}
          onToggleTimeFilter={(val) => {
            const current = filters.time || [];
            const next = current.includes(val) ? current.filter(x => x !== val) : [...current, val];
            setFilters({ ...filters, time: next });
          }}
          thresholds={timeThresholds}
        />
      ) : viewMode === 'grid' ? (
        <div className="grid">
          {filteredApps.map(app => {
            const meta = safeJsonParse(app.metadata);
            
            const getRecursiveMaxCrit = (capIds: string[]): number => {
              let max = 0;
              capIds.forEach(id => {
                const cap = allCapabilities.find(c => c.id === id);
                if (cap) {
                  max = Math.max(max, Number(cap.criticality || 1));
                  const childIds = (allCapabilities.filter(c => c.parentId === id) || []).map(c => c.id);
                  if (childIds.length > 0) max = Math.max(max, getRecursiveMaxCrit(childIds));
                }
              });
              return max;
            };

            const isInherited = app.capabilities && app.capabilities.length > 0;
            const inheritedCrit = isInherited 
              ? String(Math.max(Number(app.criticality || 1), getRecursiveMaxCrit(app.capabilities!.map(c => c.id))))
              : String(app.criticality || 1);

            const timeInfo = getAppTimeAssessment(app, timeThresholds);

            return (
              <div key={app.id} className="card" onClick={() => onSelectApp(app.id)} style={{ cursor: 'pointer', padding: '0.75rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.6rem', alignItems: 'flex-start' }}>
                  <div style={{ display: 'flex', gap: '0.4rem', alignItems: 'center' }}>
                    <div style={{ background: 'var(--accent)', padding: '0.35rem', borderRadius: 'var(--radius)' }}><Database size={16} /></div>
                    <div style={{ display: 'flex', gap: '3px' }}>
                      {allRangeFields.map(def => {
                        const val = def.fieldName === 'criticality' ? inheritedCrit : ((app as any)[def.fieldName] || meta[def.fieldName] || def.min);
                        const isThisInherited = def.fieldName === 'criticality' && isInherited;
                        return (
                          <div 
                            key={def.id} 
                            title={`${def.label}: ${val}${isThisInherited ? ' (Inherited)' : ''}`}
                            style={{ 
                              width: '8px', height: '8px', borderRadius: '50%', 
                              background: getOverlayColor(Number(val), def),
                              border: isThisInherited ? '1px solid var(--primary)' : 'none'
                            }} 
                          />
                        );
                      })}
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: '0.35rem', alignItems: 'center' }}>
                    {timeInfo && (
                      <span 
                        title={`TIME Assessment: ${timeInfo.label} (Tech Fit: ${app.technicalFit || '—'}, Functional Fit: ${app.functionalFit || '—'}, Criticality: ${inheritedCrit})`}
                        style={{ 
                          fontSize: '0.62rem', 
                          fontWeight: 800, 
                          letterSpacing: '0.04em',
                          textTransform: 'uppercase', 
                          padding: '0.15rem 0.45rem', 
                          borderRadius: '4px', 
                          background: timeInfo.bg, 
                          color: timeInfo.color, 
                          border: `1px solid ${timeInfo.border}` 
                        }}
                      >
                        {timeInfo.label}
                      </span>
                    )}
                    <LifecycleBadge lifecycle={app.lifecycle} color={picklists?.find(p => p.name === 'lifecycle')?.options?.find((o: any) => o.value === app.lifecycle)?.color} />
                    <button 
                      onClick={(e) => { e.stopPropagation(); onEditApp(app); }} 
                      className="secondary" 
                      style={{ border: 'none', height: '1.6rem', width: '1.6rem', padding: 0, background: 'transparent' }}
                    >
                      <Edit2 size={12} />
                    </button>
                  </div>
                </div>
                <h3 style={{ marginBottom: '0.35rem', fontSize: '1rem' }}>{app.name}</h3>
                <p style={{ fontSize: '0.75rem', color: 'var(--muted-foreground)', marginBottom: '0.75rem', display: '-webkit-box', WebkitLineClamp: '2', WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{app.description || 'No description provided.'}</p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem', fontSize: '0.7rem', borderTop: '1px solid var(--border)', paddingTop: '0.75rem', marginTop: 'auto' }}>
                  <div><strong>Owner:</strong> {ownerOptions.find((o: any) => o.value === app.owner)?.label || app.owner || 'Unassigned'}</div>
                  <div>
                    <strong>Owning Org:</strong> {app.ownerOrg ? (
                      <span style={{ fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: '0.2rem', color: 'var(--primary)' }}>
                        <Layers size={10} /> {app.ownerOrg.name}
                      </span>
                    ) : '—'}
                  </div>
                  <div><strong>Type:</strong> <span style={{ fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: '0.2rem' }}>{appTypeOptions.find((o: any) => o.value === app.type)?.color && <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: appTypeOptions.find((o: any) => o.value === app.type)?.color }} />} {appTypeOptions.find((o: any) => o.value === app.type)?.label || app.type || 'Unspecified'}</span></div>
                  <div><strong>Cost:</strong> <span style={{ fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: '0.2rem' }}>{costOptions.find((o: any) => String(o.value) === String(app.cost || '1'))?.color && <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: costOptions.find((o: any) => String(o.value) === String(app.cost || '1'))?.color }} />} {costOptions.find((o: any) => String(o.value) === String(app.cost || '1'))?.label || app.cost || '1'}</span></div>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
            <thead><tr style={{ borderBottom: '1px solid var(--border)', background: 'var(--muted)' }}><th style={{ padding: '0.6rem 1rem', fontSize: '0.75rem' }}>Name</th><th style={{ padding: '0.6rem 1rem', fontSize: '0.75rem' }}>TIME</th><th style={{ padding: '0.6rem 1rem', fontSize: '0.75rem' }}>Cost</th><th style={{ padding: '0.6rem 1rem', fontSize: '0.75rem' }}>Owner</th><th style={{ padding: '0.6rem 1rem', fontSize: '0.75rem' }}>Owning Org</th><th style={{ padding: '0.6rem 1rem', fontSize: '0.75rem' }}>Type</th><th style={{ padding: '0.6rem 1rem', fontSize: '0.75rem' }}>Status</th><th style={{ padding: '0.6rem 1rem', fontSize: '0.75rem' }}>Lifecycle</th><th style={{ padding: '0.6rem 1rem', fontSize: '0.75rem' }}>Capabilities</th><th style={{ padding: '0.6rem 1rem', fontSize: '0.75rem', textAlign: 'right' }}>Actions</th></tr></thead>
            <tbody>
            {filteredApps.map(app => {
              const meta = safeJsonParse(app.metadata);
              
              const getRecursiveMaxCrit = (capIds: string[]): number => {
                let max = 0;
                capIds.forEach(id => {
                  const cap = allCapabilities.find(c => c.id === id);
                  if (cap) {
                    max = Math.max(max, Number(cap.criticality || 1));
                    const childIds = (allCapabilities.filter(c => c.parentId === id) || []).map(c => c.id);
                    if (childIds.length > 0) max = Math.max(max, getRecursiveMaxCrit(childIds));
                  }
                });
                return max;
              };

              const isInherited = app.capabilities && app.capabilities.length > 0;
              const inheritedCrit = isInherited 
                ? String(Math.max(Number(app.criticality || 1), getRecursiveMaxCrit(app.capabilities!.map(c => c.id))))
                : String(app.criticality || 1);

              const timeInfo = getAppTimeAssessment(app, timeThresholds);

              return (
                <tr key={app.id} onClick={() => onSelectApp(app.id)} style={{ borderBottom: '1px solid var(--border)', cursor: 'pointer' }}>
                  <td style={{ padding: '0.6rem 1rem', fontSize: '0.75rem', fontWeight: 500, display: 'flex', alignItems: 'center', gap: '0.4rem' }}><Database size={12} style={{ color: 'var(--muted-foreground)' }} /> {app.name}</td>
                  <td style={{ padding: '0.6rem 1rem', fontSize: '0.75rem' }}>
                    {timeInfo ? (
                      <span style={{ 
                        fontSize: '0.65rem', 
                        fontWeight: 800, 
                        letterSpacing: '0.04em', 
                        textTransform: 'uppercase', 
                        padding: '0.12rem 0.45rem', 
                        borderRadius: '4px', 
                        background: timeInfo.bg, 
                        color: timeInfo.color, 
                        border: `1px solid ${timeInfo.border}` 
                      }}>
                        {timeInfo.label}
                      </span>
                    ) : (
                      <span style={{ color: 'var(--muted-foreground)', fontSize: '0.7rem' }}>—</span>
                    )}
                  </td>
                  <td style={{ padding: '0.6rem 1rem', fontSize: '0.75rem' }}>
                    {(() => {
                      const costVal = String(app.cost || '1');
                      const opt = costOptions.find((o: any) => String(o.value) === costVal);
                      return (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', whiteSpace: 'nowrap' }} title={opt?.label ? `Cost: ${opt.label}` : `Cost: ${costVal}/5`}>
                          {opt?.color && <div style={{ width: '6px', height: '6px', borderRadius: '50%', background: opt.color, flexShrink: 0 }} />}
                          <span style={{ fontWeight: 600, fontSize: '0.75rem' }}>{opt ? opt.label : `$${costVal}`}</span>
                        </div>
                      );
                    })()}
                  </td>
                  <td style={{ padding: '0.6rem 1rem', fontSize: '0.75rem' }}>{ownerOptions.find((o: any) => o.value === app.owner)?.label || app.owner || '—'}</td>
                  <td style={{ padding: '0.6rem 1rem', fontSize: '0.75rem' }}>
                    {app.ownerOrg ? (
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                        <Layers size={12} style={{ color: 'var(--primary)' }} />
                        {app.ownerOrg.name}
                      </div>
                    ) : '—'}
                  </td>
                  <td style={{ padding: '0.6rem 1rem', fontSize: '0.75rem', fontWeight: 600 }}>{(() => { const opt = appTypeOptions.find((o: any) => o.value === app.type); return opt ? <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}><div style={{ width: '6px', height: '6px', borderRadius: '50%', background: opt.color }} />{opt.label}</div> : (app.type || '—'); })()}</td>
                  <td style={{ padding: '0.6rem 1rem' }}>
                    <div style={{ display: 'flex', gap: '3px' }}>
                      {allRangeFields.map(def => {
                        const val = def.fieldName === 'criticality' ? inheritedCrit : ((app as any)[def.fieldName] || meta[def.fieldName] || def.min);
                        const isThisInherited = def.fieldName === 'criticality' && isInherited;
                        return (
                          <div key={def.id} title={`${def.label}: ${val}${isThisInherited ? ' (Inherited)' : ''}`} style={{ width: '6px', height: '6px', borderRadius: '50%', background: getOverlayColor(Number(val), def), border: isThisInherited ? '1px solid var(--primary)' : 'none' }} />
                        );
                      })}
                    </div>
                  </td>
                  <td style={{ padding: '0.6rem 1rem', fontSize: '0.75rem' }}><LifecycleBadge lifecycle={app.lifecycle} color={picklists?.find(p => p.name === 'lifecycle')?.options?.find((o: any) => o.value === app.lifecycle)?.color} /></td>
                  <td style={{ padding: '0.6rem 1rem', fontSize: '0.75rem' }}><div style={{ display: 'flex', gap: '0.2rem', flexWrap: 'wrap' }}>{app.capabilities?.map(cap => (<span key={cap.id} style={{ background: 'var(--accent)', padding: '0.05rem 0.35rem', borderRadius: '3px', fontSize: '0.65rem' }}>{cap.name}</span>))}{(!app.capabilities || app.capabilities.length === 0) && <span style={{ color: 'var(--muted-foreground)' }}>—</span>}</div></td>
                  <td style={{ padding: '0.6rem 1rem', textAlign: 'right' }}>
                    <button 
                      onClick={(e) => { e.stopPropagation(); onEditApp(app); }} 
                      className="secondary" 
                      style={{ border: 'none', height: '1.6rem', width: '1.6rem', padding: 0, background: 'transparent' }}
                    >
                      <Edit2 size={12} />
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

const CapabilityNode = ({ node, onRefresh, onSelectApp, criticalityOptions, showApps = false, depth = 0, forceExpandState }: { node: Capability, onRefresh: () => void, onSelectApp: (id: string) => void, criticalityOptions: any[], showApps?: boolean, depth?: number, forceExpandState?: { state: boolean, timestamp: number } }) => {
  const navigate = useNavigate();
  const [expanded, setExpanded] = useState<boolean>(() => {
    if (forceExpandState && forceExpandState.timestamp > 0) return forceExpandState.state;
    return true;
  });
  const hasChildren = node.children && node.children.length > 0;
  
  useEffect(() => {
    if (forceExpandState && forceExpandState.timestamp > 0) {
      setExpanded(forceExpandState.state);
    }
  }, [forceExpandState]);

  const getRecursiveAppIds = (n: Capability): string[] => {
    const ids = (n.applications || []).map(a => a.id);
    const childIds = (n.children || []).flatMap(c => getRecursiveAppIds(c));
    return [...new Set([...ids, ...childIds])];
  };
  const appCount = useMemo(() => getRecursiveAppIds(node).length, [node]);
  
  const getEffectiveCapabilityCriticality = (n: Capability): number => {
    const local = Number(n.criticality || 1);
    const childMax = n.children && n.children.length > 0 
      ? Math.max(...n.children.map(c => getEffectiveCapabilityCriticality(c)))
      : 0;
    return Math.max(local, childMax);
  };
  
  const effectiveCritValue = String(getEffectiveCapabilityCriticality(node));
  const criticality = criticalityOptions.find(o => o.value === effectiveCritValue);
  const isInherited = node.children && node.children.length > 0 && effectiveCritValue !== node.criticality;

  return (
    <div className={depth === 0 ? "" : "nested-node"} style={{ width: '100%' }}>
      <div className="card" style={{ 
        padding: '1.25rem', 
        display: 'flex', 
        flexDirection: 'column', 
        gap: '1rem', 
        borderLeft: `4px solid ${criticality?.color || 'var(--border)'}`,
        background: depth % 2 === 0 ? 'var(--card)' : 'rgba(0,0,0,0.02)',
        height: 'auto',
        boxShadow: depth === 0 ? '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)' : 'none'
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem', alignItems: 'center' }}>
            {hasChildren && (
              <button onClick={() => setExpanded(!expanded)} style={{ border: 'none', background: 'none', padding: 0, height: 'auto', display: 'flex', alignItems: 'center' }}>
                {expanded ? <ChevronDown size={20} /> : <ChevronRight size={20} />}
              </button>
            )}
            <span 
              onClick={() => navigate(`/capabilities/${node.id}`)}
              style={{ fontWeight: 800, fontSize: depth === 0 ? '1.125rem' : '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}
            >
              <Boxes size={depth === 0 ? 20 : 16} style={{ color: 'var(--muted-foreground)' }} /> {node.name}
            </span>
            {criticality && (
              <span title={isInherited ? "Inherited from sub-capability" : "Direct capability attribute"} style={{ fontSize: '0.65rem', fontWeight: 800, textTransform: 'uppercase', padding: '0.15rem 0.6rem', borderRadius: '4px', background: `${criticality.color}20`, color: criticality.color, border: isInherited ? `1px dashed ${criticality.color}` : `1px solid ${criticality.color}40` }}>
                {criticality.label} {isInherited && <span style={{opacity: 0.7}}>(Inherited)</span>}
              </span>
            )}
            <span style={{ fontSize: '0.75rem', background: 'var(--secondary)', color: 'var(--secondary-foreground)', padding: '0.15rem 0.6rem', borderRadius: '12px', fontWeight: 600 }}>
              {appCount} Supporting App{appCount !== 1 ? 's' : ''}
            </span>
          </div>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <button onClick={() => navigate(`/capabilities/new?parentId=${node.id}`)} className="secondary" style={{ height: '2rem', padding: '0 0.6rem' }} title="Add Sub-capability"><Plus size={16} /></button>
            <button onClick={() => navigate(`/capabilities/${node.id}/edit`)} className="secondary" style={{ height: '2rem', width: '2rem', padding: 0 }}><Edit2 size={16} /></button>
            <button onClick={async () => { if(confirm('Delete?')) { await fetch(`/api/capabilities/${node.id}`, {method: 'DELETE'}); onRefresh(); } }} className="secondary" style={{ height: '2rem', width: '2rem', padding: 0, color: 'var(--destructive)' }}><Trash2 size={16} /></button>
          </div>
        </div>
        
        {node.description && <p style={{ fontSize: '0.875rem', color: 'var(--muted-foreground)', margin: 0, maxWidth: '800px' }}>{node.description}</p>}
        
        {showApps && node.applications && node.applications.length > 0 && (
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
              <CapabilityNode key={child.id} node={child} onRefresh={onRefresh} onSelectApp={onSelectApp} criticalityOptions={criticalityOptions} showApps={showApps} depth={depth + 1} forceExpandState={forceExpandState} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

const CapabilityListRow = ({ node, onRefresh, onSelectApp, criticalityOptions, showApps = false, depth = 0 }: { node: Capability, onRefresh: () => void, onSelectApp: (id: string) => void, criticalityOptions: any[], showApps?: boolean, depth?: number }) => {
  const navigate = useNavigate();
  
  const getEffectiveCapabilityCriticality = (n: Capability): number => {
    const local = Number(n.criticality || 1);
    const childMax = n.children && n.children.length > 0 
      ? Math.max(...n.children.map(c => getEffectiveCapabilityCriticality(c)))
      : 0;
    return Math.max(local, childMax);
  };
  
  const effectiveCritValue = String(getEffectiveCapabilityCriticality(node));
  const crit = criticalityOptions.find(o => o.value === effectiveCritValue);
  const isInherited = node.children && node.children.length > 0 && effectiveCritValue !== node.criticality;
  const hasChildren = node.children && node.children.length > 0;

  return (
    <>
      <tr key={node.id} className="row-hover" style={{ borderBottom: '1px solid var(--border)' }}>
        <td style={{ padding: '0.6rem 1rem', fontSize: '0.75rem', fontWeight: 600, paddingLeft: `${0.75 + depth * 1.5}rem` }}>
          <div onClick={() => navigate(`/capabilities/${node.id}`)} style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', cursor: 'pointer' }}>
            {depth > 0 && <ChevronRight size={12} style={{ color: 'var(--muted-foreground)' }} />}
            <Boxes size={12} style={{ color: 'var(--muted-foreground)' }} />
            {node.name}
          </div>
        </td>
        <td style={{ padding: '0.6rem 1rem', width: '110px' }}>
          <div style={{ display: 'flex', gap: '0.2rem' }}>
            <button onClick={() => navigate(`/capabilities/new?parentId=${node.id}`)} className="secondary" style={{ height: '1.6rem', padding: '0 0.5rem' }} title="Add Sub-capability"><Plus size={12} /></button>
            <button onClick={() => navigate(`/capabilities/${node.id}/edit`)} className="secondary" style={{ height: '1.6rem', width: '1.6rem', padding: 0 }}><Edit2 size={12} /></button>
            <button onClick={async () => { if(confirm('Delete?')) { await fetch(`/api/capabilities/${node.id}`, {method: 'DELETE'}); onRefresh(); } }} className="secondary" style={{ height: '1.6rem', width: '1.6rem', padding: 0, color: 'var(--destructive)' }}><Trash2 size={12} /></button>
          </div>
        </td>
        <td style={{ padding: '0.6rem 1rem' }}>
          {crit && (
            <span title={isInherited ? "Inherited from sub-capability" : "Direct capability attribute"} style={{ fontSize: '0.6rem', fontWeight: 800, textTransform: 'uppercase', padding: '0.1rem 0.5rem', borderRadius: '4px', background: `${crit.color}20`, color: crit.color, border: isInherited ? `1px dashed ${crit.color}` : `1px solid ${crit.color}40` }}>
              {crit.label} {isInherited && <span style={{opacity: 0.7}}>(Inherited)</span>}
            </span>
          )}
        </td>
        <td style={{ padding: '0.6rem 1rem', fontSize: '0.75rem' }}>
          <div style={{ display: 'flex', gap: '0.2rem', flexWrap: 'wrap' }}>
            {showApps && node.applications?.map(app => (
              <span key={app.id} onClick={() => onSelectApp(app.id)} style={{ cursor: 'pointer', background: 'var(--accent)', padding: '0.05rem 0.35rem', borderRadius: '3px', fontSize: '0.65rem', fontWeight: 500, display: 'flex', alignItems: 'center', gap: '0.2rem' }}><Database size={9} /> {app.name}</span>
            ))}
            {(!showApps || !node.applications || node.applications.length === 0) && <span style={{ color: 'var(--muted-foreground)' }}>{showApps ? '—' : (node.applications?.length || 0) + ' Apps'}</span>}
          </div>
        </td>
      </tr>
      {hasChildren && node.children!.map(child => (
        <CapabilityListRow key={child.id} node={child} onRefresh={onRefresh} onSelectApp={onSelectApp} criticalityOptions={criticalityOptions} showApps={showApps} depth={depth + 1} />
      ))}
    </>
  );
};

const CapabilitiesView = ({ capabilities, onRefresh, onSelectApp }: { capabilities: Capability[], onRefresh: () => void, onSelectApp: (id: string) => void }) => {
  const navigate = useNavigate();
  const [viewMode, setViewMode] = useLocalStorage<'grid' | 'list'>('openea_capabilities_view', 'grid');
  const [showApps, setShowApps] = useLocalStorage<boolean>('openea_capabilities_show_apps', false);
  const [isPending, startTransition] = useTransition();
  const [forceExpandState, setForceExpandState] = useState({ state: true, timestamp: 0 });

  const handleToggleExpandAll = () => {
    setForceExpandState(prev => ({ state: !prev.state, timestamp: Date.now() }));
  };
  
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

  const exportToCSV = () => {
    if (!capabilities || capabilities.length === 0) return;

    const headers = ['Name', 'Parent ID', 'Criticality', 'Description', 'References', 'Applications'];
    
    const csvContent = [
      headers.join(','),
      ...capabilities.map(cap => {
        const apps = (cap.applications || []).map(a => a.name).join('; ');
        const cell = (value: unknown) => `"${String(value ?? '').replace(/"/g, '""')}"`;
        const row = [
          cell(cap.name),
          cell(cap.parentId),
          cell(criticalityOptions.find((o: any) => o.value === cap.criticality)?.label || cap.criticality),
          cell(cap.description),
          cell(cap.references),
          cell(apps)
        ];
        return row.join(',');
      })
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `openea_capabilities_export_${new Date().toISOString().split('T')[0]}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div style={{ width: '100%', minWidth: 0, paddingBottom: '3rem' }}>
      <div style={{ marginBottom: '2.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
        <div>
          <h1 style={{ fontSize: '1.25rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '0.6rem' }}><Boxes size={24} /> Business Capabilities</h1>
          <p style={{ color: 'var(--muted-foreground)', fontSize: '0.9rem' }}>Strategic functions of your enterprise. Showing <strong>{capabilities?.length || 0}</strong> areas.</p>
        </div>
        <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
          {viewMode === 'grid' && (
            <button 
              onClick={handleToggleExpandAll} 
              className="secondary" 
              style={{ height: '2.5rem', padding: '0 1rem', display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.875rem', fontWeight: 600 }}
            >
              {forceExpandState.state ? <ChevronsUp size={16} /> : <ChevronsDown size={16} />}
              {forceExpandState.state ? 'Collapse All' : 'Expand All'}
            </button>
          )}
          <button 
            onClick={() => startTransition(() => setShowApps(!showApps))} 
            className="secondary" 
            style={{ height: '2.2rem', padding: '0 0.75rem', display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.9rem', fontWeight: 600, opacity: isPending ? 0.6 : 1 }}
            disabled={isPending}
          >
            {showApps ? <EyeOff size={16} /> : <Eye size={16} />}
            {isPending ? 'Processing...' : (showApps ? 'Hide Apps' : 'Show Apps')}
          </button>
          <div style={{ display: 'flex', background: 'var(--secondary)', padding: '0.15rem', borderRadius: 'var(--radius)', gap: '0.15rem' }}>
            <button onClick={() => setViewMode('grid')} style={{ height: '2.2rem', padding: '0 0.6rem', border: 'none', background: viewMode === 'grid' ? 'var(--background)' : 'transparent', boxShadow: viewMode === 'grid' ? '0 1px 2px rgba(0,0,0,0.1)' : 'none' }}><LayoutGrid size={16} /></button>
            <button onClick={() => setViewMode('list')} style={{ height: '2.2rem', padding: '0 0.6rem', border: 'none', background: viewMode === 'list' ? 'var(--background)' : 'transparent', boxShadow: viewMode === 'list' ? '0 1px 2px rgba(0,0,0,0.1)' : 'none' }}><List size={16} /></button>
          </div>
          <button onClick={() => navigate('/capabilities/new')} className="primary" style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', height: '2.2rem', fontSize: '0.9rem' }}>
            <PlusCircle size={16} />
            New Capability
          </button>
        </div>
      </div>

      {criticalityOptions.length > 0 && (
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '1.25rem',
          flexWrap: 'wrap',
          marginBottom: '1.5rem',
          padding: '0.6rem 1rem',
          background: 'var(--muted)',
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius)',
          fontSize: '0.75rem'
        }}>
          <span style={{ fontWeight: 800, color: 'var(--muted-foreground)', textTransform: 'uppercase', letterSpacing: '0.06em', fontSize: '0.65rem' }}>Criticality</span>
          <div style={{ display: 'flex', gap: '0.85rem', flexWrap: 'wrap' }}>
            {criticalityOptions.map((o: any) => (
              <span key={o.value} style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                <span style={{ width: '10px', height: '10px', borderRadius: '50%', background: o.color, flexShrink: 0 }} />
                <span style={{ color: 'var(--foreground)', fontWeight: 600 }}>{o.label}</span>
              </span>
            ))}
          </div>
          <div style={{ display: 'flex', gap: '0.85rem', flexWrap: 'wrap', borderLeft: '1px solid var(--border)', paddingLeft: '1.25rem' }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }} title="Criticality set directly on this capability">
              <span style={{ width: '14px', height: '10px', border: '1px solid var(--muted-foreground)', borderRadius: '3px', flexShrink: 0 }} />
              <span style={{ color: 'var(--muted-foreground)', fontWeight: 600 }}>Direct</span>
            </span>
            <span style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }} title="Criticality inherited from highest sub-capability">
              <span style={{ width: '14px', height: '10px', border: '1px dashed var(--muted-foreground)', borderRadius: '3px', flexShrink: 0 }} />
              <span style={{ color: 'var(--muted-foreground)', fontWeight: 600 }}>Inherited from sub-capability</span>
            </span>
          </div>
        </div>
      )}

      {viewMode === 'list' && (
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '0.75rem' }}>
          <button onClick={exportToCSV} className="secondary" style={{ height: '2.2rem', padding: '0 0.75rem', display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.9rem' }}>
            <Download size={16} /> Export CSV
          </button>
        </div>
      )}

      {isPending && (
        <div className="loading-overlay" style={{ background: 'rgba(var(--background-rgb), 0.8)', backdropFilter: 'blur(4px)' }}>
          <div className="loading-logo" style={{ fontSize: '1.5rem' }}>OpenEA</div>
          <div className="loading-text" style={{ fontSize: '0.75rem' }}>Organizing supporting applications...</div>
        </div>
      )}

      {viewMode === 'grid' ? (
        <div className="masonry-grid">
          {capabilityTree.map(cap => (
            <div key={cap.id} className="masonry-item">
              <CapabilityNode node={cap} onRefresh={onRefresh} onSelectApp={onSelectApp} criticalityOptions={criticalityOptions} showApps={showApps} forceExpandState={forceExpandState} />
            </div>
          ))}
        </div>
      ) : (
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border)', background: 'var(--muted)' }}>
                <th style={{ padding: '0.6rem 1rem', fontSize: '0.75rem' }}>Capability Name (Hierarchy)</th>
                <th style={{ padding: '0.6rem 1rem', fontSize: '0.75rem', width: '110px' }}>Actions</th>
                <th style={{ padding: '0.6rem 1rem', fontSize: '0.75rem' }}>Criticality</th>
                <th style={{ padding: '0.6rem 1rem', fontSize: '0.75rem' }}>Supporting Applications</th>
              </tr>
            </thead>
            <tbody>
              {capabilityTree.map(cap => (
                <CapabilityListRow key={cap.id} node={cap} onRefresh={onRefresh} onSelectApp={onSelectApp} criticalityOptions={criticalityOptions} showApps={showApps} />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

const EMPTY_ORGANIZATIONS: Organization[] = [];
const EMPTY_INFORMATION: InformationObject[] = [];

const DiagramsView = ({ apps, capabilities, organizations = EMPTY_ORGANIZATIONS, informationObjects = EMPTY_INFORMATION, integrations, isVisible, timeThresholds = DEFAULT_TIME_THRESHOLDS }: { apps: Application[], capabilities: Capability[], organizations?: Organization[], informationObjects?: InformationObject[], integrations: any[], isVisible: boolean, timeThresholds?: TimeThresholds }) => {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  // Helper to parse comma-separated strings from URL into arrays
  const getParamArray = (key: string) => {
    const val = searchParams.get(key);
    return val ? val.split(',').filter(Boolean) : [];
  };

  // Helper to parse custom filters from URL (e.g., custom_field=val1,val2)
  const getCustomParams = () => {
    const custom: Record<string, string[]> = {};
    searchParams.forEach((val, key) => {
      if (key.startsWith('meta_')) {
        custom[key.replace('meta_', '')] = val.split(',').filter(Boolean);
      }
    });
    return custom;
  };

  const filters = useMemo(() => ({
    search: searchParams.get('q') || '',
    ownerOrgId: getParamArray('ownerOrg'),
    orgType: getParamArray('orgType'),
    owner: getParamArray('owner'),
    lifecycle: getParamArray('lifecycle'),
    type: getParamArray('type'),
    capabilityId: getParamArray('cap'),
    criticality: getParamArray('crit'),
    cost: getParamArray('cost'),
    functionalFit: getParamArray('func'),
    technicalFit: getParamArray('tech'),
    time: getParamArray('time'),
    infoType: getParamArray('info'),
    pii: getParamArray('pii'),
    confidentiality: getParamArray('confidentiality'),
    integrity: getParamArray('integrity'),
    availability: getParamArray('availability'),
    pattern: getParamArray('pattern'),
    frequency: getParamArray('frequency'),
    crud: getParamArray('crud'),
    custom: getCustomParams()
  }), [searchParams]);

  const updateFilters = (newFilters: any) => {
    const params = new URLSearchParams(searchParams);
    
    const setOrRemove = (key: string, val: string | string[]) => {
      if (!val || (Array.isArray(val) && val.length === 0)) params.delete(key);
      else params.set(key, Array.isArray(val) ? val.join(',') : val);
    };

    if (newFilters.search !== undefined) setOrRemove('q', newFilters.search);
    if (newFilters.ownerOrgId !== undefined) setOrRemove('ownerOrg', newFilters.ownerOrgId);
    if (newFilters.orgType !== undefined) setOrRemove('orgType', newFilters.orgType);
    if (newFilters.owner !== undefined) setOrRemove('owner', newFilters.owner);
    if (newFilters.lifecycle !== undefined) setOrRemove('lifecycle', newFilters.lifecycle);
    if (newFilters.type !== undefined) setOrRemove('type', newFilters.type);
    if (newFilters.capabilityId !== undefined) setOrRemove('cap', newFilters.capabilityId);
    if (newFilters.criticality !== undefined) setOrRemove('crit', newFilters.criticality);
    if (newFilters.cost !== undefined) setOrRemove('cost', newFilters.cost);
    if (newFilters.functionalFit !== undefined) setOrRemove('func', newFilters.functionalFit);
    if (newFilters.technicalFit !== undefined) setOrRemove('tech', newFilters.technicalFit);
    if (newFilters.time !== undefined) setOrRemove('time', newFilters.time);
    if (newFilters.infoType !== undefined) setOrRemove('info', newFilters.infoType);
    if (newFilters.pii !== undefined) setOrRemove('pii', newFilters.pii);
    if (newFilters.confidentiality !== undefined) setOrRemove('confidentiality', newFilters.confidentiality);
    if (newFilters.integrity !== undefined) setOrRemove('integrity', newFilters.integrity);
    if (newFilters.availability !== undefined) setOrRemove('availability', newFilters.availability);
    if (newFilters.pattern !== undefined) setOrRemove('pattern', newFilters.pattern);
    if (newFilters.frequency !== undefined) setOrRemove('frequency', newFilters.frequency);
    if (newFilters.crud !== undefined) setOrRemove('crud', newFilters.crud);
    
    if (newFilters.custom !== undefined) {
      // Clear existing custom meta params
      Array.from(params.keys()).forEach(k => { if (k.startsWith('meta_')) params.delete(k); });
      // Add new ones
      Object.entries(newFilters.custom).forEach(([key, vals]: [string, any]) => {
        if (vals && vals.length > 0) params.set(`meta_${key}`, vals.join(','));
      });
    }

    setSearchParams(params, { replace: true });
  };

  const mode = (searchParams.get('mode') as any) || 'landscape';
  const setMode = (m: string) => { const p = new URLSearchParams(searchParams); p.set('mode', m); setSearchParams(p, { replace: true }); };

  const activeOverlay = searchParams.get('overlay') || 'lifecycle';
  const setActiveOverlay = (o: string | null) => { 
    const p = new URLSearchParams(searchParams); 
    if (o) p.set('overlay', o); else p.delete('overlay');
    setSearchParams(p, { replace: true }); 
  };

  const activeCustomOverlays = getParamArray('overlays_custom');

  const groupingField = searchParams.get('group') || null;
  const setGroupingField = (g: string | null) => {
    const p = new URLSearchParams(searchParams);
    if (g) p.set('group', g); else p.delete('group');
    setSearchParams(p, { replace: true });
  };

  // UI state not in URL (optional, can stay in local storage or state)
  const [showFilters, setShowFilters] = useState(false);
  const [showCriticality, setShowCriticality] = useLocalStorage<boolean>('openea_diagram_show_crit', true);
  const [showApplications, setShowApplications] = useLocalStorage<boolean>('meat_diagram_show_apps', true);
  const [showCapabilities, setShowCapabilities] = useLocalStorage<boolean>('meat_diagram_show_caps', true);
  const [hideOrphanApps, setHideOrphanApps] = useLocalStorage<boolean>('meat_diagram_hide_orphans', true);

  // Auto-show filters if any are active from URL on mount
  useEffect(() => {
    const hasAny = Array.from(searchParams.keys()).some(k => !['mode', 'overlay', 'group', 'overlays_custom'].includes(k));
    if (hasAny) setShowFilters(true);
  }, []);

  const { data: picklists } = useQuery<any[]>({ queryKey: ['picklists'], queryFn: async () => { const res = await fetch('/api/picklists'); return res.json(); } });
  const { data: metaDefs } = useQuery<any[]>({ queryKey: ['metadata-definitions'], queryFn: async () => { const res = await fetch('/api/metadata-definitions'); return res.json(); } });

  const appMetaDefs = useMemo(() => metaDefs?.filter(d => d.entityType === 'Application') || [], [metaDefs]);

  const lifecycleOptions = picklists?.find(p => p.name === 'lifecycle')?.options || [];
  const ownerOptions = picklists?.find(p => p.name === 'owner')?.options || [];
  const appTypeOptions = picklists?.find(p => p.name === 'application_type')?.options || [];
  
  const criticalityOptions = picklists?.find(p => p.name === 'criticality')?.options || [];
  const costOptions = picklists?.find(p => p.name === 'application_cost')?.options || [];
  const funcFitOptions = picklists?.find(p => p.name === 'functional_fit')?.options || [];
  const techFitOptions = picklists?.find(p => p.name === 'technical_fit')?.options || [];

  const picklistWithExtras = (name: string, used: Array<string | null | undefined>) => {
    const fromPicklist = ((picklists?.find((p: any) => p.name === name)?.options || []) as { value: string; label?: string }[])
      .map((option) => ({ value: String(option.value), label: option.label || String(option.value) }));
    const known = new Set(fromPicklist.map((option) => option.value));
    const extras = new Set<string>();
    for (const value of used) {
      if (value && !known.has(String(value))) extras.add(String(value));
    }
    return [
      ...fromPicklist,
      ...[...extras].sort((a, b) => a.localeCompare(b)).map((value) => ({ value, label: value })),
    ];
  };

  const ownerOrgOptions = [...organizations]
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((org) => ({ value: org.id, label: org.name }));
  const orgTypeOptions = picklistWithExtras('organization_type', organizations.map((org) => org.type));
  const infoTypeOptions = picklistWithExtras('information_type', informationObjects.map((info) => info.type));
  const piiOptions = picklistWithExtras('pii_category', informationObjects.map((info) => info.piiCategory));
  const ciaOptions = picklistWithExtras('cia_scale', informationObjects.flatMap((info) => [info.confidentiality, info.integrity, info.availability]));
  const patternOptions = picklistWithExtras('integration_pattern', integrations.map((integration) => integration.pattern));
  const frequencyOptions = picklistWithExtras('integration_frequency', integrations.map((integration) => integration.frequency));
  const crudOptions = picklistWithExtras('integration_crud', integrations.flatMap((integration) => String(integration.crud || '').split(',').map((part) => part.trim())));
  
  const { filteredApps, categoricalFilteredApps } = useMemo(() => {
    if (!apps) return { filteredApps: [], categoricalFilteredApps: [] };

    const orgById = new Map(organizations.map((org) => [org.id, org]));
    const infoByApp = new Map<string, InformationObject[]>();
    const rememberInfo = (appId: string | null | undefined, info: InformationObject | null | undefined) => {
      if (!appId || !info?.id) return;
      const list = infoByApp.get(appId);
      if (!list) {
        infoByApp.set(appId, [info]);
        return;
      }
      if (!list.some((item) => item.id === info.id)) list.push(info);
    };
    for (const app of apps) {
      for (const info of app.processedInformationObjects || []) rememberInfo(app.id, info);
    }
    for (const info of informationObjects) rememberInfo(info.appOwnerId, info);
    const flowsByApp = new Map<string, any[]>();
    const rememberFlow = (appId: string | null | undefined, flow: any) => {
      if (!appId) return;
      const list = flowsByApp.get(appId);
      if (list) list.push(flow);
      else flowsByApp.set(appId, [flow]);
    };
    for (const flow of integrations || []) {
      rememberFlow(flow.sourceAppId, flow);
      rememberFlow(flow.targetAppId, flow);
      rememberInfo(flow.sourceAppId, flow.payload);
      rememberInfo(flow.targetAppId, flow.payload);
    }

    // 1. Categorical Filtering (Owner, Type, Lifecycle, etc.)
    const catFiltered = apps.filter(app => {
      const isDecommissioned = (app.lifecycle || '').toLowerCase() === 'decommissioned';
      if ((filters.lifecycle?.length || 0) === 0 && isDecommissioned) {
        return false;
      }

      const matchOwner = (filters.owner?.length || 0) === 0 || filters.owner?.includes(app.owner) || filters.owner?.includes(app.owner?.toLowerCase());
      const matchLifecycle = (filters.lifecycle?.length || 0) === 0 || filters.lifecycle?.includes(app.lifecycle) || filters.lifecycle?.includes(app.lifecycle?.toLowerCase());
      const matchType = (filters.type?.length || 0) === 0 || filters.type?.includes(app.type) || filters.type?.includes(app.type?.toLowerCase());
      
      const localCrit = Number(app.criticality || 1);
      const inheritedCrit = (app.capabilities && app.capabilities.length > 0) 
        ? String(Math.max(localCrit, ...app.capabilities.map(c => Number(c.criticality || 1))))
        : String(localCrit);

      const matchCrit = (filters.criticality?.length || 0) === 0 || filters.criticality?.includes(inheritedCrit);
      const matchCost = (filters.cost?.length || 0) === 0 || filters.cost?.includes(app.cost || '1');
      const matchFunc = (filters.functionalFit?.length || 0) === 0 || filters.functionalFit?.includes(app.functionalFit);
      const matchTech = (filters.technicalFit?.length || 0) === 0 || filters.technicalFit?.includes(app.technicalFit);
      
      const appTime = getAppTimeAssessment(app, timeThresholds)?.value;
      const matchTime = (filters.time?.length || 0) === 0 || (appTime && filters.time.includes(appTime));

      let matchCustom = true;
      if (filters.custom) {
        const appMeta = safeJsonParse(app.metadata);
        for (const [fieldName, selectedVals] of Object.entries(filters.custom)) {
          if (selectedVals && selectedVals.length > 0) {
            const val = String(appMeta[fieldName] || '');
            if (!selectedVals.includes(val)) {
              matchCustom = false;
              break;
            }
          }
        }
      }

      let matchCap = true;
      if (filters.capabilityId && filters.capabilityId.length > 0) {
        const getDescendantIds = (id: string): string[] => {
          const children = capabilities?.filter(c => c.parentId === id) || [];
          return [id, ...children.flatMap(c => getDescendantIds(c.id))];
        };
        const allTargetIds = filters.capabilityId.flatMap(id => getDescendantIds(id));
        matchCap = app.capabilities?.some(c => allTargetIds.includes(c.id)) || false;
      }

      const matchOwnerOrg = selectedValue(filters.ownerOrgId, app.ownerOrgId);
      const orgType = app.ownerOrg?.type || orgById.get(app.ownerOrgId || '')?.type;
      const matchOrgType = selectedValue(filters.orgType, orgType);
      const relatedInfo = infoByApp.get(app.id) || [];
      const flows = flowsByApp.get(app.id) || [];
      const matchInfoType = matchesAnyValue(filters.infoType, relatedInfo.map((info) => info.type));
      const matchPii = matchesAnyValue(filters.pii, relatedInfo.map((info) => info.piiCategory));
      const matchConfidentiality = matchesAnyValue(filters.confidentiality, relatedInfo.map((info) => info.confidentiality));
      const matchIntegrity = matchesAnyValue(filters.integrity, relatedInfo.map((info) => info.integrity));
      const matchAvailability = matchesAnyValue(filters.availability, relatedInfo.map((info) => info.availability));
      const matchPattern = matchesAnyValue(filters.pattern, flows.map((flow) => flow.pattern));
      const matchFrequency = matchesAnyValue(filters.frequency, flows.map((flow) => flow.frequency));
      const matchCrud = !filters.crud?.length || flows.some((flow) => selectedCrud(filters.crud, flow.crud));

      return matchOwner && matchLifecycle && matchType && matchCap && matchCrit && matchCost && matchFunc && matchTech && matchTime && matchCustom
        && matchOwnerOrg && matchOrgType && matchInfoType && matchPii && matchConfidentiality && matchIntegrity && matchAvailability
        && matchPattern && matchFrequency && matchCrud;
    });

    // 2. Search Filtering (Applied on top of categorical)
    if (!filters.search) {
      return { filteredApps: catFiltered, categoricalFilteredApps: catFiltered };
    }

    const query = filters.search.toLowerCase();
    const catAppIds = new Set(catFiltered.map(a => a.id));

    const finalFiltered = catFiltered.filter(app => {
      const appMatches = app.name.toLowerCase().includes(query) || 
        app.description?.toLowerCase().includes(query) ||
        app.owner?.toLowerCase().includes(query) ||
        app.lifecycle?.toLowerCase().includes(query) ||
        app.type?.toLowerCase().includes(query) ||
        app.capabilities?.some(c => c.name.toLowerCase().includes(query)) ||
        app.ownerOrg?.name?.toLowerCase().includes(query) ||
        app.metadata?.toLowerCase().includes(query);
      
      // Also match if any of the app's integrations match the query 
      // AND those integrations connect to other apps in the categorical set
      const integrationMatches = integrations?.some(i => {
        const isSource = i.sourceAppId === app.id;
        const isTarget = i.targetAppId === app.id;
        if (!isSource && !isTarget) return false;

        const otherId = isSource ? i.targetAppId : i.sourceAppId;
        if (!catAppIds.has(otherId)) return false;

        const infoName = i.payload?.name || '';
        const intName = i.name || '';
        return infoName.toLowerCase().includes(query) || intName.toLowerCase().includes(query);
      }) || false;

      return appMatches || integrationMatches;
    });

    return { filteredApps: finalFiltered, categoricalFilteredApps: catFiltered };
  }, [apps, filters, capabilities, integrations, organizations, informationObjects, timeThresholds]);

  const diagramFiltersActive = useMemo(() => {
    const lists = [
      filters.ownerOrgId, filters.orgType, filters.owner, filters.lifecycle, filters.type, filters.capabilityId,
      filters.criticality, filters.cost, filters.functionalFit, filters.technicalFit, filters.time, filters.infoType,
      filters.pii, filters.confidentiality, filters.integrity, filters.availability, filters.pattern, filters.frequency, filters.crud,
    ];
    const custom = Object.values(filters.custom || {}).some((vals) => vals.length > 0);
    return filters.search !== '' || lists.some((vals) => vals.length > 0) || custom;
  }, [filters]);

  const orphanCount = useMemo(() => {
    const appsWithIntegrations = new Set(integrations?.flatMap(i => [i.sourceAppId, i.targetAppId]));
    return filteredApps.filter(a => !appsWithIntegrations.has(a.id)).length;
  }, [filteredApps, integrations]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', position: 'relative' }}>
      <div className="diagram-toolbar" style={{ padding: '0.6rem 1.25rem', borderBottom: '1px solid var(--border)', background: 'var(--card)', display: 'flex', alignItems: 'center', gap: '0.75rem', flexShrink: 0 }}>
        <div className="diagram-title"><h1 style={{ fontSize: '1.05rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '0.4rem' }}><MapIcon size={18} /> Landscape Diagrams</h1><p style={{ fontSize: '0.65rem', color: 'var(--muted-foreground)' }}>Viewing {filteredApps.length} applications</p></div>
        <div role="group" aria-label="Landscape" className="diagram-landscape" style={{ display: 'flex', background: 'var(--secondary)', padding: '0.15rem', borderRadius: 'var(--radius)', gap: '0.15rem', alignItems: 'center', position: 'relative' }}>
            <span className="diagram-landscape-label" style={{ fontSize: '8.5px', fontWeight: 700, textTransform: 'uppercase', padding: '0 0.35rem', opacity: 0.6 }}>Landscape</span>
            <button type="button" aria-pressed={mode === 'landscape'} onClick={() => setMode('landscape')} style={{ height: '1.65rem', padding: '0 0.5rem', border: 'none', fontSize: '0.75rem', background: mode === 'landscape' ? 'var(--background)' : 'transparent', boxShadow: mode === 'landscape' ? '0 1px 2px rgba(0,0,0,0.1)' : 'none' }}><Boxes size={13} style={{ marginRight: '0.35rem' }} /> Capability</button>
            <button type="button" aria-pressed={mode === 'app-landscape'} onClick={() => setMode('app-landscape')} style={{ height: '1.65rem', padding: '0 0.5rem', border: 'none', fontSize: '0.75rem', background: mode === 'app-landscape' ? 'var(--background)' : 'transparent', boxShadow: mode === 'app-landscape' ? '0 1px 2px rgba(0,0,0,0.1)' : 'none' }}><Database size={13} style={{ marginRight: '0.35rem' }} /> Application</button>
            <button type="button" aria-pressed={mode === 'org-landscape'} onClick={() => setMode('org-landscape')} style={{ height: '1.65rem', padding: '0 0.5rem', border: 'none', fontSize: '0.75rem', background: mode === 'org-landscape' ? 'var(--background)' : 'transparent', boxShadow: mode === 'org-landscape' ? '0 1px 2px rgba(0,0,0,0.1)' : 'none' }}><Layers size={13} style={{ marginRight: '0.35rem' }} /> Organization</button>
            <button type="button" aria-pressed={mode === 'network'} onClick={() => setMode('network')} style={{ height: '1.65rem', padding: '0 0.5rem', border: 'none', fontSize: '0.75rem', background: mode === 'network' ? 'var(--background)' : 'transparent', boxShadow: mode === 'network' ? '0 1px 2px rgba(0,0,0,0.1)' : 'none' }}><Network size={13} style={{ marginRight: '0.35rem' }} /> Integrations</button>
          </div>

          <div className="diagram-search">
            <SearchInput
              value={filters.search}
              onChange={(val) => updateFilters({ search: val })}
              placeholder="Search nodes and flows..."
              style={{ height: '2.2rem', fontSize: '0.9rem' }}
            />
          </div>

          <div className="diagram-tools" style={{ display: 'flex', gap: '0.65rem', alignItems: 'center' }}>
          <AspectsMenu mode={mode} value={activeOverlay} onChange={setActiveOverlay} />

          {(mode === 'landscape' || mode === 'app-landscape' || mode === 'org-landscape') && (
            <div style={{ display: 'flex', background: 'var(--secondary)', padding: '0.15rem', borderRadius: 'var(--radius)', gap: '0.15rem', alignItems: 'center', position: 'relative' }}>
              <span className="diagram-groupby-label" style={{ fontSize: '8.5px', fontWeight: 700, textTransform: 'uppercase', padding: '0 0.35rem', opacity: 0.6 }}>Group By</span>
              <div style={{ minWidth: '140px' }}>
                <ColoredSelect
                  value={groupingField || ''}
                  onChange={(val) => setGroupingField(val || null)}
                  options={[
                    { value: '', label: 'None' },
                    { value: 'lifecycle', label: 'Lifecycle' },
                    { value: 'time', label: 'TIME Assessment' },
                    { value: 'criticality', label: 'Business Criticality' },
                    { value: 'cost', label: 'Cost' },
                    { value: 'functionalFit', label: 'Functional Fit' },
                    { value: 'technicalFit', label: 'Technical Fit' },
                  ]}
                  style={{
                    height: '1.65rem',
                    marginTop: 0,
                    background: 'var(--background)',
                    fontSize: '10.5px',
                    color: groupingField ? 'var(--primary)' : 'var(--foreground)',
                    fontWeight: groupingField ? 600 : 400,
                  }}
                />
              </div>
            </div>
          )}

          <div style={{ display: 'flex', background: 'var(--secondary)', padding: '0.15rem', borderRadius: 'var(--radius)', gap: '0.15rem' }}>
            {mode === 'landscape' && (
              <button 
                onClick={() => setShowCriticality(!showCriticality)} 
                style={{ height: '1.65rem', padding: '0 0.5rem', border: 'none', fontSize: '0.75rem', background: showCriticality ? 'var(--background)' : 'transparent', boxShadow: showCriticality ? '0 1px 2px rgba(0,0,0,0.1)' : 'none', color: showCriticality ? 'var(--primary)' : 'var(--muted-foreground)' }}>
                <ShieldAlert size={16} style={{ marginRight: '0.35rem' }} />
                Criticality
              </button>
            )}
            {(mode === 'landscape' || mode === 'org-landscape') && (
              <button 
                onClick={() => setShowApplications(!showApplications)} 
                style={{ height: '1.65rem', padding: '0 0.5rem', border: 'none', background: showApplications ? 'var(--background)' : 'transparent', boxShadow: showApplications ? '0 1px 2px rgba(0,0,0,0.1)' : 'none', color: showApplications ? 'var(--primary)' : 'var(--muted-foreground)', fontSize: '0.75rem' }}
              >
                {showApplications ? <Eye size={16} style={{ marginRight: '0.35rem' }} /> : <EyeOff size={16} style={{ marginRight: '0.35rem' }} />}
                Apps
              </button>
            )}
            {mode === 'app-landscape' && (
              <button 
                onClick={() => setShowCapabilities(!showCapabilities)} 
                style={{ height: '1.65rem', padding: '0 0.5rem', border: 'none', background: showCapabilities ? 'var(--background)' : 'transparent', boxShadow: showCapabilities ? '0 1px 2px rgba(0,0,0,0.1)' : 'none', color: showCapabilities ? 'var(--primary)' : 'var(--muted-foreground)', fontSize: '0.75rem' }}
              >
                {showCapabilities ? <Eye size={16} style={{ marginRight: '0.35rem' }} /> : <EyeOff size={16} style={{ marginRight: '0.35rem' }} />}
                Capabilities
              </button>
            )}

            {mode === 'network' && (
              <button 
                onClick={() => setHideOrphanApps(!hideOrphanApps)} 
                title={hideOrphanApps ? `Currently hiding ${orphanCount} apps without integrations` : "Show apps without integrations"}
                style={{ height: '1.65rem', padding: '0 0.5rem', border: 'none', background: hideOrphanApps ? 'var(--background)' : 'transparent', boxShadow: hideOrphanApps ? '0 1px 2px rgba(0,0,0,0.1)' : 'none', color: hideOrphanApps ? 'var(--primary)' : 'var(--muted-foreground)', fontSize: '0.75rem' }}
              >
                {hideOrphanApps ? <EyeOff size={16} style={{ marginRight: '0.35rem' }} /> : <Eye size={16} style={{ marginRight: '0.35rem' }} />}
                Hide Orphans {hideOrphanApps && orphanCount > 0 ? `(${orphanCount})` : ''}
              </button>
            )}
          </div>
          
          <button
            onClick={() => setShowFilters(!showFilters)}
            aria-expanded={showFilters}
            aria-label={diagramFiltersActive ? 'Filters, applied' : 'Filters'}
            style={{ position: 'relative', height: '2.2rem', padding: diagramFiltersActive ? '0 1.15rem 0 0.6rem' : '0 0.6rem', border: `1px solid ${diagramFiltersActive ? 'var(--brand-focus)' : 'var(--border)'}`, background: showFilters ? 'var(--accent)' : 'var(--background)', fontSize: '0.9rem' }}
          >
            <Filter size={16} style={{ marginRight: '0.4rem', color: diagramFiltersActive ? 'var(--brand-focus)' : undefined }} />
            Filters
            {diagramFiltersActive && <FilterDot badge />}
          </button>
          </div>
      </div>
      {showFilters && (
        <div style={{ padding: '0.6rem 1.25rem', borderBottom: '1px solid var(--border)', background: 'var(--card)', flexShrink: 0 }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(170px, 1fr))', gap: '0.75rem', alignItems: 'flex-end' }}>
            {[
              { label: 'Owning Organization', options: ownerOrgOptions, key: 'ownerOrgId' },
              { label: 'Organization Type', options: orgTypeOptions, key: 'orgType' },
              { label: 'Owner', options: ownerOptions, key: 'owner' },
              { label: 'Application Type', options: appTypeOptions, key: 'type' },
              { label: 'Capability Area', options: capabilities?.map((c: any) => ({ value: c.id, label: c.name })) || [], key: 'capabilityId' },
              { label: 'Lifecycle Status', options: lifecycleOptions, key: 'lifecycle' },
              { label: 'TIME', options: TIME_OPTIONS, key: 'time' },
              { label: 'Criticality', options: criticalityOptions, key: 'criticality' },
              { label: 'Cost', options: costOptions, key: 'cost' },
              { label: 'Functional Fit', options: funcFitOptions, key: 'functionalFit' },
              { label: 'Technical Fit', options: techFitOptions, key: 'technicalFit' },
              { label: 'Information Type', options: infoTypeOptions, key: 'infoType' },
              { label: 'PII Category', options: piiOptions, key: 'pii' },
              { label: 'Confidentiality', options: ciaOptions, key: 'confidentiality' },
              { label: 'Integrity', options: ciaOptions, key: 'integrity' },
              { label: 'Availability', options: ciaOptions, key: 'availability' },
              { label: 'Integration Pattern', options: patternOptions, key: 'pattern' },
              { label: 'Integration Frequency', options: frequencyOptions, key: 'frequency' },
              { label: 'CRUD', options: crudOptions, key: 'crud' },
            ].map(item => (
              <MultiSelect 
                key={item.key}
                label={item.label} 
                options={item.options} 
                selectedValues={(filters as any)[item.key] || []} 
                onChange={(val) => updateFilters({ [item.key]: val })} 
                placeholder="All" 
                style={{ height: '2.2rem', fontSize: '0.9rem' }}
              />
            ))}

            {appMetaDefs.filter(d => d.fieldType !== 'range').map(def => (
              <MultiSelect 
                key={def.id} 
                label={def.label} 
                options={(() => {
                  const values = new Set<string>();
                  apps.forEach(app => {
                    try {
                      const meta = safeJsonParse(app.metadata);
                      if (meta[def.fieldName] !== undefined && meta[def.fieldName] !== null && meta[def.fieldName] !== '') {
                        values.add(String(meta[def.fieldName]));
                      }
                    } catch (e) { /* ignore */ }
                  });
                  return Array.from(values).sort().map(v => ({ value: v, label: v }));
                })()} 
                selectedValues={(filters.custom || {})[def.fieldName] || []} 
                onChange={(val) => updateFilters({ custom: { ...(filters.custom || {}), [def.fieldName]: val } })} 
                placeholder="All"
                style={{ height: '2.2rem', fontSize: '0.9rem' }}
              />
            ))}

            <button 
              onClick={() => updateFilters({
                search: '',
                ownerOrgId: [],
                orgType: [],
                owner: [],
                lifecycle: [],
                type: [],
                capabilityId: [],
                criticality: [],
                cost: [],
                functionalFit: [],
                technicalFit: [],
                time: [],
                infoType: [],
                pii: [],
                confidentiality: [],
                integrity: [],
                availability: [],
                pattern: [],
                frequency: [],
                crud: [],
                custom: {},
              })} 
              style={{ height: '2.2rem', borderColor: 'transparent', color: 'var(--muted-foreground)', padding: 0, justifyContent: 'flex-start', fontSize: '0.9rem' }}
            >
              <X size={16} style={{ marginRight: '0.5rem' }} /> Clear All
            </button>
          </div>
        </div>
      )}
      <div style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
        <ApplicationDiagram
          onNodeClick={(app) => navigate(`/apps/${app.id}`, { state: { from: 'diagram' } })}
          onCapabilityClick={(cap) => navigate(`/capabilities/${cap.id}`, { state: { from: 'diagram' } })}
          onOrganizationClick={(org) => navigate(`/organizations/${org.id}`, { state: { from: 'diagram' } })}
          onIntegrationClick={(integration) => navigate(`/integrations/${integration.id}`, { state: { from: 'diagram' } })}
          apps={apps || []}
          filteredApps={filteredApps}
          categoricalFilteredApps={categoricalFilteredApps}
          integrations={integrations || []}
          capabilities={capabilities || []}
          organizations={organizations}
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
          timeThresholds={timeThresholds}
          relationSearch={filters.search} 
          visible={isVisible}
        />
      </div>
    </div>
  );
};

export default function App() { 
  return ( 
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <AppContent />
      </BrowserRouter>
    </QueryClientProvider> 
  ); 
}
