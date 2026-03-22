import { fastify } from 'fastify';
import { fastifyCors } from '@fastify/cors';
import { PrismaClient } from '@prisma/client';
import { z } from 'zod';
import { serializerCompiler, validatorCompiler, ZodTypeProvider } from 'fastify-type-provider-zod';

const prisma = new PrismaClient();
const server = fastify().withTypeProvider<ZodTypeProvider>();

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
  return prisma.application.create({
    data: {
      ...data,
      capabilities: capabilityIds ? {
        connect: capabilityIds.map(id => ({ id }))
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
  return prisma.application.update({
    where: { id },
    data: {
      ...data,
      capabilities: capabilityIds ? {
        set: capabilityIds.map(id => ({ id }))
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
  return prisma.capability.create({
    data: {
      ...data,
      applications: applicationIds ? {
        connect: applicationIds.map(id => ({ id }))
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
  return prisma.capability.update({
    where: { id },
    data: {
      ...data,
      applications: applicationIds ? {
        set: applicationIds.map(id => ({ id }))
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
  return prisma.metadataDefinition.delete({
    where: { id: request.params.id },
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
