import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import { PrismaClient } from '@prisma/client';
import { buildCostScaleBands, DEFAULT_COST_CURRENCY, DEFAULT_COST_SCALE } from './cost.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '..', '.env') });

const prisma = new PrismaClient();

async function createPicklist(
  name: string,
  label: string,
  options: { value: string; label: string; description?: string; color?: string; order?: number }[],
) {
  await prisma.picklist.create({
    data: {
      name,
      label,
      options: {
        create: options.map((opt, idx) => ({
          value: opt.value,
          label: opt.label,
          description: opt.description,
          color: opt.color,
          order: opt.order ?? idx + 1,
        })),
      },
    },
  });
}

async function main() {
  console.log('🚮 Resetting current database to start from scratch with the Onboarding Guide...');

  // 1. Ensure Current landscape state exists
  await prisma.landscapeState.upsert({
    where: { id: 'current' },
    create: { id: 'current', name: 'Current' },
    update: { name: 'Current', sourceStateId: null },
  });

  // 2. Clear authentication, sessions, groups, and SSO state
  await prisma.session.deleteMany({});
  await prisma.groupMembership.deleteMany({});
  await prisma.groupGrant.deleteMany({});
  await prisma.user.deleteMany({});
  await prisma.group.deleteMany({});
  await prisma.ssoLogin.deleteMany({});
  await prisma.identityProvider.deleteMany({});

  // 3. Clear transformations and portfolio artifacts across all states
  await prisma.transformationStep.deleteMany({});
  await prisma.transformation.deleteMany({});
  await prisma.integration.deleteMany({});
  await prisma.informationObject.deleteMany({});
  await prisma.application.deleteMany({});
  await prisma.organization.deleteMany({});
  await prisma.strategicGoal.deleteMany({});
  await prisma.capability.deleteMany({});

  // 4. Remove non-current landscape states
  await prisma.landscapeState.updateMany({
    where: { id: { not: 'current' } },
    data: { sourceStateId: null },
  });
  await prisma.landscapeState.deleteMany({
    where: { id: { not: 'current' } },
  });

  // 5. Clear custom metadata, picklists, and LLM configurations
  await prisma.metadataDefinition.deleteMany({});
  await prisma.picklistOption.deleteMany({});
  await prisma.picklist.deleteMany({});
  await prisma.llmProvider.deleteMany({});
  await prisma.llmSettings.deleteMany({});
  await prisma.llmSkill.deleteMany({});

  // 6. Reset workspace settings so the Onboarding Guide launches on Step 1
  await prisma.workspaceSettings.upsert({
    where: { id: 'default' },
    create: {
      id: 'default',
      brandName: 'OpenEA',
      disabledNativeFields: '[]',
      costCurrency: DEFAULT_COST_CURRENCY,
      costScale: JSON.stringify(DEFAULT_COST_SCALE),
      publicBaseUrl: '',
      onboardingCompleted: false,
    },
    update: {
      brandName: 'OpenEA',
      disabledNativeFields: '[]',
      costCurrency: DEFAULT_COST_CURRENCY,
      costScale: JSON.stringify(DEFAULT_COST_SCALE),
      publicBaseUrl: '',
      onboardingCompleted: false,
    },
  });

  console.log('✅ Database cleared and onboarding state reset.');
  console.log('🌱 Initializing standard meta-model picklists...');

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

  const costOptions = buildCostScaleBands(DEFAULT_COST_SCALE, DEFAULT_COST_CURRENCY).map((b) => ({
    value: b.value,
    label: b.label,
    description: b.description,
    color: b.color,
    order: b.order,
  }));

  await createPicklist('technical_fit', 'Technical Fit', fitOptions);
  await createPicklist('functional_fit', 'Functional Fit', fitOptions);
  await createPicklist('criticality', 'Business Criticality', criticalityOptions);
  await createPicklist('application_cost', 'Cost Scale', costOptions);

  await createPicklist('lifecycle', 'Application Lifecycle', [
    { value: 'Discovery', label: 'Discovery', order: 1 },
    { value: 'Onboarding', label: 'Onboarding', order: 2 },
    { value: 'Mainstream', label: 'Mainstream', order: 3 },
    { value: 'Legacy', label: 'Legacy', order: 4 },
    { value: 'Decommissioned', label: 'Decommissioned', order: 5 },
  ]);

  await createPicklist('owner', 'Application Owner', []);

  await createPicklist('application_type', 'Application Type', [
    { value: 'Business Application', label: 'Business Application', description: 'Software used by business users to perform their tasks.', order: 1 },
    { value: 'Infrastructure Service', label: 'Infrastructure Service', description: 'Low-level services that provide fundamental capabilities like networking or storage.', order: 2 },
    { value: 'Platform', label: 'Platform', description: 'A foundation for building and running applications.', order: 3 },
    { value: 'Desktop Application', label: 'Desktop Application', description: "Software that runs locally on a user's workstation.", order: 4 },
  ]);

  await createPicklist('integration_type', 'Integration Type', [
    { value: 'API', label: 'API', order: 1 },
    { value: 'Batch', label: 'Batch', order: 2 },
    { value: 'Messaging', label: 'Messaging', order: 3 },
    { value: 'Manual', label: 'Manual', order: 4 },
  ]);

  await createPicklist('cia_scale', 'CIA Scale', [
    { value: '1', label: '1 - Low', color: '#2b8a3e', order: 1 },
    { value: '2', label: '2 - Moderate', color: '#fab005', order: 2 },
    { value: '3', label: '3 - High', color: '#e67700', order: 3 },
    { value: '4', label: '4 - Critical', color: '#c92a2a', order: 4 },
  ]);

  await createPicklist('organization_type', 'Organization Type', [
    { value: 'Division', label: 'Division', order: 1 },
    { value: 'Department', label: 'Department', order: 2 },
    { value: 'Team', label: 'Team', order: 3 },
  ]);

  await createPicklist('pii_category', 'PII Category', [
    { value: '1', label: '1 - None', color: '#ced4da', order: 1 },
    { value: '2', label: '2 - Standard PII', color: '#fab005', order: 2 },
    { value: '3', label: '3 - Sensitive', color: '#e67700', order: 3 },
    { value: '4', label: '4 - Special Category', color: '#c92a2a', order: 4 },
  ]);

  await createPicklist('information_type', 'Information Type', [
    { value: 'Master Data', label: 'Master Data', order: 1 },
    { value: 'Transactional', label: 'Transactional', order: 2 },
    { value: 'Reference', label: 'Reference', order: 3 },
    { value: 'Unstructured', label: 'Unstructured', order: 4 },
  ]);

  await createPicklist('integration_pattern', 'Integration Pattern', [
    { value: 'REST API', label: 'REST API', order: 1 },
    { value: 'Event/Message Queue', label: 'Event/Message Queue', order: 2 },
    { value: 'Batch File', label: 'Batch File', order: 3 },
    { value: 'Direct DB Read', label: 'Direct DB Read', order: 4 },
  ]);

  await createPicklist('integration_frequency', 'Integration Frequency', [
    { value: 'Real-time', label: 'Real-time', order: 1 },
    { value: 'Hourly', label: 'Hourly', order: 2 },
    { value: 'Nightly Batch', label: 'Nightly Batch', order: 3 },
  ]);

  await createPicklist('integration_crud', 'CRUD Operation', [
    { value: 'Create', label: 'Create', order: 1 },
    { value: 'Read', label: 'Read', order: 2 },
    { value: 'Update', label: 'Update', order: 3 },
    { value: 'Delete', label: 'Delete', order: 4 },
  ]);

  console.log('✨ Database reset complete! Refresh your browser to start the Onboarding Guide from Step 1.');
}

main()
  .catch((e) => {
    console.error('❌ Reset failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
