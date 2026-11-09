import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { SquareArrowOutUpRight, TableProperties, X } from 'lucide-react';
import {
  applySaved,
  buildEditColumns,
  recordApiPath,
  valuesEqual,
  type CellValue,
  type EditColumn,
  type EditKind,
  type PickOption,
} from '../advancedEdit';
import { fetchWorkspaceSettings } from '../workspaceSettings';
import { readStoredTimeThresholds, type TimeThresholds } from '../timeAssessment';
import { CustomCheckbox } from './CustomCheckbox';
import { SelectionBar, SelectionHeader, SelectionRowCheck, type TableSelection } from './TableSelection';

type Row = Record<string, any>;

const json = async (url: string) => {
  const res = await fetch(url);
  return res.json();
};

export function AdvancedEditButton({ active, onClick, compact = false }: { active: boolean; onClick: () => void; compact?: boolean }) {
  const height = compact ? '1.8rem' : '2.2rem';
  return (
    <button
      type="button"
      title="Advanced editing"
      aria-label="Advanced editing"
      aria-pressed={active}
      onClick={onClick}
      style={{ height, padding: '0 0.6rem', border: 'none', background: active ? 'var(--background)' : 'transparent', boxShadow: active ? '0 1px 2px rgba(0,0,0,0.1)' : 'none', cursor: 'pointer' }}
    >
      <TableProperties size={compact ? 14 : 16} />
    </button>
  );
}

function recordLabel(kind: EditKind, row: Row) {
  if (kind === 'integration') return `${row.sourceApp?.name || 'Source'} to ${row.targetApp?.name || 'target'}`;
  return String(row.name || 'record');
}

function menuStyle(box: DOMRect): React.CSSProperties {
  const width = Math.max(box.width, 220);
  const spaceBelow = window.innerHeight - box.bottom;
  const openUp = spaceBelow < 200 && box.top > spaceBelow;
  return {
    position: 'fixed',
    left: Math.max(8, Math.min(box.left, window.innerWidth - width - 8)),
    width,
    top: openUp ? undefined : box.bottom + 4,
    bottom: openUp ? window.innerHeight - box.top + 4 : undefined,
    maxHeight: 240,
    zIndex: 80,
  };
}

function useMenuBox(open: boolean, anchor: React.RefObject<HTMLElement | null>) {
  const [box, setBox] = useState<DOMRect | null>(null);
  useEffect(() => {
    if (!open) return;
    const update = () => setBox(anchor.current?.getBoundingClientRect() ?? null);
    update();
    window.addEventListener('scroll', update, true);
    window.addEventListener('resize', update);
    return () => {
      window.removeEventListener('scroll', update, true);
      window.removeEventListener('resize', update);
    };
  }, [open, anchor]);
  return box;
}

function OptionList({ box, options, highlight, value, empty, onHighlight, onChoose }: {
  box: DOMRect;
  options: PickOption[];
  highlight: number;
  value?: string;
  empty: string;
  onHighlight: (index: number) => void;
  onChoose: (value: string) => void;
}) {
  return createPortal(
    <ul className="advanced-edit-menu" style={menuStyle(box)} role="listbox">
      {options.length === 0 && <li className="advanced-edit-menu-empty">{empty}</li>}
      {options.map((option, index) => (
        <li key={`${option.value}:${index}`}>
          <button
            type="button"
            role="option"
            aria-selected={option.value === value}
            className={index === highlight ? 'advanced-edit-option is-active' : 'advanced-edit-option'}
            onMouseDown={(event) => {
              event.preventDefault();
              onChoose(option.value);
            }}
            onMouseEnter={() => onHighlight(index)}
          >
            {option.color && <span className="advanced-edit-dot" style={{ background: option.color }} />}
            <span className="advanced-edit-option-label">{option.label}</span>
            {option.detail && <span className="advanced-edit-option-detail">{option.detail}</span>}
          </button>
        </li>
      ))}
    </ul>,
    document.body,
  );
}

function displayText(column: EditColumn, row: Row) {
  const raw = column.get(row);
  if (typeof raw === 'boolean') return raw ? 'Yes' : 'No';
  if (Array.isArray(raw)) {
    const options = column.options?.(row) || [];
    const labels = raw.map((item) => options.find((option) => option.value === item)?.label || item);
    return labels.join(', ');
  }
  const options = column.options?.(row) || [];
  return options.find((option) => option.value === raw)?.label || raw;
}

