import type { PrismaClient } from '@prisma/client';
import { completeConversation, LlmError, type LlmCallConfig } from './llm.js';

const NO_SEARCH_NOTE = 'Web search is not configured. This suggestion uses only the text you entered.';
const NO_RESULTS_NOTE = 'No web results were found. This suggestion uses only the text you entered.';
const EMPTY_NOTE = 'No product details were found. Add a short note and ask again.';

export type SearchHit = { title: string; url: string; description: string };
export type SuggestionSource = { title: string; url: string };
export type CatalogOption = { value: string; label: string };
export type CatalogField = { fieldName: string; label: string; fieldType: string };

export type SuggestionInput = {
  name: string;
  context: string;
  description: string;
  contractDetails: string;
};

export type VendorProfile = { name: string; url: string; summary: string };

export type ApplicationSuggestion = {
  description: string;
  vendor: string;
  vendorField: string;
  vendorLabel: string;
  vendorProfile: VendorProfile | null;
  type: string;
  note: string;
  sources: SuggestionSource[];
};

const INSTRUCTIONS = `You propose fields for one application record in OpenEA.
Use the user's text first. Use the web results only to identify the product and its vendor.
Rewrite the description in two to four formal sentences: the business activity it supports, who uses it, and the records or outcome it handles.
Do not copy the web results. Do not use promotional language.
Set vendor only when the user's text or a web result names the publisher or provider. Otherwise use an empty string.
Set vendorHomePage to the vendor's own website from the web results, not an article about the product. Otherwise use an empty string.
Set vendorDescription to one or two short formal sentences about the vendor. Do not repeat the application description. Otherwise use an empty string.
Set type only to a value or label from the application type list. Otherwise use an empty string.
Do not invent an owner, organization, dates, scores, or relationships.
Reply with one JSON object and nothing else:
{"description":"","vendor":"","vendorHomePage":"","vendorDescription":"","type":"","note":""}
note is one short sentence when the web results are missing or do not match the application. Otherwise note is an empty string.`;

export function buildSearchQuery(name: string, context: string): string {
  const extra = context.trim().replace(/\s+/g, ' ').slice(0, 120);
  return [name.trim(), 'software', extra].filter(Boolean).join(' ').slice(0, 400);
}

export function parseBraveResults(payload: unknown): SearchHit[] {
  if (!payload || typeof payload !== 'object') return [];
  const web = (payload as Record<string, unknown>).web;
  const results = web && typeof web === 'object' ? (web as Record<string, unknown>).results : null;
  if (!Array.isArray(results)) return [];
  const hits: SearchHit[] = [];
  for (const item of results) {
    if (!item || typeof item !== 'object') continue;
    const record = item as Record<string, unknown>;
    const title = clip(record.title, 200);
    const url = clip(record.url, 500);
    const description = clip(record.description, 500);
    if (!title || !/^https?:\/\//i.test(url)) continue;
    hits.push({ title, url, description });
    if (hits.length === 5) break;
  }
  return hits;
}

export async function searchProduct(name: string, context: string, apiKey: string, fetchImpl: typeof fetch = fetch): Promise<SearchHit[]> {
  const [official, general] = await Promise.all([
    searchBrave(`${name.trim()} official homepage`.slice(0, 400), apiKey, fetchImpl),
    searchBrave(buildSearchQuery(name, context), apiKey, fetchImpl),
  ]);
  const seen = new Set<string>();
  const hits: SearchHit[] = [];
  for (const hit of [...official, ...general]) {
    if (seen.has(hit.url)) continue;
    seen.add(hit.url);
    hits.push(hit);
    if (hits.length === 8) break;
  }
  return hits;
}

export async function searchBrave(query: string, apiKey: string, fetchImpl: typeof fetch = fetch): Promise<SearchHit[]> {
  const key = apiKey.trim();
  const q = query.trim();
  if (!key || !q) return [];
  try {
    const response = await fetchImpl(`https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(q)}&count=5`, {
      headers: { Accept: 'application/json', 'X-Subscription-Token': key },
      signal: AbortSignal.timeout(5000),
    });
    if (!response.ok) return [];
    return parseBraveResults(await response.json());
  } catch {
    return [];
  }
}

export type SuggestionDraft = {
  description: string;
  vendor: string;
  vendorHomePage: string;
  vendorDescription: string;
  type: string;
  note: string;
};

export function parseSuggestionReply(text: string): SuggestionDraft {
  const parsed = extractJsonObject(text);
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new LlmError('The suggestion reply had no fields.', 502);
  }
  const record = parsed as Record<string, unknown>;
  return {
    description: clip(record.description, 4000),
    vendor: clip(record.vendor, 200),
    vendorHomePage: clip(record.vendorHomePage, 500),
    vendorDescription: clip(record.vendorDescription, 320),
    type: clip(record.type, 200),
    note: clip(record.note, 400),
  };
}

export function supportedHomePage(url: string, blob: string): string {
  const trimmed = url.trim();
  if (!/^https?:\/\//i.test(trimmed)) return '';
  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return '';
  }
  if (parsed.username || parsed.password) return '';
  const host = parsed.hostname.replace(/^www\./i, '').toLowerCase();
  const hay = blob.toLowerCase();
  if (host.length < 4 || !hay.includes(host)) return '';
  return trimmed;
}

