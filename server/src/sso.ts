import { randomBytes } from 'node:crypto';
import { createRequire } from 'node:module';
import type { FastifyInstance, FastifyReply } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import type { CacheProvider, Profile } from '@node-saml/node-saml';
import type { IdentityProvider } from '@prisma/client';
import * as oidc from 'openid-client';
import { z } from 'zod';
import { AccessError, httpsPicture, noteUsersExist } from './access.js';
import { prisma } from './landscape.js';

const require = createRequire(import.meta.url);
const nodeSaml = require('@node-saml/node-saml') as typeof import('@node-saml/node-saml');

const WORKSPACE_SETTINGS_ID = 'default';
const DEFAULT_BRAND_NAME = 'OpenEA';
const STATE_MS = 10 * 60 * 1000;
const SSO_DENIED_MESSAGE = 'Your organization is not allowed to sign in.';
const EMAIL_NAMEID = 'urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress';
const TENANT_GUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const SAML_EMAIL_ATTRIBUTES = [
  'http://schemas.xmlsoap.org/ws/2005/05/identity/claims/emailaddress',
  'mail',
  'email',
  'urn:oid:0.9.2342.19200300.100.1.3',
];
const SAML_NAME_ATTRIBUTES = [
  'http://schemas.microsoft.com/identity/claims/displayname',
  'http://schemas.xmlsoap.org/ws/2005/05/identity/claims/name',
  'displayName',
];
const SAML_GIVEN_ATTRIBUTES = [
  'http://schemas.xmlsoap.org/ws/2005/05/identity/claims/givenname',
  'givenName',
  'urn:oid:2.5.4.42',
];
const SAML_FAMILY_ATTRIBUTES = [
  'http://schemas.xmlsoap.org/ws/2005/05/identity/claims/surname',
  'sn',
  'surname',
  'urn:oid:2.5.4.4',
];
const SAML_PICTURE_ATTRIBUTES = [
  'picture',
  'photo',
  'thumbnailPhoto',
  'jpegPhoto',
  'http://schemas.xmlsoap.org/ws/2005/05/identity/claims/picture',
];

export type TrustProvider = {
  enabled: boolean;
  kind: string;
  protocol: string;
  domains: string[];
  tenantId: string | null;
};

export type TrustProfile = {
  email: string | null;
  emailVerified: boolean | null;
  name?: string | null;
  givenName?: string | null;
  familyName?: string | null;
  tenantId: string | null;
  hostedDomain: string | null;
  picture?: string | null;
};

export function emailDomain(email: string): string | null {
  const at = email.lastIndexOf('@');
  if (at <= 0 || at !== email.indexOf('@')) return null;
  const domain = email.slice(at + 1).toLowerCase();
  if (!domain.includes('.') || domain.startsWith('.') || domain.endsWith('.') || domain.includes(' ')) return null;
  return domain;
}

export function parseDomains(raw: string): string[] {
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((item): item is string => typeof item === 'string');
  } catch {
    return [];
  }
}

// Every check has to pass. A failure here never changes what the person sees:
// the route logs the reason and redirects with one generic message.
export function identityRefusal(provider: TrustProvider, profile: TrustProfile): string | null {
  if (!provider.enabled) return 'provider is disabled';
  const email = profile.email?.trim().toLowerCase() ?? '';
  if (email.includes('#ext#')) return 'guest account is not allowed';
  const domain = emailDomain(email);
  if (!domain) return 'email is missing';
  const googleOidc = provider.kind === 'google' && provider.protocol !== 'saml';
  if (provider.kind === 'oidc' || googleOidc) {
    if (profile.emailVerified !== true) return 'email is not verified';
  } else if (provider.kind === 'entra') {
    if (profile.emailVerified === false) return 'email is not verified';
  } else if (provider.kind !== 'saml' && provider.kind !== 'google') {
    return 'provider is not recognized';
  }
  if (!provider.domains.includes(domain)) return 'email domain is not allowed';
  if (provider.kind === 'entra') {
    const tenant = provider.tenantId?.trim().toLowerCase() ?? '';
    const tid = profile.tenantId?.trim().toLowerCase() ?? '';
    if (!tenant || tid !== tenant) return 'tenant does not match';
  }
  if (googleOidc) {
    const hosted = profile.hostedDomain?.trim().toLowerCase() ?? '';
    if (!hosted) return 'hosted domain is missing';
    if (!provider.domains.includes(hosted)) return 'hosted domain is not allowed';
  }
  return null;
}