function ReadonlyValue({ column, row, title }: { column: EditColumn; row: Row; title?: string }) {
  const raw = column.get(row);
  const text = typeof raw === 'string' ? raw : displayText(column, row);
  const option = column.options?.(row)?.find((item) => item.value === raw);
  return (
    <div className="advanced-edit-readonly" title={title}>
      {option?.color && <span className="advanced-edit-dot" style={{ background: option.color }} />}
      <span>{text || '—'}</span>
    </div>
  );
}

function TextEditor({ value, long, maxLength, placeholder, label, error, onSave }: {
  value: string;
  long?: boolean;
  maxLength?: number;
  placeholder?: string;
  label: string;
  error?: string;
  onSave: (value: string) => Promise<void>;
}) {
  const [draft, setDraft] = useState(value);
  const focused = useRef(false);
  useEffect(() => {
    if (!focused.current) setDraft(value);
  }, [value]);
  const commit = () => {
    focused.current = false;
    if (draft !== value) void onSave(draft).catch(() => undefined);
  };
  const className = error ? 'advanced-edit-input advanced-edit-invalid' : 'advanced-edit-input';
  if (long) {
    return (
      <textarea
        className={className}
        aria-label={label}
        aria-invalid={error ? true : undefined}
        rows={2}
        maxLength={maxLength}
        placeholder={placeholder}
        value={draft}
        onFocus={() => { focused.current = true; }}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={commit}
      />
    );
  }
  return (
    <input
      className={className}
      aria-label={label}
      aria-invalid={error ? true : undefined}
      maxLength={maxLength}
      placeholder={placeholder}
      value={draft}
      onFocus={() => { focused.current = true; }}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={commit}
      onKeyDown={(event) => {
        if (event.key === 'Enter') {
          event.preventDefault();
          event.currentTarget.blur();
        }
      }}
    />
  );
}

function DateEditor({ value, label, error, onSave }: { value: string; label: string; error?: string; onSave: (value: string) => Promise<void> }) {
  const [draft, setDraft] = useState(value);
  useEffect(() => { setDraft(value); }, [value]);
  return (
    <input
      type="date"
      className={error ? 'advanced-edit-input advanced-edit-invalid' : 'advanced-edit-input'}
      aria-label={label}
      aria-invalid={error ? true : undefined}
      value={draft}
      onChange={(event) => {
        const next = event.target.value;
        setDraft(next);
        if (next !== value) {
          void onSave(next).catch(() => setDraft(value));
        }
      }}
    />
  );
}

function BooleanEditor({ value, label, onSave }: { value: boolean; label: string; onSave: (value: boolean) => Promise<void> }) {
  const [checked, setChecked] = useState(value);
  useEffect(() => { setChecked(value); }, [value]);
  return (
    <div className="advanced-edit-boolean">
      <CustomCheckbox
        checked={checked}
        ariaLabel={label}
        onChange={(next) => {
          setChecked(next);
          void onSave(next).catch(() => setChecked(value));
        }}
      />
    </div>
  );
}

function NumberEditor({ value, min, max, label, error, onSave }: {
  value: string;
  min?: number;
  max?: number;
  label: string;
  error?: string;
  onSave: (value: string) => Promise<void>;
}) {
  const [draft, setDraft] = useState(value);
  const focused = useRef(false);
  useEffect(() => {
    if (!focused.current) setDraft(value);
  }, [value]);
  return (
    <input
      type="number"
      className={error ? 'advanced-edit-input advanced-edit-invalid' : 'advanced-edit-input'}
      aria-label={label}
      aria-invalid={error ? true : undefined}
      min={min}
      max={max}
      value={draft}
      onFocus={() => { focused.current = true; }}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={() => {
        focused.current = false;
        if (draft !== value) void onSave(draft).catch(() => undefined);
      }}
    />
  );
}

