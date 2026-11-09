import type { PrismaClient } from '@prisma/client';
import { costTierForAmount, DEFAULT_COST_SCALE } from './cost.js';

export const EXAMPLE_CONCEPT_KEYS = [
  'capabilities',
  'strategic-goals',
  'organizations',
  'information-objects',
  'applications',
  'integrations',
] as const;

export type ExampleConceptKey = (typeof EXAMPLE_CONCEPT_KEYS)[number];

export interface ExampleCapabilitySeed {
  id: string;
  name: string;
  description: string;
  criticality: string;
  parentId: string | null;
}

export interface ExampleStrategicGoalSeed {
  id: string;
  name: string;
  description: string;
  parentId: string | null;
  capabilityIds: string[];
}

export interface ExampleOrganizationSeed {
  id: string;
  name: string;
  description: string;
  type: string;
  parentId: string | null;
  supportedCapabilityIds: string[];
}

export interface ExampleInformationObjectSeed {
  id: string;
  name: string;
  aliases: string;
  description: string;
  confidentiality: string;
  integrity: string;
  availability: string;
  piiCategory: string;
  type: string;
  businessOwnerOrgId: string;
  appOwnerId: string;
}

export interface ExampleApplicationSeed {
  id: string;
  name: string;
  description: string;
  owner: string;
  ownerOrgId: string;
  lifecycle: string;
  lifecycleStartDate: string;
  contractStartDate: string;
  contractEndDate: string;
  contractDetails: string;
  vendorName: string;
  vendorUrl: string;
  vendorSummary: string;
  type: string;
  criticality: string;
  annualCost: number;
  functionalFit: string;
  technicalFit: string;
  timeRationale: string;
  capabilityIds: string[];
  processedInformationObjectIds: string[];
}

export interface ExampleIntegrationSeed {
  id: string;
  name: string;
  description: string;
  sourceAppId: string;
  targetAppId: string;
  infoObjectId: string;
  pattern: string;
  type: string;
  frequency: string;
  crud: string;
}

export const EXAMPLE_CAPABILITIES: ExampleCapabilitySeed[] = [
  {
    id: 'example-cap-1',
    name: '1. Customer & Revenue Management',
    description: 'Acquire, onboard, and serve customers across digital and direct sales channels.',
    criticality: '5',
    parentId: null,
  },
  {
    id: 'example-cap-1-1',
    name: '1.1 CRM & Sales Enablement',
    description: 'Manage leads, accounts, opportunities, and customer interaction histories.',
    criticality: '5',
    parentId: 'example-cap-1',
  },
  {
    id: 'example-cap-1-2',
    name: '1.2 Billing & Revenue Operations',
    description: 'Generate customer invoices, manage subscriptions, and reconcile recurring revenue.',
    criticality: '4',
    parentId: 'example-cap-1',
  },
  {
    id: 'example-cap-2',
    name: '2. Enterprise Operations',
    description: 'Core financial, procurement, and human capital capabilities that run the enterprise.',
    criticality: '5',
    parentId: null,
  },
  {
    id: 'example-cap-2-1',
    name: '2.1 Financial Management & Accounting',
    description: 'General ledger, accounts payable/receivable, budgeting, and statutory financial reporting.',
    criticality: '5',
    parentId: 'example-cap-2',
  },
  {
    id: 'example-cap-2-2',
    name: '2.2 Human Capital Management',
    description: 'Workforce administration, onboarding, payroll coordination, and talent development.',
    criticality: '4',
    parentId: 'example-cap-2',
  },
  {
    id: 'example-cap-3',
    name: '3. Digital & Data Platforms',
    description: 'Shared technology foundations for identity security, integration, and enterprise analytics.',
    criticality: '5',
    parentId: null,
  },
  {
    id: 'example-cap-3-1',
    name: '3.1 Identity & Access Governance',
    description: 'Single sign-on, multi-factor authentication, and lifecycle provisioning across all systems.',
    criticality: '5',
    parentId: 'example-cap-3',
  },
  {
    id: 'example-cap-3-2',
    name: '3.2 Enterprise Analytics & Data Warehousing',
    description: 'Consolidate operational data into governed datasets for executive reporting and insights.',
    criticality: '3',
    parentId: 'example-cap-3',
  },
];

