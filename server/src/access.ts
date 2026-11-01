import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { CURRENT_STATE_ID, basePrisma, prisma } from './landscape.js';

const scryptAsync = promisify(scrypt);
const SESSION_MS = 14 * 24 * 60 * 60 * 1000;
const COOKIE = 'openea_session';

export const AREAS = [
  'applications',
  'organizations',
  'capabilities',
  'strategicGoals',
  'information',
  'integrations',
  'diagrams',
  'insights',
] as const;

export type Area = (typeof AREAS)[number];
export type Level = 'none' | 'view' | 'edit';

export type AccessUser = { id: string; name: string; email: string };

export type Principal = {
  required: boolean;
  open: boolean;
  admin: boolean;
  user: AccessUser | null;
  areas: Record<Area, Level>;
  applicationOrgs: Map<string, Level>;
};

export class AccessError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = 'AccessError';
    this.status = status;
  }
}

const LEVEL_RANK: Record<Level, number> = { none: 0, view: 1, edit: 2 };

export function levelRank(level: Level) {
  return LEVEL_RANK[level] ?? 0;
}

function maxLevel(left: Level, right: Level): Level {
  return levelRank(left) >= levelRank(right) ? left : right;
}

function allLevels(level: Level): Record<Area, Level> {
  return Object.fromEntries(AREAS.map((area) => [area, level])) as Record<Area, Level>;
}

const BUILTIN_AREAS: Record<string, Record<Area, Level>> = {
  administrators: allLevels('edit'),
  architects: allLevels('edit'),
  viewers: allLevels('view'),
};

const BUILTIN_GROUPS = [
  { id: 'administrators', name: 'Administrators', builtIn: 'administrators' },
  { id: 'architects', name: 'Architects', builtIn: 'architects' },
  { id: 'viewers', name: 'Viewers', builtIn: 'viewers' },
] as const;

function openPrincipal(): Principal {
  return {
    required: false,
    open: true,
    admin: true,
    user: null,
    areas: allLevels('edit'),
    applicationOrgs: new Map(),
  };
}

function lockedPrincipal(): Principal {
  return {
    required: true,
    open: false,
    admin: false,
    user: null,
    areas: allLevels('none'),
    applicationOrgs: new Map(),
  };
}

let usersExist: boolean | null = null;

export function noteUsersExist(value: boolean) {
  usersExist = value;
}

function sessionCookie(id: string) {
  return `${COOKIE}=${encodeURIComponent(id)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${Math.floor(SESSION_MS / 1000)}`;
}

function clearSessionCookie() {
  return `${COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`;
}

export function readSessionId(cookieHeader: string | undefined) {
  if (!cookieHeader) return null;
  for (const part of cookieHeader.split(';')) {
    const separator = part.indexOf('=');
    if (separator < 0) continue;
    const name = part.slice(0, separator).trim();
    if (name !== COOKIE) continue;
    const raw = part.slice(separator + 1).trim();
    if (!raw) return null;
    try {
      return decodeURIComponent(raw);
    } catch {
      return raw;
    }
  }
  return null;
}

export async function hashPassword(password: string) {
  const salt = randomBytes(16).toString('hex');
  const derived = await scryptAsync(password, salt, 32) as Buffer;
  return `scrypt$${salt}$${derived.toString('hex')}`;
}

export async function verifyPassword(password: string, stored: string) {
  const [kind, salt, hex] = stored.split('$');
  if (kind !== 'scrypt' || !salt || !hex) return false;
  const derived = await scryptAsync(password, salt, 32) as Buffer;
  const expected = Buffer.from(hex, 'hex');
  if (expected.length !== derived.length) return false;
  return timingSafeEqual(derived, expected);
}

type OrgNode = { id: string; name: string; parentId: string | null; stateId: string };

function pathKey(byId: Map<string, OrgNode>, id: string) {
  const names: string[] = [];
  const seen = new Set<string>();
  let cursor = byId.get(id);
  while (cursor && !seen.has(cursor.id)) {
    seen.add(cursor.id);
    names.push(cursor.name.trim().toLowerCase());
    cursor = cursor.parentId ? byId.get(cursor.parentId) : undefined;
  }
  return names.reverse().join('\u001f');
}

