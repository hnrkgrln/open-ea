import 'dotenv/config';
import { fastify } from 'fastify';
import { fastifyCors } from '@fastify/cors';
import { PrismaClient } from '@prisma/client';
import { z } from 'zod';
import { serializerCompiler, validatorCompiler, type ZodTypeProvider } from 'fastify-type-provider-zod';
import { suggestApplicationFields } from './applicationSuggestions.js';
import { linkApplicationMentions } from './appLinks.js';
import { buildPortfolioContext } from './llmContext.js';
import { completeConversation, completeLlm, DEFAULT_SYSTEM_PROMPT, defaultTestPrompt, LlmError, LLM_PROVIDER_IDS, LLM_SETTINGS_ID, questionNeedsPortfolio, toPublicLlmProvider } from './llm.js';

const prisma = new PrismaClient();
const server = fastify().withTypeProvider<ZodTypeProvider>();

// ---------------------------------------------------------------------------
// Criticality cascade
// ---------------------------------------------------------------------------
// Capabilities with children inherit `criticality = max(children.criticality)`.
// Applications with linked capabilities inherit `criticality = max(...)`.
// These helpers keep the stored values in sync so diagrams reading the raw DB
// columns see the correct value without recomputing client-side.

const parseCrit = (v: string | null | undefined) => {
  const n = Number(v ?? '');
  return Number.isFinite(n) && n > 0 ? n : 0;
};

function normalizeTimeRationale(value: string | null | undefined): string | null {
  const text = (value ?? '').trim();
  return text.length > 0 ? text : null;
}

const VENDOR_META_KEYS = ['_vendorName', '_vendorUrl', '_vendorSummary'] as const;

