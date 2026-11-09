import type { PrismaClient } from '@prisma/client';
import { completeConversation, LlmError, type LlmCallConfig } from './llm.js';
import { costTierForAmount, DEFAULT_COST_SCALE } from './cost.js';

export const FLAT_CSV_ENTITIES = [
  'Application',
  'Capability',
  'StrategicGoal',
  'Organization',
  'InformationObject',
  'Integration',
  'Ignore',
] as const;

export type FlatCsvTargetEntity = (typeof FLAT_CSV_ENTITIES)[number];
export type ActiveFlatEntity = Exclude<FlatCsvTargetEntity, 'Ignore'>;

export interface FlatCsvColumnMapping {
  column: string;
  targetEntity: FlatCsvTargetEntity;
  targetField: string;
  separator: string;
  confidence: 'high' | 'medium' | 'low';
  assumption: string;
}

export interface FlatCsvMappingResponse {
  usedAi: boolean;
  mappings: FlatCsvColumnMapping[];
  summaryNote: string;
  providerName?: string | null;
  model?: string | null;
  fieldCatalog: Record<FlatCsvTargetEntity, { field: string; label: string; description: string; multi?: boolean }[]>;
}

export interface FlatCsvImportSummary {
  totalRows: number;
  created: Record<ActiveFlatEntity, number>;
  updated: Record<ActiveFlatEntity, number>;
  linkedRelations: number;
  warnings: string[];
}

export const ENTITY_FIELD_CATALOG: Record<FlatCsvTargetEntity, { field: string; label: string; description: string; multi?: boolean }[]> = {
  Application: [
    { field: 'name', label: 'Application Name', description: 'Unique name of the application or system' },
    { field: 'description', label: 'Description', description: 'Purpose and functions of the application' },
    { field: 'owner', label: 'Business Owner (Person)', description: 'Individual person accountable for the application' },
    { field: 'lifecycle', label: 'Lifecycle Status', description: 'Discovery, Onboarding, Mainstream, Legacy, or Decommissioned' },
    { field: 'type', label: 'Application Type', description: 'Business Application, Infrastructure Service, Platform, or Desktop Application' },
    { field: 'vendorName', label: 'Vendor Name', description: 'Software publisher or provider name' },
    { field: 'vendorUrl', label: 'Vendor URL', description: 'Vendor website URL (https://...)' },
    { field: 'vendorSummary', label: 'Vendor Description', description: 'Summary of the vendor' },
    { field: 'annualCost', label: 'Annual Cost (Numeric)', description: 'Annual run cost in workspace currency' },
    { field: 'cost', label: 'Cost Scale (1-5)', description: 'Cost tier score from 1 to 5' },
    { field: 'criticality', label: 'Business Criticality (1-5)', description: 'Criticality score from 1 to 5' },
    { field: 'functionalFit', label: 'Functional Fit (1-5)', description: 'Functional fit score from 1 to 5' },
    { field: 'technicalFit', label: 'Technical Fit (1-5)', description: 'Technical quality score from 1 to 5' },
    { field: 'timeRationale', label: 'TIME Rationale', description: 'Notes explaining TIME disposition' },
    { field: 'lifecycleStartDate', label: 'Lifecycle Start Date', description: 'ISO or YYYY-MM-DD start date' },
    { field: 'lifecycleEndDate', label: 'Lifecycle End Date', description: 'ISO or YYYY-MM-DD end date' },
    { field: 'contractStartDate', label: 'Contract Start Date', description: 'ISO or YYYY-MM-DD contract start date' },
    { field: 'contractEndDate', label: 'Contract End Date', description: 'ISO or YYYY-MM-DD contract end date' },
    { field: 'contractDetails', label: 'Contract Details', description: 'Contract agreement notes or terms' },
  ],
  Capability: [
    { field: 'name', label: 'Capability Name', description: 'Business capability supported by the row', multi: true },
    { field: 'parentName', label: 'Parent Capability (L1)', description: 'Higher-level parent capability or domain name' },
    { field: 'description', label: 'Capability Description', description: 'Purpose and outcome of the capability' },
    { field: 'criticality', label: 'Capability Criticality (1-5)', description: 'Criticality score of the capability (1-5)' },
  ],
  StrategicGoal: [
    { field: 'name', label: 'Strategic Goal Name', description: 'Strategic goal or business initiative name', multi: true },
    { field: 'parentName', label: 'Parent Goal Name', description: 'Parent strategic goal name' },
    { field: 'description', label: 'Goal Description', description: 'Outcome the strategic goal achieves' },
  ],
  Organization: [
    { field: 'name', label: 'Organization / Department Name', description: 'Owning or supporting organizational unit' },
    { field: 'parentName', label: 'Parent Organization / Division', description: 'Parent division or organization unit' },
    { field: 'type', label: 'Organization Type', description: 'Division, Department, or Team' },
    { field: 'description', label: 'Organization Description', description: 'Scope and accountabilities of the organization' },
  ],
  InformationObject: [
    { field: 'name', label: 'Information Object Name', description: 'Business data entity or information object processed/owned', multi: true },
    { field: 'aliases', label: 'Aliases', description: 'Alternative names for the data object' },
    { field: 'description', label: 'Information Description', description: 'Definition of the business data object' },
    { field: 'type', label: 'Information Type', description: 'Master Data, Transactional, Reference, or Unstructured' },
    { field: 'confidentiality', label: 'Confidentiality (1-4)', description: 'Confidentiality score 1-4' },
    { field: 'integrity', label: 'Integrity (1-4)', description: 'Integrity score 1-4' },
    { field: 'availability', label: 'Availability (1-4)', description: 'Availability score 1-4' },
    { field: 'piiCategory', label: 'PII Category (1-4)', description: 'Personal data sensitivity score 1-4' },
  ],
  Integration: [
    { field: 'targetAppName', label: 'Target / Downstream Application', description: 'Application receiving data from this row\'s application', multi: true },
    { field: 'upstreamAppName', label: 'Source / Upstream Application', description: 'Application sending data into this row\'s application', multi: true },
    { field: 'sourceAppName', label: 'Explicit Source Application', description: 'Source application when row is purely an integration' },
    { field: 'payloadName', label: 'Integration Payload (Info Object)', description: 'Information object carried by the integration' },
    { field: 'name', label: 'Integration Name', description: 'Name or title of the integration flow' },
    { field: 'description', label: 'Integration Description', description: 'Description of the data flow' },
    { field: 'pattern', label: 'Integration Pattern', description: 'REST API, Event/Message Queue, Batch File, Direct DB Read' },
    { field: 'type', label: 'Integration Type', description: 'API, Batch, Messaging, Manual' },
    { field: 'frequency', label: 'Integration Frequency', description: 'Real-time, Hourly, Nightly Batch' },
    { field: 'crud', label: 'CRUD Operations', description: 'Create, Read, Update, Delete' },
  ],
  Ignore: [
    { field: 'ignore', label: 'Ignore Column', description: 'Do not import this column' },
  ],
};

