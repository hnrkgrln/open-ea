import { fastify } from 'fastify';
import { fastifyCors } from '@fastify/cors';
import { PrismaClient } from '@prisma/client';
import { z } from 'zod';
import { serializerCompiler, validatorCompiler, ZodTypeProvider } from 'fastify-type-provider-zod';

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

// Applications API
server.get('/applications', async () => {
  return prisma.application.findMany({
    include: {
      capabilities: true,
    },
    orderBy: { name: 'asc' }
  });
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
}, async (request) => {
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

  return prisma.application.update({
    where: { id },
    data: {
      ...data,
      capabilities: capabilityIds ? {
        set: validIds.map(id => ({ id }))
      } : undefined
    },
  });
});

server.delete('/applications/:id', {
  schema: {
    params: z.object({ id: z.string() }),
  },
}, async (request) => {
  return prisma.application.delete({
    where: { id: request.params.id },
  });
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
}, async (request) => {
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

  return prisma.capability.update({
    where: { id },
    data: {
      ...data,
      applications: applicationIds ? {
        set: validIds.map(id => ({ id }))
      } : undefined
    },
  });
});

server.delete('/capabilities/:id', {
  schema: {
    params: z.object({ id: z.string() }),
  },
}, async (request) => {
  return prisma.capability.delete({
    where: { id: request.params.id },
  });
});

// Integrations API
server.get('/integrations', async () => {
  return prisma.integration.findMany({
    include: {
      sourceApp: true,
      targetApp: true,
    },
  });
});

server.post('/integrations', {
  schema: {
    body: z.object({
      name: z.string().optional(),
      sourceAppId: z.string(),
      targetAppId: z.string(),
      type: z.string().optional(),
    }),
  },
}, async (request) => {
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
      type: z.string().optional(),
    }),
  },
}, async (request) => {
  return prisma.integration.update({
    where: { id: request.params.id },
    data: request.body,
  });
});

server.delete('/integrations/:id', {
  schema: {
    params: z.object({ id: z.string() }),
  },
}, async (request) => {
  return prisma.integration.delete({
    where: { id: request.params.id },
  });
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
  const [apps, caps] = await Promise.all([
    prisma.application.findMany({
      where: {
        OR: [
          { name: { contains: q } },
          { description: { contains: q } },
        ],
      },
      include: { capabilities: true },
      take: 10,
    }),
    prisma.capability.findMany({
      where: {
        OR: [
          { name: { contains: q } },
          { description: { contains: q } },
        ],
      },
      take: 10,
    }),
  ]);

  return {
    applications: apps,
    capabilities: caps,
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
