const STORAGE_KEY = 'openea_landscape_state';

function readStoredState() {
  try {
    const value = localStorage.getItem(STORAGE_KEY)?.trim();
    return value || 'current';
  } catch {
    return 'current';
  }
}

let activeStateId = readStoredState();
const listeners = new Set<() => void>();

export function landscapeStateHeader() {
  return activeStateId;
}

export function subscribeLandscapeState(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function setLandscapeStateId(id: string) {
  const next = id.trim() || 'current';
  if (next === activeStateId) return;
  activeStateId = next;
  try {
    if (next === 'current') localStorage.removeItem(STORAGE_KEY);
    else localStorage.setItem(STORAGE_KEY, next);
  } catch {
    // The menu still switches for this page load when storage is blocked.
  }
  listeners.forEach((listener) => listener());
}

const nativeFetchKey = '__openeaNativeFetch';
const host = window as Window & { [nativeFetchKey]?: typeof window.fetch };
if (!host[nativeFetchKey]) host[nativeFetchKey] = window.fetch.bind(window);
const nativeFetch = host[nativeFetchKey];

function isApiRequest(input: RequestInfo | URL) {
  const raw = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
  try {
    return new URL(raw, window.location.origin).pathname.startsWith('/api');
  } catch {
    return false;
  }
}

window.fetch = (input: RequestInfo | URL, init?: RequestInit) => {
  if (!isApiRequest(input)) return nativeFetch(input, init);
  const headers = new Headers(init?.headers ?? (input instanceof Request ? input.headers : undefined));
  headers.set('X-Landscape-State', landscapeStateHeader());
  return nativeFetch(input, { ...init, headers });
};
