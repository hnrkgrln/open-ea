import React, { useState, useEffect, useMemo } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { X, Edit2, Plus, Trash2, CheckCircle2, ArrowRight, ArrowLeft, Search, Database, Boxes, ShieldCheck, Share2, Info, Network, User, Tag, Activity, ArrowUpRight } from 'lucide-react';

const safeJsonParse = (str: string | null | undefined, fallback: any = {}) => {
  if (!str) return fallback;
  try {
    return JSON.parse(str);
  } catch (e) {
    return fallback;
  }
};

interface Application {
  id: string;
  name: string;
}

interface Capability {
  id: string;
  name: string;
  criticality: string;
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
    case 'importance': return 'linear-gradient(to right, #dee2e6, #7048e8)';
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
        lifecycle: app.lifecycle || 'Discovery',
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
        setDynamicValues(safeJsonParse(app.metadata));
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

  // Inheritance Logic
  const effectiveCriticality = useMemo(() => {
    if (selectedCapIds.length === 0) return formData.criticality;
    
    const capCriticalities = selectedCapIds.map(id => {
      const cap = capabilities.find(c => c.id === id);
      return Number(cap?.criticality || 1);
    });
    
    return String(Math.max(...capCriticalities));
  }, [selectedCapIds, formData.criticality, capabilities]);