async function resolveApplicationOrgs(grants: { organizationId: string; level: Level }[], stateId: string) {
  const resolved = new Map<string, Level>();
  if (grants.length === 0) return resolved;
  const orgs = await basePrisma.organization.findMany({
    select: { id: true, name: true, parentId: true, stateId: true },
  });
  const byId = new Map(orgs.map((org) => [org.id, org]));
  const wanted = new Map<string, Level>();
  for (const grant of grants) {
    const key = pathKey(byId, grant.organizationId);
    if (!key) continue;
    wanted.set(key, maxLevel(wanted.get(key) ?? 'none', grant.level));
  }
  for (const org of orgs) {
    if (org.stateId !== stateId) continue;
    const level = wanted.get(pathKey(byId, org.id));
    if (level && level !== 'none') resolved.set(org.id, maxLevel(resolved.get(org.id) ?? 'none', level));
  }
  return resolved;
}

async function loadPrincipal(userId: string, stateId: string): Promise<Principal> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: {
      memberships: {
        include: { group: { include: { grants: true } } },
      },
    },
  });
  if (!user) return lockedPrincipal();
  let admin = false;
  const areas = allLevels('none');
  const orgGrants: { organizationId: string; level: Level }[] = [];
  for (const membership of user.memberships) {
    const group = membership.group;
    if (group.builtIn === 'administrators') admin = true;
    const builtin = group.builtIn ? BUILTIN_AREAS[group.builtIn] : undefined;
    if (builtin) {
      for (const area of AREAS) areas[area] = maxLevel(areas[area], builtin[area]);
      continue;
    }
    for (const grant of group.grants) {
      if (!AREAS.includes(grant.area as Area)) continue;
      const level = grant.level === 'edit' || grant.level === 'view' ? grant.level : 'none';
      if (grant.organizationId && grant.area === 'applications') {
        orgGrants.push({ organizationId: grant.organizationId, level });
      } else if (!grant.organizationId) {
        const area = grant.area as Area;
        areas[area] = maxLevel(areas[area], level);
      }
    }
  }
  return {
    required: true,
    open: false,
    admin,
    user: { id: user.id, name: user.name, email: user.email },
    areas,
    applicationOrgs: await resolveApplicationOrgs(orgGrants, stateId),
  };
}

export async function principalFromCookie(cookieHeader: string | undefined, stateId: string): Promise<Principal> {
  if (usersExist !== true) {
    const count = await prisma.user.count();
    if (count === 0) {
      usersExist = false;
      return openPrincipal();
    }
    usersExist = true;
  }
  const sessionId = readSessionId(cookieHeader);
  if (!sessionId) return lockedPrincipal();
  const session = await prisma.session.findUnique({ where: { id: sessionId } });
  if (!session) return lockedPrincipal();
  if (session.expiresAt.getTime() <= Date.now()) {
    await prisma.session.delete({ where: { id: session.id } }).catch(() => undefined);
    return lockedPrincipal();
  }
  return loadPrincipal(session.userId, stateId);
}

const principals = new WeakMap<object, Principal>();

export function rememberPrincipal(request: object, principal: Principal) {
  principals.set(request, principal);
}

export function requestPrincipal(request: object): Principal {
  return principals.get(request) ?? lockedPrincipal();
}

export function canViewArea(principal: Principal, area: Area) {
  return principal.open || principal.admin || levelRank(principal.areas[area]) >= levelRank('view');
}

export function canEditArea(principal: Principal, area: Area) {
  return principal.open || principal.admin || principal.areas[area] === 'edit';
}

export function hasGlobalApplicationEdit(principal: Principal) {
  return canEditArea(principal, 'applications');
}

export function canSeeApplication(principal: Principal, ownerOrgId: string | null | undefined) {
  if (canViewArea(principal, 'applications')) return true;
  if (!ownerOrgId) return false;
  return levelRank(principal.applicationOrgs.get(ownerOrgId) ?? 'none') >= levelRank('view');
}

export function canEditApplication(principal: Principal, ownerOrgId: string | null | undefined) {
  if (hasGlobalApplicationEdit(principal)) return true;
  if (!ownerOrgId) return false;
  return principal.applicationOrgs.get(ownerOrgId) === 'edit';
}

