import { useEffect, useRef, useState } from 'react';
import { SuggestionCard, SuggestionProposal } from './ApplicationSuggestions';

type MappedCapability = { id: string; name: string; parentName: string };

type MappingSuggestion = {
  capabilities: MappedCapability[];
  note: string;
};

export function CapabilityMappingSuggestions({
  name,
  description,
  vendorName,
  applicationType,
  mapped,
  onApply,
}: {
  name: string;
  description: string;
  vendorName: string;
  applicationType: string;
  mapped: boolean;
  onApply: (ids: string[]) => void;
}) {
  const described = description.trim().length > 0;
  const [open, setOpen] = useState(!mapped && !described);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const [suggestion, setSuggestion] = useState<MappingSuggestion | null>(null);
  const requestId = useRef(0);
  const lastAutoKey = useRef('');
  const prevMapped = useRef(mapped);
  const openRef = useRef(open);
  const mappedRef = useRef(mapped);
  const descriptionRef = useRef(description);
  openRef.current = open;
  mappedRef.current = mapped;
  descriptionRef.current = description;
  const canAsk = name.trim().length >= 2 && !pending;
  const askRef = useRef<(reason?: 'manual' | 'auto') => Promise<void>>(async () => {});

  const ask = async (reason: 'manual' | 'auto' = 'manual') => {
    const trimmedName = name.trim();
    if (trimmedName.length < 2) return;
    if (reason === 'auto' && (mappedRef.current || !openRef.current || descriptionRef.current.trim())) return;
    if (reason === 'manual') {
      lastAutoKey.current = `${trimmedName}\n${description.trim()}\n${vendorName.trim()}\n${applicationType.trim()}`;
    }
    const id = ++requestId.current;
    setPending(true);
    setError('');
    try {
      const res = await fetch('/api/llm/application-capability-suggestions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: trimmedName,
          description,
          vendorName,
          type: applicationType,
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(typeof body.error === 'string' ? body.error : 'The capability mapping could not be prepared.');
      if (id !== requestId.current) return;
      if (reason === 'auto' && descriptionRef.current.trim()) return;
      const capabilities = Array.isArray(body.capabilities)
        ? body.capabilities.flatMap((entry: unknown) => {
          if (!entry || typeof entry !== 'object') return [];
          const record = entry as { id?: unknown; name?: unknown; parentName?: unknown };
          if (typeof record.id !== 'string' || typeof record.name !== 'string') return [];
          return [{
            id: record.id,
            name: record.name,
            parentName: typeof record.parentName === 'string' ? record.parentName : '',
          }];
        })
        : [];
      setSuggestion({
        capabilities,
        note: typeof body.note === 'string' ? body.note : '',
      });
    } catch (err) {
      if (id !== requestId.current) return;
      setError(err instanceof Error ? err.message : 'The capability mapping could not be prepared.');
    } finally {
      if (id === requestId.current) setPending(false);
    }
  };
  askRef.current = ask;

  useEffect(() => {
    if (prevMapped.current === mapped) return;
    const wasMapped = prevMapped.current;
    prevMapped.current = mapped;
    if (wasMapped && !mapped) {
      setSuggestion(null);
      setError('');
      lastAutoKey.current = '';
      if (!descriptionRef.current.trim()) setOpen(true);
    }
  }, [mapped]);

  useEffect(() => {
    if (mapped || !open || description.trim()) return;
    const key = `${name.trim()}\n${description.trim()}\n${vendorName.trim()}\n${applicationType.trim()}`;
    if (name.trim().length < 2 || lastAutoKey.current === key) return;
    const timer = window.setTimeout(() => {
      if (lastAutoKey.current === key || mappedRef.current || !openRef.current) return;
      lastAutoKey.current = key;
      void askRef.current('auto');
    }, 1000);
    return () => window.clearTimeout(timer);
  }, [mapped, open, name, description, vendorName, applicationType]);

  const applyOne = (id: string) => {
    const remaining = suggestion?.capabilities.filter((capability) => capability.id !== id) ?? [];
    onApply([id]);
    if (remaining.length === 0) {
      setSuggestion(null);
      setOpen(false);
      return;
    }
    setSuggestion((current) => current ? { ...current, capabilities: remaining } : current);
  };

  return (
    <SuggestionCard
      className="app-cap-map"
      open={open}
      suggested={Boolean(suggestion)}
      bodyId="capability-mapping-body"
      onToggle={() => setOpen((current) => !current)}
    >
      <p className="app-suggest-help">Suggested from the name and description. Apply a capability only if you want to use it.</p>
      <div className="app-suggest-actions">
        <button type="button" className="secondary" disabled={!canAsk} onClick={() => void ask()}>
          {pending ? 'Preparing suggestions…' : 'Suggest capabilities'}
        </button>
      </div>
      {error && <p className="app-suggest-error">{error}</p>}
      {suggestion && (
        <div className="app-suggest-results">
          {suggestion.note && <p className="app-suggest-note">{suggestion.note}</p>}
          {suggestion.capabilities.map((capability) => (
            <SuggestionProposal
              key={capability.id}
              label="Capability"
              actionLabel={mapped ? 'Add capability' : 'Use capability'}
              onAction={() => applyOne(capability.id)}
            >
              <p>{capability.parentName ? `${capability.parentName} / ${capability.name}` : capability.name}</p>
            </SuggestionProposal>
          ))}
          {suggestion.capabilities.length === 0 && !suggestion.note && (
            <p className="app-suggest-note">No capabilities matched this application.</p>
          )}
        </div>
      )}
    </SuggestionCard>
  );
}