export function identityDisplayName(profile: Pick<TrustProfile, 'name' | 'givenName' | 'familyName'>, email: string): string {
  const name = profile.name?.trim() ?? '';
  if (name) return name.slice(0, 120);
  const combined = `${profile.givenName?.trim() ?? ''} ${profile.familyName?.trim() ?? ''}`.trim();
  if (combined) return combined.slice(0, 120);
  return email.slice(0, 120);
}

async function rememberPicture(userId: string, current: string | null, picture: string | null) {
  if (!picture || picture === current) return;
  await prisma.user.update({ where: { id: userId }, data: { pictureUrl: picture } });
}

export async function provisionIdentityUser(email: string, name: string, picture: string | null = null): Promise<{ id: string; created: boolean }> {
  const normalized = email.trim().toLowerCase();
  const display = name.trim().slice(0, 120) || normalized;
  const safePicture = httpsPicture(picture);
  const existing = await prisma.user.findUnique({ where: { email: normalized }, select: { id: true, pictureUrl: true } });
  if (existing) {
    await rememberPicture(existing.id, existing.pictureUrl, safePicture);
    return { id: existing.id, created: false };
  }
  const viewers = await prisma.group.findUnique({ where: { id: 'viewers' }, select: { id: true } });
  if (!viewers) throw new Error('The Viewers group is missing.');
  try {
    const created = await prisma.user.create({
      data: {
        email: normalized,
        name: display,
        passwordHash: null,
        pictureUrl: safePicture,
        memberships: { create: { groupId: 'viewers' } },
      },
      select: { id: true },
    });
    noteUsersExist(true);
    return { id: created.id, created: true };
  } catch (err) {
    const code = err && typeof err === 'object' && 'code' in err ? String(err.code) : '';
    if (code === 'P2002') {
      const again = await prisma.user.findUnique({ where: { email: normalized }, select: { id: true, pictureUrl: true } });
      if (again) {
        await rememberPicture(again.id, again.pictureUrl, safePicture);
        return { id: again.id, created: false };
      }
    }
    throw err;
  }
}

function blank(value: string | undefined): string | null {
  const trimmed = value?.trim() ?? '';
  return trimmed || null;
}

function normalizeDomains(domains: string[]): string[] {
  const out: string[] = [];
  for (const raw of domains) {
    const domain = raw.trim().toLowerCase().replace(/^@/, '').replace(/\.$/, '');
    if (!domain) continue;
    if (!/^[a-z0-9.-]+$/.test(domain) || !domain.includes('.') || domain.startsWith('.') || domain.includes('..')) {
      throw new AccessError(400, 'Enter a domain such as company.com.');
    }
    if (!out.includes(domain)) out.push(domain);
  }
  return out;
}

function absoluteHttpUrl(value: string, message: string, allowQuery = false): string {
  let url: URL;
  try {
    url = new URL(value.trim());
  } catch {
    throw new AccessError(400, message);
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') throw new AccessError(400, message);
  if (url.username || url.password || url.hash) throw new AccessError(400, message);
  if (!allowQuery && url.search) throw new AccessError(400, message);
  if (allowQuery) return url.href;
  const path = url.pathname === '/' ? '' : url.pathname.replace(/\/$/, '');
  return `${url.origin}${path}`;
}

export function normalizePublicBaseUrl(input: string): string {
  const trimmed = input.trim();
  if (!trimmed) throw new AccessError(400, 'Enter the workspace URL.');
  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    throw new AccessError(400, 'Enter an absolute http or https workspace URL.');
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new AccessError(400, 'Enter an absolute http or https workspace URL.');
  }
  if (url.username || url.password || url.search || url.hash) {
    throw new AccessError(400, 'Enter an absolute http or https workspace URL.');
  }
  if (url.pathname !== '/' && url.pathname !== '') {
    throw new AccessError(400, 'The workspace URL cannot include a path.');
  }
  return `${url.protocol}//${url.host}`;
}

const GOOGLE_ENTITY_MESSAGE = 'Paste the Entity ID from Google Identity Provider details.';

// Google Admin shows an Entity ID (Enhets-ID) and a certificate. The sign-in URL is the same id with /idp in the path.
export function googleWorkspaceSaml(value: string): { entityId: string; entryPoint: string } {
  const trimmed = value.trim();
  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    throw new AccessError(400, GOOGLE_ENTITY_MESSAGE);
  }
  const idpid = url.searchParams.get('idpid')?.trim() ?? '';
  const path = url.pathname.replace(/\/$/, '');
  if (
    url.protocol !== 'https:'
    || url.hostname !== 'accounts.google.com'
    || url.username
    || url.password
    || url.hash
    || (path !== '/o/saml2' && path !== '/o/saml2/idp')
    || !/^C[a-z0-9]+$/i.test(idpid)
  ) {
    throw new AccessError(400, GOOGLE_ENTITY_MESSAGE);
  }
  const entityId = path === '/o/saml2' ? trimmed : `https://accounts.google.com/o/saml2?idpid=${idpid}`;
  return { entityId, entryPoint: `https://accounts.google.com/o/saml2/idp?idpid=${idpid}` };
}

