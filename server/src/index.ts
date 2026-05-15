import { fastify } from 'fastify';
import { fastifyCors } from '@fastify/cors';
import { PrismaClient } from '@prisma/client';
import { z } from 'zod';
import { serializerCompiler, validatorCompiler, type ZodTypeProvider } from 'fastify-type-provider-zod';

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
      targetOf: { include: { sourceApp: true, payload: true } }
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
        targetOf: { include: { sourceApp: true, payload: true } }
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
      lifecycle: z.string().optional(),
      lifecycleStartDate: z.string().datetime().optional().nullable(),
      lifecycleEndDate: z.string().datetime().optional().nullable(),
      type: z.string().optional(),
      criticality: z.string().optional(),
      functionalFit: z.string().optional(),
      technicalFit: z.string().optional(),
      metadata: z.string().optional(),
      references: z.string().optional().nullable(),
      capabilityIds: z.array(z.string()).optional(),
      processedInformationObjectIds: z.array(z.string()).optional(),
    }),
  },
}, async (request) => {
  const { capabilityIds, processedInformationObjectIds, ...data } = request.body;

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
  return created;
});

server.put('/applications/:id', {
  schema: {
    params: z.object({ id: z.string() }),
    body: z.object({
      name: z.string().optional(),
      description: z.string().optional(),
      owner: z.string().optional(),
      lifecycle: z.string().optional(),
      lifecycleStartDate: z.string().datetime().optional().nullable(),
      lifecycleEndDate: z.string().datetime().optional().nullable(),
      type: z.string().optional(),
      criticality: z.string().optional(),
      functionalFit: z.string().optional(),
      technicalFit: z.string().optional(),
      metadata: z.string().optional(),
      references: z.string().optional().nullable(),
      capabilityIds: z.array(z.string()).optional(),
      processedInformationObjectIds: z.array(z.string()).optional(),
    }),
  },
}, async (request, reply) => {
  const { id } = request.params;
  const { capabilityIds, processedInformationObjectIds, ...data } = request.body;

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
    return updated;
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
      applications: true,
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
      include: { applications: true }
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
      include: { parent: true, children: true },
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
      name: z.string(),
      description: z.string().optional(),
      type: z.string().optional(),
      parentId: z.string().optional().nullable(),
      references: z.string().optional().nullable(),
    }),
  },
}, async (request) => {
  return prisma.organization.create({ data: request.body });
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
    }),
  },
}, async (request, reply) => {
  try {
    return await prisma.organization.update({
      where: { id: request.params.id },
      data: request.body
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
      description: z.string().optional(),
      color: z.string().nullish(),
      order: z.number().optional(),
    }),
  },
}, async (request) => {
  return prisma.picklistOption.create({
    data: {
      ...request.body,
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
      description: z.string().optional(),
      color: z.string().nullish(),
      order: z.number().optional(),
    })),
  },
}, async (request) => {
  const { id } = request.params;
  return prisma.$transaction(async (tx) => {
    await tx.picklistOption.deleteMany({ where: { picklistId: id } });
    return tx.picklist.update({
      where: { id },
      data: {
        options: {
          create: request.body.map((opt, i) => ({ ...opt, order: opt.order ?? (i + 1) }))
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

// Unified Search API
server.get('/search', {
  schema: {
    querystring: z.object({
      q: z.string(),
    }),
  },
}, async (request) => {
  const { q } = request.query;
  const [apps, caps, orgs, info, integrations] = await Promise.all([
    prisma.application.findMany({
      where: {
        OR: [
          { name: { contains: q, mode: 'insensitive' } },
          { description: { contains: q, mode: 'insensitive' } },
          { owner: { contains: q, mode: 'insensitive' } },
          { lifecycle: { contains: q, mode: 'insensitive' } },
          { type: { contains: q, mode: 'insensitive' } },
          { metadata: { contains: q, mode: 'insensitive' } },
        ],
      },
      include: { capabilities: true },
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
    prisma.organization.findMany({
      where: {
        OR: [
          { name: { contains: q, mode: 'insensitive' } },
          { description: { contains: q, mode: 'insensitive' } },
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

  return {
    applications: apps,
    capabilities: caps,
    organizations: orgs,
    informationObjects: info,
    integrations: integrations
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
