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
export function linkApplicationMentions(text: string, applications: ApplicationLink[]) {
  const named = uniqueApplications(applications);
  if (!text || named.length === 0) return text;
  const protectedSpans = /```[\s\S]*?```|`[^`\n]+`|\[[^\[\]\n]*\]\([^)\n]*\)|https?:\/\/[^\s)]+/g;
  let result = '';
  let cursor = 0;
  for (const match of text.matchAll(protectedSpans)) {
    const start = match.index ?? 0;
    result += linkPlain(text.slice(cursor, start), named);
    result += match[0];
    cursor = start + match[0].length;
  }
  result += linkPlain(text.slice(cursor), named);
  return result;
}
