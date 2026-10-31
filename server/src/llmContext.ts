import type { PrismaClient } from '@prisma/client';

// Same rule as getAppTimeAssessment in client/src/timeAssessment.ts.
// A missing functional or technical score is treated as 3, the stored default.
const TIME_HIGH = 3;

export interface TimeCutoffs {
  technicalFit?: number;
  functionalFit?: number;
}

function cutoff(value: number | undefined, fallback = TIME_HIGH): number {
  if (value == null || !Number.isFinite(value)) return fallback;
  return Math.min(5, Math.max(1, value));
}
const NOTE_LIMIT = 160;
const CONTEXT_CHAR_BUDGET = 100_000;

const COLUMN_FIELDS: Record<string, ReadonlySet<string>> = {
  Application: new Set(['criticality', 'cost', 'functionalFit', 'technicalFit']),
  Capability: new Set(['criticality']),
  InformationObject: new Set(['confidentiality', 'integrity', 'availability', 'piiCategory']),
};

type Named = { name: string };

type MetadataDefinitionRow = {
  entityType: string;
  fieldName: string;
  fieldType: string;
  label: string;
  description: string | null;
};

const ATTRIBUTE_TYPES: Record<string, string> = {
  string: 'text',
  textarea: 'long text',
  number: 'number',
  range: 'range',
  date: 'date',
  boolean: 'yes or no',
};

const ATTRIBUTE_SUBJECTS: Record<string, string> = {
  Application: 'Application',
  Capability: 'Capability',
  InformationObject: 'Information',
  Organization: 'Organization',
  StrategicGoal: 'Strategic goal',
  Integration: 'Integration',
};

export type PortfolioSnapshot = {
  applications: Array<{
    name: string;
    description: string | null;
    owner: string | null;
    lifecycle: string | null;
    lifecycleStartDate: Date | null;
    lifecycleEndDate: Date | null;
    contractStartDate: Date | null;
    contractEndDate: Date | null;
    contractDetails: string | null;
    vendorName: string | null;
    vendorUrl: string | null;
    vendorSummary: string | null;
    type: string | null;
    criticality: string | null;
    cost: string | null;
    functionalFit: string | null;
    technicalFit: string | null;
    timeRationale: string | null;
    metadata: string | null;
    references: string | null;
    ownerOrg: Named | null;
    capabilities: Named[];
  }>;
  strategicGoals: Array<{
    name: string;
    description: string | null;
    references: string | null;
    parent: Named | null;
    capabilities: Named[];
  }>;
  capabilities: Array<{
    name: string;
    description: string | null;
    criticality: string | null;
    metadata: string | null;
    references: string | null;
    parent: Named | null;
  }>;
  organizations: Array<{
    name: string;
    description: string | null;
    type: string | null;
    references: string | null;
    parent: Named | null;
    supportedCapabilities: Named[];
  }>;
  informationObjects: Array<{
    name: string;
    aliases: string | null;
    description: string | null;
    confidentiality: string | null;
    integrity: string | null;
    availability: string | null;
    piiCategory: string | null;
    type: string | null;
    metadata: string | null;
    references: string | null;
    businessOwner: Named | null;
    appOwner: Named | null;
    processingApplications: Named[];
  }>;
  integrations: Array<{
    name: string | null;
    description: string | null;
    pattern: string | null;
    type: string | null;
    frequency: string | null;
    crud: string | null;
    references: string | null;
    sourceApp: Named;
    targetApp: Named;
    payload: Named | null;
  }>;
  metadataDefinitions: MetadataDefinitionRow[];
};

export function timeLabel(
  functionalFit: string | null | undefined,
  technicalFit: string | null | undefined,
  cutoffs: TimeCutoffs = {},
): string | null {
  const tech = Number(technicalFit);
  const func = Number(functionalFit);
  const hasTech = Number.isFinite(tech) && tech > 0;
  const hasFunc = Number.isFinite(func) && func > 0;
  if (!hasTech && !hasFunc) return null;
  const tVal = hasTech ? Math.max(1, Math.min(5, tech)) : 3;
  const fVal = hasFunc ? Math.max(1, Math.min(5, func)) : 3;
  const techHigh = cutoff(cutoffs.technicalFit);
  const funcHigh = cutoff(cutoffs.functionalFit);
  if (tVal >= techHigh && fVal >= funcHigh) return 'Invest';
  if (fVal >= funcHigh) return 'Migrate';
  if (tVal >= techHigh) return 'Tolerate';
  return 'Eliminate';
}

