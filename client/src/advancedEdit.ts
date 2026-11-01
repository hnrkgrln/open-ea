// Columns for the advanced editing tables. Ids, timestamps, landscape state,
// and derived values are not editable. A picklist or relation autocompletes;
// everything else is a text, date, number, or checkbox field.

import { nativeFieldEnabled, type NativeFieldId } from './nativeFields';
import { getAppTimeAssessment, type TimeThresholds } from './timeAssessment';

export type EditKind = 'application' | 'capability' | 'organization' | 'strategicGoal' | 'information' | 'integration';

export type CellValue = string | boolean | string[];

export type PickOption = {
  value: string;
  label: string;
  color?: string;
  detail?: string;
};

export type EditColumn = {
  id: string;
  label: string;
  kind: 'text' | 'longtext' | 'date' | 'boolean' | 'number' | 'choice' | 'choices' | 'readonly';
  minWidth?: number;
  sticky?: boolean;
  maxLength?: number;
  min?: number;
  max?: number;
  allowCustom?: boolean;
  required?: boolean;
  placeholder?: string;
  hint?: string;
  get: (row: Row) => CellValue;
  options?: (row: Row) => PickOption[];
  locked?: (row: Row) => string | null;
  commit?: (row: Row, value: CellValue) => { error: string } | { body: Record<string, unknown> };
};

type Row = Record<string, any>;

export type EditLookups = {
  picklists?: any[];
  metaDefs?: any[];
  disabled?: readonly string[];
  applications?: any[];
  capabilities?: any[];
  organizations?: any[];
  information?: any[];
  goals?: any[];
  thresholds?: TimeThresholds;
};

const RECORD_PATH: Record<EditKind, (id: string) => string> = {
  application: (id) => `/api/applications/${id}`,
  capability: (id) => `/api/capabilities/${id}`,
  organization: (id) => `/api/organizations/${id}`,
  strategicGoal: (id) => `/api/strategic-goals/${id}`,
  information: (id) => `/api/information-objects/${id}`,
  integration: (id) => `/api/integrations/${id}`,
};

export function recordApiPath(kind: EditKind, id: string) {
  return RECORD_PATH[kind](id);
}

export function valuesEqual(left: CellValue, right: CellValue) {
  if (Array.isArray(left) && Array.isArray(right)) {
    if (left.length !== right.length) return false;
    const seen = new Set(right);
    return left.every((item) => seen.has(item));
  }
  return left === right;
}

export function blockedTreeIds(rows: { id?: string; parentId?: string | null }[], id: string) {
  const blocked = new Set<string>([id]);
  const walk = (parentId: string) => {
    for (const row of rows) {
      if (!row?.id || row.parentId !== parentId || blocked.has(row.id)) continue;
      blocked.add(row.id);
      walk(row.id);
    }
  };
  walk(id);
  return blocked;
}

export function readMetadata(raw: unknown): Record<string, unknown> {
  if (typeof raw !== 'string' || !raw) return {};
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return { ...(parsed as Record<string, unknown>) };
  } catch {
    return {};
  }
  return {};
}

export function writeMetadata(raw: unknown, field: string, value: unknown) {
  const next = readMetadata(raw);
  if (value === '' || value === null || value === undefined) delete next[field];
  else next[field] = value;
  return JSON.stringify(next);
}

export function dateInputValue(value: unknown) {
  if (typeof value !== 'string' || value.length < 10) return '';
  return value.slice(0, 10);
}

export function dateToIso(value: string) {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString();
}

export function vendorUrlForSave(value: string): { url: string | null; error?: string } {
  const trimmed = value.trim();
  if (!trimmed) return { url: null };
  const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  try {
    const parsed = new URL(withScheme);
    if (parsed.username || parsed.password || !/^https?:$/i.test(parsed.protocol)) {
      return { url: null, error: 'Home page must be an http or https address.' };
    }
    return { url: parsed.toString().slice(0, 500) };
  } catch {
    return { url: null, error: 'Home page must be an http or https address.' };
  }
}

