import type { PrismaClient } from '@prisma/client';
import { completeConversation, LlmError, type LlmCallConfig } from './llm.js';

const MAX_MATCHES = 8;
const MAX_CATALOG_CHARS = 24000;

export type CatalogCap = {
  id: string;
  name: string;
  description: string;
  parentId: string | null;
  parentName: string;
};

export type MappedCapability = {
  id: string;
  name: string;
  parentName: string;
};

export type CapabilityMappingInput = {
  name: string;
  description: string;
  vendorName: string;
  type: string;
};

export type CapabilityMapping = {
  capabilities: MappedCapability[];
  note: string;
};

const INSTRUCTIONS = `You map one application to the business capabilities it supports.
Use only ids from the capability list. Choose capabilities whose business activity the application performs or directly enables.
Prefer the most specific capability. Do not also select its parent.
Do not select a capability only because the names share a word.
Return at most ${MAX_MATCHES} ids. If none fit, return an empty list.
Reply with one JSON object and nothing else:
{"capabilityIds":[],"note":""}
note is one short sentence on why these capabilities fit, or why none fit.`;

export function formatCapabilityCatalog(catalog: CatalogCap[]): { text: string; truncated: boolean } {
  const detailed = catalog.map((cap) => catalogLine(cap, true));
  const detailedText = detailed.join('\n');
  if (detailedText.length <= MAX_CATALOG_CHARS) return { text: detailedText, truncated: false };
  const brief = catalog.map((cap) => catalogLine(cap, false));
  const briefText = brief.join('\n');
  if (briefText.length <= MAX_CATALOG_CHARS) return { text: briefText, truncated: false };
  const kept: string[] = [];
  let size = 0;
  for (const line of brief) {
    const next = size + line.length + 1;
    if (next > MAX_CATALOG_CHARS) break;
    kept.push(line);
    size = next;
  }
  return { text: kept.join('\n'), truncated: true };
}

export function parseCapabilityMappingReply(text: string): { capabilityIds: string[]; note: string } {
  const parsed = extractJsonObject(text);
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new LlmError('The capability mapping reply had no fields.', 502);
  }
  const record = parsed as Record<string, unknown>;
  const rawIds = Array.isArray(record.capabilityIds) ? record.capabilityIds : [];
  return {
    capabilityIds: rawIds.flatMap((id) => typeof id === 'string' ? [id] : []),
    note: clip(record.note, 400),
  };
}

export function sanitizeCapabilityMapping(
  raw: { capabilityIds: string[]; note: string },
  catalog: CatalogCap[],
): CapabilityMapping {
  const byId = new Map(catalog.map((cap) => [cap.id, cap]));
  const byName = new Map<string, CatalogCap[]>();
  for (const cap of catalog) {
    const key = cap.name.toLowerCase();
    const list = byName.get(key) ?? [];
    list.push(cap);
    byName.set(key, list);
  }
  const resolved: string[] = [];
  for (const token of raw.capabilityIds) {
    const trimmed = token.trim();
    if (!trimmed) continue;
    const named = byName.get(trimmed.toLowerCase());
    const cap = byId.get(trimmed) ?? (named && named.length === 1 ? named[0] : undefined);
    if (!cap || resolved.includes(cap.id)) continue;
    resolved.push(cap.id);
  }
  const kept = dropAncestors(resolved, catalog).slice(0, MAX_MATCHES);
  return {
    capabilities: kept.flatMap((id) => {
      const cap = byId.get(id);
      return cap ? [{ id: cap.id, name: cap.name, parentName: cap.parentName }] : [];
    }),
    note: raw.note,
  };
}

export async function suggestApplicationCapabilities(
  prisma: PrismaClient,
  provider: LlmCallConfig,
  input: CapabilityMappingInput,
): Promise<CapabilityMapping> {
  const catalog = await loadCapabilityCatalog(prisma);
  if (catalog.length === 0) return { capabilities: [], note: 'No capabilities are defined yet.' };
  const formatted = formatCapabilityCatalog(catalog);
  const text = await completeConversation(
    provider,
    [{ role: 'user', content: mappingRequest(input, formatted) }],
    INSTRUCTIONS,
    undefined,
    800,
  );
  return sanitizeCapabilityMapping(parseCapabilityMappingReply(text), catalog);
}

async function loadCapabilityCatalog(prisma: PrismaClient): Promise<CatalogCap[]> {
  const rows = await prisma.capability.findMany({
    select: {
      id: true,
      name: true,
      description: true,
      parentId: true,
      parent: { select: { name: true } },
    },
  });
  return rows
    .flatMap((row) => {
      const name = row.name.trim();
      if (!name) return [];
      return [{
        id: row.id,
        name,
        description: (row.description ?? '').replace(/\s+/g, ' ').trim(),
        parentId: row.parentId,
        parentName: row.parent?.name.trim() ?? '',
      }];
    })
    .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
}

function mappingRequest(input: CapabilityMappingInput, catalog: { text: string; truncated: boolean }): string {
  return [
    `Application name: ${input.name.trim()}`,
    input.description.trim() ? `Description: ${input.description.trim()}` : 'Description: none',
    input.vendorName.trim() ? `Vendor: ${input.vendorName.trim()}` : 'Vendor: none',
    input.type.trim() ? `Application type: ${input.type.trim()}` : 'Application type: none',
    catalog.truncated ? 'The capability list was cut off. Map only from the ids shown.' : '',
    `Capabilities (id | name | parent | description):\n${catalog.text || 'none'}`,
  ].filter(Boolean).join('\n\n');
}

function catalogLine(cap: CatalogCap, withDescription: boolean): string {
  const parent = cap.parentName || '-';
  const base = `${cap.id} | ${cap.name} | ${parent}`;
  if (!withDescription || !cap.description) return base;
  return `${base} | ${cap.description.slice(0, 180)}`;
}

function dropAncestors(ids: string[], catalog: CatalogCap[]): string[] {
  const parentOf = new Map(catalog.map((cap) => [cap.id, cap.parentId]));
  const chosen = new Set(ids);
  const isAncestor = (id: string, descendant: string) => {
    let current = parentOf.get(descendant) ?? null;
    const seen = new Set<string>();
    while (current && !seen.has(current)) {
      if (current === id) return true;
      seen.add(current);
      current = parentOf.get(current) ?? null;
    }
    return false;
  };
  return ids.filter((id) => ![...chosen].some((other) => other !== id && isAncestor(id, other)));
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

function clip(value: unknown, max: number): string {
  if (typeof value !== 'string') return '';
  return value.trim().slice(0, max);
}
