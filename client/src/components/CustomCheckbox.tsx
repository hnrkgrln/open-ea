import React from 'react';
import { Check } from 'lucide-react';

interface CustomCheckboxProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
}

export const CustomCheckbox = ({ checked, onChange }: CustomCheckboxProps) => {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      style={{
        width: '1.25rem',
        height: '1.25rem',
        borderRadius: '4px',
        border: `2px solid ${checked ? 'var(--brand-focus)' : 'var(--input)'}`,
        background: checked ? 'var(--brand-focus)' : 'var(--card)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        transition: 'all 0.15s cubic-bezier(0.4, 0, 0.2, 1)',
        padding: 0,
        cursor: 'pointer',
        outline: 'none',
      }}
      onKeyDown={(e) => {
        if (e.key === ' ' || e.key === 'Enter') {
          e.preventDefault();
          onChange(!checked);
        }
      }}
      className="custom-checkbox"
    >
      {checked && (
        <Check 
          size={14} 
          strokeWidth={4} 
          color="white" 
          style={{ 
            animation: 'checkbox-pop 0.2s ease-out' 
          }} 
        />
      )}
      <style>{`
        .custom-checkbox:focus-visible {
          box-shadow: 0 0 0 2px var(--background), 0 0 0 4px var(--brand-focus);
        }
        @keyframes checkbox-pop {
          from { transform: scale(0.5); opacity: 0; }
          to { transform: scale(1); opacity: 1; }
        }
      `}</style>
    </button>
  );
};