export function flattenTree<T extends { children?: T[] }>(nodes: readonly T[]): T[] {
  const out: T[] = [];
  const walk = (list: readonly T[]) => {
    for (const node of list) {
      out.push(node);
      if (node.children && node.children.length > 0) walk(node.children);
    }
  };
  walk(nodes);
  return out;
}

export function applySaved(row: Row, body: Record<string, unknown>, saved: Row) {
  const next: Row = { ...row };
  const mapIds = (ids: unknown, current: any[] | undefined) => {
    const list = Array.isArray(ids) ? ids.map(String) : [];
    return list.map((id) => (current || []).find((item) => item?.id === id) || { id, name: id });
  };
  for (const [key, value] of Object.entries(body)) {
    if (key === 'capabilityIds') {
      const field = Array.isArray(row.supportedCapabilities) ? 'supportedCapabilities' : 'capabilities';
      next[field] = mapIds(value, row[field]);
    } else if (key === 'applicationIds') {
      const field = Array.isArray(row.ownedApplications) ? 'ownedApplications' : 'applications';
      next[field] = mapIds(value, Array.isArray(row[field]) ? row[field] : undefined);
    } else if (key === 'processedInformationObjectIds') {
      next.processedInformationObjects = mapIds(value, row.processedInformationObjects);
    } else {
      next[key] = value;
    }
  }
  if (saved && typeof saved === 'object') {
    for (const [key, value] of Object.entries(saved)) {
      if (value !== undefined) next[key] = value;
    }
  }
  return next;
}

function str(value: unknown) {
  return value == null ? '' : String(value);
}

function idsOf(list: unknown) {
  if (!Array.isArray(list)) return [];
  return list.map((item) => (item && typeof item === 'object' && item.id ? String(item.id) : '')).filter(Boolean);
}

function show(disabled: readonly string[] | undefined, id: NativeFieldId) {
  return nativeFieldEnabled(disabled, id);
}

function textCommit(key: string, empty: '' | null, opts?: { required?: string; max?: number }) {
  return (_row: Row, value: CellValue) => {
    const text = typeof value === 'string' ? value.trim() : '';
    if (!text && opts?.required) return { error: opts.required };
    if (opts?.max && text.length > opts.max) return { error: `${opts.max} characters at most.` };
    return { body: { [key]: text ? text : empty === null ? null : '' } };
  };
}

function choiceCommit(key: string, empty: '' | null) {
  return (_row: Row, value: CellValue) => {
    const text = typeof value === 'string' ? value.trim() : '';
    return { body: { [key]: text ? text : empty === null ? null : '' } };
  };
}

function dateCommit(key: string) {
  return (_row: Row, value: CellValue) => {
    const text = typeof value === 'string' ? value : '';
    if (!text) return { body: { [key]: null } };
    const iso = dateToIso(text);
    if (!iso) return { error: 'Enter a valid date.' };
    return { body: { [key]: iso } };
  };
}

function idListCommit(key: string) {
  return (_row: Row, value: CellValue) => ({
    body: { [key]: Array.isArray(value) ? value.map(String) : [] },
  });
}

function optionsOf(picklists: any[] | undefined, name: string): PickOption[] {
  const list = (picklists || []).find((item) => item?.name === name);
  const options = Array.isArray(list?.options) ? [...list.options] : [];
  options.sort((left, right) => Number(left?.order ?? 0) - Number(right?.order ?? 0));
  return options
    .filter((option) => option && option.value != null && String(option.value) !== '')
    .map((option) => ({
      value: String(option.value),
      label: String(option.label ?? option.value),
      ...(option.color ? { color: String(option.color) } : {}),
    }));
}

function named(rows: any[] | undefined): PickOption[] {
  return (rows || [])
    .filter((row) => row?.id)
    .map((row) => ({ value: String(row.id), label: String(row.name || 'Untitled') }))
    .sort((left, right) => left.label.localeCompare(right.label, undefined, { numeric: true, sensitivity: 'base' }));
}

