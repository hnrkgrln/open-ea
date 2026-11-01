export class MissingRecordError extends Error {
  constructor() {
    super('Not found');
    this.name = 'MissingRecordError';
  }
}

// A missing id is HTTP 404 with `{ error }`. That body has no id. Treating it as
// data makes the detail and edit pages render their normal sections empty.
export async function fetchRecord<T extends { id: string }>(url: string): Promise<T> {
  const response = await fetch(url);
  const body = await response.json().catch(() => null);
  const id = body && typeof body === 'object' ? (body as { id?: unknown }).id : undefined;
  const hasId = typeof id === 'string' && id.length > 0;
  if (response.status === 404 || (body && typeof body === 'object' && 'error' in body && !hasId)) {
    throw new MissingRecordError();
  }
  if (!response.ok || !hasId) {
    throw new Error('The record could not be loaded.');
  }
  return body as T;
}

export function retryRecordQuery(failureCount: number, error: Error) {
  return !(error instanceof MissingRecordError) && failureCount < 2;
}

export function recordIsMissing(record: { id?: unknown } | null | undefined, error: unknown) {
  if (error instanceof MissingRecordError) return true;
  return !!record && typeof record.id !== 'string';
}