function canSeeSomeApplication(principal: Principal) {
  if (canViewArea(principal, 'applications')) return true;
  for (const level of principal.applicationOrgs.values()) {
    if (levelRank(level) >= levelRank('view')) return true;
  }
  return false;
}

function canEditSomeApplication(principal: Principal) {
  if (hasGlobalApplicationEdit(principal)) return true;
  for (const level of principal.applicationOrgs.values()) {
    if (level === 'edit') return true;
  }
  return false;
}

export function canAsk(principal: Principal) {
  if (principal.open || principal.admin) return true;
  const needed: Area[] = ['applications', 'organizations', 'capabilities', 'strategicGoals', 'information', 'integrations', 'insights'];
  return needed.every((area) => levelRank(principal.areas[area]) >= levelRank('view'));
}

export function applicationVisibilityWhere(principal: Principal): { ownerOrgId: { in: string[] } } | Record<string, never> | null {
  if (canViewArea(principal, 'applications')) return {};
  const ids = [...principal.applicationOrgs.entries()]
    .filter(([, level]) => levelRank(level) >= levelRank('view'))
    .map(([id]) => id);
  if (ids.length === 0) return null;
  return { ownerOrgId: { in: ids } };
}

export function presentApplication<T extends Record<string, any>>(principal: Principal, app: T): T {
  if (principal.open || principal.admin) return app;
  const next: Record<string, any> = { ...app };
  if (!canViewArea(principal, 'organizations')) {
    if (next.ownerOrg && next.ownerOrgId && principal.applicationOrgs.has(next.ownerOrgId)) {
      next.ownerOrg = { id: next.ownerOrg.id, name: next.ownerOrg.name };
    } else if ('ownerOrg' in next) {
      next.ownerOrg = null;
    }
  }
  if (!canViewArea(principal, 'capabilities') && Array.isArray(next.capabilities)) next.capabilities = [];
  if (!canViewArea(principal, 'information') && Array.isArray(next.processedInformationObjects)) next.processedInformationObjects = [];
  if (!canViewArea(principal, 'integrations')) {
    if ('sourceOf' in next) next.sourceOf = [];
    if ('targetOf' in next) next.targetOf = [];
  }
  if (!canViewArea(principal, 'strategicGoals') && Array.isArray(next.strategicGoals)) next.strategicGoals = [];
  return next as T;
}

export function presentCapability<T extends Record<string, any>>(principal: Principal, capability: T): T {
  const next: Record<string, any> = { ...capability };
  if (Array.isArray(next.applications)) {
    next.applications = next.applications
      .filter((app: { ownerOrgId?: string | null }) => canSeeApplication(principal, app?.ownerOrgId ?? null))
      .map((app: Record<string, any>) => presentApplication(principal, app));
  }
  if (!canViewArea(principal, 'strategicGoals') && Array.isArray(next.strategicGoals)) next.strategicGoals = [];
  return next as T;
}

export function presentOrganization<T extends Record<string, any>>(principal: Principal, org: T): T {
  const next: Record<string, any> = { ...org };
  if (Array.isArray(next.ownedApplications)) {
    next.ownedApplications = next.ownedApplications.filter((app: { ownerOrgId?: string | null }) => canSeeApplication(principal, app?.ownerOrgId ?? null));
  }
  if (next._count && typeof next._count === 'object') {
    next._count = {
      ...next._count,
      ...(Array.isArray(next.ownedApplications) ? { ownedApplications: next.ownedApplications.length } : {}),
    };
  }
  if (!canViewArea(principal, 'information')) {
    if ('informationObjects' in next) next.informationObjects = [];
    if (next._count) next._count = { ...next._count, informationObjects: 0 };
  }
  if (!canViewArea(principal, 'capabilities') && Array.isArray(next.supportedCapabilities)) next.supportedCapabilities = [];
  if (Array.isArray(next.children)) next.children = next.children.map((child: Record<string, any>) => presentOrganization(principal, child));
  return next as T;
}

