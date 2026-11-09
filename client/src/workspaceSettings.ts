import { parseDisabledNativeFields, type NativeFieldId } from './nativeFields';
import {
  DEFAULT_COST_CURRENCY,
  DEFAULT_COST_SCALE,
  normalizeCostCurrency,
  parseCostScale,
} from './cost';

export type WorkspaceSettings = {
  brandName: string;
  disabledNativeFields: NativeFieldId[];
  costCurrency: string;
  costScale: [number, number, number, number];
  onboardingCompleted: boolean;
};

export { parseDisabledNativeFields };

export function normalizeWorkspaceSettings(
  raw: unknown,
  fallback?: Partial<WorkspaceSettings>
): WorkspaceSettings {
  const data = (raw && typeof raw === 'object' ? raw : {}) as {
    brandName?: unknown;
    disabledNativeFields?: unknown;
    costCurrency?: unknown;
    costScale?: unknown;
    onboardingCompleted?: unknown;
  };
  return {
    brandName:
      typeof data.brandName === 'string' && data.brandName.trim()
        ? data.brandName
        : fallback?.brandName ?? 'OpenEA',
    disabledNativeFields:
      data.disabledNativeFields !== undefined
        ? parseDisabledNativeFields(data.disabledNativeFields)
        : fallback?.disabledNativeFields ?? [],
    costCurrency:
      data.costCurrency !== undefined
        ? normalizeCostCurrency(data.costCurrency)
        : fallback?.costCurrency ?? DEFAULT_COST_CURRENCY,
    costScale:
      data.costScale !== undefined
        ? parseCostScale(data.costScale)
        : fallback?.costScale ?? [...DEFAULT_COST_SCALE],
    onboardingCompleted:
      typeof data.onboardingCompleted === 'boolean'
        ? data.onboardingCompleted
        : fallback?.onboardingCompleted ?? true,
  };
}

export async function fetchWorkspaceSettings(): Promise<WorkspaceSettings> {
  const res = await fetch('/api/workspace');
  if (!res.ok) throw new Error('Could not load workspace settings');
  const data = await res.json();
  return normalizeWorkspaceSettings(data);
}
