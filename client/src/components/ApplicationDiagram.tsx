import { useEffect, useMemo, useState, useRef, useCallback } from 'react';
import ReactFlow, { 
  Background, 
  Controls, 
  Panel,
  useNodesState,
  useEdgesState,
  MarkerType,
  useReactFlow,
  useStore,
  useStoreApi,
  useNodesInitialized,
  getBezierPath,
  getNodesBounds,
  getTransformForBounds,
  type Node,
  type Edge,
  type EdgeProps,
  ReactFlowProvider
} from 'reactflow';
import 'reactflow/dist/style.css';
import dagre from '@dagrejs/dagre';
import { getFontEmbedCSS, toCanvas } from 'html-to-image';
import { Database, Boxes, Layers, Lock, Unlock, Maximize, Minimize, Map as MapIcon, ChevronDown, ChevronLeft, ChevronRight, Download, Loader2, FilterX, WrapText, Frame, ExternalLink, X } from 'lucide-react';
import { DEFAULT_TIME_THRESHOLDS, getAppTimeAssessment, type TimeThresholds } from '../timeAssessment';
import { TimeMatrix } from './TimeMatrix';
import { BoxLabel, revealWidth, useDiagramReveal } from '../diagramLabel';
import { intersectAppLandscapeResults, intersectHierarchyResults, normalizeKeywords } from '../diagramSearch';