  const isCriticalityInherited = selectedCapIds.length > 0;

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
          <button className="secondary" style={{ width: '2.5rem', height: '2.5rem', padding: 0 }}><Edit2 size={16} /></button>
        </Dialog.Trigger>
      )}
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
          <Dialog.Title style={{ display: 'none' }}>Edit Application</Dialog.Title>
          <Dialog.Description style={{ display: 'none' }}>Update application details and metadata.</Dialog.Description>

          {/* Header */}
          <div style={{ padding: '2rem 2.5rem', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'var(--muted)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '1.25rem' }}>
              <div style={{ background: 'var(--primary)', color: 'var(--primary-foreground)', width: '48px', height: '48px', borderRadius: '16px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Database size={24} />
              </div>
              <div>
                <Dialog.Title style={{ fontWeight: 800, fontSize: '1.5rem', letterSpacing: '-0.02em', margin: 0 }}>{app.name}</Dialog.Title>
                <div style={{ fontSize: '0.8125rem', color: 'var(--muted-foreground)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Refining Application Artifact</div>
              </div>
            </div>
            <Dialog.Close asChild>
              <button style={{ border: 'none', width: '40px', height: '40px', padding: 0, borderRadius: '12px', background: 'var(--background)' }}><X size={20} /></button>
            </Dialog.Close>
          </div>

          <form onSubmit={handleSubmit} style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
            <div style={{ flex: 1, overflowY: 'auto', padding: '2.5rem' }}>
              <div style={{ maxWidth: '700px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '3rem' }}>
                
                {/* SECTION: BASIC INFO */}
                <section>
                  <h3 style={{ fontSize: '0.875rem', fontWeight: 800, textTransform: 'uppercase', color: 'var(--muted-foreground)', marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                    <Info size={18} /> Basic Information
                  </h3>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                    <div className="field" style={{ margin: 0 }}>
                      <label className="label">Application Name</label>
                      <input name="name" required value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} style={{ padding: '0.75rem 1rem', fontSize: '1.125rem', fontWeight: 600 }} />
                    </div>
                    <div className="field" style={{ margin: 0 }}>
                      <label className="label">Purpose & Context</label>
                      <textarea name="description" rows={4} value={formData.description} onChange={e => setFormData({...formData, description: e.target.value})} style={{ padding: '0.75rem 1rem', lineHeight: '1.6', fontSize: '1rem' }} placeholder="What are the key goals of this system?" />
                    </div>
                    
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem' }}>
                      <div className="field" style={{ margin: 0 }}>
                        <label className="label" style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}><User size={14} /> Accountability</label>
                        <select name="owner" value={formData.owner} onChange={e => setFormData({...formData, owner: e.target.value})} style={{ padding: '0.75rem' }}><option value="">Select Owner...</option>{ownerOptions.map((o: any) => <option key={o.id} value={o.value}>{o.label}</option>)}</select>
                      </div>
                      <div className="field" style={{ margin: 0 }}>
                        <label className="label" style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}><Tag size={14} /> Classification</label>
                        <select name="type" value={formData.type} onChange={e => setFormData({...formData, type: e.target.value})} style={{ padding: '0.75rem' }}><option value="">Select Type...</option>{appTypeOptions.map((o: any) => <option key={o.id} value={o.value}>{o.label}</option>)}</select>
                      </div>
                    </div>
                    
                    <div className="field" style={{ margin: 0 }}>
                      <label className="label" style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}><Activity size={14} /> Lifecycle Status</label>
                      <select name="lifecycle" value={formData.lifecycle} onChange={e => setFormData({...formData, lifecycle: e.target.value})} style={{ padding: '0.75rem' }}>{lifecycleOptions.map((opt: any) => (<option key={opt.id} value={opt.value}>{opt.label}</option>))}</select>
                    </div>
                  </div>
                </section>

                {/* SECTION: STRATEGIC ASSESSMENT */}
                <section style={{ background: 'var(--muted)', padding: '2rem', borderRadius: '24px', border: '1px solid var(--border)' }}>
                  <h3 style={{ fontSize: '0.875rem', fontWeight: 800, textTransform: 'uppercase', color: 'var(--muted-foreground)', marginBottom: '2rem', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                    <Share2 size={18} /> Strategic Assessment
                  </h3>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
                    {/* Business Criticality - HANDLES INHERITANCE */}
                    <div className="field" style={{ margin: 0 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: '12px' }}>
                        <div>
                          <label className="label" style={{ margin: 0, fontSize: '1rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            Business Criticality
                            {isCriticalityInherited && <span style={{ fontSize: '0.65rem', padding: '0.1rem 0.4rem', borderRadius: '4px', background: 'var(--primary)', color: 'var(--primary-foreground)', display: 'flex', alignItems: 'center', gap: '0.2rem' }}><ArrowUpRight size={10} /> INHERITED</span>}
                          </label>
                          <div style={{ fontSize: '0.75rem', color: 'var(--muted-foreground)', marginTop: '2px' }}>
                            {isCriticalityInherited ? 'Automatically derived from supporting capabilities.' : 'How vital is this system to operations?'}
                          </div>
                        </div>
                        <div style={{ fontSize: '0.875rem', fontWeight: 800, color: criticalityOptions.find((o:any) => o.value === effectiveCriticality)?.color, background: 'var(--card)', padding: '0.2rem 0.6rem', borderRadius: '6px', border: '1px solid var(--border)' }}>
                          {criticalityOptions.find((o:any) => o.value === effectiveCriticality)?.label}
                        </div>
                      </div>
                      <input 
                        type="range" min="1" max="5" step="1" 
                        disabled={isCriticalityInherited}
                        style={{ background: getScaleGradient('importance'), height: '10px', opacity: isCriticalityInherited ? 0.5 : 1, cursor: isCriticalityInherited ? 'not-allowed' : 'pointer' }} 
                        value={effectiveCriticality} 
                        onChange={e => setFormData({...formData, criticality: e.target.value})} 
                      />
                    </div>

                    {[
                      { label: 'Functional Fit', key: 'functionalFit', grad: 'bad-good', options: funcFitOptions, desc: 'Does it fulfill business requirements?' },
                      { label: 'Technical Fit', key: 'technicalFit', grad: 'bad-good', options: techFitOptions, desc: 'Is the underlying technology modern and stable?' }
                    ].map(item => (
                      <div key={item.key} className="field" style={{ margin: 0 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: '12px' }}>
                          <div>
                            <label className="label" style={{ margin: 0, fontSize: '1rem', fontWeight: 700 }}>{item.label}</label>
                            <div style={{ fontSize: '0.75rem', color: 'var(--muted-foreground)', marginTop: '2px' }}>{item.desc}</div>
                          </div>
                          <div style={{ fontSize: '0.875rem', fontWeight: 800, color: item.options.find((o:any) => o.value === (formData as any)[item.key])?.color, background: 'var(--card)', padding: '0.2rem 0.6rem', borderRadius: '6px', border: '1px solid var(--border)' }}>
                            {item.options.find((o:any) => o.value === (formData as any)[item.key])?.label}
                          </div>
                        </div>
                        <input type="range" min="1" max="5" step="1" style={{ background: getScaleGradient(item.grad), height: '10px' }} value={(formData as any)[item.key]} onChange={e => setFormData({...formData, [item.key]: e.target.value})} />
                      </div>
                    ))}
                  </div>
                </section>

                {/* SECTION: CAPABILITIES */}
                <section>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
                    <h3 style={{ fontSize: '0.875rem', fontWeight: 800, textTransform: 'uppercase', color: 'var(--muted-foreground)', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                      <Boxes size={18} /> Supporting Capabilities
                    </h3>
                    <div style={{ position: 'relative', width: '240px' }}>
                      <Search size={16} style={{ position: 'absolute', left: '0.75rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--muted-foreground)' }} />
                      <input placeholder="Filter capabilities..." value={capSearch} onChange={e => setCapSearch(e.target.value)} style={{ height: '2.25rem', padding: '0 2rem 0 2.25rem', fontSize: '0.875rem', marginTop: 0, borderRadius: '10px' }} />
                      {capSearch && (
                        <button
                          type="button"
                          onClick={() => setCapSearch('')}
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
                    {filteredCaps.length > 0 ? filteredCaps.map(cap => (
                      <button key={cap.id} type="button" onClick={() => toggleCapability(cap.id)} style={{ height: 'auto', padding: '0.75rem', fontSize: '0.875rem', justifyContent: 'flex-start', background: selectedCapIds.includes(cap.id) ? 'var(--primary)' : 'var(--background)', color: selectedCapIds.includes(cap.id) ? 'var(--primary-foreground)' : 'var(--foreground)', border: '1px solid var(--border)', borderRadius: '12px' }}>
                        {selectedCapIds.includes(cap.id) && <CheckCircle2 size={14} style={{ marginRight: '0.5rem' }} />}
                        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{cap.name}</span>
                      </button>
                    )) : <div style={{ fontSize: '0.875rem', color: 'var(--muted-foreground)', textAlign: 'center', padding: '2rem', gridColumn: '1/-1' }}>No matching capabilities found.</div>}
                  </div>
                </section>

                {/* SECTION: INTEGRATIONS */}
                <section>
                  <h3 style={{ fontSize: '0.875rem', fontWeight: 800, textTransform: 'uppercase', color: 'var(--muted-foreground)', marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                    <Network size={18} /> Connectivity Hub
                  </h3>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
                    {/* Outbound */}
                    <div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', textTransform: 'uppercase', fontSize: '0.75rem', fontWeight: 800, color: 'var(--muted-foreground)' }}><ArrowRight size={14} /> Providing data to</div>
                        <button type="button" onClick={addOutgoing} style={{ height: '2rem', padding: '0 0.75rem', fontSize: '0.8125rem', borderRadius: '10px' }}><Plus size={14} style={{ marginRight: '0.4rem' }} /> Add Integration</button>
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                        {outgoingRelations.map((rel, i) => (
                          <div key={rel.id || `out-${i}`} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 40px', gap: '0.75rem', padding: '0.75rem', background: 'var(--muted)', borderRadius: '16px' }}>
                            <input value={rel.name} onChange={e => updateRelation(i, true, 'name', e.target.value)} placeholder="Integration Name (e.g. API)" style={{ fontSize: '0.875rem', padding: '0.5rem', background: 'var(--background)' }} />
                            <select value={rel.targetId} onChange={e => updateRelation(i, true, 'targetId', e.target.value)} style={{ fontSize: '0.875rem', padding: '0.5rem', background: 'var(--background)' }}>
                              <option value="">Select Target...</option>
                              {apps.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                            </select>
                            <button type="button" onClick={() => removeRelation(i, true)} style={{ border: 'none', color: 'var(--destructive)', background: 'transparent', padding: 0 }}><Trash2 size={18} /></button>
                          </div>
                        ))}
                      </div>
                    </div>
                    {/* Inbound */}
                    <div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', textTransform: 'uppercase', fontSize: '0.75rem', fontWeight: 800, color: 'var(--muted-foreground)' }}><ArrowLeft size={14} /> Consuming data from</div>
                        <button type="button" onClick={addIncoming} style={{ height: '2rem', padding: '0 0.75rem', fontSize: '0.8125rem', borderRadius: '10px' }}><Plus size={14} style={{ marginRight: '0.4rem' }} /> Add Integration</button>
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                        {incomingRelations.map((rel, i) => (
                          <div key={rel.id || `in-${i}`} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 40px', gap: '0.75rem', padding: '0.75rem', background: 'var(--muted)', borderRadius: '16px' }}>
                            <input value={rel.name} onChange={e => updateRelation(i, false, 'name', e.target.value)} placeholder="Integration Name (e.g. Batch)" style={{ fontSize: '0.875rem', padding: '0.5rem', background: 'var(--background)' }} />
                            <select value={rel.sourceId} onChange={e => updateRelation(i, false, 'sourceId', e.target.value)} style={{ fontSize: '0.875rem', padding: '0.5rem', background: 'var(--background)' }}>
                              <option value="">Select Source...</option>
                              {apps.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                            </select>
                            <button type="button" onClick={() => removeRelation(i, false)} style={{ border: 'none', color: 'var(--destructive)', background: 'transparent', padding: 0 }}><Trash2 size={18} /></button>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </section>

                {/* SECTION: CUSTOM METADATA */}
                {otherMetaDefs.length > 0 && (
                  <section>
                    <h3 style={{ fontSize: '0.875rem', fontWeight: 800, textTransform: 'uppercase', color: 'var(--muted-foreground)', marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                      <ShieldCheck size={18} /> Extended Attributes
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
              <button type="button" onClick={handleDeleteApp} disabled={deleting} style={{ marginRight: 'auto', background: 'transparent', color: 'var(--destructive)', borderColor: 'var(--destructive)', fontWeight: 700, height: '3rem' }}>
                <Trash2 size={18} style={{ marginRight: '0.5rem' }} /> Delete Application
              </button>
              <Dialog.Close asChild><button type="button" style={{ fontWeight: 600, height: '3rem', padding: '0 1.5rem' }}>Discard Changes</button></Dialog.Close>
              <button type="submit" className="primary" disabled={loading} style={{ height: '3rem', padding: '0 2.5rem', fontSize: '1rem', fontWeight: 800, borderRadius: '14px', boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1)' }}>
                {loading ? 'Saving Progress...' : 'Save Refinements'}
              </button>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
};