function ChoiceEditor({ value, options, allowCustom, clearable, placeholder, label, error, onSave }: {
  value: string;
  options: PickOption[];
  allowCustom?: boolean;
  clearable?: boolean;
  placeholder?: string;
  label: string;
  error?: string;
  onSave: (value: string) => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [highlight, setHighlight] = useState(0);
  const [current, setCurrent] = useState(value);
  const anchor = useRef<HTMLInputElement>(null);
  const picking = useRef(false);
  const moved = useRef(false);
  const box = useMenuBox(open, anchor);
  const selected = options.find((option) => option.value === current);
  const display = selected?.label || current;

  useEffect(() => { setCurrent(value); }, [value]);
  useEffect(() => { setHighlight(0); }, [query, open]);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return options;
    return options.filter((option) => `${option.label} ${option.detail || ''} ${option.value}`.toLowerCase().includes(needle));
  }, [options, query]);

  const choose = async (next: string) => {
    const previous = current;
    setCurrent(next);
    setOpen(false);
    setQuery('');
    moved.current = false;
    if (anchor.current && document.activeElement === anchor.current) {
      picking.current = true;
      anchor.current.blur();
    }
    if (next === previous) return;
    try {
      await onSave(next);
    } catch {
      setCurrent(previous);
    }
  };

  const matchTyped = (typed: string) => options.find((option) => option.label.toLowerCase() === typed.toLowerCase() || option.value.toLowerCase() === typed.toLowerCase());

  const commitTyped = (preferHighlight: boolean) => {
    const typed = query.trim();
    if (!typed) {
      if (preferHighlight && moved.current && filtered[highlight]) void choose(filtered[highlight].value);
      return;
    }
    const match = matchTyped(typed);
    if (match) void choose(match.value);
    else if (preferHighlight && filtered[highlight]) void choose(filtered[highlight].value);
    else if (allowCustom) void choose(typed);
  };

  return (
    <div className="advanced-edit-suggest">
      {selected?.color && !open && <span className="advanced-edit-dot advanced-edit-dot-inline" style={{ background: selected.color }} />}
      <input
        ref={anchor}
        className={error ? 'advanced-edit-input advanced-edit-invalid' : 'advanced-edit-input'}
        style={selected?.color && !open ? { paddingLeft: '1.35rem' } : undefined}
        role="combobox"
        aria-label={label}
        aria-invalid={error ? true : undefined}
        aria-autocomplete="list"
        aria-expanded={open}
        placeholder={placeholder || '—'}
        value={open ? query : display}
        onFocus={() => {
          picking.current = false;
          setOpen(true);
          setQuery('');
          moved.current = false;
        }}
        onChange={(event) => {
          setQuery(event.target.value);
          setOpen(true);
        }}
        onBlur={() => {
          window.setTimeout(() => {
            const skip = picking.current;
            picking.current = false;
            if (skip) return;
            setOpen(false);
            commitTyped(false);
            setQuery('');
          }, 0);
        }}
        onKeyDown={(event) => {
          if (event.key === 'ArrowDown') {
            event.preventDefault();
            setOpen(true);
            moved.current = true;
            setHighlight((index) => Math.min(index + 1, Math.max(filtered.length - 1, 0)));
          } else if (event.key === 'ArrowUp') {
            event.preventDefault();
            moved.current = true;
            setHighlight((index) => Math.max(index - 1, 0));
          } else if (event.key === 'Enter') {
            event.preventDefault();
            commitTyped(true);
          } else if (event.key === 'Escape') {
            setOpen(false);
            setQuery('');
          }
        }}
      />
      {clearable && current && !open && (
        <button
          type="button"
          className="advanced-edit-clear"
          aria-label={`Clear ${label}`}
          onMouseDown={(event) => {
            event.preventDefault();
            void choose('');
          }}
        >
          <X size={12} />
        </button>
      )}
      {open && box && (
        <OptionList
          box={box}
          options={filtered}
          highlight={highlight}
          value={current}
          empty={allowCustom ? 'Keep typing to enter a value' : 'No matches'}
          onHighlight={setHighlight}
          onChoose={(next) => {
            picking.current = true;
            void choose(next);
          }}
        />
      )}
    </div>
  );
}