export const EXAMPLE_STRATEGIC_GOALS: ExampleStrategicGoalSeed[] = [
  {
    id: 'example-goal-1',
    name: '1. Accelerate Digital Customer Onboarding',
    description: 'Reduce customer quote-to-activation cycle time by 40% through unified CRM and automated billing.',
    parentId: null,
    capabilityIds: ['example-cap-1-1', 'example-cap-1-2'],
  },
  {
    id: 'example-goal-1-1',
    name: '1.1 Retire Legacy Batch Invoicing',
    description: 'Replace manual and nightly batch invoicing with event-driven ERP billing flows.',
    parentId: 'example-goal-1',
    capabilityIds: ['example-cap-1-2', 'example-cap-2-1'],
  },
  {
    id: 'example-goal-2',
    name: '2. Consolidate Core Enterprise Platforms',
    description: 'Standardize finance and HR operations on cloud-native SaaS platforms with clear data ownership.',
    parentId: null,
    capabilityIds: ['example-cap-2-1', 'example-cap-2-2', 'example-cap-3-2'],
  },
  {
    id: 'example-goal-3',
    name: '3. Enforce Zero-Trust Identity & PII Governance',
    description: 'Ensure every system processing sensitive PII uses centralized SSO and governed data flows.',
    parentId: null,
    capabilityIds: ['example-cap-3-1'],
  },
];

export const EXAMPLE_ORGANIZATIONS: ExampleOrganizationSeed[] = [
  {
    id: 'example-org-1',
    name: 'Commercial Division',
    description: 'Accountable for global revenue growth, customer acquisition, and account management.',
    type: 'Division',
    parentId: null,
    supportedCapabilityIds: ['example-cap-1'],
  },
  {
    id: 'example-org-1-1',
    name: 'Sales & Revenue Operations',
    description: 'Operates CRM processes, commercial quoting, and customer billing workflows.',
    type: 'Department',
    parentId: 'example-org-1',
    supportedCapabilityIds: ['example-cap-1-1', 'example-cap-1-2'],
  },
  {
    id: 'example-org-2',
    name: 'Corporate Functions',
    description: 'Group finance, legal, compliance, and human resources.',
    type: 'Division',
    parentId: null,
    supportedCapabilityIds: ['example-cap-2'],
  },
  {
    id: 'example-org-2-1',
    name: 'Finance & Accounting',
    description: 'Manages group accounting, financial close, and treasury operations.',
    type: 'Department',
    parentId: 'example-org-2',
    supportedCapabilityIds: ['example-cap-2-1'],
  },
  {
    id: 'example-org-2-2',
    name: 'People & Culture',
    description: 'Manages employee lifecycle, recruitment, and organizational development.',
    type: 'Department',
    parentId: 'example-org-2',
    supportedCapabilityIds: ['example-cap-2-2'],
  },
  {
    id: 'example-org-3',
    name: 'Group IT & Digital',
    description: 'Delivers enterprise architecture, cloud platforms, security, and data engineering.',
    type: 'Division',
    parentId: null,
    supportedCapabilityIds: ['example-cap-3'],
  },
  {
    id: 'example-org-3-1',
    name: 'Enterprise Platforms & Security',
    description: 'Owns identity infrastructure, integration middleware, and the enterprise data warehouse.',
    type: 'Team',
    parentId: 'example-org-3',
    supportedCapabilityIds: ['example-cap-3-1', 'example-cap-3-2'],
  },
];

export const EXAMPLE_INFORMATION_OBJECTS: ExampleInformationObjectSeed[] = [
  {
    id: 'example-info-1',
    name: 'Customer Master Record',
    aliases: 'Account, Client Profile, Customer Entity',
    description: 'Golden record of a B2B or B2C customer including legal name, contacts, and billing address.',
    confidentiality: '3',
    integrity: '4',
    availability: '4',
    piiCategory: '2',
    type: 'Master Data',
    businessOwnerOrgId: 'example-org-1-1',
    appOwnerId: 'example-app-1',
  },
  {
    id: 'example-info-2',
    name: 'Customer Invoice & Contract',
    aliases: 'Billing Document, Subscription Agreement',
    description: 'Commercial contract terms, line items, and issued invoices for customer accounts.',
    confidentiality: '3',
    integrity: '4',
    availability: '3',
    piiCategory: '2',
    type: 'Transactional',
    businessOwnerOrgId: 'example-org-2-1',
    appOwnerId: 'example-app-2',
  },
  {
    id: 'example-info-3',
    name: 'General Ledger Entry',
    aliases: 'GL Posting, Journal Voucher',
    description: 'Posted financial accounting entries across cost centers and legal entities.',
    confidentiality: '4',
    integrity: '4',
    availability: '4',
    piiCategory: '1',
    type: 'Transactional',
    businessOwnerOrgId: 'example-org-2-1',
    appOwnerId: 'example-app-2',
  },
  {
    id: 'example-info-4',
    name: 'Employee Profile',
    aliases: 'Worker Record, HR Master',
    description: 'Employee identity, role, organizational assignment, and compensation grade.',
    confidentiality: '4',
    integrity: '4',
    availability: '3',
    piiCategory: '3',
    type: 'Master Data',
    businessOwnerOrgId: 'example-org-2-2',
    appOwnerId: 'example-app-4',
  },
  {
    id: 'example-info-5',
    name: 'Identity & Access Credential',
    aliases: 'SSO Principal, Directory Account',
    description: 'Enterprise user principal, group claims, and authentication policy bindings.',
    confidentiality: '4',
    integrity: '4',
    availability: '4',
    piiCategory: '2',
    type: 'Reference',
    businessOwnerOrgId: 'example-org-3-1',
    appOwnerId: 'example-app-5',
  },
];