function organizationChoices(organizations: any[] | undefined, picklists: any[] | undefined): PickOption[] {
  const types = optionsOf(picklists, 'organization_type');
  const typeLabel = (value: unknown) => types.find((option) => option.value === String(value || ''))?.label || '';
  return (organizations || [])
    .filter((org) => org?.id)
    .map((org) => {
      const detail = typeLabel(org.type);
      return {
        value: String(org.id),
        label: String(org.name || 'Untitled'),
        ...(detail ? { detail } : {}),
      };
    })
    .sort((left, right) => left.label.localeCompare(right.label, undefined, { numeric: true, sensitivity: 'base' }));
}

function parentChoices(rows: any[] | undefined, row: Row, choices: PickOption[]) {
  const blocked = blockedTreeIds(rows || [], String(row.id || ''));
  return choices.filter((option) => !blocked.has(option.value));
}

function pickColumn(args: {
  id: string;
  label: string;
  key: string;
  options: PickOption[];
  get: (row: Row) => string;
  empty?: '' | null;
  allowCustom?: boolean;
  minWidth?: number;
  placeholder?: string;
  locked?: (row: Row) => string | null;
}): EditColumn {
  if (args.options.length === 0 || args.allowCustom) {
    const options = args.options;
    return {
      id: args.id,
      label: args.label,
      kind: options.length > 0 ? 'choice' : 'text',
      minWidth: args.minWidth ?? 170,
      allowCustom: args.allowCustom && options.length > 0,
      placeholder: args.placeholder,
      locked: args.locked,
      get: args.get,
      ...(options.length > 0 ? { options: () => options } : {}),
      commit: (_row, value) => {
        const text = typeof value === 'string' ? value.trim() : '';
        if (options.length > 0 && text) {
          const known = options.some((option) => option.value === text);
          if (!known && !args.allowCustom) return { error: 'Choose a value from the list.' };
        }
        return choiceCommit(args.key, args.empty ?? '')(_row, text);
      },
    };
  }
  return {
    id: args.id,
    label: args.label,
    kind: 'choice',
    minWidth: args.minWidth ?? 180,
    placeholder: args.placeholder ?? '—',
    locked: args.locked,
    get: args.get,
    options: () => args.options,
    commit: choiceCommit(args.key, args.empty ?? ''),
  };
}

function relationColumn(args: {
  id: string;
  label: string;
  key: string;
  required?: boolean;
  placeholder: string;
  minWidth?: number;
  choices: (row: Row) => PickOption[];
  get: (row: Row) => string;
  empty?: '' | null;
  refuse?: (row: Row, value: string) => string | null;
}): EditColumn {
  return {
    id: args.id,
    label: args.label,
    kind: 'choice',
    required: args.required,
    placeholder: args.placeholder,
    minWidth: args.minWidth ?? 200,
    get: args.get,
    options: args.choices,
    commit: (row, value) => {
      const text = typeof value === 'string' ? value : '';
      if (args.required && !text) return { error: `Choose ${args.label.toLowerCase()}.` };
      const refused = args.refuse?.(row, text);
      if (refused) return { error: refused };
      return choiceCommit(args.key, args.empty ?? null)(row, text);
    },
  };
}

function multiColumn(id: string, label: string, key: string, options: PickOption[], read: (row: Row) => string[]): EditColumn {
  return {
    id,
    label,
    kind: 'choices',
    minWidth: 240,
    placeholder: 'Add…',
    get: read,
    options: () => options,
    commit: idListCommit(key),
  };
}

const META_SKIP: Record<string, Set<string>> = {
  Application: new Set(['criticality', 'cost', 'functionalFit', 'technicalFit']),
  Capability: new Set(['criticality']),
  InformationObject: new Set(['confidentiality', 'integrity', 'availability', 'piiCategory', 'type']),
};

function metaGet(row: Row, field: string) {
  return readMetadata(row.metadata)[field];
}

function customColumns(entityType: string, metaDefs: any[] | undefined): EditColumn[] {
  const skip = META_SKIP[entityType] || new Set<string>();
  return (metaDefs || [])
    .filter((def) => def?.entityType === entityType && def.fieldName && !skip.has(String(def.fieldName)) && !String(def.fieldName).startsWith('_'))
    .map((def) => customColumn(def));
}