function isPublicHttpUrl(value: string): boolean {
  if (!/^https?:\/\//i.test(value)) return false;
  try {
    const parsed = new URL(value);
    return !parsed.username && !parsed.password;
  } catch {
    return false;
  }
}

function readEmbeddedVendor(metadata: string | null | undefined): { name: string; url: string; summary: string } | null {
  if (!metadata) return null;
  try {
    const parsed = JSON.parse(metadata) as unknown;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
    const record = parsed as Record<string, unknown>;
    const name = typeof record._vendorName === 'string' ? record._vendorName.trim() : '';
    const url = typeof record._vendorUrl === 'string' ? record._vendorUrl.trim() : '';
    const summary = typeof record._vendorSummary === 'string' ? record._vendorSummary.trim() : '';
    if (!name || !isPublicHttpUrl(url) || !summary) return null;
    return { name, url, summary };
  } catch {
    return null;
  }
}

function stripEmbeddedVendor(metadata: string): string {
  try {
    const parsed = JSON.parse(metadata) as unknown;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return metadata;
    const record = parsed as Record<string, unknown>;
    for (const key of VENDOR_META_KEYS) delete record[key];
    return JSON.stringify(record);
  } catch {
    return metadata;
  }
}

function applyStoredVendor(data: {
  metadata?: string | null;
  vendorName?: string | null;
  vendorUrl?: string | null;
  vendorSummary?: string | null;
}) {
  const embedded = readEmbeddedVendor(data.metadata);
  if (typeof data.metadata === 'string') data.metadata = stripEmbeddedVendor(data.metadata);
  const explicit = data.vendorName !== undefined || data.vendorUrl !== undefined || data.vendorSummary !== undefined;
  if (!explicit && embedded) {
    data.vendorName = embedded.name;
    data.vendorUrl = embedded.url;
    data.vendorSummary = embedded.summary;
  }
  if (data.vendorName !== undefined) {
    const name = (data.vendorName ?? '').trim();
    data.vendorName = name ? name.slice(0, 200) : null;
  }
  if (data.vendorUrl !== undefined) {
    const url = (data.vendorUrl ?? '').trim();
    data.vendorUrl = isPublicHttpUrl(url) ? url.slice(0, 500) : null;
  }
  if (data.vendorSummary !== undefined) {
    const summary = (data.vendorSummary ?? '').trim();
    data.vendorSummary = summary ? summary.slice(0, 1000) : null;
  }
}

// Recompute the stored criticality of a capability based on its direct children.
// Returns the (possibly-changed) criticality string. No-op for leaves.
async function recomputeCapabilityFromChildren(capabilityId: string): Promise<string | null> {
  const cap = await prisma.capability.findUnique({
    where: { id: capabilityId },
    select: { id: true, criticality: true, children: { select: { criticality: true } } }
  });
  if (!cap) return null;
  if (cap.children.length === 0) return cap.criticality;

  const max = Math.max(...cap.children.map(c => parseCrit(c.criticality)));
  const next = max > 0 ? String(max) : cap.criticality;
  if (next !== cap.criticality) {
    await prisma.capability.update({ where: { id: capabilityId }, data: { criticality: next } });
  }
  return next;
}

// Recompute the stored criticality of an application from its linked capabilities.
// Apps with no capabilities keep their directly-set criticality.
async function recomputeApplicationCriticality(appId: string): Promise<void> {
  const app = await prisma.application.findUnique({
    where: { id: appId },
    select: { id: true, criticality: true, capabilities: { select: { criticality: true } } }
  });
  if (!app || app.capabilities.length === 0) return;
  const max = Math.max(...app.capabilities.map(c => parseCrit(c.criticality)));
  if (max <= 0) return;
  const next = String(max);
  if (next !== app.criticality) {
    await prisma.application.update({ where: { id: appId }, data: { criticality: next } });
  }
}

// Walk up the parent chain from `startCapabilityId`, recomputing each ancestor.
// Returns the set of capability IDs whose criticality changed (used to find
// which apps need re-cascading downstream).
async function cascadeUpFrom(startCapabilityId: string | null | undefined): Promise<Set<string>> {
  const changed = new Set<string>();
  let cursor = startCapabilityId ?? null;
  while (cursor) {
    const node = await prisma.capability.findUnique({
      where: { id: cursor },
      select: { id: true, parentId: true, criticality: true }
    });
    if (!node) break;
    const before = node.criticality;
    const after = await recomputeCapabilityFromChildren(node.id);
    if (after !== before) changed.add(node.id);
    cursor = node.parentId;
  }
  return changed;
}

// Top-level cascade: walk up from one or more capabilities, then propagate any
// ancestor changes down to linked applications.
async function cascadeCapabilityCriticality(...startIds: (string | null | undefined)[]): Promise<void> {
  const changed = new Set<string>();
  for (const id of startIds) {
    if (!id) continue;
    const partial = await cascadeUpFrom(id);
    partial.forEach(x => changed.add(x));
    // The starting capability itself may also affect its apps (its own value
    // changed in this PUT, even if no ancestors changed).
    changed.add(id);
  }
  if (changed.size === 0) return;
  const apps = await prisma.application.findMany({
    where: { capabilities: { some: { id: { in: Array.from(changed) } } } },
    select: { id: true }
  });
  for (const a of apps) {
    await recomputeApplicationCriticality(a.id);
  }
}

// Add (sourceApp, info) and (targetApp, info) into the Application–InformationObject
// processing relation. Add-only: a `connect` on an existing pair is a no-op,
// so this is idempotent and safe to call from cascades and the backfill.
async function connectIntegrationProcessing(
  sourceAppId: string | null | undefined,
  targetAppId: string | null | undefined,
  infoObjectId: string | null | undefined
): Promise<void> {
  if (!infoObjectId) return;
  const appIds = [sourceAppId, targetAppId].filter((x): x is string => !!x);
  if (appIds.length === 0) return;
  await prisma.informationObject.update({
    where: { id: infoObjectId },
    data: { processingApplications: { connect: appIds.map(id => ({ id })) } }
  }).catch((err: any) => {
    // FK miss (app/info deleted out from under us) is not fatal here.
    if (err?.code !== 'P2025') throw err;
  });
}

// Backfill processing connections from existing integrations on startup.
async function backfillProcessing() {
  const ints = await prisma.integration.findMany({
    select: { sourceAppId: true, targetAppId: true, infoObjectId: true }
  });
  for (const i of ints) {
    await connectIntegrationProcessing(i.sourceAppId, i.targetAppId, i.infoObjectId);
  }
  console.log('Processing-relation backfill complete:', ints.length, 'integrations scanned');
}

// One-time backfill: ensure every capability's stored criticality reflects
// max(children.criticality), and every app's reflects max(capabilities.criticality).
// Idempotent — safe to run on every server start.
async function backfillCriticality() {
  // Walk capabilities leaves-first by repeatedly recomputing parents until no
  // value changes. Any DAG with depth N converges in N passes; we bound at 32
  // as a sanity check (real hierarchies are nowhere near that deep).
  const allCaps = await prisma.capability.findMany({ select: { id: true, parentId: true } });
  const parents = new Set(allCaps.filter(c => c.parentId).map(c => c.parentId!));
  // Recompute parents bottom-up. Since we don't have a topological sort, just
  // iterate until stable.
  for (let pass = 0; pass < 32; pass++) {
    let changed = false;
    for (const id of parents) {
      const before = await prisma.capability.findUnique({
        where: { id },
        select: { criticality: true }
      });
      const after = await recomputeCapabilityFromChildren(id);
      if (before && after !== before.criticality) changed = true;
    }
    if (!changed) break;
  }

  const apps = await prisma.application.findMany({ select: { id: true } });
  for (const a of apps) {
    await recomputeApplicationCriticality(a.id);
  }
  console.log('Criticality backfill complete:', allCaps.length, 'capabilities,', apps.length, 'applications');
}

// One-time migration to rename Relation Type to Integration Type
async function migrateMetadata() {
  const relType = await prisma.picklist.findUnique({ where: { name: 'relation_type' } });
  if (relType) {
    await prisma.picklist.update({
      where: { name: 'relation_type' },
      data: { name: 'integration_type', label: 'Integration Type' }
    });
    console.log('Migrated relation_type picklist to integration_type');
  }
}
migrateMetadata().catch(console.error);
backfillCriticality().catch(console.error);
backfillProcessing().catch(console.error);

server.setValidatorCompiler(validatorCompiler);
server.setSerializerCompiler(serializerCompiler);

server.register(fastifyCors, {
  origin: true,
});

server.setErrorHandler((error: any, request, reply) => {
  console.error('FASTIFY ERROR:', error);
  // Validation errors from fastify-type-provider-zod should surface as 400, not 500.
  const status = error?.statusCode && error.statusCode >= 400 && error.statusCode < 600
    ? error.statusCode
    : (error?.validation ? 400 : 500);
  if (error instanceof Error) {
    reply.status(status).send({
      error: error.message || 'Internal Server Error',
      stack: error.stack,
      name: error.name
    });
  } else {
    reply.status(status).send({ error: 'Unknown Error' });
  }
});

// Applications API
server.get('/applications', async () => {
  return prisma.application.findMany({
    include: {
      capabilities: true,
      processedInformationObjects: true,
      sourceOf: { include: { targetApp: true, payload: true } },
      targetOf: { include: { sourceApp: true, payload: true } },
      ownerOrg: true
    },
    orderBy: { name: 'asc' }
  });
});

server.get('/applications/:id', {
  schema: {
    params: z.object({ id: z.string() }),
  },
}, async (request, reply) => {
  try {
    const app = await prisma.application.findUnique({
      where: { id: request.params.id },
      include: {
        capabilities: true,
        processedInformationObjects: true,
        sourceOf: { include: { targetApp: true, payload: true } },
        targetOf: { include: { sourceApp: true, payload: true } },
        ownerOrg: true
      }
    });
    if (!app) return reply.status(404).send({ error: 'Application not found' });
    return app;
  } catch (err) {
    return reply.status(404).send({ error: 'Application not found' });
  }
});

server.post('/applications', {
  schema: {
    body: z.object({
      id: z.string().optional(),
      name: z.string(),
      description: z.string().optional(),
      owner: z.string().optional(),
      ownerOrgId: z.string().optional().nullable(),
      lifecycle: z.string().optional(),
      lifecycleStartDate: z.string().datetime().optional().nullable(),
      lifecycleEndDate: z.string().datetime().optional().nullable(),
      contractStartDate: z.string().datetime().optional().nullable(),
      contractEndDate: z.string().datetime().optional().nullable(),
      contractDetails: z.string().optional().nullable(),
      vendorName: z.string().max(200).optional().nullable(),
      vendorUrl: z.string().max(500).optional().nullable(),
      vendorSummary: z.string().max(1000).optional().nullable(),
      type: z.string().optional(),
      criticality: z.string().optional(),
      cost: z.string().optional(),
      functionalFit: z.string().optional(),
      technicalFit: z.string().optional(),
      timeRationale: z.string().max(2000).optional().nullable(),
      metadata: z.string().optional(),
      references: z.string().optional().nullable(),
      capabilityIds: z.array(z.string()).optional(),
      processedInformationObjectIds: z.array(z.string()).optional(),
    }),
  },
}, async (request) => {
  console.log('POST /applications - Body:', JSON.stringify(request.body));
  const { capabilityIds, processedInformationObjectIds, ...data } = request.body;
  if (data.timeRationale !== undefined) data.timeRationale = normalizeTimeRationale(data.timeRationale);
  applyStoredVendor(data);

  // Filter for only existing capability IDs to prevent Prisma crash (P2025)
  let validIds: string[] = [];
  if (capabilityIds && capabilityIds.length > 0) {
    const existing = await prisma.capability.findMany({
      where: { id: { in: capabilityIds } },
      select: { id: true }
    });
    validIds = existing.map(c => c.id);
  }

  let validInfoIds: string[] = [];
  if (processedInformationObjectIds && processedInformationObjectIds.length > 0) {
    const existing = await prisma.informationObject.findMany({
      where: { id: { in: processedInformationObjectIds } },
      select: { id: true }
    });
    validInfoIds = existing.map(io => io.id);
  }

  const created = await prisma.application.create({
    data: {
      ...data,
      capabilities: validIds.length > 0 ? {
        connect: validIds.map(id => ({ id }))
      } : undefined,
      processedInformationObjects: validInfoIds.length > 0 ? {
        connect: validInfoIds.map(id => ({ id }))
      } : undefined
    },
  });
  // If linked to capabilities, the app's stored criticality is the max — apply
  // that server-side so a stale UI can't write the wrong value.
  if (validIds.length > 0) await recomputeApplicationCriticality(created.id);
  const fullApp = await prisma.application.findUnique({
    where: { id: created.id },
    include: {
      capabilities: true,
      processedInformationObjects: true,
      sourceOf: { include: { targetApp: true, payload: true } },
      targetOf: { include: { sourceApp: true, payload: true } },
      ownerOrg: true
    }
  });
  return fullApp || created;
});

server.put('/applications/:id', {
  schema: {
    params: z.object({ id: z.string() }),
    body: z.object({
      name: z.string().optional(),
      description: z.string().optional(),
      owner: z.string().optional(),
      ownerOrgId: z.string().optional().nullable(),
      lifecycle: z.string().optional(),
      lifecycleStartDate: z.string().datetime().optional().nullable(),
      lifecycleEndDate: z.string().datetime().optional().nullable(),
      contractStartDate: z.string().datetime().optional().nullable(),
      contractEndDate: z.string().datetime().optional().nullable(),
      contractDetails: z.string().optional().nullable(),
      vendorName: z.string().max(200).optional().nullable(),
      vendorUrl: z.string().max(500).optional().nullable(),
      vendorSummary: z.string().max(1000).optional().nullable(),
      type: z.string().optional(),
      criticality: z.string().optional(),
      cost: z.string().optional(),
      functionalFit: z.string().optional(),
      technicalFit: z.string().optional(),
      timeRationale: z.string().max(2000).optional().nullable(),
      metadata: z.string().optional(),
      references: z.string().optional().nullable(),
      capabilityIds: z.array(z.string()).optional(),
      processedInformationObjectIds: z.array(z.string()).optional(),
    }),
  },
}, async (request, reply) => {
  const { id } = request.params;
  console.log('PUT /applications/:id - Body:', JSON.stringify(request.body));
  const { capabilityIds, processedInformationObjectIds, ...data } = request.body;
  if (data.timeRationale !== undefined) data.timeRationale = normalizeTimeRationale(data.timeRationale);
  applyStoredVendor(data);

  let validIds: string[] = [];
  if (capabilityIds && capabilityIds.length > 0) {
    const existing = await prisma.capability.findMany({
      where: { id: { in: capabilityIds } },
      select: { id: true }
    });
    validIds = existing.map(c => c.id);
  }

  let validInfoIds: string[] = [];
  if (processedInformationObjectIds && processedInformationObjectIds.length > 0) {
    const existing = await prisma.informationObject.findMany({
      where: { id: { in: processedInformationObjectIds } },
      select: { id: true }
    });
    validInfoIds = existing.map(io => io.id);
  }

  try {
    const updated = await prisma.application.update({
      where: { id },
      data: {
        ...data,
        capabilities: capabilityIds ? {
          set: validIds.map(id => ({ id }))
        } : undefined,
        processedInformationObjects: processedInformationObjectIds ? {
          set: validInfoIds.map(id => ({ id }))
        } : undefined
      },
    });
    // Inheritance: apps with capabilities take max(capabilities.criticality).
    // Re-apply server-side after every update so direct API edits or stale
    // clients can't drift the stored value.
    await recomputeApplicationCriticality(updated.id);
    const fullApp = await prisma.application.findUnique({
      where: { id: updated.id },
      include: {
        capabilities: true,
        processedInformationObjects: true,
        sourceOf: { include: { targetApp: true, payload: true } },
        targetOf: { include: { sourceApp: true, payload: true } },
        ownerOrg: true
      }
    });
    return fullApp || updated;
  } catch (err: any) {
    if (err.code === 'P2025') return reply.status(404).send({ error: 'Application not found' });
    throw err;
  }
});

server.delete('/applications/:id', {
  schema: {
    params: z.object({ id: z.string() }),
  },
}, async (request, reply) => {
  try {
    return await prisma.application.delete({
      where: { id: request.params.id },
    });
  } catch (err: any) {
    if (err.code === 'P2025') return reply.status(404).send({ error: 'Application not found' });
    throw err;
  }
});

// Capabilities API
server.get('/capabilities', async (request) => {
  const caps = await prisma.capability.findMany({
    include: {
      applications: {
        include: { ownerOrg: true }
      },
    },
  });
  // Natural sort so "10. Foo" comes after "9. Foo" — matches the numeric
  // prefix convention used for Excel traceability.
  caps.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
  return caps;
});

server.get('/capabilities/:id', {
  schema: {
    params: z.object({ id: z.string() }),
  },
}, async (request, reply) => {
  try {
    const cap = await prisma.capability.findUnique({
      where: { id: request.params.id },
      include: { 
        applications: {
          include: { ownerOrg: true }
        },
        strategicGoals: {
          select: { id: true, name: true },
          orderBy: { name: 'asc' },
        },
      }
    });
    if (!cap) return reply.status(404).send({ error: 'Capability not found' });
    return cap;
  } catch (err) {
    return reply.status(404).send({ error: 'Capability not found' });
  }
});

server.post('/capabilities', {
  schema: {
    body: z.object({
      id: z.string().optional(),
      name: z.string(),
      description: z.string().optional(),
      parentId: z.string().optional().nullable(),
      metadata: z.string().optional(),
      references: z.string().optional().nullable(),
      criticality: z.string().optional(),
      applicationIds: z.array(z.string()).optional(),
    }),
  },
}, async (request) => {
  const { applicationIds, ...data } = request.body;
  if (data.parentId === '') data.parentId = null;

  // Resilience: Check if parent exists
  if (data.parentId) {
    const parent = await prisma.capability.findUnique({ where: { id: data.parentId } });
    if (!parent) data.parentId = null;
  }

  let validIds: string[] = [];
  if (applicationIds && applicationIds.length > 0) {
    const existing = await prisma.application.findMany({
      where: { id: { in: applicationIds } },
      select: { id: true }
    });
    validIds = existing.map(a => a.id);
  }

  const created = await prisma.capability.create({
    data: {
      ...data,
      applications: validIds.length > 0 ? {
        connect: validIds.map(id => ({ id }))
      } : undefined
    },
  });
  // New capability under a parent → parent chain may need recompute.
  await cascadeCapabilityCriticality(created.parentId);
  return created;
});

server.put('/capabilities/:id', {
  schema: {
    params: z.object({ id: z.string() }),
    body: z.object({
      name: z.string().optional(),
      description: z.string().optional(),
      parentId: z.string().optional().nullable(),
      metadata: z.string().optional(),
      references: z.string().optional().nullable(),
      criticality: z.string().optional(),
      applicationIds: z.array(z.string()).optional(),
    }),
  },
}, async (request, reply) => {
  const { id } = request.params;
  const { applicationIds, ...data } = request.body;
  if (data.parentId === '') data.parentId = null;

  // Resilience: Check if parent exists
  if (data.parentId) {
    const parent = await prisma.capability.findUnique({ where: { id: data.parentId } });
    if (!parent) data.parentId = null;
  }

  let validIds: string[] = [];
  if (applicationIds && applicationIds.length > 0) {
    const existing = await prisma.application.findMany({
      where: { id: { in: applicationIds } },
      select: { id: true }
    });
    validIds = existing.map(a => a.id);
  }

  // Capture the old parent before update so we can cascade up the old branch
  // too if reparenting.
  const before = await prisma.capability.findUnique({
    where: { id },
    select: { parentId: true, children: { select: { id: true, criticality: true } } }
  });

  // If this capability has children, its stored criticality must equal
  // max(children.criticality). Override whatever was submitted — the UI locks
  // the field, but defend against direct API calls or stale clients.
  if (before && before.children.length > 0) {
    const max = Math.max(...before.children.map(c => parseCrit(c.criticality)));
    if (max > 0) data.criticality = String(max);
  }

  try {
    const updated = await prisma.capability.update({
      where: { id },
      data: {
        ...data,
        applications: applicationIds ? {
          set: validIds.map(id => ({ id }))
        } : undefined
      },
    });

    // Cascade up from the new parent (and old parent if reparented) plus this
    // capability itself, then propagate to linked apps.
    const startIds: (string | null | undefined)[] = [updated.id, updated.parentId];
    if (before && before.parentId && before.parentId !== updated.parentId) {
      startIds.push(before.parentId);
    }
    await cascadeCapabilityCriticality(...startIds);

    return updated;
  } catch (err: any) {
    if (err.code === 'P2025') return reply.status(404).send({ error: 'Capability not found' });
    throw err;
  }
});

server.delete('/capabilities/:id', {
  schema: {
    params: z.object({ id: z.string() }),
  },
}, async (request, reply) => {
  try {
    // Capture parent + linked apps before delete so we can recompute.
    const existing = await prisma.capability.findUnique({
      where: { id: request.params.id },
      select: { parentId: true, applications: { select: { id: true } } }
    });
    const deleted = await prisma.capability.delete({
      where: { id: request.params.id },
    });
    // Walk up from the now-orphaned parent.
    await cascadeCapabilityCriticality(existing?.parentId);
    // Apps that linked through the deleted capability also need recompute.
    if (existing) {
      for (const a of existing.applications) {
        await recomputeApplicationCriticality(a.id);
      }
    }
    return deleted;
  } catch (err: any) {
    if (err.code === 'P2025') return reply.status(404).send({ error: 'Capability not found' });
    throw err;
  }
});

// Organizations API
server.get('/organizations', async (request, reply) => {
  console.log('GET /organizations');
  try {
    const orgs = await prisma.organization.findMany({
      include: { 
        parent: true, 
        children: true,
        ownedApplications: true,
        informationObjects: true,
        supportedCapabilities: { select: { id: true, name: true, criticality: true } },
        _count: {
          select: {
            ownedApplications: true,
            informationObjects: true
          }
        }
      },
      orderBy: { name: 'asc' }
    });
    console.log('GET /organizations SUCCESS - Found:', orgs.length);
    return orgs;
  } catch (err) {
    console.error('GET /organizations ERROR:', err);
    throw err;
  }
});

server.get('/organizations/:id', {
  schema: { params: z.object({ id: z.string() }) },
}, async (request, reply) => {
  try {
    const org = await prisma.organization.findUnique({
      where: { id: request.params.id },
      include: { 
        parent: true, 
        children: true, 
        ownedApplications: true,
        supportedCapabilities: { select: { id: true, name: true, criticality: true } },
        informationObjects: { 
          include: { 
            integrations: { include: { sourceApp: true, targetApp: true } } 
          } 
        } 
      }
    });
    if (!org) return reply.status(404).send({ error: 'Organization not found' });
    return org;
  } catch (err) {
    return reply.status(404).send({ error: 'Organization not found' });
  }
});

server.post('/organizations', {
  schema: {
    body: z.object({
      id: z.string().optional(),
      name: z.string(),
      description: z.string().optional(),
      type: z.string().optional(),
      parentId: z.string().optional().nullable(),
      references: z.string().optional().nullable(),
      capabilityIds: z.array(z.string()).optional(),
    }),
  },
}, async (request) => {
  const { capabilityIds, ...data } = request.body;
  if (data.parentId === '') data.parentId = null;
  let validIds: string[] = [];
  if (capabilityIds && capabilityIds.length > 0) {
    const existing = await prisma.capability.findMany({
      where: { id: { in: capabilityIds } },
      select: { id: true }
    });
    validIds = existing.map(capability => capability.id);
  }
  return prisma.organization.create({
    data: {
      ...data,
      supportedCapabilities: validIds.length > 0 ? { connect: validIds.map(id => ({ id })) } : undefined,
    },
  });
});

server.put('/organizations/:id', {
  schema: {
    params: z.object({ id: z.string() }),
    body: z.object({
      name: z.string().optional(),
      description: z.string().optional(),
      type: z.string().optional(),
      parentId: z.string().optional().nullable(),
      references: z.string().optional().nullable(),
      capabilityIds: z.array(z.string()).optional(),
    }),
  },
}, async (request, reply) => {
  const { capabilityIds, ...data } = request.body;
  if (data.parentId === '') data.parentId = null;
  let validIds: string[] = [];
  if (capabilityIds && capabilityIds.length > 0) {
    const existing = await prisma.capability.findMany({
      where: { id: { in: capabilityIds } },
      select: { id: true }
    });
    validIds = existing.map(capability => capability.id);
  }
  try {
    return await prisma.organization.update({
      where: { id: request.params.id },
      data: {
        ...data,
        supportedCapabilities: capabilityIds ? { set: validIds.map(id => ({ id })) } : undefined,
      }
    });
  } catch (err: any) {
    if (err.code === 'P2025' || err.code === 'P2023') return reply.status(404).send({ error: 'Organization not found' });
    throw err;
  }
});

server.delete('/organizations/:id', {
  schema: { params: z.object({ id: z.string() }) },
}, async (request, reply) => {
  try {
    return await prisma.organization.delete({ where: { id: request.params.id } });
  } catch (err: any) {
    if (err.code === 'P2025' || err.code === 'P2023') return reply.status(404).send({ error: 'Organization not found' });
    throw err;
  }
});

const strategicGoalInclude = {
  capabilities: { select: { id: true, name: true, criticality: true } },
} as const;

async function existingCapabilityIds(ids: string[] | undefined) {
  if (!ids || ids.length === 0) return [];
  const existing = await prisma.capability.findMany({
    where: { id: { in: ids } },
    select: { id: true },
  });
  return existing.map((capability) => capability.id);
}

// A missing parent is dropped. A parent that is the goal itself, or one of its
// sub-goals, keeps the current parent so the tree cannot cycle.
async function resolveGoalParent(goalId: string | undefined, parentId: string | null | undefined) {
  if (parentId === undefined) return undefined;
  if (!parentId) return null;
  const rows = await prisma.strategicGoal.findMany({ select: { id: true, parentId: true } });
  if (!rows.some((row) => row.id === parentId)) return null;
  if (!goalId) return parentId;
  const parentOf = new Map(rows.map((row) => [row.id, row.parentId]));
  const seen = new Set<string>();
  let cursor: string | null | undefined = parentId;
  while (cursor) {
    if (cursor === goalId) return parentOf.get(goalId) ?? null;
    if (seen.has(cursor)) break;
    seen.add(cursor);
    cursor = parentOf.get(cursor) ?? null;
  }
  return parentId;
}

server.get('/strategic-goals', async () => {
  const goals = await prisma.strategicGoal.findMany({
    include: strategicGoalInclude,
    orderBy: { name: 'asc' },
  });
  goals.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
  return goals;
});

server.get('/strategic-goals/:id', {
  schema: { params: z.object({ id: z.string() }) },
}, async (request, reply) => {
  const goal = await prisma.strategicGoal.findUnique({
    where: { id: request.params.id },
    include: strategicGoalInclude,
  });
  if (!goal) return reply.status(404).send({ error: 'Strategic goal not found' });
  return goal;
});

server.post('/strategic-goals', {
  schema: {
    body: z.object({
      id: z.string().optional(),
      name: z.string(),
      description: z.string().optional().nullable(),
      references: z.string().optional().nullable(),
      parentId: z.string().optional().nullable(),
      capabilityIds: z.array(z.string()).optional(),
    }),
  },
}, async (request) => {
  const { capabilityIds, ...data } = request.body;
  data.parentId = await resolveGoalParent(undefined, data.parentId === '' ? null : data.parentId);
  const validIds = await existingCapabilityIds(capabilityIds);
  return prisma.strategicGoal.create({
    data: {
      ...data,
      capabilities: validIds.length > 0 ? { connect: validIds.map((id) => ({ id })) } : undefined,
    },
    include: strategicGoalInclude,
  });
});

server.put('/strategic-goals/:id', {
  schema: {
    params: z.object({ id: z.string() }),
    body: z.object({
      name: z.string().optional(),
      description: z.string().optional().nullable(),
      references: z.string().optional().nullable(),
      parentId: z.string().optional().nullable(),
      capabilityIds: z.array(z.string()).optional(),
    }),
  },
}, async (request, reply) => {
  const { capabilityIds, ...data } = request.body;
  if (data.parentId !== undefined) {
    data.parentId = await resolveGoalParent(request.params.id, data.parentId === '' ? null : data.parentId);
  }
  const validIds = capabilityIds === undefined ? undefined : await existingCapabilityIds(capabilityIds);
  try {
    return await prisma.strategicGoal.update({
      where: { id: request.params.id },
      data: {
        ...data,
        capabilities: validIds ? { set: validIds.map((id) => ({ id })) } : undefined,
      },
      include: strategicGoalInclude,
    });
  } catch (err: any) {
    if (err.code === 'P2025' || err.code === 'P2023') return reply.status(404).send({ error: 'Strategic goal not found' });
    throw err;
  }
});

server.delete('/strategic-goals/:id', {
  schema: { params: z.object({ id: z.string() }) },
}, async (request, reply) => {
  try {
    return await prisma.strategicGoal.delete({ where: { id: request.params.id } });
  } catch (err: any) {
    if (err.code === 'P2025' || err.code === 'P2023') return reply.status(404).send({ error: 'Strategic goal not found' });
    throw err;
  }
});

// Information Objects API
server.get('/information-objects', async (request, reply) => {
  console.log('GET /information-objects');
  try {
    const info = await prisma.informationObject.findMany({
      include: {
        businessOwner: true,
        appOwner: true,
        processingApplications: true,
        integrations: { include: { sourceApp: true, targetApp: true } }
      },
      orderBy: { name: 'asc' }
    });
    console.log('GET /information-objects SUCCESS - Found:', info.length);
    return info;
  } catch (err) {
    console.error('GET /information-objects ERROR:', err);
    throw err;
  }
});

server.get('/information-objects/:id', {
  schema: { params: z.object({ id: z.string() }) },
}, async (request, reply) => {
  try {
    const io = await prisma.informationObject.findUnique({
      where: { id: request.params.id },
      include: { businessOwner: true, appOwner: true, processingApplications: true, integrations: { include: { sourceApp: true, targetApp: true } } }
    });
    if (!io) return reply.status(404).send({ error: 'Information Object not found' });
    return io;
  } catch (err) {
    return reply.status(404).send({ error: 'Information Object not found' });
  }
});

server.post('/information-objects', {
  schema: {
    body: z.object({
      id: z.string().optional(),
      name: z.string(),
      aliases: z.string().optional(),
      description: z.string().optional(),
      confidentiality: z.string().optional(),
      integrity: z.string().optional(),
      availability: z.string().optional(),
      piiCategory: z.string().optional(),
      type: z.string().optional(),
      metadata: z.string().optional(),
      references: z.string().optional().nullable(),
      businessOwnerId: z.string().optional().nullable(),
      appOwnerId: z.string().optional().nullable(),
    }),
  },
}, async (request) => {
  return prisma.informationObject.create({ data: request.body });
});

server.put('/information-objects/:id', {
  schema: {
    params: z.object({ id: z.string() }),
    body: z.object({
      name: z.string().optional(),
      aliases: z.string().optional(),
      description: z.string().optional(),
      confidentiality: z.string().optional(),
      integrity: z.string().optional(),
      availability: z.string().optional(),
      piiCategory: z.string().optional(),
      type: z.string().optional(),
      metadata: z.string().optional(),
      references: z.string().optional().nullable(),
      businessOwnerId: z.string().optional().nullable(),
      appOwnerId: z.string().optional().nullable(),
    }),
  },
}, async (request, reply) => {
  try {
    return await prisma.informationObject.update({
      where: { id: request.params.id },
      data: request.body
    });
  } catch (err: any) {
    if (err.code === 'P2025' || err.code === 'P2023') return reply.status(404).send({ error: 'Information Object not found' });
    throw err;
  }
});

server.delete('/information-objects/:id', {
  schema: { params: z.object({ id: z.string() }) },
}, async (request, reply) => {
  try {
    return await prisma.informationObject.delete({ where: { id: request.params.id } });
  } catch (err: any) {
    if (err.code === 'P2025' || err.code === 'P2023') return reply.status(404).send({ error: 'Information Object not found' });
    throw err;
  }
});

// Integrations API
server.get('/integrations', async (request, reply) => {
  console.log('GET /integrations');
  try {
    const integrations = await prisma.integration.findMany({
      include: {
        sourceApp: true,
        targetApp: true,
        payload: true,
      },
    });
    console.log('GET /integrations SUCCESS - Found:', integrations.length);
    return integrations;
  } catch (err) {
    console.error('GET /integrations ERROR:', err);
    throw err;
  }
});

server.get('/integrations/:id', {
  schema: { params: z.object({ id: z.string() }) },
}, async (request, reply) => {
  try {
    const integration = await prisma.integration.findUnique({
      where: { id: request.params.id },
      include: { sourceApp: true, targetApp: true, payload: true }
    });
    if (!integration) return reply.status(404).send({ error: 'Integration not found' });
    return integration;
  } catch (err) {
    return reply.status(404).send({ error: 'Integration not found' });
  }
});

server.post('/integrations', {
  schema: {
    body: z.object({
      id: z.string().optional(),
      name: z.string().optional(),
      description: z.string().optional(),
      sourceAppId: z.string(),
      targetAppId: z.string(),
      infoObjectId: z.string().optional().nullable(),
      pattern: z.string().optional(),
      frequency: z.string().optional(),
      crud: z.string().optional(),
      references: z.string().optional().nullable(),
    }),
  },
}, async (request, reply) => {
  const { sourceAppId, targetAppId } = request.body;
  const [source, target] = await Promise.all([
    prisma.application.findUnique({ where: { id: sourceAppId } }),
    prisma.application.findUnique({ where: { id: targetAppId } })
  ]);

  if (!source || !target) {
    return reply.status(400).send({ 
      error: 'One or both applications do not exist. Integration cannot be created.',
      sourceExists: !!source,
      targetExists: !!target
    });
  }

  const created = await prisma.integration.create({
    data: request.body,
  });
  // Convenience cascade: an integration implies both apps process the payload.
  // Add-only — manual edits to the processing relation must survive integration
  // changes and deletes.
  await connectIntegrationProcessing(created.sourceAppId, created.targetAppId, created.infoObjectId);
  return created;
});

server.put('/integrations/:id', {
  schema: {
    params: z.object({ id: z.string() }),
    body: z.object({
      name: z.string().optional(),
      description: z.string().optional(),
      sourceAppId: z.string().optional(),
      targetAppId: z.string().optional(),
      infoObjectId: z.string().optional().nullable(),
      pattern: z.string().optional(),
      frequency: z.string().optional(),
      crud: z.string().optional(),
      references: z.string().optional().nullable(),
    }),
  },
}, async (request, reply) => {
  const { sourceAppId, targetAppId } = request.body;
  
  if (sourceAppId || targetAppId) {
    const checks = [];
    if (sourceAppId) checks.push(prisma.application.findUnique({ where: { id: sourceAppId } }));
    if (targetAppId) checks.push(prisma.application.findUnique({ where: { id: targetAppId } }));
    
    const results = await Promise.all(checks);
    if (results.some(r => !r)) {
      return reply.status(400).send({ error: 'One or more specified applications do not exist.' });
    }
  }

  try {
    const updated = await prisma.integration.update({
      where: { id: request.params.id },
      data: request.body,
    });
    // Add new processing connections implied by the (possibly updated)
    // source/target/payload. Never remove — manual edits must persist.
    await connectIntegrationProcessing(updated.sourceAppId, updated.targetAppId, updated.infoObjectId);
    return updated;
  } catch (err: any) {
    if (err.code === 'P2025') return reply.status(404).send({ error: 'Integration not found' });
    throw err;
  }
});

server.delete('/integrations/:id', {
  schema: {
    params: z.object({ id: z.string() }),
  },
}, async (request, reply) => {
  try {
    return await prisma.integration.delete({
      where: { id: request.params.id },
    });
  } catch (err: any) {
    if (err.code === 'P2025') return reply.status(404).send({ error: 'Integration not found' });
    throw err;
  }
});

// Picklists API
server.get('/picklists', async () => {
  return prisma.picklist.findMany({
    include: {
      options: {
        orderBy: { order: 'asc' }
      }
    }
  });
});

server.post('/picklists/:id/options', {
  schema: {
    params: z.object({ id: z.string() }),
    body: z.object({
      value: z.string(),
      label: z.string(),
      description: z.string().nullish(),
      color: z.string().nullish(),
      order: z.number().optional(),
    }).passthrough(),
  },
}, async (request) => {
  return prisma.picklistOption.create({
    data: {
      value: request.body.value,
      label: request.body.label,
      description: request.body.description ?? null,
      color: request.body.color ?? null,
      order: request.body.order ?? 0,
      picklistId: request.params.id,
    },
  });
});

server.put('/picklists/:id/options', {
  schema: {
    params: z.object({ id: z.string() }),
    body: z.array(z.object({
      value: z.string(),
      label: z.string(),
      description: z.string().nullish(),
      color: z.string().nullish(),
      order: z.number().optional(),
    }).passthrough()),
  },
}, async (request) => {
  const { id } = request.params;
  return prisma.$transaction(async (tx) => {
    await tx.picklistOption.deleteMany({ where: { picklistId: id } });
    return tx.picklist.update({
      where: { id },
      data: {
        options: {
          create: request.body.map((opt, i) => ({
            value: opt.value,
            label: opt.label,
            description: opt.description ?? null,
            color: opt.color ?? null,
            order: opt.order ?? (i + 1)
          }))
        }
      },
      include: { options: { orderBy: { order: 'asc' } } }
    });
  });
});

server.delete('/picklist-options/:id', {
  schema: {
    params: z.object({ id: z.string() }),
  },
}, async (request) => {
  return prisma.picklistOption.delete({
    where: { id: request.params.id },
  });
});

// Metadata Definitions API
server.get('/metadata-definitions', async () => {
  return prisma.metadataDefinition.findMany({
    orderBy: { createdAt: 'asc' }
  });
});

server.post('/metadata-definitions', {
  schema: {
    body: z.object({
      entityType: z.string(),
      fieldName: z.string(),
      fieldType: z.string(),
      label: z.string(),
      required: z.boolean().optional(),
      min: z.number().optional().nullable(),
      max: z.number().optional().nullable(),
      scaleType: z.string().optional().nullable(),
    }),
  },
}, async (request) => {
  return prisma.metadataDefinition.create({
    data: request.body,
  });
});

server.put('/metadata-definitions/:id', {
  schema: {
    params: z.object({ id: z.string() }),
    body: z.object({
      entityType: z.string().optional(),
      fieldName: z.string().optional(),
      fieldType: z.string().optional(),
      label: z.string().optional(),
      required: z.boolean().optional(),
      min: z.number().optional().nullable(),
      max: z.number().optional().nullable(),
      scaleType: z.string().optional().nullable(),
    }),
  },
}, async (request) => {
  return prisma.metadataDefinition.update({
    where: { id: request.params.id },
    data: request.body,
  });
});

server.delete('/metadata-definitions/:id', {
  schema: {
    params: z.object({ id: z.string() }),
  },
}, async (request) => {
  const { id } = request.params;
  
  return prisma.$transaction(async (tx) => {
    // 1. Find the definition to know entityType and fieldName
    const def = await tx.metadataDefinition.findUnique({ where: { id } });
    if (!def) return { success: false };

    // 2. Remove from entities
    if (def.entityType === 'Application') {
      const apps = await tx.application.findMany({
        where: { metadata: { contains: def.fieldName } }
      });
      for (const app of apps) {
        try {
          const meta = JSON.parse(app.metadata || '{}');
          if (meta[def.fieldName] !== undefined) {
            delete meta[def.fieldName];
            await tx.application.update({
              where: { id: app.id },
              data: { metadata: JSON.stringify(meta) }
            });
          }
        } catch (e) { /* ignore parse errors */ }
      }
    } else if (def.entityType === 'Capability') {
      const caps = await tx.capability.findMany({
        where: { metadata: { contains: def.fieldName } }
      });
      for (const cap of caps) {
        try {
          const meta = JSON.parse(cap.metadata || '{}');
          if (meta[def.fieldName] !== undefined) {
            delete meta[def.fieldName];
            await tx.capability.update({
              where: { id: cap.id },
              data: { metadata: JSON.stringify(meta) }
            });
          }
        } catch (e) { /* ignore parse errors */ }
      }
    }

    // 3. Delete the definition
    return tx.metadataDefinition.delete({ where: { id } });
  });
});

const DEFAULT_BRAND_NAME = 'OpenEA';
const WORKSPACE_SETTINGS_ID = 'default';
const NATIVE_FIELD_IDS = [
  'description',
  'vendorName',
  'vendorUrl',
  'vendorSummary',
  'ownerOrg',
  'lifecycleStart',
  'lifecycleEnd',
  'contractStart',
  'contractEnd',
  'contractDetails',
  'timeRationale',
  'capabilities',
  'processedInformation',
  'integrations',
  'references',
  'capability.description',
  'capability.parent',
  'capability.applications',
  'capability.references',
  'organization.description',
  'organization.parent',
  'organization.capabilities',
  'organization.references',
  'information.aliases',
  'information.description',
  'information.businessOwner',
  'information.sourceOfTruth',
  'information.references',
  'integration.description',
  'integration.payload',
  'integration.references',
  'strategicGoal.description',
  'strategicGoal.parent',
  'strategicGoal.capabilities',
  'strategicGoal.references',
] as const;

function parseDisabledNativeFields(raw: unknown): string[] {
  const values = typeof raw === 'string'
    ? (() => { try { return JSON.parse(raw); } catch { return []; } })()
    : raw;
  if (!Array.isArray(values)) return [];
  const allowed = new Set<string>(NATIVE_FIELD_IDS);
  return [...new Set(values.filter((id): id is string => typeof id === 'string' && allowed.has(id)))];
}

function workspaceResponse(row: { brandName: string; disabledNativeFields?: string | null } | null) {
  return {
    brandName: row?.brandName?.trim() || DEFAULT_BRAND_NAME,
    disabledNativeFields: parseDisabledNativeFields(row?.disabledNativeFields),
  };
}

server.get('/workspace', async () => {
  const row = await prisma.workspaceSettings.findUnique({ where: { id: WORKSPACE_SETTINGS_ID } });
  return workspaceResponse(row);
});

server.put('/workspace', {
  schema: {
    body: z.object({
      brandName: z.string().trim().min(1).max(80).optional(),
      disabledNativeFields: z.array(z.string()).max(64).optional(),
    }).refine((body) => body.brandName !== undefined || body.disabledNativeFields !== undefined, {
      message: 'Nothing to update',
    }),
  },
}, async (request) => {
  const brandName = request.body.brandName?.trim();
  const disabledNativeFields = request.body.disabledNativeFields === undefined
    ? undefined
    : JSON.stringify(parseDisabledNativeFields(request.body.disabledNativeFields));
  const row = await prisma.workspaceSettings.upsert({
    where: { id: WORKSPACE_SETTINGS_ID },
    create: {
      id: WORKSPACE_SETTINGS_ID,
      brandName: brandName || DEFAULT_BRAND_NAME,
      ...(disabledNativeFields !== undefined ? { disabledNativeFields } : {}),
    },
    update: {
      ...(brandName ? { brandName } : {}),
      ...(disabledNativeFields !== undefined ? { disabledNativeFields } : {}),
    },
  });
  return workspaceResponse(row);
});

// LLM providers. API keys stay in the database and are never returned.
const llmProviderFields = {
  name: z.string().trim().min(1).max(120),
  provider: z.enum(LLM_PROVIDER_IDS),
  model: z.string().trim().min(1).max(200),
  baseUrl: z.string().trim().min(1).max(300).refine((value) => {
    try {
      const url = new URL(value);
      return url.protocol === 'http:' || url.protocol === 'https:';
    } catch {
      return false;
    }
  }, 'Base URL must be an http(s) URL'),
};

const llmWriteBody = z.object({
  ...llmProviderFields,
  apiKey: z.string().trim().min(1).max(500),
  isActive: z.boolean().optional(),
});

function sendLlmError(reply: any, err: unknown) {
  if (err instanceof LlmError) {
    return reply.status(err.status).send({ error: err.message });
  }
  const message = err instanceof Error ? err.message : 'LLM request failed';
  return reply.status(502).send({ error: message });
}

function llmSettingsView(systemPrompt: string) {
  return {
    systemPrompt,
    defaultSystemPrompt: DEFAULT_SYSTEM_PROMPT,
    customized: systemPrompt !== DEFAULT_SYSTEM_PROMPT,
  };
}

async function currentSystemPrompt() {
  const row = await prisma.llmSettings.findUnique({ where: { id: LLM_SETTINGS_ID } });
  return row?.systemPrompt ?? DEFAULT_SYSTEM_PROMPT;
}

server.get('/llm/settings', async () => {
  return llmSettingsView(await currentSystemPrompt());
});

server.put('/llm/settings', {
  schema: {
    body: z.object({
      systemPrompt: z.string().max(20000),
    }),
  },
}, async (request) => {
  const systemPrompt = request.body.systemPrompt.replace(/\r\n/g, '\n').trim();
  const row = await prisma.llmSettings.upsert({
    where: { id: LLM_SETTINGS_ID },
    create: { id: LLM_SETTINGS_ID, systemPrompt },
    update: { systemPrompt },
  });
  return llmSettingsView(row.systemPrompt);
});

server.get('/llm/providers', async () => {
  const rows = await prisma.llmProvider.findMany({ orderBy: { createdAt: 'asc' } });
  return rows.map(toPublicLlmProvider);
});

server.post('/llm/providers', {
  schema: { body: llmWriteBody },
}, async (request) => {
  const count = await prisma.llmProvider.count();
  const makeActive = request.body.isActive === true || (request.body.isActive === undefined && count === 0);
  if (makeActive) {
    await prisma.llmProvider.updateMany({ data: { isActive: false } });
  }
  const created = await prisma.llmProvider.create({
    data: {
      name: request.body.name,
      provider: request.body.provider,
      model: request.body.model,
      baseUrl: request.body.baseUrl,
      apiKey: request.body.apiKey,
      isActive: makeActive,
    },
  });
  return toPublicLlmProvider(created);
});

server.patch('/llm/providers/:id', {
  schema: {
    params: z.object({ id: z.string() }),
    body: llmWriteBody.partial().refine((body) => Object.keys(body).length > 0, 'No changes submitted'),
  },
}, async (request, reply) => {
  const existing = await prisma.llmProvider.findUnique({ where: { id: request.params.id } });
  if (!existing) return reply.status(404).send({ error: 'LLM provider not found' });

  const data: {
    name?: string;
    provider?: string;
    model?: string;
    baseUrl?: string;
    apiKey?: string;
    isActive?: boolean;
  } = {};
  if (request.body.name !== undefined) data.name = request.body.name;
  if (request.body.provider !== undefined) data.provider = request.body.provider;
  if (request.body.model !== undefined) data.model = request.body.model;
  if (request.body.baseUrl !== undefined) data.baseUrl = request.body.baseUrl;
  if (request.body.apiKey) data.apiKey = request.body.apiKey;
  if (request.body.isActive === true) {
    await prisma.llmProvider.updateMany({ data: { isActive: false } });
    data.isActive = true;
  } else if (request.body.isActive === false) {
    data.isActive = false;
  }

  const updated = await prisma.llmProvider.update({ where: { id: existing.id }, data });
  return toPublicLlmProvider(updated);
});

server.delete('/llm/providers/:id', {
  schema: { params: z.object({ id: z.string() }) },
}, async (request, reply) => {
  try {
    await prisma.llmProvider.delete({ where: { id: request.params.id } });
    return { ok: true };
  } catch (err: any) {
    if (err.code === 'P2025') return reply.status(404).send({ error: 'LLM provider not found' });
    throw err;
  }
});

server.post('/llm/providers/:id/activate', {
  schema: { params: z.object({ id: z.string() }) },
}, async (request, reply) => {
  const existing = await prisma.llmProvider.findUnique({ where: { id: request.params.id } });
  if (!existing) return reply.status(404).send({ error: 'LLM provider not found' });
  await prisma.llmProvider.updateMany({ data: { isActive: false } });
  const updated = await prisma.llmProvider.update({
    where: { id: existing.id },
    data: { isActive: true },
  });
  return toPublicLlmProvider(updated);
});

const llmTurn = z.discriminatedUnion('role', [
  z.object({ role: z.literal('user'), content: z.string().trim().min(1).max(4000) }),
  z.object({ role: z.literal('assistant'), content: z.string().trim().min(1).max(20000) }),
]);

const timeCutoffs = z.object({
  technicalFit: z.number().min(1).max(5),
  functionalFit: z.number().min(1).max(5),
}).optional();

server.post('/llm/ask', {
  schema: {
    body: z.object({
      messages: z.array(llmTurn).min(1).max(12),
      timeThresholds: timeCutoffs,
    }),
  },
}, async (request, reply) => {
  const messages = request.body.messages;
  for (let index = 0; index < messages.length; index++) {
    const expected = index % 2 === 0 ? 'user' : 'assistant';
    if (messages[index]?.role !== expected) {
      return reply.status(400).send({ error: 'Questions and answers must alternate, starting with a question.' });
    }
  }
  const provider = await prisma.llmProvider.findFirst({ where: { isActive: true }, orderBy: { updatedAt: 'desc' } });
  if (!provider) return reply.status(400).send({ error: 'No AI provider is active. Add one in Settings.' });
  try {
    const [systemPrompt, workspaceContext, applications] = await Promise.all([
      currentSystemPrompt(),
      buildPortfolioContext(prisma, request.body.timeThresholds),
      prisma.application.findMany({ select: { id: true, name: true } }),
    ]);
    const text = await completeConversation(provider, messages, systemPrompt, workspaceContext, 2048);
    return { text: linkApplicationMentions(text, applications), providerName: provider.name, model: provider.model };
  } catch (err) {
    return sendLlmError(reply, err);
  }
});

server.post('/llm/application-suggestions', {
  schema: {
    body: z.object({
      name: z.string().trim().min(2).max(200),
      context: z.string().trim().max(2000).optional(),
      description: z.string().max(4000).optional(),
      contractDetails: z.string().max(4000).optional(),
    }),
  },
}, async (request, reply) => {
  const provider = await prisma.llmProvider.findFirst({ where: { isActive: true }, orderBy: { updatedAt: 'desc' } });
  if (!provider) return reply.status(400).send({ error: 'No AI provider is active. Add one in Settings.' });
  if (!provider.apiKey) return reply.status(400).send({ error: 'The active AI provider has no API key.' });
  try {
    const result = await suggestApplicationFields(prisma, provider, {
      name: request.body.name,
      context: request.body.context ?? '',
      description: request.body.description ?? '',
      contractDetails: request.body.contractDetails ?? '',
    }, process.env.BRAVE_SEARCH_API_KEY ?? '');
    return { ...result, providerName: provider.name, model: provider.model };
  } catch (err) {
    return sendLlmError(reply, err);
  }
});

server.post('/llm/providers/:id/test', {
  schema: {
    params: z.object({ id: z.string() }),
    body: z.object({
      prompt: z.string().trim().max(4000).optional(),
      timeThresholds: timeCutoffs,
    }).optional(),
  },
}, async (request, reply) => {
  const existing = await prisma.llmProvider.findUnique({ where: { id: request.params.id } });
  if (!existing) return reply.status(404).send({ error: 'LLM provider not found' });
  const prompt = request.body?.prompt?.trim() || defaultTestPrompt();
  try {
    const workspaceContext = questionNeedsPortfolio(prompt) ? await buildPortfolioContext(prisma, request.body?.timeThresholds) : undefined;
    const text = await completeLlm(existing, prompt, await currentSystemPrompt(), workspaceContext);
    return { text };
  } catch (err) {
    return sendLlmError(reply, err);
  }
});

// Unified Search API
server.get('/search', {
  schema: {
    querystring: z.object({
      q: z.string(),
    }),
  },
}, async (request) => {
  const { q } = request.query;
  const [apps, caps, goals, orgs, info, integrations] = await Promise.all([
    prisma.application.findMany({
      where: {
        OR: [
          { name: { contains: q, mode: 'insensitive' } },
          { description: { contains: q, mode: 'insensitive' } },
          { owner: { contains: q, mode: 'insensitive' } },
          { ownerOrg: { name: { contains: q, mode: 'insensitive' } } },
          { lifecycle: { contains: q, mode: 'insensitive' } },
          { type: { contains: q, mode: 'insensitive' } },
          { vendorName: { contains: q, mode: 'insensitive' } },
          { vendorSummary: { contains: q, mode: 'insensitive' } },
          { timeRationale: { contains: q, mode: 'insensitive' } },
          { metadata: { contains: q, mode: 'insensitive' } },
        ],
      },
      include: { capabilities: true, ownerOrg: true },
      take: 10,
    }),
    prisma.capability.findMany({
      where: {
        OR: [
          { name: { contains: q, mode: 'insensitive' } },
          { description: { contains: q, mode: 'insensitive' } },
          { metadata: { contains: q, mode: 'insensitive' } },
        ],
      },
      take: 10,
    }),
    prisma.strategicGoal.findMany({
      where: {
        OR: [
          { name: { contains: q, mode: 'insensitive' } },
          { description: { contains: q, mode: 'insensitive' } },
        ],
      },
      include: { capabilities: { select: { id: true, name: true } } },
      take: 10,
    }),
    prisma.organization.findMany({
      where: {
        OR: [
          { name: { contains: q, mode: 'insensitive' } },
          { description: { contains: q, mode: 'insensitive' } },
          { supportedCapabilities: { some: { name: { contains: q, mode: 'insensitive' } } } },
        ],
      },
      take: 10,
    }),
    prisma.informationObject.findMany({
      where: {
        OR: [
          { name: { contains: q, mode: 'insensitive' } },
          { aliases: { contains: q, mode: 'insensitive' } },
          { description: { contains: q, mode: 'insensitive' } },
        ],
      },
      take: 10,
    }),
    prisma.integration.findMany({
      where: {
        OR: [
          { sourceApp: { name: { contains: q, mode: 'insensitive' } } },
          { targetApp: { name: { contains: q, mode: 'insensitive' } } },
          { payload: { name: { contains: q, mode: 'insensitive' } } },
          { name: { contains: q, mode: 'insensitive' } },
        ],
      },
      include: { sourceApp: true, targetApp: true, payload: true },
      take: 10,
    }),
  ]);

  // Helper to score relevance: exact name = 100, name startsWith = 50, name contains = 30, others = 10
  const scoreMatch = (name: string | null | undefined, desc: string | null | undefined, queryStr: string) => {
    const qLower = queryStr.trim().toLowerCase();
    const nLower = (name || '').toLowerCase();
    if (nLower === qLower) return 100;
    if (nLower.startsWith(qLower)) return 60;
    if (nLower.includes(qLower)) return 40;
    if ((desc || '').toLowerCase().includes(qLower)) return 10;
    return 1;
  };

  const sortedApps = [...apps].sort((a, b) => {
    let scoreA = scoreMatch(a.name, a.description, q);
    let scoreB = scoreMatch(b.name, b.description, q);
    if ((a.lifecycle || '').toLowerCase() === 'decommissioned') scoreA -= 50;
    if ((b.lifecycle || '').toLowerCase() === 'decommissioned') scoreB -= 50;
    return scoreB - scoreA;
  });

  const sortedCaps = [...caps].sort((a, b) => scoreMatch(b.name, b.description, q) - scoreMatch(a.name, a.description, q));
  const sortedGoals = [...goals].sort((a, b) => scoreMatch(b.name, b.description, q) - scoreMatch(a.name, a.description, q));
  const sortedOrgs = [...orgs].sort((a, b) => scoreMatch(b.name, b.description, q) - scoreMatch(a.name, a.description, q));
  const sortedInfo = [...info].sort((a, b) => scoreMatch(b.name, b.description, q) - scoreMatch(a.name, a.description, q));
  const sortedIntegrations = [...integrations].sort((a, b) => scoreMatch(b.name, `${b.sourceApp?.name} ${b.targetApp?.name}`, q) - scoreMatch(a.name, `${a.sourceApp?.name} ${a.targetApp?.name}`, q));

  return {
    applications: sortedApps,
    capabilities: sortedCaps,
    strategicGoals: sortedGoals,
    organizations: sortedOrgs,
    informationObjects: sortedInfo,
    integrations: sortedIntegrations
  };
});

const start = async () => {
  try {
    await server.listen({ port: 3001, host: '0.0.0.0' });
    console.log('Server is running on http://localhost:3001');
  } catch (err) {
    server.log.error(err);
    process.exit(1);
  }
};

start();