export const EXAMPLE_APPLICATIONS: ExampleApplicationSeed[] = [
  {
    id: 'example-app-1',
    name: 'Salesforce CRM',
    description: 'Primary commercial system of record for accounts, sales opportunities, and customer lifecycle management.',
    owner: 'Anna Lindqvist',
    ownerOrgId: 'example-org-1-1',
    lifecycle: 'Mainstream',
    lifecycleStartDate: '2023-01-15T00:00:00.000Z',
    contractStartDate: '2025-01-01T00:00:00.000Z',
    contractEndDate: '2027-12-31T00:00:00.000Z',
    contractDetails: 'Enterprise subscription for 450 commercial users.',
    vendorName: 'Salesforce',
    vendorUrl: 'https://www.salesforce.com',
    vendorSummary: 'Cloud-based customer relationship management platform provider.',
    type: 'Business Application',
    criticality: '5',
    annualCost: 2400000,
    functionalFit: '5',
    technicalFit: '4',
    timeRationale: 'Strategic commercial core with strong API ecosystem and high user adoption.',
    capabilityIds: ['example-cap-1-1'],
    processedInformationObjectIds: ['example-info-1', 'example-info-2'],
  },
  {
    id: 'example-app-2',
    name: 'SAP S/4HANA Core ERP',
    description: 'Enterprise resource planning platform governing general ledger, accounts receivable, and financial consolidation.',
    owner: 'Marcus Bergström',
    ownerOrgId: 'example-org-2-1',
    lifecycle: 'Mainstream',
    lifecycleStartDate: '2022-06-01T00:00:00.000Z',
    contractStartDate: '2024-01-01T00:00:00.000Z',
    contractEndDate: '2028-12-31T00:00:00.000Z',
    contractDetails: 'Managed cloud ERP agreement.',
    vendorName: 'SAP',
    vendorUrl: 'https://www.sap.com',
    vendorSummary: 'Enterprise application software vendor for finance, supply chain, and operations.',
    type: 'Business Application',
    criticality: '5',
    annualCost: 6200000,
    functionalFit: '4',
    technicalFit: '4',
    timeRationale: 'Core financial backbone; continue investing in standardized APIs.',
    capabilityIds: ['example-cap-2-1', 'example-cap-1-2'],
    processedInformationObjectIds: ['example-info-1', 'example-info-2', 'example-info-3'],
  },
  {
    id: 'example-app-3',
    name: 'Legacy Billing Engine',
    description: 'On-premises billing batch processor inherited from regional operations.',
    owner: 'Marcus Bergström',
    ownerOrgId: 'example-org-1-1',
    lifecycle: 'Legacy',
    lifecycleStartDate: '2016-03-01T00:00:00.000Z',
    contractStartDate: '2024-01-01T00:00:00.000Z',
    contractEndDate: '2026-12-31T00:00:00.000Z',
    contractDetails: 'Extended maintenance support; scheduled for migration into SAP S/4HANA.',
    vendorName: 'Custom / In-house',
    vendorUrl: 'https://example.com',
    vendorSummary: 'Internally maintained legacy billing runtime.',
    type: 'Business Application',
    criticality: '4',
    annualCost: 1450000,
    functionalFit: '4',
    technicalFit: '2',
    timeRationale: 'Handles complex regional tariffs well (high functional fit) but runs on aging infrastructure (migrate to ERP).',
    capabilityIds: ['example-cap-1-2'],
    processedInformationObjectIds: ['example-info-1', 'example-info-2'],
  },
  {
    id: 'example-app-4',
    name: 'Workday HCM',
    description: 'Cloud human capital management platform for employee records, org structure, and talent workflows.',
    owner: 'Sara Ekholm',
    ownerOrgId: 'example-org-2-2',
    lifecycle: 'Mainstream',
    lifecycleStartDate: '2023-09-01T00:00:00.000Z',
    contractStartDate: '2023-09-01T00:00:00.000Z',
    contractEndDate: '2027-08-31T00:00:00.000Z',
    contractDetails: 'Per-employee-per-month SaaS subscription.',
    vendorName: 'Workday',
    vendorUrl: 'https://www.workday.com',
    vendorSummary: 'Enterprise cloud platform for human resources and financial management.',
    type: 'Business Application',
    criticality: '4',
    annualCost: 1800000,
    functionalFit: '5',
    technicalFit: '5',
    timeRationale: 'Modern SaaS system of record for workforce data.',
    capabilityIds: ['example-cap-2-2'],
    processedInformationObjectIds: ['example-info-4'],
  },
  {
    id: 'example-app-5',
    name: 'Okta Workforce Identity',
    description: 'Centralized identity provider delivering SSO, MFA, and automated lifecycle provisioning.',
    owner: 'Erik Söderlund',
    ownerOrgId: 'example-org-3-1',
    lifecycle: 'Mainstream',
    lifecycleStartDate: '2022-01-10T00:00:00.000Z',
    contractStartDate: '2025-01-01T00:00:00.000Z',
    contractEndDate: '2028-01-01T00:00:00.000Z',
    contractDetails: 'Enterprise identity and lifecycle management license.',
    vendorName: 'Okta',
    vendorUrl: 'https://www.okta.com',
    vendorSummary: 'Identity and access management cloud platform.',
    type: 'Infrastructure Service',
    criticality: '5',
    annualCost: 950000,
    functionalFit: '5',
    technicalFit: '5',
    timeRationale: 'Foundational zero-trust control plane across all enterprise applications.',
    capabilityIds: ['example-cap-3-1'],
    processedInformationObjectIds: ['example-info-4', 'example-info-5'],
  },
  {
    id: 'example-app-6',
    name: 'Snowflake Data Cloud',
    description: 'Enterprise analytics data platform consolidating commercial and financial datasets.',
    owner: 'Erik Söderlund',
    ownerOrgId: 'example-org-3-1',
    lifecycle: 'Onboarding',
    lifecycleStartDate: '2025-02-01T00:00:00.000Z',
    contractStartDate: '2025-02-01T00:00:00.000Z',
    contractEndDate: '2028-01-31T00:00:00.000Z',
    contractDetails: 'Capacity commitment for enterprise analytics workloads.',
    vendorName: 'Snowflake',
    vendorUrl: 'https://www.snowflake.com',
    vendorSummary: 'Cloud data platform for data warehousing and analytics.',
    type: 'Platform',
    criticality: '3',
    annualCost: 1100000,
    functionalFit: '4',
    technicalFit: '5',
    timeRationale: 'Target platform for unified reporting and AI readiness.',
    capabilityIds: ['example-cap-3-2'],
    processedInformationObjectIds: ['example-info-1', 'example-info-2', 'example-info-3'],
  },
  {
    id: 'example-app-7',
    name: 'Regional Sales Tracker Spreadsheet Server',
    description: 'Standalone departmental tool used to track manual sales commissions.',
    owner: 'Anna Lindqvist',
    ownerOrgId: 'example-org-1-1',
    lifecycle: 'Legacy',
    lifecycleStartDate: '2018-05-01T00:00:00.000Z',
    contractStartDate: '2024-05-01T00:00:00.000Z',
    contractEndDate: '2026-06-30T00:00:00.000Z',
    contractDetails: 'Departmental hosting; slated for decommissioning.',
    vendorName: 'Legacy Vendor',
    vendorUrl: 'https://example.com',
    vendorSummary: 'Deprecated departmental reporting utility.',
    type: 'Desktop Application',
    criticality: '2',
    annualCost: 320000,
    functionalFit: '2',
    technicalFit: '1',
    timeRationale: 'Duplicate functionality already covered by Salesforce CRM and Snowflake.',
    capabilityIds: ['example-cap-1-1'],
    processedInformationObjectIds: ['example-info-1'],
  },
];

