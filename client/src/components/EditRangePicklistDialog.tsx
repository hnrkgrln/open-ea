import React, { useState } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { X, Sliders, Wand2, Trash2 } from 'lucide-react';

interface PicklistOption {
  id?: string;
  value: string;
  label: string;
  color: string;
  order: number;
}

interface Picklist {
  id: string;
  name: string;
  label: string;
  options: PicklistOption[];
}

interface Props {
  picklist: Picklist;
  isScale?: boolean;
  onSuccess: () => void;
}

// Color interpolation from App.tsx/ApplicationDiagram.tsx
const interpolateColor = (color1: string, color2: string, factor: number) => {
  const r1 = parseInt(color1.substring(1, 3), 16) || 0;
  const g1 = parseInt(color1.substring(3, 5), 16) || 0;
  const b1 = parseInt(color1.substring(5, 7), 16) || 0;
  const r2 = parseInt(color2.substring(1, 3), 16) || 0;
  const g2 = parseInt(color2.substring(3, 5), 16) || 0;
  const b2 = parseInt(color2.substring(5, 7), 16) || 0;
  const r = Math.round(r1 + factor * (r2 - r1));
  const g = Math.round(g1 + factor * (g2 - g1));
  const b = Math.round(b1 + factor * (b2 - b1));
  return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
};

const PALETTES: Record<string, string[]> = {
  'good-bad': ['#2b8a3e', '#fab005', '#c92a2a'],
  'bad-good': ['#c92a2a', '#fab005', '#2b8a3e'],
  'low-high': ['#e7f5ff', '#1864ab'],
  'importance': ['#dee2e6', '#7048e8', '#311b92'],
  'neutral': ['#f8f9fa', '#adb5bd', '#343a40']
};

