import { PrismaClient } from '@prisma/client';
import 'dotenv/config';

const prisma = new PrismaClient();

async function main() {
  console.log('🚮 Starting factory reset...');

  // Destructive clear
  await prisma.picklistOption.deleteMany({});
  await prisma.picklist.deleteMany({});
  await prisma.integration.deleteMany({});
  await prisma.capability.deleteMany({});
  await prisma.application.deleteMany({});
  await prisma.metadataDefinition.deleteMany({});

  console.log('✅ Database cleared.');

  // Standard Score Picklists (1-5)
  const fitOptions = [
    { value: '1', label: '1 - Low', color: '#c92a2a', order: 1 },
    { value: '2', label: '2', color: '#e67700', order: 2 },
    { value: '3', label: '3', color: '#fab005', order: 3 },
    { value: '4', label: '4', color: '#94d82d', order: 4 },
    { value: '5', label: '5 - High', color: '#2b8a3e', order: 5 },
  ];

  const criticalityOptions = [
    { value: '1', label: '1 - Not Critical', color: '#dee2e6', order: 1 },
    { value: '2', label: '2', color: '#adb5bd', order: 2 },
    { value: '3', label: '3', color: '#7048e8', order: 3 },
    { value: '4', label: '4', color: '#5f3dc4', order: 4 },
    { value: '5', label: '5 - Mission Critical', color: '#311b92', order: 5 },
  ];

  console.log('🌱 Initializing standard meta model...');

  await prisma.picklist.create({
    data: {
      name: 'technical_fit',
      label: 'Technical Fit',
      options: { create: fitOptions }
    }
  });

  await prisma.picklist.create({
    data: {
      name: 'functional_fit',
      label: 'Functional Fit',
      options: { create: fitOptions }
    }
  });

  await prisma.picklist.create({
    data: {
      name: 'criticality',
      label: 'Business Criticality',
      options: { create: criticalityOptions }
    }
  });

  await prisma.picklist.create({
    data: {
      name: 'lifecycle',
      label: 'Application Lifecycle',
      options: {
        create: [
          { value: 'Discovery', label: 'Discovery', order: 1 },
          { value: 'Onboarding', label: 'Onboarding', order: 2 },
          { value: 'Mainstream', label: 'Mainstream', order: 3 },
          { value: 'Legacy', label: 'Legacy', order: 4 },
          { value: 'Decommissioned', label: 'Decommissioned', order: 5 },
        ]
      }
    }
  });

  await prisma.picklist.create({
    data: {
      name: 'owner',
      label: 'Application Owner',
      options: { create: [] }
    }
  });

  await prisma.picklist.create({
    data: {
      name: 'application_type',
      label: 'Application Type',
      options: {
        create: [
          { value: 'Business Application', label: 'Business Application', order: 1 },
          { value: 'Infrastructure Service', label: 'Infrastructure Service', order: 2 },
          { value: 'Platform', label: 'Platform', order: 3 },
          { value: 'Desktop Application', label: 'Desktop Application', order: 4 },
        ]
      }
    }
  });

  await prisma.picklist.create({
    data: {
      name: 'integration_type',
      label: 'Integration Type',
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

  console.log('✨ Factory reset complete. Database is clean and initialized.');
}

main()
  .catch((e) => {
    console.error('❌ Reset failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
