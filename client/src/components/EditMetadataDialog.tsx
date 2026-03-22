import React, { useState } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { X, Edit2 } from 'lucide-react';

interface MetadataDefinition {
  id: string;
  fieldName: string;
  fieldType: string;
  label: string;
  min?: number;
  max?: number;
  scaleType?: string;
}

interface Props {
  definition: MetadataDefinition;
  onSuccess: () => void;
}

export const EditMetadataDialog = ({ definition, onSuccess }: Props) => {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [type, setType] = useState(definition.fieldType);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setLoading(true);
    const formData = new FormData(e.currentTarget);
    
    const data = {
      label: formData.get('label'),
      fieldType: type,
      min: type === 'range' ? Number(formData.get('min')) : null,
      max: type === 'range' ? Number(formData.get('max')) : null,
      scaleType: type === 'range' ? formData.get('scaleType') : null,
    };

    try {
      const res = await fetch(`/api/metadata-definitions/${definition.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
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

  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Trigger asChild>
        <button style={{ border: 'none', background: 'transparent', padding: '0.25rem' }} title="Edit Field">
          <Edit2 size={16} />
        </button>
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 100 }} />
        <Dialog.Content style={{ 
          position: 'fixed', 
          top: '50%', 
          left: '50%', 
          transform: 'translate(-50%, -50%)',
          width: '90vw',
          maxWidth: '450px',
          background: 'var(--card)',
          color: 'var(--card-foreground)',
          padding: '1.5rem',
          borderRadius: 'var(--radius)',
          zIndex: 150,
          border: '1px solid var(--border)'
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '1.5rem' }}>
            <Dialog.Title style={{ fontWeight: 600 }}>Edit Custom Field</Dialog.Title>
            <Dialog.Close asChild>
              <button style={{ border: 'none', height: 'auto', padding: '0.25rem', background: 'transparent' }}><X size={18} /></button>
            </Dialog.Close>
          </div>
          
          <form onSubmit={handleSubmit}>
            <div className="field">
              <label className="label">Field Label</label>
              <input name="label" required defaultValue={definition.label} />
            </div>

            <div className="field">
              <label className="label">System Name (Cannot be changed)</label>
              <input disabled value={definition.fieldName} style={{ opacity: 0.6 }} />
            </div>

            <div className="field">
              <label className="label">Field Type</label>
              <select value={type} onChange={(e) => setType(e.target.value)}>
                <option value="string">Text (Short)</option>
                <option value="textarea">Text (Long)</option>
                <option value="number">Number</option>
                <option value="range">Range Slider</option>
                <option value="date">Date</option>
                <option value="boolean">Boolean (Checkbox)</option>
              </select>
            </div>

            {type === 'range' && (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginTop: '1rem' }}>
                <div className="field">
                  <label className="label">Min Value</label>
                  <input name="min" type="number" defaultValue={definition.min ?? 0} />
                </div>
                <div className="field">
                  <label className="label">Max Value</label>
                  <input name="max" type="number" defaultValue={definition.max ?? 100} />
                </div>
                <div className="field" style={{ gridColumn: 'span 2' }}>
                  <label className="label">Scale Palette</label>
                  <select name="scaleType" defaultValue={definition.scaleType || 'neutral'}>
                    <option value="neutral">Neutral (Blue)</option>
                    <option value="good-bad">Good to Bad (Green to Red)</option>
                    <option value="bad-good">Bad to Good (Red to Green)</option>
                    <option value="low-high">Low to High (Light to Dark)</option>
                    <option value="importance">Low to High (Gray to Purple)</option>
                  </select>
                </div>
              </div>
            )}

            <div style={{ marginTop: '2rem', display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
              <Dialog.Close asChild>
                <button type="button">Cancel</button>
              </Dialog.Close>
              <button type="submit" className="primary" disabled={loading}>
                {loading ? 'Saving...' : 'Save Changes'}
              </button>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
};
