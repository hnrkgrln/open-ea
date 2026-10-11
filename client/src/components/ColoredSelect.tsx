import { useState, useRef, useEffect } from 'react';
import * as Select from '@radix-ui/react-select';
import { Check, ChevronDown, ChevronRight, Search } from 'lucide-react';

interface Option {
  value: string;
  label: string;
  description?: string;
  color?: string;
  detail?: string;
  depth?: number;
  parentValue?: string;
}

interface ColoredSelectProps {
  value: string;
  onChange: (value: string) => void;
  options: Option[];
  placeholder?: string;
  disabled?: boolean;
  required?: boolean;
  name?: string;
  style?: React.CSSProperties;
  searchable?: boolean;
  searchPlaceholder?: string;
}

const Dot = ({ color }: { color: string }) => (
  <span
    style={{
      width: '10px',
      height: '10px',
      borderRadius: '50%',
      background: color,
      flexShrink: 0,
    }}
  />
);

// Radix Select cannot use empty-string values; we map "" <-> EMPTY_TOKEN internally.
const EMPTY_TOKEN = '__empty__';

const optionText = (option: Option) => [option.label, option.detail, option.description].filter(Boolean).join(' ').toLowerCase();

function filterOptions(options: Option[], query: string): Option[] {
  const needle = query.trim().toLowerCase();
  if (!needle) return options;
  const hasTree = options.some((option) => option.depth != null || option.parentValue);
  if (!hasTree) return options.filter((option) => optionText(option).includes(needle));

  const byValue = new Map(options.filter((option) => option.value).map((option) => [option.value, option]));
  const children = new Map<string, Option[]>();
  for (const option of options) {
    if (!option.value) continue;
    const parent = option.parentValue ?? '';
    const list = children.get(parent) ?? [];
    list.push(option);
    children.set(parent, list);
  }
  const visible = new Set<string>();
  const expanded = new Set<string>();
  const includeDescendants = (id: string) => {
    if (expanded.has(id)) return;
    expanded.add(id);
    visible.add(id);
    for (const child of children.get(id) ?? []) includeDescendants(child.value);
  };
  for (const option of options) {
    if (!option.value || !optionText(option).includes(needle)) continue;
    includeDescendants(option.value);
    const seen = new Set<string>();
    let parent = option.parentValue;
    while (parent && byValue.has(parent) && !seen.has(parent)) {
      seen.add(parent);
      visible.add(parent);
      parent = byValue.get(parent)?.parentValue;
    }
  }
  return options.filter((option) => option.value ? visible.has(option.value) : optionText(option).includes(needle));
}