function normalizeTenant(value: string | undefined, required: boolean): string | null {
  const tenant = value?.trim() ?? '';
  if (!tenant) {
    if (required) throw new AccessError(400, 'Enter the tenant id from Microsoft Entra ID.');
    return null;
  }
  if (/^(common|organizations|consumers)$/i.test(tenant)) {
    throw new AccessError(400, 'Use your directory tenant id. A shared tenant such as common would allow any Microsoft account.');
  }
  if (!TENANT_GUID.test(tenant)) throw new AccessError(400, 'Enter the directory (tenant) id.');
  return tenant.toLowerCase();
}

function normalizeCert(raw: string): string {
  const body = raw
    .replace(/-----BEGIN CERTIFICATE-----/g, '')
    .replace(/-----END CERTIFICATE-----/g, '')
    .replace(/\s+/g, '');
  if (body.length < 64 || !/^[A-Za-z0-9+/=]+$/.test(body)) {
    throw new AccessError(400, 'Enter the signing certificate.');
  }
  const lines = body.match(/.{1,64}/g) ?? [];
  return `-----BEGIN CERTIFICATE-----\n${lines.join('\n')}\n-----END CERTIFICATE-----\n`;
}

async function workspaceBase(): Promise<string | null> {
  const row = await prisma.workspaceSettings.findUnique({
    where: { id: WORKSPACE_SETTINGS_ID },
    select: { publicBaseUrl: true },
  });
  const url = row?.publicBaseUrl?.trim() ?? '';
  return url || null;
}

function providerUrls(base: string | null, id: string) {
  if (!base) return null;
  return {
    redirect: `${base}/api/access/sso/${id}/callback`,
    acs: `${base}/api/access/sso/${id}/acs`,
    metadata: `${base}/api/access/sso/${id}/metadata`,
  };
}

function presentProvider(row: IdentityProvider, base: string | null) {
  return {
    id: row.id,
    name: row.name,
    protocol: row.protocol,
    kind: row.kind,
    enabled: row.enabled,
    domains: parseDomains(row.domains),
    issuer: row.issuer,
    clientId: row.clientId,
    hasSecret: Boolean(row.clientSecret),
    tenantId: row.tenantId,
    entryPoint: row.entryPoint,
    idpEntityId: row.idpEntityId,
    hasCert: Boolean(row.idpCert),
    emailAttribute: row.emailAttribute,
    nameAttribute: row.nameAttribute,
    allowIdpInitiated: row.allowIdpInitiated,
    urls: providerUrls(base, row.id),
  };
}

function trustOf(row: IdentityProvider): TrustProvider {
  return { enabled: row.enabled, kind: row.kind, protocol: row.protocol, domains: parseDomains(row.domains), tenantId: row.tenantId };
}

const providerBody = z.object({
  id: z.string().uuid().optional(),
  name: z.string().trim().min(1, 'Enter a name.').max(80),
  kind: z.enum(['entra', 'google', 'oidc', 'saml']),
  enabled: z.boolean().default(false),
  domains: z.array(z.string()).max(50).default([]),
  issuer: z.string().max(500).optional(),
  clientId: z.string().max(500).optional(),
  clientSecret: z.string().max(8000).optional(),
  tenantId: z.string().max(80).optional(),
  entryPoint: z.string().max(2000).optional(),
  idpEntityId: z.string().max(500).optional(),
  idpCert: z.string().max(20000).optional(),
  emailAttribute: z.string().max(300).optional(),
  nameAttribute: z.string().max(300).optional(),
  allowIdpInitiated: z.boolean().optional(),
});

type ProviderBody = z.infer<typeof providerBody>;

async function assertDiscovery(issuer: string, clientId: string, clientSecret: string) {
  try {
    await oidc.discovery(new URL(issuer), clientId, clientSecret);
  } catch (err) {
    console.warn(`sso discovery failed: ${err instanceof Error ? err.message : 'unknown error'}`);
    throw new AccessError(400, 'The issuer did not publish a discovery document.');
  }
}