function clip(value: string | null | undefined, max = NOTE_LIMIT): string | null {
  if (!value) return null;
  const text = value.replace(/\s+/g, ' ').trim();
  if (!text) return null;
  if (text.length <= max) return text;
  return `${text.slice(0, max - 1).trimEnd()}…`;
}

function day(value: Date | null): string | null {
  if (!value || Number.isNaN(value.getTime())) return null;
  return value.toISOString().slice(0, 10);
}

function dateSpan(start: Date | null, end: Date | null): string | null {
  const from = day(start);
  const to = day(end);
  if (from && to) return `${from} to ${to}`;
  if (from) return `from ${from}`;
  if (to) return `until ${to}`;
  return null;
}

function field(label: string, value: string | null | undefined): string | null {
  if (!value) return null;
  return `${label}: ${value}`;
}

function line(title: string, parts: Array<string | null>): string {
  const rest = parts.filter((part): part is string => !!part);
  return rest.length ? `- ${title} | ${rest.join(' | ')}` : `- ${title}`;
}

function sortedNames(rows: Named[]): string | null {
  if (rows.length === 0) return null;
  return [...rows].map((row) => row.name).sort((a, b) => a.localeCompare(b)).join(', ');
}

function readMetadata(raw: string | null): Record<string, unknown> | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
    return parsed as Record<string, unknown>;
  } catch {
    return null;
  }
}

function showValue(fieldType: string, value: unknown): string | null {
  if (value === undefined || value === null || value === '') return null;
  if (fieldType === 'boolean') {
    if (value === true || value === 'true') return 'yes';
    if (value === false || value === 'false') return 'no';
  }
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return clip(String(value), 80);
  }
  return clip(JSON.stringify(value), 80);
}

function customAttributeGuide(definitions: MetadataDefinitionRow[]): string[] {
  return definitions.flatMap((def) => {
    if ((COLUMN_FIELDS[def.entityType] ?? new Set()).has(def.fieldName)) return [];
    const subject = ATTRIBUTE_SUBJECTS[def.entityType] ?? def.entityType;
    const type = ATTRIBUTE_TYPES[def.fieldType] ?? def.fieldType;
    const description = def.description?.trim();
    const meaning = description ? `: ${clip(description, 500)}` : '';
    return [`- ${subject} / ${def.label} (${def.fieldName}, ${type})${meaning}`];
  });
}

function customFields(entityType: string, raw: string | null, definitions: MetadataDefinitionRow[]): string[] {
  const data = readMetadata(raw);
  if (!data) return [];
  const skip = COLUMN_FIELDS[entityType] ?? new Set<string>();
  const parts: string[] = [];
  for (const def of definitions) {
    if (def.entityType !== entityType || skip.has(def.fieldName)) continue;
    const shown = showValue(def.fieldType, data[def.fieldName]);
    if (shown) parts.push(`${def.label}: ${shown}`);
  }
  return parts;
}

function referenceField(raw: string | null): string | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return field('resources', clip(raw, 200));
    const items = parsed
      .map((item) => {
        if (!item || typeof item !== 'object') return null;
        const row = item as { url?: unknown; title?: unknown };
        const url = typeof row.url === 'string' ? row.url.trim() : '';
        if (!url) return null;
        const title = typeof row.title === 'string' ? row.title.trim() : '';
        return title ? `${title} (${url})` : url;
      })
      .filter((item): item is string => !!item);
    return field('resources', clip(items.join('; '), 200));
  } catch {
    return field('resources', clip(raw, 200));
  }
}

function section(title: string, rows: string[]): string {
  return [`## ${title}`, rows.length ? rows.join('\n') : 'None recorded.'].join('\n');
}