export const ColoredSelect = ({
  value,
  onChange,
  options,
  placeholder = 'Select...',
  disabled,
  required,
  name,
  style,
  searchable,
  searchPlaceholder = 'Search...',
}: ColoredSelectProps) => {
  const hasAnyColors = options.some(o => !!o.color);
  const selected = options.find(o => o.value === value);
  const internalValue = value === '' ? EMPTY_TOKEN : value;
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const searchRef = useRef<HTMLInputElement>(null);

  // Reset query each time the dropdown opens, then focus the search field.
  useEffect(() => {
    if (open && searchable) {
      setQuery('');
      const t = setTimeout(() => searchRef.current?.focus(), 30);
      return () => clearTimeout(t);
    }
  }, [open, searchable]);

  const filteredOptions = (() => {
    const matched = filterOptions(options, searchable ? query : '');
    if (!value || matched.some((option) => option.value === value)) return matched;
    const current = options.find((option) => option.value === value);
    return current ? [current, ...matched] : matched;
  })();

  return (
    <>
      {/* Hidden input mirrors value for native form submission via FormData */}
      {name ? <input type="hidden" name={name} value={value} /> : null}
      <Select.Root
        value={internalValue}
        onValueChange={(v) => onChange(v === EMPTY_TOKEN ? '' : v)}
        open={open}
        onOpenChange={setOpen}
        disabled={disabled}
        required={required}
      >
        <Select.Trigger
          style={{
            width: '100%',
            padding: '0.5rem 0.75rem',
            borderRadius: 'var(--radius)',
            border: '1px solid var(--input)',
            fontSize: '0.875rem',
            marginTop: '0.25rem',
            background: 'var(--card)',
            color: 'var(--foreground)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '0.5rem',
            cursor: disabled ? 'not-allowed' : 'pointer',
            opacity: disabled ? 0.6 : 1,
            height: '2.25rem',
            textAlign: 'left',
            ...style,
          }}
        >
          <span style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', overflow: 'hidden', flex: 1, minWidth: 0 }}>
            {hasAnyColors && selected?.color ? <Dot color={selected.color} /> : null}
            {/*
              Compute the trigger label ourselves rather than using Select.Value.
              Select.Value reads the label from registered Select.Item DOM nodes; when
              options arrive after the controlled `value` is set, the trigger can stay
              blank. Deriving from `options.find(...)` is deterministic and re-runs as
              soon as options change.
            */}
            {selected ? (
              <span style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', minWidth: 0, overflow: 'hidden' }}>
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{selected.label}</span>
                {selected.detail ? (
                  <span style={{ flexShrink: 0, color: 'var(--muted-foreground)', fontSize: '0.75rem', fontWeight: 600 }}>{selected.detail}</span>
                ) : null}
              </span>
            ) : value ? (
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'var(--muted-foreground)', fontStyle: 'italic' }}>
                {value}
              </span>
            ) : (
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'var(--muted-foreground)' }}>
                {placeholder}
              </span>
            )}
            {/* Keep Select.Value mounted (visually hidden) so Radix is happy. */}
            <span style={{ position: 'absolute', width: 0, height: 0, overflow: 'hidden', opacity: 0, pointerEvents: 'none' }}>
              <Select.Value />
            </span>
          </span>
          <Select.Icon>
            <ChevronDown size={16} style={{ opacity: 0.6 }} />
          </Select.Icon>
        </Select.Trigger>
        <Select.Portal>
          <Select.Content
            position="popper"
            sideOffset={4}
            style={{
              background: 'var(--card)',
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius)',
              boxShadow: '0 4px 12px rgba(0, 0, 0, 0.12)',
              zIndex: 1000,
              minWidth: 'var(--radix-select-trigger-width)',
              maxHeight: '320px',
              overflow: 'hidden',
              display: 'flex',
              flexDirection: 'column',
            }}
          >
            {searchable && (
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  padding: '8px 8px 6px 10px',
                  borderBottom: '1px solid var(--border)',
                }}
                // Stop pointer events from triggering Radix Select's keyboard typeahead/close behavior.
                onPointerDown={(e) => e.stopPropagation()}
                onKeyDown={(e) => e.stopPropagation()}
              >
                <Search size={14} style={{ opacity: 0.5, flexShrink: 0 }} />
                <input
                  ref={searchRef}
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder={searchPlaceholder}
                  aria-label={searchPlaceholder}
                  style={{
                    border: 'none',
                    outline: 'none',
                    background: 'transparent',
                    padding: 0,
                    margin: 0,
                    width: '100%',
                    fontSize: '0.85rem',
                    color: 'var(--foreground)',
                    height: '1.5rem',
                  }}
                />
              </div>
            )}
            <Select.Viewport style={{ padding: '4px', overflowY: 'auto' }}>
              {filteredOptions.length === 0 ? (
                <div style={{ padding: '0.75rem', fontSize: '0.85rem', color: 'var(--muted-foreground)', textAlign: 'center' }}>
                  No matches
                </div>
              ) : (
                filteredOptions.map(o => (
                  <Select.Item
                    key={o.value || EMPTY_TOKEN}
                    value={o.value === '' ? EMPTY_TOKEN : o.value}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.5rem',
                      padding: '0.55rem 0.75rem',
                      paddingLeft: `${0.75 + (o.depth ?? 0) * 0.9}rem`,
                      borderRadius: 'var(--radius)',
                      fontSize: '0.875rem',
                      color: 'var(--foreground)',
                      cursor: 'pointer',
                      outline: 'none',
                      userSelect: 'none',
                      margin: '2px 4px',
                    }}
                    className="row-hover"
                  >
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.15rem', flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', minWidth: 0 }}>
                        {(o.depth ?? 0) > 0 ? <ChevronRight size={12} style={{ color: 'var(--muted-foreground)', flexShrink: 0 }} /> : null}
                        {hasAnyColors ? (o.color ? <Dot color={o.color} /> : <span style={{ width: 10, flexShrink: 0 }} />) : null}
                        <Select.ItemText>{o.label}</Select.ItemText>
                        {o.detail ? (
                          <span style={{ marginLeft: 'auto', flexShrink: 0, fontSize: '0.68rem', fontWeight: 700, letterSpacing: '0.02em', color: 'var(--muted-foreground)' }}>{o.detail}</span>
                        ) : null}
                      </div>
                      {o.description && (
                        <div style={{ 
                          fontSize: '0.7rem', 
                          color: 'var(--muted-foreground)', 
                          marginLeft: hasAnyColors ? '1.1rem' : 0,
                          lineHeight: '1.2'
                        }}>
                          {o.description}
                        </div>
                      )}
                    </div>
                    <Select.ItemIndicator style={{ flexShrink: 0 }}>
                      <Check size={14} />
                    </Select.ItemIndicator>
                  </Select.Item>
                ))
              )}
            </Select.Viewport>
          </Select.Content>
        </Select.Portal>
      </Select.Root>
    </>
  );
};