function customColumn(def: any): EditColumn {
  const field = String(def.fieldName);
  const label = String(def.label || field);
  const id = `meta:${field}`;
  if (def.fieldType === 'boolean') {
    return {
      id,
      label,
      kind: 'boolean',
      minWidth: 110,
      get: (row) => metaGet(row, field) === true,
      commit: (row, value) => ({ body: { metadata: writeMetadata(row.metadata, field, value === true) } }),
    };
  }
  if (def.fieldType === 'textarea') {
    return {
      id,
      label,
      kind: 'longtext',
      minWidth: 240,
      get: (row) => str(metaGet(row, field)),
      commit: (row, value) => ({
        body: { metadata: writeMetadata(row.metadata, field, typeof value === 'string' && value.trim() ? value.trim() : null) },
      }),
    };
  }
  if (def.fieldType === 'date') {
    return {
      id,
      label,
      kind: 'date',
      minWidth: 150,
      get: (row) => dateInputValue(metaGet(row, field)),
      commit: (row, value) => ({
        body: { metadata: writeMetadata(row.metadata, field, typeof value === 'string' && value ? value : null) },
      }),
    };
  }
  if (def.fieldType === 'range') {
    const min = Number.isFinite(Number(def.min)) ? Number(def.min) : 0;
    const max = Number.isFinite(Number(def.max)) ? Number(def.max) : 100;
    const span = max - min;
    const store = (row: Row, value: CellValue) => {
      const text = typeof value === 'string' ? value.trim() : '';
      if (!text) return { body: { metadata: writeMetadata(row.metadata, field, null) } };
      const number = Number(text);
      if (!Number.isFinite(number)) return { error: 'Enter a number.' };
      if (number < min || number > max) return { error: `Enter a number from ${min} to ${max}.` };
      return { body: { metadata: writeMetadata(row.metadata, field, number) } };
    };
    const read = (row: Row) => {
      const current = metaGet(row, field);
      return current == null || current === '' ? '' : String(current);
    };
    if (span >= 0 && span <= 12 && Number.isInteger(min) && Number.isInteger(max)) {
      const options: PickOption[] = [];
      for (let step = min; step <= max; step += 1) options.push({ value: String(step), label: String(step) });
      return {
        id,
        label,
        kind: 'choice',
        minWidth: 130,
        placeholder: '—',
        get: read,
        options: () => options,
        commit: store,
      };
    }
    return { id, label, kind: 'number', minWidth: 120, min, max, get: read, commit: store };
  }
  return {
    id,
    label,
    kind: 'text',
    minWidth: 180,
    get: (row) => str(metaGet(row, field)),
    commit: (row, value) => ({
      body: { metadata: writeMetadata(row.metadata, field, typeof value === 'string' && value.trim() ? value.trim() : null) },
    }),
  };
}