const safeJsonParse = (str: string | null | undefined, fallback: any = {}) => {
  if (!str) return fallback;
  try {
    return JSON.parse(str);
  } catch (e) {
    try {
      const healed = str
        .replace(/([{,])\s*([a-zA-Z0-9._-]+)\s*:/g, '$1"$2":')
        .replace(/:\s*([^",}\s][^,}\s]*)\s*([,}])/g, ':"$1"$2');
      return JSON.parse(healed);
    } catch (e2) {
      return fallback;
    }
  }
};

const listSelected = (selected: string[] | undefined, value: string | null | undefined) => {
  if (!selected || selected.length === 0) return true;
  const raw = value ?? '';
  const lower = raw.toLowerCase();
  return selected.some((item) => item === raw || item.toLowerCase() === lower);
};

const crudSelected = (selected: string[] | undefined, crud: string | null | undefined) => {
  if (!selected || selected.length === 0) return true;
  const ops = (crud || '').split(',').map((part) => part.trim()).filter(Boolean);
  return selected.some((item) => ops.some((op) => op === item || op.toLowerCase() === item.toLowerCase()));
};

const integrationMatchesFilters = (integration: { sourceAppId?: string; targetAppId?: string; infoObjectId?: string | null; payload?: InformationObject; pattern?: string | null; frequency?: string | null; crud?: string | null }, filters: any) => {
  const payload = integration.payload;
  return listSelected(filters?.infoType, payload?.type)
    && listSelected(filters?.pii, payload?.piiCategory)
    && listSelected(filters?.confidentiality, payload?.confidentiality)
    && listSelected(filters?.integrity, payload?.integrity)
    && listSelected(filters?.availability, payload?.availability)
    && listSelected(filters?.pattern, integration.pattern)
    && listSelected(filters?.frequency, integration.frequency)
    && crudSelected(filters?.crud, integration.crud)
    && listSelected(filters?.sourceAppId, integration.sourceAppId)
    && listSelected(filters?.targetAppId, integration.targetAppId)
    && listSelected(filters?.payloadId, integration.infoObjectId || payload?.id);
};

const hasActiveDiagramFilter = (filters: any) => {
  if (String(filters?.search || '').trim()) return true;
  const keys = ['ownerOrgId', 'orgType', 'owner', 'lifecycle', 'type', 'capabilityId', 'criticality', 'cost', 'functionalFit', 'technicalFit', 'time', 'infoType', 'pii', 'confidentiality', 'integrity', 'availability', 'pattern', 'frequency', 'crud', 'sourceAppId', 'targetAppId', 'payloadId'];
  if (keys.some((key) => Array.isArray(filters?.[key]) && filters[key].length > 0)) return true;
  const custom = filters?.custom;
  return !!custom && Object.values(custom).some((vals) => Array.isArray(vals) && vals.length > 0);
};

const describeCategoricalFilters = (filters: any, organizations: Organization[], capabilities: Capability[], metaDefs: MetadataDefinition[], apps: { id: string; name: string }[] = [], payloadNames: Map<string, string> = new Map()) => {
  const labels: string[] = [];
  const add = (title: string, values?: string[]) => {
    if (values && values.length > 0) labels.push(`${title}: ${values.join(', ')}`);
  };
  if (filters.ownerOrgId?.length > 0) {
    const names = filters.ownerOrgId.map((id: string) => organizations.find((org) => org.id === id)?.name || id);
    labels.push(`Owning Organization: ${names.join(', ')}`);
  }
  add('Organization Type', filters.orgType);
  add('Owner', filters.owner);
  add('Type', filters.type);
  if (filters.capabilityId?.length > 0) {
    const capNames = filters.capabilityId.map((id: string) => capabilities.find((cap) => cap.id === id)?.name).filter(Boolean);
    labels.push(`Capabilities: ${capNames.join(', ')}`);
  }
  add('Lifecycle', filters.lifecycle);
  add('TIME', filters.time);
  add('Criticality', filters.criticality);
  add('Cost', filters.cost);
  add('Functional Fit', filters.functionalFit);
  add('Technical Fit', filters.technicalFit);
  add('Info Type', filters.infoType);
  add('PII Category', filters.pii);
  add('Confidentiality', filters.confidentiality);
  add('Integrity', filters.integrity);
  add('Availability', filters.availability);
  add('Pattern', filters.pattern);
  add('Frequency', filters.frequency);
  add('CRUD', filters.crud);
  const named = (title: string, ids: string[] | undefined, nameOf: (id: string) => string) => {
    if (ids && ids.length > 0) labels.push(`${title}: ${ids.map(nameOf).join(', ')}`);
  };
  named('Source', filters.sourceAppId, (id) => apps.find((app) => app.id === id)?.name || id);
  named('Target', filters.targetAppId, (id) => apps.find((app) => app.id === id)?.name || id);
  named('Payload', filters.payloadId, (id) => payloadNames.get(id) || id);
  if (filters.custom) {
    Object.entries(filters.custom).forEach(([field, vals]) => {
      if (vals && (vals as any[]).length > 0) {
        const def = metaDefs.find((item) => item.fieldName === field);
        labels.push(`${def?.label || field}: ${(vals as any[]).join(', ')}`);
      }
    });
  }
  return labels;
};

interface Application {
  id: string;
  name: string;
  description: string;
  owner: string;
  ownerOrgId?: string | null;
  lifecycle: string;
  type: string;
  metadata?: string;
  criticality: string;
  cost?: string;
  functionalFit: string;
  technicalFit: string;
  capabilities?: { id: string; name: string; criticality: string }[];
}

interface Organization {
  id: string;
  name: string;
  type?: string | null;
  parentId?: string | null;
  metadata?: string;
}

interface Capability {
  id: string;
  name: string;
  description?: string;
  parentId?: string | null;
  metadata?: string;
  criticality: string;
  applications?: { id: string }[];
}
interface InformationObject {
  id: string;
  name: string;
  [key: string]: any;
}

interface Integration {
  id: string;
  sourceAppId: string;
  targetAppId: string;
  name?: string;
  infoObjectId?: string | null;
  pattern?: string;
  frequency?: string;
  crud?: string;
  payload?: InformationObject;
  sourceApp?: Application;
  targetApp?: Application;
}

interface MetadataDefinition {
  id: string;
  entityType: string;
  fieldName: string;
  fieldType: string;
  label: string;
  min: number;
  max: number;
  scaleType: string;
}

interface Picklist {
  id: string;
  name: string;
  label?: string;
  options: { value: string; color: string; label: string }[];
}

interface Props {
  onNodeClick?: (app: Application) => void;
  onCapabilityClick?: (cap: Capability) => void;
  onOrganizationClick?: (org: Organization) => void;
  onIntegrationClick?: (integration: Integration) => void;
  apps: Application[];
  filteredApps: Application[];
  categoricalFilteredApps: Application[];
  integrations: Integration[];
  capabilities: Capability[];
  organizations?: Organization[];
  metaDefs: MetadataDefinition[];
  picklists: Picklist[];
  mode?: 'network' | 'landscape' | 'app-landscape' | 'org-landscape';
  activeOverlay?: string | null;
  activeCustomOverlays?: string[];
  showApplications?: boolean;
  showCapabilities?: boolean;
  hideOrphanApps?: boolean;
  showCriticality?: boolean;
  filters?: any;
  groupingField?: string | null;
  searchTerms?: string[];
  visible?: boolean;
  containerRef?: React.RefObject<HTMLDivElement | null>;
  timeThresholds?: TimeThresholds;
}

const analyzeDiagramFilterFlags = (filters: any = {}) => {
  const hasFilterList = (values?: string[]) => Array.isArray(values) && values.length > 0;
  const hasCustomFilter = !!(filters?.custom && Object.values(filters.custom).some((values: any) => Array.isArray(values) && values.length > 0));
  const hasStructuralFilter = hasFilterList(filters?.ownerOrgId) || hasFilterList(filters?.orgType);
  const hasOtherAppFilter = hasFilterList(filters?.owner) ||
    hasFilterList(filters?.lifecycle) ||
    hasFilterList(filters?.type) ||
    hasFilterList(filters?.criticality) ||
    hasFilterList(filters?.cost) ||
    hasFilterList(filters?.functionalFit) ||
    hasFilterList(filters?.technicalFit) ||
    hasFilterList(filters?.time) ||
    hasFilterList(filters?.capabilityId) ||
    hasFilterList(filters?.infoType) ||
    hasFilterList(filters?.pii) ||
    hasFilterList(filters?.confidentiality) ||
    hasFilterList(filters?.integrity) ||
    hasFilterList(filters?.availability) ||
    hasFilterList(filters?.pattern) ||
    hasFilterList(filters?.frequency) ||
    hasFilterList(filters?.crud) ||
    hasFilterList(filters?.sourceAppId) ||
    hasFilterList(filters?.targetAppId) ||
    hasFilterList(filters?.payloadId) ||
    hasCustomFilter;
  return {
    hasStructuralFilter,
    hasOtherAppFilter,
    hasAnyAppFilter: hasStructuralFilter || hasOtherAppFilter,
  };
};

interface HierarchyNodeLike {
  id: string;
  name: string;
  parentId?: string | null;
}

const filterHierarchyTopDown = <TApp extends { id: string; name: string }>({
  structure,
  appsByNode,
  isBaseRelevant,
  canNodeMatch,
  showApplications,
  query,
}: {
  structure: HierarchyNodeLike[];
  appsByNode: Map<string, TApp[]>;
  isBaseRelevant: (nodeId: string) => boolean;
  canNodeMatch: (nodeId: string) => boolean;
  showApplications: boolean;
  query: string;
}): {
  allowedNodeIds: Set<string>;
  focusNodeIds: Set<string>;
  allowedAppsByNode: Map<string, TApp[]>;
  matchedSubtreeApps: TApp[];
} => {
  const structureMap = new Map(structure.map((node) => [node.id, node]));
  const allowedNodeIds = new Set<string>();
  const focusNodeIds = new Set<string>();
  const allowedAppsByNode = new Map<string, TApp[]>();
  const matchedAppMap = new Map<string, TApp>();

  const childrenOf = (nodeId: string) =>
    structure.filter((c) => c.parentId === nodeId && c.id !== nodeId && isBaseRelevant(c.id));

  const roots = structure.filter(
    (c) => (!c.parentId || !structureMap.has(c.parentId)) && isBaseRelevant(c.id),
  );

  for (const root of roots) {
    const levels: string[][] = [];
    const seenInBranch = new Set<string>([root.id]);
    const parentInBranch = new Map<string, string | null>([[root.id, null]]);
    let frontier: string[] = [root.id];

    while (frontier.length > 0) {
      levels.push(frontier);
      const nextFrontier: string[] = [];
      for (const id of frontier) {
        for (const child of childrenOf(id)) {
          if (seenInBranch.has(child.id)) continue;
          seenInBranch.add(child.id);
          parentInBranch.set(child.id, id);
          nextFrontier.push(child.id);
        }
      }
      frontier = nextFrontier;
    }

    let matchedAtTreeLevel = false;
    for (const level of levels) {
      const matchingIds = level.filter((id) => {
        const node = structureMap.get(id);
        return Boolean(node && canNodeMatch(id) && node.name.toLowerCase().includes(query));
      });

      if (matchingIds.length > 0) {
        matchedAtTreeLevel = true;
        for (const matchedId of matchingIds) {
          // Keep ancestor wrapper boxes up to the root of this branch for context
          let ancestor = parentInBranch.get(matchedId) ?? null;
          while (ancestor) {
            allowedNodeIds.add(ancestor);
            ancestor = parentInBranch.get(ancestor) ?? null;
          }

          // The match and its subtree are the focus. Ancestors stay wrappers only.
          const includeSubtree = (subId: string) => {
            allowedNodeIds.add(subId);
            focusNodeIds.add(subId);
            const appsHere = appsByNode.get(subId);
            if (appsHere && appsHere.length > 0) {
              allowedAppsByNode.set(subId, appsHere);
              for (const app of appsHere) matchedAppMap.set(app.id, app);
            }
            for (const child of childrenOf(subId)) {
              if (parentInBranch.get(child.id) === subId) {
                includeSubtree(child.id);
              }
            }
          };
          includeSubtree(matchedId);
        }
        break;
      }
    }

    // If no container node at any depth in this branch matched, fall through to leaf applications
    if (!matchedAtTreeLevel && showApplications) {
      for (const level of levels) {
        for (const id of level) {
          if (!canNodeMatch(id)) continue;
          const matchingApps = (appsByNode.get(id) || []).filter((app) =>
            app.name.toLowerCase().includes(query),
          );
          if (matchingApps.length > 0) {
            allowedNodeIds.add(id);
            focusNodeIds.add(id);
            allowedAppsByNode.set(id, matchingApps);
            for (const app of matchingApps) matchedAppMap.set(app.id, app);
            let ancestor = parentInBranch.get(id) ?? null;
            while (ancestor) {
              allowedNodeIds.add(ancestor);
              ancestor = parentInBranch.get(ancestor) ?? null;
            }
          }
        }
      }
    }
  }

  return {
    allowedNodeIds,
    focusNodeIds,
    allowedAppsByNode,
    matchedSubtreeApps: Array.from(matchedAppMap.values()),
  };
};

const hierarchyForQueries = <TApp extends { id: string; name: string }>({
  structure,
  appsByNode,
  isBaseRelevant,
  canNodeMatch,
  showApplications,
  queries,
}: {
  structure: HierarchyNodeLike[];
  appsByNode: Map<string, TApp[]>;
  isBaseRelevant: (nodeId: string) => boolean;
  canNodeMatch: (nodeId: string) => boolean;
  showApplications: boolean;
  queries: string[];
}) => {
  if (queries.length === 0) return null;
  const results = queries.map((query) => filterHierarchyTopDown({
    structure,
    appsByNode,
    isBaseRelevant,
    canNodeMatch,
    showApplications,
    query,
  }));
  if (results.length === 1) return results[0];
  const parentById = new Map(structure.map((node) => [node.id, node.parentId]));
  return intersectHierarchyResults(results, (id) => parentById.get(id));
};

const appLandscapeForQueries = <
  TCap extends { id: string; name: string },
  TApp extends { id: string; name: string; capabilities?: TCap[] },
>(args: {
  candidateApps: TApp[];
  showCapabilities: boolean;
  queries: string[];
}) => {
  if (args.queries.length === 0) {
    return filterAppLandscapeTopDown({
      candidateApps: args.candidateApps,
      showCapabilities: args.showCapabilities,
      query: '',
    });
  }
  const results = args.queries.map((query) => filterAppLandscapeTopDown({
    candidateApps: args.candidateApps,
    showCapabilities: args.showCapabilities,
    query,
  }));
  if (results.length === 1) return results[0];
  return intersectAppLandscapeResults(results);
};

const filterAppLandscapeTopDown = <
  TCap extends { id: string; name: string },
  TApp extends { id: string; name: string; capabilities?: TCap[] },
>({
  candidateApps,
  showCapabilities,
  query,
}: {
  candidateApps: TApp[];
  showCapabilities: boolean;
  query: string;
}): {
  matchedApps: TApp[];
  allowedCapsByApp: Map<string, TCap[]> | null;
} => {
  if (!query) {
    return { matchedApps: candidateApps, allowedCapsByApp: null };
  }
  const matchedApps: TApp[] = [];
  const allowedCapsByApp = new Map<string, TCap[]>();

  for (const app of candidateApps) {
    if (app.name.toLowerCase().includes(query)) {
      matchedApps.push(app);
      allowedCapsByApp.set(app.id, app.capabilities || []);
    } else if (showCapabilities) {
      const matchingCaps = (app.capabilities || []).filter((c) =>
        c.name.toLowerCase().includes(query),
      );
      if (matchingCaps.length > 0) {
        matchedApps.push(app);
        allowedCapsByApp.set(app.id, matchingCaps);
      }
    }
  }

  return { matchedApps, allowedCapsByApp };
};

const payloadIdOf = (integration: { infoObjectId?: string | null; payload?: { id?: string } | null }) =>
  integration.infoObjectId || integration.payload?.id || '';

// Application filters pick the seed flows. The other application on a flow stays
// visible, and every flow that carries the same information object stays too.
export const filterNetworkTopDown = <
  TApp extends {
    id: string;
    name: string;
    lifecycle?: string | null;
    ownerOrgId?: string | null;
    ownerOrg?: { name?: string | null } | null;
  },
  TInt extends {
    id: string;
    sourceAppId: string;
    targetAppId: string;
    name?: string;
    infoObjectId?: string | null;
    pattern?: string;
    frequency?: string;
    crud?: string;
    payload?: InformationObject;
  },
>({
  allApps,
  categoricalApps,
  integrations,
  organizations = [],
  filters,
  hideOrphanApps,
  query,
}: {
  allApps: TApp[];
  categoricalApps: TApp[];
  integrations: TInt[];
  organizations?: { id: string; name: string }[];
  filters: any;
  hideOrphanApps: boolean;
  query: string;
}): {
  finalAppIds: string[];
  filteredIntegrations: TInt[];
} => {
  const catAppIds = new Set(categoricalApps.map((app) => app.id));
  const appById = new Map(allApps.map((app) => [app.id, app]));
  const orgNameById = new Map(organizations.map((org) => [org.id, org.name]));
  const queryText = (query || '').trim().toLowerCase();

  const appVisible = (id: string) => {
    const app = appById.get(id);
    if (!app) return false;
    if (catAppIds.has(id)) return true;
    const decommissioned = (app.lifecycle || '').toLowerCase() === 'decommissioned';
    return !(decommissioned && !(filters?.lifecycle?.length));
  };

  const flowOk = (integration: TInt) =>
    appVisible(integration.sourceAppId)
    && appVisible(integration.targetAppId)
    && integrationMatchesFilters(integration, filters);

  let seed = integrations.filter((integration) =>
    flowOk(integration) && (catAppIds.has(integration.sourceAppId) || catAppIds.has(integration.targetAppId)),
  );

  if (queryText) {
    const orgIds = new Set(
      organizations
        .filter((org) => org.name.toLowerCase().includes(queryText))
        .map((org) => org.id),
    );
    const appMatches = (id: string) => {
      const app = appById.get(id);
      if (!app) return false;
      if (app.name.toLowerCase().includes(queryText)) return true;
      const orgName = app.ownerOrg?.name || (app.ownerOrgId ? orgNameById.get(app.ownerOrgId) : '');
      return (!!orgName && orgName.toLowerCase().includes(queryText)) || orgIds.has(app.ownerOrgId || '');
    };
    seed = seed.filter((integration) =>
      appMatches(integration.sourceAppId)
      || appMatches(integration.targetAppId)
      || integration.name?.toLowerCase().includes(queryText)
      || integration.payload?.name?.toLowerCase().includes(queryText)
      || integration.pattern?.toLowerCase().includes(queryText)
      || integration.crud?.toLowerCase().includes(queryText),
    );
  }

  const payloadIds = new Set(seed.map(payloadIdOf).filter(Boolean));
  const seedIds = new Set(seed.map((integration) => integration.id));
  const filteredIntegrations = integrations.filter((integration) => {
    if (!flowOk(integration)) return false;
    if (seedIds.has(integration.id)) return true;
    const payloadId = payloadIdOf(integration);
    return !!payloadId && payloadIds.has(payloadId);
  });

  const appIds = new Set(filteredIntegrations.flatMap((integration) => [integration.sourceAppId, integration.targetAppId]));
  if (!queryText && !hideOrphanApps) {
    categoricalApps.forEach((app) => appIds.add(app.id));
  }

  return {
    finalAppIds: Array.from(appIds),
    filteredIntegrations,
  };
};

const filterNetworkByQueries = <
  TApp extends {
    id: string;
    name: string;
    lifecycle?: string | null;
    ownerOrgId?: string | null;
    ownerOrg?: { name?: string | null } | null;
  },
  TInt extends {
    id: string;
    sourceAppId: string;
    targetAppId: string;
    name?: string;
    infoObjectId?: string | null;
    pattern?: string;
    frequency?: string;
    crud?: string;
    payload?: InformationObject;
  },
>(args: {
  allApps: TApp[];
  categoricalApps: TApp[];
  integrations: TInt[];
  organizations?: { id: string; name: string }[];
  filters: any;
  hideOrphanApps: boolean;
  queries: string[];
}): {
  finalAppIds: string[];
  filteredIntegrations: TInt[];
} => {
  const { queries: incoming, ...rest } = args;
  const queries = incoming.map((query) => query.trim()).filter(Boolean);
  const run = (query: string) => filterNetworkTopDown({ ...rest, query });
  if (queries.length === 0) return run('');
  const results = queries.map(run);
  if (results.length === 1) return results[0];
  let filteredIntegrations = results[0].filteredIntegrations;
  for (const result of results.slice(1)) {
    const ids = new Set(result.filteredIntegrations.map((integration) => integration.id));
    filteredIntegrations = filteredIntegrations.filter((integration) => ids.has(integration.id));
  }
  const appIds = new Set(filteredIntegrations.flatMap((integration) => [integration.sourceAppId, integration.targetAppId]));
  return { finalAppIds: Array.from(appIds), filteredIntegrations };
};

export const getLandscapeSearchMatchedApps = <
  TApp extends {
    id: string;
    name: string;
    ownerOrgId?: string | null;
    capabilities?: { id: string; name: string }[];
  },
>({
  mode,
  search,
  searchTerms,
  categoricalApps,
  allApps,
  capabilities,
  organizations,
  integrations,
  filters,
  showApplications = true,
  showCapabilities = true,
  hideOrphanApps = false,
  groupingField = null,
}: {
  mode: 'network' | 'landscape' | 'app-landscape' | 'org-landscape';
  search?: string;
  searchTerms?: string[];
  categoricalApps: TApp[];
  allApps: TApp[];
  capabilities: Capability[];
  organizations: Organization[];
  integrations: Integration[];
  filters?: any;
  showApplications?: boolean;
  showCapabilities?: boolean;
  hideOrphanApps?: boolean;
  groupingField?: string | null;
}): TApp[] => {
  const queries = normalizeKeywords(searchTerms && searchTerms.length > 0 ? searchTerms : search ? [search] : [])
    .map((term) => term.toLowerCase());

  if (mode === 'network') {
    const { finalAppIds } = filterNetworkByQueries({
      allApps,
      categoricalApps,
      integrations,
      organizations,
      filters,
      hideOrphanApps,
      queries,
    });
    const allowed = new Set(finalAppIds);
    return allApps.filter((app) => allowed.has(app.id));
  }

  if (queries.length === 0) return categoricalApps;

  if (mode === 'app-landscape') {
    return appLandscapeForQueries({
      candidateApps: categoricalApps,
      showCapabilities,
      queries,
    }).matchedApps;
  }

  const isOrg = mode === 'org-landscape';
  const appsByNode = new Map<string, TApp[]>();
  const unassignedApps: TApp[] = [];
  const orgIds = new Set(organizations.map((org) => org.id));

  for (const app of categoricalApps) {
    if (isOrg) {
      if (app.ownerOrgId && orgIds.has(app.ownerOrgId)) {
        if (!appsByNode.has(app.ownerOrgId)) appsByNode.set(app.ownerOrgId, []);
        appsByNode.get(app.ownerOrgId)!.push(app);
      } else {
        unassignedApps.push(app);
      }
    } else if (app.capabilities && app.capabilities.length > 0) {
      for (const capRef of app.capabilities) {
        if (!appsByNode.has(capRef.id)) appsByNode.set(capRef.id, []);
        appsByNode.get(capRef.id)!.push(app);
      }
    }
  }

  const structure: HierarchyNodeLike[] = isOrg
    ? [
        ...organizations,
        ...(unassignedApps.length > 0 ? [{ id: 'unassigned', name: 'Unassigned', parentId: null }] : []),
      ]
    : capabilities;
  if (isOrg && unassignedApps.length > 0) appsByNode.set('unassigned', unassignedApps);
  const structureMap = new Map(structure.map((node) => [node.id, node]));

  const { hasStructuralFilter, hasOtherAppFilter, hasAnyAppFilter } = analyzeDiagramFilterFlags(filters);
  const structuralOnly = isOrg && !groupingField && hasStructuralFilter && !hasOtherAppFilter;

  const memoBase = new Map<string, boolean>();
  const isBaseRelevant = (nodeId: string, seen = new Set<string>()): boolean => {
    if (memoBase.has(nodeId)) return memoBase.get(nodeId)!;
    if (seen.has(nodeId)) return false;
    const node = structureMap.get(nodeId);
    if (!node) return false;
    const nextSeen = new Set(seen);
    nextSeen.add(nodeId);
    const children = structure.filter((c) => c.parentId === nodeId && c.id !== nodeId);
    const hasApps = (appsByNode.get(nodeId)?.length || 0) > 0;

    let res: boolean;
    if (!hasAnyAppFilter) {
      res = true;
    } else if (structuralOnly) {
      const direct =
        nodeId !== 'unassigned' &&
        listSelected(filters?.orgType, (node as Organization).type) &&
        listSelected(filters?.ownerOrgId, nodeId);
      res = direct || children.some((c) => isBaseRelevant(c.id, nextSeen));
    } else {
      res = hasApps || children.some((c) => isBaseRelevant(c.id, nextSeen));
    }
    memoBase.set(nodeId, res);
    return res;
  };

  return hierarchyForQueries({
    structure,
    appsByNode,
    isBaseRelevant,
    canNodeMatch: () => true,
    showApplications,
    queries,
  })?.matchedSubtreeApps || [];
};

const STANDARD_DEFS: MetadataDefinition[] = [
  { id: 'crit-app', entityType: 'Application', fieldName: 'criticality', fieldType: 'range', label: 'Business Criticality', min: 1, max: 5, scaleType: 'importance' },
  { id: 'crit-cap', entityType: 'Capability', fieldName: 'criticality', fieldType: 'range', label: 'Business Criticality', min: 1, max: 5, scaleType: 'importance' },
  { id: 'cost-app', entityType: 'Application', fieldName: 'cost', fieldType: 'range', label: 'Cost', min: 1, max: 5, scaleType: 'good-bad' },
  { id: 'func-app', entityType: 'Application', fieldName: 'functionalFit', fieldType: 'range', label: 'Functional Fit', min: 1, max: 5, scaleType: 'bad-good' },
  { id: 'tech-app', entityType: 'Application', fieldName: 'technicalFit', fieldType: 'range', label: 'Technical Fit', min: 1, max: 5, scaleType: 'bad-good' },
];

const getContrastColor = (hexcolor: string) => {
  if (!hexcolor || hexcolor === 'transparent') return 'var(--foreground)';
  if (hexcolor.startsWith('#')) {
    const r = parseInt(hexcolor.substring(1, 3), 16);
    const g = parseInt(hexcolor.substring(3, 5), 16);
    const b = parseInt(hexcolor.substring(5, 7), 16);
    const yiq = ((r * 299) + (g * 587) + (b * 114)) / 1000;
    return (yiq >= 128) ? '#000000' : '#ffffff';
  }
  return 'var(--foreground)';
};

const LIFECYCLE_STAGES = [
  { label: 'Discovery', color: '#1864ab', lightColor: '#e7f5ff', description: 'Market research, security vetting, and business case development.' },
  { label: 'Onboarding', color: '#5f3dc4', lightColor: '#f3f0ff', description: 'Installation, configuration, and user training.' },
  { label: 'Mainstream', color: '#2b8a3e', lightColor: '#ebfbee', description: 'The primary solution for the given business capability.' },
  { label: 'Legacy', color: '#d9480f', lightColor: '#fff4e6', description: 'Suboptimal solution kept for specialized needs or pending migration.' },
  { label: 'Decommissioned', color: '#c92a2a', lightColor: '#fff5f5', description: 'Contract terminated and data archived.' }
];

const TIME_STAGES = [
  { value: 'TOLERATE', label: 'Tolerate', color: '#228be6', lightColor: '#228be6' },
  { value: 'INVEST', label: 'Invest', color: '#2b8a3e', lightColor: '#2b8a3e' },
  { value: 'MIGRATE', label: 'Migrate', color: '#e67700', lightColor: '#e67700' },
  { value: 'ELIMINATE', label: 'Eliminate', color: '#c92a2a', lightColor: '#c92a2a' },
];

const getTimeValueForApp = (app: Application, thresholds: TimeThresholds = DEFAULT_TIME_THRESHOLDS) =>
  getAppTimeAssessment(app, thresholds)?.value ?? null;

const getTimeColor = (app: Application, isDark: boolean, thresholds: TimeThresholds = DEFAULT_TIME_THRESHOLDS) => {
  const plain = { bg: isDark ? '#2c2e33' : '#f1f3f5', text: 'var(--foreground)' };
  const timeVal = getTimeValueForApp(app, thresholds);
  if (!timeVal) return plain;
  const stage = TIME_STAGES.find(s => s.value === timeVal);
  if (!stage) return plain;
  return { bg: stage.color, text: getContrastColor(stage.color) };
};

const nodeShadow = (isDark: boolean) => isDark
  ? '0 1px 2px rgba(0, 0, 0, 0.45), 0 6px 14px -4px rgba(0, 0, 0, 0.55)'
  : '0 1px 2px rgba(16, 24, 40, 0.08), 0 5px 12px -3px rgba(16, 24, 40, 0.16)';

const groupShadow = (isDark: boolean) => isDark
  ? '0 1px 2px rgba(0, 0, 0, 0.4), 0 12px 24px -8px rgba(0, 0, 0, 0.55)'
  : '0 1px 2px rgba(16, 24, 40, 0.06), 0 10px 22px -8px rgba(16, 24, 40, 0.16)';

const REFLOW_KEY = 'meat_diagram_reflow';
const FILTER_FRAME_KEY = 'meat_diagram_filter_frame';
const TOOLS_KEY = 'meat_diagram_tools';

const quantizeZoom = (zoom: number) => Math.max(0.05, Math.round(zoom * 20) / 20);

const labelFont = (_name: string, max: number) => max;

// Type tracks both the band height and the room beside the icon, so a short equal card does not get a poster-sized name.
const fittedType = (boxW: number, boxH: number, ceiling: number) => {
  const fromHeight = Math.round(boxH * 0.42);
  const fromWidth = Math.round(Math.max(48, boxW - 32) / 7.2);
  return Math.max(boxH >= 48 ? 13 : 12, Math.min(ceiling, fromHeight, fromWidth));
};

const nodeBorder = (isDark: boolean) => isDark ? 'rgba(255,255,255,0.5)' : 'rgba(0,0,0,0.32)';

// Group frames pack near this width so a shorter frame gets the next one beneath it.
const GROUP_FRAME_PREFERRED = 520;
// Title bar matches a capability title row. The 16px title sits with ordinary padding.
const GROUP_HEADER = 48;

const groupHeaderHeight = (fontScale = 1) =>
  fontScale < 0.99 ? Math.max(36, Math.round(GROUP_HEADER * Math.max(fontScale, 0.75))) : GROUP_HEADER;

const masonryFrameColumns = (count: number, available: number, gap: number) => {
  const n = Math.max(count, 1);
  const room = Math.max(300, Math.floor(available));
  const maxCols = Math.max(1, Math.min(n, Math.floor((room + gap) / (300 + gap)) || 1));
  let cols = 1;
  let best = Infinity;
  for (let c = 1; c <= maxCols; c++) {
    const size = Math.floor((room - gap * Math.max(0, c - 1)) / c);
    const score = Math.abs(size - GROUP_FRAME_PREFERRED) + (n > c ? 0 : 160);
    if (score < best) {
      best = score;
      cols = c;
    }
  }
  const size = Math.floor((room - gap * Math.max(0, cols - 1)) / cols);
  return { cols, size: Math.max(Math.min(300, room), size) };
};

// Columns share the canvas width so fit-to-width does not shrink the boxes.
const flowColumns = (count: number, available: number, minSize: number, gap: number, maxSize = Number.POSITIVE_INFINITY) => {
  const n = Math.max(count, 1);
  const room = Math.max(minSize, Math.floor(available));
  const cols = Math.max(1, Math.min(n, Math.floor((room + gap) / (minSize + gap)) || 1));
  let size = Math.floor((room - gap * Math.max(0, cols - 1)) / cols);
  if (size > maxSize) size = maxSize;
  return { cols, size: Math.max(Math.min(minSize, room), size) };
};

// Every chip stays inside the card. React Flow draws child nodes as siblings, so a parent overflow rule does not clip them.
const fitChipGrid = (count: number, innerW: number, innerH: number) => {
  if (count <= 0 || innerW < 4 || innerH < 4) return null;
  for (const gap of [4, 2, 0]) {
    let best: { cols: number; chipW: number; chipH: number; gap: number; area: number } | null = null;
    for (let cols = 1; cols <= count; cols++) {
      const rows = Math.ceil(count / cols);
      const chipW = Math.floor((innerW - gap * (cols - 1)) / cols);
      const chipH = Math.floor((innerH - gap * (rows - 1)) / rows);
      if (chipW < 4 || chipH < 4) continue;
      const area = chipW * chipH;
      if (!best || area > best.area) best = { cols, chipW, chipH, gap, area };
    }
    if (best) return best;
  }
  return null;
};

// Inside a crowded group, use more columns and a smaller card instead of one tall stack.
const packedColumns = (count: number, room: number, comfortable: number, gap: number) => {
  const comfortableMin = Math.min(comfortable, Math.max(112, room));
  const fitted = flowColumns(Math.max(count, 1), room, comfortableMin, gap, room);
  const rows = Math.ceil(Math.max(count, 1) / fitted.cols);
  if (count <= 6 || rows <= 2) return { ...fitted, fontScale: 1 };
  const wantRows = Math.min(5, Math.max(2, Math.round(Math.sqrt(count) / 1.6)));
  const wantCols = Math.max(fitted.cols + 1, Math.ceil(count / wantRows));
  const minSize = Math.max(112, Math.min(comfortableMin, Math.floor((room - gap * Math.max(0, wantCols - 1)) / Math.max(wantCols, 1))));
  const flow = flowColumns(count, room, minSize, gap, room);
  const fontScale = Math.min(1, Math.max(0.62, flow.size / comfortable));
  return { ...flow, fontScale };
};

const absoluteBounds = (list: Node[], fallbackW = 200, fallbackH = 80) => {
  const byId = new Map(list.map(n => [n.id, n]));
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  list.forEach(n => {
    if (n.id === 'filter-container') return;
    let x = n.position.x;
    let y = n.position.y;
    let parentId = n.parentNode;
    const seen = new Set<string>([n.id]);
    while (parentId && !seen.has(parentId)) {
      seen.add(parentId);
      const parent = byId.get(parentId);
      if (!parent) break;
      x += parent.position.x;
      y += parent.position.y;
      parentId = parent.parentNode;
    }
    const w = n.width || (typeof n.style?.width === 'number' ? n.style.width : fallbackW);
    const h = n.height || (typeof n.style?.height === 'number' ? n.style.height : fallbackH);
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x + w);
    maxY = Math.max(maxY, y + h);
  });
  return { minX, minY, maxX, maxY };
};

const mixSolid = (base: string, tint: string, amount: number) => {
  const channel = (index: number) => {
    const from = parseInt(base.slice(index, index + 2), 16);
    const to = parseInt(tint.slice(index, index + 2), 16);
    return Math.round(from + (to - from) * amount).toString(16).padStart(2, '0');
  };
  return `#${channel(1)}${channel(3)}${channel(5)}`;
};

const groupTint = (color: string, isDark: boolean) => {
  if (!/^#[0-9a-fA-F]{6}$/.test(color)) return isDark ? '#2c2e33' : '#f1f3f5';
  // Opaque wash. An alpha tint let the landscape art show through and same-hue cards dissolve into the frame.
  return mixSolid(isDark ? '#1c1e22' : '#f7f8fa', color, isDark ? 0.3 : 0.42);
};

const getLifecycleColor = (lifecycle: string, isDark: boolean, picklists?: Picklist[]) => {
  if (picklists) {
    const picklist = picklists.find(p => p.name === 'lifecycle');
    if (picklist) {
      const option = picklist.options.find(o => o.value.toLowerCase() === lifecycle.toLowerCase() || o.label.toLowerCase() === lifecycle.toLowerCase());
      if (option && option.color) return { bg: option.color, text: getContrastColor(option.color) };
    }
  }
  const lc = lifecycle?.toLowerCase() || 'discovery';
  const stage = LIFECYCLE_STAGES.find(s => s.label.toLowerCase() === lc) || LIFECYCLE_STAGES[0];
  const bg = isDark ? stage.color : stage.lightColor;
  return { bg, text: getContrastColor(bg) };
};

const interpolateColor = (color1: string, color2: string, factor: number) => {
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

const getScaleColors = (scaleType: string) => {
  switch (scaleType) {
    case 'good-bad': return ['#2b8a3e', '#fab005', '#c92a2a'];
    case 'bad-good': return ['#c92a2a', '#fab005', '#2b8a3e'];
    case 'low-high': return ['#e7f5ff', '#1864ab'];
    case 'importance': return ['#dee2e6', '#7048e8', '#311b92'];
    default: return ['#dee2e6', '#343a40'];
  }
};

const PineTree = ({ size = 60, opacity = 0.35 }: { size?: number; opacity?: number }) => (
  <svg style={{ width: size * 0.5, height: size, display: 'block' }} viewBox="0 0 30 60">
    <g fill="currentColor" opacity={opacity}>
      <polygon points="15,4 6,22 24,22" />
      <polygon points="15,16 3,38 27,38" />
      <polygon points="15,28 0,54 30,54" />
      <rect x="13" y="54" width="4" height="6" />
    </g>
  </svg>
);

const Cloud = ({ width = 120, opacity = 0.2 }: { width?: number; opacity?: number }) => (
  <svg style={{ width, height: width * 0.4, display: 'block' }} viewBox="0 0 100 40">
    <g fill="currentColor" opacity={opacity}>
      <ellipse cx="22" cy="26" rx="20" ry="12" />
      <ellipse cx="50" cy="20" rx="26" ry="16" />
      <ellipse cx="78" cy="26" rx="20" ry="12" />
    </g>
  </svg>
);

const LandscapeArt = ({ isDark }: { isDark: boolean }) => (
  <div style={{ position: 'absolute', inset: 0, overflow: 'hidden', pointerEvents: 'none', zIndex: 0, opacity: isDark ? 0.14 : 0.09 }}>
    {/* Sun/Moon — fixed-size, top-right corner so it stays round at any aspect ratio */}
    <svg style={{ position: 'absolute', top: '10%', right: '8%', width: '110px', height: '110px' }} viewBox="0 0 100 100">
      <circle cx="50" cy="50" r="50" fill="currentColor" opacity="0.25" />
    </svg>

    {/* Birds — fixed-size, upper-left */}
    <svg style={{ position: 'absolute', top: '22%', left: '14%', width: '90px', height: '40px' }} viewBox="0 0 90 40">
      <g opacity="0.35" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
        <path d="M5 18 Q 12 8 19 18 Q 26 8 33 18" />
        <path d="M48 30 Q 55 20 62 30 Q 69 20 76 30" />
      </g>
    </svg>

    {/* Drifting clouds */}
    <div style={{ position: 'absolute', top: '14%', left: '38%' }}><Cloud width={140} opacity={0.18} /></div>
    <div style={{ position: 'absolute', top: '28%', left: '62%' }}><Cloud width={100} opacity={0.14} /></div>

    {/* Ridges — stretched horizontally at the bottom; vertical proportions stay consistent */}
    <svg style={{ position: 'absolute', bottom: 0, left: 0, width: '100%', height: '45%', minHeight: '180px' }} preserveAspectRatio="none" viewBox="0 0 1200 400" xmlns="http://www.w3.org/2000/svg">
      {/* Distant Ridge */}
      <path d="M0 110 C 300 30 600 200 900 70 C 1100 -10 1200 30 1200 30 L 1200 400 L 0 400 Z" fill="currentColor" opacity="0.1" />
      {/* Mid Ridge */}
      <path d="M0 220 C 400 130 800 320 1200 180 L 1200 400 L 0 400 Z" fill="currentColor" opacity="0.2" />
      {/* Near Ridge */}
      <path d="M0 310 C 600 260 1000 380 1200 300 L 1200 400 L 0 400 Z" fill="currentColor" opacity="0.3" />
    </svg>

    {/* Tree clusters — fixed-size, anchored above the bottom so they sit on the ridges */}
    <div style={{ position: 'absolute', bottom: '24%', left: '8%', display: 'flex', alignItems: 'flex-end', gap: '4px' }}>
      <PineTree size={48} opacity={0.4} />
      <PineTree size={68} opacity={0.5} />
      <PineTree size={42} opacity={0.35} />
    </div>
    <div style={{ position: 'absolute', bottom: '18%', right: '12%', display: 'flex', alignItems: 'flex-end', gap: '6px' }}>
      <PineTree size={56} opacity={0.4} />
      <PineTree size={80} opacity={0.55} />
    </div>
    <div style={{ position: 'absolute', bottom: '32%', left: '46%' }}>
      <PineTree size={36} opacity={0.3} />
    </div>
    <div style={{ position: 'absolute', bottom: '12%', left: '32%' }}>
      <PineTree size={64} opacity={0.45} />
    </div>
  </div>
);

const NetworkArt = ({ isDark }: { isDark: boolean }) => (
  <div style={{ position: 'absolute', inset: 0, overflow: 'hidden', pointerEvents: 'none', zIndex: 0, opacity: isDark ? 0.24 : 0.16 }}>
    <style>{`
      @keyframes twinkle {
        0%, 100% { opacity: 0.4; transform: scale(0.9); }
        50% { opacity: 0.9; transform: scale(1.1); }
      }
      .star {
        animation: twinkle 8s infinite ease-in-out;
      }
    `}</style>
    <svg width="100%" height="100%" preserveAspectRatio="none" viewBox="0 0 1200 800" xmlns="http://www.w3.org/2000/svg">
      {/* Starry background dots with twinkling */}
      <circle className="star" cx="100" cy="100" r="1.5" fill="currentColor" style={{ animationDelay: '0s' }} />
      <circle className="star" cx="300" cy="150" r="1" fill="currentColor" style={{ animationDelay: '1.2s' }} />
      <circle className="star" cx="500" cy="80" r="1.2" fill="currentColor" style={{ animationDelay: '0.5s' }} />
      <circle className="star" cx="700" cy="200" r="1.5" fill="currentColor" style={{ animationDelay: '2.1s' }} />
      <circle className="star" cx="900" cy="120" r="1" fill="currentColor" style={{ animationDelay: '0.8s' }} />
      <circle className="star" cx="1100" cy="180" r="1.2" fill="currentColor" style={{ animationDelay: '1.5s' }} />
      <circle className="star" cx="50" cy="400" r="1" fill="currentColor" style={{ animationDelay: '2.5s' }} />
      <circle className="star" cx="250" cy="450" r="1.5" fill="currentColor" style={{ animationDelay: '0.3s' }} />
      <circle className="star" cx="450" cy="380" r="1.2" fill="currentColor" style={{ animationDelay: '1.7s' }} />
      <circle className="star" cx="650" cy="500" r="1.5" fill="currentColor" style={{ animationDelay: '0.9s' }} />
      <circle className="star" cx="850" cy="420" r="1" fill="currentColor" style={{ animationDelay: '2.2s' }} />
      <circle className="star" cx="1050" cy="480" r="1.2" fill="currentColor" style={{ animationDelay: '1.1s' }} />
      <circle className="star" cx="150" cy="700" r="1.2" fill="currentColor" style={{ animationDelay: '0.6s' }} />
      <circle className="star" cx="350" cy="750" r="1" fill="currentColor" style={{ animationDelay: '1.9s' }} />
      <circle className="star" cx="550" cy="680" r="1.5" fill="currentColor" style={{ animationDelay: '0.4s' }} />
      <circle className="star" cx="750" cy="780" r="1.2" fill="currentColor" style={{ animationDelay: '2.7s' }} />
      <circle className="star" cx="950" cy="720" r="1.5" fill="currentColor" style={{ animationDelay: '1.3s' }} />
      <circle className="star" cx="1150" cy="760" r="1" fill="currentColor" style={{ animationDelay: '0.2s' }} />

      {/* Interconnected constellations */}
      <g stroke="currentColor" strokeWidth="0.8" opacity="0.4" fill="none">
        <path d="M100 100 L300 150 L500 80 L700 200 L900 120 L1100 180" />
        <path d="M50 400 L250 450 L450 380 L650 500 L850 420 L1050 480" />
        <path d="M150 700 L350 750 L550 680 L750 780 L950 720 L1150 760" />
        <path d="M300 150 L250 450 L350 750" />
        <path d="M700 200 L650 500 L750 780" />
        <path d="M900 120 L850 420 L950 720" />
      </g>
    </svg>
  </div>
);

const CenteredEdge = ({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  style = {},
  markerEnd,
  label,
}: EdgeProps) => {
  const [edgePath, labelX, labelY] = getBezierPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
  });

  return (
    <>
      <path
        id={id}
        style={style}
        className="react-flow__edge-path"
        d={edgePath}
        markerEnd={markerEnd}
      />
      {label && (
        <foreignObject
          width={200}
          height={40}
          x={labelX - 100}
          y={labelY - 20}
          style={{ pointerEvents: 'none', overflow: 'visible' }}
        >
          <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', width: '100%', height: '100%' }}>
            <div style={{
              background: 'var(--card)',
              padding: '2px 8px',
              borderRadius: '4px',
              fontSize: '12px',
              fontWeight: 500,
              color: 'var(--foreground)',
              border: '1px solid var(--border)',
              whiteSpace: 'nowrap',
              boxShadow: '0 1px 2px rgba(0,0,0,0.1)',
              pointerEvents: 'auto',
              cursor: 'pointer'
            }}>
              {label}
            </div>
          </div>
        </foreignObject>
      )}
    </>
  );
};

const getFieldPicklist = (fieldName: string, picklistsList?: Picklist[]) => {
  if (!picklistsList) return undefined;
  const normalize = (s: string) => s.toLowerCase().replace(/_/g, '').replace(/\s+/g, '');
  const fNorm = normalize(fieldName);
  return picklistsList.find(p => {
    const pNorm = normalize(p.name);
    return pNorm === fNorm || 
      (fNorm === 'cost' && (p.name === 'application_cost' || pNorm === 'applicationcost')) ||
      (fNorm === 'type' && (p.name === 'application_type' || pNorm === 'applicationtype')) ||
      (fNorm === 'functionalfit' && (p.name === 'functional_fit' || pNorm === 'functionalfit')) ||
      (fNorm === 'technicalfit' && (p.name === 'technical_fit' || pNorm === 'technicalfit'));
  });
};

const getOverlayColor = (value: string | number, def: MetadataDefinition, picklists: Picklist[] = []) => {
  const picklist = getFieldPicklist(def.fieldName, picklists);
  
  if (picklist) {
    const valStr = String(value);
    // Priority 1: Exact value match
    // Priority 2: Exact label match
    let option = picklist.options.find(o => String(o.value) === valStr || o.label === valStr);
    
    // Priority 3: Numeric rounding match (for range fields)
    if (!option && !isNaN(Number(value))) {
      const rounded = Math.round(Number(value));
      option = picklist.options.find(o => String(o.value) === String(rounded));
    }
    
    if (option && option.color) return { bg: option.color, text: getContrastColor(option.color) };
  }

  // Fallback to interpolation for numeric ranges
  const numVal = Number(value);
  const min = def.min ?? 0;
  const max = def.max ?? 100;
  const range = max - min;
  const normalized = range === 0 ? 0.5 : Math.max(0, Math.min(1, (numVal - min) / range));
  const colors = getScaleColors(def.scaleType);

  let bg = '';
  if (colors.length === 3) {
    if (normalized < 0.5) bg = interpolateColor(colors[0], colors[1], normalized * 2);
    else bg = interpolateColor(colors[1], colors[2], (normalized - 0.5) * 2);
  } else {
    bg = interpolateColor(colors[0], colors[1], normalized);
  }
  return { bg, text: getContrastColor(bg) };
};

const NODE_TYPES = {};
const EDGE_TYPES = {
  centered: CenteredEdge
};
const NO_ORGANIZATIONS: Organization[] = [];

const DiagramInner = ({ 
  onNodeClick,
  onCapabilityClick,
  onOrganizationClick,
  onIntegrationClick,
  apps, 
  filteredApps, 
  categoricalFilteredApps,
  integrations, 
  capabilities,
  organizations = NO_ORGANIZATIONS, 
  metaDefs: dbMetaDefs, 
  picklists, 
  mode = 'landscape', 
  activeOverlay = null, 
  activeCustomOverlays = [],
  showApplications = true, 
  showCapabilities = true,
  hideOrphanApps = true,
  showCriticality = true, 
  filters = {},
  groupingField = null,
  searchTerms = [],
  visible = false,
  containerRef,
  timeThresholds = DEFAULT_TIME_THRESHOLDS,
}: Props) => {
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  useDiagramReveal(setNodes);
  const { setViewport, getNodes, getViewport } = useReactFlow();
  const store = useStoreApi();
  const viewportWidth = useStore((s) => s.width);
  const viewportHeight = useStore((s) => s.height);
  const nodesInitialized = useNodesInitialized();
  const lastFitKey = useRef<string>('');
  const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
  const [filterMiss, setFilterMiss] = useState(false);
  const [lockNodes, setLockNodes] = useState(true);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [reflow, setReflow] = useState(() => {
    try { return localStorage.getItem(REFLOW_KEY) === '1'; } catch { return false; }
  });
  const [filterFrame, setFilterFrame] = useState(() => {
    try { return localStorage.getItem(FILTER_FRAME_KEY) === '1'; } catch { return false; }
  });
  const [toolsOpen, setToolsOpen] = useState(() => {
    try { return localStorage.getItem(TOOLS_KEY) !== '0'; } catch { return true; }
  });
  const [reflowZoom, setReflowZoom] = useState(1);
  const reflowFocus = useRef(0.12);
  const reflowRef = useRef(reflow);
  reflowRef.current = reflow;
  const fitTimerRef = useRef<number>(0);
  const [layoutMetrics, setLayoutMetrics] = useState<{ count: number; span: number }>({ count: 0, span: 0 });
  type InspectedConcept =
    | { kind: 'app'; app: Application }
    | { kind: 'capability'; capability: Capability }
    | { kind: 'organization'; organization: Organization }
    | { kind: 'integration'; integration: Integration };
  const [inspectedConcept, setInspectedConcept] = useState<InspectedConcept | null>(null);

  useEffect(() => {
    setInspectedConcept(null);
  }, [mode]);

  useEffect(() => {
    if (!inspectedConcept) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setInspectedConcept(null);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [inspectedConcept]);

  const legendRef = useRef<HTMLDivElement>(null);

  const onExport = async () => {
    const viewport = (containerRef?.current?.querySelector('.react-flow__viewport') ??
      document.querySelector('.react-flow__viewport')) as HTMLElement | null;
    if (!viewport) return;

    setIsExporting(true);
    try {
      // Wait for React to commit isExporting=true so a collapsed legend expands before measuring
      await new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
      );

      const nodes = getNodes();
      const rawBounds = nodes.length > 0 ? getNodesBounds(nodes) : { x: 0, y: 0, width: 0, height: 0 };
      const bounds = {
        x: Number.isFinite(rawBounds.x) ? rawBounds.x : 0,
        y: Number.isFinite(rawBounds.y) ? rawBounds.y : 0,
        width: Number.isFinite(rawBounds.width) && rawBounds.width > 0 ? rawBounds.width : 0,
        height: Number.isFinite(rawBounds.height) && rawBounds.height > 0 ? rawBounds.height : 0,
      };
      const legendEl = legendRef.current;
      const legendRect = legendEl ? legendEl.getBoundingClientRect() : null;
      const legendW = legendRect ? Math.ceil(legendRect.width) : 0;
      const legendH = legendRect ? Math.ceil(legendRect.height) : 0;

      const pad = 50;
      const legendGap = legendW > 0 ? 32 : 0;
      const diagramOffsetX = pad + legendW + legendGap;
      const diagramOffsetY = pad;
      const imageWidth = Math.max(1, Math.ceil(diagramOffsetX + bounds.width + pad));
      const imageHeight = Math.max(1, Math.ceil(Math.max(bounds.height, legendH) + pad * 2));
      const bgColor = isDark ? '#1a1b1e' : '#f8f9fa';
      const fontEmbedCSS = await getFontEmbedCSS(viewport);

      const [diagramCanvas, legendCanvas] = await Promise.all([
        toCanvas(viewport, {
          backgroundColor: bgColor,
          width: imageWidth,
          height: imageHeight,
          fontEmbedCSS,
          style: {
            width: `${imageWidth}px`,
            height: `${imageHeight}px`,
            transform: `translate(${-bounds.x + diagramOffsetX}px, ${-bounds.y + diagramOffsetY}px) scale(1)`,
          },
        }),
        legendEl && legendW > 0 && legendH > 0
          ? toCanvas(legendEl, {
              width: legendW,
              height: legendH,
              fontEmbedCSS,
              filter: (el) => !(el instanceof HTMLElement && el.dataset.exportHide === 'true'),
              style: {
                transform: 'none',
                transition: 'none',
                margin: '0',
              },
            })
          : Promise.resolve(null),
      ]);

      const ctx = diagramCanvas.getContext('2d');
      if (ctx && legendCanvas) {
        const scaleX = diagramCanvas.width / imageWidth;
        const scaleY = diagramCanvas.height / imageHeight;
        ctx.save();
        ctx.shadowColor = isDark ? 'rgba(0, 0, 0, 0.38)' : 'rgba(0, 0, 0, 0.12)';
        ctx.shadowBlur = 12 * scaleX;
        ctx.shadowOffsetX = 0;
        ctx.shadowOffsetY = 4 * scaleY;
        ctx.drawImage(
          legendCanvas,
          pad * scaleX,
          pad * scaleY,
          legendW * scaleX,
          legendH * scaleY,
        );
        ctx.restore();
      }

      const dataUrl = diagramCanvas.toDataURL('image/png');
      const link = document.createElement('a');
      link.download = `openea-diagram-${mode}-${new Date().toISOString().split('T')[0]}.png`;
      link.href = dataUrl;
      link.click();
    } catch (err) {
      console.error('Export failed:', err);
    } finally {
      setIsExporting(false);
    }
  };

  useEffect(() => {
    try { localStorage.setItem(REFLOW_KEY, reflow ? '1' : '0'); } catch { /* private mode */ }
  }, [reflow]);

  useEffect(() => {
    try { localStorage.setItem(FILTER_FRAME_KEY, filterFrame ? '1' : '0'); } catch { /* private mode */ }
  }, [filterFrame]);

  useEffect(() => {
    try { localStorage.setItem(TOOLS_KEY, toolsOpen ? '1' : '0'); } catch { /* private mode */ }
  }, [toolsOpen]);

  useEffect(() => {
    if (!reflow) return;
    const rememberFocus = () => {
      const vp = getViewport();
      const top = getNodes().filter(n => !n.parentNode);
      if (top.length === 0) return;
      const bounds = getNodesBounds(top);
      if (!bounds.height) return;
      const state = store.getState();
      const cy = (state.height / 2 - vp.y) / vp.zoom;
      reflowFocus.current = Math.min(1, Math.max(0, (cy - bounds.y) / bounds.height));
    };
    const applyZoom = () => {
      const next = quantizeZoom(store.getState().transform[2]);
      setReflowZoom(prev => prev === next ? prev : next);
    };
    applyZoom();
    let timer = 0;
    const unsub = store.subscribe((state, prev) => {
      if (state.transform[2] === prev.transform[2]) return;
      window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        rememberFocus();
        applyZoom();
      }, 200);
    });
    return () => {
      window.clearTimeout(timer);
      unsub();
    };
  }, [reflow, store, getViewport, getNodes]);

  const nodeTypes = useMemo(() => NODE_TYPES, []);
  const edgeTypes = useMemo(() => EDGE_TYPES, []);

  const toggleFullscreen = () => {
    if (!containerRef?.current) return;
    if (!document.fullscreenElement) {
      containerRef.current.requestFullscreen().catch(err => {
        console.error(`Error attempting to enable full-screen mode: ${err.message} (${err.name})`);
      });
    } else {
      document.exitFullscreen();
    }
  };

  useEffect(() => {
    const handler = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', handler);
    return () => document.removeEventListener('fullscreenchange', handler);
  }, []);

  const [legendPos, setLegendPos] = useState({ x: 20, y: 20 });
  const [isLegendExpanded, setIsLegendExpanded] = useState(true);
  const isDraggingLegend = useRef(false);
  const dragStart = useRef({ x: 0, y: 0 });

  const onLegendMouseDown = (e: React.MouseEvent) => {
    isDraggingLegend.current = true;
    dragStart.current = { x: e.clientX - legendPos.x, y: e.clientY - legendPos.y };
    e.stopPropagation();
  };

  useEffect(() => {
    const onMouseMove = (e: MouseEvent) => {
      if (!isDraggingLegend.current) return;
      setLegendPos({
        x: e.clientX - dragStart.current.x,
        y: e.clientY - dragStart.current.y
      });
    };
    const onMouseUp = () => { isDraggingLegend.current = false; };
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
    return () => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };
  }, [legendPos]);

  const metaDefs = useMemo(() => {
    const defs = [...(dbMetaDefs || [])];
    STANDARD_DEFS.forEach(std => {
      if (!defs.some(d => d.fieldName === std.fieldName && d.entityType === std.entityType)) {
        defs.push(std);
      }
    });
    return defs;
  }, [dbMetaDefs]);

  const critDef = metaDefs.find(d => d.fieldName === 'criticality' && d.entityType === 'Capability');
  const appCritDef = metaDefs.find(d => d.fieldName === 'criticality' && d.entityType === 'Application');
  const appOverlayDef = metaDefs.find(d => d.fieldName === activeOverlay && d.entityType === 'Application');

  const getFieldLabel = (field: string) => {
    if (field === 'lifecycle') return 'Lifecycle';
    if (field === 'time') return 'TIME Assessment';
    if (field === 'cost') return 'Cost';
    if (field === 'functionalFit') return 'Functional Fit';
    if (field === 'technicalFit') return 'Technical Fit';
    if (field === 'criticality') return 'Business Criticality';
    if (field === 'type') return 'Application Type';
    if (field === 'owner') return 'Owner';
    const def = metaDefs.find(d => d.fieldName === field);
    if (def?.label) return def.label;
    const pl = getFieldPicklist(field, picklists);
    if (pl?.label) return pl.label;
    return field;
  };

  const getGroupInfo = (field: string, val: string, entType: string): { color: string; label: string } => {
    // 1. TIME Assessment
    if (field === 'time') {
      const stage = TIME_STAGES.find(s => s.value.toLowerCase() === val.toLowerCase() || s.label.toLowerCase() === val.toLowerCase());
      if (stage) {
        return { color: stage.color, label: stage.label };
      }
      return { color: '#adb5bd', label: val };
    }

    // 2. Lifecycle
    if (field === 'lifecycle') {
      const pl = getFieldPicklist('lifecycle', picklists);
      const opt = pl?.options.find(o => o.value.toLowerCase() === val.toLowerCase() || o.label.toLowerCase() === val.toLowerCase());
      const stage = LIFECYCLE_STAGES.find(s => s.label.toLowerCase() === val.toLowerCase());
      const color = opt?.color || stage?.color || 'var(--primary)';
      const label = opt?.label || stage?.label || val;
      return { color, label };
    }

    // 3. Picklists (criticality, cost, functionalFit, technicalFit, custom, etc.)
    const pl = getFieldPicklist(field, picklists);
    if (pl) {
      const valStr = String(val);
      let opt = pl.options.find(o => String(o.value).toLowerCase() === valStr.toLowerCase() || o.label.toLowerCase() === valStr.toLowerCase());
      if (!opt && !isNaN(Number(val))) {
        const rounded = Math.round(Number(val));
        opt = pl.options.find(o => String(o.value) === String(rounded));
      }
      if (opt) {
        let color = opt.color;
        if (!color) {
          const def = metaDefs.find(d => d.fieldName === field && d.entityType === entType) || metaDefs.find(d => d.fieldName === field);
          if (def) color = getOverlayColor(val, def, picklists || []).bg;
        }
        return { color: color || 'var(--primary)', label: opt.label || val };
      }
    }

    // 4. MetadataDefinition fallback (interpolated ranges or standard defs)
    const def = metaDefs.find(d => d.fieldName === field && d.entityType === entType) || metaDefs.find(d => d.fieldName === field);
    if (def) {
      const color = getOverlayColor(val, def, picklists || []).bg;
      return { color, label: val };
    }

    return { color: 'var(--primary)', label: val };
  };

  const getCustomLabels = useCallback((entity: any, entityType: string) => {
    try {
      if (!activeCustomOverlays || activeCustomOverlays.length === 0) return [];
      const meta = safeJsonParse(entity.metadata);
      return metaDefs
        .filter(d => d.entityType === entityType && meta[d.fieldName] && activeCustomOverlays.includes(d.fieldName))
        .map(d => {
          const valStr = String(meta[d.fieldName]);
          let bg = 'var(--accent)';
          let text = 'var(--foreground)';
          if (d.fieldType === 'range') {
            const colors = getOverlayColor(valStr, d, picklists || []);
            bg = colors.bg; text = colors.text;
          } else {
            const normalize = (s: string) => s.toLowerCase().replace(/_/g, '').replace(/\s+/g, '');
            const fieldKey = normalize(d.fieldName);
            const picklist = picklists?.find(p => {
              const pNorm = normalize(p.name);
              return pNorm === fieldKey || (fieldKey === 'cost' && (p.name === 'application_cost' || pNorm === 'applicationcost'));
            });

            if (picklist) {
              const opt = picklist.options.find((o: any) => String(o.value) === valStr || o.label === valStr);
              if (opt && opt.color) {
                bg = opt.color; text = getContrastColor(bg);
              }
            }
          }
          return (
            <div key={d.id} style={{ fontSize: '10px', padding: '2px 6px', borderRadius: '4px', background: bg, color: text, border: '1px solid var(--border)', whiteSpace: 'nowrap', fontWeight: 500 }}>
              {d.label}: {valStr}
            </div>
          );
        });
    } catch (e) { return []; }
  }, [activeCustomOverlays, metaDefs, picklists]);

  // A fresh organizations array each render retriggers this effect and React Flow setNodes loops.
  const organizationKey = organizations.map((org) => `${org.id}\0${org.parentId ?? ''}\0${org.name}\0${org.type ?? ''}`).join('\n');
  const searchTermKey = normalizeKeywords(searchTerms).join('\u0001');

  useEffect(() => {
    if (!apps || !metaDefs || !picklists || apps.length === 0) return;
    if (mode !== 'org-landscape' && (!capabilities || capabilities.length === 0)) return;
    const activeQueries = searchTermKey ? searchTermKey.split('\u0001').map((term) => term.toLowerCase()) : [];
    const publishDiagram = (nextNodes: Node[], nextEdges: Edge[]) => {
      const hasContent = nextNodes.some((node) => node.id !== 'filter-container');
      setFilterMiss(!hasContent && (hasActiveDiagramFilter(filters) || activeQueries.length > 0));
      const publishedNodes = hasContent ? nextNodes : [];
      let nextSpan = 0;
      for (const n of publishedNodes) {
        if (n.parentNode || n.id === 'filter-container') continue;
        const saved = revealWidth(n);
        const w = saved ?? (typeof n.style?.width === 'number' ? n.style.width : 0);
        nextSpan = Math.max(nextSpan, n.position.x + w);
      }
      const roundedSpan = Math.round(nextSpan);
      setLayoutMetrics((prev) =>
        prev.count === publishedNodes.length && prev.span === roundedSpan
          ? prev
          : { count: publishedNodes.length, span: roundedSpan }
      );
      setNodes(publishedNodes);
      setEdges(hasContent ? nextEdges : []);
    };

    const borderColor = nodeBorder(isDark);

    const getCapScore = (capId: string): number => {
      const cap = capabilities.find(c => c.id === capId);
      if (!cap) return 0;
      const localVal = Number(cap.criticality || 1);
      const childMax = capabilities
        .filter(c => c.parentId === capId)
        .map(c => getCapScore(c.id));
      return childMax.length > 0 ? Math.max(localVal, ...childMax) : localVal;
    };

    const getAppScore = (app: Application, fieldName: string, def?: MetadataDefinition) => {
      const localVal = Number((app as any)[fieldName] || safeJsonParse(app.metadata)[fieldName] || (def ? def.min : 1));
      
      if (fieldName === 'criticality' && app.capabilities && app.capabilities.length > 0) {
        const capScores = app.capabilities.map((c: any) => getCapScore(c.id)).filter((n: number) => !isNaN(n) && n > 0);
        
        if (capScores.length > 0) {
          return Math.max(...capScores);
        }
      }
      return localVal;
    };
    const getFieldValue = (app: Application, field: string) => {
      if (field === 'criticality') {
        return String(getAppScore(app, 'criticality', appCritDef));
      }
      if (field === 'cost') {
        const def = metaDefs.find(d => d.fieldName === 'cost' && d.entityType === 'Application');
        return String(getAppScore(app, 'cost', def));
      }
      if (field === 'functionalFit') {
        const def = metaDefs.find(d => d.fieldName === 'functionalFit' && d.entityType === 'Application');
        return String(getAppScore(app, 'functionalFit', def));
      }
      if (field === 'technicalFit') {
        const def = metaDefs.find(d => d.fieldName === 'technicalFit' && d.entityType === 'Application');
        return String(getAppScore(app, 'technicalFit', def));
      }
      if (field === 'time') {
        return getTimeValueForApp(app, timeThresholds) || 'Unassessed';
      }
      const val = (app as any)[field] || safeJsonParse(app.metadata)[field];
      return val ? String(val) : 'Unspecified';
    };

    const getCapFieldValue = (cap: Capability, field: string) => {
      if (field === 'criticality') {
        return String(getCapScore(cap.id));
      }
      const def = metaDefs.find(d => d.fieldName === field && d.entityType === 'Capability');
      const val = (cap as any)[field] || safeJsonParse(cap.metadata)[field] || (def ? def.min : 'Unspecified');
      return String(val);
    };

    const viewW = viewportWidth > 0 ? viewportWidth : (typeof window !== 'undefined' ? Math.max(720, window.innerWidth - 48) : 1200);
    const payloadNames = new Map<string, string>();
    for (const integration of integrations) {
      const id = integration.infoObjectId || integration.payload?.id;
      if (id && integration.payload?.name) payloadNames.set(id, integration.payload.name);
    }
    const filterLabels = describeCategoricalFilters(filters, organizations, capabilities, metaDefs, apps, payloadNames);
    const keywordTerms = searchTermKey ? searchTermKey.split('\u0001') : [];
    if (keywordTerms.length > 0) filterLabels.push(`Keywords: ${keywordTerms.join(', ')}`);
    const showFilterFrame = filterFrame && !groupingField && filterLabels.length > 0;
    const framePad = showFilterFrame ? 128 : 28;
    const filterFrameNode = (list: Node[], fallbackW = 200, fallbackH = 80): Node | null => {
      const b = absoluteBounds(list, fallbackW, fallbackH);
      if (b.minX === Infinity) return null;
      const pad = 48;
      const title = filterLabels.join(' · ');
      const width = (b.maxX - b.minX) + pad * 2;
      const lineH = 18;
      const charsPerLine = Math.max(16, Math.floor(Math.max(160, width - 36) / 6.4));
      const lines = Math.max(1, Math.ceil(title.length / charsPerLine));
      const titleH = 10 + lines * lineH + 8;
      return {
        id: 'filter-container',
        data: {
          label: (
            <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: titleH, boxSizing: 'border-box', padding: '8px 18px 0', color: 'var(--foreground)', fontSize: 13, fontWeight: 600, lineHeight: `${lineH}px`, textAlign: 'left', overflow: 'hidden' }}>
              {title}
            </div>
          ),
        },
        position: { x: b.minX - pad, y: b.minY - pad - titleH },
        style: {
          width,
          height: (b.maxY - b.minY) + pad * 2 + titleH,
          background: isDark ? 'rgba(255, 255, 255, 0.02)' : 'rgba(0, 0, 0, 0.02)',
          border: '2px solid var(--primary)',
          borderRadius: '24px',
          padding: 0,
          color: 'var(--foreground)',
          pointerEvents: 'none',
          zIndex: -100,
        },
      };
    };
    const flowWidth = viewW / Math.max(reflowZoom, 0.05);
    const canvasBudget = Math.max(360, Math.floor(flowWidth - framePad));

    if (mode === 'network') {
      const { finalAppIds, filteredIntegrations } = filterNetworkByQueries({
        allApps: apps,
        categoricalApps: categoricalFilteredApps,
        integrations,
        organizations,
        filters,
        hideOrphanApps,
        queries: activeQueries,
      });
      const adj = new Map<string, string[]>();
      finalAppIds.forEach(id => adj.set(id, []));
      filteredIntegrations.forEach(i => {
        adj.get(i.sourceAppId)?.push(i.targetAppId);
        adj.get(i.targetAppId)?.push(i.sourceAppId);
      });
      const visited = new Set<string>();
      const islands: string[][] = [];
      finalAppIds.forEach(id => {
        if (!visited.has(id)) {
          const island: string[] = []; const stack = [id]; visited.add(id);
          while(stack.length > 0) {
            const curr = stack.pop()!; island.push(curr);
            adj.get(curr)?.forEach(neighbor => { if (!visited.has(neighbor)) { visited.add(neighbor); stack.push(neighbor); } });
          }
          islands.push(island);
        }
      });
      const islandNodes: Node[] = []; const islandEdges: Edge[] = [];
      let cursorX = 0; let cursorY = 0; let rowH = 0;
      const islandGap = 40; const nodeWidth = 200; const nodeHeight = 72;
      islands.forEach((islandAppIds) => {
        const g = new dagre.graphlib.Graph(); g.setGraph({ rankdir: 'TB', nodesep: 40, ranksep: 72 }); g.setDefaultEdgeLabel(() => ({}));
        islandAppIds.forEach(id => g.setNode(id, { width: nodeWidth, height: nodeHeight }));
        filteredIntegrations.forEach(i => { if (islandAppIds.includes(i.sourceAppId)) g.setEdge(i.sourceAppId, i.targetAppId); });
        dagre.layout(g);
        const islandBox = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity };
        g.nodes().forEach(v => {
          const node = g.node(v); islandBox.minX = Math.min(islandBox.minX, node.x - nodeWidth / 2); islandBox.minY = Math.min(islandBox.minY, node.y - nodeHeight / 2);
          islandBox.maxX = Math.max(islandBox.maxX, node.x + nodeWidth / 2); islandBox.maxY = Math.max(islandBox.maxY, node.y + nodeHeight / 2);
        });
        const islandWidth = Math.max(nodeWidth, islandBox.maxX - islandBox.minX);
        const islandHeight = Math.max(nodeHeight, islandBox.maxY - islandBox.minY);
        if (cursorX > 0 && cursorX + islandWidth > canvasBudget) {
          cursorX = 0;
          cursorY += rowH + islandGap;
          rowH = 0;
        }
        islandAppIds.forEach(id => {
          const app = apps.find(a => a.id === id)!; if (!app) return;
          const dNode = g.node(id); let colors = { bg: 'var(--card)', text: 'var(--foreground)' };
          if (activeOverlay === 'lifecycle') colors = getLifecycleColor(app.lifecycle, isDark, picklists);
          else if (activeOverlay === 'time') colors = getTimeColor(app, isDark, timeThresholds);
          else {
            const overlayToUse = activeOverlay === 'criticality' ? appCritDef : appOverlayDef;
            if (overlayToUse) { colors = getOverlayColor(getAppScore(app, activeOverlay!, overlayToUse), overlayToUse, picklists); }
          }
          islandNodes.push({
            id: app.id,
            data: { label: (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', justifyContent: 'center', gap: '4px', width: '100%', height: '100%', minWidth: 0, padding: '8px 12px', boxSizing: 'border-box' }}>
                <div data-box-row="" style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-start', gap: '0.45rem', width: '100%', minWidth: 0 }}>
                  <Database size={16} style={{ flexShrink: 0 }} />
                  <BoxLabel id={app.id} name={app.name} style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0, fontSize: labelFont(app.name, 18), fontWeight: 560, lineHeight: 1.25 }} />
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '2px', justifyContent: 'flex-start' }}>{getCustomLabels(app, 'Application')}</div>
              </div>
            ), type: 'app', original: app },

            position: { x: cursorX + (dNode.x - islandBox.minX), y: cursorY + (dNode.y - islandBox.minY) },
            style: { background: colors.bg, color: colors.text, border: `1.5px solid ${borderColor}`, borderRadius: '12px', width: nodeWidth, height: nodeHeight, fontWeight: 560, textAlign: 'left', padding: 0, display: 'flex', alignItems: 'center', justifyContent: 'flex-start', boxShadow: nodeShadow(isDark), cursor: 'pointer' }
          });
        });
        filteredIntegrations.forEach(i => {
          if (islandAppIds.includes(i.sourceAppId)) {
            islandEdges.push({
              id: `e-${i.id}`, source: i.sourceAppId, target: i.targetAppId,
              label: i.payload?.name ? (i.pattern ? `${i.payload.name} (${i.pattern})` : i.payload.name) : (i.pattern || ''),
              type: 'centered',
              data: { original: i },
              style: { stroke: isDark ? '#ced4da' : '#495057', strokeWidth: 2.25, cursor: 'pointer' },
              markerEnd: { type: MarkerType.ArrowClosed, color: isDark ? '#ced4da' : '#495057' },
            });
          }
        });
        cursorX += islandWidth + islandGap;
        rowH = Math.max(rowH, islandHeight);
      });

      // --- ADD FILTER FEEDBACK TO NETWORK VIEW ---
      if (showFilterFrame && islandNodes.length > 0) {
        const frame = filterFrameNode(islandNodes, 200, 72);
        if (frame) islandNodes.unshift(frame);
      }
      // ------------------------------------------

      publishDiagram(islandNodes, islandEdges);
    } else if (mode === 'landscape' || mode === 'app-landscape' || mode === 'org-landscape') {
      const allFinalNodes: Node[] = [];

      const activeFilterGroups: { field: string, values: string[], entityType: string }[] = [];
      if (groupingField) {
        const isCapField = metaDefs.some(d => d.fieldName === groupingField && d.entityType === 'Capability');
        
        if (isCapField && mode === 'landscape') {
          const uniqueValues = Array.from(new Set(capabilities.map(cap => getCapFieldValue(cap, groupingField))));
          
          uniqueValues.sort((a, b) => {
            const numA = parseFloat(a); const numB = parseFloat(b);
            if (!isNaN(numA) && !isNaN(numB)) return numA - numB;
            return a.localeCompare(b);
          });
          
          activeFilterGroups.push({ field: groupingField, values: uniqueValues, entityType: 'Capability' });
        } else {
          const uniqueValues = Array.from(new Set(categoricalFilteredApps.map(app => getFieldValue(app, groupingField))));

          uniqueValues.sort((a, b) => {
            if (groupingField === 'lifecycle') {
              const order = LIFECYCLE_STAGES.map(s => s.label.toLowerCase());
              return order.indexOf(a.toLowerCase()) - order.indexOf(b.toLowerCase());
            }
            if (groupingField === 'time') {
              const order = TIME_STAGES.map(s => s.value.toLowerCase());
              return order.indexOf(a.toLowerCase()) - order.indexOf(b.toLowerCase());
            }
            const numA = parseFloat(a);
            const numB = parseFloat(b);
            if (!isNaN(numA) && !isNaN(numB)) return numA - numB;
            return a.localeCompare(b);
          });

          activeFilterGroups.push({ field: groupingField, values: uniqueValues, entityType: 'Application' });
        }
      } else {
        if (filters.lifecycle?.length > 0) activeFilterGroups.push({ field: 'lifecycle', values: filters.lifecycle, entityType: 'Application' });
        if (filters.owner?.length > 0) activeFilterGroups.push({ field: 'owner', values: filters.owner, entityType: 'Application' });
        if (filters.type?.length > 0) activeFilterGroups.push({ field: 'type', values: filters.type, entityType: 'Application' });
      }
      const primaryGroup = activeFilterGroups[0];

      const renderGroupContentNodes = (targetApps: Application[], containerId: string | undefined, capFilter: ((c: Capability) => boolean) | undefined, budget: number, cell?: { w: number; h: number }) => {
        const groupNodes: Node[] = [];
        const isOrg = mode === 'org-landscape';
        const boxId = (nodeId: string) => `${isOrg ? 'org' : 'cap'}-${containerId || 'main'}-${nodeId}`;
        const appsByCap = new Map<string, Application[]>();
        const unassignedApps: Application[] = [];
        const orgIds = new Set(organizations.map(org => org.id));
        targetApps.forEach(app => {
          if (isOrg) {
            if (app.ownerOrgId && orgIds.has(app.ownerOrgId)) {
              if (!appsByCap.has(app.ownerOrgId)) appsByCap.set(app.ownerOrgId, []);
              appsByCap.get(app.ownerOrgId)!.push(app);
            } else {
              unassignedApps.push(app);
            }
          } else if (!app.capabilities || app.capabilities.length === 0) {
            unassignedApps.push(app);
          } else {
            app.capabilities.forEach(capRef => {
              if (!appsByCap.has(capRef.id)) appsByCap.set(capRef.id, []);
              appsByCap.get(capRef.id)!.push(app);
            });
          }
        });
        const structure = isOrg
          ? [
              ...organizations,
              ...(unassignedApps.length > 0 ? [{ id: 'unassigned', name: 'Unassigned', parentId: null }] : []),
            ]
          : capabilities;
        if (isOrg && unassignedApps.length > 0) appsByCap.set('unassigned', unassignedApps);
        const structureMap = new Map(structure.map(node => [node.id, node]));

        const searchActive = activeQueries.length > 0;
        const { hasStructuralFilter, hasOtherAppFilter, hasAnyAppFilter } = analyzeDiagramFilterFlags(filters);
        // Organization Type and Owning Organization name the boxes. With no other
        // application filter, a matching organization stays visible without apps,
        // and its ancestors stay so the tree still connects.
        const structuralOnly = isOrg && !groupingField && !capFilter && hasStructuralFilter && !hasOtherAppFilter;
        const isAppGroupContainer = Boolean(containerId && !capFilter);

        const memoBaseRelevant = new Map<string, boolean>();
        const isBaseRelevant = (capId: string, seen = new Set<string>()): boolean => {
          if (memoBaseRelevant.has(capId)) return memoBaseRelevant.get(capId)!;
          if (seen.has(capId)) return false;
          const cap = structureMap.get(capId);
          if (!cap) return false;
          const nextSeen = new Set(seen);
          nextSeen.add(capId);
          const hasApps = appsByCap.has(capId) && appsByCap.get(capId)!.length > 0;
          const children = structure.filter(c => c.parentId === capId && c.id !== capId);
          const matchesFilter = !capFilter || (!isOrg && capFilter(cap as Capability));

          let res: boolean;
          if ((mode === 'landscape' || mode === 'org-landscape') && !capFilter && !hasAnyAppFilter && !(searchActive && isAppGroupContainer)) {
            // Show the full hierarchy when nothing is narrowing the inventory.
            res = true;
          } else if (structuralOnly) {
            const direct = capId !== 'unassigned'
              && listSelected(filters.orgType, (cap as Organization).type)
              && listSelected(filters.ownerOrgId, capId);
            res = direct || children.some(c => isBaseRelevant(c.id, nextSeen));
          } else if (capFilter && !hasAnyAppFilter) {
            res = matchesFilter || children.some(c => isBaseRelevant(c.id, nextSeen));
          } else {
            res = (matchesFilter && hasApps) || children.some(c => isBaseRelevant(c.id, nextSeen));
          }

          memoBaseRelevant.set(capId, res);
          return res;
        };

        const hierarchySearchResult =
          searchActive && (mode === 'landscape' || mode === 'org-landscape')
            ? hierarchyForQueries({
                structure,
                appsByNode: appsByCap,
                isBaseRelevant,
                canNodeMatch: (capId) => {
                  const cap = structureMap.get(capId);
                  if (!cap) return false;
                  return !capFilter || (!isOrg && capFilter(cap as Capability));
                },
                showApplications,
                queries: activeQueries,
              })
            : null;

        const appLandscapeSearchResult =
          mode === 'app-landscape'
            ? appLandscapeForQueries({
                candidateApps: targetApps,
                showCapabilities,
                queries: activeQueries,
              })
            : null;
        const effectiveApps = appLandscapeSearchResult ? appLandscapeSearchResult.matchedApps : targetApps;
        const allowedCapsByApp = appLandscapeSearchResult?.allowedCapsByApp ?? null;

        const isRelevant = (capId: string): boolean => {
          if (hierarchySearchResult) return hierarchySearchResult.allowedNodeIds.has(capId);
          return isBaseRelevant(capId);
        };

        const renderCap = (capId: string, parentNodeId: string | undefined, depth = 0, rootX = 0, rootY = 0, targetWidth?: number, fontScale = 1): { width: number; height: number } => {
          const cap = structureMap.get(capId);
          if (!cap || !isRelevant(capId)) return { width: 0, height: 0 };

          const children = structure.filter(c => c.parentId === capId && c.id !== capId && isRelevant(c.id));
          const associatedApps = showApplications
            ? (hierarchySearchResult ? (hierarchySearchResult.allowedAppsByNode.get(capId) || []) : (appsByCap.get(capId) || []))
            : [];

          const tighten = fontScale < 0.99;
          const scale = (n: number, floor = 11) => tighten ? Math.max(floor, Math.round(n * fontScale)) : n;
          const padding = scale(8, 4);
          const hasBody = children.length > 0 || associatedApps.length > 0;
          // One title size whether or not the box holds child capabilities or applications.
          const titleSize = scale(18, 13);
          const titleHeight = scale(48, 34);
          const titleIcon = scale(16, 12);
          const appChipH = scale(34, 24);
          const appGap = scale(6, 4);
          const childGap = scale(8, 4);
          const outerW = targetWidth && targetWidth > 0 ? targetWidth : 280;
          const innerW = Math.max(72, outerW - padding * 2);

          // Children stay inside the column. A wider child used to stretch the whole diagram, and fit-to-width then shrank every box.
          const childLayouts = children.map(child => ({
            id: child.id,
            ...renderCap(child.id, boxId(capId), depth + 1, 0, 0, innerW, fontScale)
          }));

          const chipMin = scale(156, 96);
          const appCols = associatedApps.length > 0
            ? Math.max(1, Math.min(associatedApps.length, Math.floor((innerW + appGap) / (chipMin + appGap))))
            : 1;
          const appChipW = associatedApps.length > 0
            ? Math.floor((innerW - appGap * (appCols - 1)) / appCols)
            : innerW;
          const effectiveInnerW = innerW;

          // Stack children vertically (capCols = 1 — prevents width doubling at each depth)
          let childY = titleHeight;
          childLayouts.forEach((l, i) => {
            const nIdx = groupNodes.findIndex(n => n.id === boxId(children[i].id));
            if (nIdx !== -1) {
              groupNodes[nIdx].position = { x: padding, y: childY };
              // Stretch child to fill the effective inner width; never let it exceed parent bounds
              if (groupNodes[nIdx].style) (groupNodes[nIdx].style as any).width = effectiveInnerW;
            }
            childY += l.height + childGap;
          });

          // Apps rendered as compact chips below children
          const appRows = associatedApps.length > 0 ? Math.ceil(associatedApps.length / appCols) : 0;
          const appsStartY = childY + (children.length > 0 ? childGap : 0);

          associatedApps.forEach((app, i) => {
            const c = i % appCols; const r = Math.floor(i / appCols);
            let colors = { bg: 'var(--card)', text: 'var(--foreground)' };
            if (activeOverlay === 'lifecycle') colors = getLifecycleColor(app.lifecycle, isDark, picklists);
            else if (activeOverlay === 'time') colors = getTimeColor(app, isDark, timeThresholds);
            else if (appOverlayDef) colors = getOverlayColor(getAppScore(app, activeOverlay!, appOverlayDef), appOverlayDef, picklists);

            groupNodes.push({
              id: `app-${containerId || 'main'}-${capId}-${app.id}`, parentNode: boxId(capId),
              data: { label: (
                <div data-box-row="" style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-start', gap: '6px', width: '100%', height: '100%', minWidth: 0, padding: '0 8px', boxSizing: 'border-box' }}>
                  <Database size={scale(14, 12)} style={{ flexShrink: 0 }} />
                  <BoxLabel id={`app-${containerId || 'main'}-${capId}-${app.id}`} name={app.name} style={{ flex: '1 1 auto', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0, fontSize: scale(14, 12), fontWeight: 560, lineHeight: 1.2 }} />
                  {getCustomLabels(app, 'Application').length > 0 && <div style={{ display: 'flex', gap: '1.5px', marginLeft: 'auto', flexShrink: 0 }}>{getCustomLabels(app, 'Application')}</div>}
                </div>
              ), type: 'app', original: app },
              position: { x: padding + c * (appChipW + appGap), y: appsStartY + r * (appChipH + appGap) },
              style: { background: colors.bg, color: colors.text, border: `1px solid ${borderColor}`, borderRadius: '6px', width: appChipW, height: appChipH, display: 'flex', alignItems: 'center', padding: 0, fontWeight: 560, overflow: 'hidden', zIndex: 100, cursor: 'pointer', boxShadow: nodeShadow(isDark) }
            });
          });

          const appsH = appRows > 0 ? appRows * (appChipH + appGap) - appGap : 0;
          const finalHeight = appsStartY + appsH + padding + 1;
          const finalWidth = outerW;

          const capColors = (!isOrg && showCriticality && critDef)
            ? getOverlayColor(getCapScore(capId), critDef, picklists)
            : {
                bg: depth === 0 ? (isDark ? '#2c2e33' : '#ffffff') : (isDark ? '#3b3e45' : '#f1f3f5'),
                text: 'var(--foreground)'
              };
          const NodeIcon = isOrg ? Layers : Boxes;
          const orgType = isOrg ? (cap as Organization).type : undefined;

          groupNodes.unshift({
            id: boxId(capId), parentNode: parentNodeId,
            data: { label: (
              <div data-box-row="" style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-start', gap: '6px', width: '100%', height: hasBody ? titleHeight : '100%', minWidth: 0, padding: '0 10px', boxSizing: 'border-box' }}>
                <NodeIcon size={titleIcon} style={{ flexShrink: 0 }} />
                <BoxLabel id={boxId(capId)} name={cap.name} style={{ flex: hasBody ? '1 1 auto' : '0 1 auto', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0, fontSize: titleSize, fontWeight: 560, lineHeight: 1.25 }} />
                {orgType && <span style={{ flexShrink: 0, fontWeight: 500, fontSize: '12px' }}>{orgType}</span>}
                {getCustomLabels(cap, isOrg ? 'Organization' : 'Capability').length > 0 && <div style={{ display: 'flex', gap: '1.5px', marginLeft: 'auto', flexShrink: 0 }}>{getCustomLabels(cap, isOrg ? 'Organization' : 'Capability')}</div>}
              </div>
            ), type: isOrg ? 'organization' : 'capability', originalId: capId, original: cap },
            position: { x: rootX, y: rootY },
            style: {
              background: capColors.bg,
              border: `${depth === 0 ? 2 : 1.5}px ${depth === 0 ? 'solid' : 'dashed'} ${borderColor}`,
              width: finalWidth, height: finalHeight,
              borderRadius: depth === 0 ? '12px' : '8px',
              color: capColors.text,
              fontWeight: 560,
              display: 'flex',
              alignItems: hasBody ? 'flex-start' : 'center',
              justifyContent: 'stretch',
              padding: 0,
              boxShadow: nodeShadow(isDark),
              cursor: 'pointer',
              zIndex: 10 + depth
            }
          });
          return { width: finalWidth, height: finalHeight };
        };

        const renderAppInGrid = (app: Application, columnWidth: number, fontScale = 1, fixed?: { w: number; h: number }) => {
          const associatedCaps = showCapabilities ? (allowedCapsByApp?.get(app.id) ?? (app.capabilities || [])) : [];
          const showingCaps = associatedCaps.length > 0;
          const paintApp = () => {
            let colors = { bg: 'var(--card)', text: 'var(--foreground)' };
            if (activeOverlay === 'lifecycle') colors = getLifecycleColor(app.lifecycle, isDark, picklists);
            else if (activeOverlay === 'time') colors = getTimeColor(app, isDark, timeThresholds);
            else if (appOverlayDef) colors = getOverlayColor(getAppScore(app, activeOverlay!, appOverlayDef), appOverlayDef, picklists);
            return colors;
          };
          if (fixed) {
            const colors = paintApp();
            const nodeW = fixed.w;
            const nodeH = fixed.h;
            const pad = Math.max(4, Math.min(8, Math.round(Math.min(nodeW, nodeH) * 0.08)));
            let headerBand = nodeH;
            if (showingCaps) {
              headerBand = Math.round(Math.min(44, Math.max(20, nodeH * 0.4)));
              if (nodeH - headerBand < 16) headerBand = Math.max(16, nodeH - 16);
            }
            const chipRoomW = Math.max(4, nodeW - pad * 2);
            // The name uses the card, not the chip band, so a card with capabilities matches its neighbors.
            const nameMax = fittedType(nodeW, nodeH, nodeH >= 76 ? 20 : 16);
            if (showingCaps) headerBand = Math.max(headerBand, Math.min(nodeH - 18, nameMax + 16));
            const chipRoomH = Math.max(4, nodeH - headerBand - pad);
            const chips = showingCaps ? fitChipGrid(associatedCaps.length, chipRoomW, chipRoomH) : null;
            const iconSize = Math.max(12, Math.min(nameMax, 16));
            groupNodes.push({
              id: `app-node-${containerId || 'main'}-${app.id}`, parentNode: containerId,
              data: { label: (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', justifyContent: 'center', gap: '2px', width: '100%', height: showingCaps ? headerBand : '100%', minWidth: 0, padding: showingCaps ? '2px 8px' : '6px 10px', boxSizing: 'border-box' }}>
                  <div data-box-row="" style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', justifyContent: 'flex-start', width: '100%', minWidth: 0 }}>
                    <Database size={iconSize} style={{ flexShrink: 0 }} />
                    <BoxLabel id={`app-node-${containerId || 'main'}-${app.id}`} name={app.name} style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0, fontSize: labelFont(app.name, nameMax), fontWeight: 560, lineHeight: 1.15 }} />
                  </div>
                </div>
              ), type: 'app', original: app },
              position: { x: 0, y: 0 },
              style: { background: colors.bg, color: colors.text, border: `2px solid ${borderColor}`, borderRadius: nodeH >= 80 ? '16px' : nodeH >= 64 ? '12px' : '10px', width: nodeW, height: nodeH, fontWeight: 560, textAlign: 'left', display: 'flex', justifyContent: 'flex-start', alignItems: showingCaps ? 'flex-start' : 'center', padding: 0, boxShadow: nodeShadow(isDark), cursor: 'pointer', overflow: 'hidden' }
            });
            if (chips) {
              associatedCaps.forEach((c, i) => {
                const fullCap = capabilities.find(ac => ac.id === c.id);
                const col = i % chips.cols;
                const row = Math.floor(i / chips.cols);
                let capColors = { bg: 'var(--secondary)', text: 'var(--foreground)' };
                if (critDef && fullCap) capColors = getOverlayColor(getCapScore(fullCap.id), critDef, picklists);
                const chipFont = Math.max(11, Math.min(13, fittedType(chips.chipW, chips.chipH, 13)));
                const chipIcon = Math.max(10, Math.min(13, chipFont));
                const showChipIcon = chips.chipW >= chipIcon + 28;
                groupNodes.push({
                  id: `cap-in-app-${containerId || 'main'}-${app.id}-${c.id}`, parentNode: `app-node-${containerId || 'main'}-${app.id}`,
                  data: { label: (
                    <div data-box-row="" style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-start', gap: '0.25rem', width: '100%', height: '100%', minWidth: 0, padding: '0 3px', boxSizing: 'border-box' }}>
                      {showChipIcon && <Boxes size={chipIcon} style={{ flexShrink: 0 }} />}
                      <BoxLabel id={`cap-in-app-${containerId || 'main'}-${app.id}-${c.id}`} name={c.name} style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0, fontSize: chipFont, fontWeight: 560, lineHeight: 1.1 }} />
                    </div>
                  ), type: 'capability', original: fullCap },
                  position: { x: pad + col * (chips.chipW + chips.gap), y: headerBand + row * (chips.chipH + chips.gap) },
                  style: { background: capColors.bg, color: capColors.text, border: `1px solid ${borderColor}`, borderRadius: '6px', width: chips.chipW, height: chips.chipH, display: 'flex', alignItems: 'center', justifyContent: 'flex-start', padding: 0, fontWeight: 560, zIndex: 100, cursor: 'pointer', boxShadow: nodeShadow(isDark), overflow: 'hidden' }
                });
              });
            }
            return { width: nodeW, height: nodeH };
          }
          const tighten = fontScale < 0.99;
          const scale = (n: number, floor = 11) => tighten ? Math.max(floor, Math.round(n * fontScale)) : n;
          const gap = scale(10, 6); const padding = scale(16, 8); const headerH = scale(56, 36); const childH = scale(52, 32);
          const nodeW = columnWidth;
          const inner = Math.max(72, nodeW - padding * 2);
          const chipMin = scale(200, 100);
          const innerCols = showingCaps
            ? Math.max(1, Math.min(associatedCaps.length, Math.floor((inner + gap) / (chipMin + gap))))
            : 1;
          const childW = showingCaps ? Math.floor((inner - gap * (innerCols - 1)) / innerCols) : inner;
          const innerRows = showingCaps ? Math.ceil(associatedCaps.length / innerCols) : 0;
          const nodeH = showingCaps
            ? headerH + (innerRows * childH) + Math.max(0, innerRows - 1) * gap + padding
            : scale(88, 52);

          let colors = { bg: 'var(--card)', text: 'var(--foreground)' };
          if (activeOverlay === 'lifecycle') colors = getLifecycleColor(app.lifecycle, isDark, picklists);
          else if (activeOverlay === 'time') colors = getTimeColor(app, isDark, timeThresholds);
          else if (appOverlayDef) colors = getOverlayColor(getAppScore(app, activeOverlay!, appOverlayDef), appOverlayDef, picklists);

          groupNodes.push({
            id: `app-node-${containerId || 'main'}-${app.id}`, parentNode: containerId,
            data: { label: (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', justifyContent: 'center', gap: '4px', width: '100%', height: showingCaps ? headerH : '100%', minWidth: 0, padding: '8px 14px', boxSizing: 'border-box' }}>
                <div data-box-row="" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', justifyContent: 'flex-start', width: '100%', minWidth: 0 }}>
                  <Database size={scale(16, 12)} style={{ flexShrink: 0 }} />
                  <BoxLabel id={`app-node-${containerId || 'main'}-${app.id}`} name={app.name} style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0, fontSize: scale(18, 13), fontWeight: 560, lineHeight: 1.2 }} />
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '2px', justifyContent: 'flex-start' }}>{getCustomLabels(app, 'Application')}</div>
              </div>
            ), type: 'app', original: app },
            position: { x: 0, y: 0 }, 
            style: { background: colors.bg, color: colors.text, border: `2px solid ${borderColor}`, borderRadius: '16px', width: nodeW, height: nodeH, fontWeight: 560, textAlign: 'left', display: 'flex', justifyContent: 'flex-start', alignItems: showingCaps ? 'flex-start' : 'center', padding: 0, boxShadow: nodeShadow(isDark), cursor: 'pointer' }
          });

          associatedCaps.forEach((c, i) => {
            if (!showCapabilities) return;
            const fullCap = capabilities.find(ac => ac.id === c.id);
            const col = i % innerCols; const row = Math.floor(i / innerCols);
            let capColors = { bg: 'var(--secondary)', text: 'var(--foreground)' };
            if (critDef && fullCap) capColors = getOverlayColor(getCapScore(fullCap.id), critDef, picklists);
            groupNodes.push({
              id: `cap-in-app-${containerId || 'main'}-${app.id}-${c.id}`, parentNode: `app-node-${containerId || 'main'}-${app.id}`,
              data: { label: (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', justifyContent: 'center', gap: '2px', width: '100%', height: '100%', minWidth: 0, padding: '6px 10px', boxSizing: 'border-box' }}>
                  <div data-box-row="" style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-start', gap: '0.45rem', width: '100%', minWidth: 0 }}>
                    <Boxes size={scale(14, 11)} style={{ flexShrink: 0 }} />
                    <BoxLabel id={`cap-in-app-${containerId || 'main'}-${app.id}-${c.id}`} name={c.name} style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0, fontSize: labelFont(c.name, scale(15, 11)), fontWeight: 560, lineHeight: 1.2 }} />
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '2px', justifyContent: 'flex-start' }}>{getCustomLabels(fullCap, 'Capability')}</div>
                </div>
              ), type: 'capability', original: fullCap },
              position: { x: padding + col * (childW + gap), y: headerH + row * (childH + gap) },
              style: { background: capColors.bg, color: capColors.text, border: `1px solid ${borderColor}`, borderRadius: '8px', width: childW, height: childH, display: 'flex', alignItems: 'center', justifyContent: 'flex-start', padding: 0, fontWeight: 560, zIndex: 100, cursor: 'pointer', boxShadow: nodeShadow(isDark) }
            });
          });
          return { width: nodeW, height: nodeH };
        };

        if (mode === 'landscape' || mode === 'org-landscape') {
          const roots = structure.filter(c => !c.parentId || !structureMap.has(c.parentId));
          const relevantRoots = roots.filter(r => isRelevant(r.id));
          if (cell) {
            const headerH = containerId ? GROUP_HEADER : 0;
            const insetX = 16;
            const insetY = containerId ? headerH + 12 : 12;
            const gap = 10;
            const roomW = Math.max(cell.w, budget - insetX * 2);
            const cols = Math.max(1, Math.min(Math.max(relevantRoots.length, 1), Math.floor((roomW + gap) / (cell.w + gap)) || 1));
            const scaleTree = (rootId: string, s: number) => {
              groupNodes.forEach(node => {
                if (node.parentNode !== rootId) return;
                node.position = { x: node.position.x * s, y: node.position.y * s };
                if (node.style) {
                  if (typeof node.style.width === 'number') node.style.width = Math.max(16, node.style.width * s);
                  if (typeof node.style.height === 'number') node.style.height = Math.max(14, node.style.height * s);
                }
                scaleTree(node.id, s);
              });
            };
            relevantRoots.forEach((root, i) => {
              const c = i % cols;
              const r = Math.floor(i / cols);
              const fontScale = Math.min(1, Math.max(0.5, Math.min(cell.w / 280, cell.h / 160)));
              const layout = renderCap(root.id, containerId, 0, 0, 0, cell.w, fontScale);
              const id = boxId(root.id);
              const node = groupNodes.find(n => n.id === id);
              if (!node) return;
              if (layout.height > cell.h && layout.height > 0) scaleTree(id, cell.h / layout.height);
              node.position = { x: insetX + c * (cell.w + gap), y: insetY + r * (cell.h + gap) };
              if (node.style) {
                node.style.width = cell.w;
                node.style.height = cell.h;
              }
            });
            const rows = Math.max(1, Math.ceil(relevantRoots.length / cols));
            const used = relevantRoots.length > 0 ? rows * cell.h + (rows - 1) * gap : 0;
            return {
              nodes: groupNodes,
              width: budget,
              height: Math.max(insetY + used + 16, containerId ? headerH + 36 : 48),
              headerH
            };
          }
          const gap = containerId && relevantRoots.length > 8 ? 10 : 16;
          const insetX = 16;
          const room = Math.max(240, budget - insetX * 2);
          const packed = containerId
            ? packedColumns(relevantRoots.length, room, 280, gap)
            : { ...flowColumns(relevantRoots.length, room, 280, gap, room), fontScale: 1 };
          const { cols, size: colW, fontScale } = packed;
          const headerH = containerId ? groupHeaderHeight(fontScale) : 0;
          const insetY = containerId ? headerH + 12 : 12;
          const colHeights = new Array(cols).fill(0);

          const nodeAssignments = relevantRoots.map(root => {
            const minH = Math.min(...colHeights);
            const cIdx = colHeights.indexOf(minH);
            const layout = renderCap(root.id, containerId, 0, 0, 0, colW, fontScale);
            const currentY = colHeights[cIdx];
            colHeights[cIdx] += layout.height + gap;
            return { root, cIdx, currentY };
          });

          nodeAssignments.forEach(asgn => {
            const nIdx = groupNodes.findIndex(n => n.id === boxId(asgn.root.id));
            if (nIdx !== -1) {
              groupNodes[nIdx].position = { x: insetX + asgn.cIdx * (colW + gap), y: insetY + asgn.currentY };
              if (groupNodes[nIdx].style) (groupNodes[nIdx].style as any).width = colW;
            }
          });

          const used = relevantRoots.length > 0 ? Math.max(...colHeights) - gap : 0;
          const contentW = insetX + cols * colW + Math.max(0, cols - 1) * gap + insetX;
          return {
            nodes: groupNodes,
            width: containerId ? budget : contentW,
            height: Math.max(insetY + used + 16, containerId ? headerH + 36 : 48),
            headerH
          };
        } else if (cell) {
          const headerH = containerId ? GROUP_HEADER : 0;
          const insetX = 16;
          const insetY = containerId ? headerH + 12 : 12;
          const gap = 10;
          const roomW = Math.max(cell.w, budget - insetX * 2);
          const cols = Math.max(1, Math.min(Math.max(effectiveApps.length, 1), Math.floor((roomW + gap) / (cell.w + gap)) || 1));
          effectiveApps.forEach((app, i) => {
            const c = i % cols;
            const r = Math.floor(i / cols);
            renderAppInGrid(app, cell.w, 1, { w: cell.w, h: cell.h });
            const nIdx = groupNodes.findIndex(n => n.id === `app-node-${containerId || 'main'}-${app.id}`);
            if (nIdx !== -1) {
              groupNodes[nIdx].position = { x: insetX + c * (cell.w + gap), y: insetY + r * (cell.h + gap) };
            }
          });
          const rows = Math.max(1, Math.ceil(effectiveApps.length / cols));
          const used = effectiveApps.length > 0 ? rows * cell.h + (rows - 1) * gap : 0;
          const contentW = insetX + cols * cell.w + Math.max(0, cols - 1) * gap + insetX;
          return {
            nodes: groupNodes,
            width: containerId ? budget : contentW,
            height: Math.max(insetY + used + 16, containerId ? headerH + 40 : 48),
            headerH
          };
        } else {
          const gap = containerId && effectiveApps.length > 8 ? 10 : 18;
          const insetX = 16;
          const room = Math.max(200, budget - insetX * 2);
          const packed = containerId
            ? packedColumns(effectiveApps.length, room, 300, gap)
            : { ...flowColumns(effectiveApps.length, room, 300, gap, room), fontScale: 1 };
          const { cols, size: colW, fontScale } = packed;
          const headerH = containerId ? groupHeaderHeight(fontScale) : 0;
          const insetY = containerId ? headerH + 12 : 12;
          const colHeights = new Array(cols).fill(0);

          const appAssignments = effectiveApps.map(app => {
            const minH = Math.min(...colHeights);
            const cIdx = colHeights.indexOf(minH);
            const layout = renderAppInGrid(app, colW, fontScale);
            const currentY = colHeights[cIdx];
            colHeights[cIdx] += layout.height + gap;
            return { app, cIdx, currentY };
          });

          appAssignments.forEach(asgn => {
            const nIdx = groupNodes.findIndex(n => n.id === `app-node-${containerId || 'main'}-${asgn.app.id}`);
            if (nIdx !== -1) {
              groupNodes[nIdx].position = { x: insetX + asgn.cIdx * (colW + gap), y: insetY + asgn.currentY };
            }
          });

          const used = effectiveApps.length > 0 ? Math.max(...colHeights) - gap : 0;
          const contentW = insetX + cols * colW + Math.max(0, cols - 1) * gap + insetX;
          return {
            nodes: groupNodes,
            width: containerId ? budget : contentW,
            height: Math.max(insetY + used + 16, containerId ? headerH + 40 : 48),
            headerH
          };
        }
      };

      if (primaryGroup) {
        const searchActive = activeQueries.length > 0;
        const candidateGroupValues = primaryGroup.values.filter(val => {
          if (primaryGroup.entityType === 'Capability') {
            return capabilities.some(c => getCapFieldValue(c, primaryGroup.field).toLowerCase() === val.toLowerCase());
          }
          return categoricalFilteredApps.some(app => getFieldValue(app, primaryGroup.field).toLowerCase() === val.toLowerCase());
        });

        const validValues = searchActive
          ? candidateGroupValues.filter(groupVal => {
              let groupApps = categoricalFilteredApps;
              let capFilter: ((c: Capability) => boolean) | undefined = undefined;
              if (primaryGroup.entityType === 'Capability') {
                capFilter = (c: Capability) => getCapFieldValue(c, primaryGroup.field).toLowerCase() === groupVal.toLowerCase();
              } else {
                groupApps = categoricalFilteredApps.filter(app => getFieldValue(app, primaryGroup.field).toLowerCase() === groupVal.toLowerCase());
              }
              const probe = renderGroupContentNodes(groupApps, `group-${primaryGroup.field}-${groupVal}`, capFilter, canvasBudget);
              return probe.nodes.length > 0;
            })
          : candidateGroupValues;

        const groupGap = 20;
        const { cols, size: groupW } = masonryFrameColumns(Math.max(validValues.length, 1), canvasBudget, groupGap);
        const measuredGroups = validValues.map(groupVal => {
          let groupApps = categoricalFilteredApps;
          let capFilter: ((c: Capability) => boolean) | undefined = undefined;
          if (primaryGroup.entityType === 'Capability') {
            capFilter = (c: Capability) => getCapFieldValue(c, primaryGroup.field).toLowerCase() === groupVal.toLowerCase();
          } else {
            groupApps = categoricalFilteredApps.filter(app => getFieldValue(app, primaryGroup.field).toLowerCase() === groupVal.toLowerCase());
          }
          const containerId = `group-${primaryGroup.field}-${groupVal}`;
          const natural = renderGroupContentNodes(groupApps, containerId, capFilter, groupW);
          return { groupVal, groupApps, capFilter, containerId, natural };
        });
        // Application cards share one size: the narrowest and shortest natural card.
        // Capability and organization trees stay content-sized so a deep branch is not scaled into a leaf box.
        let sharedCell: { w: number; h: number } | undefined;
        if (mode === 'app-landscape') {
          measuredGroups.forEach(group => {
            group.natural.nodes.forEach(node => {
              if (node.parentNode !== group.containerId) return;
              const w = typeof node.style?.width === 'number' ? node.style.width : 0;
              const h = typeof node.style?.height === 'number' ? node.style.height : 0;
              if (w <= 0 || h <= 0) return;
              sharedCell = sharedCell
                ? { w: Math.min(sharedCell.w, w), h: Math.min(sharedCell.h, h) }
                : { w, h };
            });
          });
        }
        const columnHeights = new Array(cols).fill(0);

        measuredGroups.forEach(group => {
          const { groupVal, groupApps, capFilter, containerId } = group;
          const content = sharedCell
            ? renderGroupContentNodes(groupApps, containerId, capFilter, groupW, sharedCell)
            : group.natural;
          const col = columnHeights.indexOf(Math.min(...columnHeights));
          const y = columnHeights[col];
          columnHeights[col] += content.height + groupGap;
          const { color, label: valLabel } = getGroupInfo(primaryGroup.field, groupVal, primaryGroup.entityType);
          const groupTitle = `${getFieldLabel(primaryGroup.field)}: ${valLabel}`;
          const headerH = content.headerH || GROUP_HEADER;
          const titleColor = getContrastColor(color);
          allFinalNodes.push({
            id: containerId,
            data: { label: (
              <div data-box-row="" style={{ position: 'absolute', top: 0, left: 0, right: 0, height: headerH, display: 'flex', alignItems: 'center', justifyContent: 'flex-start', padding: '0 28px', boxSizing: 'border-box', background: color, color: titleColor, borderRadius: '16px 16px 0 0', pointerEvents: 'auto' }}>
                <BoxLabel id={containerId} name={groupTitle} style={{ flex: '1 1 auto', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0, fontSize: headerH >= 40 ? 16 : 14, fontWeight: 600, lineHeight: 1.2, textAlign: 'left' }} />
              </div>
            ) },
            position: { x: col * (groupW + groupGap), y },
            style: {
              background: groupTint(color, isDark),
              border: `4px solid ${color}`,
              boxShadow: groupShadow(isDark),
              borderRadius: '20px',
              width: groupW,
              height: content.height,
              pointerEvents: 'none',
              zIndex: -100,
              padding: 0,
              boxSizing: 'border-box',
            }
          });
          allFinalNodes.push(...content.nodes);
        });

      } else {
        const natural = renderGroupContentNodes(categoricalFilteredApps, undefined, undefined, canvasBudget);
        let sharedCell: { w: number; h: number } | undefined;
        if (mode === 'app-landscape') {
          natural.nodes.forEach(node => {
            if (node.parentNode) return;
            const w = typeof node.style?.width === 'number' ? node.style.width : 0;
            const h = typeof node.style?.height === 'number' ? node.style.height : 0;
            if (w <= 0 || h <= 0) return;
            sharedCell = sharedCell
              ? { w: Math.min(sharedCell.w, w), h: Math.min(sharedCell.h, h) }
              : { w, h };
          });
        }
        const varied = !!sharedCell && natural.nodes.some(node => !node.parentNode && (node.style?.width !== sharedCell!.w || node.style?.height !== sharedCell!.h));
        const content = varied && sharedCell
          ? renderGroupContentNodes(categoricalFilteredApps, undefined, undefined, canvasBudget, sharedCell)
          : natural;
        allFinalNodes.push(...content.nodes);
      }

      if (showFilterFrame && allFinalNodes.length > 0) {
        const frame = filterFrameNode(allFinalNodes);
        if (frame) allFinalNodes.unshift(frame);
      }

      publishDiagram(allFinalNodes, []);
    }
  }, [apps, filteredApps, categoricalFilteredApps, integrations, capabilities, organizationKey, metaDefs, picklists, mode, activeOverlay, activeCustomOverlays, showApplications, showCapabilities, hideOrphanApps, showCriticality, searchTermKey, setNodes, setEdges, appOverlayDef, critDef, appCritDef, filters, groupingField, isDark, getCustomLabels, viewportWidth, timeThresholds, reflowZoom, filterFrame]);
  const currentFitKey = `${layoutMetrics.count}-${layoutMetrics.span}-${viewportWidth}-${viewportHeight}-${mode}-${searchTermKey}-${groupingField || ''}-${reflowZoom}`;

  useEffect(() => {
    if (layoutMetrics.count > 0 && visible && viewportWidth > 0 && nodesInitialized && lastFitKey.current !== currentFitKey) {
      window.clearTimeout(fitTimerRef.current);
      fitTimerRef.current = window.setTimeout(() => {
        const currentNodes = getNodes(); if (currentNodes.length === 0) return;
        const bounds = getNodesBounds(currentNodes);
        if (!bounds.width || !Number.isFinite(bounds.width)) return;
        const marginX = 16;
        const marginY = 20;
        if (reflowRef.current) {
          const zoom = Math.max(reflowZoom, 0.05);
          const x = (viewportWidth - bounds.width * zoom) / 2 - bounds.x * zoom;
          const contentH = bounds.height * zoom;
          let y: number;
          if (viewportHeight > 0 && contentH + marginY * 2 < viewportHeight) {
            y = (viewportHeight - contentH) / 2 - bounds.y * zoom;
          } else {
            const relY = Math.min(1, Math.max(0, reflowFocus.current));
            y = viewportHeight / 2 - (bounds.y + relY * bounds.height) * zoom;
            const maxY = marginY - bounds.y * zoom;
            const minY = viewportHeight - marginY - (bounds.y + bounds.height) * zoom;
            y = minY < maxY ? Math.min(maxY, Math.max(minY, y)) : maxY;
          }
          setViewport({ x, y, zoom }, { duration: 0 });
        } else {
          const zoom = Math.min(1, (viewportWidth - marginX * 2) / bounds.width);
          const contentH = bounds.height * zoom;
          const y = viewportHeight > 0 && contentH + marginY * 2 < viewportHeight
            ? (viewportHeight - contentH) / 2 - bounds.y * zoom
            : marginY - bounds.y * zoom;
          const x = (viewportWidth - bounds.width * zoom) / 2 - bounds.x * zoom;
          setViewport({ x, y, zoom }, { duration: 450 });
        }
        lastFitKey.current = currentFitKey;
      }, 150);
      return () => window.clearTimeout(fitTimerRef.current);
    }
  }, [currentFitKey, layoutMetrics.count, visible, viewportWidth, viewportHeight, nodesInitialized, setViewport, getNodes, reflowZoom]);

  const onNodeInternalClick = (_: any, node: Node) => {
    if (node.data.type === 'app' && node.data.original) {
      setInspectedConcept({ kind: 'app', app: node.data.original });
    } else if (node.data.type === 'capability' && node.data.originalId !== 'unassigned' && node.data.original) {
      setInspectedConcept({ kind: 'capability', capability: node.data.original });
    } else if (node.data.type === 'organization' && node.data.originalId !== 'unassigned' && node.data.original) {
      setInspectedConcept({ kind: 'organization', organization: node.data.original });
    }
  };

  const onEdgeInternalClick = (_: any, edge: Edge) => {
    const integration = edge.data?.original as Integration | undefined;
    if (integration) setInspectedConcept({ kind: 'integration', integration });
  };

  const landscapeTitle = mode === 'network' ? 'Landscape: Integrations' : mode === 'app-landscape' ? 'Landscape: Application' : mode === 'org-landscape' ? 'Landscape: Organization' : 'Landscape: Capability';

  return (
    <div className="diagram-surface" style={{ width: '100%', height: '100%', position: 'relative' }}>
    <ReactFlow
      nodes={nodes} edges={edges} onNodesChange={onNodesChange} onEdgesChange={onEdgesChange} onNodeClick={onNodeInternalClick} onEdgeClick={onEdgeInternalClick} onPaneClick={() => setInspectedConcept(null)}
      nodesDraggable={!lockNodes} nodesConnectable={false} elementsSelectable={!lockNodes} panOnDrag={true} zoomOnScroll={true} minZoom={0.01} maxZoom={4}
      nodeTypes={nodeTypes} edgeTypes={edgeTypes}
      style={{ width: '100%', height: '100%' }}
    >
      {(mode === 'landscape' || mode === 'app-landscape' || mode === 'org-landscape') && <LandscapeArt isDark={isDark} />}
      {mode === 'network' && <NetworkArt isDark={isDark} />}
      <Background color="transparent" />
      <Controls showInteractive={false} />
      <Panel position="top-right" style={{ 
        background: 'var(--card)', 
        padding: toolsOpen ? '10px 14px' : '6px', 
        borderRadius: '10px', 
        border: '1px solid var(--border)', 
        fontSize: '12px', 
        color: 'var(--foreground)', 
        boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
        display: 'flex',
        flexDirection: 'column',
        gap: '8px',
        minWidth: toolsOpen ? '220px' : undefined
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px', borderBottom: toolsOpen ? '1px solid var(--border)' : 'none', paddingBottom: toolsOpen ? '6px' : 0, marginBottom: toolsOpen ? '2px' : 0 }}>
          {toolsOpen && (
            <div style={{ fontSize: '10px', fontWeight: 600, letterSpacing: '0.04em', textTransform: 'uppercase', minWidth: 0 }}>
              Tools
            </div>
          )}
          <button
            type="button"
            aria-expanded={toolsOpen}
            aria-label={toolsOpen ? 'Hide diagram tools' : 'Show diagram tools'}
            title={toolsOpen ? 'Hide diagram tools' : 'Show diagram tools'}
            onClick={() => setToolsOpen((open) => !open)}
            style={{ border: 'none', background: 'var(--secondary)', color: 'var(--secondary-foreground)', height: '22px', width: toolsOpen ? '22px' : 'auto', borderRadius: '4px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px', cursor: 'pointer', padding: toolsOpen ? 0 : '0 8px', flexShrink: 0, marginLeft: toolsOpen ? 'auto' : 0, fontSize: '10px', fontWeight: 600, letterSpacing: '0.04em', textTransform: 'uppercase' }}
          >
            {toolsOpen ? <ChevronRight size={14} /> : <><ChevronLeft size={14} /> Tools</>}
          </button>
        </div>
        {toolsOpen && <>
        <div style={{ display: 'flex', gap: '6px' }}>
          <button 
            onClick={toggleFullscreen}
            title={isFullscreen ? "Exit Presentation Mode" : "Presentation Mode (Fullscreen)"}
            style={{
              background: isFullscreen ? 'var(--primary)' : 'transparent',
              color: isFullscreen ? 'var(--primary-foreground)' : 'var(--muted-foreground)',
              border: `1px solid ${isFullscreen ? 'var(--primary)' : 'var(--border)'}`,
              borderRadius: '6px',
              padding: '0 8px',
              height: '28px',
              flex: 1,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '6px',
              cursor: 'pointer',
              transition: 'all 0.2s',
              fontSize: '10px',
              fontWeight: 560,
              textTransform: 'uppercase'
            }}
          >
            {isFullscreen ? <Minimize size={12} /> : <Maximize size={12} />}
            {isFullscreen ? 'Exit' : 'Present'}
          </button>
          <button 
            onClick={onExport}
            disabled={isExporting}
            title="Export diagram as PNG"
            style={{
              background: 'transparent',
              color: 'var(--muted-foreground)',
              border: '1px solid var(--border)',
              borderRadius: '6px',
              padding: '0 8px',
              height: '28px',
              flex: 1,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '6px',
              cursor: isExporting ? 'wait' : 'pointer',
              transition: 'all 0.2s',
              fontSize: '10px',
              fontWeight: 560,
              textTransform: 'uppercase',
              opacity: isExporting ? 0.6 : 1
            }}
          >
            {isExporting ? <Loader2 size={12} className="spin" /> : <Download size={12} />}
            {isExporting ? '...' : 'Export'}
          </button>
          <button 
            onClick={() => setLockNodes(!lockNodes)}
            title={lockNodes ? "Unlock nodes to move them" : "Lock nodes in place"}
            style={{
              background: lockNodes ? 'transparent' : 'var(--primary)',
              color: lockNodes ? 'var(--muted-foreground)' : 'var(--primary-foreground)',
              border: `1px solid ${lockNodes ? 'var(--border)' : 'var(--primary)'}`,
              borderRadius: '6px',
              padding: '0 8px',
              height: '28px',
              flex: 1,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '6px',
              cursor: 'pointer',
              transition: 'all 0.2s',
              fontSize: '10px',
              fontWeight: 560,
              textTransform: 'uppercase'
            }}
          >
            {lockNodes ? <Lock size={12} /> : <Unlock size={12} />}
            {lockNodes ? 'Locked' : 'Unlocked'}
          </button>
        </div>
        <button
          type="button"
          aria-pressed={reflow}
          onClick={() => {
            if (reflow) {
              window.clearTimeout(fitTimerRef.current);
              lastFitKey.current = currentFitKey;
              setReflow(false);
            } else {
              setReflowZoom(quantizeZoom(store.getState().transform[2]));
              setReflow(true);
            }
          }}
          title={reflow ? 'Stop reflowing the layout when you zoom' : 'Reflow the layout to the width visible at this zoom'}
          style={{
            background: reflow ? 'var(--primary)' : 'transparent',
            color: reflow ? 'var(--primary-foreground)' : 'var(--muted-foreground)',
            border: `1px solid ${reflow ? 'var(--primary)' : 'var(--border)'}`,
            borderRadius: '6px',
            padding: '0 8px',
            height: '28px',
            width: '100%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '6px',
            cursor: 'pointer',
            transition: 'all 0.2s',
            fontSize: '10px',
            fontWeight: 560,
            textTransform: 'uppercase'
          }}
        >
          <WrapText size={12} />
          Reflow
        </button>
        <button
          type="button"
          aria-pressed={filterFrame}
          onClick={() => setFilterFrame(on => !on)}
          title={filterFrame ? 'Hide the frame around the filtered nodes' : 'Show a frame naming the active filters'}
          style={{
            background: filterFrame ? 'var(--primary)' : 'transparent',
            color: filterFrame ? 'var(--primary-foreground)' : 'var(--muted-foreground)',
            border: `1px solid ${filterFrame ? 'var(--primary)' : 'var(--border)'}`,
            borderRadius: '6px',
            padding: '0 8px',
            height: '28px',
            width: '100%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '6px',
            cursor: 'pointer',
            transition: 'all 0.2s',
            fontSize: '10px',
            fontWeight: 560,
            textTransform: 'uppercase'
          }}
        >
          <Frame size={12} />
          Frame
        </button>
        <div style={{ fontSize: '10px', opacity: 0.7, borderTop: '1px solid var(--border)', paddingTop: '6px' }}>
          {reflow ? 'Zoom reflows the columns to this view' : lockNodes ? 'Click objects to inspect • Drag to pan' : 'Drag nodes to reposition • Selection enabled'}
        </div>
        </>}
      </Panel>
      <Panel position="top-left" style={{ 
        margin: 0,
        padding: 0,
        background: 'transparent',
        border: 'none',
        boxShadow: 'none',
        transform: `translate(${legendPos.x}px, ${legendPos.y}px)`,
        cursor: 'grab',
        userSelect: 'none',
        zIndex: 1000,
      }} onMouseDown={onLegendMouseDown}>
        <div
          ref={legendRef}
          style={{
            background: 'var(--card)',
            padding: (isLegendExpanded || isExporting) ? '16px' : '8px 12px',
            borderRadius: '12px',
            border: '1px solid var(--border)',
            fontSize: '11px',
            fontFamily: 'var(--font-diagram)',
            color: 'var(--foreground)',
            boxShadow: isExporting ? 'none' : '0 4px 12px rgba(0,0,0,0.15)',
            width: (isLegendExpanded || isExporting) ? '220px' : 'auto',
            display: 'flex',
            flexDirection: 'column',
            gap: '16px',
            boxSizing: 'border-box',
            transition: isExporting ? 'none' : 'width 0.2s ease, padding 0.2s ease',
          }}
        >
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', minWidth: 0 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--muted-foreground)' }}>
              <MapIcon size={14} />
              <span style={{ fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em', fontSize: '10px' }}>Legend</span>
            </div>
            <button
              type="button"
              data-export-hide="true"
              aria-expanded={isLegendExpanded}
              aria-label={isLegendExpanded ? 'Collapse legend' : 'Expand legend'}
              onClick={(e) => { e.stopPropagation(); setIsLegendExpanded(!isLegendExpanded); }}
              style={{ border: 'none', background: 'var(--secondary)', color: 'var(--secondary-foreground)', width: '20px', height: '20px', borderRadius: '4px', display: isExporting ? 'none' : 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', padding: 0 }}
            >
              {isLegendExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
            </button>
          </div>
          <div style={{ fontSize: '12px', fontWeight: 600, lineHeight: 1.3, color: 'var(--foreground)' }}>{landscapeTitle}</div>
        </div>

        {(isLegendExpanded || isExporting) && (
          <>
          {(mode === 'landscape' || mode === 'app-landscape') && <div>
            <div style={{ fontWeight: 600, marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.025em', fontSize: '10px', color: 'var(--muted-foreground)' }}>Business Criticality</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              {mode === 'landscape' && !showCriticality ? ( 
                <div style={{ fontStyle: 'italic', color: 'var(--muted-foreground)', fontSize: '10px' }}>Toggled Off</div> 
              ) : ( 
                (picklists?.find(p => p.name === 'criticality')?.options || []).map(opt => ( 
                  <div key={opt.value} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <div style={{ width: '12px', height: '12px', borderRadius: '3px', background: opt.color, border: `1px solid ${isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.05)'}` }} />
                    <span>{opt.label}</span>
                  </div> 
                )) 
              )}
            </div>
          </div>}

          {groupingField && (
            <div>
              <div style={{ fontWeight: 600, marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.025em', fontSize: '10px', color: 'var(--primary)' }}>
                Grouped By: {getFieldLabel(groupingField)}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                {groupingField === 'lifecycle' ? (
                  (getFieldPicklist('lifecycle', picklists)?.options?.length 
                    ? getFieldPicklist('lifecycle', picklists)!.options 
                    : LIFECYCLE_STAGES
                  ).map(opt => {
                    const color = opt.color || ('color' in opt ? (opt as any).color : undefined) || LIFECYCLE_STAGES.find(s => s.label.toLowerCase() === opt.label.toLowerCase())?.color || '#adb5bd';
                    return (
                      <div key={opt.label} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <div style={{ width: '12px', height: '12px', borderRadius: '3px', background: color, border: `1px solid ${color}` }} />
                        <span style={{ fontWeight: 500 }}>{opt.label}</span>
                      </div>
                    );
                  })
                ) : groupingField === 'time' ? (
                  TIME_STAGES.map(opt => (
                    <div key={opt.value} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <div style={{ width: '12px', height: '12px', borderRadius: '3px', background: opt.color, border: `1px solid ${opt.color}` }} />
                      <span style={{ fontWeight: 500 }}>{opt.label}</span>
                    </div>
                  ))
                ) : (
                  (getFieldPicklist(groupingField, picklists)?.options || []).map(opt => {
                    let color = opt.color;
                    if (!color) {
                      const def = metaDefs.find(d => d.fieldName === groupingField);
                      if (def) color = getOverlayColor(opt.value, def, picklists || []).bg;
                    }
                    return (
                      <div key={opt.value} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <div style={{ width: '12px', height: '12px', borderRadius: '3px', background: color || 'var(--primary)', border: `1px solid ${color || 'var(--primary)'}` }} />
                        <span style={{ fontWeight: 500 }}>{opt.label}</span>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          )}

          {activeOverlay && (
            <div>
              <div style={{ fontWeight: 600, marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.025em', fontSize: '10px', color: 'var(--muted-foreground)' }}>
                Aspect: {getFieldLabel(activeOverlay)}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                {activeOverlay === 'lifecycle' ? ( 
                  (picklists?.find(p => p.name === 'lifecycle')?.options || LIFECYCLE_STAGES).map(opt => {
                    const lightColor = 'lightColor' in opt ? (opt as { lightColor?: string }).lightColor : undefined;
                    const bg = opt.color && opt.color.startsWith('#') ? (isDark ? opt.color : (lightColor || opt.color)) : (isDark ? (opt.color || '#adb5bd') : (lightColor || opt.color || '#e9ecef'));
                    return (
                      <div key={opt.label} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <div style={{ width: '12px', height: '12px', borderRadius: '3px', background: bg, border: `1px solid ${isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.05)'}` }} />
                        <span>{opt.label}</span>
                      </div>
                    );
                  })
                ) : activeOverlay === 'time' ? (
                  TIME_STAGES.map(opt => (
                    <div key={opt.value} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <div style={{ width: '12px', height: '12px', borderRadius: '3px', background: opt.color, border: `1px solid ${opt.color}` }} />
                      <span style={{ fontWeight: 500 }}>{opt.label}</span>
                    </div>
                  ))
                ) : ( 
                  picklists?.find(p => {
                    const pNorm = p.name.toLowerCase().replace(/_/g, '');
                    const oNorm = activeOverlay.toLowerCase().replace(/_/g, '');
                    return pNorm === oNorm || (oNorm === 'cost' && (p.name === 'application_cost' || pNorm === 'applicationcost'));
                  })?.options.map(opt => ( 
                    <div key={opt.value} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <div style={{ width: '12px', height: '12px', borderRadius: '3px', background: opt.color, border: `1px solid ${isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.05)'}` }} />
                      <span>{opt.label}</span>
                    </div> 
                  )) 
                )}
              </div>
            </div>
          )}
          </>
        )}
        </div>
      </Panel>
      </ReactFlow>
      {filterMiss && (
        <div className="diagram-filter-empty" role="status">
          <FilterX size={28} aria-hidden="true" />
          <p>Nothing matches this filter.</p>
        </div>
      )}
      {inspectedConcept && (() => {
        const getEffectiveCapCrit = (capId: string): number => {
          const cap = capabilities.find(c => c.id === capId);
          if (!cap) return 1;
          const localVal = Number(cap.criticality || safeJsonParse(cap.metadata).criticality || 1);
          const childMax = capabilities.filter(c => c.parentId === capId).map(c => getEffectiveCapCrit(c.id));
          return childMax.length > 0 ? Math.max(localVal, ...childMax) : localVal;
        };

        const getEffectiveAppCrit = (app: Application): number => {
          const localVal = Number(app.criticality || safeJsonParse(app.metadata).criticality || 1);
          if (app.capabilities && app.capabilities.length > 0) {
            const capScores = app.capabilities.map(c => getEffectiveCapCrit(c.id)).filter(n => !isNaN(n) && n > 0);
            if (capScores.length > 0) return Math.max(localVal, ...capScores);
          }
          return localVal;
        };

        const costOptions = picklists?.find(p => p.name === 'application_cost')?.options || [];
        const critOptions = picklists?.find(p => p.name === 'criticality')?.options || [];
        const orgTypeOptions = picklists?.find(p => p.name === 'organization_type')?.options || [];

        if (inspectedConcept.kind === 'app') {
          const app = apps.find(a => a.id === inspectedConcept.app.id) || inspectedConcept.app;
          const assessment = getAppTimeAssessment(app, timeThresholds);
          const accentColor = assessment?.color || 'var(--primary)';
          const ownerOrg = organizations.find(o => o.id === app.ownerOrgId);
          const techScore = assessment?.techScore ?? (Number(app.technicalFit) || 0);
          const funcScore = assessment?.funcScore ?? (Number(app.functionalFit) || 0);
          const crit = getEffectiveAppCrit(app);
          const costNum = Number(app.cost);
          const costVal = !isNaN(costNum) && costNum > 0 ? Math.max(1, Math.min(5, costNum)) : 1;
          const costCutoff = timeThresholds?.cost ?? 4;
          const isHighCost = costVal >= costCutoff;
          const costOpt = costOptions.find(o => String(o.value) === String(costVal));
          const appIntegrations = integrations.filter(i => i.sourceAppId === app.id || i.targetAppId === app.id);

          return (
            <div
              className="state-dialog-backdrop"
              style={{ zIndex: 1100 }}
              onMouseDown={() => setInspectedConcept(null)}
            >
              <div
                role="dialog"
                aria-modal="true"
                aria-label={`Application inspector: ${app.name}`}
                onMouseDown={(e) => e.stopPropagation()}
                style={{
                  width: 'min(52rem, 96vw)',
                  maxHeight: '90vh',
                  overflowY: 'auto',
                  borderRadius: '16px',
                  border: `1.5px solid ${accentColor}`,
                  background: 'var(--card)',
                  color: 'var(--foreground)',
                  boxShadow: `0 12px 32px rgba(0,0,0,0.28), 0 4px 16px ${accentColor}22`,
                  padding: '1.35rem 1.5rem',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '1.1rem',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '0.75rem' }}>
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', flexWrap: 'wrap', marginBottom: '0.25rem' }}>
                      {app.lifecycle && (
                        <span style={{
                          fontSize: '0.65rem',
                          padding: '0.1rem 0.45rem',
                          borderRadius: '4px',
                          background: 'var(--accent)',
                          color: 'var(--foreground)',
                          fontWeight: 600,
                        }}>
                          {app.lifecycle}
                        </span>
                      )}
                      {app.type && (
                        <span style={{
                          fontSize: '0.65rem',
                          padding: '0.1rem 0.45rem',
                          borderRadius: '4px',
                          background: 'var(--accent)',
                          color: 'var(--muted-foreground)',
                        }}>
                          {app.type}
                        </span>
                      )}
                      <span style={{ fontSize: '0.75rem', color: 'var(--muted-foreground)' }}>
                        {app.owner || 'Unassigned owner'}
                        {ownerOrg && (
                          <>
                            {' • '}
                            <button
                              type="button"
                              onClick={() => setInspectedConcept({ kind: 'organization', organization: ownerOrg })}
                              style={{ background: 'none', border: 'none', padding: 0, color: 'var(--primary)', fontWeight: 600, fontSize: '0.75rem', cursor: 'pointer' }}
                            >
                              {ownerOrg.name}
                            </button>
                          </>
                        )}
                      </span>
                    </div>
                    <h3 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 800, lineHeight: 1.25 }}>
                      {app.name}
                    </h3>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', flexShrink: 0 }}>
                    <button
                      type="button"
                      onClick={() => {
                        setInspectedConcept(null);
                        onNodeClick?.(app);
                      }}
                      className="primary"
                      style={{ height: '2rem', padding: '0 0.85rem', fontSize: '0.78rem', gap: '0.35rem', display: 'inline-flex', alignItems: 'center' }}
                      title="Open full application details page"
                    >
                      Details <ExternalLink size={13} />
                    </button>
                    <button
                      type="button"
                      aria-label="Close inspector"
                      onClick={() => setInspectedConcept(null)}
                      style={{ height: '2rem', width: '2rem', padding: 0, borderRadius: '8px', border: '1px solid var(--border)', background: 'var(--secondary)', color: 'var(--muted-foreground)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}
                    >
                      <X size={15} />
                    </button>
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '1.5rem', alignItems: 'start' }}>
                  <div style={{ width: '100%', minWidth: 0 }}>
                    <TimeMatrix
                      singleApp={{
                        id: app.id,
                        name: app.name,
                        technicalFit: app.technicalFit,
                        functionalFit: app.functionalFit,
                        criticality: crit,
                        cost: app.cost,
                      }}
                      thresholds={timeThresholds}
                      aspectRatio="1 / 1"
                      showLegend={true}
                    />
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.9rem', minWidth: 0 }}>
                    <p style={{
                      margin: 0,
                      fontSize: '0.84rem',
                      color: 'var(--foreground)',
                      opacity: 0.9,
                      lineHeight: 1.5,
                    }}>
                      {app.description || 'No description provided.'}
                    </p>

                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '0.65rem', background: 'var(--secondary)', padding: '0.75rem 0.9rem', borderRadius: '10px' }}>
                      <div>
                        <div style={{ fontSize: '0.62rem', color: 'var(--muted-foreground)', fontWeight: 700, textTransform: 'uppercase' }}>Technical Fit</div>
                        <div style={{ fontSize: '0.95rem', fontWeight: 800, color: techScore ? (techScore >= (timeThresholds?.technicalFit ?? 3) ? '#2b8a3e' : '#c92a2a') : 'var(--muted-foreground)' }}>
                          {techScore ? `${techScore}/5` : '—'}
                        </div>
                      </div>
                      <div>
                        <div style={{ fontSize: '0.62rem', color: 'var(--muted-foreground)', fontWeight: 700, textTransform: 'uppercase' }}>Functional Fit</div>
                        <div style={{ fontSize: '0.95rem', fontWeight: 800, color: funcScore ? (funcScore >= (timeThresholds?.functionalFit ?? 3) ? '#2b8a3e' : '#c92a2a') : 'var(--muted-foreground)' }}>
                          {funcScore ? `${funcScore}/5` : '—'}
                        </div>
                      </div>
                      <div>
                        <div style={{ fontSize: '0.62rem', color: 'var(--muted-foreground)', fontWeight: 700, textTransform: 'uppercase' }}>Criticality</div>
                        <div style={{ fontSize: '0.95rem', fontWeight: 800, color: crit >= (timeThresholds?.businessCriticality ?? 4) ? '#c92a2a' : 'var(--foreground)' }}>
                          {crit}/5
                        </div>
                      </div>
                      <div>
                        <div style={{ fontSize: '0.62rem', color: 'var(--muted-foreground)', fontWeight: 700, textTransform: 'uppercase' }}>Cost</div>
                        <div
                          style={{
                            fontSize: '0.95rem',
                            fontWeight: 800,
                            color: isHighCost ? '#fd7e14' : (costOpt?.color || 'var(--foreground)'),
                            display: 'flex',
                            alignItems: 'center',
                            gap: '0.3rem',
                          }}
                        >
                          {costOpt?.color && <span style={{ width: '7px', height: '7px', borderRadius: '50%', background: costOpt.color, flexShrink: 0 }} />}
                          <span>{costVal}/5</span>
                          {costOpt?.label && (
                            <span style={{ fontSize: '0.7rem', fontWeight: 600, color: 'var(--muted-foreground)' }}>
                              ({costOpt.label})
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    {((app.capabilities && app.capabilities.length > 0) || appIntegrations.length > 0) && (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.55rem', borderTop: '1px solid var(--border)', paddingTop: '0.75rem' }}>
                        {app.capabilities && app.capabilities.length > 0 && (
                          <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '0.35rem' }}>
                            <span style={{ fontSize: '0.68rem', fontWeight: 700, textTransform: 'uppercase', color: 'var(--muted-foreground)', marginRight: '0.2rem' }}>
                              Capabilities:
                            </span>
                            {app.capabilities.map(c => {
                              const fullCap = capabilities.find(item => item.id === c.id);
                              return (
                                <button
                                  key={c.id}
                                  type="button"
                                  onClick={() => fullCap && setInspectedConcept({ kind: 'capability', capability: fullCap })}
                                  style={{
                                    fontSize: '0.72rem',
                                    fontWeight: 600,
                                    padding: '0.18rem 0.5rem',
                                    borderRadius: '999px',
                                    border: '1px solid var(--border)',
                                    background: 'var(--secondary)',
                                    color: 'var(--foreground)',
                                    cursor: fullCap ? 'pointer' : 'default',
                                  }}
                                >
                                  {c.name}
                                </button>
                              );
                            })}
                          </div>
                        )}
                        {appIntegrations.length > 0 && (
                          <div style={{ fontSize: '0.76rem', color: 'var(--muted-foreground)' }}>
                            Integrations: <strong>{appIntegrations.length}</strong> ({appIntegrations.filter(i => i.sourceAppId === app.id).length} outbound, {appIntegrations.filter(i => i.targetAppId === app.id).length} inbound)
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          );
        }

        if (inspectedConcept.kind === 'capability') {
          const cap = capabilities.find(c => c.id === inspectedConcept.capability.id) || inspectedConcept.capability;
          const parentCap = capabilities.find(c => c.id === cap.parentId);
          const subCaps = capabilities.filter(c => c.parentId === cap.id);
          const effectiveCrit = getEffectiveCapCrit(cap.id);
          const critOpt = critOptions.find(o => String(o.value) === String(effectiveCrit));
          const accentColor = critOpt?.color || 'var(--primary)';

          const descendantCapIds = new Set<string>([cap.id]);
          const collectDescendants = (pid: string) => {
            for (const child of capabilities.filter(c => c.parentId === pid)) {
              if (!descendantCapIds.has(child.id)) {
                descendantCapIds.add(child.id);
                collectDescendants(child.id);
              }
            }
          };
          collectDescendants(cap.id);

          const rolledUpApps = apps.filter(a => a.capabilities?.some(c => descendantCapIds.has(c.id)));

          return (
            <div
              className="state-dialog-backdrop"
              style={{ zIndex: 1100 }}
              onMouseDown={() => setInspectedConcept(null)}
            >
              <div
                role="dialog"
                aria-modal="true"
                aria-label={`Capability inspector: ${cap.name}`}
                onMouseDown={(e) => e.stopPropagation()}
                style={{
                  width: rolledUpApps.length > 0 ? 'min(52rem, 96vw)' : 'min(34rem, 96vw)',
                  maxHeight: '90vh',
                  overflowY: 'auto',
                  borderRadius: '16px',
                  border: `1.5px solid ${accentColor}`,
                  background: 'var(--card)',
                  color: 'var(--foreground)',
                  boxShadow: `0 12px 32px rgba(0,0,0,0.28), 0 4px 16px ${accentColor}22`,
                  padding: '1.35rem 1.5rem',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '1.1rem',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '0.75rem' }}>
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', flexWrap: 'wrap', marginBottom: '0.25rem' }}>
                      {critOpt && (
                        <span style={{
                          fontSize: '0.62rem',
                          fontWeight: 900,
                          letterSpacing: '0.06em',
                          textTransform: 'uppercase',
                          padding: '0.12rem 0.45rem',
                          borderRadius: '4px',
                          background: `${critOpt.color}22`,
                          color: critOpt.color,
                          border: `1px solid ${critOpt.color}55`,
                        }}>
                          {critOpt.label}
                        </span>
                      )}
                      <span style={{ fontSize: '0.75rem', color: 'var(--muted-foreground)' }}>
                        {parentCap ? (
                          <>
                            Parent:{' '}
                            <button
                              type="button"
                              onClick={() => setInspectedConcept({ kind: 'capability', capability: parentCap })}
                              style={{ background: 'none', border: 'none', padding: 0, color: 'var(--primary)', fontWeight: 600, fontSize: '0.75rem', cursor: 'pointer' }}
                            >
                              {parentCap.name}
                            </button>
                          </>
                        ) : (
                          'Top-level capability'
                        )}
                        {subCaps.length > 0 && ` • ${subCaps.length} sub-capabilities`}
                      </span>
                    </div>
                    <h3 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 800, lineHeight: 1.25 }}>
                      {cap.name}
                    </h3>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', flexShrink: 0 }}>
                    <button
                      type="button"
                      onClick={() => {
                        setInspectedConcept(null);
                        onCapabilityClick?.(cap);
                      }}
                      className="primary"
                      style={{ height: '2rem', padding: '0 0.85rem', fontSize: '0.78rem', gap: '0.35rem', display: 'inline-flex', alignItems: 'center' }}
                      title="Open full capability details page"
                    >
                      Details <ExternalLink size={13} />
                    </button>
                    <button
                      type="button"
                      aria-label="Close inspector"
                      onClick={() => setInspectedConcept(null)}
                      style={{ height: '2rem', width: '2rem', padding: 0, borderRadius: '8px', border: '1px solid var(--border)', background: 'var(--secondary)', color: 'var(--muted-foreground)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}
                    >
                      <X size={15} />
                    </button>
                  </div>
                </div>

                <div style={{ display: rolledUpApps.length > 0 ? 'grid' : 'flex', gridTemplateColumns: rolledUpApps.length > 0 ? 'repeat(auto-fit, minmax(300px, 1fr))' : undefined, flexDirection: 'column', gap: '1.5rem', alignItems: 'start' }}>
                  {rolledUpApps.length > 0 && (
                    <div style={{ width: '100%', minWidth: 0 }}>
                      <TimeMatrix
                        apps={rolledUpApps.map(a => ({
                          id: a.id,
                          name: a.name,
                          technicalFit: a.technicalFit,
                          functionalFit: a.functionalFit,
                          criticality: getEffectiveAppCrit(a),
                          cost: a.cost,
                        }))}
                        onSelectApp={(appId) => {
                          const found = apps.find(a => a.id === appId);
                          if (found) setInspectedConcept({ kind: 'app', app: found });
                        }}
                        thresholds={timeThresholds}
                        aspectRatio="1 / 1"
                        showLegend={true}
                      />
                    </div>
                  )}

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.9rem', minWidth: 0, width: '100%' }}>
                    <p style={{
                      margin: 0,
                      fontSize: '0.84rem',
                      color: 'var(--foreground)',
                      opacity: 0.9,
                      lineHeight: 1.5,
                    }}>
                      {cap.description || 'No description provided.'}
                    </p>

                    {rolledUpApps.length > 0 && (
                      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '0.35rem', borderTop: '1px solid var(--border)', paddingTop: '0.75rem' }}>
                        <span style={{ fontSize: '0.68rem', fontWeight: 700, textTransform: 'uppercase', color: 'var(--muted-foreground)', marginRight: '0.2rem' }}>
                          Applications ({rolledUpApps.length}):
                        </span>
                        {rolledUpApps.map(a => (
                          <button
                            key={a.id}
                            type="button"
                            onClick={() => setInspectedConcept({ kind: 'app', app: a })}
                            style={{
                              fontSize: '0.72rem',
                              fontWeight: 600,
                              padding: '0.18rem 0.5rem',
                              borderRadius: '999px',
                              border: '1px solid var(--border)',
                              background: 'var(--secondary)',
                              color: 'var(--foreground)',
                              cursor: 'pointer',
                            }}
                          >
                            {a.name}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          );
        }

        if (inspectedConcept.kind === 'organization') {
          const org = organizations.find(o => o.id === inspectedConcept.organization.id) || inspectedConcept.organization;
          const parentOrg = organizations.find(o => o.id === org.parentId);
          const subOrgs = organizations.filter(o => o.parentId === org.id);
          const typeOpt = orgTypeOptions.find(o => String(o.value) === String(org.type));
          const accentColor = (typeOpt?.color && typeOpt.color !== 'var(--secondary)') ? typeOpt.color : 'var(--primary)';
          const orgMeta = safeJsonParse(org.metadata);

          const descendantOrgIds = new Set<string>([org.id]);
          const collectOrgDescendants = (pid: string) => {
            for (const child of organizations.filter(o => o.parentId === pid)) {
              if (!descendantOrgIds.has(child.id)) {
                descendantOrgIds.add(child.id);
                collectOrgDescendants(child.id);
              }
            }
          };
          collectOrgDescendants(org.id);

          const rolledUpApps = apps.filter(a => a.ownerOrgId && descendantOrgIds.has(a.ownerOrgId));

          return (
            <div
              className="state-dialog-backdrop"
              style={{ zIndex: 1100 }}
              onMouseDown={() => setInspectedConcept(null)}
            >
              <div
                role="dialog"
                aria-modal="true"
                aria-label={`Organization inspector: ${org.name}`}
                onMouseDown={(e) => e.stopPropagation()}
                style={{
                  width: rolledUpApps.length > 0 ? 'min(52rem, 96vw)' : 'min(34rem, 96vw)',
                  maxHeight: '90vh',
                  overflowY: 'auto',
                  borderRadius: '16px',
                  border: `1.5px solid ${accentColor}`,
                  background: 'var(--card)',
                  color: 'var(--foreground)',
                  boxShadow: '0 12px 32px rgba(0,0,0,0.28)',
                  padding: '1.35rem 1.5rem',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '1.1rem',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '0.75rem' }}>
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', flexWrap: 'wrap', marginBottom: '0.25rem' }}>
                      {(typeOpt?.label || org.type) && (
                        <span style={{
                          fontSize: '0.62rem',
                          fontWeight: 800,
                          letterSpacing: '0.05em',
                          textTransform: 'uppercase',
                          padding: '0.12rem 0.45rem',
                          borderRadius: '4px',
                          background: 'var(--accent)',
                          color: 'var(--foreground)',
                        }}>
                          {typeOpt?.label || org.type}
                        </span>
                      )}
                      <span style={{ fontSize: '0.75rem', color: 'var(--muted-foreground)' }}>
                        {parentOrg ? (
                          <>
                            Parent:{' '}
                            <button
                              type="button"
                              onClick={() => setInspectedConcept({ kind: 'organization', organization: parentOrg })}
                              style={{ background: 'none', border: 'none', padding: 0, color: 'var(--primary)', fontWeight: 600, fontSize: '0.75rem', cursor: 'pointer' }}
                            >
                              {parentOrg.name}
                            </button>
                          </>
                        ) : (
                          'Root organization'
                        )}
                        {subOrgs.length > 0 && ` • ${subOrgs.length} sub-orgs`}
                      </span>
                    </div>
                    <h3 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 800, lineHeight: 1.25 }}>
                      {org.name}
                    </h3>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', flexShrink: 0 }}>
                    <button
                      type="button"
                      onClick={() => {
                        setInspectedConcept(null);
                        onOrganizationClick?.(org);
                      }}
                      className="primary"
                      style={{ height: '2rem', padding: '0 0.85rem', fontSize: '0.78rem', gap: '0.35rem', display: 'inline-flex', alignItems: 'center' }}
                      title="Open full organization details page"
                    >
                      Details <ExternalLink size={13} />
                    </button>
                    <button
                      type="button"
                      aria-label="Close inspector"
                      onClick={() => setInspectedConcept(null)}
                      style={{ height: '2rem', width: '2rem', padding: 0, borderRadius: '8px', border: '1px solid var(--border)', background: 'var(--secondary)', color: 'var(--muted-foreground)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}
                    >
                      <X size={15} />
                    </button>
                  </div>
                </div>

                <div style={{ display: rolledUpApps.length > 0 ? 'grid' : 'flex', gridTemplateColumns: rolledUpApps.length > 0 ? 'repeat(auto-fit, minmax(300px, 1fr))' : undefined, flexDirection: 'column', gap: '1.5rem', alignItems: 'start' }}>
                  {rolledUpApps.length > 0 && (
                    <div style={{ width: '100%', minWidth: 0 }}>
                      <TimeMatrix
                        apps={rolledUpApps.map(a => ({
                          id: a.id,
                          name: a.name,
                          technicalFit: a.technicalFit,
                          functionalFit: a.functionalFit,
                          criticality: getEffectiveAppCrit(a),
                          cost: a.cost,
                        }))}
                        onSelectApp={(appId) => {
                          const found = apps.find(a => a.id === appId);
                          if (found) setInspectedConcept({ kind: 'app', app: found });
                        }}
                        thresholds={timeThresholds}
                        aspectRatio="1 / 1"
                        showLegend={true}
                      />
                    </div>
                  )}

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.9rem', minWidth: 0, width: '100%' }}>
                    {orgMeta.description && (
                      <p style={{
                        margin: 0,
                        fontSize: '0.84rem',
                        color: 'var(--foreground)',
                        opacity: 0.9,
                        lineHeight: 1.5,
                      }}>
                        {orgMeta.description}
                      </p>
                    )}

                    {rolledUpApps.length > 0 ? (
                      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '0.35rem', borderTop: orgMeta.description ? '1px solid var(--border)' : undefined, paddingTop: orgMeta.description ? '0.75rem' : 0 }}>
                        <span style={{ fontSize: '0.68rem', fontWeight: 700, textTransform: 'uppercase', color: 'var(--muted-foreground)', marginRight: '0.2rem' }}>
                          Owned Apps ({rolledUpApps.length}):
                        </span>
                        {rolledUpApps.map(a => (
                          <button
                            key={a.id}
                            type="button"
                            onClick={() => setInspectedConcept({ kind: 'app', app: a })}
                            style={{
                              fontSize: '0.72rem',
                              fontWeight: 600,
                              padding: '0.18rem 0.5rem',
                              borderRadius: '999px',
                              border: '1px solid var(--border)',
                              background: 'var(--secondary)',
                              color: 'var(--foreground)',
                              cursor: 'pointer',
                            }}
                          >
                            {a.name}
                          </button>
                        ))}
                      </div>
                    ) : (
                      <div style={{ fontSize: '0.8rem', color: 'var(--muted-foreground)' }}>
                        No owned applications assigned to this organization.
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          );
        }

        const integration = inspectedConcept.integration;
        const sourceApp = apps.find(a => a.id === integration.sourceAppId) || integration.sourceApp;
        const targetApp = apps.find(a => a.id === integration.targetAppId) || integration.targetApp;
        const title = integration.name || integration.payload?.name || `${sourceApp?.name || 'Source'} → ${targetApp?.name || 'Target'}`;

        return (
          <div
            className="state-dialog-backdrop"
            style={{ zIndex: 1100 }}
            onMouseDown={() => setInspectedConcept(null)}
          >
            <div
              role="dialog"
              aria-modal="true"
              aria-label={`Integration inspector: ${title}`}
              onMouseDown={(e) => e.stopPropagation()}
              style={{
                width: 'min(34rem, 100%)',
                borderRadius: '14px',
                border: '1.5px solid var(--primary)',
                background: 'var(--card)',
                color: 'var(--foreground)',
                boxShadow: '0 12px 32px rgba(0,0,0,0.28)',
                padding: '1.15rem 1.3rem',
                display: 'flex',
                flexDirection: 'column',
                gap: '0.85rem',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '0.6rem' }}>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', flexWrap: 'wrap', marginBottom: '0.25rem' }}>
                    <span style={{
                      fontSize: '0.62rem',
                      fontWeight: 800,
                      letterSpacing: '0.06em',
                      textTransform: 'uppercase',
                      padding: '0.12rem 0.45rem',
                      borderRadius: '4px',
                      background: 'var(--secondary)',
                      color: 'var(--muted-foreground)',
                      border: '1px solid var(--border)',
                    }}>
                      Integration
                    </span>
                    {integration.pattern && (
                      <span style={{ fontSize: '0.65rem', padding: '0.1rem 0.4rem', borderRadius: '4px', background: 'var(--accent)', color: 'var(--foreground)', fontWeight: 600 }}>
                        {integration.pattern}
                      </span>
                    )}
                    {integration.crud && (
                      <span style={{ fontSize: '0.65rem', padding: '0.1rem 0.4rem', borderRadius: '4px', background: 'var(--accent)', color: 'var(--muted-foreground)', fontWeight: 700 }}>
                        {integration.crud}
                      </span>
                    )}
                  </div>
                  <h3 style={{ margin: 0, fontSize: '1.15rem', fontWeight: 800, lineHeight: 1.25 }}>
                    {title}
                  </h3>
                  <div style={{ fontSize: '0.75rem', color: 'var(--muted-foreground)', marginTop: '0.2rem' }}>
                    {sourceApp ? (
                      <button
                        type="button"
                        onClick={() => setInspectedConcept({ kind: 'app', app: sourceApp })}
                        style={{ background: 'none', border: 'none', padding: 0, color: 'var(--primary)', fontWeight: 600, fontSize: '0.75rem', cursor: 'pointer' }}
                      >
                        {sourceApp.name}
                      </button>
                    ) : 'Unknown source'}
                    {' → '}
                    {targetApp ? (
                      <button
                        type="button"
                        onClick={() => setInspectedConcept({ kind: 'app', app: targetApp })}
                        style={{ background: 'none', border: 'none', padding: 0, color: 'var(--primary)', fontWeight: 600, fontSize: '0.75rem', cursor: 'pointer' }}
                      >
                        {targetApp.name}
                      </button>
                    ) : 'Unknown target'}
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', flexShrink: 0 }}>
                  <button
                    type="button"
                    onClick={() => {
                      setInspectedConcept(null);
                      onIntegrationClick?.(integration);
                    }}
                    className="primary"
                    style={{ height: '1.95rem', padding: '0 0.75rem', fontSize: '0.76rem', gap: '0.35rem', display: 'inline-flex', alignItems: 'center' }}
                    title="Open full integration details page"
                  >
                    Details <ExternalLink size={12} />
                  </button>
                  <button
                    type="button"
                    aria-label="Close inspector"
                    onClick={() => setInspectedConcept(null)}
                    style={{ height: '1.95rem', width: '1.95rem', padding: 0, borderRadius: '8px', border: '1px solid var(--border)', background: 'var(--secondary)', color: 'var(--muted-foreground)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}
                  >
                    <X size={14} />
                  </button>
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.5rem', background: 'var(--secondary)', padding: '0.5rem 0.75rem', borderRadius: '8px' }}>
                <div>
                  <div style={{ fontSize: '0.58rem', color: 'var(--muted-foreground)', fontWeight: 700, textTransform: 'uppercase' }}>Payload</div>
                  <div style={{ fontSize: '0.84rem', fontWeight: 800, color: 'var(--foreground)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {integration.payload?.name || 'None'}
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: '0.58rem', color: 'var(--muted-foreground)', fontWeight: 700, textTransform: 'uppercase' }}>Frequency</div>
                  <div style={{ fontSize: '0.84rem', fontWeight: 800, color: 'var(--foreground)' }}>
                    {integration.frequency || '—'}
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: '0.58rem', color: 'var(--muted-foreground)', fontWeight: 700, textTransform: 'uppercase' }}>Pattern</div>
                  <div style={{ fontSize: '0.84rem', fontWeight: 800, color: 'var(--foreground)' }}>
                    {integration.pattern || '—'}
                  </div>
                </div>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
};

export const ApplicationDiagram = (props: Props) => {
  const containerRef = useRef<HTMLDivElement>(null);
  return (
    <div ref={containerRef} style={{ width: '100%', height: '100%', background: 'var(--background)' }}>
      <ReactFlowProvider>
        <DiagramInner {...props} containerRef={containerRef} />
      </ReactFlowProvider>
    </div>
  );
};