export function formatPortfolioContext(snapshot: PortfolioSnapshot, includeNotes = true, cutoffs: TimeCutoffs = {}): string {
  const techHigh = cutoff(cutoffs.technicalFit);
  const funcHigh = cutoff(cutoffs.functionalFit);
  const note = (value: string | null) => (includeNotes ? clip(value) : null);
  const applications = [...snapshot.applications].sort((a, b) => a.name.localeCompare(b.name));
  const strategicGoals = [...snapshot.strategicGoals].sort((a, b) => a.name.localeCompare(b.name));
  const capabilities = [...snapshot.capabilities].sort((a, b) => a.name.localeCompare(b.name));
  const organizations = [...snapshot.organizations].sort((a, b) => a.name.localeCompare(b.name));
  const informationObjects = [...snapshot.informationObjects].sort((a, b) => a.name.localeCompare(b.name));
  const integrations = [...snapshot.integrations].sort((a, b) => {
    const left = `${a.sourceApp.name}\n${a.targetApp.name}\n${a.name ?? ''}`;
    const right = `${b.sourceApp.name}\n${b.targetApp.name}\n${b.name ?? ''}`;
    return left.localeCompare(right);
  });
  const attributeGuide = customAttributeGuide(snapshot.metadataDefinitions);

  const applicationLines = applications.map((app) => {
    const lifecycleSpan = dateSpan(app.lifecycleStartDate, app.lifecycleEndDate);
    const lifecycle = app.lifecycle && lifecycleSpan
      ? `lifecycle: ${app.lifecycle} (${lifecycleSpan})`
      : app.lifecycle
        ? `lifecycle: ${app.lifecycle}`
        : lifecycleSpan
          ? `lifecycle: ${lifecycleSpan}`
          : null;
    return line(app.name, [
      field('type', app.type),
      field('owner', app.owner),
      field('organization', app.ownerOrg?.name),
      lifecycle,
      field('vendor', app.vendorName),
      field('vendor home page', app.vendorUrl),
      field('vendor summary', note(app.vendorSummary)),
      field('contract', dateSpan(app.contractStartDate, app.contractEndDate)),
      field('contract note', note(app.contractDetails)),
      field('cost', app.cost),
      field('criticality', app.criticality),
      field('functional fit', app.functionalFit),
      field('technical fit', app.technicalFit),
      field('TIME', timeLabel(app.functionalFit, app.technicalFit, cutoffs)),
      field('TIME rationale', note(app.timeRationale)),
      field('capabilities', sortedNames(app.capabilities)),
      ...customFields('Application', app.metadata, snapshot.metadataDefinitions),
      field('description', note(app.description)),
      includeNotes ? referenceField(app.references) : null,
    ]);
  });

  const strategicGoalLines = strategicGoals.map((goal) => line(goal.name, [
    field('parent', goal.parent?.name ?? 'none'),
    field('requires', sortedNames(goal.capabilities)),
    field('description', note(goal.description)),
    includeNotes ? referenceField(goal.references) : null,
  ]));

  const capabilityLines = capabilities.map((capability) => line(capability.name, [
    field('parent', capability.parent?.name ?? 'none'),
    field('criticality', capability.criticality),
    ...customFields('Capability', capability.metadata, snapshot.metadataDefinitions),
    field('description', note(capability.description)),
    includeNotes ? referenceField(capability.references) : null,
  ]));

  const organizationLines = organizations.map((organization) => line(organization.name, [
    field('type', organization.type),
    field('parent', organization.parent?.name ?? 'none'),
    field('supports', sortedNames(organization.supportedCapabilities)),
    field('description', note(organization.description)),
    includeNotes ? referenceField(organization.references) : null,
  ]));

  const informationLines = informationObjects.map((info) => line(info.name, [
    field('aliases', note(info.aliases)),
    field('type', info.type),
    field('confidentiality', info.confidentiality),
    field('integrity', info.integrity),
    field('availability', info.availability),
    field('PII', info.piiCategory),
    field('business owner', info.businessOwner?.name),
    field('owning application', info.appOwner?.name),
    field('processed by', sortedNames(info.processingApplications)),
    ...customFields('InformationObject', info.metadata, snapshot.metadataDefinitions),
    field('description', note(info.description)),
    includeNotes ? referenceField(info.references) : null,
  ]));

  const integrationLines = integrations.map((integration) => line(`${integration.sourceApp.name} → ${integration.targetApp.name}`, [
    integration.name,
    field('type', integration.type),
    field('pattern', integration.pattern),
    field('frequency', integration.frequency),
    field('CRUD', integration.crud),
    field('payload', integration.payload?.name),
    field('description', note(integration.description)),
    includeNotes ? referenceField(integration.references) : null,
  ]));

  return [
    '# OpenEA workspace data',
    `Records: ${applications.length} applications, ${strategicGoals.length} strategic goals, ${capabilities.length} capabilities, ${organizations.length} organizations, ${informationObjects.length} information objects, ${integrations.length} integrations.`,
    'This is the full current portfolio, not a sample.',
    `Scores run from 1 to 5. A missing functional fit or technical fit is treated as 3. TIME treats technical fit ${techHigh} or above, and functional fit ${funcHigh} or above, as high: Invest when both are high, Migrate when only functional fit is high, Tolerate when only technical fit is high, Eliminate when both are low. TIME is omitted when both scores are missing.`,
    'Custom attributes are listed on a record only when a value is stored. Use the description in Custom attributes when you interpret a value.',
    ...(includeNotes ? [] : ['Descriptions, contract notes, vendor summaries, TIME rationales, aliases, and resource lists were omitted because the snapshot was too long.']),
    ...(attributeGuide.length ? ['', section('Custom attributes', attributeGuide)] : []),
    '',
    section('Applications', applicationLines),
    '',
    section('Strategic goals', strategicGoalLines),
    '',
    section('Capabilities', capabilityLines),
    '',
    section('Organizations', organizationLines),
    '',
    section('Information objects', informationLines),
    '',
    section('Integrations', integrationLines),
  ].join('\n');
}

