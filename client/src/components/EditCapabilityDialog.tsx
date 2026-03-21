import React, { useState, useEffect } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { X, Plus, Edit2, CheckCircle2 } from 'lucide-react';

interface Props {
  capability?: {
    id: string;
    name: string;
    description?: string;
    parentId?: string | null;
    applications?: { id: string }[];
  };
  parentId?: string;
  onSuccess: () => void;
  trigger?: React.ReactNode;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

export const EditCapabilityDialog = ({ capability, parentId, onSuccess, trigger, open: controlledOpen, onOpenChange }: Props) => {
  const [internalOpen, setInternalOpen] = useState(false);
  const open = controlledOpen !== undefined ? controlledOpen : internalOpen;
  const setOpen = onOpenChange || setInternalOpen;

  const [loading, setLoading] = useState(false);
  const [apps, setApps] = useState<any[]>([]);
  const [selectedAppIds, setSelectedAppIds] = useState<string[]>([]);

  useEffect(() => {
    if (open) {
      // Initialize selection from capability prop
      if (capability?.applications) {
        setSelectedAppIds(capability.applications.map(a => a.id));
      } else {
        setSelectedAppIds([]);
      }

      // Fetch all apps for selection
      fetch('/api/applications')
        .then(res => res.json())
        .then(data => setApps(data));
    }
  }, [open, capability]);

  const toggleApp = (id: string) => {
    setSelectedAppIds(prev => 
      prev.includes(id) ? prev.filter(a => a !== id) : [...prev, id]
    );
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setLoading(true);
    const formData = new FormData(e.currentTarget);
    const data = {
      name: formData.get('name'),
      description: formData.get('description'),
      parentId: parentId || capability?.parentId,
      applicationIds: selectedAppIds,
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
      {trigger && <Dialog.Trigger asChild>{trigger}</Dialog.Trigger>}
      {!trigger && controlledOpen === undefined && (
        <Dialog.Trigger asChild>
          <button className={!capability ? "primary" : ""}>
            {capability ? <Edit2 size={14} /> : <><Plus size={18} style={{ marginRight: '0.5rem' }} /> New Capability</>}
          </button>
        </Dialog.Trigger>
      )}
      <Dialog.Portal>
        <Dialog.Overlay style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 100 }} />
        <Dialog.Content style={{ 
          position: 'fixed', 
          top: '50%', 
          left: '50%', 
          transform: 'translate(-50%, -50%)',
          width: '90vw',
          maxWidth: '450px',
          maxHeight: '85vh',
          overflowY: 'auto',
          background: 'var(--card)',
          color: 'var(--card-foreground)',
          padding: '1.5rem',
          borderRadius: 'var(--radius)',
          zIndex: 150,
          border: '1px solid var(--border)'
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '1rem' }}>
            <Dialog.Title style={{ fontWeight: 600 }}>
              {capability ? 'Edit Capability' : 'Add New Capability'}
            </Dialog.Title>
            <Dialog.Close asChild>
              <button style={{ border: 'none', height: 'auto', padding: '0.25rem', background: 'transparent' }}><X size={18} /></button>
            </Dialog.Close>
          </div>
          <Dialog.Description style={{ display: 'none' }}>
            Modify business capability details and supporting applications.
          </Dialog.Description>
          
          <form onSubmit={handleSubmit}>
            <div className="field">
              <label className="label">Name</label>
              <input name="name" key={`name-${capability?.id}`} required defaultValue={capability?.name} placeholder="e.g. Finance" />
            </div>
            <div className="field">
              <label className="label">Description</label>
              <textarea name="description" key={`desc-${capability?.id}`} rows={3} defaultValue={capability?.description} placeholder="What does this capability represent?" />
            </div>

            <div style={{ marginTop: '1.5rem', borderTop: '1px solid var(--border)', paddingTop: '1rem' }}>
              <label className="label">Supporting Applications</label>
              <div style={{ 
                display: 'grid', 
                gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', 
                gap: '0.5rem', 
                marginTop: '0.5rem',
                maxHeight: '150px',
                overflowY: 'auto',
                padding: '0.5rem',
                background: 'var(--muted)',
                borderRadius: 'var(--radius)'
              }}>
                {apps.map(app => {
                  const isSelected = selectedAppIds.includes(app.id);
                  return (
                    <button
                      key={app.id}
                      type="button"
                      onClick={() => toggleApp(app.id)}
                      style={{
                        height: 'auto',
                        padding: '0.4rem 0.6rem',
                        fontSize: '0.75rem',
                        justifyContent: 'flex-start',
                        background: isSelected ? 'var(--primary)' : 'var(--background)',
                        color: isSelected ? 'var(--primary-foreground)' : 'var(--foreground)',
                        borderColor: isSelected ? 'var(--primary)' : 'var(--border)'
                      }}
                    >
                      {isSelected && <CheckCircle2 size={12} style={{ marginRight: '0.25rem' }} />}
                      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{app.name}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            <div style={{ marginTop: '2rem', display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
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
