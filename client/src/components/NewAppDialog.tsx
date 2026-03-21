import React, { useState, useEffect } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { X, Plus, Trash2, CheckCircle2 } from 'lucide-react';

interface Application {
  id: string;
  name: string;
}

interface Capability {
  id: string;
  name: string;
}

interface Props {
  onSuccess: () => void;
}

export const NewAppDialog = ({ onSuccess }: Props) => {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [apps, setApps] = useState<Application[]>([]);
  const [capabilities, setCapabilities] = useState<Capability[]>([]);
  const [picklists, setPicklists] = useState<any[]>([]);
  const [selectedCapIds, setSelectedCapIds] = useState<string[]>([]);
  const [relations, setRelations] = useState<{ targetId: string; type: string; name: string }[]>([]);

  useEffect(() => {
    if (open) {
      fetch('/api/applications')
        .then(res => res.json())
        .then(data => setApps(data));
      
      fetch('/api/capabilities?flat=true')
        .then(res => res.json())
        .then(data => setCapabilities(data));

      fetch('/api/picklists')
        .then(res => res.json())
        .then(data => setPicklists(data));
    }
  }, [open]);

  const lifecycleOptions = picklists?.find(p => p.name === 'lifecycle')?.options || [];
  const ownerOptions = picklists?.find(p => p.name === 'owner')?.options || [];
  const relationTypeOptions = picklists?.find(p => p.name === 'relation_type')?.options || [];

  const addRelation = () => {
    setRelations([...relations, { targetId: '', type: relationTypeOptions[0]?.value || 'API', name: '' }]);
  };

  const removeRelation = (index: number) => {
    setRelations(relations.filter((_, i) => i !== index));
  };

  const updateRelation = (index: number, field: 'targetId' | 'type' | 'name', value: string) => {
    const newRelations = [...relations];
    newRelations[index] = { ...newRelations[index], [field]: value };
    setRelations(newRelations);
  };

  const toggleCapability = (id: string) => {
    setSelectedCapIds(prev => 
      prev.includes(id) ? prev.filter(c => c !== id) : [...prev, id]
    );
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setLoading(true);
    const formData = new FormData(e.currentTarget);
    const appData = {
      name: formData.get('name') as string,
      description: formData.get('description') as string,
      owner: formData.get('owner') as string,
      lifecycle: formData.get('lifecycle') as string,
      capabilityIds: selectedCapIds,
    };

    try {
      const appRes = await fetch('/api/applications', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(appData),
      });

      if (appRes.ok) {
        const newApp = await appRes.json();
        
        const validRelations = relations.filter(r => r.targetId);
        await Promise.all(validRelations.map(rel => 
          fetch('/api/integrations', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              sourceAppId: newApp.id,
              targetAppId: rel.targetId,
              type: rel.type,
              name: rel.name || `Relation from ${newApp.name}`
            }),
          })
        ));

        setOpen(false);
        setRelations([]);
        setSelectedCapIds([]);
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
        <button className="primary">New Application</button>
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 50 }} />
        <Dialog.Content style={{ 
          position: 'fixed', 
          top: '50%', 
          left: '50%', 
          transform: 'translate(-50%, -50%)',
          width: '90vw',
          maxWidth: '600px',
          maxHeight: '85vh',
          overflowY: 'auto',
          background: 'var(--card)',
          color: 'var(--card-foreground)',
          padding: '1.5rem',
          borderRadius: 'var(--radius)',
          zIndex: 100,
          border: '1px solid var(--border)'
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '1rem' }}>
            <Dialog.Title style={{ fontWeight: 600 }}>Add New Application</Dialog.Title>
            <Dialog.Close asChild>
              <button style={{ border: 'none', height: 'auto', padding: '0.25rem', background: 'transparent' }}><X size={18} /></button>
            </Dialog.Close>
          </div>
          <Dialog.Description style={{ display: 'none' }}>
            Create a new application and link it to business capabilities and other systems.
          </Dialog.Description>
          
          <form onSubmit={handleSubmit}>
            <div className="field">
              <label className="label">Name</label>
              <input name="name" required placeholder="e.g. ERP System" />
            </div>
            <div className="field">
              <label className="label">Description</label>
              <textarea name="description" rows={2} placeholder="What does this app do?" />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
              <div className="field">
                <label className="label">Owner</label>
                <select name="owner">
                  <option value="">Select owner...</option>
                  {ownerOptions.map((o: any) => <option key={o.id} value={o.value}>{o.label}</option>)}
                </select>
              </div>
              <div className="field">
                <label className="label">Lifecycle</label>
                <select name="lifecycle">
                  {lifecycleOptions.map((opt: any) => (
                    <option key={opt.id} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
              </div>
            </div>

            <div style={{ marginTop: '1.5rem', borderTop: '1px solid var(--border)', paddingTop: '1rem' }}>
              <label className="label">Business Capabilities</label>
              <div style={{ 
                display: 'grid', 
                gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', 
                gap: '0.5rem', 
                marginTop: '0.5rem',
                maxHeight: '120px',
                overflowY: 'auto',
                padding: '0.5rem',
                background: 'var(--muted)',
                borderRadius: 'var(--radius)'
              }}>
                {capabilities.map(cap => {
                  const isSelected = selectedCapIds.includes(cap.id);
                  return (
                    <button
                      key={cap.id}
                      type="button"
                      onClick={() => toggleCapability(cap.id)}
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
                      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{cap.name}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            <div style={{ marginTop: '1.5rem', borderTop: '1px solid var(--border)', paddingTop: '1rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                <label className="label">Outgoing Relations (Dependencies)</label>
                <button type="button" onClick={addRelation} style={{ height: '1.75rem', padding: '0 0.5rem', fontSize: '0.75rem' }}>
                  <Plus size={14} style={{ marginRight: '0.25rem' }} /> Add
                </button>
              </div>
              
              {relations.map((rel, index) => (
                <div key={index} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 100px 40px', gap: '0.5rem', marginBottom: '0.5rem' }}>
                  <input 
                    value={rel.name}
                    onChange={(e) => updateRelation(index, 'name', e.target.value)}
                    placeholder="Relation Name"
                    style={{ marginTop: 0 }}
                  />
                  <select 
                    value={rel.targetId} 
                    onChange={(e) => updateRelation(index, 'targetId', e.target.value)}
                    style={{ marginTop: 0 }}
                  >
                    <option value="">Target...</option>
                    {apps.map(app => (
                      <option key={app.id} value={app.id}>{app.name}</option>
                    ))}
                  </select>
                  <select 
                    value={rel.type} 
                    onChange={(e) => updateRelation(index, 'type', e.target.value)}
                    style={{ marginTop: 0 }}
                  >
                    {relationTypeOptions.map((opt: any) => (
                      <option key={opt.id} value={opt.value}>{opt.label}</option>
                    ))}
                  </select>
                  <button type="button" onClick={() => removeRelation(index)} style={{ border: 'none', color: 'var(--destructive)', background: 'transparent' }}>
                    <Trash2 size={16} />
                  </button>
                </div>
              ))}
            </div>

            <div style={{ marginTop: '2rem', display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
              <Dialog.Close asChild>
                <button type="button">Cancel</button>
              </Dialog.Close>
              <button type="submit" className="primary" disabled={loading}>
                {loading ? 'Saving...' : 'Create Application'}
              </button>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
};