async function prepareProvider(body: ProviderBody, existing: Pick<IdentityProvider, 'clientSecret' | 'idpCert'> | null) {
  const protocol = body.kind === 'saml' || body.kind === 'google' ? 'saml' : 'oidc';
  const domains = normalizeDomains(body.domains);
  const base = await workspaceBase();
  if (body.enabled && !base) throw new AccessError(400, 'Save the workspace URL before enabling a provider.');
  if (body.enabled && domains.length === 0) throw new AccessError(400, 'Add at least one email domain before enabling the provider.');

  let issuer: string | null = null;
  let tenantId: string | null = null;
  let entryPoint: string | null = null;
  let idpEntityId: string | null = null;
  let emailAttribute: string | null = null;
  let nameAttribute: string | null = null;
  let allowIdpInitiated = false;
  const clientId = blank(body.clientId);
  const secretInput = blank(body.clientSecret);
  const certInput = blank(body.idpCert);
  const clientSecret = secretInput ?? existing?.clientSecret ?? null;
  const idpCert = certInput ? normalizeCert(certInput) : (existing?.idpCert ?? null);

  if (body.kind === 'entra') {
    tenantId = normalizeTenant(body.tenantId, body.enabled);
    issuer = tenantId ? `https://login.microsoftonline.com/${tenantId}/v2.0` : null;
  } else if (body.kind === 'google') {
    const rawEntity = blank(body.idpEntityId);
    if (rawEntity) {
      const parsed = googleWorkspaceSaml(rawEntity);
      idpEntityId = parsed.entityId;
      entryPoint = parsed.entryPoint;
    } else if (body.enabled) {
      throw new AccessError(400, GOOGLE_ENTITY_MESSAGE);
    }
    allowIdpInitiated = Boolean(body.allowIdpInitiated);
  } else if (body.kind === 'oidc') {
    const rawIssuer = blank(body.issuer);
    issuer = rawIssuer ? absoluteHttpUrl(rawIssuer, 'Enter the issuer URL.') : null;
    if (body.enabled && !issuer) throw new AccessError(400, 'Enter the issuer URL.');
  } else {
    const rawEntry = blank(body.entryPoint);
    entryPoint = rawEntry ? absoluteHttpUrl(rawEntry, 'Enter the identity provider sign-in URL.', true) : null;
    idpEntityId = blank(body.idpEntityId);
    emailAttribute = blank(body.emailAttribute);
    nameAttribute = blank(body.nameAttribute);
    allowIdpInitiated = Boolean(body.allowIdpInitiated);
  }

  if (body.enabled && protocol === 'oidc') {
    if (!clientId) throw new AccessError(400, 'Enter the client id.');
    if (!clientSecret) throw new AccessError(400, 'Enter the client secret.');
    if (!issuer) throw new AccessError(400, 'Enter the issuer URL.');
    await assertDiscovery(issuer, clientId, clientSecret);
  }
  if (body.enabled && body.kind === 'google') {
    if (!idpEntityId || !entryPoint) throw new AccessError(400, GOOGLE_ENTITY_MESSAGE);
    if (!idpCert) throw new AccessError(400, 'Paste the certificate from Google Identity Provider details.');
  }
  if (body.enabled && body.kind === 'saml') {
    if (!entryPoint) throw new AccessError(400, 'Enter the identity provider sign-in URL.');
    if (!idpEntityId) throw new AccessError(400, 'Enter the identity provider entity id.');
    if (!idpCert) throw new AccessError(400, 'Enter the signing certificate.');
  }

  const data = {
    name: body.name.trim(),
    protocol,
    kind: body.kind,
    enabled: body.enabled,
    domains: JSON.stringify(domains),
    issuer: body.kind === 'google' ? null : issuer,
    clientId: body.kind === 'google' ? null : clientId,
    tenantId,
    entryPoint,
    idpEntityId,
    emailAttribute,
    nameAttribute,
    allowIdpInitiated,
    ...(body.kind === 'google' ? { clientSecret: null } : secretInput ? { clientSecret: secretInput } : {}),
    ...(certInput ? { idpCert } : {}),
  };
  const create = { ...data, clientSecret: body.kind === 'google' ? null : secretInput, idpCert };
  return { data, create };
}

function sendAccessError(err: unknown, reply: FastifyReply) {
  if (err instanceof AccessError) {
    reply.status(err.status).send({ error: err.message });
    return true;
  }
  return false;
}

function refuse(reply: FastifyReply, base: string | null, providerId: string, reason: string) {
  console.warn(`sso sign-in refused (${providerId}): ${reason}`);
  if (!base) return reply.status(403).send({ error: SSO_DENIED_MESSAGE });
  return reply.redirect(`${base}/?sso_error=denied`);
}