const MAPPING_INSTRUCTIONS = `You are an Enterprise Architecture data onboarding assistant for OpenEA.
The user uploaded a flat CSV matrix where a single row can describe multiple interconnected objects in the OpenEA meta-model:
- Application (systems/tools in the portfolio)
- Organization (divisions, departments, teams that own applications or support capabilities)
- Capability (business capabilities and their parent L1 capabilities)
- StrategicGoal (strategic goals/initiatives that require capabilities)
- InformationObject (business data entities processed or owned by applications)
- Integration (connections to downstream/target or upstream/source applications, plus payload/pattern/frequency)
- Ignore (irrelevant columns such as row numbers or internal notes that do not fit)

Inspect every CSV column header and the sample values. Map each column to the best matching (targetEntity, targetField) from the allowed catalog.
If sample values in a column contain multiple items separated by ";" or "," (for example multiple capabilities, goals, data objects, or downstream apps), set "separator" to ";" or ",". Otherwise set "separator" to "".
For each column, write a concise 1-sentence "assumption" explaining why you mapped it to that concept and field and how it connects to the rest of the row.

Reply with ONE JSON object and nothing else:
{
  "summaryNote": "One or two sentences summarizing what entities and relationships were detected in this flat CSV.",
  "mappings": [
    {
      "column": "exact column header",
      "targetEntity": "Application|Capability|StrategicGoal|Organization|InformationObject|Integration|Ignore",
      "targetField": "field name from catalog",
      "separator": "",
      "confidence": "high|medium|low",
      "assumption": "Short explanation of the assumption."
    }
  ]
}`;

function detectSeparator(values: string[], targetEntity: FlatCsvTargetEntity, targetField: string): string {
  const multiCapable =
    (targetEntity === 'Capability' && targetField === 'name') ||
    (targetEntity === 'StrategicGoal' && targetField === 'name') ||
    (targetEntity === 'InformationObject' && targetField === 'name') ||
    (targetEntity === 'Integration' && (targetField === 'targetAppName' || targetField === 'upstreamAppName'));
  if (!multiCapable) return '';
  if (values.some((v) => v.includes(';'))) return ';';
  if (values.some((v) => v.includes('|'))) return '|';
  return '';
}

