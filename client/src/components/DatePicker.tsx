import React, { useState } from 'react';
import { Calendar as CalendarIcon } from 'lucide-react';
import { format, parse, isValid } from 'date-fns';
import { DayPicker } from 'react-day-picker';
import 'react-day-picker/style.css';
import * as Popover from '@radix-ui/react-popover';

interface DatePickerProps {
  value: string;
  onChange: (value: string) => void;
  label?: string;
  placeholder?: string;
}

export const DatePicker = ({ value, onChange, label, placeholder = 'YYYY-MM-DD' }: DatePickerProps) => {
  const [isOpen, setIsOpen] = useState(false);

  // Parse string to Date for the calendar
  const parsedDate = value ? parse(value, 'yyyy-MM-dd', new Date()) : undefined;
  const selectedDate = parsedDate && isValid(parsedDate) ? parsedDate : undefined;

  const handleSelect = (date: Date | undefined) => {
    if (date) {
      onChange(format(date, 'yyyy-MM-dd'));
    } else {
      onChange('');
    }
    setIsOpen(false);
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    onChange(e.target.value);
  };

  return (
    <div className="field">
      {label && <label className="label">{label}</label>}
      <Popover.Root open={isOpen} onOpenChange={setIsOpen}>
        <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
          <input
            type="text"
            value={value || ''}
            onChange={handleInputChange}
            placeholder={placeholder}
            style={{ 
              paddingRight: '2.5rem',
              width: '100%',
              marginTop: 0
            }}
            title="Format: YYYY-MM-DD"
          />
          <Popover.Trigger asChild>
            <button
              type="button"
              style={{
                position: 'absolute',
                right: '0.5rem',
                background: 'transparent',
                border: 'none',
                padding: 0,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: 'var(--muted-foreground)',
                cursor: 'pointer'
              }}
            >
              <CalendarIcon size={16} />
            </button>
          </Popover.Trigger>
        </div>
        <Popover.Portal>
          <Popover.Content 
            align="end" 
            sideOffset={4} 
            className="card"
            style={{ 
              padding: '1rem', 
              zIndex: 50, 
              background: 'var(--card)', 
              borderRadius: 'var(--radius)', 
              border: '1px solid var(--border)', 
              boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1), 0 4px 6px -2px rgba(0,0,0,0.05)' 
            }}
          >
            <DayPicker 
              mode="single" 
              selected={selectedDate} 
              onSelect={handleSelect}
            />
          </Popover.Content>
        </Popover.Portal>
      </Popover.Root>
    </div>
  );
};