export function presentInformation<T extends Record<string, any>>(principal: Principal, row: T): T {
  if (principal.open || principal.admin) return row;
  const next: Record<string, any> = { ...row };
  if (!canViewArea(principal, 'organizations') && 'businessOwner' in next) next.businessOwner = null;
  if (next.appOwner && !canSeeApplication(principal, next.appOwner.ownerOrgId ?? null)) next.appOwner = null;
  if (Array.isArray(next.processingApplications)) {
    next.processingApplications = next.processingApplications.filter((app: { ownerOrgId?: string | null }) => canSeeApplication(principal, app?.ownerOrgId ?? null));
  }
  if (!canViewArea(principal, 'integrations') && Array.isArray(next.integrations)) next.integrations = [];
  return next as T;
}

export function presentGoal<T extends Record<string, any>>(principal: Principal, goal: T): T {
  if (canViewArea(principal, 'capabilities') || !Array.isArray(goal.capabilities)) return goal;
  return { ...goal, capabilities: [] };
}

export async function organizationOwnershipDenied(principal: Principal, orgId: string | null, applicationIds: string[]) {
  if (principal.open || principal.admin) return null;
  if (!canEditArea(principal, 'organizations')) return 'You cannot edit organizations.';
  if (!orgId) {
    if (applicationIds.length > 0 && !hasGlobalApplicationEdit(principal)) {
      return 'Choosing owned applications for a new organization requires permission to edit every application.';
    }
    return null;
  }
  const existing = applicationIds.length === 0
    ? []
    : await prisma.application.findMany({
      where: { id: { in: applicationIds } },
      select: { id: true, ownerOrgId: true },
    });
  const valid = new Set(existing.map((app) => app.id));
  const current = await prisma.application.findMany({
    where: { ownerOrgId: orgId },
    select: { id: true },
  });
  const currentIds = new Set(current.map((app) => app.id));
  const released = [...currentIds].filter((id) => !valid.has(id));
  const claimed = existing.filter((app) => !currentIds.has(app.id));
  if (released.length > 0) {
    if (!canEditApplication(principal, orgId) || !hasGlobalApplicationEdit(principal)) {
      return 'Clearing application ownership requires permission to edit every application.';
    }
  }
  for (const app of claimed) {
    if (!canEditApplication(principal, app.ownerOrgId) || !canEditApplication(principal, orgId)) {
      return 'You cannot change ownership of an application you cannot edit.';
    }
  }
  return null;
}

export function accessView(principal: Principal) {
  const applicationEdits: string[] = [];
  const applicationViews: string[] = [];
  if (!canViewArea(principal, 'applications') || !hasGlobalApplicationEdit(principal)) {
    for (const [orgId, level] of principal.applicationOrgs) {
      if (level === 'edit' && !hasGlobalApplicationEdit(principal)) applicationEdits.push(orgId);
      else if (level === 'view' && !canViewArea(principal, 'applications')) applicationViews.push(orgId);
    }
  }
  return {
    required: principal.required,
    user: principal.user,
    admin: principal.admin,
    areas: principal.areas,
    applicationEdits,
    applicationViews,
    ask: canAsk(principal),
  };
}

type Decision = { allow: true } | { allow: false; status: number; body: unknown };

const forbid = (): Decision => ({ allow: false, status: 403, body: { error: 'You do not have permission to do that.' } });

function isPublic(method: string, url: string) {
  if (method === 'POST' && (url === '/access/login' || url === '/access/logout' || url === '/access/bootstrap')) return true;
  if (method === 'GET' && url === '/access/me') return true;
  return false;
}

function isAdminRoute(method: string, url: string) {
  if (url.startsWith('/access/users') || url.startsWith('/access/groups') || url === '/access/organizations') return true;
  if (url.startsWith('/landscape-states')) return !(method === 'GET' && url === '/landscape-states');
  if (url.startsWith('/picklists') || url.startsWith('/picklist-options')) return method !== 'GET';
  if (url.startsWith('/metadata-definitions')) return method !== 'GET';
  if (url === '/workspace') return method !== 'GET';
  if (url.startsWith('/llm')) {
    if (method === 'GET' && url === '/llm/providers') return false;
    if (method === 'POST' && (url === '/llm/ask' || url === '/llm/application-suggestions' || url === '/llm/application-capability-suggestions')) return false;
    return true;
  }
  return false;
}

