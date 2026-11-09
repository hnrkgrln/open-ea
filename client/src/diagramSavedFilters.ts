// Saved diagram filters are per landscape view and per landscape state.
// Organization, application, and capability ids differ between states.

export const DIAGRAM_SAVED_FILTERS_KEY = 'openea_diagram_saved_filters';

export const DIAGRAM_MODES = ['landscape', 'app-landscape', 'org-landscape', 'network'] as const;
export type DiagramMode = (typeof DIAGRAM_MODES)[number];

export type DiagramFilterSnapshot = Record<string, string[]>;
export type DiagramSavedFilterStore = Record<string, Partial<Record<DiagramMode, DiagramFilterSnapshot>>>;

const FILTER_PARAMS = new Set([
  'q',
  'ownerOrg',
  'orgType',
  'owner',
  'lifecycle',
  'type',
  'cap',
  'crit',
  'cost',
  'func',
  'tech',
  'time',
  'info',
  'pii',
  'confidentiality',
  'integrity',
  'availability',
  'pattern',
  'frequency',
  'crud',
  'sourceApp',
  'targetApp',
  'payload',
]);

export function isDiagramMode(mode: string): mode is DiagramMode {
  return (DIAGRAM_MODES as readonly string[]).includes(mode);
}

export function diagramLandscapeName(mode: string) {
  if (mode === 'app-landscape') return 'Application';
  if (mode === 'org-landscape') return 'Organization';
  if (mode === 'network') return 'Integrations';
  return 'Capability';
}

export function isDiagramFilterParam(key: string) {
  return FILTER_PARAMS.has(key) || key.startsWith('meta_');
}

export function snapshotIsEmpty(snapshot: DiagramFilterSnapshot | null | undefined) {
  if (!snapshot) return true;
  return Object.values(snapshot).every((values) => !values?.length);
}

export function normalizeSnapshot(value: unknown): DiagramFilterSnapshot {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const snapshot: DiagramFilterSnapshot = {};
  for (const [key, raw] of Object.entries(value as Record<string, unknown>)) {
    if (!isDiagramFilterParam(key) || !Array.isArray(raw)) continue;
    const values = raw.map((item) => String(item ?? '').trim()).filter(Boolean);
    if (values.length > 0) snapshot[key] = values;
  }
  return snapshot;
}

export function normalizeStore(value: unknown): DiagramSavedFilterStore {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const store: DiagramSavedFilterStore = {};
  for (const [stateId, modes] of Object.entries(value as Record<string, unknown>)) {
    if (!stateId || !modes || typeof modes !== 'object' || Array.isArray(modes)) continue;
    const byMode: Partial<Record<DiagramMode, DiagramFilterSnapshot>> = {};
    for (const [mode, snapshot] of Object.entries(modes as Record<string, unknown>)) {
      if (!isDiagramMode(mode)) continue;
      const normalized = normalizeSnapshot(snapshot);
      if (!snapshotIsEmpty(normalized)) byMode[mode] = normalized;
    }
    if (Object.keys(byMode).length > 0) store[stateId] = byMode;
  }
  return store;
}

export function snapshotFromParams(params: URLSearchParams): DiagramFilterSnapshot {
  const snapshot: DiagramFilterSnapshot = {};
  for (const key of new Set(params.keys())) {
    if (!isDiagramFilterParam(key)) continue;
    const values = key === 'q'
      ? params.getAll('q').map((item) => item.trim()).filter(Boolean)
      : params.getAll(key).flatMap((item) => item.split(',')).map((item) => item.trim()).filter(Boolean);
    if (values.length > 0) snapshot[key] = values;
  }
  return snapshot;
}

export function snapshotWithDraft(params: URLSearchParams, draft: string): DiagramFilterSnapshot {
  const snapshot = snapshotFromParams(params);
  const text = draft.trim();
  if (!text) return snapshot;
  const keywords = snapshot.q ?? [];
  if (keywords.some((term) => term.toLowerCase() === text.toLowerCase())) return snapshot;
  return { ...snapshot, q: [...keywords, text] };
}

export function snapshotsEqual(left: DiagramFilterSnapshot, right: DiagramFilterSnapshot) {
  const keys = (snapshot: DiagramFilterSnapshot) => Object.keys(snapshot).filter((key) => snapshot[key]?.length).sort();
  const leftKeys = keys(left);
  const rightKeys = keys(right);
  if (leftKeys.length !== rightKeys.length || leftKeys.some((key, index) => key !== rightKeys[index])) return false;
  return leftKeys.every((key) => sameValues(left[key], right[key]));
}

function sameValues(left: string[], right: string[]) {
  if (left.length !== right.length) return false;
  const remaining = [...right];
  return left.every((value) => {
    const index = remaining.indexOf(value);
    if (index < 0) return false;
    remaining.splice(index, 1);
    return true;
  });
}

export function readSavedFilter(store: DiagramSavedFilterStore, stateId: string, mode: string): DiagramFilterSnapshot | undefined {
  if (!isDiagramMode(mode)) return undefined;
  return store[stateId]?.[mode];
}

export function writeSavedFilter(store: DiagramSavedFilterStore, stateId: string, mode: string, snapshot: DiagramFilterSnapshot): DiagramSavedFilterStore {
  const next: DiagramSavedFilterStore = { ...store };
  const modes: Partial<Record<DiagramMode, DiagramFilterSnapshot>> = { ...(store[stateId] ?? {}) };
  const normalized = normalizeSnapshot(snapshot);
  if (!isDiagramMode(mode) || snapshotIsEmpty(normalized)) delete modes[mode];
  else modes[mode] = normalized;
  if (Object.keys(modes).length === 0) delete next[stateId];
  else next[stateId] = modes;
  return next;
}

// A link that already carries filters is left alone. Otherwise the saved
// snapshot replaces every filter param and keeps overlay, group, and embed.
export function paramsWithSnapshot(params: URLSearchParams, mode: string, snapshot: DiagramFilterSnapshot): URLSearchParams {
  const next = new URLSearchParams();
  for (const [key, value] of params.entries()) {
    if (key === 'mode' || isDiagramFilterParam(key)) continue;
    next.append(key, value);
  }
  if (mode && mode !== 'landscape') next.set('mode', mode);
  else if (params.has('mode')) next.set('mode', mode || 'landscape');
  for (const key of Object.keys(snapshot).sort()) {
    const values = snapshot[key];
    if (!values?.length) continue;
    if (key === 'q') {
      for (const value of values) next.append('q', value);
    } else {
      next.set(key, values.join(','));
    }
  }
  return next;
}

// Null means the URL is the filter. A snapshot is applied before paint.
export function initialDiagramPin(params: URLSearchParams, store: DiagramSavedFilterStore, stateId: string, mode: string): DiagramFilterSnapshot | null {
  if (params.get('embed') === '1') return null;
  if (!snapshotIsEmpty(snapshotFromParams(params))) return null;
  const saved = readSavedFilter(store, stateId, mode);
  if (!saved || snapshotIsEmpty(saved)) return null;
  return saved;
}