function callbackUrl(base: string, id: string, requestUrl: string) {
  const incoming = new URL(requestUrl, 'http://localhost');
  const current = new URL(`${base}/api/access/sso/${id}/callback`);
  current.search = incoming.search;
  return current;
}

async function takeState(key: string, providerId: string) {
  return prisma.$transaction(async (tx) => {
    const row = await tx.ssoLogin.findUnique({ where: { key } });
    if (!row || row.providerId !== providerId || row.kind !== 'state') return null;
    await tx.ssoLogin.delete({ where: { id: row.id } });
    if (row.expiresAt.getTime() <= Date.now()) return null;
    return row;
  });
}

function cacheKey(providerId: string, key: string) {
  return `saml:${providerId}:${key}`;
}

function samlCache(providerId: string): CacheProvider {
  return {
    async saveAsync(key, value) {
      const storageKey = cacheKey(providerId, key);
      const expiresAt = new Date(Date.now() + STATE_MS);
      await prisma.ssoLogin.upsert({
        where: { key: storageKey },
        create: { providerId, kind: 'request', key: storageKey, codeVerifier: value, expiresAt },
        update: { codeVerifier: value, expiresAt, kind: 'request' },
      });
      return { value, createdAt: Date.now() };
    },
    async getAsync(key) {
      const row = await prisma.ssoLogin.findUnique({ where: { key: cacheKey(providerId, key) } });
      if (!row || row.expiresAt.getTime() <= Date.now()) return null;
      return row.codeVerifier;
    },
    async removeAsync(key) {
      if (!key) return null;
      const row = await prisma.ssoLogin.findUnique({ where: { key: cacheKey(providerId, key) } });
      if (!row) return null;
      await prisma.ssoLogin.delete({ where: { id: row.id } });
      return row.codeVerifier;
    },
    async consumeAsync(key) {
      return prisma.$transaction(async (tx) => {
        const row = await tx.ssoLogin.findUnique({ where: { key: cacheKey(providerId, key) } });
        if (!row) return null;
        await tx.ssoLogin.delete({ where: { id: row.id } });
        if (row.expiresAt.getTime() <= Date.now()) return null;
        return row.codeVerifier;
      });
    },
    async saveIfAbsentAsync(key, value, expiresAtMs) {
      const storageKey = cacheKey(providerId, key);
      try {
        return await prisma.$transaction(async (tx) => {
          const existing = await tx.ssoLogin.findUnique({ where: { key: storageKey } });
          if (existing) {
            if (existing.expiresAt.getTime() > Date.now()) return false;
            await tx.ssoLogin.delete({ where: { id: existing.id } });
          }
          await tx.ssoLogin.create({
            data: {
              providerId,
              kind: 'assertion',
              key: storageKey,
              codeVerifier: value,
              expiresAt: new Date(expiresAtMs),
            },
          });
          return true;
        });
      } catch (err) {
        const code = err && typeof err === 'object' && 'code' in err ? String(err.code) : '';
        if (code === 'P2002') return false;
        throw err;
      }
    },
  };
}

function samlFor(provider: IdentityProvider, base: string) {
  if (!provider.entryPoint || !provider.idpCert || !provider.idpEntityId) {
    throw new Error('provider is incomplete');
  }
  const entityId = `${base}/api/access/sso/${provider.id}/metadata`;
  return new nodeSaml.SAML({
    issuer: entityId,
    callbackUrl: `${base}/api/access/sso/${provider.id}/acs`,
    entryPoint: provider.entryPoint,
    audience: entityId,
    idpIssuer: provider.idpEntityId,
    idpCert: provider.idpCert,
    // A signed assertion (Google's default, and Entra) or a signed response (Google's
    // "Signed response" option) is accepted. An unsigned assertion is still rejected.
    wantAssertionsSigned: false,
    wantAuthnResponseSigned: false,
    validateInResponseTo: nodeSaml.ValidateInResponseTo.ifPresent,
    rejectReplayedAssertions: true,
    disableRequestedAuthnContext: true,
    identifierFormat: EMAIL_NAMEID,
    acceptedClockSkewMs: 120_000,
    requestIdExpirationPeriodMs: STATE_MS,
    cacheProvider: samlCache(provider.id),
  });
}

function textClaim(record: Record<string, unknown>, name: string): string | null {
  const value = record[name];
  if (typeof value === 'string' && value.trim()) return value.trim();
  return null;
}

