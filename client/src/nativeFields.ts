// Built-in fields that have no picklist or custom-attribute editor.
// Application ids stay unprefixed so saved workspace settings keep working.
// A record's required identity stays on: application, capability, organization,
// and information names, a strategic goal name, plus an integration's source and target applications.

export const NATIVE_FIELD_IDS = [
  'name',
  'description',
  'vendorName',
  'vendorUrl',
  'vendorSummary',
  'ownerOrg',
  'lifecycleStart',
  'lifecycleEnd',
  'contractStart',
  'contractEnd',
  'contractDetails',
  'timeRationale',
  'capabilities',
  'processedInformation',
  'integrations',
  'references',
  'capability.name',
  'capability.description',
  'capability.parent',
  'capability.applications',
  'capability.references',
  'organization.name',
  'organization.description',
  'organization.parent',
  'organization.capabilities',
  'organization.references',
  'information.name',
  'information.aliases',
  'information.description',
  'information.businessOwner',
  'information.sourceOfTruth',
  'information.references',
  'integration.description',
  'integration.source',
  'integration.payload',
  'integration.target',
  'integration.references',
  'strategicGoal.name',
  'strategicGoal.description',
  'strategicGoal.parent',
  'strategicGoal.capabilities',
  'strategicGoal.references',
] as const;

export type NativeFieldId = (typeof NATIVE_FIELD_IDS)[number];

export const LOCKED_NATIVE_FIELD_IDS = [
  'name',
  'capability.name',
  'organization.name',
  'information.name',
  'integration.source',
  'integration.target',
  'strategicGoal.name',
] as const;

const NATIVE_FIELD_ID_SET = new Set<string>(NATIVE_FIELD_IDS);
const LOCKED_NATIVE_FIELD_SET = new Set<string>(LOCKED_NATIVE_FIELD_IDS);

export function isNativeFieldId(value: string): value is NativeFieldId {
  return NATIVE_FIELD_ID_SET.has(value);
}

export function isLockedNativeField(value: string): boolean {
  return LOCKED_NATIVE_FIELD_SET.has(value);
}

export function nativeFieldEnabled(disabled: readonly string[] | undefined, id: NativeFieldId): boolean {
  if (isLockedNativeField(id)) return true;
  return !(disabled ?? []).includes(id);
}

export function parseDisabledNativeFields(value: unknown): NativeFieldId[] {
  if (!Array.isArray(value)) return [];
  const ids = value.filter((item): item is NativeFieldId => typeof item === 'string' && isNativeFieldId(item) && !isLockedNativeField(item));
  return [...new Set(ids)];
}
