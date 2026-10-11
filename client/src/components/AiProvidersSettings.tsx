import React, { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, Trash2 } from 'lucide-react';
import { ColoredSelect } from './ColoredSelect';
import { CustomCheckbox } from './CustomCheckbox';
import { MarkdownAnswer } from './MarkdownAnswer';
import { readStoredTimeThresholds } from '../timeAssessment';

const PRESETS = [
  { id: 'openai', label: 'OpenAI', baseUrl: 'https://api.openai.com/v1', model: 'gpt-6.1-sol', modelPlaceholder: 'gpt-6.1-sol' },
  { id: 'anthropic', label: 'Anthropic', baseUrl: 'https://api.anthropic.com', model: 'claude-sonnet-5-5', modelPlaceholder: 'claude-sonnet-5-5' },
  { id: 'ollama', label: 'Ollama Cloud', baseUrl: 'https://ollama.com/v1', model: '', modelPlaceholder: 'gemma4:31b' },
  { id: 'xai', label: 'SpaceXAI', baseUrl: 'https://api.x.ai/v1', model: 'grok-4.7', modelPlaceholder: 'grok-4.7' },
] as const;

type ProviderId = (typeof PRESETS)[number]['id'];

interface LlmProvider {
  id: string;
  name: string;
  provider: ProviderId;
  model: string;
  baseUrl: string;
  isActive: boolean;
  hasKey: boolean;
  keyHint: string;
}

interface FormState {
  name: string;
  provider: ProviderId;
  model: string;
  baseUrl: string;
  apiKey: string;
  isActive: boolean;
}

const presetFor = (id: string) => PRESETS.find((preset) => preset.id === id) ?? PRESETS[0];

const emptyForm = (isActive: boolean): FormState => ({
  name: PRESETS[0].label,
  provider: PRESETS[0].id,
  model: PRESETS[0].model,
  baseUrl: PRESETS[0].baseUrl,
  apiKey: '',
  isActive,
});

async function readError(res: Response) {
  try {
    const body = await res.json();
    return body.error || body.message || res.statusText;
  } catch {
    return res.statusText || 'Request failed';
  }
}

