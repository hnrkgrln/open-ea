import { PrismaClient } from '@prisma/client';
import 'dotenv/config';

const prisma = new PrismaClient();

async function main() {
  // Clear existing data
  await prisma.picklistOption.deleteMany({});
  await prisma.picklist.deleteMany({});
  await prisma.integration.deleteMany({});
  await prisma.capability.deleteMany({});
  await prisma.application.deleteMany({});
  await prisma.metadataDefinition.deleteMany({});

  console.log('Cleared database.');

  // Create Picklists
  const lifecyclePicklist = await prisma.picklist.create({
    data: {
      name: 'lifecycle',
      label: 'Application Lifecycle',
      options: {
        create: [
          { value: 'Planning', label: 'Planning', order: 1 },
          { value: 'Deployment', label: 'Deployment', order: 2 },
          { value: 'Maintenance', label: 'Maintenance', order: 3 },
          { value: 'Sunset', label: 'Sunset', order: 4 },
          { value: 'Decommissioned', label: 'Decommissioned', order: 5 },
        ]
      }
    }
  });

  const ownerPicklist = await prisma.picklist.create({
    data: {
      name: 'owner',
      label: 'Application Owner',
      options: {
        create: [
          { value: 'IT Department', label: 'IT Department', order: 1 },
          { value: 'Finance', label: 'Finance', order: 2 },
          { value: 'Sales Operations', label: 'Sales Operations', order: 3 },
          { value: 'HR', label: 'HR', order: 4 },
        ]
      }
    }
  });

  const relationTypePicklist = await prisma.picklist.create({
    data: {
      name: 'relation_type',
      label: 'Relation Type',
      options: {
        create: [
          { value: 'API', label: 'API', order: 1 },
          { value: 'Batch', label: 'Batch', order: 2 },
          { value: 'Messaging', label: 'Messaging', order: 3 },
          { value: 'Manual', label: 'Manual', order: 4 },
        ]
      }
    }
  });

  const appTypePicklist = await prisma.picklist.create({
    data: {
      name: 'application_type',
      label: 'Application Type',
      options: {
        create: [
          { value: 'On-premise', label: 'On-premise', order: 1 },
          { value: 'SaaS', label: 'SaaS', order: 2 },
          { value: 'PaaS', label: 'PaaS', order: 3 },
          { value: 'Mobile App', label: 'Mobile App', order: 4 },
          { value: 'Desktop App', label: 'Desktop App', order: 5 },
        ]
      }
    }
  });

  // Create Capabilities
  const cap1 = await prisma.capability.create({
    data: {
      name: 'Customer Management',
      description: 'Capabilities related to managing customer lifecycle and data.',
    },
  });

  const cap2 = await prisma.capability.create({
    data: {
      name: 'Financial Services',
      description: 'Core financial processing and reporting.',
    },
  });

  const cap3 = await prisma.capability.create({
    data: {
      name: 'Human Resources',
      description: 'Employee management and payroll.',
    },
  });

  // Create Applications
  const app1 = await prisma.application.create({
    data: {
      name: 'Salesforce',
      description: 'Core CRM application.',
      owner: 'Sales Operations',
      lifecycle: 'Maintenance',
      type: 'SaaS',
      capabilities: { connect: [{ id: cap1.id }] },
    },
  });

  const app2 = await prisma.application.create({
    data: {
      name: 'SAP S/4HANA',
      description: 'Enterprise ERP system.',
      owner: 'Finance',
      lifecycle: 'Maintenance',
      type: 'On-premise',
      capabilities: { connect: [{ id: cap2.id }] },
    },
  });

  const app3 = await prisma.application.create({
    data: {
      name: 'Medvind',
      description: 'Time management for employees.',
      owner: 'HR',
      lifecycle: 'Maintenance',
      type: 'SaaS',
      capabilities: { connect: [{ id: cap3.id }] },
    },
  });

  const app4 = await prisma.application.create({
    data: {
      name: 'HRplus',
      description: 'HR and Payroll system.',
      owner: 'HR',
      lifecycle: 'Maintenance',
      type: 'On-premise',
      capabilities: { connect: [{ id: cap3.id }] },
    },
  });

  // Create Integrations
  await prisma.integration.create({
    data: {
      name: 'Customer Sync',
      sourceAppId: app1.id,
      targetAppId: app2.id,
      type: 'API',
    },
  });

  await prisma.integration.create({
    data: {
      name: 'Employee Sync',
      sourceAppId: app3.id,
      targetAppId: app4.id,
      type: 'Batch',
    },
  });

  console.log('Seed data created successfully.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