export function vendorSupported(vendor: string, blob: string): boolean {
  const hay = blob.toLowerCase();
  const raw = vendor.trim().toLowerCase();
  if (raw.length < 2 || !hay) return false;
  if (hay.includes(raw)) return true;
  const core = raw
    .replace(/\b(inc|ltd|llc|gmbh|corp|corporation|company|se|ag|sa|plc)\b/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
  return core.length >= 2 && hay.includes(core);
}

export function sanitizeSuggestion(
  raw: SuggestionDraft,
  types: CatalogOption[],
  fields: CatalogField[],
  hits: SearchHit[],
  input: SuggestionInput,
  searchConfigured: boolean,
): ApplicationSuggestion {
  const userText = [input.context, input.description, input.contractDetails].join('\n');
  const supportBlob = [input.name, userText, ...hits.flatMap((hit) => [hit.title, hit.url, hit.description])].join('\n');
  const nothingToUse = !userText.trim() && hits.length === 0;
  const vendor = nothingToUse || !vendorSupported(raw.vendor, supportBlob) ? '' : raw.vendor;
  const homePage = vendor ? supportedHomePage(raw.vendorHomePage, supportBlob) : '';
  const summary = vendor && homePage ? raw.vendorDescription : '';
  const target = vendor ? vendorTarget(fields) : null;
  let note = raw.note;
  if (!searchConfigured) note = NO_SEARCH_NOTE;
  else if (hits.length === 0 && !note) note = NO_RESULTS_NOTE;
  if (nothingToUse) note = searchConfigured ? EMPTY_NOTE : NO_SEARCH_NOTE;
  return {
    description: nothingToUse ? '' : raw.description,
    vendor,
    vendorField: target?.fieldName ?? '',
    vendorLabel: vendor ? (target?.label ?? '') : '',
    vendorProfile: vendor && homePage && summary ? { name: vendor, url: homePage, summary } : null,
    type: nothingToUse ? '' : matchOption(raw.type, types),
    note,
    sources: hits.map((hit) => ({ title: hit.title, url: hit.url })),
  };
}

export async function suggestApplicationFields(
  prisma: PrismaClient,
  provider: LlmCallConfig,
  input: SuggestionInput,
  braveApiKey: string,
): Promise<ApplicationSuggestion> {
  const [types, fields] = await Promise.all([loadTypes(prisma), loadFields(prisma)]);
  const searchConfigured = braveApiKey.trim().length > 0;
  const hits = await searchProduct(input.name, input.context, braveApiKey);
  const text = await completeConversation(
    provider,
    [{ role: 'user', content: suggestionRequest(input, hits, types) }],
    INSTRUCTIONS,
    undefined,
    1200,
  );
  return sanitizeSuggestion(parseSuggestionReply(text), types, fields, hits, input, searchConfigured);
}

async function loadTypes(prisma: PrismaClient): Promise<CatalogOption[]> {
  const picklist = await prisma.picklist.findUnique({
    where: { name: 'application_type' },
    include: { options: { orderBy: { order: 'asc' }, select: { value: true, label: true } } },
  });
  return picklist?.options.map((option) => ({ value: option.value, label: option.label })) ?? [];
}

async function loadFields(prisma: PrismaClient): Promise<CatalogField[]> {
  return prisma.metadataDefinition.findMany({
    where: { entityType: 'Application' },
    orderBy: { label: 'asc' },
    select: { fieldName: true, label: true, fieldType: true },
  });
}

function suggestionRequest(input: SuggestionInput, hits: SearchHit[], types: CatalogOption[]): string {
  const results = hits.length > 0
    ? hits.map((hit, index) => `${index + 1}. ${hit.title}\n${hit.url}\n${hit.description}`).join('\n\n')
    : 'none';
  const typeList = types.length > 0 ? types.map((option) => `${option.value} | ${option.label}`).join('\n') : 'none';
  return [
    `Application name: ${input.name}`,
    input.context.trim() ? `Context: ${input.context.trim()}` : 'Context: none',
    input.description.trim() ? `Current description: ${input.description.trim()}` : 'Current description: none',
    input.contractDetails.trim() ? `Current contract details: ${input.contractDetails.trim()}` : 'Current contract details: none',
    `Web results:\n${results}`,
    `Application types (value | label):\n${typeList}`,
  ].join('\n\n');
}

function vendorTarget(fields: CatalogField[]): CatalogField | null {
  const matches = fields.filter((field) => (
    !['boolean', 'range', 'date'].includes(field.fieldType)
    && /vendor|publisher|manufacturer/i.test(`${field.fieldName} ${field.label}`)
  ));
  return matches.find((field) => field.label.toLowerCase() === 'vendor' || field.fieldName.toLowerCase() === 'vendor') ?? matches[0] ?? null;
}

function matchOption(value: string, options: CatalogOption[]): string {
  if (!value || options.length === 0) return '';
  const found = options.find((option) => option.value.toLowerCase() === value.toLowerCase() || option.label.toLowerCase() === value.toLowerCase());
  return found?.value ?? '';
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