export function heuristicColumnMapping(
  column: string,
  sampleValues: string[],
  customAppFields: string[] = [],
): FlatCsvColumnMapping {
  const norm = column.trim().toLowerCase().replace(/[_-]+/g, ' ');
  const sep = (entity: FlatCsvTargetEntity, field: string) => detectSeparator(sampleValues, entity, field);

  // Application fields
  if (/^(app|application|system|tool|software|service|product)(\s+name|\s+title)?$/.test(norm) || norm === 'name') {
    return {
      column,
      targetEntity: 'Application',
      targetField: 'name',
      separator: '',
      confidence: 'high',
      assumption: 'Assumed this column identifies the primary Application record on each row.',
    };
  }
  if (/^(app|application|system)?\s*(description|summary|purpose|overview)$/.test(norm)) {
    return {
      column,
      targetEntity: 'Application',
      targetField: 'description',
      separator: '',
      confidence: 'high',
      assumption: 'Assumed this describes the Application purpose and scope.',
    };
  }
  if (/^(vendor|publisher|provider|supplier|manufacturer)(\s+name)?$/.test(norm)) {
    return {
      column,
      targetEntity: 'Application',
      targetField: 'vendorName',
      separator: '',
      confidence: 'high',
      assumption: 'Maps to the Application vendor or software provider name.',
    };
  }
  if (/vendor.*(url|web|site|link|home)/.test(norm)) {
    return {
      column,
      targetEntity: 'Application',
      targetField: 'vendorUrl',
      separator: '',
      confidence: 'medium',
      assumption: 'Maps to the Application vendor website URL.',
    };
  }
  if (/^(app|application|system)?\s*(owner|steward|manager|contact|responsible person)$/.test(norm)) {
    return {
      column,
      targetEntity: 'Application',
      targetField: 'owner',
      separator: '',
      confidence: 'high',
      assumption: 'Assumed this names the individual owner responsible for the Application.',
    };
  }
  if (/lifecycle|status|stage|phase/.test(norm) && !/date|start|end/.test(norm)) {
    return {
      column,
      targetEntity: 'Application',
      targetField: 'lifecycle',
      separator: '',
      confidence: 'high',
      assumption: 'Maps to the Application lifecycle stage (e.g., Mainstream, Legacy, Onboarding).',
    };
  }
  if (/^(app|application|system)\s*type$|^category$/.test(norm)) {
    return {
      column,
      targetEntity: 'Application',
      targetField: 'type',
      separator: '',
      confidence: 'high',
      assumption: 'Maps to the Application classification type.',
    };
  }
  if (/annual\s*cost|run\s*cost|yearly\s*cost|tco|spend|budget|license\s*cost|cost\s*\(/.test(norm)) {
    return {
      column,
      targetEntity: 'Application',
      targetField: 'annualCost',
      separator: '',
      confidence: 'high',
      assumption: 'Maps numeric expenditure to the Application annual run cost and derives its cost band.',
    };
  }
  if (/^cost(\s+tier|\s+band|\s+score)?$/.test(norm)) {
    const looksLargeNumber = sampleValues.some((v) => {
      const n = Number(v.replace(/[^0-9.-]/g, ''));
      return Number.isFinite(n) && n > 10;
    });
    return {
      column,
      targetEntity: 'Application',
      targetField: looksLargeNumber ? 'annualCost' : 'cost',
      separator: '',
      confidence: 'medium',
      assumption: looksLargeNumber
        ? 'Sample values exceed 1–5 scale, so this maps to numeric Annual Cost.'
        : 'Maps to the 1–5 Application Cost Scale band.',
    };
  }
  if (/functional\s*fit|business\s*fit|func\s*fit/.test(norm)) {
    return {
      column,
      targetEntity: 'Application',
      targetField: 'functionalFit',
      separator: '',
      confidence: 'high',
      assumption: 'Maps to the Application 1–5 Functional Fit score used for TIME assessment.',
    };
  }
  if (/technical\s*fit|tech\s*fit|technical\s*quality|tech\s*health/.test(norm)) {
    return {
      column,
      targetEntity: 'Application',
      targetField: 'technicalFit',
      separator: '',
      confidence: 'high',
      assumption: 'Maps to the Application 1–5 Technical Fit score used for TIME assessment.',
    };
  }
  if (/criticality|business\s*criticality|importance/.test(norm) && !/cap/.test(norm)) {
    return {
      column,
      targetEntity: 'Application',
      targetField: 'criticality',
      separator: '',
      confidence: 'high',
      assumption: 'Maps to the Application 1–5 Business Criticality score.',
    };
  }
  if (/contract\s*end|renewal\s*date|expiry/.test(norm)) {
    return {
      column,
      targetEntity: 'Application',
      targetField: 'contractEndDate',
      separator: '',
      confidence: 'high',
      assumption: 'Maps to the Application contract end/renewal date.',
    };
  }
  if (/contract\s*start/.test(norm)) {
    return {
      column,
      targetEntity: 'Application',
      targetField: 'contractStartDate',
      separator: '',
      confidence: 'high',
      assumption: 'Maps to the Application contract start date.',
    };
  }
  if (/time\s*rationale|disposition\s*note|architecture\s*note/.test(norm)) {
    return {
      column,
      targetEntity: 'Application',
      targetField: 'timeRationale',
      separator: '',
      confidence: 'medium',
      assumption: 'Maps to the Application TIME assessment rationale.',
    };
  }

  // Organization fields
  if (/parent\s*(org|organization|department|division)|^division$/.test(norm)) {
    return {
      column,
      targetEntity: 'Organization',
      targetField: 'parentName',
      separator: '',
      confidence: 'high',
      assumption: 'Creates/links a parent Division/Organization above the owning Organization on this row.',
    };
  }
  if (/org(anization)?|department|business\s*unit|owning\s*org|owning\s*team|team|domain\s*owner/.test(norm)) {
    return {
      column,
      targetEntity: 'Organization',
      targetField: 'name',
      separator: '',
      confidence: 'high',
      assumption: 'Creates/matches an Organization and links it as the owner of the row\'s Application and Information Objects.',
    };
  }

  // Capability fields
  if (/parent\s*capability|capability\s*(domain|l1|group|area)|l1\s*capability/.test(norm)) {
    return {
      column,
      targetEntity: 'Capability',
      targetField: 'parentName',
      separator: '',
      confidence: 'high',
      assumption: 'Creates/matches a top-level (L1) parent Capability for the row\'s business capability.',
    };
  }
  if (/capability|capabilities|business\s*capability|l2\s*capability|process/.test(norm)) {
    return {
      column,
      targetEntity: 'Capability',
      targetField: 'name',
      separator: sep('Capability', 'name'),
      confidence: 'high',
      assumption: 'Creates/matches Business Capabilities and links them to the row\'s Application, Organization, and Strategic Goal.',
    };
  }

  // Strategic Goal fields
  if (/strategic\s*goal|goal|initiative|objective|strategy|okr/.test(norm)) {
    return {
      column,
      targetEntity: 'StrategicGoal',
      targetField: 'name',
      separator: sep('StrategicGoal', 'name'),
      confidence: 'high',
      assumption: 'Creates/matches a Strategic Goal and links it to the Business Capabilities on this row.',
    };
  }

  // Information Object fields
  if (/information\s*object|data\s*object|data\s*entity|business\s*data|master\s*data|dataset|payload\s*data/.test(norm)) {
    return {
      column,
      targetEntity: 'InformationObject',
      targetField: 'name',
      separator: sep('InformationObject', 'name'),
      confidence: 'high',
      assumption: 'Creates/matches an Information Object and links it as processed data on the row\'s Application.',
    };
  }
  if (/pii|personal\s*data|gdpr/.test(norm)) {
    return {
      column,
      targetEntity: 'InformationObject',
      targetField: 'piiCategory',
      separator: '',
      confidence: 'medium',
      assumption: 'Maps to the PII sensitivity classification (1–4) of the row\'s Information Object.',
    };
  }
  if (/confidentiality|data\s*classification|sensitivity/.test(norm)) {
    return {
      column,
      targetEntity: 'InformationObject',
      targetField: 'confidentiality',
      separator: '',
      confidence: 'medium',
      assumption: 'Maps to the Confidentiality score (1–4) of the row\'s Information Object.',
    };
  }

  // Integration fields
  if (/downstream|target\s*app|integrates\s*to|sends\s*to|outbound|connected\s*app|target\s*system/.test(norm)) {
    return {
      column,
      targetEntity: 'Integration',
      targetField: 'targetAppName',
      separator: sep('Integration', 'targetAppName'),
      confidence: 'high',
      assumption: 'Creates an Integration from this row\'s Application to the named target/downstream Application.',
    };
  }
  if (/upstream|source\s*app|receives\s*from|inbound|source\s*system/.test(norm)) {
    return {
      column,
      targetEntity: 'Integration',
      targetField: 'upstreamAppName',
      separator: sep('Integration', 'upstreamAppName'),
      confidence: 'high',
      assumption: 'Creates an Integration from the named upstream Application into this row\'s Application.',
    };
  }
  if (/integration\s*pattern|protocol|interface\s*type|delivery\s*pattern/.test(norm)) {
    return {
      column,
      targetEntity: 'Integration',
      targetField: 'pattern',
      separator: '',
      confidence: 'medium',
      assumption: 'Maps to the Integration delivery pattern (e.g., REST API, Batch File, Event/Message Queue).',
    };
  }
  if (/frequency|schedule|cadence/.test(norm)) {
    return {
      column,
      targetEntity: 'Integration',
      targetField: 'frequency',
      separator: '',
      confidence: 'medium',
      assumption: 'Maps to the Integration frequency (e.g., Real-time, Hourly, Nightly Batch).',
    };
  }

  // Custom application field check
  const snake = column.trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
  if (customAppFields.includes(snake)) {
    return {
      column,
      targetEntity: 'Application',
      targetField: `custom:${snake}`,
      separator: '',
      confidence: 'medium',
      assumption: `Maps to custom Application attribute "${snake}".`,
    };
  }

  return {
    column,
    targetEntity: 'Ignore',
    targetField: 'ignore',
    separator: '',
    confidence: 'low',
    assumption: 'No direct match in the standard meta-model; ignored by default unless you select a target field.',
  };
}

function extractJsonObject(text: string): unknown | null {
  const trimmed = text.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const source = fenced?.[1]?.trim() || trimmed;
  const start = source.indexOf('{');
  const end = source.lastIndexOf('}');
  if (start < 0 || end <= start) return null;
  try {
    return JSON.parse(source.slice(start, end + 1));
  } catch {
    return null;
  }
}

export async function suggestCsvMappings(
  prisma: PrismaClient,
  provider: LlmCallConfig | null,
  input: { headers: string[]; sampleRows: Record<string, string>[] },
): Promise<FlatCsvMappingResponse> {
  const customDefs = await prisma.metadataDefinition.findMany({
    where: { entityType: 'Application' },
    select: { fieldName: true, label: true },
  });
  const customFieldNames = customDefs.map((d) => d.fieldName);

  const sampleValuesByCol = (col: string) =>
    input.sampleRows
      .map((r) => String(r[col] ?? '').trim())
      .filter(Boolean)
      .slice(0, 5);

  const fallbackMappings = input.headers.map((col) =>
    heuristicColumnMapping(col, sampleValuesByCol(col), customFieldNames),
  );

  const fieldCatalog = {
    ...ENTITY_FIELD_CATALOG,
    Application: [
      ...ENTITY_FIELD_CATALOG.Application,
      ...customDefs.map((d) => ({
        field: `custom:${d.fieldName}`,
        label: `Custom: ${d.label}`,
        description: `Custom Application attribute (${d.fieldName})`,
      })),
    ],
  };

  if (!provider || !provider.apiKey) {
    return {
      usedAi: false,
      providerName: null,
      mappings: fallbackMappings,
      summaryNote: 'Mapped columns using built-in meta-model heuristics (no active AI provider configured).',
      fieldCatalog,
    };
  }

  const catalogLines: string[] = [];
  for (const entity of FLAT_CSV_ENTITIES) {
    for (const item of ENTITY_FIELD_CATALOG[entity]) {
      catalogLines.push(`${entity}.${item.field} — ${item.label}: ${item.description}`);
    }
  }
  for (const custom of customDefs) {
    catalogLines.push(`Application.custom:${custom.fieldName} — Custom Attribute (${custom.label})`);
  }

  const columnSummary = input.headers
    .map((header) => {
      const vals = sampleValuesByCol(header);
      return `- Column "${header}": sample values = ${vals.length > 0 ? JSON.stringify(vals) : '(empty)'}`;
    })
    .join('\n');

  const userPrompt = [
    `Allowed Target Entity.Field Catalog:\n${catalogLines.join('\n')}`,
    `CSV Columns and Sample Rows (${input.sampleRows.length} sample rows):\n${columnSummary}`,
  ].join('\n\n');

  try {
    const rawReply = await completeConversation(
      provider,
      [{ role: 'user', content: userPrompt }],
      MAPPING_INSTRUCTIONS,
      undefined,
      2048,
    );

    const parsed = extractJsonObject(rawReply);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new LlmError('The AI mapping reply was not valid JSON.', 502);
    }
    const obj = parsed as Record<string, unknown>;
    const rawMappings = Array.isArray(obj.mappings) ? obj.mappings : [];
    const byCol = new Map<string, Record<string, unknown>>();
    for (const item of rawMappings) {
      if (item && typeof item === 'object' && typeof (item as any).column === 'string') {
        byCol.set((item as any).column.trim().toLowerCase(), item as Record<string, unknown>);
      }
    }

    const validEntities = new Set<string>(FLAT_CSV_ENTITIES);
    const merged: FlatCsvColumnMapping[] = input.headers.map((col, idx) => {
      const fallback = fallbackMappings[idx] ?? heuristicColumnMapping(col, sampleValuesByCol(col));
      const match = byCol.get(col.trim().toLowerCase());
      if (!match) return fallback;

      const entityRaw = typeof match.targetEntity === 'string' ? match.targetEntity.trim() : '';
      const targetEntity: FlatCsvTargetEntity = validEntities.has(entityRaw)
        ? (entityRaw as FlatCsvTargetEntity)
        : fallback.targetEntity;

      const fieldRaw = typeof match.targetField === 'string' ? match.targetField.trim() : '';
      const allowedFields = new Set(ENTITY_FIELD_CATALOG[targetEntity].map((f) => f.field));
      const isValidField =
        allowedFields.has(fieldRaw) ||
        (targetEntity === 'Application' && fieldRaw.startsWith('custom:'));

      const targetField = isValidField ? fieldRaw : (targetEntity === 'Ignore' ? 'ignore' : fallback.targetField);
      const sepRaw = typeof match.separator === 'string' ? match.separator.trim().slice(0, 2) : '';
      const confRaw = typeof match.confidence === 'string' ? match.confidence.toLowerCase() : '';
      const confidence: 'high' | 'medium' | 'low' =
        confRaw === 'high' || confRaw === 'medium' || confRaw === 'low' ? confRaw : fallback.confidence;
      const assumption =
        typeof match.assumption === 'string' && match.assumption.trim()
          ? match.assumption.trim().slice(0, 300)
          : fallback.assumption;

      return {
        column: col,
        targetEntity,
        targetField,
        separator: sepRaw || detectSeparator(sampleValuesByCol(col), targetEntity, targetField),
        confidence,
        assumption,
      };
    });

    const summaryNote =
      typeof obj.summaryNote === 'string' && obj.summaryNote.trim()
        ? obj.summaryNote.trim().slice(0, 500)
        : 'AI analyzed column names and sample values to map this flat CSV across the OpenEA meta-model.';

    return {
      usedAi: true,
      providerName: provider.model,
      mappings: merged,
      summaryNote,
      fieldCatalog,
    };
  } catch (err) {
    if (err instanceof LlmError) throw err;
    throw new LlmError(err instanceof Error ? err.message : 'AI column mapping failed', 502);
  }
}