function applicationColumns(lookups: EditLookups): EditColumn[] {
  const disabled = lookups.disabled;
  const columns: EditColumn[] = [{
    id: 'name',
    label: 'Name',
    kind: 'text',
    sticky: true,
    minWidth: 220,
    maxLength: 300,
    get: (row) => str(row.name),
    commit: textCommit('name', '', { required: 'Name is required.' }),
  }];
  if (show(disabled, 'description')) {
    columns.push({ id: 'description', label: 'Description', kind: 'longtext', minWidth: 260, get: (row) => str(row.description), commit: textCommit('description', '') });
  }
  if (show(disabled, 'vendorName')) {
    columns.push({ id: 'vendorName', label: 'Vendor name', kind: 'text', minWidth: 180, maxLength: 200, get: (row) => str(row.vendorName), commit: textCommit('vendorName', null, { max: 200 }) });
  }
  if (show(disabled, 'vendorUrl')) {
    columns.push({
      id: 'vendorUrl',
      label: 'Home page',
      kind: 'text',
      minWidth: 200,
      maxLength: 500,
      placeholder: 'https://',
      get: (row) => str(row.vendorUrl),
      commit: (_row, value) => {
        const result = vendorUrlForSave(typeof value === 'string' ? value : '');
        if (result.error) return { error: result.error };
        return { body: { vendorUrl: result.url } };
      },
    });
  }
  if (show(disabled, 'vendorSummary')) {
    columns.push({ id: 'vendorSummary', label: 'Vendor description', kind: 'longtext', minWidth: 240, maxLength: 1000, get: (row) => str(row.vendorSummary), commit: textCommit('vendorSummary', null, { max: 1000 }) });
  }
  const owners = optionsOf(lookups.picklists, 'owner');
  columns.push(pickColumn({
    id: 'owner',
    label: 'Business Owner',
    key: 'owner',
    options: owners,
    allowCustom: owners.length > 0,
    placeholder: 'Name',
    get: (row) => str(row.owner),
  }));
  if (show(disabled, 'ownerOrg')) {
    const orgs = organizationChoices(lookups.organizations, lookups.picklists);
    columns.push(relationColumn({
      id: 'ownerOrgId',
      label: 'Owning Organization',
      key: 'ownerOrgId',
      placeholder: 'Unassigned',
      choices: () => orgs,
      get: (row) => str(row.ownerOrgId),
    }));
  }
  columns.push(pickColumn({ id: 'type', label: 'Type', key: 'type', options: optionsOf(lookups.picklists, 'application_type'), get: (row) => str(row.type) }));
  columns.push(pickColumn({ id: 'lifecycle', label: 'Lifecycle', key: 'lifecycle', options: optionsOf(lookups.picklists, 'lifecycle'), get: (row) => str(row.lifecycle) }));
  if (show(disabled, 'lifecycleStart')) columns.push({ id: 'lifecycleStartDate', label: 'Lifecycle start', kind: 'date', minWidth: 150, get: (row) => dateInputValue(row.lifecycleStartDate), commit: dateCommit('lifecycleStartDate') });
  if (show(disabled, 'lifecycleEnd')) columns.push({ id: 'lifecycleEndDate', label: 'Lifecycle end', kind: 'date', minWidth: 150, get: (row) => dateInputValue(row.lifecycleEndDate), commit: dateCommit('lifecycleEndDate') });
  if (show(disabled, 'contractStart')) columns.push({ id: 'contractStartDate', label: 'Contract start', kind: 'date', minWidth: 150, get: (row) => dateInputValue(row.contractStartDate), commit: dateCommit('contractStartDate') });
  if (show(disabled, 'contractEnd')) columns.push({ id: 'contractEndDate', label: 'Contract end', kind: 'date', minWidth: 150, get: (row) => dateInputValue(row.contractEndDate), commit: dateCommit('contractEndDate') });
  if (show(disabled, 'contractDetails')) columns.push({ id: 'contractDetails', label: 'Contract details', kind: 'longtext', minWidth: 220, get: (row) => str(row.contractDetails), commit: textCommit('contractDetails', null) });
  const criticality = optionsOf(lookups.picklists, 'criticality');
  columns.push(pickColumn({
    id: 'criticality',
    label: 'Business Criticality',
    key: 'criticality',
    options: criticality,
    get: (row) => str(row.criticality),
    locked: (row) => (Array.isArray(row.capabilities) && row.capabilities.length > 0 ? 'Inherited from linked capabilities.' : null),
  }));
  columns.push(pickColumn({ id: 'cost', label: 'Cost', key: 'cost', options: optionsOf(lookups.picklists, 'application_cost'), get: (row) => str(row.cost) }));
  columns.push(pickColumn({ id: 'functionalFit', label: 'Functional Fit', key: 'functionalFit', options: optionsOf(lookups.picklists, 'functional_fit'), get: (row) => str(row.functionalFit) }));
  columns.push(pickColumn({ id: 'technicalFit', label: 'Technical Fit', key: 'technicalFit', options: optionsOf(lookups.picklists, 'technical_fit'), get: (row) => str(row.technicalFit) }));
  columns.push({
    id: 'time',
    label: 'TIME',
    kind: 'readonly',
    minWidth: 120,
    hint: 'Calculated from functional and technical fit.',
    get: (row) => getAppTimeAssessment(row, lookups.thresholds)?.label || '—',
  });
  if (show(disabled, 'timeRationale')) {
    columns.push({ id: 'timeRationale', label: 'TIME rationale', kind: 'longtext', minWidth: 240, maxLength: 2000, get: (row) => str(row.timeRationale), commit: textCommit('timeRationale', null, { max: 2000 }) });
  }
  if (show(disabled, 'capabilities')) {
    columns.push(multiColumn('capabilityIds', 'Business Capabilities', 'capabilityIds', named(lookups.capabilities), (row) => idsOf(row.capabilities)));
  }
  if (show(disabled, 'processedInformation')) {
    columns.push(multiColumn('processedInformationObjectIds', 'Processed Information', 'processedInformationObjectIds', named(lookups.information), (row) => idsOf(row.processedInformationObjects)));
  }
  columns.push(...customColumns('Application', lookups.metaDefs));
  return columns;
}