export const EXAMPLE_INTEGRATIONS: ExampleIntegrationSeed[] = [
  {
    id: 'example-int-1',
    name: 'Customer Sync (CRM to ERP)',
    description: 'Synchronizes approved customer master accounts from Salesforce CRM into SAP S/4HANA.',
    sourceAppId: 'example-app-1',
    targetAppId: 'example-app-2',
    infoObjectId: 'example-info-1',
    pattern: 'REST API',
    type: 'API',
    frequency: 'Real-time',
    crud: 'Create, Update',
  },
  {
    id: 'example-int-2',
    name: 'Legacy Billing Feed',
    description: 'Sends active customer contracts to the Legacy Billing Engine for nightly invoice calculation.',
    sourceAppId: 'example-app-1',
    targetAppId: 'example-app-3',
    infoObjectId: 'example-info-2',
    pattern: 'Batch File',
    type: 'Batch',
    frequency: 'Nightly Batch',
    crud: 'Create, Read',
  },
  {
    id: 'example-int-3',
    name: 'Invoice GL Posting',
    description: 'Posts billed invoice totals from the Legacy Billing Engine into SAP S/4HANA General Ledger.',
    sourceAppId: 'example-app-3',
    targetAppId: 'example-app-2',
    infoObjectId: 'example-info-3',
    pattern: 'Batch File',
    type: 'Batch',
    frequency: 'Nightly Batch',
    crud: 'Create',
  },
  {
    id: 'example-int-4',
    name: 'Workforce Identity Provisioning',
    description: 'Streams joiner, mover, and leaver events from Workday HCM into Okta Workforce Identity.',
    sourceAppId: 'example-app-4',
    targetAppId: 'example-app-5',
    infoObjectId: 'example-info-4',
    pattern: 'REST API',
    type: 'API',
    frequency: 'Real-time',
    crud: 'Create, Update, Delete',
  },
  {
    id: 'example-int-5',
    name: 'Commercial Analytics Replication',
    description: 'Replicates customer and opportunity pipeline records into Snowflake Data Cloud.',
    sourceAppId: 'example-app-1',
    targetAppId: 'example-app-6',
    infoObjectId: 'example-info-1',
    pattern: 'Event/Message Queue',
    type: 'Messaging',
    frequency: 'Hourly',
    crud: 'Read',
  },
  {
    id: 'example-int-6',
    name: 'Financial Ledger Replication',
    description: 'Loads general ledger and invoice facts from SAP S/4HANA into Snowflake Data Cloud.',
    sourceAppId: 'example-app-2',
    targetAppId: 'example-app-6',
    infoObjectId: 'example-info-3',
    pattern: 'Batch File',
    type: 'Batch',
    frequency: 'Hourly',
    crud: 'Read',
  },
];