function profileFromClaims(claims: Record<string, unknown>, kind: string): TrustProfile {
  const emailClaim = textClaim(claims, 'email');
  const preferred = textClaim(claims, 'preferred_username');
  let email = emailClaim;
  if (kind === 'entra' && !email && preferred?.includes('@')) email = preferred;
  const verified = claims.email_verified;
  let emailVerified: boolean | null = null;
  if (verified === true || verified === 'true') emailVerified = true;
  else if (verified === false || verified === 'false') emailVerified = false;
  return {
    email,
    emailVerified,
    name: textClaim(claims, 'name'),
    givenName: textClaim(claims, 'given_name'),
    familyName: textClaim(claims, 'family_name'),
    tenantId: textClaim(claims, 'tid'),
    hostedDomain: textClaim(claims, 'hd'),
    picture: textClaim(claims, 'picture'),
  };
}

function firstAttr(profile: Profile, names: string[]): string | null {
  for (const name of names) {
    const value = profile[name];
    if (typeof value === 'string' && value.trim()) return value.trim();
    if (Array.isArray(value)) {
      for (const item of value) {
        if (typeof item === 'string' && item.trim()) return item.trim();
      }
    }
  }
  return null;
}

function profileFromSaml(profile: Profile, provider: IdentityProvider): TrustProfile {
  const emailNames = provider.emailAttribute
    ? [provider.emailAttribute, ...SAML_EMAIL_ATTRIBUTES]
    : SAML_EMAIL_ATTRIBUTES;
  const nameNames = provider.nameAttribute
    ? [provider.nameAttribute, ...SAML_NAME_ATTRIBUTES]
    : SAML_NAME_ATTRIBUTES;
  const fromNameId = profile.nameID.includes('@') ? profile.nameID.trim() : null;
  return {
    email: firstAttr(profile, emailNames) ?? fromNameId,
    emailVerified: null,
    name: firstAttr(profile, nameNames),
    givenName: firstAttr(profile, SAML_GIVEN_ATTRIBUTES),
    familyName: firstAttr(profile, SAML_FAMILY_ATTRIBUTES),
    tenantId: null,
    hostedDomain: null,
    picture: firstAttr(profile, SAML_PICTURE_ATTRIBUTES),
  };
}

async function finishSignIn(
  reply: FastifyReply,
  base: string,
  provider: IdentityProvider,
  profile: TrustProfile,
  beginSession: (userId: string) => Promise<string>,
) {
  const reason = identityRefusal(trustOf(provider), profile);
  if (reason) return refuse(reply, base, provider.id, reason);
  const email = profile.email?.trim().toLowerCase() ?? '';
  const user = await provisionIdentityUser(email, identityDisplayName(profile, email), profile.picture ?? null);
  reply.header('set-cookie', await beginSession(user.id));
  return reply.redirect(`${base}/`);
}

async function startOidc(provider: IdentityProvider, base: string, reply: FastifyReply) {
  if (!provider.issuer || !provider.clientId || !provider.clientSecret) throw new Error('provider is incomplete');
  const config = await oidc.discovery(new URL(provider.issuer), provider.clientId, provider.clientSecret);
  const codeVerifier = oidc.randomPKCECodeVerifier();
  const codeChallenge = await oidc.calculatePKCECodeChallenge(codeVerifier);
  const state = oidc.randomState();
  const nonce = oidc.randomNonce();
  await prisma.ssoLogin.create({
    data: {
      providerId: provider.id,
      kind: 'state',
      key: `oidc:${state}`,
      nonce,
      codeVerifier,
      expiresAt: new Date(Date.now() + STATE_MS),
    },
  });
  const redirect = oidc.buildAuthorizationUrl(config, {
    redirect_uri: `${base}/api/access/sso/${provider.id}/callback`,
    scope: 'openid email profile',
    code_challenge: codeChallenge,
    code_challenge_method: 'S256',
    state,
    nonce,
  });
  return reply.redirect(redirect.href);
}

async function startSaml(provider: IdentityProvider, base: string, reply: FastifyReply) {
  const saml = samlFor(provider, base);
  const relay = randomBytes(24).toString('hex');
  const url = await saml.getAuthorizeUrlAsync(relay, undefined);
  await prisma.ssoLogin.create({
    data: {
      providerId: provider.id,
      kind: 'state',
      key: `relay:${relay}`,
      expiresAt: new Date(Date.now() + STATE_MS),
    },
  });
  return reply.redirect(url);
}

