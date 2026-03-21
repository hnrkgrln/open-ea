import React, { useState } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { X, Plus, Edit2 } from 'lucide-react';

interface Props {
  capability?: {
    id: string;
    name: string;
    description?: string;
    parentId?: string | null;
  };
  parentId?: string;
  onSuccess: () => void;
  trigger?: React.ReactNode;
}

export const EditCapabilityDialog = ({ capability, parentId, onSuccess, trigger }: Props) => {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setLoading(true);
    const formData = new FormData(e.currentTarget);
    const data = {
      name: formData.get('name'),
      description: formData.get('description'),
      parentId: parentId || capability?.parentId,
    };

    const url = capability 
      ? `/api/capabilities/${capability.id}`
      : '/api/capabilities';
    
    const method = capability ? 'PUT' : 'POST';

    try {
      const res = await fetch(url, {
        method,
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
        {trigger || (
          <button className={!capability ? "primary" : ""}>
            {capability ? <Edit2 size={14} /> : <><Plus size={18} style={{ marginRight: '0.5rem' }} /> New Capability</>}
          </button>
        )}
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 50 }} />
        <Dialog.Content style={{ 
          position: 'fixed', 
          top: '50%', 
          left: '50%', 
          transform: 'translate(-50%, -50%)',
          width: '90vw',
          maxWidth: '400px',
          background: 'white',
          padding: '1.5rem',
          borderRadius: 'var(--radius)',
          zIndex: 100
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '1rem' }}>
            <Dialog.Title style={{ fontWeight: 600 }}>
              {capability ? 'Edit Capability' : 'Add New Capability'}
            </Dialog.Title>
            <Dialog.Close asChild>
              <button style={{ border: 'none', height: 'auto', padding: '0.25rem' }}><X size={18} /></button>
            </Dialog.Close>
          </div>
          
          <form onSubmit={handleSubmit}>
            <div className="field">
              <label className="label">Name</label>
              <input name="name" required defaultValue={capability?.name} placeholder="e.g. Finance" />
            </div>
            <div className="field">
              <label className="label">Description</label>
              <textarea name="description" rows={3} defaultValue={capability?.description} placeholder="What does this capability represent?" />
            </div>
            <div style={{ marginTop: '1.5rem', display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
              <Dialog.Close asChild>
                <button type="button">Cancel</button>
              </Dialog.Close>
              <button type="submit" className="primary" disabled={loading}>
                {loading ? 'Saving...' : (capability ? 'Save Changes' : 'Create Capability')}
              </button>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
};
