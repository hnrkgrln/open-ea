import { PrismaClient } from '@prisma/client';
import 'dotenv/config';

const prisma = new PrismaClient();

async function seedPicklist(name: string, label: string, options: any[]) {
  const existing = await prisma.picklist.findUnique({ where: { name } });
  if (existing) {
    console.log(`Picklist "${name}" already exists, skipping.`);
    return;
  }

  console.log(`Creating standard meta model: ${name}`);
  await prisma.picklist.create({
    data: {
      name,
      label,
      options: {
        create: options.map((opt, i) => ({
          value: opt.value,
          label: opt.label,
          color: opt.color,
          order: opt.order ?? (i + 1)
        }))
      }
    }
  });
  }

  async function main() {
  // Create Standard Score Picklists (1-5)
  const fitOptions = [
    { value: '1', label: '1 - Low', color: '#c92a2a' },
    { value: '2', label: '2', color: '#e67700' },
    { value: '3', label: '3', color: '#fab005' },
    { value: '4', label: '4', color: '#94d82d' },
    { value: '5', label: '5 - High', color: '#2b8a3e' },
  ];

  const criticalityOptions = [
    { value: '1', label: '1 - Not Critical', color: '#dee2e6' },
    { value: '2', label: '2', color: '#adb5bd' },
    { value: '3', label: '3', color: '#7048e8' },
    { value: '4', label: '4', color: '#5f3dc4' },
    { value: '5', label: '5 - Mission Critical', color: '#311b92' },
  ];

  await seedPicklist('technical_fit', 'Technical Fit', fitOptions);
  await seedPicklist('functional_fit', 'Functional Fit', fitOptions);
  await seedPicklist('criticality', 'Business Criticality', criticalityOptions);

  await seedPicklist('lifecycle', 'Application Lifecycle', [
    { value: 'Discovery', label: 'Discovery' },
    { value: 'Onboarding', label: 'Onboarding' },
    { value: 'Mainstream', label: 'Mainstream' },
    { value: 'Legacy', label: 'Legacy' },
    { value: 'Decommissioned', label: 'Decommissioned' },
  ]);

  await seedPicklist('owner', 'Application Owner', []);

  await seedPicklist('application_type', 'Application Type', [
    { value: 'Business Application', label: 'Business Application' },
    { value: 'Infrastructure Service', label: 'Infrastructure Service' },
    { value: 'Platform', label: 'Platform' },
    { value: 'Desktop Application', label: 'Desktop Application' },
  ]);

  await seedPicklist('integration_type', 'Integration Type', [
    { value: 'API', label: 'API' },
    { value: 'Batch', label: 'Batch' },
    { value: 'Messaging', label: 'Messaging' },
    { value: 'Manual', label: 'Manual' },
  ]);

  const ciaOptions = [
    { value: '1', label: '1 - Low', color: '#2b8a3e' },
    { value: '2', label: '2 - Moderate', color: '#fab005' },
    { value: '3', label: '3 - High', color: '#e67700' },
    { value: '4', label: '4 - Critical', color: '#c92a2a' },
  ];

  await seedPicklist('cia_scale', 'CIA Scale', ciaOptions);

  await seedPicklist('organization_type', 'Organization Type', [
    { value: 'Division', label: 'Division' },
    { value: 'Department', label: 'Department' },
    { value: 'Team', label: 'Team' },
  ]);

  await seedPicklist('pii_category', 'PII Category', [
    { value: '1', label: '1 - None', color: '#ced4da' },
    { value: '2', label: '2 - Standard PII', color: '#fab005' },
    { value: '3', label: '3 - Sensitive', color: '#e67700' },
    { value: '4', label: '4 - Special Category', color: '#c92a2a' },
  ]);

  await seedPicklist('information_type', 'Information Type', [
    { value: 'Master Data', label: 'Master Data' },
    { value: 'Transactional', label: 'Transactional' },
    { value: 'Reference', label: 'Reference' },
    { value: 'Unstructured', label: 'Unstructured' },
  ]);

  await seedPicklist('integration_pattern', 'Integration Pattern', [
    { value: 'REST API', label: 'REST API' },
    { value: 'Event/Message Queue', label: 'Event/Message Queue' },
    { value: 'Batch File', label: 'Batch File' },
    { value: 'Direct DB Read', label: 'Direct DB Read' },
  ]);

  await seedPicklist('integration_frequency', 'Integration Frequency', [
    { value: 'Real-time', label: 'Real-time' },
    { value: 'Hourly', label: 'Hourly' },
    { value: 'Nightly Batch', label: 'Nightly Batch' },
  ]);

  await seedPicklist('integration_crud', 'CRUD Operation', [
    { value: 'Create', label: 'Create' },
    { value: 'Read', label: 'Read' },
    { value: 'Update', label: 'Update' },
    { value: 'Delete', label: 'Delete' },
  ]);

  console.log('Standard Meta model check complete.');
  }


main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
