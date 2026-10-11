import React, { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { RotateCcw } from 'lucide-react';

interface LlmSettings {
  systemPrompt: string;
  defaultSystemPrompt: string;
  customized: boolean;
}

async function readError(res: Response) {
  try {
    const body = await res.json();
    return body.error || body.message || res.statusText;
  } catch {
    return res.statusText || 'Request failed';
  }
}

export const AiSystemPromptSettings = () => {
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState('');
  const [saved, setSaved] = useState('');
  const [defaultPrompt, setDefaultPrompt] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [savedFlash, setSavedFlash] = useState(false);

  const { data, isLoading, isError } = useQuery<LlmSettings>({
    queryKey: ['llm-settings'],
    queryFn: async () => {
      const res = await fetch('/api/llm/settings');
      if (!res.ok) throw new Error(await readError(res));
      return res.json();
    },
  });

  useEffect(() => {
    if (!data) return;
    setDraft(data.systemPrompt);
    setSaved(data.systemPrompt);
    setDefaultPrompt(data.defaultSystemPrompt);
  }, [data]);

  const dirty = draft !== saved;

  const persist = async (systemPrompt: string) => {
    setSaving(true);
    setError('');
    setSavedFlash(false);
    const res = await fetch('/api/llm/settings', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ systemPrompt }),
    });
    setSaving(false);
    if (!res.ok) {
      setError(await readError(res));
      return;
    }
    const next = await res.json() as LlmSettings;
    setDraft(next.systemPrompt);
    setSaved(next.systemPrompt);
    setDefaultPrompt(next.defaultSystemPrompt);
    setSavedFlash(true);
    queryClient.setQueryData(['llm-settings'], next);
  };

  return (
    <div className="card" style={{ padding: '1.5rem' }}>
      <div style={{ marginBottom: '1.5rem', borderBottom: '1px solid var(--border)', paddingBottom: '1rem', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', gap: '1rem' }}>
        <div>
          <h2 style={{ fontSize: '1.5rem', fontWeight: 800, letterSpacing: '-0.02em', margin: 0 }}>System prompt</h2>
          <p style={{ color: 'var(--muted-foreground)', fontSize: '0.85rem', marginTop: '0.35rem', maxWidth: '46rem' }}>
            This instruction is sent with every question, and with tips and other generated text. It applies to the active provider. The built-in prompt keeps answers inside the architecture data supplied with the request.
          </p>
        </div>
        <button
          type="button"
          className="secondary"
          onClick={() => persist(defaultPrompt)}
          disabled={saving || !defaultPrompt || (saved === defaultPrompt && draft === defaultPrompt)}
          style={{ height: '2.2rem', padding: '0 0.85rem', fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: '0.4rem', flexShrink: 0 }}
        >
          <RotateCcw size={14} /> Restore default
        </button>
      </div>

      {isLoading ? (
        <div style={{ color: 'var(--muted-foreground)', fontSize: '0.85rem' }}>Loading system prompt...</div>
      ) : isError ? (
        <div style={{ color: 'var(--destructive)', fontSize: '0.85rem' }}>Could not load the system prompt.</div>
      ) : (
        <form onSubmit={(event) => { event.preventDefault(); persist(draft); }}>
          <div style={{ background: 'var(--background)', padding: '1.5rem', borderRadius: '12px', border: '1px solid var(--border)' }}>
            <h3 style={{ fontSize: '0.9rem', fontWeight: 700, marginBottom: '1rem' }}>Instruction</h3>
            <textarea
              id="llm-system-prompt"
              rows={16}
              value={draft}
              onChange={(event) => { setDraft(event.target.value); setSavedFlash(false); }}
              style={{ fontSize: '0.85rem', lineHeight: 1.5 }}
            />
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '1rem', marginTop: '1rem' }}>
              <div style={{ fontSize: '0.75rem', color: 'var(--muted-foreground)' }}>
                {dirty ? 'Unsaved changes' : saved === defaultPrompt ? 'Using the built-in prompt' : 'Using a custom prompt'}
                {savedFlash && !dirty ? ' · Saved' : ''}
              </div>
              <button type="submit" className="primary" disabled={saving || !dirty} style={{ height: '2.4rem', padding: '0 1.5rem', fontSize: '0.85rem' }}>
                {saving ? 'Saving...' : 'Save prompt'}
              </button>
            </div>
            {error && (
              <div style={{ color: 'var(--destructive)', fontSize: '0.8rem', marginTop: '0.75rem' }}>{error}</div>
            )}
          </div>
        </form>
      )}
    </div>
  );
};
