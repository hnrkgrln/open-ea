import React, { createContext, useContext, useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { landscapeStateHeader, subscribeLandscapeState } from './landscapeState';
import { LandscapeArt, NetworkArt, pickDiagramArt, type DiagramArtKind } from './components/DiagramArt';
import { BrandLogo } from './components/BrandLogo';

export const ACCESS_AREAS = [
  'applications',
  'organizations',
  'capabilities',
  'strategicGoals',
  'information',
  'integrations',
  'diagrams',
  'insights',
] as const;

export type AccessArea = (typeof ACCESS_AREAS)[number];
export type AccessLevel = 'none' | 'view' | 'edit';

export type AccessUser = { id: string; name: string; email: string; picture: string | null };

function httpsPicture(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const raw = value.trim();
  if (!raw || raw.length > 2048) return null;
  try {
    const url = new URL(raw);
    if (url.protocol !== 'https:' || url.username || url.password) return null;
    return url.href;
  } catch {
    return null;
  }
}

export type AccessState = {
  required: boolean;
  user: AccessUser | null;
  admin: boolean;
  areas: Record<AccessArea, AccessLevel>;
  applicationEdits: string[];
  applicationViews: string[];
  ask: boolean;
};

const ALL_EDIT = Object.fromEntries(ACCESS_AREAS.map((area) => [area, 'edit'])) as Record<AccessArea, AccessLevel>;
const ALL_NONE = Object.fromEntries(ACCESS_AREAS.map((area) => [area, 'none'])) as Record<AccessArea, AccessLevel>;

export const OPEN_ACCESS: AccessState = {
  required: false,
  user: null,
  admin: true,
  areas: ALL_EDIT,
  applicationEdits: [],
  applicationViews: [],
  ask: true,
};

const SIGNED_OUT: AccessState = {
  required: true,
  user: null,
  admin: false,
  areas: ALL_NONE,
  applicationEdits: [],
  applicationViews: [],
  ask: false,
};

const HOME: { area: AccessArea; path: string }[] = [
  { area: 'insights', path: '/insights' },
  { area: 'applications', path: '/apps' },
  { area: 'strategicGoals', path: '/strategic-goals' },
  { area: 'capabilities', path: '/capabilities' },
  { area: 'organizations', path: '/organizations' },
  { area: 'information', path: '/information' },
  { area: 'integrations', path: '/integrations' },
  { area: 'diagrams', path: '/diagrams' },
];

type AccessContextValue = AccessState & {
  loading: boolean;
  homePath: string;
  canView: (area: AccessArea) => boolean;
  canEdit: (area: AccessArea) => boolean;
  canEditApplication: (ownerOrgId: string | null | undefined) => boolean;
  canEditSomeApplication: () => boolean;
  signOut: () => Promise<void>;
  refresh: () => Promise<void>;
};

const AccessContext = createContext<AccessContextValue | null>(null);

function isLevel(value: unknown): value is AccessLevel {
  return value === 'none' || value === 'view' || value === 'edit';
}

function parseAccess(body: unknown): AccessState {
  if (!body || typeof body !== 'object') return OPEN_ACCESS;
  const record = body as Partial<AccessState> & { areas?: Record<string, unknown> };
  const areas = { ...ALL_NONE };
  for (const area of ACCESS_AREAS) {
    const level = record.areas?.[area];
    if (isLevel(level)) areas[area] = level;
  }
  const user = record.user && typeof record.user === 'object' && typeof record.user.id === 'string'
    ? {
      id: record.user.id,
      name: String(record.user.name || ''),
      email: String(record.user.email || ''),
      picture: httpsPicture(record.user.picture),
    }
    : null;
  return {
    required: Boolean(record.required),
    user,
    admin: Boolean(record.admin),
    areas,
    applicationEdits: Array.isArray(record.applicationEdits) ? record.applicationEdits.filter((id) => typeof id === 'string') : [],
    applicationViews: Array.isArray(record.applicationViews) ? record.applicationViews.filter((id) => typeof id === 'string') : [],
    ask: Boolean(record.ask),
  };
}

export function homePathFor(access: Pick<AccessState, 'admin' | 'areas'>) {
  for (const item of HOME) {
    if (access.admin || access.areas[item.area] === 'view' || access.areas[item.area] === 'edit') return item.path;
  }
  if (access.admin) return '/settings';
  return '/no-access';
}

export function AccessProvider({ children }: { children: React.ReactNode }) {
  const queryClient = useQueryClient();
  const [landscapeId, setLandscapeId] = useState(landscapeStateHeader);
  useEffect(() => {
    const unsubscribe = subscribeLandscapeState(() => setLandscapeId(landscapeStateHeader()));
    return () => {
      unsubscribe();
    };
  }, []);
  const query = useQuery({
    queryKey: ['access', landscapeId],
    queryFn: async () => {
      const res = await fetch('/api/access/me');
      const body = await res.json().catch(() => null);
      if (res.status === 401) return SIGNED_OUT;
      if (!res.ok) throw new Error('Could not load access.');
      return parseAccess(body);
    },
    retry: false,
  });

  const access = query.data ?? OPEN_ACCESS;
  const value: AccessContextValue = {
    ...access,
    loading: query.isLoading,
    homePath: homePathFor(access),
    canView: (area) => access.admin || access.areas[area] === 'view' || access.areas[area] === 'edit',
    canEdit: (area) => access.admin || access.areas[area] === 'edit',
    canEditApplication: (ownerOrgId) => {
      if (access.admin || access.areas.applications === 'edit') return true;
      if (!ownerOrgId) return false;
      return access.applicationEdits.includes(ownerOrgId);
    },
    canEditSomeApplication: () => access.admin || access.areas.applications === 'edit' || access.applicationEdits.length > 0,
    signOut: async () => {
      await fetch('/api/access/logout', { method: 'POST' });
      queryClient.setQueryData(['access', landscapeId], SIGNED_OUT);
      queryClient.removeQueries({ predicate: (query) => query.queryKey[0] !== 'access' });
    },
    refresh: async () => {
      await queryClient.invalidateQueries({ queryKey: ['access'] });
    },
  };

  if (query.isLoading) {
    return (
      <div className="loading-overlay">
        <div className="loading-logo"><BrandLogo size="splash" label="OpenEA" /></div>
        <div className="loading-text">Checking access...</div>
      </div>
    );
  }

  if (query.isError) {
    return (
      <div className="loading-overlay">
        <div className="loading-text">Access could not be loaded. Refresh the page to try again.</div>
      </div>
    );
  }

  return (
    <AccessContext.Provider value={value}>
      {access.required && !access.user ? <SignIn onSuccess={value.refresh} /> : children}
    </AccessContext.Provider>
  );
}

export function useAccess() {
  const value = useContext(AccessContext);
  if (!value) throw new Error('useAccess must be used inside AccessProvider');
  return value;
}

export function useRequireEdit(area: AccessArea, options: { record?: boolean; ownerOrgId?: string | null; ready?: boolean; redirectTo: string }) {
  const access = useAccess();
  const navigate = useNavigate();
  const ready = options.ready ?? true;
  const allowed = options.record
    ? access.canEditApplication(options.ownerOrgId ?? null)
    : area === 'applications'
      ? access.canEditSomeApplication()
      : access.canEdit(area);
  useEffect(() => {
    if (ready && !allowed) navigate(options.redirectTo, { replace: true });
  }, [ready, allowed, navigate, options.redirectTo]);
}

function useDarkTheme() {
  const [isDark, setIsDark] = useState(() => document.documentElement.getAttribute('data-theme') === 'dark');
  useEffect(() => {
    const root = document.documentElement;
    const sync = () => setIsDark(root.getAttribute('data-theme') === 'dark');
    const observer = new MutationObserver(sync);
    observer.observe(root, { attributes: true, attributeFilter: ['data-theme'] });
    return () => observer.disconnect();
  }, []);
  return isDark;
}

function SignIn({ onSuccess }: { onSuccess: () => Promise<void> }) {
  const [art] = useState<DiagramArtKind>(pickDiagramArt);
  const isDark = useDarkTheme();
  const providers = useQuery({
    queryKey: ['sso-providers'],
    queryFn: async () => {
      const res = await fetch('/api/access/sso/providers');
      if (!res.ok) return [] as { id: string; name: string }[];
      const body = await res.json().catch(() => null);
      if (!Array.isArray(body)) return [];
      return body.filter((item): item is { id: string; name: string } => (
        Boolean(item) && typeof item === 'object' && typeof item.id === 'string' && typeof item.name === 'string'
      ));
    },
  });
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState(() => (
    new URLSearchParams(window.location.search).get('sso_error') === 'denied'
      ? 'Your organization is not allowed to sign in.'
      : ''
  ));
  const [pending, setPending] = useState(false);
  const configured = providers.data ?? [];

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (pending) return;
    setPending(true);
    setError('');
    try {
      const res = await fetch('/api/access/login', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) {
        setError(body?.error || 'Email or password is not valid.');
        return;
      }
      const url = new URL(window.location.href);
      if (url.searchParams.has('sso_error')) {
        url.searchParams.delete('sso_error');
        window.history.replaceState(null, '', `${url.pathname}${url.search}${url.hash}`);
      }
      await onSuccess();
    } catch {
      setError('Sign-in could not reach the server.');
    } finally {
      setPending(false);
    }
  };

  return (
    <div data-diagram-art={art} className="sign-in-screen">
      <div
        aria-hidden="true"
        style={{
          position: 'absolute',
          inset: 0,
          pointerEvents: 'none',
          opacity: 0.5,
          maskImage: 'radial-gradient(ellipse at center, #000 68%, transparent 100%)',
          WebkitMaskImage: 'radial-gradient(ellipse at center, #000 68%, transparent 100%)',
        }}
      >
        {art === 'network' ? <NetworkArt isDark={isDark} opacity={1} /> : <LandscapeArt isDark={isDark} opacity={1} />}
      </div>
      <form onSubmit={(event) => void submit(event)} className="card sign-in-card">
        <div className="sign-in-intro">
          <BrandLogo size="splash" label="OpenEA" />
          <div className="sign-in-copy">
            <h1>Sign in</h1>
            <p>
              {configured.length > 0 ? 'Use your organization\'s sign-in, or the email and password for this workspace.' : 'Use the email and password for this workspace.'}
            </p>
          </div>
        </div>
        {configured.length > 0 && (
          <div className="sign-in-sso">
            {configured.map((provider) => (
              <a key={provider.id} href={`/api/access/sso/${provider.id}/start`}>{provider.name}</a>
            ))}
          </div>
        )}
        <div className="sign-in-credentials">
          {configured.length > 0 && <p className="sign-in-note">The email and password below still work.</p>}
          <div className="field">
            <label className="label" htmlFor="sign-in-email">Email</label>
            <input id="sign-in-email" type="email" autoComplete="email" required value={email} onChange={(event) => setEmail(event.target.value)} />
          </div>
          <div className="field">
            <label className="label" htmlFor="sign-in-password">Password</label>
            <input id="sign-in-password" type="password" autoComplete="current-password" required value={password} onChange={(event) => setPassword(event.target.value)} />
          </div>
          {error && <p className="sign-in-error">{error}</p>}
          <button type="submit" className="primary" disabled={pending}>{pending ? 'Signing in…' : 'Sign in'}</button>
        </div>
      </form>
    </div>
  );
}
