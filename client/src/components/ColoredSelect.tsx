import { useState, useRef, useEffect } from 'react';
import * as Select from '@radix-ui/react-select';
import { Check, ChevronDown, Search } from 'lucide-react';

interface Option {
  value: string;
  label: string;
  description?: string;
  color?: string;
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

  const filteredOptions = searchable && query
    ? options.filter(o => o.label.toLowerCase().includes(query.toLowerCase()))
    : options;

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
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {selected.label}
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
                      gap: '0.75rem',
                      padding: '0.5rem 0.75rem',
                      borderRadius: '6px',
                      fontSize: '0.875rem',
                      color: 'var(--foreground)',
                      cursor: 'pointer',
                      outline: 'none',
                      userSelect: 'none',
                    }}
                    className="row-hover"
                  >
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.15rem', flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        {hasAnyColors ? (o.color ? <Dot color={o.color} /> : <span style={{ width: 10, flexShrink: 0 }} />) : null}
                        <Select.ItemText>{o.label}</Select.ItemText>
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
                    <Select.ItemIndicator style={{ marginLeft: 'auto', flexShrink: 0 }}>
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