function ensureFormParser(server: FastifyInstance) {
  try {
    server.addContentTypeParser('application/x-www-form-urlencoded', { parseAs: 'string' }, (_request, body, done) => {
      try {
        const params = new URLSearchParams(typeof body === 'string' ? body : '');
        const parsed: Record<string, string> = {};
        for (const [key, value] of params) parsed[key] = value;
        done(null, parsed);
      } catch (err) {
        done(err as Error, undefined);
      }
    });
  } catch (err) {
    const code = err && typeof err === 'object' && 'code' in err ? String(err.code) : '';
    if (code !== 'FST_ERR_CTP_ALREADY_PRESENT') throw err;
  }
}

export function registerSsoRoutes(server: FastifyInstance, deps: { beginSession: (userId: string) => Promise<string> }) {
  ensureFormParser(server);
  const app = server.withTypeProvider<ZodTypeProvider>();

  app.get('/access/sso/settings', async () => ({ publicBaseUrl: (await workspaceBase()) ?? '' }));

  app.put('/access/sso/settings', {
    schema: { body: z.object({ publicBaseUrl: z.string().max(300) }) },
  }, async (request, reply) => {
    try {
      const publicBaseUrl = normalizePublicBaseUrl(request.body.publicBaseUrl);
      await prisma.workspaceSettings.upsert({
        where: { id: WORKSPACE_SETTINGS_ID },
        create: { id: WORKSPACE_SETTINGS_ID, brandName: DEFAULT_BRAND_NAME, publicBaseUrl },
        update: { publicBaseUrl },
      });
      return { publicBaseUrl };
    } catch (err) {
      if (sendAccessError(err, reply)) return;
      throw err;
    }
  });

  app.get('/access/sso/providers', async () => {
    return prisma.identityProvider.findMany({
      where: { enabled: true },
      select: { id: true, name: true },
      orderBy: { name: 'asc' },
    });
  });

  app.get('/access/identity-providers', async () => {
    const base = await workspaceBase();
    const rows = await prisma.identityProvider.findMany({ orderBy: { name: 'asc' } });
    return rows.map((row) => presentProvider(row, base));
  });

  app.post('/access/identity-providers', {
    schema: { body: providerBody },
  }, async (request, reply) => {
    try {
      const prepared = await prepareProvider(request.body, null);
      const created = await prisma.identityProvider.create({
        data: { ...prepared.create, ...(request.body.id ? { id: request.body.id } : {}) },
      });
      return presentProvider(created, await workspaceBase());
    } catch (err) {
      if (sendAccessError(err, reply)) return;
      const code = err && typeof err === 'object' && 'code' in err ? String(err.code) : '';
      if (code === 'P2002') return reply.status(400).send({ error: 'Save the provider again. This address was already used.' });
      throw err;
    }
  });

  app.put('/access/identity-providers/:id', {
    schema: { params: z.object({ id: z.string() }), body: providerBody },
  }, async (request, reply) => {
    try {
      const existing = await prisma.identityProvider.findUnique({ where: { id: request.params.id } });
      if (!existing) return reply.status(404).send({ error: 'Identity provider not found' });
      const prepared = await prepareProvider(request.body, existing);
      const updated = await prisma.identityProvider.update({ where: { id: existing.id }, data: prepared.data });
      return presentProvider(updated, await workspaceBase());
    } catch (err) {
      if (sendAccessError(err, reply)) return;
      throw err;
    }
  });

  app.delete('/access/identity-providers/:id', {
    schema: { params: z.object({ id: z.string() }) },
  }, async (request, reply) => {
    const existing = await prisma.identityProvider.findUnique({ where: { id: request.params.id }, select: { id: true } });
    if (!existing) return reply.status(404).send({ error: 'Identity provider not found' });
    await prisma.$transaction([
      prisma.ssoLogin.deleteMany({ where: { providerId: existing.id } }),
      prisma.identityProvider.delete({ where: { id: existing.id } }),
    ]);
    return { ok: true };
  });

  app.get('/access/sso/:id/metadata', {
    schema: { params: z.object({ id: z.string() }) },
  }, async (request, reply) => {
    const provider = await prisma.identityProvider.findUnique({ where: { id: request.params.id } });
    const base = await workspaceBase();
    if (!provider || provider.protocol !== 'saml' || !base) return reply.status(404).send({ error: 'Not found' });
    const xml = nodeSaml.generateServiceProviderMetadata({
      issuer: `${base}/api/access/sso/${provider.id}/metadata`,
      callbackUrl: `${base}/api/access/sso/${provider.id}/acs`,
      wantAssertionsSigned: true,
      identifierFormat: EMAIL_NAMEID,
    });
    return reply.type('application/xml').send(xml);
  });

  app.get('/access/sso/:id/start', {
    schema: { params: z.object({ id: z.string() }) },
  }, async (request, reply) => {
    await prisma.ssoLogin.deleteMany({ where: { expiresAt: { lt: new Date() } } });
    const provider = await prisma.identityProvider.findUnique({ where: { id: request.params.id } });
    const base = await workspaceBase();
    if (!provider || !provider.enabled) {
      return refuse(reply, base, request.params.id, provider ? 'provider is disabled' : 'provider is missing');
    }
    if (!base) return refuse(reply, null, provider.id, 'workspace URL is missing');
    try {
      if (provider.protocol === 'saml') return await startSaml(provider, base, reply);
      return await startOidc(provider, base, reply);
    } catch (err) {
      console.warn(`sso sign-in refused (${provider.id}): ${err instanceof Error ? err.message : 'sign-in failed'}`);
      if (reply.sent) return;
      return reply.redirect(`${base}/?sso_error=denied`);
    }
  });

  app.get('/access/sso/:id/callback', {
    schema: { params: z.object({ id: z.string() }) },
  }, async (request, reply) => {
    const provider = await prisma.identityProvider.findUnique({ where: { id: request.params.id } });
    const base = await workspaceBase();
    if (!provider || !provider.enabled || provider.protocol !== 'oidc') {
      return refuse(reply, base, request.params.id, 'provider is not available');
    }
    if (!base) return refuse(reply, null, provider.id, 'workspace URL is missing');
    const currentUrl = callbackUrl(base, provider.id, request.url);
    const errorCode = currentUrl.searchParams.get('error');
    if (errorCode) return refuse(reply, base, provider.id, `identity provider error ${errorCode}`);
    const state = currentUrl.searchParams.get('state');
    if (!state) return refuse(reply, base, provider.id, 'sign-in state is missing or expired');
    const row = await takeState(`oidc:${state}`, provider.id);
    if (!row?.codeVerifier || !row.nonce) return refuse(reply, base, provider.id, 'sign-in state is missing or expired');
    try {
      if (!provider.issuer || !provider.clientId || !provider.clientSecret) throw new Error('provider is incomplete');
      const config = await oidc.discovery(new URL(provider.issuer), provider.clientId, provider.clientSecret);
      const tokens = await oidc.authorizationCodeGrant(config, currentUrl, {
        pkceCodeVerifier: row.codeVerifier,
        expectedState: state,
        expectedNonce: row.nonce,
      });
      const claims = tokens.claims();
      if (!claims) return refuse(reply, base, provider.id, 'id token is missing');
      const profile = profileFromClaims(claims as unknown as Record<string, unknown>, provider.kind);
      return await finishSignIn(reply, base, provider, profile, deps.beginSession);
    } catch (err) {
      console.warn(`sso sign-in refused (${provider.id}): ${err instanceof Error ? err.message : 'sign-in failed'}`);
      if (reply.sent) return;
      return reply.redirect(`${base}/?sso_error=denied`);
    }
  });

  app.post('/access/sso/:id/acs', {
    schema: {
      params: z.object({ id: z.string() }),
      body: z.object({
        SAMLResponse: z.string().min(1),
        RelayState: z.string().optional(),
      }),
    },
  }, async (request, reply) => {
    const provider = await prisma.identityProvider.findUnique({ where: { id: request.params.id } });
    const base = await workspaceBase();
    if (!provider || !provider.enabled || provider.protocol !== 'saml') {
      return refuse(reply, base, request.params.id, 'provider is not available');
    }
    if (!base) return refuse(reply, null, provider.id, 'workspace URL is missing');
    const relay = request.body.RelayState?.trim() ?? '';
    if (relay) {
      const row = await takeState(`relay:${relay}`, provider.id);
      if (!row) return refuse(reply, base, provider.id, 'sign-in state is missing or expired');
    } else if (!provider.allowIdpInitiated) {
      return refuse(reply, base, provider.id, 'identity provider initiated sign-in is off');
    }
    try {
      const saml = samlFor(provider, base);
      const container: Record<string, string> = { SAMLResponse: request.body.SAMLResponse };
      if (relay) container.RelayState = relay;
      const result = await saml.validatePostResponseAsync(container);
      if (!result.profile) return refuse(reply, base, provider.id, 'the identity provider response was not accepted');
      return await finishSignIn(reply, base, provider, profileFromSaml(result.profile, provider), deps.beginSession);
    } catch (err) {
      console.warn(`sso sign-in refused (${provider.id}): ${err instanceof Error ? err.message : 'sign-in failed'}`);
      if (reply.sent) return;
      return reply.redirect(`${base}/?sso_error=denied`);
    }
  });
}
