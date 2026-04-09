import * as Popover from '@radix-ui/react-popover';
import { Check, ChevronDown, X } from 'lucide-react';

interface SearchInputProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  label?: string;
}

export const SearchInput = ({ value, onChange, placeholder = "Search...", label }: SearchInputProps) => {
  return (
    <div className="field" style={{ margin: 0, position: 'relative' }}>
      {label && <label className="label">{label}</label>}
      <div style={{ position: 'relative', marginTop: label ? '0.25rem' : 0 }}>
        <input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          style={{ paddingRight: '2rem', caretColor: 'var(--primary)' }}
        />
        {value && (
          <button
            onClick={() => onChange('')}
            style={{
              position: 'absolute',
              right: '0.5rem',
              top: '50%',
              transform: 'translateY(-50%)',
              border: 'none',
              background: 'transparent',
              padding: '0.25rem',
              height: 'auto',
              width: 'auto',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'var(--muted-foreground)',
              cursor: 'pointer'
            }}
          >
            <X size={14} />
          </button>
        )}
      </div>
    </div>
  );
};

interface MultiSelectProps {
  label: string;
  options: { value: string; label: string }[];
  selectedValues: string[];
  onChange: (values: string[]) => void;
  placeholder?: string;
}

export const MultiSelect = ({ label, options, selectedValues = [], onChange, placeholder = "Select..." }: MultiSelectProps) => {
  const safeSelectedValues = selectedValues || [];
  const toggleOption = (value: string) => {
    if (safeSelectedValues.includes(value)) {
      onChange(safeSelectedValues.filter(v => v !== value));
    } else {
      onChange([...safeSelectedValues, value]);
    }
  };

  const selectedLabels = options
    .filter(o => safeSelectedValues.includes(o.value))
    .map(o => o.label);

  const displayText = selectedLabels.length === 0 
    ? placeholder 
    : selectedLabels.length <= 2 
      ? selectedLabels.join(', ') 
      : `${selectedLabels.length} selected`;

  return (
    <div className="field" style={{ margin: 0 }}>
      <label className="label">{label}</label>
      <div style={{ position: 'relative', marginTop: '0.25rem' }}>
        <Popover.Root>
          <Popover.Trigger asChild>
            <button
              style={{
                width: '100%',
                justifyContent: 'space-between',
                background: 'var(--card)',
                textAlign: 'left',
                fontWeight: 400,
                padding: `0 ${selectedValues.length > 0 ? '2.5rem' : '0.75rem'} 0 0.75rem`,
                overflow: 'hidden',
                whiteSpace: 'nowrap',
                marginTop: 0
              }}
            >
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{displayText}</span>
              <ChevronDown size={14} style={{ flexShrink: 0, marginLeft: '0.5rem', color: 'var(--muted-foreground)' }} />
            </button>
          </Popover.Trigger>
          <Popover.Portal>
            <Popover.Content
              className="card"
              style={{
                zIndex: 100,
                width: 'var(--radix-popover-trigger-width)',
                maxHeight: '300px',
                overflowY: 'auto',
                padding: '0.5rem',
                boxShadow: '0 10px 38px -10px rgba(22, 23, 24, 0.35), 0 10px 20px -15px rgba(22, 23, 24, 0.2)',
                animation: 'none'
              }}
              align="start"
              sideOffset={4}
            >
              <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                {selectedValues.length > 0 && (
                  <div
                    onClick={(e) => {
                      e.stopPropagation();
                      onChange([]);
                    }}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.5rem',
                      padding: '0.6rem 0.75rem',
                      borderRadius: 'var(--radius)',
                      cursor: 'pointer',
                      fontSize: '0.875rem',
                      color: '#ff4b4b',
                      background: 'rgba(255, 75, 75, 0.05)',
                      fontWeight: 800,
                      border: '1px dashed #ff4b4b',
                      marginBottom: '8px',
                      transition: 'all 0.2s'
                    }}
                    className="clear-all-item"
                  >
                    <div style={{ width: '1rem', display: 'flex', alignItems: 'center' }}>
                      <X size={14} />
                    </div>
                    <span>Reset All Selections</span>
                  </div>
                )}
                {options.map((option) => (
                  <div
                    key={option.value}
                    onClick={() => toggleOption(option.value)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.5rem',
                      padding: '0.5rem 0.75rem',
                      borderRadius: 'var(--radius)',
                      cursor: 'pointer',
                      fontSize: '0.875rem',
                      background: selectedValues.includes(option.value) ? 'var(--accent)' : 'transparent',
                      color: 'var(--foreground)'
                    }}
                    className="search-item"
                  >
                    <div style={{ width: '1rem', display: 'flex', alignItems: 'center' }}>
                      {selectedValues.includes(option.value) && <Check size={14} />}
                    </div>
                    <span>{option.label}</span>
                  </div>
                ))}
                {options.length === 0 && (
                  <div style={{ padding: '0.5rem', fontSize: '0.875rem', color: 'var(--muted-foreground)', textAlign: 'center' }}>
                    No options available
                  </div>
                )}
              </div>
            </Popover.Content>
          </Popover.Portal>
        </Popover.Root>
        
        {selectedValues.length > 0 && (
          <button
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onChange([]);
            }}
            title="Clear all"
            style={{
              position: 'absolute',
              right: '2.25rem',
              top: '50%',
              transform: 'translateY(-50%)',
              border: 'none',
              background: 'transparent',
              padding: '0.25rem',
              height: 'auto',
              width: 'auto',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'var(--destructive)',
              cursor: 'pointer',
              zIndex: 10,
              opacity: 0.7
            }}
          >
            <X size={14} />
          </button>
        )}
      </div>
    </div>
  );
};