export const AiProvidersSettings = () => {
  const queryClient = useQueryClient();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm(true));
  const [formError, setFormError] = useState('');
  const [saving, setSaving] = useState(false);
  const [testingId, setTestingId] = useState<string | null>(null);
  const [prompt, setPrompt] = useState('');
  const [testResult, setTestResult] = useState<{ id: string; ok: boolean; text: string } | null>(null);

  const { data: providers = [], isLoading, isError } = useQuery<LlmProvider[]>({
    queryKey: ['llm-providers'],
    queryFn: async () => {
      const res = await fetch('/api/llm/providers');
      if (!res.ok) throw new Error(await readError(res));
      return res.json();
    },
  });

  const refresh = () => queryClient.invalidateQueries({ queryKey: ['llm-providers'] });

  const onProviderChange = (nextId: ProviderId) => {
    const next = presetFor(nextId);
    const previous = presetFor(form.provider);
    setForm((current) => ({
      ...current,
      provider: nextId,
      name: current.name === previous.label || current.name === '' ? next.label : current.name,
      model: current.model === previous.model ? next.model : current.model,
      baseUrl: current.baseUrl === previous.baseUrl ? next.baseUrl : current.baseUrl,
    }));
  };

  const startCreate = () => {
    setEditingId(null);
    setForm(emptyForm(providers.length === 0));
    setFormError('');
  };

  const startEdit = (provider: LlmProvider) => {
    setEditingId(provider.id);
    setForm({
      name: provider.name,
      provider: provider.provider,
      model: provider.model,
      baseUrl: provider.baseUrl,
      apiKey: '',
      isActive: provider.isActive,
    });
    setFormError('');
  };

  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setFormError('');
    const payload: Record<string, unknown> = {
      name: form.name.trim(),
      provider: form.provider,
      model: form.model.trim(),
      baseUrl: form.baseUrl.trim(),
      isActive: form.isActive,
    };
    if (form.apiKey.trim()) payload.apiKey = form.apiKey.trim();

    const res = await fetch(editingId ? `/api/llm/providers/${editingId}` : '/api/llm/providers', {
      method: editingId ? 'PATCH' : 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
    });
    setSaving(false);
    if (!res.ok) {
      setFormError(await readError(res));
      return;
    }
    setForm(emptyForm(false));
    setEditingId(null);
    refresh();
  };

  const activate = async (id: string) => {
    const res = await fetch(`/api/llm/providers/${id}/activate`, { method: 'POST' });
    if (!res.ok) {
      setFormError(await readError(res));
      return;
    }
    refresh();
  };

  const remove = async (provider: LlmProvider) => {
    if (!window.confirm(`Remove ${provider.name}? The API key stored for it will be deleted.`)) return;
    const res = await fetch(`/api/llm/providers/${provider.id}`, { method: 'DELETE' });
    if (!res.ok) {
      setFormError(await readError(res));
      return;
    }
    if (editingId === provider.id) startCreate();
    if (testResult?.id === provider.id) setTestResult(null);
    refresh();
  };

  const test = async (id: string) => {
    setTestingId(id);
    setTestResult(null);
    const thresholds = readStoredTimeThresholds();
    const res = await fetch(`/api/llm/providers/${id}/test`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        ...(prompt.trim() ? { prompt: prompt.trim() } : {}),
        timeThresholds: { technicalFit: thresholds.technicalFit, functionalFit: thresholds.functionalFit },
      }),
    });
    const text = res.ok ? (await res.json()).text : await readError(res);
    setTestingId(null);
    setTestResult({ id, ok: res.ok, text: text || 'The provider returned an empty reply.' });
  };

  const fieldStyle = { height: '2rem', fontSize: '0.8rem' };
  const tested = providers.find((provider) => provider.id === testResult?.id);

  return (
    <div className="card" style={{ padding: '1.5rem' }}>
      <div style={{ marginBottom: '1.5rem', borderBottom: '1px solid var(--border)', paddingBottom: '1rem' }}>
        <h2 style={{ fontSize: '1.5rem', fontWeight: 800, letterSpacing: '-0.02em', margin: 0 }}>Providers</h2>
        <p style={{ color: 'var(--muted-foreground)', fontSize: '0.85rem', marginTop: '0.35rem' }}>
          Add the model provider this organization uses for questions and suggestions. The API key stays in the application database. One provider is active at a time.
        </p>
      </div>

      {isLoading ? (
        <div style={{ color: 'var(--muted-foreground)', fontSize: '0.85rem', marginBottom: '2rem' }}>Loading providers...</div>
      ) : isError ? (
        <div style={{ color: 'var(--destructive)', fontSize: '0.85rem', marginBottom: '2rem' }}>Could not load providers.</div>
      ) : (
        <div style={{ marginBottom: '2rem' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ textAlign: 'left', borderBottom: '1px solid var(--border)' }}>
                <th style={{ padding: '0.75rem', fontSize: '0.65rem', textTransform: 'uppercase', color: 'var(--muted-foreground)' }}>Name</th>
                <th style={{ padding: '0.75rem', fontSize: '0.65rem', textTransform: 'uppercase', color: 'var(--muted-foreground)' }}>Provider</th>
                <th style={{ padding: '0.75rem', fontSize: '0.65rem', textTransform: 'uppercase', color: 'var(--muted-foreground)' }}>Model</th>
                <th style={{ padding: '0.75rem', fontSize: '0.65rem', textTransform: 'uppercase', color: 'var(--muted-foreground)' }}>Key</th>
                <th style={{ padding: '0.75rem', textAlign: 'right' }}></th>
              </tr>
            </thead>
            <tbody>
              {providers.length === 0 && (
                <tr>
                  <td colSpan={5} style={{ padding: '0.75rem', color: 'var(--muted-foreground)', fontSize: '0.8rem' }}>No providers yet.</td>
                </tr>
              )}
              {providers.map((provider) => {
                const preset = presetFor(provider.provider);
                return (
                  <tr key={provider.id} style={{ borderBottom: '1px solid var(--border)', background: editingId === provider.id ? 'var(--accent)' : undefined }} className="row-hover">
                    <td style={{ padding: '0.75rem', fontSize: '0.85rem', fontWeight: 600 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
                        {provider.name}
                        {provider.isActive && (
                          <span style={{ background: 'var(--primary)', color: 'var(--primary-foreground)', padding: '0.15rem 0.4rem', borderRadius: '4px', fontSize: '0.6rem', fontWeight: 800, textTransform: 'uppercase' }}>Active</span>
                        )}
                      </div>
                    </td>
                    <td style={{ padding: '0.75rem' }}>
                      <span style={{ background: 'var(--secondary)', color: 'var(--secondary-foreground)', padding: '0.15rem 0.4rem', borderRadius: '4px', fontSize: '0.6rem', fontWeight: 700 }}>{preset.label}</span>
                    </td>
                    <td style={{ padding: '0.75rem', fontSize: '0.75rem', color: 'var(--muted-foreground)', fontFamily: 'monospace' }}>{provider.model}</td>
                    <td style={{ padding: '0.75rem', fontSize: '0.75rem', color: 'var(--muted-foreground)' }}>{provider.hasKey ? `···${provider.keyHint}` : 'None'}</td>
                    <td style={{ padding: '0.75rem', textAlign: 'right' }}>
                      <div style={{ display: 'flex', gap: '0.4rem', justifyContent: 'flex-end', alignItems: 'center' }}>
                        {!provider.isActive && (
                          <button type="button" className="secondary" onClick={() => activate(provider.id)} style={{ height: '1.8rem', padding: '0 0.6rem', fontSize: '0.75rem' }}>Set active</button>
                        )}
                        <button type="button" className="secondary" onClick={() => test(provider.id)} disabled={testingId === provider.id} style={{ height: '1.8rem', padding: '0 0.6rem', fontSize: '0.75rem' }}>
                          {testingId === provider.id ? 'Testing...' : 'Test'}
                        </button>
                        <button type="button" className="secondary" onClick={() => startEdit(provider)} style={{ height: '1.8rem', padding: '0 0.6rem', fontSize: '0.75rem' }}>Edit</button>
                        <button type="button" onClick={() => remove(provider)} style={{ border: 'none', background: 'transparent', color: 'var(--destructive)', padding: '0.4rem', cursor: 'pointer' }}>
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {testResult && (
            <div style={{ marginTop: '0.75rem', padding: '0.85rem 1rem', background: 'var(--background)', borderRadius: '12px', border: '1px solid var(--border)', fontSize: '0.85rem', whiteSpace: testResult.ok ? 'normal' : 'pre-wrap', color: testResult.ok ? 'var(--foreground)' : 'var(--destructive)' }}>
              <div style={{ fontSize: '0.65rem', fontWeight: 800, textTransform: 'uppercase', color: 'var(--muted-foreground)', marginBottom: '0.35rem' }}>
                {tested ? tested.name : 'Test'}
              </div>
              {testResult.ok ? <MarkdownAnswer text={testResult.text} /> : testResult.text}
            </div>
          )}
        </div>
      )}

      <div style={{ background: 'var(--background)', padding: '1.5rem', borderRadius: '12px', border: '1px solid var(--border)', marginBottom: '1rem' }}>
        <h3 style={{ fontSize: '0.9rem', fontWeight: 700, marginBottom: '1rem' }}>{editingId ? 'Edit provider' : 'Add a provider'}</h3>
        <form onSubmit={save}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '1rem', marginBottom: '1.5rem' }}>
            <div className="field" style={{ margin: 0 }}>
              <label className="label">Provider</label>
              <ColoredSelect
                value={form.provider}
                onChange={(value) => onProviderChange(value as ProviderId)}
                options={PRESETS.map((preset) => ({ value: preset.id, label: preset.label }))}
                style={fieldStyle}
              />
            </div>
            <div className="field" style={{ margin: 0 }}>
              <label className="label">Display name</label>
              <input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} required style={fieldStyle} />
            </div>
            <div className="field" style={{ margin: 0 }}>
              <label className="label">Model</label>
              <input
                value={form.model}
                placeholder={presetFor(form.provider).modelPlaceholder}
                onChange={(event) => setForm({ ...form, model: event.target.value })}
                required
                style={fieldStyle}
              />
            </div>
            <div className="field" style={{ margin: 0 }}>
              <label className="label">API key{editingId ? ' (leave blank to keep the saved key)' : ''}</label>
              <input
                type="password"
                autoComplete="off"
                value={form.apiKey}
                onChange={(event) => setForm({ ...form, apiKey: event.target.value })}
                required={!editingId}
                style={fieldStyle}
              />
            </div>
            <div className="field" style={{ margin: 0, gridColumn: '1 / -1' }}>
              <label className="label">Base URL</label>
              <input value={form.baseUrl} onChange={(event) => setForm({ ...form, baseUrl: event.target.value })} required style={fieldStyle} />
              <p style={{ fontSize: '0.72rem', color: 'var(--muted-foreground)', margin: '0.35rem 0 0' }}>
                Prefilled for this provider. Ollama uses the hosted API at ollama.com. Change the URL only for a private gateway.
              </p>
            </div>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '1rem' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.8rem', fontWeight: 600 }}>
              <CustomCheckbox checked={form.isActive} onChange={(checked) => setForm({ ...form, isActive: checked })} />
              Active provider
            </label>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              {editingId && (
                <button type="button" className="secondary" onClick={startCreate} style={{ height: '2.4rem', padding: '0 1rem', fontSize: '0.85rem' }}>Cancel</button>
              )}
              <button type="submit" className="primary" disabled={saving} style={{ height: '2.4rem', padding: '0 1.5rem', fontSize: '0.85rem' }}>
                {editingId ? null : <Plus size={16} style={{ marginRight: '0.4rem' }} />}
                {saving ? 'Saving...' : editingId ? 'Save changes' : 'Add provider'}
              </button>
            </div>
          </div>
          {formError && (
            <div style={{ color: 'var(--destructive)', fontSize: '0.8rem', marginTop: '0.75rem' }}>{formError}</div>
          )}
        </form>
      </div>

      <div style={{ background: 'var(--background)', padding: '1.5rem', borderRadius: '12px', border: '1px solid var(--border)' }}>
        <h3 style={{ fontSize: '0.9rem', fontWeight: 700, marginBottom: '0.35rem' }}>Test question</h3>
        <p style={{ fontSize: '0.75rem', color: 'var(--muted-foreground)', margin: '0 0 1rem' }}>A written question is answered from the current portfolio. Leave this empty to check the connection only.</p>
        <textarea
          rows={2}
          value={prompt}
          placeholder="Reply with one short sentence confirming the connection works."
          onChange={(event) => setPrompt(event.target.value)}
          style={{ fontSize: '0.85rem', lineHeight: 1.45 }}
        />
      </div>
    </div>
  );
};
