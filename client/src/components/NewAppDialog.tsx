import React, { useState, useEffect } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { X, Plus, Trash2, CheckCircle2, ArrowRight, ArrowLeft, Search } from 'lucide-react';

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
  onSuccess: () => void;
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

export const NewAppDialog = ({ onSuccess }: Props) => {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [apps, setApps] = useState<Application[]>([]);
  const [capabilities, setCapabilities] = useState<Capability[]>([]);
  const [picklists, setPicklists] = useState<any[]>([]);
  const [metaDefs, setMetaDefs] = useState<any[]>([]);
  
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    owner: '',
    type: '',
    lifecycle: 'Planning',
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
      fetch('/api/applications')
        .then(res => res.json())
        .then(data => setApps(data));
      
      fetch('/api/capabilities?flat=true')
        .then(res => res.json())
        .then(data => setCapabilities(data));

      fetch('/api/picklists')
        .then(res => res.json())
        .then(data => setPicklists(data));

      fetch('/api/metadata-definitions')
        .then(res => res.json())
        .then(data => setMetaDefs(data.filter((d: any) => d.entityType === 'Application')));
    }
  }, [open]);

  const lifecycleOptions = picklists?.find(p => p.name === 'lifecycle')?.options || [];
  const ownerOptions = picklists?.find(p => p.name === 'owner')?.options || [];
  const appTypeOptions = picklists?.find(p => p.name === 'application_type')?.options || [];
  const relationTypeOptions = picklists?.find(p => p.name === 'relation_type')?.options || [];
  
  const techFitOptions = picklists?.find(p => p.name === 'technical_fit')?.options || [];
  const funcFitOptions = picklists?.find(p => p.name === 'functional_fit')?.options || [];
  const criticalityOptions = picklists?.find(p => p.name === 'criticality')?.options || [];

  const toggleCapability = (id: string) => {
    setSelectedCapIds(prev => prev.includes(id) ? prev.filter(c => c !== id) : [...prev, id]);
  };

  const addOutgoing = () => {
    setOutgoingRelations([...outgoingRelations, { sourceId: '', targetId: '', type: relationTypeOptions[0]?.value || 'API', name: '' }]);
  };

  const addIncoming = () => {
    setIncomingRelations([...incomingRelations, { sourceId: '', targetId: '', type: relationTypeOptions[0]?.value || 'API', name: '' }]);
  };

  const removeRelation = (index: number, isOutgoing: boolean) => {
    const setter = isOutgoing ? setOutgoingRelations : setIncomingRelations;
    const list = isOutgoing ? outgoingRelations : incomingRelations;
    setter(list.filter((_, i) => i !== index));
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
      const appRes = await fetch('/api/applications', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...formData, metadata: JSON.stringify(dynamicValues), capabilityIds: selectedCapIds }),
      });

      if (appRes.ok) {
        const newApp = await appRes.json();
        const allRels = [
          ...outgoingRelations.map(r => ({ ...r, sourceId: newApp.id })),
          ...incomingRelations.map(r => ({ ...r, targetId: newApp.id }))
        ];

        await Promise.all(allRels.filter(r => r.sourceId && r.targetId).map(rel => 
          fetch('/api/integrations', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              sourceAppId: rel.sourceId,
              targetAppId: rel.targetId,
              type: rel.type,
              name: rel.name || 'New Relation'
            }),
          })
        ));

        setOpen(false);
        setOutgoingRelations([]);
        setIncomingRelations([]);
        setSelectedCapIds([]);
        setDynamicValues({});
        setFormData({ name: '', description: '', owner: '', type: '', lifecycle: 'Planning', criticality: '3', functionalFit: '3', technicalFit: '3' });
        onSuccess();
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const filteredCaps = capabilities.filter(cap => 
    cap.name.toLowerCase().includes(capSearch.toLowerCase()) || 
    selectedCapIds.includes(cap.id)
  );

  const standardFieldNames = ['criticality', 'functionalFit', 'technicalFit'];
  const otherMetaDefs = metaDefs.filter(d => !standardFieldNames.includes(d.fieldName));

  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Trigger asChild><button className="primary">New Application</button></Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 100 }} />
        <Dialog.Content style={{ 
          position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%, -50%)',
          width: '95vw', maxWidth: '1000px', maxHeight: '95vh', overflowY: 'auto',
          background: 'var(--card)', color: 'var(--card-foreground)', padding: '1.25rem',
          borderRadius: 'var(--radius)', zIndex: 150, border: '1px solid var(--border)'
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '1rem' }}>
            <Dialog.Title style={{ fontWeight: 600, fontSize: '1.125rem' }}>Add New Application</Dialog.Title>
            <Dialog.Close asChild><button style={{ border: 'none', height: 'auto', padding: '0.25rem', background: 'transparent' }}><X size={18} /></button></Dialog.Close>
          </div>
          <Dialog.Description style={{ display: 'none' }}>Create a new application entry.</Dialog.Description>
          
          <form onSubmit={handleSubmit}>
            <div style={{ display: 'grid', gridTemplateColumns: '350px 1fr', gap: '1.5rem', alignItems: 'start' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                <div className="field"><label className="label">Name</label><input name="name" required value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} style={{ padding: '0.4rem 0.6rem' }} placeholder="e.g. CRM System" /></div>
                <div className="field"><label className="label">Description</label><textarea name="description" rows={2} value={formData.description} onChange={e => setFormData({...formData, description: e.target.value})} style={{ padding: '0.4rem 0.6rem' }} placeholder="Purpose of this app..." /></div>
                
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
                      <span style={{ fontSize: '0.7rem', fontWeight: 700, color: techFitOptions.find(o => o.value === formData.functionalFit)?.color }}>
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
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                    <label className="label" style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', textTransform: 'uppercase', fontSize: '0.65rem', color: 'var(--muted-foreground)', margin: 0 }}><ArrowRight size={12} /> Integrations (Targets)</label>
                    <button type="button" onClick={addOutgoing} style={{ height: '1.5rem', padding: '0 0.4rem', fontSize: '0.65rem' }}><Plus size={12} /> Add</button>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', maxHeight: '120px', overflowY: 'auto' }}>
                    {outgoingRelations.map((rel, index) => (
                      <div key={index} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 24px', gap: '0.25rem' }}>
                        <input value={rel.name} onChange={e => updateRelation(index, 'name', e.target.value)} placeholder="Integration Name..." style={{ fontSize: '0.7rem', padding: '0.25rem' }} />
                        <select value={rel.targetId} onChange={e => updateRelation(index, 'targetId', e.target.value)} style={{ fontSize: '0.7rem', padding: '0.25rem' }}>
                          <option value="">Target...</option>
                          {apps.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                        </select>
                        <button type="button" onClick={() => removeRelation(index, true)} style={{ border: 'none', color: 'var(--destructive)', background: 'transparent', padding: 0 }}><Trash2 size={12} /></button>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            <div style={{ marginTop: '1.25rem', display: 'flex', gap: '0.5rem', justifyContent: 'flex-end', borderTop: '1px solid var(--border)', paddingTop: '1rem' }}>
              <Dialog.Close asChild><button type="button" style={{ height: '2rem', fontSize: '0.75rem' }}>Cancel</button></Dialog.Close>
              <button type="submit" className="primary" disabled={loading} style={{ height: '2rem', fontSize: '0.75rem' }}>Create Application</button>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
};
