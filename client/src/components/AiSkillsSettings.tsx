import React, { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, RotateCcw, Trash2 } from 'lucide-react';
import { CustomCheckbox } from './CustomCheckbox';

interface LlmSkill {
  id: string;
  name: string;
  body: string;
  defaultName: string | null;
  defaultBody: string | null;
  enabled: boolean;
  builtin: boolean;
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

function SkillEditor({ skill, onSaved }: { skill: LlmSkill; onSaved: (next: LlmSkill[] | LlmSkill) => void }) {
  const [name, setName] = useState(skill.name);
  const [body, setBody] = useState(skill.body);
  const [enabled, setEnabled] = useState(skill.enabled);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [savedFlash, setSavedFlash] = useState(false);

  useEffect(() => {
    setName(skill.name);
    setBody(skill.body);
    setEnabled(skill.enabled);
  }, [skill.id, skill.name, skill.body, skill.enabled]);

  const dirty = name !== skill.name || body !== skill.body || enabled !== skill.enabled;
  const pristine = skill.builtin
    && skill.name === skill.defaultName
    && skill.body === skill.defaultBody
    && skill.enabled
    && !dirty;

  const persist = async (next: { name: string; body: string; enabled: boolean }) => {
    setSaving(true);
    setError('');
    setSavedFlash(false);
    const res = await fetch(`/api/llm/skills/${skill.id}`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(next),
    });
    setSaving(false);
    if (!res.ok) {
      setError(await readError(res));
      return;
    }
    onSaved(await res.json());
    setSavedFlash(true);
  };

  const restore = async () => {
    setSaving(true);
    setError('');
    setSavedFlash(false);
    const res = await fetch(`/api/llm/skills/${skill.id}/restore`, { method: 'POST' });
    setSaving(false);
    if (!res.ok) {
      setError(await readError(res));
      return;
    }
    onSaved(await res.json());
    setSavedFlash(true);
  };

  const remove = async () => {
    if (!window.confirm(`Delete the skill “${skill.name}”?`)) return;
    setSaving(true);
    setError('');
    const res = await fetch(`/api/llm/skills/${skill.id}`, { method: 'DELETE' });
    setSaving(false);
    if (!res.ok) {
      setError(await readError(res));
      return;
    }
    onSaved([]);
  };

  const status = dirty
    ? 'Unsaved changes'
    : !enabled
      ? 'Off. This skill is not sent.'
      : skill.builtin
        ? (skill.customized ? 'Edited built-in skill' : 'Built-in skill')
        : 'Custom skill';

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        void persist({ name, body, enabled });
      }}
      style={{ background: 'var(--background)', padding: '1.25rem', borderRadius: '12px', border: '1px solid var(--border)' }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '1rem', marginBottom: '1rem' }}>
        <label style={{ flex: 1, minWidth: 0, margin: 0 }}>
          <span style={{ display: 'block', fontSize: '0.75rem', fontWeight: 700, marginBottom: '0.35rem' }}>Name</span>
          <input
            value={name}
            maxLength={80}
            onChange={(event) => { setName(event.target.value); setSavedFlash(false); }}
            aria-label={`${skill.name} name`}
          />
        </label>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', flexShrink: 0, paddingTop: '1.15rem' }}>
          <CustomCheckbox checked={enabled} onChange={(value) => { setEnabled(value); setSavedFlash(false); }} />
          <span style={{ fontSize: '0.8rem', fontWeight: 650 }}>Enabled</span>
        </div>
      </div>
      <label style={{ display: 'block', margin: 0 }}>
        <span style={{ display: 'block', fontSize: '0.75rem', fontWeight: 700, marginBottom: '0.35rem' }}>Instruction</span>
        <textarea
          rows={14}
          value={body}
          maxLength={12000}
          onChange={(event) => { setBody(event.target.value); setSavedFlash(false); }}
          aria-label={`${skill.name} instruction`}
          style={{ fontSize: '0.85rem', lineHeight: 1.5 }}
        />
      </label>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '1rem', marginTop: '1rem' }}>
        <div style={{ fontSize: '0.75rem', color: 'var(--muted-foreground)' }}>
          {status}
          {savedFlash && !dirty ? ' · Saved' : ''}
        </div>
        <div style={{ display: 'flex', gap: '0.5rem', flexShrink: 0 }}>
          {skill.builtin ? (
            <button
              type="button"
              className="secondary"
              onClick={() => { void restore(); }}
              disabled={saving || pristine}
              style={{ height: '2.2rem', padding: '0 0.85rem', fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}
            >
              <RotateCcw size={14} /> Restore default
            </button>
          ) : (
            <button
              type="button"
              className="secondary"
              onClick={() => { void remove(); }}
              disabled={saving}
              style={{ height: '2.2rem', padding: '0 0.85rem', fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: '0.4rem', color: 'var(--destructive)' }}
            >
              <Trash2 size={14} /> Delete
            </button>
          )}
          <button type="submit" className="primary" disabled={saving || !dirty || name.trim() === ''} style={{ height: '2.2rem', padding: '0 1.1rem', fontSize: '0.8rem' }}>
            {saving ? 'Saving...' : 'Save skill'}
          </button>
        </div>
      </div>
      {error && <div style={{ color: 'var(--destructive)', fontSize: '0.8rem', marginTop: '0.75rem' }}>{error}</div>}
    </form>
  );
}

