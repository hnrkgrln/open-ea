import React, { useState, useEffect } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { X, Edit2, Plus, CheckCircle2, Trash2 } from 'lucide-react';

interface Capability {
  id: string;
  name: string;
  description?: string;
  parentId?: string | null;
  metadata?: string;
  criticality: string;
}

interface Application {
  id: string;
  name: string;
}

interface Props {
  capability?: Capability;
  onSuccess: () => void;
  parentId?: string | null;
  trigger?: React.ReactNode;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

const getScaleGradient = (scaleType: string) => {
  switch (scaleType) {
    case 'good-bad': return 'linear-gradient(to right, #2b8a3e, #fab005, #c92a2a)';
    case 'bad-good': return 'linear-gradient(to right, #c92a2a, #fab005, #2b8a3e)';
    case 'low-high': return 'linear-gradient(to right, #e7f5ff, #1864ab)';
    case 'importance': return 'linear-gradient(to right, #f1f3f5, #5f3dc4)';
    default: return 'linear-gradient(to right, var(--accent), var(--primary))';
  }
};

export const EditCapabilityDialog = ({ capability, onSuccess, parentId, trigger, open: controlledOpen, onOpenChange }: Props) => {
  const [internalOpen, setInternalOpen] = useState(false);
  const open = controlledOpen !== undefined ? controlledOpen : internalOpen;
  const setOpen = onOpenChange || setInternalOpen;

  const [loading, setLoading] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [allCapabilities, setAllCapabilities] = useState<Capability[]>([]);
  const [allApps, setAllApps] = useState<Application[]>([]);
  const [picklists, setPicklists] = useState<any[]>([]);
  const [metaDefs, setMetaDefs] = useState<any[]>([]);
  
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    parentId: '' as string | null,
    criticality: '3'
  });
  const [selectedAppIds, setSelectedAppIds] = useState<string[]>([]);
  const [dynamicValues, setDynamicValues] = useState<Record<string, any>>({});

  useEffect(() => {
    if (open) {
      setFormData({
        name: capability?.name || '',
        description: capability?.description || '',
        parentId: parentId || capability?.parentId || '',
        criticality: capability?.criticality || '3'
      });

      try {
        setDynamicValues(capability?.metadata ? JSON.parse(capability.metadata) : {});
      } catch (e) {
        setDynamicValues({});
      }

      fetch('/api/capabilities?flat=true')
        .then(res => res.json())
        .then(data => setAllCapabilities(data.filter((c: any) => c.id !== capability?.id)));

      fetch('/api/applications')
        .then(res => res.json())
        .then(data => setAllApps(data));

      fetch('/api/picklists')
        .then(res => res.json())
        .then(data => setPicklists(data));

      fetch('/api/metadata-definitions')
        .then(res => res.json())
        .then(data => setMetaDefs(data.filter((d: any) => d.entityType === 'Capability')));

      if (capability?.id) {
        fetch('/api/applications')
          .then(res => res.json())
          .then(apps => {
            const linked = apps.filter((a: any) => a.capabilities?.some((c: any) => c.id === capability.id));
            setSelectedAppIds(linked.map((a: any) => a.id));
          });
      }
    }
  }, [open, capability, parentId]);

  const criticalityOptions = picklists?.find(p => p.name === 'criticality')?.options || [];

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    const url = capability?.id ? `/api/capabilities/${capability.id}` : '/api/capabilities';
    const method = capability?.id ? 'PUT' : 'POST';

    try {
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...formData,
          parentId: formData.parentId === '' ? null : formData.parentId,
          metadata: JSON.stringify(dynamicValues),
          applicationIds: selectedAppIds
        }),
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

  const handleDelete = async () => {
    if (!capability) return;
    if (!confirm(`Are you sure you want to delete "${capability.name}"? This will also delete all sub-capabilities.`)) return;
    
    setDeleting(true);
    try {
      const res = await fetch(`/api/capabilities/${capability.id}`, {
        method: 'DELETE'
      });
      if (res.ok) {
        setOpen(false);
        onSuccess();
      }
    } catch (err) {
      console.error(err);
    } finally {
      setDeleting(false);
    }
  };

  const toggleApp = (id: string) => {
    setSelectedAppIds(prev => prev.includes(id) ? prev.filter(a => a !== id) : [...prev, id]);
  };

  const standardFieldNames = ['criticality'];
  const otherMetaDefs = metaDefs.filter(d => !standardFieldNames.includes(d.fieldName));

  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      {trigger && <Dialog.Trigger asChild>{trigger}</Dialog.Trigger>}
      {!trigger && (
        <Dialog.Trigger asChild>
          <button className="primary"><Plus size={18} style={{ marginRight: '0.5rem' }} /> New Capability</button>
        </Dialog.Trigger>
      )}
      <Dialog.Portal>
        <Dialog.Overlay style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 100 }} />
        <Dialog.Content style={{ 
          position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%, -50%)',
          width: '90vw', maxWidth: '550px', maxHeight: '85vh', overflowY: 'auto',
          background: 'var(--card)', color: 'var(--card-foreground)', padding: '1.5rem',
          borderRadius: 'var(--radius)', zIndex: 150, border: '1px solid var(--border)'
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '1rem' }}>
            <Dialog.Title style={{ fontWeight: 600 }}>{capability ? 'Edit' : 'New'} Capability</Dialog.Title>
            <Dialog.Close asChild><button style={{ border: 'none', height: 'auto', padding: '0.25rem', background: 'transparent' }}><X size={18} /></button></Dialog.Close>
          </div>
          <Dialog.Description style={{ display: 'none' }}>
            Define business functions and link them to applications.
          </Dialog.Description>
          
          <form onSubmit={handleSubmit}>
            <div className="field"><label className="label">Name</label><input name="name" required value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} placeholder="e.g. Sales Management" /></div>
            <div className="field"><label className="label">Description</label><textarea name="description" rows={3} value={formData.description} onChange={e => setFormData({...formData, description: e.target.value})} placeholder="Describe this business capability..." /></div>
            
            <div className="field">
              <label className="label">Parent Capability</label>
              <select name="parentId" value={formData.parentId || ''} onChange={e => setFormData({...formData, parentId: e.target.value || null})}>
                <option value="">None (Root Capability)</option>
                {allCapabilities.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>

            {/* Standard Picklist-based Sliders */}
            <div style={{ marginTop: '1.5rem', borderTop: '1px solid var(--border)', paddingTop: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
              <div className="field">
                <label className="label" style={{ display: 'flex', justifyContent: 'space-between' }}>
                  Business Criticality 
                  <span style={{ fontSize: '0.7rem', color: criticalityOptions.find(o => o.value === formData.criticality)?.color }}>
                    {criticalityOptions.find(o => o.value === formData.criticality)?.label}
                  </span>
                </label>
                <input type="range" min="1" max="5" step="1" style={{ background: getScaleGradient('importance') }} value={formData.criticality} onChange={e => setFormData({...formData, criticality: e.target.value})} />
              </div>
            </div>

            {/* Dynamic Meta-model Fields */}
            {otherMetaDefs.length > 0 && (
              <div style={{ marginTop: '1.5rem', borderTop: '1px solid var(--border)', paddingTop: '1rem' }}>
                <h3 style={{ fontSize: '0.875rem', fontWeight: 600, marginBottom: '1rem' }}>Additional Capability Metadata</h3>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                  {otherMetaDefs.map(def => (
                    <div key={def.id}>
                      <label className="label">{def.label}</label>
                      {def.fieldType === 'range' ? (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                          <input type="range" min={def.min ?? 0} max={def.max ?? 100} style={{ background: getScaleGradient(def.scaleType) }} value={dynamicValues[def.fieldName] ?? def.min ?? 0} onChange={e => setDynamicValues({...dynamicValues, [def.fieldName]: Number(e.target.value)})} />
                          <span style={{ fontSize: '0.875rem', fontWeight: 700 }}>{dynamicValues[def.fieldName] ?? def.min ?? 0}</span>
                        </div>
                      ) : (
                        <input value={dynamicValues[def.fieldName] || ''} onChange={e => setDynamicValues({...dynamicValues, [def.fieldName]: e.target.value})} />
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div style={{ marginTop: '1.5rem', borderTop: '1px solid var(--border)', paddingTop: '1rem' }}>
              <label className="label">Linked Applications</label>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem', maxHeight: '150px', overflowY: 'auto', padding: '0.5rem', background: 'var(--muted)', borderRadius: 'var(--radius)' }}>
                {allApps.map(app => (
                  <button key={app.id} type="button" onClick={() => toggleApp(app.id)} style={{ height: 'auto', padding: '0.4rem', fontSize: '0.75rem', justifyContent: 'flex-start', background: selectedAppIds.includes(app.id) ? 'var(--primary)' : 'var(--background)', color: selectedAppIds.includes(app.id) ? 'var(--primary-foreground)' : 'var(--foreground)' }}>
                    {selectedAppIds.includes(app.id) && <CheckCircle2 size={12} style={{ marginRight: '0.25rem' }} />}
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{app.name}</span>
                  </button>
                ))}
              </div>
            </div>

            <div style={{ marginTop: '2rem', display: 'flex', gap: '0.5rem', justifyContent: 'flex-end', borderTop: '1px solid var(--border)', paddingTop: '1.5rem' }}>
              {capability && (
                <button type="button" onClick={handleDelete} disabled={deleting} style={{ marginRight: 'auto', background: 'transparent', color: 'var(--destructive)', borderColor: 'var(--destructive)' }}>
                  <Trash2 size={16} style={{ marginRight: '0.5rem' }} /> {deleting ? 'Deleting...' : 'Delete Capability'}
                </button>
              )}
              <Dialog.Close asChild><button type="button">Cancel</button></Dialog.Close>
              <button type="submit" className="primary" disabled={loading}>{loading ? 'Saving...' : (capability ? 'Save Changes' : 'Create Capability')}</button>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
};