function ChoicesEditor({ values, options, placeholder, label, error, onSave }: {
  values: string[];
  options: PickOption[];
  placeholder?: string;
  label: string;
  error?: string;
  onSave: (value: string[]) => Promise<void>;
}) {
  const [picked, setPicked] = useState(values);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [highlight, setHighlight] = useState(0);
  const anchor = useRef<HTMLInputElement>(null);
  const picking = useRef(false);
  const pickedRef = useRef(values);
  const box = useMenuBox(open, anchor);
  const signature = values.join('\u0000');

  useEffect(() => {
    const next = signature ? signature.split('\u0000') : [];
    pickedRef.current = next;
    setPicked(next);
  }, [signature]);
  useEffect(() => { setHighlight(0); }, [query, open]);

  const filtered = useMemo(() => {
    const selected = new Set(picked);
    const needle = query.trim().toLowerCase();
    return options.filter((option) => {
      if (selected.has(option.value)) return false;
      if (!needle) return true;
      return `${option.label} ${option.detail || ''} ${option.value}`.toLowerCase().includes(needle);
    });
  }, [options, picked, query]);

  const write = async (next: string[]) => {
    const previous = pickedRef.current;
    pickedRef.current = next;
    setPicked(next);
    try {
      await onSave(next);
    } catch {
      pickedRef.current = previous;
      setPicked(previous);
    }
  };

  const labelOf = (item: string) => options.find((option) => option.value === item)?.label || item;

  return (
    <div className="advanced-edit-choices">
      <div className="advanced-edit-chips">
        {picked.map((item) => (
          <span key={item} className="advanced-edit-chip">
            <span>{labelOf(item)}</span>
            <button type="button" aria-label={`Remove ${labelOf(item)}`} onClick={() => void write(pickedRef.current.filter((value) => value !== item))}>
              <X size={11} />
            </button>
          </span>
        ))}
        <input
          ref={anchor}
          className={error ? 'advanced-edit-input advanced-edit-invalid' : 'advanced-edit-input'}
          role="combobox"
          aria-label={label}
          aria-invalid={error ? true : undefined}
          aria-autocomplete="list"
          aria-expanded={open}
          placeholder={picked.length === 0 ? (placeholder || 'Add…') : ''}
          value={query}
          onFocus={() => setOpen(true)}
          onChange={(event) => {
            setQuery(event.target.value);
            setOpen(true);
          }}
          onBlur={() => {
            window.setTimeout(() => {
              if (picking.current) {
                picking.current = false;
                return;
              }
              setOpen(false);
              setQuery('');
            }, 0);
          }}
          onKeyDown={(event) => {
            if (event.key === 'ArrowDown') {
              event.preventDefault();
              setOpen(true);
              setHighlight((index) => Math.min(index + 1, Math.max(filtered.length - 1, 0)));
            } else if (event.key === 'ArrowUp') {
              event.preventDefault();
              setHighlight((index) => Math.max(index - 1, 0));
            } else if (event.key === 'Enter') {
              event.preventDefault();
              const pickedOption = filtered[highlight];
              if (pickedOption && !pickedRef.current.includes(pickedOption.value)) {
                setQuery('');
                void write([...pickedRef.current, pickedOption.value]);
              }
            } else if (event.key === 'Backspace' && query === '' && pickedRef.current.length > 0) {
              void write(pickedRef.current.slice(0, -1));
            } else if (event.key === 'Escape') {
              setOpen(false);
              setQuery('');
            }
          }}
        />
      </div>
      {open && box && (
        <OptionList
          box={box}
          options={filtered}
          highlight={highlight}
          empty="No matches"
          onHighlight={setHighlight}
          onChoose={(next) => {
            picking.current = true;
            setQuery('');
            setOpen(true);
            anchor.current?.focus();
            if (!pickedRef.current.includes(next)) void write([...pickedRef.current, next]);
          }}
        />
      )}
    </div>
  );
}

function EditCell({ column, row, label, error, onSave }: {
  column: EditColumn;
  row: Row;
  label: string;
  error?: string;
  onSave: (row: Row, column: EditColumn, value: CellValue) => Promise<void>;
}) {
  const reason = column.locked?.(row) || null;
  const save = (value: CellValue) => onSave(row, column, value);
  if (column.kind === 'readonly' || reason) {
    return <ReadonlyValue column={column} row={row} title={reason || column.hint || column.label} />;
  }
  if (column.kind === 'longtext' || column.kind === 'text') {
    return (
      <TextEditor
        value={String(column.get(row) || '')}
        long={column.kind === 'longtext'}
        maxLength={column.maxLength}
        placeholder={column.placeholder}
        label={label}
        error={error}
        onSave={(value) => save(value)}
      />
    );
  }
  if (column.kind === 'date') {
    return <DateEditor value={String(column.get(row) || '')} label={label} error={error} onSave={(value) => save(value)} />;
  }
  if (column.kind === 'number') {
    return (
      <NumberEditor
        value={String(column.get(row) || '')}
        min={column.min}
        max={column.max}
        label={label}
        error={error}
        onSave={(value) => save(value)}
      />
    );
  }
  if (column.kind === 'boolean') {
    return <BooleanEditor value={column.get(row) === true} label={label} onSave={(checked) => save(checked)} />;
  }
  if (column.kind === 'choices') {
    const raw = column.get(row);
    return (
      <ChoicesEditor
        values={Array.isArray(raw) ? raw : []}
        options={column.options?.(row) || []}
        placeholder={column.placeholder}
        label={label}
        error={error}
        onSave={(value) => save(value)}
      />
    );
  }
  return (
    <ChoiceEditor
      value={String(column.get(row) || '')}
      options={column.options?.(row) || []}
      allowCustom={column.allowCustom}
      clearable={!column.required}
      placeholder={column.placeholder}
      label={label}
      error={error}
      onSave={(value) => save(value)}
    />
  );
}