function areaFor(url: string): Area | null {
  if (url.startsWith('/applications')) return 'applications';
  if (url.startsWith('/capabilities')) return 'capabilities';
  if (url.startsWith('/organizations')) return 'organizations';
  if (url.startsWith('/strategic-goals')) return 'strategicGoals';
  if (url.startsWith('/information-objects')) return 'information';
  if (url.startsWith('/integrations')) return 'integrations';
  if (url.startsWith('/transformations')) return 'insights';
  return null;
}

const LIST_ROUTES = new Set([
  '/applications',
  '/capabilities',
  '/organizations',
  '/strategic-goals',
  '/information-objects',
  '/integrations',
  '/transformations',
]);

export function accessGate(method: string, url: string | undefined, principal: Principal): Decision {
  if (method === 'OPTIONS') return { allow: true };
  const path = url || '';
  const read = method === 'GET' || method === 'HEAD';
  if (isPublic(method, path)) return { allow: true };
  if (principal.required && !principal.user) {
    return { allow: false, status: 401, body: { error: 'Sign in required.', required: true } };
  }
  if (isAdminRoute(method, path) && !principal.admin) return forbid();
  if (method === 'POST' && path === '/llm/ask') return canAsk(principal) ? { allow: true } : forbid();
  if (method === 'POST' && path === '/llm/application-suggestions') {
    return canEditSomeApplication(principal) ? { allow: true } : forbid();
  }
  if (method === 'POST' && path === '/llm/application-capability-suggestions') {
    if (!canEditSomeApplication(principal) || !canViewArea(principal, 'capabilities')) return forbid();
    return { allow: true };
  }
  const area = areaFor(path);
  if (!area) return { allow: true };
  const write = !read;
  if (area === 'applications') {
    if (write && !canEditSomeApplication(principal)) return forbid();
    if (!write && !canSeeSomeApplication(principal)) {
      if (path === '/applications') return { allow: false, status: 200, body: [] };
      return { allow: false, status: 404, body: { error: 'Application not found' } };
    }
    return { allow: true };
  }
  if (area === 'organizations' && !write && path === '/organizations') {
    if (!canViewArea(principal, 'organizations') && principal.applicationOrgs.size === 0) {
      return { allow: false, status: 200, body: [] };
    }
    return { allow: true };
  }
  if (write) return canEditArea(principal, area) ? { allow: true } : forbid();
  if (!canViewArea(principal, area)) {
    if (path.includes(':')) return { allow: false, status: 404, body: { error: 'Not found' } };
    if (LIST_ROUTES.has(path)) return { allow: false, status: 200, body: [] };
    return forbid();
  }
  return { allow: true };
}

const levelSchema = z.enum(['none', 'view', 'edit']);
const grantsSchema = z.object({
  areas: z.object({
    applications: levelSchema,
    organizations: levelSchema,
    capabilities: levelSchema,
    strategicGoals: levelSchema,
    information: levelSchema,
    integrations: levelSchema,
    diagrams: levelSchema,
    insights: levelSchema,
  }),
  applicationEdits: z.array(z.string()).max(200).default([]),
  applicationViews: z.array(z.string()).max(200).default([]),
});

function normalizeGrants(input: z.infer<typeof grantsSchema>, allowedOrgIds: Set<string>) {
  const rows: { area: Area; level: Level; organizationId: string | null }[] = AREAS.map((area) => ({
    area,
    level: input.areas[area],
    organizationId: null,
  }));
  const base = input.areas.applications;
  if (base === 'edit') return rows;
  const edits = new Set(input.applicationEdits.filter((id) => allowedOrgIds.has(id)));
  const views = new Set(input.applicationViews.filter((id) => allowedOrgIds.has(id) && !edits.has(id)));
  if (base === 'view') {
    for (const id of edits) rows.push({ area: 'applications', level: 'edit', organizationId: id });
  } else {
    for (const id of edits) rows.push({ area: 'applications', level: 'edit', organizationId: id });
    for (const id of views) rows.push({ area: 'applications', level: 'view', organizationId: id });
  }
  return rows;
}