export interface ExampleConceptStatus {
  concept: ExampleConceptKey;
  title: string;
  description: string;
  active: boolean;
  installedCount: number;
  totalCount: number;
  requires: ExampleConceptKey[];
  sampleRecords: { id: string; name: string; detail: string }[];
}

const CONCEPT_META: Record<ExampleConceptKey, { title: string; description: string; requires: ExampleConceptKey[] }> = {
  capabilities: {
    title: 'Capabilities',
    description: 'A 2-level hierarchy of 9 business capabilities across Customer & Revenue, Enterprise Operations, and Digital Platforms.',
    requires: [],
  },
  'strategic-goals': {
    title: 'Strategic Goals',
    description: '4 strategic goals and sub-goals linked to the capabilities they require.',
    requires: [],
  },
  organizations: {
    title: 'Organizations',
    description: '7 organizational units across Divisions, Departments, and Teams with capability accountabilities.',
    requires: [],
  },
  'information-objects': {
    title: 'Information Model',
    description: '5 governed business data objects with CIA confidentiality/integrity/availability and PII classifications.',
    requires: [],
  },
  applications: {
    title: 'Applications',
    description: '7 applications spanning Invest, Migrate, Tolerate, and Eliminate dispositions with costs, vendors, and lifecycle dates.',
    requires: [],
  },
  integrations: {
    title: 'Integrations',
    description: '6 data flows connecting the example applications and information object payloads (requires Applications example data).',
    requires: ['applications'],
  },
};

