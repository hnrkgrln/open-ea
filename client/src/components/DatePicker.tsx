import React, { useRef } from 'react';
import { Calendar } from 'lucide-react';

interface DatePickerProps {
  value: string;
  onChange: (value: string) => void;
  label?: string;
  placeholder?: string;
}

export const DatePicker = ({ value, onChange, label, placeholder = 'YYYY-MM-DD' }: DatePickerProps) => {
  const hiddenInputRef = useRef<HTMLInputElement>(null);

  const handleIconClick = () => {
    if (hiddenInputRef.current) {
      // Trigger the native browser date picker
      if ('showPicker' in HTMLInputElement.prototype) {
        hiddenInputRef.current.showPicker();
      } else {
        hiddenInputRef.current.click();
      }
    }
  };

  return (
    <div className="field">
      {label && <label className="label">{label}</label>}
      <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
        <input
          type="text"
          value={value || ''}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          style={{ 
            fontFamily: 'monospace', 
            paddingRight: '3rem',
            width: '100%' 
          }}
          title="Format: YYYY-MM-DD"
        />
        <button
          type="button"
          onClick={handleIconClick}
          style={{
            position: 'absolute',
            right: '0.5rem',
            background: 'none',
            border: 'none',
            padding: '0.5rem',
            cursor: 'pointer',
            color: 'var(--primary)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center'
          }}
          className="row-hover"
        >
          <Calendar size={20} />
        </button>
        
        {/* Hidden native date picker */}
        <input
          ref={hiddenInputRef}
          type="date"
          value={value || ''}
          onChange={(e) => onChange(e.target.value)}
          style={{
            position: 'absolute',
            visibility: 'hidden',
            width: 0,
            height: 0
          }}
        />
      </div>
    </div>
  );
};