async function currentOrganizationIds() {
  const rows = await basePrisma.organization.findMany({
    where: { stateId: CURRENT_STATE_ID },
    select: { id: true },
  });
  return new Set(rows.map((row) => row.id));
}

function presentGrants(grants: { area: string; level: string; organizationId: string | null }[]) {
  const areas = allLevels('none');
  const applicationEdits: string[] = [];
  const applicationViews: string[] = [];
  for (const grant of grants) {
    if (!AREAS.includes(grant.area as Area)) continue;
    const level: Level = grant.level === 'edit' || grant.level === 'view' ? grant.level : 'none';
    if (grant.organizationId && grant.area === 'applications') {
      if (level === 'edit') applicationEdits.push(grant.organizationId);
      else if (level === 'view') applicationViews.push(grant.organizationId);
    } else if (!grant.organizationId) {
      areas[grant.area as Area] = maxLevel(areas[grant.area as Area], level);
    }
  }
  return { areas, applicationEdits, applicationViews };
}

function presentGroup(group: {
  id: string;
  name: string;
  builtIn: string | null;
  grants: { area: string; level: string; organizationId: string | null }[];
  _count: { memberships: number };
}) {
  const builtin = group.builtIn ? BUILTIN_AREAS[group.builtIn] : undefined;
  const grants = builtin
    ? { areas: builtin, applicationEdits: [] as string[], applicationViews: [] as string[] }
    : presentGrants(group.grants);
  return {
    id: group.id,
    name: group.name,
    builtIn: group.builtIn,
    locked: Boolean(group.builtIn),
    memberCount: group._count.memberships,
    ...grants,
  };
}

const groupInclude = { grants: true, _count: { select: { memberships: true } } } as const;

async function assertGroups(groupIds: string[]) {
  const unique = [...new Set(groupIds)];
  if (unique.length === 0) return unique;
  const found = await prisma.group.findMany({ where: { id: { in: unique } }, select: { id: true } });
  if (found.length !== unique.length) throw new AccessError(400, 'One of the groups does not exist.');
  return unique;
}

async function assertLastAdministrator(userId: string, nextGroupIds: string[] | undefined) {
  const membership = await prisma.groupMembership.findUnique({
    where: { userId_groupId: { userId, groupId: 'administrators' } },
    select: { userId: true },
  });
  if (!membership) return;
  const keepsAdmin = nextGroupIds === undefined || nextGroupIds.includes('administrators');
  if (keepsAdmin) return;
  const others = await prisma.groupMembership.count({
    where: { groupId: 'administrators', userId: { not: userId } },
  });
  if (others === 0) throw new AccessError(400, 'The last administrator cannot be removed.');
}

async function createSession(userId: string) {
  return prisma.session.create({
    data: { userId, expiresAt: new Date(Date.now() + SESSION_MS) },
  });
}

function catchAccess(err: unknown, reply: { status: (code: number) => { send: (body: unknown) => unknown } }) {
  if (err instanceof AccessError) {
    reply.status(err.status).send({ error: err.message });
    return true;
  }
  const code = err && typeof err === 'object' && 'code' in err ? String((err as { code: unknown }).code) : '';
  if (code === 'P2002') {
    reply.status(409).send({ error: 'That name or email is already in use.' });
    return true;
  }
  return false;
}

const passwordSchema = z.string().min(8, 'Use at least 8 characters.').max(200);
const emailSchema = z.string().trim().email().max(200);
const displayNameSchema = z.string().trim().min(1, 'Enter a display name.').max(120);