export async function getExampleDataStatus(prisma: PrismaClient): Promise<{ concepts: ExampleConceptStatus[] }> {
  const capIds = EXAMPLE_CAPABILITIES.map((c) => c.id);
  const goalIds = EXAMPLE_STRATEGIC_GOALS.map((g) => g.id);
  const orgIds = EXAMPLE_ORGANIZATIONS.map((o) => o.id);
  const infoIds = EXAMPLE_INFORMATION_OBJECTS.map((i) => i.id);
  const appIds = EXAMPLE_APPLICATIONS.map((a) => a.id);
  const intIds = EXAMPLE_INTEGRATIONS.map((i) => i.id);

  const [capCount, goalCount, orgCount, infoCount, appCount, intCount] = await Promise.all([
    prisma.capability.count({ where: { id: { in: capIds } } }),
    prisma.strategicGoal.count({ where: { id: { in: goalIds } } }),
    prisma.organization.count({ where: { id: { in: orgIds } } }),
    prisma.informationObject.count({ where: { id: { in: infoIds } } }),
    prisma.application.count({ where: { id: { in: appIds } } }),
    prisma.integration.count({ where: { id: { in: intIds } } }),
  ]);

  const counts: Record<ExampleConceptKey, { installed: number; total: number; samples: { id: string; name: string; detail: string }[] }> = {
    capabilities: {
      installed: capCount,
      total: EXAMPLE_CAPABILITIES.length,
      samples: EXAMPLE_CAPABILITIES.map((c) => ({ id: c.id, name: c.name, detail: `Criticality ${c.criticality}` })),
    },
    'strategic-goals': {
      installed: goalCount,
      total: EXAMPLE_STRATEGIC_GOALS.length,
      samples: EXAMPLE_STRATEGIC_GOALS.map((g) => ({ id: g.id, name: g.name, detail: g.description.slice(0, 72) })),
    },
    organizations: {
      installed: orgCount,
      total: EXAMPLE_ORGANIZATIONS.length,
      samples: EXAMPLE_ORGANIZATIONS.map((o) => ({ id: o.id, name: o.name, detail: o.type })),
    },
    'information-objects': {
      installed: infoCount,
      total: EXAMPLE_INFORMATION_OBJECTS.length,
      samples: EXAMPLE_INFORMATION_OBJECTS.map((i) => ({ id: i.id, name: i.name, detail: `${i.type} · PII ${i.piiCategory}` })),
    },
    applications: {
      installed: appCount,
      total: EXAMPLE_APPLICATIONS.length,
      samples: EXAMPLE_APPLICATIONS.map((a) => ({ id: a.id, name: a.name, detail: `${a.lifecycle} · ${a.vendorName}` })),
    },
    integrations: {
      installed: intCount,
      total: EXAMPLE_INTEGRATIONS.length,
      samples: EXAMPLE_INTEGRATIONS.map((i) => ({ id: i.id, name: i.name, detail: `${i.pattern} · ${i.frequency}` })),
    },
  };

  return {
    concepts: EXAMPLE_CONCEPT_KEYS.map((key) => ({
      concept: key,
      title: CONCEPT_META[key].title,
      description: CONCEPT_META[key].description,
      active: counts[key].installed > 0,
      installedCount: counts[key].installed,
      totalCount: counts[key].total,
      requires: CONCEPT_META[key].requires,
      sampleRecords: counts[key].samples,
    })),
  };
}

