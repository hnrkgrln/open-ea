// Diagram keyword chips. Each keyword runs the landscape search on its own.
// Several keywords keep the overlap of those results. Names can contain spaces
// and commas, so chips are separate values and are not joined into one string.

export type DiagramSearchMode = 'network' | 'landscape' | 'app-landscape' | 'org-landscape';

export type DiagramSuggestionKind =
  | 'capability'
  | 'application'
  | 'organization'
  | 'information'
  | 'pattern'
  | 'crud';

export type DiagramSuggestion = {
  kind: DiagramSuggestionKind;
  label: string;
};

export type DiagramNameCatalog = {
  capabilities?: string[];
  applications?: string[];
  organizations?: string[];
  informationObjects?: string[];
  patterns?: string[];
  crud?: string[];
};

export const normalizeKeywords = (terms: string[]): string[] => {
  const seen = new Set<string>();
  const kept: string[] = [];
  for (const term of terms) {
    const text = term.trim();
    if (!text) continue;
    const key = text.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    kept.push(text);
  }
  return kept;
};

const KIND_ORDER: Record<DiagramSearchMode, Array<{ kind: DiagramSuggestionKind; names: keyof DiagramNameCatalog }>> = {
  landscape: [
    { kind: 'capability', names: 'capabilities' },
    { kind: 'application', names: 'applications' },
  ],
  'org-landscape': [
    { kind: 'organization', names: 'organizations' },
    { kind: 'application', names: 'applications' },
  ],
  'app-landscape': [
    { kind: 'application', names: 'applications' },
    { kind: 'capability', names: 'capabilities' },
  ],
  network: [
    { kind: 'application', names: 'applications' },
    { kind: 'organization', names: 'organizations' },
    { kind: 'information', names: 'informationObjects' },
    { kind: 'pattern', names: 'patterns' },
    { kind: 'crud', names: 'crud' },
  ],
};

const matchRank = (name: string, needle: string) => {
  if (name === needle) return 0;
  if (name.startsWith(needle)) return 1;
  return 2;
};

export const suggestDiagramNames = (
  mode: DiagramSearchMode,
  draft: string,
  taken: string[],
  catalog: DiagramNameCatalog,
  limit = 8,
): DiagramSuggestion[] => {
  const needle = draft.trim().toLowerCase();
  if (needle.length < 1) return [];
  const used = new Set(taken.map((term) => term.trim().toLowerCase()).filter(Boolean));
  const suggestions: DiagramSuggestion[] = [];

  for (const group of KIND_ORDER[mode] || []) {
    if (suggestions.length >= limit) break;
    const seen = new Set<string>();
    const matches: string[] = [];
    for (const name of catalog[group.names] || []) {
      const text = name.trim();
      if (!text) continue;
      const key = text.toLowerCase();
      if (seen.has(key) || used.has(key) || !key.includes(needle)) continue;
      seen.add(key);
      matches.push(text);
    }
    matches.sort((a, b) => {
      const rank = matchRank(a.toLowerCase(), needle) - matchRank(b.toLowerCase(), needle);
      if (rank !== 0) return rank;
      return a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' });
    });
    for (const label of matches) {
      if (suggestions.length >= limit) break;
      suggestions.push({ kind: group.kind, label });
    }
  }

  return suggestions;
};

// Keep a node when it is a surviving focus (or still holds apps), or when a
// descendant is. Ancestor wrappers of two sibling matches then drop out.
export const keptHierarchyNodes = (
  nodeIds: Iterable<string>,
  keepSeeds: ReadonlySet<string>,
  parentOf: (id: string) => string | null | undefined,
): Set<string> => {
  const ids = new Set(nodeIds);
  const children = new Map<string, string[]>();
  for (const id of ids) {
    const parent = parentOf(id);
    if (!parent || !ids.has(parent)) continue;
    const list = children.get(parent);
    if (list) list.push(id);
    else children.set(parent, [id]);
  }

  const kept = new Set<string>();
  const visiting = new Set<string>();
  const visit = (id: string): boolean => {
    if (kept.has(id)) return true;
    if (visiting.has(id)) return keepSeeds.has(id);
    visiting.add(id);
    let keep = keepSeeds.has(id);
    for (const child of children.get(id) || []) {
      if (visit(child)) keep = true;
    }
    visiting.delete(id);
    if (keep) kept.add(id);
    return keep;
  };

  for (const id of ids) {
    const parent = parentOf(id);
    if (!parent || !ids.has(parent)) visit(id);
  }
  return kept;
};

