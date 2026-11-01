export type ApplicationLink = { id: string; name: string };

function escapeRegExp(value: string) {
  return value.replace(/[\\^$.*+?()[\]{}|]/g, '\\$&');
}

function linkLabel(name: string) {
  return name.replace(/[\\[\]]/g, (char) => `\\${char}`);
}

// Longer names are tried first so "Vaka Hemtjänst Stockholm" is not partly linked as "Vaka".
function uniqueApplications(applications: ApplicationLink[]) {
  const groups = new Map<string, ApplicationLink[]>();
  for (const application of applications) {
    const id = application.id.trim();
    const name = application.name.trim();
    if (!id || name.length < 2) continue;
    const key = name.toLocaleLowerCase('en');
    const group = groups.get(key) ?? [];
    group.push({ id, name });
    groups.set(key, group);
  }
  return [...groups.values()]
    .flatMap((group) => (group.length === 1 && group[0] ? [group[0]] : []))
    .sort((a, b) => b.name.length - a.name.length || a.name.localeCompare(b.name));
}

function appIdFromHref(href: string) {
  const target = href.trim().replace(/\s+["'][^"']*["']\s*$/, '');
  const match = /^\/apps\/([^/?#\s]+)\/?$/i.exec(target);
  if (!match?.[1]) return null;
  try {
    return decodeURIComponent(match[1]);
  } catch {
    return match[1];
  }
}

function unescapeLabel(label: string) {
  return label.replace(/\\([[\]])/g, '$1');
}

// A model sometimes invents /apps/m365-id. Drop that link so the name can be linked to the real record.
// Images are left alone: the character before the label bracket is "!".
function rewriteUnknownAppLinks(text: string, knownIds: Set<string>) {
  return text.replace(/(?<!!)\[([^\[\]\n]*)\]\(([^)\n]*)\)/g, (full, label: string, href: string) => {
    const id = appIdFromHref(href);
    if (id === null || knownIds.has(id)) return full;
    return unescapeLabel(label);
  });
}

function linkPlain(text: string, applications: ApplicationLink[]) {
  if (!text || applications.length === 0) return text;
  const byName = new Map(applications.map((application) => [application.name.toLocaleLowerCase('en'), application]));
  const pattern = applications.map((application) => escapeRegExp(application.name)).join('|');
  const mentions = new RegExp(`(?<![\\p{L}\\p{N}])(?:${pattern})(?![\\p{L}\\p{N}])`, 'giu');
  return text.replace(mentions, (match) => {
    const application = byName.get(match.toLocaleLowerCase('en'));
    if (!application) return match;
    return `[${linkLabel(match)}](/apps/${encodeURIComponent(application.id)})`;
  });
}

// Wrap recorded application names in markdown links. Existing links, code, and URLs are left unchanged.
// An empty catalog means the list is not available yet, so the text is returned as written.
export function linkApplicationMentions(text: string, applications: ApplicationLink[]) {
  if (!text || applications.length === 0) return text;
  const knownIds = new Set(applications.map((application) => application.id.trim()).filter(Boolean));
  const rewritten = mapOutsideCode(text, (plain) => rewriteUnknownAppLinks(plain, knownIds));
  const named = uniqueApplications(applications);
  if (!rewritten || named.length === 0) return rewritten;
  const protectedSpans = /```[\s\S]*?```|`[^`\n]+`|\[[^\[\]\n]*\]\([^)\n]*\)|https?:\/\/[^\s)]+/g;
  let result = '';
  let cursor = 0;
  for (const match of rewritten.matchAll(protectedSpans)) {
    const start = match.index ?? 0;
    result += linkPlain(rewritten.slice(cursor, start), named);
    result += match[0];
    cursor = start + match[0].length;
  }
  result += linkPlain(rewritten.slice(cursor), named);
  return result;
}

function mapOutsideCode(text: string, transform: (plain: string) => string) {
  const protectedSpans = /```[\s\S]*?```|`[^`\n]+`/g;
  let result = '';
  let cursor = 0;
  for (const match of text.matchAll(protectedSpans)) {
    const start = match.index ?? 0;
    result += transform(text.slice(cursor, start));
    result += match[0];
    cursor = start + match[0].length;
  }
  result += transform(text.slice(cursor));
  return result;
}
