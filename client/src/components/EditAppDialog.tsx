import React, { useState, useEffect } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { X, Edit2, Plus, Trash2, CheckCircle2, ArrowRight, ArrowLeft, Search } from 'lucide-react';

interface Application {
  id: string;
  name: string;
}

interface Capability {
  id: string;
  name: string;
}

interface Relation {
  id?: string;
  sourceId: string;
  targetId: string;
  type: string;
  name: string;
}

interface Props {
  app: {
    id: string;
    name: string;
    description: string;
    owner: string;
    lifecycle: string;
    type: string;
    criticality: string;
    functionalFit: string;
    technicalFit: string;
    metadata?: string;
    capabilities?: { id: string }[];
  };
  onSuccess: () => void;
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

export const EditAppDialog = ({ app, onSuccess, trigger, open: controlledOpen, onOpenChange }: Props) => {
  const [internalOpen, setInternalOpen] = useState(false);
  const open = controlledOpen !== undefined ? controlledOpen : internalOpen;
  const setOpen = onOpenChange || setInternalOpen;
  
  const [loading, setLoading] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [apps, setApps] = useState<Application[]>([]);
  const [capabilities, setCapabilities] = useState<Capability[]>([]);
  const [picklists, setPicklists] = useState<any[]>([]);
  const [metaDefs, setMetaDefs] = useState<any[]>([]);
  
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    owner: '',
    type: '',
    lifecycle: '',
    criticality: '3',
    functionalFit: '3',
    technicalFit: '3'
  });
  const [selectedCapIds, setSelectedCapIds] = useState<string[]>([]);
  const [capSearch, setCapSearch] = useState('');
  const [outgoingRelations, setOutgoingRelations] = useState<Relation[]>([]);
  const [incomingRelations, setIncomingRelations] = useState<Relation[]>([]);
  const [dynamicValues, setDynamicValues] = useState<Record<string, any>>({});

  useEffect(() => {
    if (open) {
      setFormData({
        name: app.name || '',
        description: app.description || '',
        owner: app.owner || '',
        type: app.type || '',
        lifecycle: app.lifecycle || '',
        criticality: app.criticality || '3',
        functionalFit: app.functionalFit || '3',
        technicalFit: app.technicalFit || '3'
      });

      if (app.capabilities) {
        setSelectedCapIds(app.capabilities.map(c => c.id));
      } else {
        setSelectedCapIds([]);
      }

      try {
        setDynamicValues(app.metadata ? JSON.parse(app.metadata) : {});
      } catch (e) {
        setDynamicValues({});
      }

      fetch('/api/applications')
        .then(res => res.json())
        .then(data => setApps(data.filter((a: any) => a.id !== app.id)));

      fetch('/api/capabilities?flat=true')
        .then(res => res.json())
        .then(data => setCapabilities(data));

      fetch('/api/picklists')
        .then(res => res.json())
        .then(data => setPicklists(data));

      fetch('/api/metadata-definitions')
        .then(res => res.json())
        .then(data => setMetaDefs(data.filter((d: any) => d.entityType === 'Application')));

      fetch('/api/integrations')
        .then(res => res.json())
        .then(data => {
          const outgoing = data
            .filter((i: any) => i.sourceAppId === app.id)
            .map((i: any) => ({ id: i.id, sourceId: i.sourceAppId, targetId: i.targetAppId, type: i.type, name: i.name || '' }));
          
          const incoming = data
            .filter((i: any) => i.targetAppId === app.id)
            .map((i: any) => ({ id: i.id, sourceId: i.sourceAppId, targetId: i.targetAppId, type: i.type, name: i.name || '' }));
          
          setOutgoingRelations(outgoing);
          setIncomingRelations(incoming);
        });
    }
  }, [open, app]);

  const lifecycleOptions = picklists?.find(p => p.name === 'lifecycle')?.options || [];
  const ownerOptions = picklists?.find(p => p.name === 'owner')?.options || [];
  const appTypeOptions = picklists?.find(p => p.name === 'application_type')?.options || [];
  const techFitOptions = picklists?.find(p => p.name === 'technical_fit')?.options || [];
  const funcFitOptions = picklists?.find(p => p.name === 'functional_fit')?.options || [];
  const criticalityOptions = picklists?.find(p => p.name === 'criticality')?.options || [];
  const integrationTypeOptions = picklists?.find(p => p.name === 'integration_type')?.options || [];

  const toggleCapability = (id: string) => {
    setSelectedCapIds(prev => prev.includes(id) ? prev.filter(c => c !== id) : [...prev, id]);
  };

  const addOutgoing = () => {
    setOutgoingRelations([...outgoingRelations, { sourceId: app.id, targetId: '', type: integrationTypeOptions[0]?.value || 'API', name: '' }]);
  };

  const addIncoming = () => {
    setIncomingRelations([...incomingRelations, { sourceId: '', targetId: app.id, type: integrationTypeOptions[0]?.value || 'API', name: '' }]);
  };

  const removeRelation = async (index: number, isOutgoing: boolean) => {
    const list = isOutgoing ? outgoingRelations : incomingRelations;
    const setter = isOutgoing ? setOutgoingRelations : setIncomingRelations;
    const rel = list[index];
    if (rel.id) {
      try {
        await fetch(`/api/integrations/${rel.id}`, { method: 'DELETE' });
      } catch (err) {
        console.error('Failed to delete relation:', err);
        return;
      }
    }
    const newList = [...list];
    newList.splice(index, 1);
    setter(newList);
  };

  const updateRelation = (index: number, isOutgoing: boolean, field: keyof Relation, value: string) => {
    const list = isOutgoing ? outgoingRelations : incomingRelations;
    const setter = isOutgoing ? setOutgoingRelations : setIncomingRelations;
    const newList = [...list];
    newList[index] = { ...newList[index], [field]: value };
    setter(newList);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await fetch(`/api/applications/${app.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...formData, metadata: JSON.stringify(dynamicValues), capabilityIds: selectedCapIds }),
      });

      if (res.ok) {
        const allRels = [...outgoingRelations, ...incomingRelations];
        await Promise.all(allRels.map(rel => {
          if (rel.id) {
            return fetch(`/api/integrations/${rel.id}`, {
              method: 'PUT',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ name: rel.name, type: rel.type, sourceAppId: rel.sourceId, targetAppId: rel.targetId }),
            });
          } else if (rel.sourceId && rel.targetId) {
            return fetch('/api/integrations', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ sourceAppId: rel.sourceId, targetAppId: rel.targetId, type: rel.type, name: rel.name || 'New Relation' }),
            });
          }
          return Promise.resolve();
        }));
        setOpen(false);
        onSuccess();
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteApp = async () => {
    if (!confirm(`Are you sure you want to delete "${app.name}"? This will also remove all its relations.`)) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/applications/${app.id}`, { method: 'DELETE' });
      if (res.ok) { setOpen(false); onSuccess(); }
    } catch (err) { console.error(err); } finally { setDeleting(false); }
  };

  const filteredCaps = capabilities.filter(cap => 
    cap.name.toLowerCase().includes(capSearch.toLowerCase()) || 
    selectedCapIds.includes(cap.id)
  );

  const standardFieldNames = ['criticality', 'functionalFit', 'technicalFit'];
  const otherMetaDefs = metaDefs.filter(d => !standardFieldNames.includes(d.fieldName));

  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      {trigger && <Dialog.Trigger asChild>{trigger}</Dialog.Trigger>}
      {!trigger && controlledOpen === undefined && (
        <Dialog.Trigger asChild>
          <button style={{ border: 'none', height: '2rem', width: '2rem', padding: 0, background: 'transparent' }}><Edit2 size={14} /></button>
        </Dialog.Trigger>
      )}
      <Dialog.Portal>
        <Dialog.Overlay style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 100 }} />
        <Dialog.Content style={{ 
          position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%, -50%)',
          width: '95vw', maxWidth: '1000px', maxHeight: '95vh', overflowY: 'auto',
          background: 'var(--card)', color: 'var(--card-foreground)', padding: '1.25rem',
          borderRadius: 'var(--radius)', zIndex: 150, border: '1px solid var(--border)'
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '1rem' }}>
            <Dialog.Title style={{ fontWeight: 600, fontSize: '1.125rem', color: 'var(--primary)', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <Edit2 size={18} /> Editing: {app.name}
            </Dialog.Title>
            <Dialog.Close asChild><button style={{ border: 'none', height: 'auto', padding: '0.25rem', background: 'transparent' }}><X size={18} /></button></Dialog.Close>
          </div>
          <Dialog.Description style={{ display: 'none' }}>Edit application details.</Dialog.Description>
          
          <form onSubmit={handleSubmit}>
            <div style={{ display: 'grid', gridTemplateColumns: '350px 1fr', gap: '1.5rem', alignItems: 'start' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                <div className="field"><label className="label">Name</label><input name="name" required value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} style={{ padding: '0.4rem 0.6rem' }} /></div>
                <div className="field"><label className="label">Description</label><textarea name="description" rows={2} value={formData.description} onChange={e => setFormData({...formData, description: e.target.value})} style={{ padding: '0.4rem 0.6rem' }} /></div>
                
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                  <div className="field"><label className="label">Owner</label><select name="owner" value={formData.owner} onChange={e => setFormData({...formData, owner: e.target.value})} style={{ padding: '0.4rem 0.6rem' }}><option value="">Owner...</option>{ownerOptions.map((o: any) => <option key={o.id} value={o.value}>{o.label}</option>)}</select></div>
                  <div className="field"><label className="label">Type</label><select name="type" value={formData.type} onChange={e => setFormData({...formData, type: e.target.value})} style={{ padding: '0.4rem 0.6rem' }}><option value="">Type...</option>{appTypeOptions.map((o: any) => <option key={o.id} value={o.value}>{o.label}</option>)}</select></div>
                </div>
                
                <div className="field"><label className="label">Lifecycle</label><select name="lifecycle" value={formData.lifecycle} onChange={e => setFormData({...formData, lifecycle: e.target.value})} style={{ padding: '0.4rem 0.6rem' }}>{lifecycleOptions.map((opt: any) => (<option key={opt.id} value={opt.value}>{opt.label}</option>))}</select></div>

                <div style={{ marginTop: '0.5rem', display: 'flex', flexDirection: 'column', gap: '0.75rem', background: 'var(--muted)', padding: '0.75rem', borderRadius: 'var(--radius)' }}>
                  <div className="field" style={{ margin: 0 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                      <label className="label" style={{ margin: 0, fontSize: '0.7rem' }}>Business Criticality</label>
                      <span style={{ fontSize: '0.7rem', fontWeight: 700, color: criticalityOptions.find(o => o.value === formData.criticality)?.color }}>
                        {criticalityOptions.find(o => o.value === formData.criticality)?.label}
                      </span>
                    </div>
                    <input type="range" min="1" max="5" step="1" style={{ background: getScaleGradient('importance'), height: '6px' }} value={formData.criticality} onChange={e => setFormData({...formData, criticality: e.target.value})} />
                  </div>

                  <div className="field" style={{ margin: 0 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                      <label className="label" style={{ margin: 0, fontSize: '0.7rem' }}>Functional Fit</label>
                      <span style={{ fontSize: '0.7rem', fontWeight: 700, color: funcFitOptions.find(o => o.value === formData.functionalFit)?.color }}>
                        {funcFitOptions.find(o => o.value === formData.functionalFit)?.label}
                      </span>
                    </div>
                    <input type="range" min="1" max="5" step="1" style={{ background: getScaleGradient('bad-good'), height: '6px' }} value={formData.functionalFit} onChange={e => setFormData({...formData, functionalFit: e.target.value})} />
                  </div>

                  <div className="field" style={{ margin: 0 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                      <label className="label" style={{ margin: 0, fontSize: '0.7rem' }}>Technical Fit</label>
                      <span style={{ fontSize: '0.7rem', fontWeight: 700, color: techFitOptions.find(o => o.value === formData.technicalFit)?.color }}>
                        {techFitOptions.find(o => o.value === formData.technicalFit)?.label}
                      </span>
                    </div>
                    <input type="range" min="1" max="5" step="1" style={{ background: getScaleGradient('bad-good'), height: '6px' }} value={formData.technicalFit} onChange={e => setFormData({...formData, technicalFit: e.target.value})} />
                  </div>
                </div>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                      <label className="label" style={{ fontSize: '0.75rem', margin: 0 }}>Capabilities</label>
                      <div style={{ position: 'relative', width: '140px' }}>
                        <Search size={12} style={{ position: 'absolute', left: '0.4rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--muted-foreground)' }} />
                        <input 
                          placeholder="Filter..." 
                          value={capSearch}
                          onChange={e => setCapSearch(e.target.value)}
                          style={{ height: '1.5rem', padding: '0 0.4rem 0 1.5rem', fontSize: '0.65rem', marginTop: 0 }}
                        />
                      </div>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '0.25rem', maxHeight: '180px', overflowY: 'auto', padding: '0.4rem', background: 'var(--muted)', borderRadius: 'var(--radius)' }}>
                      {filteredCaps.length > 0 ? filteredCaps.map(cap => (
                        <button key={cap.id} type="button" onClick={() => toggleCapability(cap.id)} style={{ height: 'auto', padding: '0.3rem 0.5rem', fontSize: '0.7rem', justifyContent: 'flex-start', background: selectedCapIds.includes(cap.id) ? 'var(--primary)' : 'var(--background)', color: selectedCapIds.includes(cap.id) ? 'var(--primary-foreground)' : 'var(--foreground)' }}>
                          {selectedCapIds.includes(cap.id) && <CheckCircle2 size={10} style={{ marginRight: '0.25rem' }} />}
                          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{cap.name}</span>
                        </button>
                      )) : <div style={{ fontSize: '0.7rem', color: 'var(--muted-foreground)', textAlign: 'center', padding: '1rem' }}>No matches</div>}
                    </div>
                  </div>

                  <div>
                    <label className="label" style={{ fontSize: '0.75rem' }}>Custom Info</label>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', maxHeight: '180px', overflowY: 'auto', padding: '0.4rem', background: 'var(--muted)', borderRadius: 'var(--radius)' }}>
                      {otherMetaDefs.length > 0 ? otherMetaDefs.map(def => (
                        <div key={def.id}>
                          <span style={{ fontSize: '0.65rem', fontWeight: 700, color: 'var(--muted-foreground)', textTransform: 'uppercase' }}>{def.label}</span>
                          {def.fieldType === 'range' ? (
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                              <input type="range" min={def.min ?? 0} max={def.max ?? 100} style={{ background: getScaleGradient(def.scaleType), height: '4px' }} value={dynamicValues[def.fieldName] ?? def.min ?? 0} onChange={e => setDynamicValues({...dynamicValues, [def.fieldName]: Number(e.target.value)})} />
                              <span style={{ fontSize: '0.7rem', fontWeight: 700, minWidth: '1.25rem' }}>{dynamicValues[def.fieldName] ?? def.min ?? 0}</span>
                            </div>
                          ) : (
                            <input style={{ marginTop: '2px', padding: '0.25rem 0.4rem', fontSize: '0.75rem' }} value={dynamicValues[def.fieldName] || ''} onChange={e => setDynamicValues({...dynamicValues, [def.fieldName]: e.target.value})} />
                          )}
                        </div>
                      )) : <div style={{ fontSize: '0.7rem', color: 'var(--muted-foreground)', textAlign: 'center', padding: '1rem' }}>No custom fields</div>}
                    </div>
                  </div>
                </div>

                <div style={{ borderTop: '1px solid var(--border)', paddingTop: '0.75rem' }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem' }}>
                    <div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                        <label className="label" style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', textTransform: 'uppercase', fontSize: '0.65rem', color: 'var(--muted-foreground)', margin: 0 }}><ArrowRight size={12} /> Providing Data</label>
                        <button type="button" onClick={addOutgoing} style={{ height: '1.5rem', padding: '0 0.4rem', fontSize: '0.65rem' }}><Plus size={12} /> Add</button>
                      </div>
                      {outgoingRelations.map((rel, i) => (
                        <div key={rel.id || `out-${i}`} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 24px', gap: '0.25rem', marginBottom: '0.25rem' }}>
                          <input value={rel.name} onChange={e => updateRelation(i, true, 'name', e.target.value)} placeholder="Integration..." style={{ fontSize: '0.7rem', padding: '0.25rem' }} />
                          <select value={rel.targetId} onChange={e => updateRelation(i, true, 'targetId', e.target.value)} style={{ fontSize: '0.7rem', padding: '0.25rem' }}>
                            <option value="">Target...</option>
                            {apps.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                          </select>
                          <button type="button" onClick={() => removeRelation(i, true)} style={{ border: 'none', color: 'var(--destructive)', background: 'transparent', padding: 0 }}><Trash2 size={12} /></button>
                        </div>
                      ))}
                    </div>
                    <div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                        <label className="label" style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', textTransform: 'uppercase', fontSize: '0.65rem', color: 'var(--muted-foreground)', margin: 0 }}><ArrowLeft size={12} /> Consuming Data</label>
                        <button type="button" onClick={addIncoming} style={{ height: '1.5rem', padding: '0 0.4rem', fontSize: '0.65rem' }}><Plus size={12} /> Add</button>
                      </div>
                      {incomingRelations.map((rel, i) => (
                        <div key={rel.id || `in-${i}`} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 24px', gap: '0.25rem', marginBottom: '0.25rem' }}>
                          <input value={rel.name} onChange={e => updateRelation(i, false, 'name', e.target.value)} placeholder="Integration..." style={{ fontSize: '0.7rem', padding: '0.25rem' }} />
                          <select value={rel.sourceId} onChange={e => updateRelation(i, false, 'sourceId', e.target.value)} style={{ fontSize: '0.7rem', padding: '0.25rem' }}>
                            <option value="">Source...</option>
                            {apps.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                          </select>
                          <button type="button" onClick={() => removeRelation(i, false)} style={{ border: 'none', color: 'var(--destructive)', background: 'transparent', padding: 0 }}><Trash2 size={12} /></button>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div style={{ marginTop: '1.25rem', display: 'flex', gap: '0.5rem', justifyContent: 'flex-end', borderTop: '1px solid var(--border)', paddingTop: '1rem' }}>
              <button type="button" onClick={handleDeleteApp} disabled={deleting} style={{ marginRight: 'auto', background: 'transparent', color: 'var(--destructive)', borderColor: 'var(--destructive)', height: '2rem', fontSize: '0.75rem' }}>Delete Application</button>
              <Dialog.Close asChild><button type="button" style={{ height: '2rem', fontSize: '0.75rem' }}>Cancel</button></Dialog.Close>
              <button type="submit" className="primary" disabled={loading} style={{ height: '2rem', fontSize: '0.75rem' }}>Save Changes</button>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
};