async function readError(res: Response) {
  try {
    const data = await res.json() as { message?: unknown; error?: unknown };
    if (typeof data?.message === 'string' && data.message.trim()) return data.message;
    if (typeof data?.error === 'string' && data.error.trim()) return data.error;
  } catch {
    return 'Could not save this field.';
  }
  return 'Could not save this field.';
}

export function AdvancedEditView({
  kind,
  rows,
  onRefresh,
  selection,
  singular,
  plural,
  detail,
  deletePath,
  editPath,
  openPath,
  thresholds,
}: {
  kind: EditKind;
  rows: readonly Row[];
  onRefresh: () => void;
  selection?: TableSelection;
  singular?: string;
  plural?: string;
  detail?: (count: number) => string;
  deletePath?: (id: string) => string;
  editPath?: (id: string) => string;
  openPath: (id: string) => string;
  thresholds?: TimeThresholds;
}) {
  const navigate = useNavigate();
  const { data: picklists } = useQuery({ queryKey: ['picklists'], queryFn: () => json('/api/picklists') });
  const { data: metaDefs } = useQuery({ queryKey: ['metadata-definitions'], queryFn: () => json('/api/metadata-definitions') });
  const { data: workspace } = useQuery({ queryKey: ['workspace'], queryFn: fetchWorkspaceSettings });
  const { data: applications } = useQuery({ queryKey: ['applications'], queryFn: () => json('/api/applications') });
  const { data: capabilities } = useQuery({ queryKey: ['capabilities'], queryFn: () => json('/api/capabilities') });
  const { data: organizations } = useQuery({ queryKey: ['organizations'], queryFn: () => json('/api/organizations') });
  const { data: information } = useQuery({ queryKey: ['information-objects'], queryFn: () => json('/api/information-objects') });
  const { data: goals } = useQuery({ queryKey: ['strategic-goals'], queryFn: () => json('/api/strategic-goals') });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState<Record<string, boolean>>({});
  const latest = useRef(new Map<string, Row>());
  const tail = useRef(new Map<string, Promise<void>>());
  const inflight = useRef(new Set<string>());

  useEffect(() => {
    for (const row of rows) {
      if (row?.id && !inflight.current.has(row.id)) latest.current.set(row.id, row);
    }
  }, [rows]);

  const columns = useMemo(() => buildEditColumns(kind, {
    picklists: Array.isArray(picklists) ? picklists : [],
    metaDefs: Array.isArray(metaDefs) ? metaDefs : [],
    disabled: workspace?.disabledNativeFields,
    applications: Array.isArray(applications) ? applications : [],
    capabilities: Array.isArray(capabilities) ? capabilities : [],
    organizations: Array.isArray(organizations) ? organizations : [],
    information: Array.isArray(information) ? information : [],
    goals: Array.isArray(goals) ? goals : [],
    thresholds: thresholds || readStoredTimeThresholds(),
    costCurrency: workspace?.costCurrency,
    costScale: workspace?.costScale,
  }), [kind, picklists, metaDefs, workspace, applications, capabilities, organizations, information, goals, thresholds]);

  const stickyLeft = selection ? '2.5rem' : 0;

  const saveCell = (row: Row, column: EditColumn, value: CellValue) => {
    const key = `${row.id}:${column.id}`;
    const run = async () => {
      const current = latest.current.get(row.id) || row;
      if (!column.commit) return;
      if (valuesEqual(value, column.get(current))) return;
      const result = column.commit(current, value);
      if ('error' in result) {
        setErrors((prev) => ({ ...prev, [key]: result.error }));
        throw new Error(result.error);
      }
      setErrors((prev) => {
        if (!prev[key]) return prev;
        const next = { ...prev };
        delete next[key];
        return next;
      });
      inflight.current.add(row.id);
      setSaving((prev) => ({ ...prev, [key]: true }));
      try {
        const res = await fetch(recordApiPath(kind, row.id), {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(result.body),
        });
        if (!res.ok) {
          const message = await readError(res);
          setErrors((prev) => ({ ...prev, [key]: message }));
          throw new Error(message);
        }
        let saved: Row = {};
        try { saved = await res.json(); } catch { saved = {}; }
        latest.current.set(row.id, applySaved(current, result.body, saved));
        onRefresh();
      } finally {
        inflight.current.delete(row.id);
        setSaving((prev) => {
          if (!prev[key]) return prev;
          const next = { ...prev };
          delete next[key];
          return next;
        });
      }
    };
    const previous = tail.current.get(row.id) ?? Promise.resolve();
    const next = previous.catch(() => undefined).then(run);
    tail.current.set(row.id, next);
    return next;
  };

  const list = useMemo(() => {
    const source = Array.isArray(rows) ? [...rows] : [];
    if (kind !== 'integration') return source;
    const label = (row: Row) => `${row.sourceApp?.name || ''} ${row.targetApp?.name || ''} ${row.id || ''}`;
    source.sort((left, right) => label(left).localeCompare(label(right), undefined, { numeric: true, sensitivity: 'base' }));
    return source;
  }, [rows, kind]);

  return (
    <div className="card advanced-edit-card" style={{ padding: 0 }}>
      {selection && singular && plural && deletePath && editPath && (
        <SelectionBar
          selection={selection}
          singular={singular}
          plural={plural}
          detail={detail}
          deletePath={deletePath}
          editPath={editPath}
          onRefresh={onRefresh}
        />
      )}
      <p className="advanced-edit-note">Edit a cell and leave it to save. Lists and relations match as you type. Ids, timestamps, and calculated values stay fixed.</p>
      <div className="advanced-edit">
        <table data-advanced-edit={kind}>
          <thead>
            <tr>
              {selection && <SelectionHeader selection={selection} style={{ position: 'sticky', left: 0, top: 0, zIndex: 4, background: 'var(--muted)' }} />}
              {columns.map((column) => (
                <th
                  key={column.id}
                  className={column.sticky ? 'advanced-edit-sticky' : undefined}
                  style={{ minWidth: column.minWidth, left: column.sticky ? stickyLeft : undefined }}
                  title={column.hint}
                >
                  {column.label}
                </th>
              ))}
              <th className="advanced-edit-open">Open</th>
            </tr>
          </thead>
          <tbody>
            {list.length === 0 ? (
              <tr>
                <td colSpan={columns.length + (selection ? 2 : 1)} className="advanced-edit-empty">Nothing to edit.</td>
              </tr>
            ) : list.map((row) => {
              const name = recordLabel(kind, row);
              return (
                <tr key={row.id} className={selection?.has(row.id) ? 'table-row-selected' : undefined}>
                  {selection && (
                    <SelectionRowCheck
                      selection={selection}
                      id={row.id}
                      label={name}
                      className="advanced-edit-sticky"
                      style={{ left: 0, zIndex: 1 }}
                    />
                  )}
                  {columns.map((column) => {
                    const key = `${row.id}:${column.id}`;
                    const field = `${column.label} for ${name}`;
                    return (
                      <td
                        key={column.id}
                        className={column.sticky ? 'advanced-edit-sticky' : undefined}
                        style={{ minWidth: column.minWidth, left: column.sticky ? stickyLeft : undefined }}
                        data-column={column.id}
                        aria-busy={saving[key] ? true : undefined}
                        title={errors[key]}
                      >
                        <EditCell
                          column={column}
                          row={latest.current.get(row.id) || row}
                          label={field}
                          error={errors[key]}
                          onSave={saveCell}
                        />
                        {errors[key] && <div className="advanced-edit-error-text">{errors[key]}</div>}
                      </td>
                    );
                  })}
                  <td className="advanced-edit-open">
                    <button type="button" className="secondary advanced-edit-open-button" title={`Open ${name}`} aria-label={`Open ${name}`} onClick={() => navigate(openPath(row.id))}>
                      <SquareArrowOutUpRight size={14} />
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
