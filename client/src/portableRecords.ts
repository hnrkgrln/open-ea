// Round-trip columns for Data Portability. Keep these in step with the scalar
// fields on Application, StrategicGoal, Capability, Organization, InformationObject,
// and Integration in server/prisma/schema.base.prisma. Leave out createdAt and
// updatedAt. Relation columns carry ids from an earlier import step.

export type ArtifactType = 'applications' | 'strategic-goals' | 'capabilities' | 'organizations' | 'information-objects' | 'integrations';

export const CSV_HEADERS: Record<ArtifactType, string[]> = {
  applications: [
    'id', 'name', 'description', 'owner', 'ownerOrgId', 'lifecycle',
    'lifecycleStartDate', 'lifecycleEndDate', 'contractStartDate', 'contractEndDate', 'contractDetails',
    'vendorName', 'vendorUrl', 'vendorSummary', 'type', 'criticality', 'cost',
    'functionalFit', 'technicalFit', 'timeRationale', 'metadata', 'references',
    'capabilityIds', 'processedInformationObjectIds',
  ],
  'strategic-goals': ['id', 'name', 'description', 'parentId', 'references', 'capabilityIds'],
  capabilities: ['id', 'name', 'description', 'criticality', 'parentId', 'metadata', 'references', 'applicationIds'],
  organizations: ['id', 'name', 'description', 'type', 'parentId', 'references', 'supportedCapabilityIds'],
  'information-objects': [
    'id', 'name', 'aliases', 'description', 'confidentiality', 'integrity', 'availability',
    'piiCategory', 'type', 'businessOwnerId', 'appOwnerId', 'metadata', 'references',
  ],
  integrations: ['id', 'name', 'description', 'sourceAppId', 'targetAppId', 'infoObjectId', 'pattern', 'type', 'frequency', 'crud', 'references'],
};

const DATE_FIELDS = new Set(['lifecycleStartDate', 'lifecycleEndDate', 'contractStartDate', 'contractEndDate']);

// Blank cells become null only where the API schema is nullable. Other blanks stay "".
const NULLABLE_FIELDS: Record<ArtifactType, string[]> = {
  applications: [
    'ownerOrgId', 'lifecycleStartDate', 'lifecycleEndDate', 'contractStartDate', 'contractEndDate',
    'contractDetails', 'vendorName', 'vendorUrl', 'vendorSummary', 'timeRationale', 'references',
  ],
  'strategic-goals': ['description', 'parentId', 'references'],
  capabilities: ['parentId', 'references'],
  organizations: ['parentId', 'references'],
  'information-objects': ['businessOwnerId', 'appOwnerId', 'references'],
  integrations: ['infoObjectId', 'type', 'references'],
};

const ID_LIST_FIELDS: Record<ArtifactType, string[]> = {
  applications: ['capabilityIds', 'processedInformationObjectIds'],
  'strategic-goals': ['capabilityIds'],
  capabilities: ['applicationIds'],
  organizations: ['supportedCapabilityIds'],
  'information-objects': [],
  integrations: [],
};

const RELATION_LISTS: Record<string, string> = {
  capabilityIds: 'capabilities',
  supportedCapabilityIds: 'supportedCapabilities',
  applicationIds: 'applications',
  processedInformationObjectIds: 'processedInformationObjects',
};

const csvCell = (value: unknown) => `"${String(value ?? '').replace(/"/g, '""')}"`;

const relationIds = (item: Record<string, any>, header: string) => {
  const source = RELATION_LISTS[header];
  const rows = source ? item[source] : undefined;
  if (Array.isArray(rows)) return rows.map((row) => row?.id).filter(Boolean).join(';');
  const direct = item[header];
  return direct == null ? '' : String(direct);
};

const cellValue = (item: Record<string, any>, header: string) => {
  if (header in RELATION_LISTS) return relationIds(item, header);
  let value = item[header];
  if (value && typeof value === 'object') value = JSON.stringify(value);
  if (value && DATE_FIELDS.has(header)) value = String(value).split('T')[0];
  return value ?? '';
};

export const toCsv = (type: ArtifactType, data: any[]) => {
  const headers = CSV_HEADERS[type];
  const rows = (data || []).map((item) => headers.map((header) => csvCell(cellValue(item, header))).join(','));
  return [headers.join(','), ...rows].join('\n');
};

const blankToNull = (value: unknown) => {
  if (value == null) return null;
  const text = String(value).trim();
  return text === '' ? null : text;
};

const toIsoDate = (value: unknown) => {
  const text = blankToNull(value);
  if (!text) return null;
  const date = new Date(text);
  if (Number.isNaN(date.getTime())) return text;
  return date.toISOString();
};

export const prepareImportPayload = (type: ArtifactType, item: Record<string, any>) => {
  const { id, ...payload } = item;
  for (const field of NULLABLE_FIELDS[type]) {
    if (!(field in payload)) continue;
    payload[field] = DATE_FIELDS.has(field) ? toIsoDate(payload[field]) : blankToNull(payload[field]);
  }
  for (const field of ID_LIST_FIELDS[type]) {
    if (!(field in payload)) continue;
    const text = blankToNull(payload[field]);
    payload[field] = text ? text.split(';').map((part) => part.trim()).filter(Boolean) : [];
  }
  return { id: typeof id === 'string' ? id.trim() : '', payload };
};

// Parents in the same file are imported before their children. A parent that is
// not in the file is left for the database.
export const orderByParent = (rows: Record<string, any>[]) => {
  const pending = rows.map((row) => row);
  const ids = new Set(pending.map((row) => String(row.id || '').trim()).filter(Boolean));
  const done = new Set<string>();
  const ordered: Record<string, any>[] = [];
  let guard = pending.length + 1;
  while (pending.length > 0 && guard-- > 0) {
    let moved = false;
    for (let index = 0; index < pending.length;) {
      const row = pending[index];
      const parent = String(row.parentId || '').trim();
      if (!parent || done.has(parent) || !ids.has(parent)) {
        const id = String(row.id || '').trim();
        if (id) done.add(id);
        ordered.push(row);
        pending.splice(index, 1);
        moved = true;
      } else {
        index += 1;
      }
    }
    if (!moved) {
      ordered.push(...pending);
      break;
    }
  }
  return ordered;
};
