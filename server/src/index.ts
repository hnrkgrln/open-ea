import { fastify } from 'fastify';
import { fastifyCors } from '@fastify/cors';
import { PrismaClient } from '@prisma/client';
import { z } from 'zod';
import { serializerCompiler, validatorCompiler, type ZodTypeProvider } from 'fastify-type-provider-zod';

const prisma = new PrismaClient();
const server = fastify().withTypeProvider<ZodTypeProvider>();

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

server.setValidatorCompiler(validatorCompiler);
server.setSerializerCompiler(serializerCompiler);

server.register(fastifyCors, {
  origin: true,
});

server.setErrorHandler((error: unknown, request, reply) => {
  console.error('FASTIFY ERROR:', error);
  if (error instanceof Error) {
    reply.status(500).send({ 
      error: error.message || 'Internal Server Error',
      stack: error.stack,
      name: error.name
    });
  } else {
    reply.status(500).send({ error: 'Unknown Error' });
  }
});

// Applications API
server.get('/applications', async () => {
  return prisma.application.findMany({
    include: {
      capabilities: true,
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
      include: { capabilities: true }
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
      type: z.string().optional(),
      criticality: z.string().optional(),
      functionalFit: z.string().optional(),
      technicalFit: z.string().optional(),
      metadata: z.string().optional(),
      capabilityIds: z.array(z.string()).optional(),
    }),
  },
}, async (request) => {
  const { capabilityIds, ...data } = request.body;
  
  // Filter for only existing capability IDs to prevent Prisma crash (P2025)
  let validIds: string[] = [];
  if (capabilityIds && capabilityIds.length > 0) {
    const existing = await prisma.capability.findMany({
      where: { id: { in: capabilityIds } },
      select: { id: true }
    });
    validIds = existing.map(c => c.id);
  }

  return prisma.application.create({
    data: {
      ...data,
      capabilities: validIds.length > 0 ? {
        connect: validIds.map(id => ({ id }))
      } : undefined
    },
  });
});

server.put('/applications/:id', {
  schema: {
    params: z.object({ id: z.string() }),
    body: z.object({
      name: z.string().optional(),
      description: z.string().optional(),
      owner: z.string().optional(),
      lifecycle: z.string().optional(),
      type: z.string().optional(),
      criticality: z.string().optional(),
      functionalFit: z.string().optional(),
      technicalFit: z.string().optional(),
      metadata: z.string().optional(),
      capabilityIds: z.array(z.string()).optional(),
    }),
  },
}, async (request, reply) => {
  const { id } = request.params;
  const { capabilityIds, ...data } = request.body;

  let validIds: string[] = [];
  if (capabilityIds && capabilityIds.length > 0) {
    const existing = await prisma.capability.findMany({
      where: { id: { in: capabilityIds } },
      select: { id: true }
    });
    validIds = existing.map(c => c.id);
  }

  try {
    return await prisma.application.update({
      where: { id },
      data: {
        ...data,
        capabilities: capabilityIds ? {
          set: validIds.map(id => ({ id }))
        } : undefined
      },
    });
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
  return prisma.capability.findMany({
    include: {
      applications: true,
    },
    orderBy: { name: 'asc' }
  });
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

  return prisma.capability.create({
    data: {
      ...data,
      applications: validIds.length > 0 ? {
        connect: validIds.map(id => ({ id }))
      } : undefined
    },
  });
});

server.put('/capabilities/:id', {
  schema: {
    params: z.object({ id: z.string() }),
    body: z.object({
      name: z.string().optional(),
      description: z.string().optional(),
      parentId: z.string().optional().nullable(),
      metadata: z.string().optional(),
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

  try {
    return await prisma.capability.update({
      where: { id },
      data: {
        ...data,
        applications: applicationIds ? {
          set: validIds.map(id => ({ id }))
        } : undefined
      },
    });
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
    return await prisma.capability.delete({
      where: { id: request.params.id },
    });
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
      include: { parent: true, children: true, informationObjects: true }
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
      include: { businessOwner: true, appOwner: true },
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
      include: { businessOwner: true, appOwner: true, integrations: { include: { sourceApp: true, targetApp: true } } }
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
      sourceAppId: z.string(),
      targetAppId: z.string(),
      infoObjectId: z.string().optional().nullable(),
      pattern: z.string().optional(),
      frequency: z.string().optional(),
      crud: z.string().optional(),
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

  return prisma.integration.create({
    data: request.body,
  });
});

server.put('/integrations/:id', {
  schema: {
    params: z.object({ id: z.string() }),
    body: z.object({
      name: z.string().optional(),
      sourceAppId: z.string().optional(),
      targetAppId: z.string().optional(),
      infoObjectId: z.string().optional().nullable(),
      pattern: z.string().optional(),
      frequency: z.string().optional(),
      crud: z.string().optional(),
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
    return await prisma.integration.update({
      where: { id: request.params.id },
      data: request.body,
    });
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
      color: z.string().optional(),
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
      color: z.string().optional(),
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
      min: z.number().optional(),
      max: z.number().optional(),
      scaleType: z.string().optional(),
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
      min: z.number().optional(),
      max: z.number().optional(),
      scaleType: z.string().optional(),
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
  const [apps, caps, orgs, info] = await Promise.all([
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
  ]);

  return {
    applications: apps,
    capabilities: caps,
    organizations: orgs,
    informationObjects: info
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
