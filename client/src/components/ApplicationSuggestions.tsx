import { useEffect, useRef, useState } from 'react';
import { Sparkles } from 'lucide-react';

export type VendorProfile = { name: string; url: string; summary: string };

const VENDOR_PROFILE_NAME = '_vendorName';
const VENDOR_PROFILE_URL = '_vendorUrl';
const VENDOR_PROFILE_SUMMARY = '_vendorSummary';

export function readVendorProfile(metadata: Record<string, unknown>): VendorProfile | null {
  const name = typeof metadata[VENDOR_PROFILE_NAME] === 'string' ? metadata[VENDOR_PROFILE_NAME].trim() : '';
  const url = typeof metadata[VENDOR_PROFILE_URL] === 'string' ? metadata[VENDOR_PROFILE_URL].trim() : '';
  const summary = typeof metadata[VENDOR_PROFILE_SUMMARY] === 'string' ? metadata[VENDOR_PROFILE_SUMMARY].trim() : '';
  if (!name || !/^https?:\/\//i.test(url) || !summary) return null;
  return { name, url, summary };
}

export function applicationVendor(app: {
  vendorName?: unknown;
  vendorUrl?: unknown;
  vendorSummary?: unknown;
  metadata?: unknown;
}): VendorProfile | null {
  const name = typeof app.vendorName === 'string' ? app.vendorName.trim() : '';
  const url = typeof app.vendorUrl === 'string' ? app.vendorUrl.trim() : '';
  const summary = typeof app.vendorSummary === 'string' ? app.vendorSummary.trim() : '';
  if (name && /^https?:\/\//i.test(url) && summary) return { name, url, summary };
  if (typeof app.metadata !== 'string' || !app.metadata) return null;
  try {
    const parsed = JSON.parse(app.metadata) as unknown;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
    return readVendorProfile(parsed as Record<string, unknown>);
  } catch {
    return null;
  }
}

export function withVendorProfile(metadata: Record<string, unknown>, profile: VendorProfile | null): Record<string, unknown> {
  const next = { ...metadata };
  delete next[VENDOR_PROFILE_NAME];
  delete next[VENDOR_PROFILE_URL];
  delete next[VENDOR_PROFILE_SUMMARY];
  if (!profile) return next;
  return {
    ...next,
    [VENDOR_PROFILE_NAME]: profile.name,
    [VENDOR_PROFILE_URL]: profile.url,
    [VENDOR_PROFILE_SUMMARY]: profile.summary,
  };
}

export type FieldSuggestion = {
  description: string;
  vendorProfile: VendorProfile | null;
  type: string;
  note: string;
  sources: { title: string; url: string }[];
};

export function ApplicationSuggestions({
  name,
  description,
  contractDetails,
  applicationType,
  researchGeneration,
  suggestVendor,
  onApplyDescription,
  onApplyType,
  onVendorProfile,
  onResearching,
}: {
  name: string;
  description: string;
  contractDetails: string;
  applicationType: string;
  researchGeneration: number;
  suggestVendor: boolean;
  onApplyDescription: (description: string) => void;
  onApplyType: (type: string) => void;
  onVendorProfile: (profile: VendorProfile | null, reason: 'manual' | 'auto') => void;
  onResearching: (pending: boolean) => void;
}) {
  const [context, setContext] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const [suggestion, setSuggestion] = useState<FieldSuggestion | null>(null);
  const canAsk = name.trim().length >= 2 && !pending;
  const askRef = useRef<(reason?: 'manual' | 'auto') => Promise<void>>(async () => {});
  const requestId = useRef(0);
  const lastAutoKey = useRef('');

  useEffect(() => {
    onResearching(pending);
  }, [onResearching, pending]);

  useEffect(() => {
    if (researchGeneration === 0) return;
    void askRef.current('manual');
  }, [researchGeneration]);

  useEffect(() => {
    if (!suggestVendor) return;
    const key = `${name.trim()}\n${description.trim()}`;
    if (name.trim().length < 2 || description.trim().length < 10) return;
    if (lastAutoKey.current === key) return;
    const timer = window.setTimeout(() => {
      if (lastAutoKey.current === key) return;
      lastAutoKey.current = key;
      void askRef.current('auto');
    }, 1000);
    return () => window.clearTimeout(timer);
  }, [suggestVendor, name, description]);

  const ask = async (reason: 'manual' | 'auto' = 'manual') => {
    const trimmedName = name.trim();
    if (trimmedName.length < 2) return;
    if (reason === 'auto' && (description.trim().length < 10 || pending)) return;
    if (reason === 'manual') lastAutoKey.current = `${trimmedName}\n${description.trim()}`;
    const id = ++requestId.current;
    setPending(true);
    setError('');
    try {
      const res = await fetch('/api/llm/application-suggestions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: trimmedName,
          context: context.trim(),
          description,
          contractDetails,
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(typeof body.error === 'string' ? body.error : 'The suggestion could not be prepared.');
      if (id !== requestId.current) return;
      const profile = readVendorProfile({
        [VENDOR_PROFILE_NAME]: body.vendorProfile?.name,
        [VENDOR_PROFILE_URL]: body.vendorProfile?.url,
        [VENDOR_PROFILE_SUMMARY]: body.vendorProfile?.summary,
      });
      onVendorProfile(profile, reason);
      setSuggestion({
        description: typeof body.description === 'string' ? body.description : '',
        vendorProfile: profile,
        type: typeof body.type === 'string' ? body.type : '',
        note: typeof body.note === 'string' ? body.note : '',
        sources: Array.isArray(body.sources)
          ? body.sources.flatMap((source: unknown) => {
            if (!source || typeof source !== 'object') return [];
            const record = source as { title?: unknown; url?: unknown };
            if (typeof record.title !== 'string' || typeof record.url !== 'string') return [];
            if (!/^https?:\/\//i.test(record.url)) return [];
            return [{ title: record.title, url: record.url }];
          })
          : [],
      });
    } catch (err) {
      if (id !== requestId.current) return;
      setError(err instanceof Error ? err.message : 'The suggestion could not be prepared.');
    } finally {
      if (id === requestId.current) setPending(false);
    }
  };
  askRef.current = ask;

  return (
    <div className="app-suggest">
      <div className="app-suggest-heading">
        <Sparkles size={14} />
        <span>Suggestions</span>
      </div>
      <p className="app-suggest-help">Vendor fields are filled in automatically from the name and description. Apply a description or type only if you want to use it.</p>
      <label className="label" htmlFor="application-suggestion-context">Context</label>
      <textarea
        id="application-suggestion-context"
        rows={2}
        maxLength={2000}
        value={context}
        disabled={pending}
        placeholder="How this organization uses the application. Optional."
        onChange={(event) => setContext(event.target.value)}
      />
      <div className="app-suggest-actions">
        <button type="button" className="secondary" disabled={!canAsk} onClick={() => void ask()}>
          {pending ? 'Preparing suggestions…' : 'Suggest description and vendor'}
        </button>
      </div>
      {error && <p className="app-suggest-error">{error}</p>}
      {suggestion && (
        <div className="app-suggest-results">
          {suggestion.note && <p className="app-suggest-note">{suggestion.note}</p>}
          {suggestion.description && (
            <div className="app-suggest-proposal">
              <span className="label">Description</span>
              <p>{suggestion.description}</p>
              <button type="button" className="secondary" onClick={() => onApplyDescription(suggestion.description)}>
                {description.trim() ? 'Replace description' : 'Use description'}
              </button>
            </div>
          )}
          {suggestion.type && (
            <div className="app-suggest-proposal">
              <span className="label">Application type</span>
              <p>{suggestion.type}</p>
              <button type="button" className="secondary" onClick={() => onApplyType(suggestion.type)}>
                {applicationType.trim() ? 'Replace type' : 'Use type'}
              </button>
            </div>
          )}
          {suggestion.sources.length > 0 && (
            <div className="app-suggest-proposal">
              <span className="label">Sources</span>
              <ul className="app-suggest-sources">
                {suggestion.sources.map((source) => (
                  <li key={source.url}>
                    <a href={source.url} target="_blank" rel="noopener noreferrer">{source.title}</a>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