function capabilityColumns(lookups: EditLookups): EditColumn[] {
  const disabled = lookups.disabled;
  const columns: EditColumn[] = [{
    id: 'name',
    label: 'Name',
    kind: 'text',
    sticky: true,
    minWidth: 220,
    get: (row) => str(row.name),
    commit: textCommit('name', '', { required: 'Name is required.' }),
  }];
  if (show(disabled, 'capability.description')) {
    columns.push({ id: 'description', label: 'Purpose', kind: 'longtext', minWidth: 260, get: (row) => str(row.description), commit: textCommit('description', '') });
  }
  if (show(disabled, 'capability.parent')) {
    const choices = named(lookups.capabilities);
    columns.push(relationColumn({
      id: 'parentId',
      label: 'Parent',
      key: 'parentId',
      placeholder: 'None',
      choices: (row) => parentChoices(lookups.capabilities, row, choices),
      get: (row) => str(row.parentId),
    }));
  }
  columns.push(pickColumn({
    id: 'criticality',
    label: 'Business Criticality',
    key: 'criticality',
    options: optionsOf(lookups.picklists, 'criticality'),
    get: (row) => str(row.criticality),
    locked: (row) => ((lookups.capabilities || []).some((item) => item?.parentId === row.id) ? 'Inherited from a sub-capability.' : null),
  }));
  if (show(disabled, 'capability.applications')) {
    columns.push(multiColumn('applicationIds', 'Supporting Applications', 'applicationIds', named(lookups.applications), (row) => idsOf(row.applications)));
  }
  columns.push(...customColumns('Capability', lookups.metaDefs));
  return columns;
}

function ownedApplicationOptions(lookups: EditLookups): PickOption[] {
  const orgName = new Map(
    (lookups.organizations || [])
      .filter((org) => org?.id)
      .map((org) => [String(org.id), String(org.name || '')]),
  );
  return (lookups.applications || [])
    .filter((app) => app?.id)
    .map((app) => {
      const owner = String(app.ownerOrg?.name || orgName.get(String(app.ownerOrgId || '')) || '');
      return {
        value: String(app.id),
        label: String(app.name || 'Untitled'),
        ...(owner ? { detail: owner } : {}),
      };
    })
    .sort((left, right) => left.label.localeCompare(right.label, undefined, { numeric: true, sensitivity: 'base' }));
}