async function loadPortfolio(prisma: PrismaClient): Promise<PortfolioSnapshot> {
  const [applications, strategicGoals, capabilities, organizations, informationObjects, integrations, metadataDefinitions] = await Promise.all([
    prisma.application.findMany({
      orderBy: { name: 'asc' },
      select: {
        name: true,
        description: true,
        owner: true,
        lifecycle: true,
        lifecycleStartDate: true,
        lifecycleEndDate: true,
        contractStartDate: true,
        contractEndDate: true,
        contractDetails: true,
        vendorName: true,
        vendorUrl: true,
        vendorSummary: true,
        type: true,
        criticality: true,
        cost: true,
        functionalFit: true,
        technicalFit: true,
        timeRationale: true,
        metadata: true,
        references: true,
        ownerOrg: { select: { name: true } },
        capabilities: { select: { name: true } },
      },
    }),
    prisma.strategicGoal.findMany({
      orderBy: { name: 'asc' },
      select: {
        name: true,
        description: true,
        references: true,
        parent: { select: { name: true } },
        capabilities: { select: { name: true } },
      },
    }),
    prisma.capability.findMany({
      orderBy: { name: 'asc' },
      select: {
        name: true,
        description: true,
        criticality: true,
        metadata: true,
        references: true,
        parent: { select: { name: true } },
      },
    }),
    prisma.organization.findMany({
      orderBy: { name: 'asc' },
      select: {
        name: true,
        description: true,
        type: true,
        references: true,
        parent: { select: { name: true } },
        supportedCapabilities: { select: { name: true } },
      },
    }),
    prisma.informationObject.findMany({
      orderBy: { name: 'asc' },
      select: {
        name: true,
        aliases: true,
        description: true,
        confidentiality: true,
        integrity: true,
        availability: true,
        piiCategory: true,
        type: true,
        metadata: true,
        references: true,
        businessOwner: { select: { name: true } },
        appOwner: { select: { name: true } },
        processingApplications: { select: { name: true } },
      },
    }),
    prisma.integration.findMany({
      select: {
        name: true,
        description: true,
        pattern: true,
        type: true,
        frequency: true,
        crud: true,
        references: true,
        sourceApp: { select: { name: true } },
        targetApp: { select: { name: true } },
        payload: { select: { name: true } },
      },
    }),
    prisma.metadataDefinition.findMany({
      orderBy: { label: 'asc' },
      select: { entityType: true, fieldName: true, fieldType: true, label: true, description: true },
    }),
  ]);

  return { applications, strategicGoals, capabilities, organizations, informationObjects, integrations, metadataDefinitions };
}

// Full compact snapshot for a question or a future tip. Callers decide when it is needed.
export async function buildPortfolioContext(prisma: PrismaClient, cutoffs: TimeCutoffs = {}): Promise<string> {
  const snapshot = await loadPortfolio(prisma);
  const full = formatPortfolioContext(snapshot, true, cutoffs);
  if (full.length <= CONTEXT_CHAR_BUDGET) return full;
  return formatPortfolioContext(snapshot, false, cutoffs);
}