export function registerAccessRoutes(server: FastifyInstance) {
  const app = server.withTypeProvider<ZodTypeProvider>();

  app.get('/access/me', async (request, reply) => {
    const principal = requestPrincipal(request);
    if (principal.required && !principal.user) {
      return reply.status(401).send({ error: 'Sign in required.', required: true });
    }
    return accessView(principal);
  });

  app.post('/access/login', {
    schema: { body: z.object({ email: emailSchema, password: z.string().min(1).max(200) }) },
  }, async (request, reply) => {
    if (usersExist === false) return reply.status(400).send({ error: 'Create the first administrator before signing in.' });
    const email = request.body.email.toLowerCase();
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user || !(await verifyPassword(request.body.password, user.passwordHash))) {
      return reply.status(401).send({ error: 'Email or password is not valid.' });
    }
    const session = await createSession(user.id);
    reply.header('set-cookie', sessionCookie(session.id));
    const principal = await loadPrincipal(user.id, CURRENT_STATE_ID);
    return accessView(principal);
  });

  app.post('/access/logout', async (request, reply) => {
    const sessionId = readSessionId(request.headers.cookie);
    if (sessionId) await prisma.session.delete({ where: { id: sessionId } }).catch(() => undefined);
    reply.header('set-cookie', clearSessionCookie());
    return { ok: true };
  });

  app.post('/access/bootstrap', {
    schema: {
      body: z.object({
        email: emailSchema,
        password: passwordSchema,
        name: displayNameSchema,
      }),
    },
  }, async (request, reply) => {
    try {
      const email = request.body.email.toLowerCase();
      const passwordHash = await hashPassword(request.body.password);
      const user = await prisma.$transaction(async (tx) => {
        if (await tx.user.count() > 0) throw new AccessError(409, 'An administrator already exists.');
        for (const group of BUILTIN_GROUPS) {
          await tx.group.upsert({
            where: { id: group.id },
            create: group,
            update: { name: group.name, builtIn: group.builtIn },
          });
        }
        return tx.user.create({
          data: {
            name: request.body.name.trim(),
            email,
            passwordHash,
            memberships: { create: { groupId: 'administrators' } },
          },
        });
      });
      noteUsersExist(true);
      const session = await createSession(user.id);
      reply.header('set-cookie', sessionCookie(session.id));
      return accessView(await loadPrincipal(user.id, CURRENT_STATE_ID));
    } catch (err) {
      if (catchAccess(err, reply)) return;
      throw err;
    }
  });

  app.get('/access/users', async () => {
    const users = await prisma.user.findMany({
      orderBy: { name: 'asc' },
      include: { memberships: { select: { groupId: true } } },
    });
    return users.map((user) => ({
      id: user.id,
      name: user.name,
      email: user.email,
      groupIds: user.memberships.map((membership) => membership.groupId),
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    }));
  });

  app.post('/access/users', {
    schema: {
      body: z.object({
        email: emailSchema,
        password: passwordSchema,
        name: displayNameSchema,
        groupIds: z.array(z.string()).max(50).default([]),
      }),
    },
  }, async (request, reply) => {
    try {
      const groupIds = await assertGroups(request.body.groupIds);
      const created = await prisma.user.create({
        data: {
          name: request.body.name.trim(),
          email: request.body.email.toLowerCase(),
          passwordHash: await hashPassword(request.body.password),
          memberships: { create: groupIds.map((groupId) => ({ groupId })) },
        },
        include: { memberships: { select: { groupId: true } } },
      });
      return {
        id: created.id,
        name: created.name,
        email: created.email,
        groupIds: created.memberships.map((membership) => membership.groupId),
      };
    } catch (err) {
      if (catchAccess(err, reply)) return;
      throw err;
    }
  });

  app.put('/access/users/:id', {
    schema: {
      params: z.object({ id: z.string() }),
      body: z.object({
        name: displayNameSchema.optional(),
        email: emailSchema.optional(),
        password: passwordSchema.optional(),
        groupIds: z.array(z.string()).max(50).optional(),
      }),
    },
  }, async (request, reply) => {
    try {
      const existing = await prisma.user.findUnique({ where: { id: request.params.id }, select: { id: true } });
      if (!existing) return reply.status(404).send({ error: 'User not found' });
      const groupIds = request.body.groupIds === undefined ? undefined : await assertGroups(request.body.groupIds);
      await assertLastAdministrator(existing.id, groupIds);
      const data: { name?: string; email?: string; passwordHash?: string } = {};
      if (request.body.name !== undefined) data.name = request.body.name.trim();
      if (request.body.email !== undefined) data.email = request.body.email.toLowerCase();
      if (request.body.password !== undefined) data.passwordHash = await hashPassword(request.body.password);
      await prisma.$transaction(async (tx) => {
        if (Object.keys(data).length > 0) await tx.user.update({ where: { id: existing.id }, data });
        if (groupIds) {
          await tx.groupMembership.deleteMany({ where: { userId: existing.id } });
          if (groupIds.length > 0) {
            await tx.groupMembership.createMany({ data: groupIds.map((groupId) => ({ userId: existing.id, groupId })) });
          }
        }
      });
      const updated = await prisma.user.findUniqueOrThrow({
        where: { id: existing.id },
        include: { memberships: { select: { groupId: true } } },
      });
      return {
        id: updated.id,
        name: updated.name,
        email: updated.email,
        groupIds: updated.memberships.map((membership) => membership.groupId),
      };
    } catch (err) {
      if (catchAccess(err, reply)) return;
      throw err;
    }
  });

  app.delete('/access/users/:id', {
    schema: { params: z.object({ id: z.string() }) },
  }, async (request, reply) => {
    try {
      const existing = await prisma.user.findUnique({ where: { id: request.params.id }, select: { id: true } });
      if (!existing) return reply.status(404).send({ error: 'User not found' });
      await assertLastAdministrator(existing.id, []);
      await prisma.user.delete({ where: { id: existing.id } });
      return { ok: true };
    } catch (err) {
      if (catchAccess(err, reply)) return;
      throw err;
    }
  });

  app.get('/access/groups', async () => {
    const groups = await prisma.group.findMany({ orderBy: { name: 'asc' }, include: groupInclude });
    return groups.map(presentGroup);
  });

  app.get('/access/organizations', async () => {
    return basePrisma.organization.findMany({
      where: { stateId: CURRENT_STATE_ID },
      select: { id: true, name: true, parentId: true, type: true },
      orderBy: { name: 'asc' },
    });
  });

  app.post('/access/groups', {
    schema: {
      body: z.object({
        name: z.string().trim().min(1).max(80),
        grants: grantsSchema,
      }),
    },
  }, async (request, reply) => {
    try {
      const allowed = await currentOrganizationIds();
      const grants = normalizeGrants(request.body.grants, allowed);
      const created = await prisma.group.create({
        data: {
          name: request.body.name.trim(),
          grants: { create: grants },
        },
        include: groupInclude,
      });
      return presentGroup(created);
    } catch (err) {
      if (catchAccess(err, reply)) return;
      throw err;
    }
  });

  app.put('/access/groups/:id', {
    schema: {
      params: z.object({ id: z.string() }),
      body: z.object({
        name: z.string().trim().min(1).max(80).optional(),
        grants: grantsSchema.optional(),
      }),
    },
  }, async (request, reply) => {
    try {
      const existing = await prisma.group.findUnique({ where: { id: request.params.id } });
      if (!existing) return reply.status(404).send({ error: 'Group not found' });
      if (existing.builtIn) throw new AccessError(400, 'A built-in group cannot be changed.');
      const grants = request.body.grants
        ? normalizeGrants(request.body.grants, await currentOrganizationIds())
        : undefined;
      await prisma.$transaction(async (tx) => {
        if (request.body.name !== undefined) {
          await tx.group.update({ where: { id: existing.id }, data: { name: request.body.name.trim() } });
        }
        if (grants) {
          await tx.groupGrant.deleteMany({ where: { groupId: existing.id } });
          if (grants.length > 0) await tx.groupGrant.createMany({ data: grants.map((grant) => ({ ...grant, groupId: existing.id })) });
        }
      });
      return presentGroup(await prisma.group.findUniqueOrThrow({ where: { id: existing.id }, include: groupInclude }));
    } catch (err) {
      if (catchAccess(err, reply)) return;
      throw err;
    }
  });

  app.delete('/access/groups/:id', {
    schema: { params: z.object({ id: z.string() }) },
  }, async (request, reply) => {
    try {
      const existing = await prisma.group.findUnique({ where: { id: request.params.id } });
      if (!existing) return reply.status(404).send({ error: 'Group not found' });
      if (existing.builtIn) throw new AccessError(400, 'A built-in group cannot be removed.');
      await prisma.group.delete({ where: { id: existing.id } });
      return { ok: true };
    } catch (err) {
      if (catchAccess(err, reply)) return;
      throw err;
    }
  });
}