function organizationColumns(lookups: EditLookups): EditColumn[] {
  const disabled = lookups.disabled;
  const columns: EditColumn[] = [{
    id: 'name',
    label: 'Name',
    kind: 'text',
    sticky: true,
    minWidth: 220,
    get: (row) => str(row.name),
    commit: textCommit('name', '', { required: 'Name is required.' }),
  }];
  if (show(disabled, 'organization.description')) {
    columns.push({ id: 'description', label: 'Description', kind: 'longtext', minWidth: 260, get: (row) => str(row.description), commit: textCommit('description', '') });
  }
  columns.push(pickColumn({ id: 'type', label: 'Type', key: 'type', options: optionsOf(lookups.picklists, 'organization_type'), get: (row) => str(row.type) }));
  if (show(disabled, 'organization.parent')) {
    const choices = organizationChoices(lookups.organizations, lookups.picklists);
    columns.push(relationColumn({
      id: 'parentId',
      label: 'Part of',
      key: 'parentId',
      placeholder: 'Top level',
      choices: (row) => parentChoices(lookups.organizations, row, choices),
      get: (row) => str(row.parentId),
    }));
  }
  if (show(disabled, 'organization.capabilities')) {
    columns.push(multiColumn('capabilityIds', 'Supported Capabilities', 'capabilityIds', named(lookups.capabilities), (row) => idsOf(row.supportedCapabilities)));
  }
  if (show(disabled, 'organization.applications')) {
    columns.push(multiColumn('applicationIds', 'Owned Applications', 'applicationIds', ownedApplicationOptions(lookups), (row) => idsOf(row.ownedApplications)));
  }
  return columns;
}

function goalColumns(lookups: EditLookups): EditColumn[] {
  const disabled = lookups.disabled;
  const columns: EditColumn[] = [{
    id: 'name',
    label: 'Name',
    kind: 'text',
    sticky: true,
    minWidth: 220,
    get: (row) => str(row.name),
    commit: textCommit('name', '', { required: 'Name is required.' }),
  }];
  if (show(disabled, 'strategicGoal.description')) {
    columns.push({ id: 'description', label: 'Description', kind: 'longtext', minWidth: 260, get: (row) => str(row.description), commit: textCommit('description', null) });
  }
  if (show(disabled, 'strategicGoal.parent')) {
    const choices = named(lookups.goals);
    columns.push(relationColumn({
      id: 'parentId',
      label: 'Parent',
      key: 'parentId',
      placeholder: 'Top level',
      choices: (row) => parentChoices(lookups.goals, row, choices),
      get: (row) => str(row.parentId),
    }));
  }
  if (show(disabled, 'strategicGoal.capabilities')) {
    columns.push(multiColumn('capabilityIds', 'Required Capabilities', 'capabilityIds', named(lookups.capabilities), (row) => idsOf(row.capabilities)));
  }
  return columns;
}

function informationColumns(lookups: EditLookups): EditColumn[] {
  const disabled = lookups.disabled;
  const scale = optionsOf(lookups.picklists, 'cia_scale');
  const columns: EditColumn[] = [{
    id: 'name',
    label: 'Name',
    kind: 'text',
    sticky: true,
    minWidth: 220,
    get: (row) => str(row.name),
    commit: textCommit('name', '', { required: 'Name is required.' }),
  }];
  if (show(disabled, 'information.aliases')) {
    columns.push({ id: 'aliases', label: 'Aliases', kind: 'text', minWidth: 180, get: (row) => str(row.aliases), commit: textCommit('aliases', '') });
  }
  if (show(disabled, 'information.description')) {
    columns.push({ id: 'description', label: 'Description', kind: 'longtext', minWidth: 260, get: (row) => str(row.description), commit: textCommit('description', '') });
  }
  columns.push(pickColumn({ id: 'type', label: 'Type', key: 'type', options: optionsOf(lookups.picklists, 'information_type'), get: (row) => str(row.type) }));
  columns.push(pickColumn({ id: 'confidentiality', label: 'Confidentiality', key: 'confidentiality', options: scale, get: (row) => str(row.confidentiality) }));
  columns.push(pickColumn({ id: 'integrity', label: 'Integrity', key: 'integrity', options: scale, get: (row) => str(row.integrity) }));
  columns.push(pickColumn({ id: 'availability', label: 'Availability', key: 'availability', options: scale, get: (row) => str(row.availability) }));
  columns.push(pickColumn({ id: 'piiCategory', label: 'PII Category', key: 'piiCategory', options: optionsOf(lookups.picklists, 'pii_category'), get: (row) => str(row.piiCategory) }));
  if (show(disabled, 'information.businessOwner')) {
    columns.push(relationColumn({
      id: 'businessOwnerId',
      label: 'Business Owner',
      key: 'businessOwnerId',
      placeholder: 'Unassigned',
      choices: () => organizationChoices(lookups.organizations, lookups.picklists),
      get: (row) => str(row.businessOwnerId),
    }));
  }
  if (show(disabled, 'information.sourceOfTruth')) {
    columns.push(relationColumn({
      id: 'appOwnerId',
      label: 'Source of Truth',
      key: 'appOwnerId',
      placeholder: 'Unassigned',
      choices: () => named(lookups.applications),
      get: (row) => str(row.appOwnerId),
    }));
  }
  columns.push(...customColumns('InformationObject', lookups.metaDefs));
  return columns;
}