export type HierarchySearchResult<TApp extends { id: string }> = {
  allowedNodeIds: Set<string>;
  focusNodeIds: Set<string>;
  allowedAppsByNode: Map<string, TApp[]>;
  matchedSubtreeApps: TApp[];
};

export const intersectHierarchyResults = <TApp extends { id: string }>(
  results: HierarchySearchResult<TApp>[],
  parentOf: (id: string) => string | null | undefined,
): HierarchySearchResult<TApp> => {
  if (results.length === 1) return results[0];

  const nodeIds = new Set<string>();
  const focusNodeIds = new Set<string>();
  if (results.length > 0) {
    for (const id of results[0].allowedNodeIds) {
      if (results.every((result) => result.allowedNodeIds.has(id))) nodeIds.add(id);
    }
    for (const id of results[0].focusNodeIds) {
      if (results.every((result) => result.focusNodeIds.has(id))) focusNodeIds.add(id);
    }
  }

  const allowedAppsByNode = new Map<string, TApp[]>();
  for (const id of nodeIds) {
    let apps = results[0].allowedAppsByNode.get(id) || [];
    for (const result of results.slice(1)) {
      const ids = new Set((result.allowedAppsByNode.get(id) || []).map((app) => app.id));
      apps = apps.filter((app) => ids.has(app.id));
    }
    if (apps.length > 0) allowedAppsByNode.set(id, apps);
  }

  const keepSeeds = new Set<string>(focusNodeIds);
  for (const id of allowedAppsByNode.keys()) keepSeeds.add(id);
  const allowedNodeIds = keptHierarchyNodes(nodeIds, keepSeeds, parentOf);
  for (const id of [...allowedAppsByNode.keys()]) {
    if (!allowedNodeIds.has(id)) allowedAppsByNode.delete(id);
  }

  const matched = new Map<string, TApp>();
  for (const apps of allowedAppsByNode.values()) {
    for (const app of apps) matched.set(app.id, app);
  }
  const keptFocus = new Set<string>();
  for (const id of focusNodeIds) {
    if (allowedNodeIds.has(id)) keptFocus.add(id);
  }

  return {
    allowedNodeIds,
    focusNodeIds: keptFocus,
    allowedAppsByNode,
    matchedSubtreeApps: [...matched.values()],
  };
};

export const intersectAppLandscapeResults = <
  TApp extends { id: string },
  TCap extends { id: string },
>(results: Array<{ matchedApps: TApp[]; allowedCapsByApp: Map<string, TCap[]> | null }>): {
  matchedApps: TApp[];
  allowedCapsByApp: Map<string, TCap[]> | null;
} => {
  if (results.length === 1) return results[0];
  if (results.length === 0) return { matchedApps: [], allowedCapsByApp: new Map() };

  let matchedApps = results[0].matchedApps;
  for (const result of results.slice(1)) {
    const ids = new Set(result.matchedApps.map((app) => app.id));
    matchedApps = matchedApps.filter((app) => ids.has(app.id));
  }

  const allowedCapsByApp = new Map<string, TCap[]>();
  for (const app of matchedApps) {
    let caps: TCap[] | null = null;
    for (const result of results) {
      if (result.allowedCapsByApp === null) continue;
      const list = result.allowedCapsByApp.get(app.id) || [];
      if (caps === null) caps = list;
      else {
        const ids = new Set(list.map((cap) => cap.id));
        caps = caps.filter((cap) => ids.has(cap.id));
      }
    }
    allowedCapsByApp.set(app.id, caps || []);
  }

  return { matchedApps, allowedCapsByApp };
};
