import { Link as LinkIcon, ExternalLink, Plus, Trash2 } from 'lucide-react';

export interface Reference {
  url: string;
  title?: string;
}

const safeParse = (raw: string | null | undefined): Reference[] => {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((r: any) => r && typeof r.url === 'string').map((r: any) => ({ url: r.url, title: typeof r.title === 'string' ? r.title : undefined }));
  } catch {
    return [];
  }
};

// Serialize for storage. Returns null if the list is effectively empty so we don't
// store stale "[]" strings.
export const serializeReferences = (refs: Reference[]): string | null => {
  const cleaned = refs
    .map(r => ({ url: (r.url || '').trim(), title: (r.title || '').trim() }))
    .filter(r => r.url.length > 0)
    .map(r => r.title ? { url: r.url, title: r.title } : { url: r.url });
  return cleaned.length === 0 ? null : JSON.stringify(cleaned);
};

export const parseReferences = safeParse;

// Make sure the URL has a scheme so external clicks behave predictably.
const ensureScheme = (url: string) => {
  const trimmed = url.trim();
  if (!trimmed) return trimmed;
  return /^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
};

const hostnameOf = (url: string) => {
  try {
    return new URL(ensureScheme(url)).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
};

interface ListProps {
  raw: string | null | undefined;
}

// Read-only display for the bottom of view pages. Renders nothing when empty.
export const ReferencesList = ({ raw }: ListProps) => {
  const refs = safeParse(raw);
  if (refs.length === 0) return null;
  return (
    <section style={{ marginTop: '2.5rem' }}>
      <h3 style={{ fontSize: '0.8125rem', fontWeight: 700, textTransform: 'uppercase', color: 'var(--muted-foreground)', marginBottom: '1.5rem', letterSpacing: '0.1em', display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
        <LinkIcon size={16} /> References
      </h3>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
        {refs.map((r, i) => (
          <a
            key={`${r.url}-${i}`}
            href={ensureScheme(r.url)}
            target="_blank"
            rel="noopener noreferrer"
            className="row-hover"
            style={{ padding: '0.875rem 1.25rem', background: 'var(--card)', borderRadius: '12px', border: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: '0.75rem', textDecoration: 'none', color: 'inherit' }}
          >
            <ExternalLink size={16} style={{ color: 'var(--muted-foreground)', flexShrink: 0 }} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 700, fontSize: '0.9rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {r.title || hostnameOf(r.url)}
              </div>
              <div style={{ fontSize: '0.75rem', color: 'var(--muted-foreground)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {r.url}
              </div>
            </div>
          </a>
        ))}
      </div>
    </section>
  );
};

interface EditorProps {
  value: Reference[];
  onChange: (next: Reference[]) => void;
}

// Editable list for the bottom of edit pages.
export const ReferencesEditor = ({ value, onChange }: EditorProps) => {
  const update = (i: number, field: keyof Reference, v: string) => {
    const next = [...value];
    next[i] = { ...next[i], [field]: v };
    onChange(next);
  };
  const remove = (i: number) => onChange(value.filter((_, idx) => idx !== i));
  const add = () => onChange([...value, { url: '', title: '' }]);

  return (
    <section style={{ background: 'var(--card)', padding: '2.5rem', borderRadius: '24px', border: '1px solid var(--border)' }}>
      <h3 style={{ fontSize: '0.875rem', fontWeight: 800, textTransform: 'uppercase', color: 'var(--muted-foreground)', marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
        <LinkIcon size={18} /> References
      </h3>
      <p style={{ fontSize: '0.8125rem', color: 'var(--muted-foreground)', marginBottom: '1.5rem' }}>
        Links to external documentation, tickets, runbooks, or related resources.
      </p>
      {value.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', marginBottom: '1rem' }}>
          {value.map((r, i) => (
            <div key={i} style={{ display: 'grid', gridTemplateColumns: '1.5fr 2fr auto', gap: '0.75rem', alignItems: 'center' }}>
              <input
                value={r.title || ''}
                onChange={e => update(i, 'title', e.target.value)}
                placeholder="Title (optional)"
                style={{ margin: 0 }}
              />
              <input
                value={r.url}
                onChange={e => update(i, 'url', e.target.value)}
                placeholder="https://example.com/runbook"
                style={{ margin: 0 }}
              />
              <button
                type="button"
                onClick={() => remove(i)}
                className="secondary"
                aria-label="Remove reference"
                style={{ height: '2.5rem', width: '2.5rem', padding: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--destructive)' }}
              >
                <Trash2 size={16} />
              </button>
            </div>
          ))}
        </div>
      )}
      <button
        type="button"
        onClick={add}
        className="secondary"
        style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem' }}
      >
        <Plus size={16} /> Add reference
      </button>
    </section>
  );
};
