import React, { useState } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { X, Network } from 'lucide-react';
import { ColoredSelect } from './ColoredSelect';

interface Application {
  id: string;
  name: string;
}

interface Props {
  applications: Application[];
  onSuccess: () => void;
}

export const NewIntegrationDialog = ({ applications, onSuccess }: Props) => {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [sourceAppId, setSourceAppId] = useState('');
  const [targetAppId, setTargetAppId] = useState('');
  const [type, setType] = useState('API');

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setLoading(true);
    const formData = new FormData(e.currentTarget);
    const data = {
      ...Object.fromEntries(formData.entries()),
      sourceAppId,
      targetAppId,
      type,
    };

    if (!sourceAppId || !targetAppId) {
      alert('Please select both a source and target application.');
      setLoading(false);
      return;
    }
    if (sourceAppId === targetAppId) {
      alert("Source and Target applications must be different.");
      setLoading(false);
      return;
    }

    try {
      const res = await fetch('/api/integrations', {
        method: 'POST',
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
        <button style={{ gap: '0.5rem' }}>
          <Network size={18} /> New Integration
        </button>
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 50 }} />
        <Dialog.Content style={{ 
          position: 'fixed', 
          top: '50%', 
          left: '50%', 
          transform: 'translate(-50%, -50%)',
          width: '90vw',
          maxWidth: '450px',
          background: 'white',
          padding: '1.5rem',
          borderRadius: 'var(--radius)',
          zIndex: 100
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '1rem' }}>
            <Dialog.Title style={{ fontWeight: 600 }}>Create Application Integration</Dialog.Title>
            <Dialog.Close asChild>
              <button style={{ border: 'none', height: 'auto', padding: '0.25rem' }}><X size={18} /></button>
            </Dialog.Close>
          </div>
          <Dialog.Description style={{ display: 'none' }}>Define a new integration between two applications.</Dialog.Description>
          
          <form onSubmit={handleSubmit}>
            <div className="field">
              <label className="label">Source Application</label>
              <ColoredSelect
                value={sourceAppId}
                onChange={setSourceAppId}
                options={[{ value: '', label: 'Select source...' }, ...applications.map(app => ({ value: app.id, label: app.name }))]}
              />
            </div>

            <div className="field">
              <label className="label">Target Application</label>
              <ColoredSelect
                value={targetAppId}
                onChange={setTargetAppId}
                options={[{ value: '', label: 'Select target...' }, ...applications.map(app => ({ value: app.id, label: app.name }))]}
              />
            </div>

            <div className="field">
              <label className="label">Integration Type</label>
              <ColoredSelect
                value={type}
                onChange={setType}
                options={[
                  { value: 'API', label: 'API' },
                  { value: 'Batch', label: 'Batch' },
                  { value: 'Messaging', label: 'Messaging' },
                  { value: 'Manual', label: 'Manual' },
                ]}
              />
            </div>

            <div className="field">
              <label className="label">Integration Name / Purpose</label>
              <input name="name" placeholder="e.g. Sync Customer Data" />
            </div>

            <div style={{ marginTop: '1.5rem', display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
              <Dialog.Close asChild>
                <button type="button">Cancel</button>
              </Dialog.Close>
              <button type="submit" className="primary" disabled={loading}>
                {loading ? 'Creating...' : 'Create Integration'}
              </button>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
};