function integrationColumns(lookups: EditLookups): EditColumn[] {
  const disabled = lookups.disabled;
  const apps = named(lookups.applications);
  const columns: EditColumn[] = [];
  if (show(disabled, 'integration.description')) {
    columns.push({ id: 'description', label: 'Description', kind: 'longtext', minWidth: 240, get: (row) => str(row.description), commit: textCommit('description', '') });
  }
  if (show(disabled, 'integration.source')) {
    columns.push(relationColumn({
      id: 'sourceAppId',
      label: 'Source',
      key: 'sourceAppId',
      required: true,
      placeholder: 'Choose',
      choices: () => apps,
      get: (row) => str(row.sourceAppId),
      refuse: (row, value) => (value && value === row.targetAppId ? 'Source and target must be different applications.' : null),
    }));
    columns[columns.length - 1].sticky = true;
  }
  if (show(disabled, 'integration.payload')) {
    columns.push(relationColumn({
      id: 'infoObjectId',
      label: 'Payload',
      key: 'infoObjectId',
      placeholder: 'None',
      choices: () => named(lookups.information),
      get: (row) => str(row.infoObjectId),
    }));
  }
  if (show(disabled, 'integration.target')) {
    columns.push(relationColumn({
      id: 'targetAppId',
      label: 'Target',
      key: 'targetAppId',
      required: true,
      placeholder: 'Choose',
      choices: () => apps,
      get: (row) => str(row.targetAppId),
      refuse: (row, value) => (value && value === row.sourceAppId ? 'Source and target must be different applications.' : null),
    }));
  }
  columns.push(pickColumn({ id: 'pattern', label: 'Pattern', key: 'pattern', options: optionsOf(lookups.picklists, 'integration_pattern'), get: (row) => str(row.pattern) }));
  columns.push(pickColumn({ id: 'frequency', label: 'Frequency', key: 'frequency', options: optionsOf(lookups.picklists, 'integration_frequency'), get: (row) => str(row.frequency) }));
  const crud = optionsOf(lookups.picklists, 'integration_crud');
  if (crud.length > 0) {
    columns.push({
      id: 'crud',
      label: 'CRUD',
      kind: 'choices',
      minWidth: 200,
      placeholder: 'Add…',
      get: (row) => (typeof row.crud === 'string' ? row.crud.split(',').filter(Boolean) : []),
      options: () => crud,
      commit: (_row, value) => ({ body: { crud: Array.isArray(value) ? value.map(String).filter(Boolean).join(',') : '' } }),
    });
  } else {
    columns.push({ id: 'crud', label: 'CRUD', kind: 'text', minWidth: 160, get: (row) => str(row.crud), commit: textCommit('crud', '') });
  }
  columns.push(pickColumn({
    id: 'type',
    label: 'Type',
    key: 'type',
    options: optionsOf(lookups.picklists, 'integration_type'),
    empty: null,
    get: (row) => str(row.type),
  }));
  if (!columns.some((column) => column.sticky) && columns[0]) columns[0].sticky = true;
  return columns;
}

export function buildEditColumns(kind: EditKind, lookups: EditLookups): EditColumn[] {
  if (kind === 'application') return applicationColumns(lookups);
  if (kind === 'capability') return capabilityColumns(lookups);
  if (kind === 'organization') return organizationColumns(lookups);
  if (kind === 'strategicGoal') return goalColumns(lookups);
  if (kind === 'information') return informationColumns(lookups);
  return integrationColumns(lookups);
}
