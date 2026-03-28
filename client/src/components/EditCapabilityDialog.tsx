import React, { useState, useEffect } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { X, Edit2, CheckCircle2, Trash2, Search, Boxes, Info, Share2, Database } from 'lucide-react';

const safeJsonParse = (str: string | null | undefined, fallback: any = {}) => {
  if (!str) return fallback;
  try {
    return JSON.parse(str);
  } catch (e) {
    return fallback;
  }
};

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
    case 'importance': return 'linear-gradient(to right, #dee2e6, #7048e8)';
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
  const [appSearch, setAppSearch] = useState('');
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
        setDynamicValues(safeJsonParse(capability?.metadata));
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
      const res = await fetch(`/api/capabilities/${capability.id}`, { method: 'DELETE' });
      if (res.ok) { setOpen(false); onSuccess(); }
    } catch (err) { console.error(err); } finally { setDeleting(false); }
  };

  const toggleApp = (id: string) => {
    setSelectedAppIds(prev => prev.includes(id) ? prev.filter(a => a !== id) : [...prev, id]);
  };

  const filteredApps = allApps.filter(app => 
    app.name.toLowerCase().includes(appSearch.toLowerCase()) || 
    selectedAppIds.includes(app.id)
  );

  const standardFieldNames = ['criticality'];
  const otherMetaDefs = metaDefs.filter(d => !standardFieldNames.includes(d.fieldName));

  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      {trigger && <Dialog.Trigger asChild>{trigger}</Dialog.Trigger>}
      <Dialog.Portal>
        <Dialog.Overlay style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', backdropFilter: 'blur(8px)', zIndex: 100 }} />
        <Dialog.Content style={{ 
          position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%, -50%)',
          width: '90vw', maxWidth: '800px', maxHeight: '90vh', overflow: 'hidden',
          background: 'var(--card)', color: 'var(--card-foreground)', 
          borderRadius: '32px', zIndex: 150, border: '1px solid var(--border)',
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
          display: 'flex', flexDirection: 'column'
        }}>
          {/* Header */}
          <div style={{ padding: '2rem 2.5rem', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'var(--muted)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '1.25rem' }}>
              <div style={{ background: 'var(--primary)', color: 'var(--primary-foreground)', width: '48px', height: '48px', borderRadius: '16px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Boxes size={24} />
              </div>
              <div>
                <Dialog.Title style={{ fontWeight: 800, fontSize: '1.5rem', letterSpacing: '-0.02em', margin: 0 }}>{capability ? 'Edit' : 'New'} Capability</Dialog.Title>
                <div style={{ fontSize: '0.8125rem', color: 'var(--muted-foreground)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Business Function Management</div>
              </div>
            </div>
            <Dialog.Close asChild>
              <button style={{ border: 'none', width: '40px', height: '40px', padding: 0, borderRadius: '12px', background: 'var(--background)' }}><X size={20} /></button>
            </Dialog.Close>
          </div>
          
          <form onSubmit={handleSubmit} style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
            <div style={{ flex: 1, overflowY: 'auto', padding: '2.5rem' }}>
              <div style={{ maxWidth: '700px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '3rem' }}>
                
                {/* SECTION: FUNCTIONAL DEFINITION */}
                <section>
                  <h3 style={{ fontSize: '0.875rem', fontWeight: 800, textTransform: 'uppercase', color: 'var(--muted-foreground)', marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                    <Info size={18} /> Functional Definition
                  </h3>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                    <div className="field" style={{ margin: 0 }}><label className="label">Capability Name</label><input name="name" required value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} style={{ padding: '0.75rem 1rem', fontSize: '1.125rem', fontWeight: 600 }} /></div>
                    <div className="field" style={{ margin: 0 }}><label className="label">Purpose & Outcome</label><textarea name="description" rows={4} value={formData.description} onChange={e => setFormData({...formData, description: e.target.value})} style={{ padding: '0.75rem 1rem', lineHeight: '1.6', fontSize: '1rem' }} placeholder="What business outcome does this function deliver?" /></div>
                    
                    <div className="field" style={{ margin: 0 }}>
                      <label className="label">Parent Capability (Hierarchy)</label>
                      <select name="parentId" value={formData.parentId || ''} onChange={e => setFormData({...formData, parentId: e.target.value || null})} style={{ padding: '0.75rem' }}>
                        <option value="">None (Root Capability)</option>
                        {allCapabilities.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                      </select>
                    </div>
                  </div>
                </section>

                {/* SECTION: STRATEGIC IMPORTANCE */}
                <section style={{ background: 'var(--muted)', padding: '2rem', borderRadius: '24px', border: '1px solid var(--border)' }}>
                  <h3 style={{ fontSize: '0.875rem', fontWeight: 800, textTransform: 'uppercase', color: 'var(--muted-foreground)', marginBottom: '2rem', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                    <Share2 size={18} /> Strategic Importance
                  </h3>
                  <div className="field" style={{ margin: 0 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: '12px' }}>
                      <div>
                        <label className="label" style={{ margin: 0, fontSize: '1rem', fontWeight: 700 }}>Business Criticality</label>
                        <div style={{ fontSize: '0.75rem', color: 'var(--muted-foreground)', marginTop: '2px' }}>How vital is this capability to the organization?</div>
                      </div>
                      <div style={{ fontSize: '0.875rem', fontWeight: 800, color: criticalityOptions.find((o: any) => o.value === formData.criticality)?.color, background: 'var(--card)', padding: '0.2rem 0.6rem', borderRadius: '6px', border: '1px solid var(--border)' }}>
                        {criticalityOptions.find((o: any) => o.value === formData.criticality)?.label}
                      </div>
                    </div>
                    <input type="range" min="1" max="5" step="1" style={{ background: getScaleGradient('importance'), height: '10px' }} value={formData.criticality} onChange={e => setFormData({...formData, criticality: e.target.value})} />
                  </div>
                </section>

                {/* SECTION: SUPPORTING APPS */}
                <section>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
                    <h3 style={{ fontSize: '0.875rem', fontWeight: 800, textTransform: 'uppercase', color: 'var(--muted-foreground)', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                      <Database size={18} /> Supporting Applications
                    </h3>
                    <div style={{ position: 'relative', width: '240px' }}>
                      <Search size={16} style={{ position: 'absolute', left: '0.75rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--muted-foreground)' }} />
                      <input placeholder="Filter applications..." value={appSearch} onChange={e => setAppSearch(e.target.value)} style={{ height: '2.25rem', padding: '0 2rem 0 2.25rem', fontSize: '0.875rem', marginTop: 0, borderRadius: '10px' }} />
                      {appSearch && (
                        <button
                          type="button"
                          onClick={() => setAppSearch('')}
                          style={{
                            position: 'absolute',
                            right: '0.5rem',
                            top: '50%',
                            transform: 'translateY(-50%)',
                            border: 'none',
                            background: 'transparent',
                            padding: '0.25rem',
                            height: 'auto',
                            width: 'auto',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            color: 'var(--muted-foreground)',
                            cursor: 'pointer'
                          }}
                        >
                          <X size={14} />
                        </button>
                      )}
                    </div>
                  </div>
                  
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', maxHeight: '240px', overflowY: 'auto', padding: '1rem', background: 'var(--muted)', borderRadius: '24px', border: '1px solid var(--border)' }}>
                    {filteredApps.length > 0 ? filteredApps.map(app => (
                      <button key={app.id} type="button" onClick={() => toggleApp(app.id)} style={{ height: 'auto', padding: '0.75rem', fontSize: '0.875rem', justifyContent: 'flex-start', background: selectedAppIds.includes(app.id) ? 'var(--primary)' : 'var(--background)', color: selectedAppIds.includes(app.id) ? 'var(--primary-foreground)' : 'var(--foreground)', border: '1px solid var(--border)', borderRadius: '12px' }}>
                        {selectedAppIds.includes(app.id) && <CheckCircle2 size={14} style={{ marginRight: '0.5rem' }} />}
                        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{app.name}</span>
                      </button>
                    )) : (
                      <div style={{ gridColumn: 'span 2', textAlign: 'center', padding: '2rem', color: 'var(--muted-foreground)', fontSize: '0.875rem' }}>No matching applications found.</div>
                    )}
                  </div>
                </section>

                {/* SECTION: EXTENDED DATA */}
                {otherMetaDefs.length > 0 && (
                  <section>
                    <h3 style={{ fontSize: '0.875rem', fontWeight: 800, textTransform: 'uppercase', color: 'var(--muted-foreground)', marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                      <Edit2 size={18} /> Extended Metadata
                    </h3>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem', padding: '2rem', background: 'var(--muted)', borderRadius: '24px', border: '1px solid var(--border)' }}>
                      {otherMetaDefs.map(def => (
                        <div key={def.id}>
                          <label className="label" style={{ fontSize: '0.875rem', fontWeight: 700, marginBottom: '8px', display: 'block' }}>{def.label}</label>
                          {def.fieldType === 'range' ? (
                            <div style={{ display: 'flex', alignItems: 'center', gap: '1.25rem' }}>
                              <input type="range" min={def.min ?? 0} max={def.max ?? 100} style={{ background: getScaleGradient(def.scaleType), height: '8px' }} value={dynamicValues[def.fieldName] ?? def.min ?? 0} onChange={e => setDynamicValues({...dynamicValues, [def.fieldName]: Number(e.target.value)})} />
                              <span style={{ fontSize: '1rem', fontWeight: 800, minWidth: '2.5rem', textAlign: 'center', background: 'var(--card)', padding: '0.25rem', borderRadius: '6px', border: '1px solid var(--border)' }}>{dynamicValues[def.fieldName] ?? def.min ?? 0}</span>
                            </div>
                          ) : (
                            <input style={{ padding: '0.75rem', fontSize: '1rem', background: 'var(--background)' }} value={dynamicValues[def.fieldName] || ''} onChange={e => setDynamicValues({...dynamicValues, [def.fieldName]: e.target.value})} />
                          )}
                        </div>
                      ))}
                    </div>
                  </section>
                )}
              </div>
            </div>

            {/* Footer */}
            <div style={{ padding: '2rem 2.5rem', background: 'var(--muted)', borderTop: '1px solid var(--border)', display: 'flex', gap: '1.25rem', justifyContent: 'flex-end' }}>
              {capability && (
                <button type="button" onClick={handleDelete} disabled={deleting} style={{ marginRight: 'auto', background: 'transparent', color: 'var(--destructive)', borderColor: 'var(--destructive)', fontWeight: 700, height: '3rem' }}>
                  <Trash2 size={18} style={{ marginRight: '0.5rem' }} /> Delete Artifact
                </button>
              )}
              <Dialog.Close asChild><button type="button" style={{ fontWeight: 600, height: '3rem', padding: '0 1.5rem' }}>Discard Changes</button></Dialog.Close>
              <button type="submit" className="primary" disabled={loading} style={{ height: '3rem', padding: '0 2.5rem', fontSize: '1rem', fontWeight: 800, borderRadius: '14px', boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1)' }}>
                {loading ? 'Saving Progress...' : (capability ? 'Save Refinements' : 'Materialize Capability')}
              </button>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
};