function splitTokens(raw: string, separator: string): string[] {
  const trimmed = raw.trim();
  if (!trimmed) return [];
  if (!separator) return [trimmed];
  return trimmed
    .split(separator)
    .map((part) => part.trim())
    .filter(Boolean);
}

function parseOptionalNumber(raw: string): number | null {
  if (!raw || !raw.trim()) return null;
  const cleaned = raw.replace(/[^0-9.-]/g, '');
  const num = Number(cleaned);
  return Number.isFinite(num) && num >= 0 ? num : null;
}

function parseOptionalDate(raw: string): Date | null {
  if (!raw || !raw.trim()) return null;
  const d = new Date(raw.trim());
  return Number.isNaN(d.getTime()) ? null : d;
}

function normalizeScore(raw: string, min = 1, max = 5, fallback = '3'): string {
  const m = raw.trim().match(/\d+/);
  if (!m) return fallback;
  const n = Math.min(max, Math.max(min, Number(m[0])));
  return String(n);
}

export async function executeFlatCsvImport(
  prisma: PrismaClient,
  rows: Record<string, string>[],
  mappings: FlatCsvColumnMapping[],
  costScale: readonly [number, number, number, number] = DEFAULT_COST_SCALE,
): Promise<FlatCsvImportSummary> {
  const created: Record<ActiveFlatEntity, number> = {
    Application: 0,
    Capability: 0,
    StrategicGoal: 0,
    Organization: 0,
    InformationObject: 0,
    Integration: 0,
  };
  const updated: Record<ActiveFlatEntity, number> = {
    Application: 0,
    Capability: 0,
    StrategicGoal: 0,
    Organization: 0,
    InformationObject: 0,
    Integration: 0,
  };
  let linkedRelations = 0;
  const warnings: string[] = [];

  // Preload existing entities in the current state by case-insensitive name
  const [existingCaps, existingGoals, existingOrgs, existingInfos, existingApps, existingInts] = await Promise.all([
    prisma.capability.findMany({ select: { id: true, name: true, parentId: true } }),
    prisma.strategicGoal.findMany({ include: { capabilities: { select: { id: true } } } }),
    prisma.organization.findMany({ include: { supportedCapabilities: { select: { id: true } } } }),
    prisma.informationObject.findMany({ select: { id: true, name: true, businessOwnerId: true, appOwnerId: true } }),
    prisma.application.findMany({
      include: {
        capabilities: { select: { id: true } },
        processedInformationObjects: { select: { id: true } },
      },
    }),
    prisma.integration.findMany({ select: { id: true, sourceAppId: true, targetAppId: true, infoObjectId: true, name: true } }),
  ]);

  const capByName = new Map(existingCaps.map((c) => [c.name.trim().toLowerCase(), c]));
  const goalByName = new Map(existingGoals.map((g) => [g.name.trim().toLowerCase(), g]));
  const orgByName = new Map(existingOrgs.map((o) => [o.name.trim().toLowerCase(), o]));
  const infoByName = new Map(existingInfos.map((i) => [i.name.trim().toLowerCase(), i]));
  const appByName = new Map(existingApps.map((a) => [a.name.trim().toLowerCase(), a]));
  const intByKey = new Map(
    existingInts.map((i) => [`${i.sourceAppId}|${i.targetAppId}|${i.infoObjectId ?? ''}`, i]),
  );

  const byEntity = (entity: ActiveFlatEntity) => mappings.filter((m) => m.targetEntity === entity);

  const readField = (row: Record<string, string>, entity: ActiveFlatEntity, field: string): { value: string; separator: string } => {
    const found = mappings.find((m) => m.targetEntity === entity && m.targetField === field);
    if (!found) return { value: '', separator: '' };
    return { value: String(row[found.column] ?? '').trim(), separator: found.separator };
  };

  for (let rowIndex = 0; rowIndex < rows.length; rowIndex++) {
    const row = rows[rowIndex];
    if (!row) continue;
    try {
      // 1. Capabilities
      const rowCapIds: string[] = [];
      let parentCapId: string | null = null;
      const capParentRaw = readField(row, 'Capability', 'parentName').value;
      if (capParentRaw) {
        const key = capParentRaw.toLowerCase();
        let parentCap = capByName.get(key);
        if (!parentCap) {
          parentCap = await prisma.capability.create({
            data: { name: capParentRaw, criticality: '3' },
            select: { id: true, name: true, parentId: true },
          });
          capByName.set(key, parentCap);
          created.Capability++;
        }
        parentCapId = parentCap.id;
      }

      const capNameEntry = readField(row, 'Capability', 'name');
      const capDesc = readField(row, 'Capability', 'description').value;
      const capCrit = readField(row, 'Capability', 'criticality').value;
      const capNames = splitTokens(capNameEntry.value, capNameEntry.separator);

      for (const capName of capNames) {
        const key = capName.toLowerCase();
        let cap = capByName.get(key);
        if (!cap) {
          cap = await prisma.capability.create({
            data: {
              name: capName,
              ...(capDesc ? { description: capDesc } : {}),
              ...(capCrit ? { criticality: normalizeScore(capCrit, 1, 5, '3') } : {}),
              ...(parentCapId ? { parentId: parentCapId } : {}),
            },
            select: { id: true, name: true, parentId: true },
          });
          capByName.set(key, cap);
          created.Capability++;
          if (parentCapId) linkedRelations++;
        } else if ((parentCapId && !cap.parentId && cap.id !== parentCapId) || capDesc || capCrit) {
          cap = await prisma.capability.update({
            where: { id: cap.id },
            data: {
              ...(parentCapId && !cap.parentId && cap.id !== parentCapId ? { parentId: parentCapId } : {}),
              ...(capDesc ? { description: capDesc } : {}),
              ...(capCrit ? { criticality: normalizeScore(capCrit, 1, 5, '3') } : {}),
            },
            select: { id: true, name: true, parentId: true },
          });
          capByName.set(key, cap);
          updated.Capability++;
        }
        if (!rowCapIds.includes(cap.id)) rowCapIds.push(cap.id);
      }
      if (rowCapIds.length === 0 && parentCapId) {
        rowCapIds.push(parentCapId);
      }

      // 2. Strategic Goals
      let parentGoalId: string | null = null;
      const goalParentRaw = readField(row, 'StrategicGoal', 'parentName').value;
      if (goalParentRaw) {
        const key = goalParentRaw.toLowerCase();
        let pGoal = goalByName.get(key);
        if (!pGoal) {
          pGoal = await prisma.strategicGoal.create({
            data: { name: goalParentRaw },
            include: { capabilities: { select: { id: true } } },
          });
          goalByName.set(key, pGoal);
          created.StrategicGoal++;
        }
        parentGoalId = pGoal.id;
      }

      const goalNameEntry = readField(row, 'StrategicGoal', 'name');
      const goalDesc = readField(row, 'StrategicGoal', 'description').value;
      const goalNames = splitTokens(goalNameEntry.value, goalNameEntry.separator);

      for (const goalName of goalNames) {
        const key = goalName.toLowerCase();
        let goal = goalByName.get(key);
        if (!goal) {
          goal = await prisma.strategicGoal.create({
            data: {
              name: goalName,
              ...(goalDesc ? { description: goalDesc } : {}),
              ...(parentGoalId ? { parentId: parentGoalId } : {}),
              ...(rowCapIds.length > 0 ? { capabilities: { connect: rowCapIds.map((id) => ({ id })) } } : {}),
            },
            include: { capabilities: { select: { id: true } } },
          });
          goalByName.set(key, goal);
          created.StrategicGoal++;
          linkedRelations += rowCapIds.length;
        } else {
          const existingCapIds = new Set(goal.capabilities.map((c) => c.id));
          const newCapIds = rowCapIds.filter((id) => !existingCapIds.has(id));
          if (newCapIds.length > 0 || goalDesc || (parentGoalId && !goal.parentId)) {
            goal = await prisma.strategicGoal.update({
              where: { id: goal.id },
              data: {
                ...(goalDesc ? { description: goalDesc } : {}),
                ...(parentGoalId && !goal.parentId && goal.id !== parentGoalId ? { parentId: parentGoalId } : {}),
                ...(newCapIds.length > 0 ? { capabilities: { connect: newCapIds.map((id) => ({ id })) } } : {}),
              },
              include: { capabilities: { select: { id: true } } },
            });
            goalByName.set(key, goal);
            updated.StrategicGoal++;
            linkedRelations += newCapIds.length;
          }
        }
      }

      // 3. Organizations
      let rowOrgId: string | null = null;
      let parentOrgId: string | null = null;
      const orgParentRaw = readField(row, 'Organization', 'parentName').value;
      if (orgParentRaw) {
        const key = orgParentRaw.toLowerCase();
        let pOrg = orgByName.get(key);
        if (!pOrg) {
          pOrg = await prisma.organization.create({
            data: { name: orgParentRaw, type: 'Division' },
            include: { supportedCapabilities: { select: { id: true } } },
          });
          orgByName.set(key, pOrg);
          created.Organization++;
        }
        parentOrgId = pOrg.id;
      }

      const orgNameRaw = readField(row, 'Organization', 'name').value;
      const orgType = readField(row, 'Organization', 'type').value;
      const orgDesc = readField(row, 'Organization', 'description').value;
      if (orgNameRaw) {
        const key = orgNameRaw.toLowerCase();
        let org = orgByName.get(key);
        if (!org) {
          org = await prisma.organization.create({
            data: {
              name: orgNameRaw,
              ...(orgType ? { type: orgType } : { type: parentOrgId ? 'Department' : 'Division' }),
              ...(orgDesc ? { description: orgDesc } : {}),
              ...(parentOrgId ? { parentId: parentOrgId } : {}),
              ...(rowCapIds.length > 0 ? { supportedCapabilities: { connect: rowCapIds.map((id) => ({ id })) } } : {}),
            },
            include: { supportedCapabilities: { select: { id: true } } },
          });
          orgByName.set(key, org);
          created.Organization++;
          linkedRelations += rowCapIds.length;
        } else {
          const existingCapIds = new Set(org.supportedCapabilities.map((c) => c.id));
          const newCapIds = rowCapIds.filter((id) => !existingCapIds.has(id));
          if (newCapIds.length > 0 || orgType || orgDesc || (parentOrgId && !org.parentId)) {
            org = await prisma.organization.update({
              where: { id: org.id },
              data: {
                ...(orgType ? { type: orgType } : {}),
                ...(orgDesc ? { description: orgDesc } : {}),
                ...(parentOrgId && !org.parentId && org.id !== parentOrgId ? { parentId: parentOrgId } : {}),
                ...(newCapIds.length > 0 ? { supportedCapabilities: { connect: newCapIds.map((id) => ({ id })) } } : {}),
              },
              include: { supportedCapabilities: { select: { id: true } } },
            });
            orgByName.set(key, org);
            updated.Organization++;
            linkedRelations += newCapIds.length;
          }
        }
        rowOrgId = org.id;
      } else if (parentOrgId) {
        rowOrgId = parentOrgId;
      }

      // 4. Information Objects
      const rowInfoIds: string[] = [];
      const infoNameEntry = readField(row, 'InformationObject', 'name');
      const infoAliases = readField(row, 'InformationObject', 'aliases').value;
      const infoDesc = readField(row, 'InformationObject', 'description').value;
      const infoType = readField(row, 'InformationObject', 'type').value;
      const infoConf = readField(row, 'InformationObject', 'confidentiality').value;
      const infoInteg = readField(row, 'InformationObject', 'integrity').value;
      const infoAvail = readField(row, 'InformationObject', 'availability').value;
      const infoPii = readField(row, 'InformationObject', 'piiCategory').value;
      const infoNames = splitTokens(infoNameEntry.value, infoNameEntry.separator);

      for (const infoName of infoNames) {
        const key = infoName.toLowerCase();
        let info = infoByName.get(key);
        if (!info) {
          info = await prisma.informationObject.create({
            data: {
              name: infoName,
              ...(infoAliases ? { aliases: infoAliases } : {}),
              ...(infoDesc ? { description: infoDesc } : {}),
              ...(infoType ? { type: infoType } : {}),
              ...(infoConf ? { confidentiality: normalizeScore(infoConf, 1, 4, '1') } : {}),
              ...(infoInteg ? { integrity: normalizeScore(infoInteg, 1, 4, '1') } : {}),
              ...(infoAvail ? { availability: normalizeScore(infoAvail, 1, 4, '1') } : {}),
              ...(infoPii ? { piiCategory: normalizeScore(infoPii, 1, 4, '1') } : {}),
              ...(rowOrgId ? { businessOwnerId: rowOrgId } : {}),
            },
            select: { id: true, name: true, businessOwnerId: true, appOwnerId: true },
          });
          infoByName.set(key, info);
          created.InformationObject++;
          if (rowOrgId) linkedRelations++;
        } else if ((rowOrgId && !info.businessOwnerId) || infoDesc || infoType || infoPii || infoConf) {
          info = await prisma.informationObject.update({
            where: { id: info.id },
            data: {
              ...(rowOrgId && !info.businessOwnerId ? { businessOwnerId: rowOrgId } : {}),
              ...(infoAliases ? { aliases: infoAliases } : {}),
              ...(infoDesc ? { description: infoDesc } : {}),
              ...(infoType ? { type: infoType } : {}),
              ...(infoConf ? { confidentiality: normalizeScore(infoConf, 1, 4, '1') } : {}),
              ...(infoInteg ? { integrity: normalizeScore(infoInteg, 1, 4, '1') } : {}),
              ...(infoAvail ? { availability: normalizeScore(infoAvail, 1, 4, '1') } : {}),
              ...(infoPii ? { piiCategory: normalizeScore(infoPii, 1, 4, '1') } : {}),
            },
            select: { id: true, name: true, businessOwnerId: true, appOwnerId: true },
          });
          infoByName.set(key, info);
          updated.InformationObject++;
        }
        if (!rowInfoIds.includes(info.id)) rowInfoIds.push(info.id);
      }

      // 5. Application
      let rowAppId: string | null = null;
      const appNameRaw = readField(row, 'Application', 'name').value;
      if (appNameRaw) {
        const key = appNameRaw.toLowerCase();
        const appDesc = readField(row, 'Application', 'description').value;
        const appOwner = readField(row, 'Application', 'owner').value;
        const appLifecycle = readField(row, 'Application', 'lifecycle').value;
        const appType = readField(row, 'Application', 'type').value;
        const vendorName = readField(row, 'Application', 'vendorName').value;
        const vendorUrl = readField(row, 'Application', 'vendorUrl').value;
        const vendorSummary = readField(row, 'Application', 'vendorSummary').value;
        const annualCostVal = parseOptionalNumber(readField(row, 'Application', 'annualCost').value);
        const costBandRaw = readField(row, 'Application', 'cost').value;
        const critRaw = readField(row, 'Application', 'criticality').value;
        const funcFitRaw = readField(row, 'Application', 'functionalFit').value;
        const techFitRaw = readField(row, 'Application', 'technicalFit').value;
        const timeRationale = readField(row, 'Application', 'timeRationale').value;
        const lifecycleStart = parseOptionalDate(readField(row, 'Application', 'lifecycleStartDate').value);
        const lifecycleEnd = parseOptionalDate(readField(row, 'Application', 'lifecycleEndDate').value);
        const contractStart = parseOptionalDate(readField(row, 'Application', 'contractStartDate').value);
        const contractEnd = parseOptionalDate(readField(row, 'Application', 'contractEndDate').value);
        const contractDetails = readField(row, 'Application', 'contractDetails').value;

        // Custom metadata fields
        const customMappings = byEntity('Application').filter((m) => m.targetField.startsWith('custom:'));
        const customMeta: Record<string, string> = {};
        for (const cm of customMappings) {
          const val = String(row[cm.column] ?? '').trim();
          if (val) {
            customMeta[cm.targetField.slice('custom:'.length)] = val;
          }
        }

        const derivedCost =
          annualCostVal !== null
            ? costTierForAmount(annualCostVal, costScale)
            : costBandRaw
              ? normalizeScore(costBandRaw, 1, 5, '2')
              : undefined;

        const existingApp = appByName.get(key);
        if (!existingApp) {
          const createdApp = await prisma.application.create({
            data: {
              name: appNameRaw,
              ...(appDesc ? { description: appDesc } : {}),
              ...(appOwner ? { owner: appOwner } : {}),
              ...(rowOrgId ? { ownerOrgId: rowOrgId } : {}),
              ...(appLifecycle ? { lifecycle: appLifecycle } : {}),
              ...(appType ? { type: appType } : {}),
              ...(vendorName ? { vendorName } : {}),
              ...(vendorUrl ? { vendorUrl } : {}),
              ...(vendorSummary ? { vendorSummary } : {}),
              ...(annualCostVal !== null ? { annualCost: annualCostVal } : {}),
              ...(derivedCost ? { cost: derivedCost } : {}),
              ...(critRaw ? { criticality: normalizeScore(critRaw, 1, 5, '3') } : {}),
              ...(funcFitRaw ? { functionalFit: normalizeScore(funcFitRaw, 1, 5, '3') } : {}),
              ...(techFitRaw ? { technicalFit: normalizeScore(techFitRaw, 1, 5, '3') } : {}),
              ...(timeRationale ? { timeRationale } : {}),
              ...(lifecycleStart ? { lifecycleStartDate: lifecycleStart } : {}),
              ...(lifecycleEnd ? { lifecycleEndDate: lifecycleEnd } : {}),
              ...(contractStart ? { contractStartDate: contractStart } : {}),
              ...(contractEnd ? { contractEndDate: contractEnd } : {}),
              ...(contractDetails ? { contractDetails } : {}),
              ...(Object.keys(customMeta).length > 0 ? { metadata: JSON.stringify(customMeta) } : {}),
              ...(rowCapIds.length > 0 ? { capabilities: { connect: rowCapIds.map((id) => ({ id })) } } : {}),
              ...(rowInfoIds.length > 0 ? { processedInformationObjects: { connect: rowInfoIds.map((id) => ({ id })) } } : {}),
            },
            include: {
              capabilities: { select: { id: true } },
              processedInformationObjects: { select: { id: true } },
            },
          });
          appByName.set(key, createdApp);
          rowAppId = createdApp.id;
          created.Application++;
          linkedRelations += rowCapIds.length + rowInfoIds.length + (rowOrgId ? 1 : 0);
        } else {
          const prevCapIds = new Set(existingApp.capabilities.map((c) => c.id));
          const newCapIds = rowCapIds.filter((id) => !prevCapIds.has(id));
          const prevInfoIds = new Set(existingApp.processedInformationObjects.map((i) => i.id));
          const newInfoIds = rowInfoIds.filter((id) => !prevInfoIds.has(id));

          let mergedMeta: string | undefined;
          if (Object.keys(customMeta).length > 0) {
            try {
              const prev = existingApp.metadata ? JSON.parse(existingApp.metadata) : {};
              mergedMeta = JSON.stringify({ ...prev, ...customMeta });
            } catch {
              mergedMeta = JSON.stringify(customMeta);
            }
          }

          const updatedApp = await prisma.application.update({
            where: { id: existingApp.id },
            data: {
              ...(appDesc ? { description: appDesc } : {}),
              ...(appOwner ? { owner: appOwner } : {}),
              ...(rowOrgId ? { ownerOrgId: rowOrgId } : {}),
              ...(appLifecycle ? { lifecycle: appLifecycle } : {}),
              ...(appType ? { type: appType } : {}),
              ...(vendorName ? { vendorName } : {}),
              ...(vendorUrl ? { vendorUrl } : {}),
              ...(vendorSummary ? { vendorSummary } : {}),
              ...(annualCostVal !== null ? { annualCost: annualCostVal } : {}),
              ...(derivedCost ? { cost: derivedCost } : {}),
              ...(critRaw ? { criticality: normalizeScore(critRaw, 1, 5, '3') } : {}),
              ...(funcFitRaw ? { functionalFit: normalizeScore(funcFitRaw, 1, 5, '3') } : {}),
              ...(techFitRaw ? { technicalFit: normalizeScore(techFitRaw, 1, 5, '3') } : {}),
              ...(timeRationale ? { timeRationale } : {}),
              ...(lifecycleStart ? { lifecycleStartDate: lifecycleStart } : {}),
              ...(lifecycleEnd ? { lifecycleEndDate: lifecycleEnd } : {}),
              ...(contractStart ? { contractStartDate: contractStart } : {}),
              ...(contractEnd ? { contractEndDate: contractEnd } : {}),
              ...(contractDetails ? { contractDetails } : {}),
              ...(mergedMeta ? { metadata: mergedMeta } : {}),
              ...(newCapIds.length > 0 ? { capabilities: { connect: newCapIds.map((id) => ({ id })) } } : {}),
              ...(newInfoIds.length > 0 ? { processedInformationObjects: { connect: newInfoIds.map((id) => ({ id })) } } : {}),
            },
            include: {
              capabilities: { select: { id: true } },
              processedInformationObjects: { select: { id: true } },
            },
          });
          appByName.set(key, updatedApp);
          rowAppId = updatedApp.id;
          updated.Application++;
          linkedRelations += newCapIds.length + newInfoIds.length;
        }
      }

      // Ensure appOwnerId on Information Objects created on this row if an Application was also on this row
      if (rowAppId && rowInfoIds.length > 0) {
        for (const infoName of infoNames) {
          const info = infoByName.get(infoName.toLowerCase());
          if (info && !info.appOwnerId) {
            const updatedInfo = await prisma.informationObject.update({
              where: { id: info.id },
              data: { appOwnerId: rowAppId },
              select: { id: true, name: true, businessOwnerId: true, appOwnerId: true },
            });
            infoByName.set(infoName.toLowerCase(), updatedInfo);
          }
        }
      }

      // 6. Integrations
      const ensureAppByName = async (name: string): Promise<string> => {
        const key = name.trim().toLowerCase();
        const found = appByName.get(key);
        if (found) return found.id;
        const stub = await prisma.application.create({
          data: {
            name: name.trim(),
            lifecycle: 'Discovery',
            ...(rowOrgId ? { ownerOrgId: rowOrgId } : {}),
          },
          include: {
            capabilities: { select: { id: true } },
            processedInformationObjects: { select: { id: true } },
          },
        });
        appByName.set(key, stub);
        created.Application++;
        return stub.id;
      };

      const intPayloadName = readField(row, 'Integration', 'payloadName').value;
      let payloadInfoId: string | null = rowInfoIds[0] ?? null;
      if (intPayloadName) {
        const key = intPayloadName.toLowerCase();
        let pInfo = infoByName.get(key);
        if (!pInfo) {
          pInfo = await prisma.informationObject.create({
            data: { name: intPayloadName, ...(rowOrgId ? { businessOwnerId: rowOrgId } : {}) },
            select: { id: true, name: true, businessOwnerId: true, appOwnerId: true },
          });
          infoByName.set(key, pInfo);
          created.InformationObject++;
        }
        payloadInfoId = pInfo.id;
      }

      const intName = readField(row, 'Integration', 'name').value;
      const intDesc = readField(row, 'Integration', 'description').value;
      const intPattern = readField(row, 'Integration', 'pattern').value;
      const intType = readField(row, 'Integration', 'type').value;
      const intFreq = readField(row, 'Integration', 'frequency').value;
      const intCrud = readField(row, 'Integration', 'crud').value;

      const explicitSource = readField(row, 'Integration', 'sourceAppName').value;
      const targetEntry = readField(row, 'Integration', 'targetAppName');
      const upstreamEntry = readField(row, 'Integration', 'upstreamAppName');

      const targetNames = splitTokens(targetEntry.value, targetEntry.separator);
      const upstreamNames = splitTokens(upstreamEntry.value, upstreamEntry.separator);

      const upsertIntegrationPair = async (sourceId: string, targetId: string, defaultTitle: string) => {
        if (sourceId === targetId) return;
        const intKey = `${sourceId}|${targetId}|${payloadInfoId ?? ''}`;
        const existingInt = intByKey.get(intKey);
        if (!existingInt) {
          const createdInt = await prisma.integration.create({
            data: {
              name: intName || defaultTitle,
              ...(intDesc ? { description: intDesc } : {}),
              sourceAppId: sourceId,
              targetAppId: targetId,
              ...(payloadInfoId ? { infoObjectId: payloadInfoId } : {}),
              ...(intPattern ? { pattern: intPattern } : {}),
              ...(intType ? { type: intType } : {}),
              ...(intFreq ? { frequency: intFreq } : {}),
              ...(intCrud ? { crud: intCrud } : {}),
            },
            select: { id: true, sourceAppId: true, targetAppId: true, infoObjectId: true, name: true },
          });
          intByKey.set(intKey, createdInt);
          created.Integration++;
          linkedRelations++;
        } else if (intDesc || intPattern || intType || intFreq || intCrud) {
          const updatedInt = await prisma.integration.update({
            where: { id: existingInt.id },
            data: {
              ...(intName ? { name: intName } : {}),
              ...(intDesc ? { description: intDesc } : {}),
              ...(intPattern ? { pattern: intPattern } : {}),
              ...(intType ? { type: intType } : {}),
              ...(intFreq ? { frequency: intFreq } : {}),
              ...(intCrud ? { crud: intCrud } : {}),
            },
            select: { id: true, sourceAppId: true, targetAppId: true, infoObjectId: true, name: true },
          });
          intByKey.set(intKey, updatedInt);
          updated.Integration++;
        }
      };

      if (explicitSource && targetNames.length > 0) {
        const srcId = await ensureAppByName(explicitSource);
        for (const tName of targetNames) {
          const tgtId = await ensureAppByName(tName);
          await upsertIntegrationPair(srcId, tgtId, `${explicitSource} → ${tName}`);
        }
      } else if (rowAppId) {
        for (const tName of targetNames) {
          const tgtId = await ensureAppByName(tName);
          await upsertIntegrationPair(rowAppId, tgtId, `${appNameRaw} → ${tName}`);
        }
        for (const uName of upstreamNames) {
          const srcId = await ensureAppByName(uName);
          await upsertIntegrationPair(srcId, rowAppId, `${uName} → ${appNameRaw}`);
        }
      }
    } catch (err) {
      warnings.push(`Row ${rowIndex + 1}: ${err instanceof Error ? err.message : 'Failed to process row'}`);
    }
  }

  return {
    totalRows: rows.length,
    created,
    updated,
    linkedRelations,
    warnings,
  };
}