export const EditRangePicklistDialog = ({ picklist, isScale, onSuccess }: Props) => {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [options, setOptions] = useState<PicklistOption[]>([]);
  
  // Generator states
  const [min, setMin] = useState(1);
  const [max, setMax] = useState(5);
  const [palette, setPalette] = useState('bad-good');

  React.useEffect(() => {
    if (open) {
      setOptions([...picklist.options].sort((a, b) => a.order - b.order));
    }
  }, [open, picklist.options]);

  const handleGenerate = () => {
    const newOptions: PicklistOption[] = [];
    const count = max - min + 1;
    const colors = PALETTES[palette];

    for (let i = 0; i < count; i++) {
      const val = min + i;
      const factor = count > 1 ? i / (count - 1) : 0.5;
      
      let color = '';
      if (colors.length === 3) {
        if (factor < 0.5) color = interpolateColor(colors[0], colors[1], factor * 2);
        else color = interpolateColor(colors[1], colors[2], (factor - 0.5) * 2);
      } else {
        color = interpolateColor(colors[0], colors[1], factor);
      }

      newOptions.push({
        value: String(val),
        label: val === min ? `${val} - Low` : val === max ? `${val} - High` : String(val),
        color,
        order: i + 1
      });
    }
    setOptions(newOptions);
  };

  const handleAddManual = () => {
    setOptions([...options, { value: '', label: '', color: '#adb5bd', order: options.length + 1 }]);
  };

  const handleSave = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/picklists/${picklist.id}/options`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(options.map(({ id, ...rest }, idx) => ({ ...rest, order: idx + 1 }))),
      });

      if (res.ok) {
        setOpen(false);
        onSuccess();
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const updateOption = (index: number, field: keyof PicklistOption, value: any) => {
    const newOpts = [...options];
    newOpts[index] = { ...newOpts[index], [field]: value };
    setOptions(newOpts);
  };

  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Trigger asChild>
        <button className="secondary" style={{ height: '2rem', padding: '0 0.75rem', fontSize: '0.75rem' }}>
          <Sliders size={14} style={{ marginRight: '0.5rem' }} /> {isScale ? 'Configure Range' : 'Edit Options'}
        </button>
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 100 }} />
        <Dialog.Content style={{ 
          position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%, -50%)',
          width: '90vw', maxWidth: '600px', maxHeight: '85vh', overflowY: 'auto',
          background: 'var(--card)', color: 'var(--card-foreground)', padding: '1.5rem',
          borderRadius: 'var(--radius)', zIndex: 150, border: '1px solid var(--border)'
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '1rem' }}>
            <Dialog.Title style={{ fontWeight: 600 }}>{isScale ? 'Configure Range:' : 'Edit Options:'} {picklist.label}</Dialog.Title>
            <Dialog.Close asChild><button style={{ border: 'none', height: 'auto', padding: '0.25rem', background: 'transparent' }}><X size={18} /></button></Dialog.Close>
          </div>
          <Dialog.Description style={{ marginBottom: '1.5rem', fontSize: '0.875rem', color: 'var(--muted-foreground)' }}>
            {isScale ? 'Quickly generate a numeric range with semantic colors or edit individual steps.' : 'Add, remove, or modify the allowed values for this list.'}
          </Dialog.Description>

          {isScale && (
            <div className="card" style={{ background: 'var(--secondary)', marginBottom: '1.5rem', padding: '1rem' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1.5fr auto', gap: '1rem', alignItems: 'flex-end' }}>
                <div className="field" style={{ margin: 0 }}>
                  <label className="label">Min</label>
                  <input type="number" value={min} onChange={e => setMin(Number(e.target.value))} />
                </div>
                <div className="field" style={{ margin: 0 }}>
                  <label className="label">Max</label>
                  <input type="number" value={max} onChange={e => setMax(Number(e.target.value))} />
                </div>
                <div className="field" style={{ margin: 0 }}>
                  <label className="label">Palette</label>
                  <select value={palette} onChange={e => setPalette(e.target.value)}>
                    <option value="good-bad">Good to Bad</option>
                    <option value="bad-good">Bad to Good</option>
                    <option value="low-high">Intensity (Blue)</option>
                    <option value="importance">Importance (Purple)</option>
                    <option value="neutral">Gray Scale</option>
                  </select>
                </div>
                <button type="button" onClick={handleGenerate} className="primary" style={{ height: '2.5rem' }}>
                  <Wand2 size={16} style={{ marginRight: '0.5rem' }} /> Generate
                </button>
              </div>
            </div>
          )}

          <div style={{ marginBottom: '2rem' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ textAlign: 'left', borderBottom: '1px solid var(--border)' }}>
                  <th style={{ padding: '0.5rem', fontSize: '0.7rem', textTransform: 'uppercase' }}>Value (DB Key)</th>
                  <th style={{ padding: '0.5rem', fontSize: '0.7rem', textTransform: 'uppercase' }}>Display Label</th>
                  <th style={{ padding: '0.5rem', fontSize: '0.7rem', textTransform: 'uppercase' }}>Color</th>
                  <th style={{ width: '40px' }}></th>
                </tr>
              </thead>
              <tbody>
                {options.map((opt, i) => (
                  <tr key={i} style={{ borderBottom: '1px solid var(--border)' }}>
                    <td style={{ padding: '0.5rem' }}>
                      <input value={opt.value} onChange={e => updateOption(i, 'value', e.target.value)} style={{ margin: 0, fontSize: '0.875rem' }} placeholder="my_key" />
                    </td>
                    <td style={{ padding: '0.5rem' }}>
                      <input value={opt.label} onChange={e => updateOption(i, 'label', e.target.value)} style={{ margin: 0, fontSize: '0.875rem' }} placeholder="My Label" />
                    </td>
                    <td style={{ padding: '0.5rem' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <input type="color" value={opt.color || '#adb5bd'} onChange={e => updateOption(i, 'color', e.target.value)} style={{ width: '30px', height: '30px', padding: 0, border: 'none', background: 'none' }} />
                      </div>
                    </td>
                    <td style={{ padding: '0.5rem', textAlign: 'right' }}>
                      <button onClick={() => setOptions(options.filter((_, idx) => idx !== i))} style={{ border: 'none', background: 'transparent', color: 'var(--destructive)', cursor: 'pointer' }}><Trash2 size={14} /></button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            
            <div style={{ marginTop: '1rem', display: 'flex', justifyContent: 'center' }}>
                <button type="button" onClick={handleAddManual} className="secondary" style={{ fontSize: '0.875rem' }}>
                    + Add Option
                </button>
            </div>
            
            {options.length === 0 && (
              <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--muted-foreground)', fontSize: '0.875rem' }}>No options defined.</div>
            )}
          </div>

          <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
            <Dialog.Close asChild><button type="button" className="secondary">Cancel</button></Dialog.Close>
            <button onClick={handleSave} className="primary" disabled={loading || options.length === 0}>
              {loading ? 'Saving...' : 'Save Configuration'}
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
};
