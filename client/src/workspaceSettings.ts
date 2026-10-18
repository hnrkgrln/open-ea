import { parseDisabledNativeFields, type NativeFieldId } from './nativeFields';

export type WorkspaceSettings = {
  brandName: string;
  disabledNativeFields: NativeFieldId[];
};

export { parseDisabledNativeFields };

export async function fetchWorkspaceSettings(): Promise<WorkspaceSettings> {
  const res = await fetch('/api/workspace');
  if (!res.ok) throw new Error('Could not load workspace settings');
  const data = await res.json() as { brandName?: unknown; disabledNativeFields?: unknown };
  return {
    brandName: typeof data.brandName === 'string' && data.brandName.trim() ? data.brandName : 'OpenEA',
    disabledNativeFields: parseDisabledNativeFields(data.disabledNativeFields),
  };
}