export const AiSkillsSettings = () => {
  const queryClient = useQueryClient();
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState('');
  const [body, setBody] = useState('');
  const [enabled, setEnabled] = useState(true);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const { data: skills = [], isLoading, isError } = useQuery<LlmSkill[]>({
    queryKey: ['llm-skills'],
    queryFn: async () => {
      const res = await fetch('/api/llm/skills');
      if (!res.ok) throw new Error(await readError(res));
      return res.json();
    },
  });

  const replaceSkill = (next: LlmSkill[] | LlmSkill) => {
    if (Array.isArray(next)) {
      void queryClient.invalidateQueries({ queryKey: ['llm-skills'] });
      return;
    }
    queryClient.setQueryData<LlmSkill[]>(['llm-skills'], (current) => {
      const list = current ?? [];
      const index = list.findIndex((skill) => skill.id === next.id);
      if (index === -1) return [...list, next];
      return list.map((skill) => skill.id === next.id ? next : skill);
    });
  };

  const create = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setError('');
    const res = await fetch('/api/llm/skills', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name, body, enabled }),
    });
    setSaving(false);
    if (!res.ok) {
      setError(await readError(res));
      return;
    }
    const created = await res.json() as LlmSkill;
    queryClient.setQueryData<LlmSkill[]>(['llm-skills'], (current) => [...(current ?? []), created]);
    setName('');
    setBody('');
    setEnabled(true);
    setCreating(false);
  };

  return (
    <div className="card" style={{ padding: '1.5rem' }}>
      <div style={{ marginBottom: '1.5rem', borderBottom: '1px solid var(--border)', paddingBottom: '1rem' }}>
        <h2 style={{ fontSize: '1.5rem', fontWeight: 800, letterSpacing: '-0.02em', margin: 0 }}>Skills</h2>
        <p style={{ color: 'var(--muted-foreground)', fontSize: '0.85rem', marginTop: '0.35rem', maxWidth: '46rem' }}>
          Enabled skills are sent with every question, after the system prompt. Edit the instruction to change how the assistant answers. The Diagrams skill tells it how to answer with a link to a landscape, which the chat then shows.
        </p>
      </div>

      {isLoading ? (
        <div style={{ color: 'var(--muted-foreground)', fontSize: '0.85rem' }}>Loading skills...</div>
      ) : isError ? (
        <div style={{ color: 'var(--destructive)', fontSize: '0.85rem' }}>Could not load skills.</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {skills.map((skill) => (
            <SkillEditor key={skill.id} skill={skill} onSaved={replaceSkill} />
          ))}

          {creating ? (
            <form onSubmit={create} style={{ background: 'var(--background)', padding: '1.25rem', borderRadius: '12px', border: '1px solid var(--border)' }}>
              <h3 style={{ fontSize: '0.9rem', fontWeight: 700, margin: '0 0 1rem' }}>New skill</h3>
              <label style={{ display: 'block', margin: '0 0 1rem' }}>
                <span style={{ display: 'block', fontSize: '0.75rem', fontWeight: 700, marginBottom: '0.35rem' }}>Name</span>
                <input value={name} maxLength={80} onChange={(event) => setName(event.target.value)} aria-label="New skill name" />
              </label>
              <label style={{ display: 'block', margin: 0 }}>
                <span style={{ display: 'block', fontSize: '0.75rem', fontWeight: 700, marginBottom: '0.35rem' }}>Instruction</span>
                <textarea
                  rows={8}
                  value={body}
                  maxLength={12000}
                  onChange={(event) => setBody(event.target.value)}
                  aria-label="New skill instruction"
                  style={{ fontSize: '0.85rem', lineHeight: 1.5 }}
                />
              </label>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '1rem', marginTop: '1rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
                  <CustomCheckbox checked={enabled} onChange={setEnabled} />
                  <span style={{ fontSize: '0.8rem', fontWeight: 650 }}>Enabled</span>
                </div>
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  <button type="button" className="secondary" onClick={() => { setCreating(false); setError(''); }} style={{ height: '2.2rem', padding: '0 0.85rem', fontSize: '0.8rem' }}>
                    Cancel
                  </button>
                  <button type="submit" className="primary" disabled={saving || name.trim() === ''} style={{ height: '2.2rem', padding: '0 1.1rem', fontSize: '0.8rem' }}>
                    {saving ? 'Saving...' : 'Add skill'}
                  </button>
                </div>
              </div>
              {error && <div style={{ color: 'var(--destructive)', fontSize: '0.8rem', marginTop: '0.75rem' }}>{error}</div>}
            </form>
          ) : (
            <button
              type="button"
              className="secondary"
              onClick={() => setCreating(true)}
              style={{ height: '2.4rem', padding: '0 0.9rem', fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: '0.4rem', alignSelf: 'flex-start' }}
            >
              <Plus size={15} /> Add a skill
            </button>
          )}
        </div>
      )}
    </div>
  );
};