export async function applyExampleDataConcepts(
  prisma: PrismaClient,
  requested: Partial<Record<ExampleConceptKey, boolean>>,
  costScale: readonly [number, number, number, number] = DEFAULT_COST_SCALE,
): Promise<{ concepts: ExampleConceptStatus[] }> {
  const current = await getExampleDataStatus(prisma);
  const desired: Record<ExampleConceptKey, boolean> = Object.fromEntries(
    current.concepts.map((item) => [item.concept, item.active]),
  ) as Record<ExampleConceptKey, boolean>;

  for (const key of EXAMPLE_CONCEPT_KEYS) {
    if (typeof requested[key] === 'boolean') {
      desired[key] = requested[key]!;
    }
  }

  // Enforce dependency between integrations and applications:
  if (requested.applications === false) {
    desired.integrations = false;
  } else if (desired.integrations) {
    desired.applications = true;
  }

  // 1. Delete deactivated concepts in reverse dependency order
  if (!desired.integrations) {
    await prisma.integration.deleteMany({ where: { id: { in: EXAMPLE_INTEGRATIONS.map((i) => i.id) } } });
  }
  if (!desired.applications) {
    await prisma.application.deleteMany({ where: { id: { in: EXAMPLE_APPLICATIONS.map((a) => a.id) } } });
  }
  if (!desired['information-objects']) {
    await prisma.informationObject.deleteMany({ where: { id: { in: EXAMPLE_INFORMATION_OBJECTS.map((i) => i.id) } } });
  }
  if (!desired.organizations) {
    // Clear parentId first so self-referential cascade or ordering never conflicts
    await prisma.organization.updateMany({
      where: { id: { in: EXAMPLE_ORGANIZATIONS.map((o) => o.id) } },
      data: { parentId: null },
    });
    await prisma.organization.deleteMany({ where: { id: { in: EXAMPLE_ORGANIZATIONS.map((o) => o.id) } } });
  }
  if (!desired['strategic-goals']) {
    await prisma.strategicGoal.updateMany({
      where: { id: { in: EXAMPLE_STRATEGIC_GOALS.map((g) => g.id) } },
      data: { parentId: null },
    });
    await prisma.strategicGoal.deleteMany({ where: { id: { in: EXAMPLE_STRATEGIC_GOALS.map((g) => g.id) } } });
  }
  if (!desired.capabilities) {
    await prisma.capability.updateMany({
      where: { id: { in: EXAMPLE_CAPABILITIES.map((c) => c.id) } },
      data: { parentId: null },
    });
    await prisma.capability.deleteMany({ where: { id: { in: EXAMPLE_CAPABILITIES.map((c) => c.id) } } });
  }

  // 2. Create or update active concepts in dependency order, wiring relations to any active concepts
  if (desired.capabilities) {
    for (const cap of EXAMPLE_CAPABILITIES) {
      const existing = await prisma.capability.findUnique({ where: { id: cap.id }, select: { id: true } });
      if (existing) {
        await prisma.capability.update({
          where: { id: cap.id },
          data: {
            name: cap.name,
            description: cap.description,
            criticality: cap.criticality,
            parentId: cap.parentId,
          },
        });
      } else {
        await prisma.capability.create({
          data: {
            id: cap.id,
            name: cap.name,
            description: cap.description,
            criticality: cap.criticality,
            parentId: cap.parentId,
          },
        });
      }
    }
  }

  if (desired['strategic-goals']) {
    for (const goal of EXAMPLE_STRATEGIC_GOALS) {
      const capLinks = desired.capabilities ? goal.capabilityIds.map((id) => ({ id })) : [];
      const existing = await prisma.strategicGoal.findUnique({ where: { id: goal.id }, select: { id: true } });
      if (existing) {
        await prisma.strategicGoal.update({
          where: { id: goal.id },
          data: {
            name: goal.name,
            description: goal.description,
            parentId: goal.parentId,
            capabilities: { set: capLinks },
          },
        });
      } else {
        await prisma.strategicGoal.create({
          data: {
            id: goal.id,
            name: goal.name,
            description: goal.description,
            parentId: goal.parentId,
            capabilities: capLinks.length > 0 ? { connect: capLinks } : undefined,
          },
        });
      }
    }
  }

  if (desired.organizations) {
    for (const org of EXAMPLE_ORGANIZATIONS) {
      const capLinks = desired.capabilities ? org.supportedCapabilityIds.map((id) => ({ id })) : [];
      const existing = await prisma.organization.findUnique({ where: { id: org.id }, select: { id: true } });
      if (existing) {
        await prisma.organization.update({
          where: { id: org.id },
          data: {
            name: org.name,
            description: org.description,
            type: org.type,
            parentId: org.parentId,
            supportedCapabilities: { set: capLinks },
          },
        });
      } else {
        await prisma.organization.create({
          data: {
            id: org.id,
            name: org.name,
            description: org.description,
            type: org.type,
            parentId: org.parentId,
            supportedCapabilities: capLinks.length > 0 ? { connect: capLinks } : undefined,
          },
        });
      }
    }
  }

  // Create/update InformationObjects first (without appOwnerId if applications aren't created yet),
  // then Applications, then link appOwnerId on InformationObjects if both are active.
  if (desired['information-objects']) {
    for (const info of EXAMPLE_INFORMATION_OBJECTS) {
      const businessOwnerId = desired.organizations ? info.businessOwnerOrgId : null;
      const existing = await prisma.informationObject.findUnique({ where: { id: info.id }, select: { id: true } });
      if (existing) {
        await prisma.informationObject.update({
          where: { id: info.id },
          data: {
            name: info.name,
            aliases: info.aliases,
            description: info.description,
            confidentiality: info.confidentiality,
            integrity: info.integrity,
            availability: info.availability,
            piiCategory: info.piiCategory,
            type: info.type,
            businessOwnerId,
          },
        });
      } else {
        await prisma.informationObject.create({
          data: {
            id: info.id,
            name: info.name,
            aliases: info.aliases,
            description: info.description,
            confidentiality: info.confidentiality,
            integrity: info.integrity,
            availability: info.availability,
            piiCategory: info.piiCategory,
            type: info.type,
            businessOwnerId,
          },
        });
      }
    }
  }

  if (desired.applications) {
    for (const app of EXAMPLE_APPLICATIONS) {
      const ownerOrgId = desired.organizations ? app.ownerOrgId : null;
      const capLinks = desired.capabilities ? app.capabilityIds.map((id) => ({ id })) : [];
      const infoLinks = desired['information-objects'] ? app.processedInformationObjectIds.map((id) => ({ id })) : [];
      const cost = costTierForAmount(app.annualCost, costScale);
      const existing = await prisma.application.findUnique({ where: { id: app.id }, select: { id: true } });
      if (existing) {
        await prisma.application.update({
          where: { id: app.id },
          data: {
            name: app.name,
            description: app.description,
            owner: app.owner,
            ownerOrgId,
            lifecycle: app.lifecycle,
            lifecycleStartDate: new Date(app.lifecycleStartDate),
            contractStartDate: new Date(app.contractStartDate),
            contractEndDate: new Date(app.contractEndDate),
            contractDetails: app.contractDetails,
            vendorName: app.vendorName,
            vendorUrl: app.vendorUrl,
            vendorSummary: app.vendorSummary,
            type: app.type,
            criticality: app.criticality,
            annualCost: app.annualCost,
            cost,
            functionalFit: app.functionalFit,
            technicalFit: app.technicalFit,
            timeRationale: app.timeRationale,
            capabilities: { set: capLinks },
            processedInformationObjects: { set: infoLinks },
          },
        });
      } else {
        await prisma.application.create({
          data: {
            id: app.id,
            name: app.name,
            description: app.description,
            owner: app.owner,
            ownerOrgId,
            lifecycle: app.lifecycle,
            lifecycleStartDate: new Date(app.lifecycleStartDate),
            contractStartDate: new Date(app.contractStartDate),
            contractEndDate: new Date(app.contractEndDate),
            contractDetails: app.contractDetails,
            vendorName: app.vendorName,
            vendorUrl: app.vendorUrl,
            vendorSummary: app.vendorSummary,
            type: app.type,
            criticality: app.criticality,
            annualCost: app.annualCost,
            cost,
            functionalFit: app.functionalFit,
            technicalFit: app.technicalFit,
            timeRationale: app.timeRationale,
            capabilities: capLinks.length > 0 ? { connect: capLinks } : undefined,
            processedInformationObjects: infoLinks.length > 0 ? { connect: infoLinks } : undefined,
          },
        });
      }
    }
  }

  // Link InformationObject.appOwnerId now that applications exist (if active)
  if (desired['information-objects']) {
    for (const info of EXAMPLE_INFORMATION_OBJECTS) {
      await prisma.informationObject.update({
        where: { id: info.id },
        data: {
          appOwnerId: desired.applications ? info.appOwnerId : null,
        },
      });
    }
  }

  if (desired.integrations && desired.applications) {
    for (const integration of EXAMPLE_INTEGRATIONS) {
      const infoObjectId = desired['information-objects'] ? integration.infoObjectId : null;
      const existing = await prisma.integration.findUnique({ where: { id: integration.id }, select: { id: true } });
      if (existing) {
        await prisma.integration.update({
          where: { id: integration.id },
          data: {
            name: integration.name,
            description: integration.description,
            sourceAppId: integration.sourceAppId,
            targetAppId: integration.targetAppId,
            infoObjectId,
            pattern: integration.pattern,
            type: integration.type,
            frequency: integration.frequency,
            crud: integration.crud,
          },
        });
      } else {
        await prisma.integration.create({
          data: {
            id: integration.id,
            name: integration.name,
            description: integration.description,
            sourceAppId: integration.sourceAppId,
            targetAppId: integration.targetAppId,
            infoObjectId,
            pattern: integration.pattern,
            type: integration.type,
            frequency: integration.frequency,
            crud: integration.crud,
          },
        });
      }
    }
  }

  return getExampleDataStatus(prisma);
}
