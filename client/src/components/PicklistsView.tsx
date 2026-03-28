import React, { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, Trash2, Settings2, FileCode, ShieldCheck, Palette } from 'lucide-react';
import { EditMetadataDialog } from './EditMetadataDialog';
import { EditRangePicklistDialog } from './EditRangePicklistDialog';
import { ImportExportSettings } from './ImportExport';

interface PicklistOption {
  id: string;
  value: string;
  label: string;
  color: string;
  order: number;
}

interface Picklist {
  id: string;
  name: string;
  label: string;
  options: PicklistOption[];
}

interface MetadataDefinition {
  id: string;
  entityType: string;
  fieldName: string;
  fieldType: string;
  label: string;
  required: boolean;
  min?: number;
  max?: number;
  scaleType?: string;
}

interface Props {
  brandName: string;
  onUpdateBrand: (val: string) => void;
  apps: any[];
  capabilities: any[];
  integrations: any[];
  onRefresh: () => void;
}

export const PicklistsView = ({ brandName, onUpdateBrand, apps, capabilities, integrations, onRefresh }: Props) => {
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<'strategic' | 'picklists' | 'metadata' | 'branding' | 'import-export'>('strategic');
  const [selectedPicklistId, setSelectedPicklistId] = useState<string | null>(null);
  
  // States for new picklist option
  const [newValue, setNewValue] = useState('');
  const [newLabel, setNewLabel] = useState('');
  const [newColor, setNewColor] = useState('#adb5bd');

  // States for new metadata field
  const [metaLabel, setMetaLabel] = useState('');
  const [metaName, setMetaName] = useState('');
  const [metaType, setMetaType] = useState('string');
  const [metaEntity, setMetaEntity] = useState('Application');
  const [metaMin, setMetaMin] = useState(0);
  const [metaMax, setMetaMax] = useState(100);
  const [metaScale, setMetaScale] = useState('neutral');

  const { data: picklists, isLoading: loadingPicklists } = useQuery<Picklist[]>({
    queryKey: ['picklists'],
    queryFn: async () => {
      const res = await fetch('/api/picklists');
      return res.json();
    }
  });

  const { data: metaDefs, isLoading: loadingMeta } = useQuery<MetadataDefinition[]>({
    queryKey: ['metadata-definitions'],
    queryFn: async () => {
      const res = await fetch('/api/metadata-definitions');
      return res.json();
    }
  });

  if (loadingPicklists || loadingMeta) return <div>Loading settings...</div>;

  const strategicFieldNames = ['criticality', 'functional_fit', 'technical_fit'];
  const strategicPicklists = picklists?.filter(p => strategicFieldNames.includes(p.name)) || [];
  const standardPicklists = picklists?.filter(p => !strategicFieldNames.includes(p.name)) || [];
  
  const selectedPicklist = picklists?.find(p => p.id === selectedPicklistId);

  const handleAddOption = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedPicklist || !newValue || !newLabel) return;

    try {
      const res = await fetch(`/api/picklists/${selectedPicklist.id}/options`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          value: newValue,
          label: newLabel,
          color: newColor,
          order: selectedPicklist.options.length + 1
        }),
      });

      if (res.ok) {
        setNewValue('');
        setNewLabel('');
        setNewColor('#adb5bd');
        queryClient.invalidateQueries({ queryKey: ['picklists'] });
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleDeleteOption = async (id: string) => {
    if (!confirm('Are you sure you want to delete this option?')) return;
    try {
      const res = await fetch(`/api/picklist-options/${id}`, { method: 'DELETE' });
      if (res.ok) queryClient.invalidateQueries({ queryKey: ['picklists'] });
    } catch (err) {
      console.error(err);
    }
  };

  const handleAddMeta = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!metaLabel || !metaName) return;

    try {
      const res = await fetch('/api/metadata-definitions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          entityType: metaEntity,
          fieldName: metaName,
          fieldType: metaType,
          label: metaLabel,
          required: false,
          min: metaType === 'range' ? Number(metaMin) : undefined,
          max: metaType === 'range' ? Number(metaMax) : undefined,
          scaleType: metaType === 'range' ? metaScale : undefined,
        }),
      });

      if (res.ok) {
        setMetaLabel('');
        setMetaName('');
        setMetaMin(0);
        setMetaMax(100);
        setMetaScale('neutral');
        queryClient.invalidateQueries({ queryKey: ['metadata-definitions'] });
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleDeleteMeta = async (id: string) => {
    if (!confirm('Are you sure? This will permanently delete this field and all associated data from every record.')) return;
    try {
      const res = await fetch(`/api/metadata-definitions/${id}`, { method: 'DELETE' });
      if (res.ok) queryClient.invalidateQueries({ queryKey: ['metadata-definitions'] });
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <div>
      <div style={{ marginBottom: '2rem' }}>
        <h1 style={{ fontSize: '1.875rem', fontWeight: 700 }}>Picklists & Configuration</h1>
        <p style={{ color: 'var(--muted-foreground)' }}>Manage the allowed values and custom fields for your meta model.</p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '280px 1fr', gap: '2rem' }}>
        {/* Sidebar */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <div className="card" style={{ padding: '0.5rem' }}>
            <button
              onClick={() => setActiveTab('strategic')}
              style={{
                width: '100%',
                justifyContent: 'flex-start',
                border: 'none',
                background: activeTab === 'strategic' ? 'var(--primary)' : 'transparent',
                color: activeTab === 'strategic' ? 'var(--primary-foreground)' : 'var(--foreground)',
                padding: '0.75rem 1rem',
                fontSize: '0.875rem',
                fontWeight: 700,
                textAlign: 'left',
                display: 'flex',
                gap: '0.6rem',
                alignItems: 'center'
              }}
            >
              <ShieldCheck size={18} /> Strategic Assessment
            </button>
          </div>

          <div className="card" style={{ padding: '0.5rem' }}>
            <div style={{ padding: '0.5rem 1rem', fontSize: '0.75rem', fontWeight: 700, color: 'var(--muted-foreground)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Standard Meta model</div>
            {standardPicklists?.map(p => (
              <button
                key={p.id}
                onClick={() => { setActiveTab('picklists'); setSelectedPicklistId(p.id); }}
                style={{
                  width: '100%',
                  justifyContent: 'flex-start',
                  border: 'none',
                  background: activeTab === 'picklists' && selectedPicklistId === p.id ? 'var(--accent)' : 'transparent',
                  color: activeTab === 'picklists' && selectedPicklistId === p.id ? 'var(--foreground)' : 'var(--muted-foreground)',
                  padding: '0.75rem 1rem',
                  fontSize: '0.875rem',
                  fontWeight: 500,
                  textAlign: 'left'
                }}
              >
                {p.label}
              </button>
            ))}
          </div>

          <div className="card" style={{ padding: '0.5rem' }}>
            <button
              onClick={() => setActiveTab('metadata')}
              style={{
                width: '100%',
                justifyContent: 'flex-start',
                border: 'none',
                background: activeTab === 'metadata' ? 'var(--accent)' : 'transparent',
                color: activeTab === 'metadata' ? 'var(--foreground)' : 'var(--muted-foreground)',
                padding: '0.75rem 1rem',
                fontSize: '0.875rem',
                fontWeight: 500,
                textAlign: 'left',
                display: 'flex',
                gap: '0.5rem',
                alignItems: 'center'
              }}
            >
              <FileCode size={16} /> Custom Meta model
            </button>
            <button
              onClick={() => setActiveTab('branding')}
              style={{
                width: '100%',
                justifyContent: 'flex-start',
                border: 'none',
                background: activeTab === 'branding' ? 'var(--accent)' : 'transparent',
                color: activeTab === 'branding' ? 'var(--foreground)' : 'var(--muted-foreground)',
                padding: '0.75rem 1rem',
                fontSize: '0.875rem',
                fontWeight: 500,
                textAlign: 'left',
                display: 'flex',
                gap: '0.5rem',
                alignItems: 'center'
              }}
            >
              <Palette size={16} /> Branding
            </button>
            <button
              onClick={() => setActiveTab('import-export')}
              style={{
                width: '100%',
                justifyContent: 'flex-start',
                border: 'none',
                background: activeTab === 'import-export' ? 'var(--accent)' : 'transparent',
                color: activeTab === 'import-export' ? 'var(--foreground)' : 'var(--muted-foreground)',
                padding: '0.75rem 1rem',
                fontSize: '0.875rem',
                fontWeight: 500,
                textAlign: 'left',
                display: 'flex',
                gap: '0.5rem',
                alignItems: 'center'
              }}
            >
              <Settings2 size={16} /> Import & Export
            </button>
          </div>
        </div>

        {/* Content */}
        <div style={{ minWidth: 0 }}>
          {activeTab === 'strategic' ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
              <div className="card">
                <h2 style={{ fontSize: '1.25rem', fontWeight: 700, marginBottom: '0.5rem' }}>Strategic Assessment Scales</h2>
                <p style={{ fontSize: '0.875rem', color: 'var(--muted-foreground)', marginBottom: '2rem' }}>Configure the 1-5 scoring ranges used for heat-mapping and architectural assessment.</p>
                
                <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
                  {strategicPicklists.map(p => (
                    <div key={p.id} style={{ padding: '1.5rem', background: 'var(--muted)', borderRadius: '16px', border: '1px solid var(--border)' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
                        <div>
                          <h3 style={{ fontSize: '1rem', fontWeight: 700 }}>{p.label}</h3>
                          <p style={{ fontSize: '0.75rem', color: 'var(--muted-foreground)' }}>System Name: <code style={{ background: 'var(--accent)', padding: '0.1rem 0.3rem', borderRadius: '4px' }}>{p.name}</code></p>
                        </div>
                        <EditRangePicklistDialog 
                          picklist={p} 
                          onSuccess={() => queryClient.invalidateQueries({ queryKey: ['picklists'] })} 
                        />
                      </div>
                      
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', background: 'var(--card)', padding: '1rem', borderRadius: '12px', border: '1px solid var(--border)' }}>
                        {p.options.map(opt => (
                          <div key={opt.id} style={{ flex: 1, height: '32px', background: opt.color, borderRadius: '6px', display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1px solid rgba(0,0,0,0.05)', position: 'relative' }} title={opt.label}>
                            <span style={{ fontSize: '0.65rem', fontWeight: 800, color: 'white', textShadow: '0 1px 2px rgba(0,0,0,0.2)' }}>{opt.value}</span>
                          </div>
                        ))}
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '0.5rem', padding: '0 0.25rem' }}>
                        <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--muted-foreground)' }}>{p.options[0]?.label}</span>
                        <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--muted-foreground)' }}>{p.options[p.options.length-1]?.label}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ) : activeTab === 'branding' ? (
            <div className="card">
              <div style={{ marginBottom: '1.5rem', borderBottom: '1px solid var(--border)', paddingBottom: '1rem' }}>
                <h2 style={{ fontSize: '1.25rem', fontWeight: 600 }}>Global Branding</h2>
                <p style={{ fontSize: '0.875rem', color: 'var(--muted-foreground)' }}>Customize the appearance of your OpenAPM instance.</p>
              </div>
              <div className="card" style={{ background: 'var(--background)' }}>
                <h3 style={{ fontSize: '0.875rem', fontWeight: 600, marginBottom: '1rem' }}>Organization Name</h3>
                <div className="field">
                  <label className="label">Logo Text</label>
                  <div style={{ display: 'flex', gap: '1rem', marginTop: '0.5rem' }}>
                    <input 
                      value={brandName} 
                      onChange={(e) => onUpdateBrand(e.target.value)} 
                      placeholder="e.g. Acme Corp Architecture"
                      style={{ maxWidth: '400px' }}
                    />
                    <button onClick={() => onUpdateBrand('OpenEA')} className="secondary">Reset to Default</button>
                  </div>
                  <p style={{ fontSize: '0.75rem', color: 'var(--muted-foreground)', marginTop: '0.75rem' }}>This text will appear in the top-left corner of the application header.</p>
                </div>
              </div>
            </div>
          ) : activeTab === 'picklists' && selectedPicklist ? (
            <div className="card">
              <div style={{ marginBottom: '1.5rem', borderBottom: '1px solid var(--border)', paddingBottom: '1rem', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
                <div>
                  <h2 style={{ fontSize: '1.25rem', fontWeight: 600 }}>{selectedPicklist.label}</h2>
                  <p style={{ fontSize: '0.875rem', color: 'var(--muted-foreground)' }}>
                    Values available in the "{selectedPicklist.name}" dropdowns.
                  </p>
                </div>
              </div>

              <div style={{ marginBottom: '2rem' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr style={{ textAlign: 'left', borderBottom: '1px solid var(--border)' }}>
                      <th style={{ padding: '0.75rem', fontSize: '0.75rem', textTransform: 'uppercase', color: 'var(--muted-foreground)' }}>Color</th>
                      <th style={{ padding: '0.75rem', fontSize: '0.75rem', textTransform: 'uppercase', color: 'var(--muted-foreground)' }}>Label</th>
                      <th style={{ padding: '0.75rem', fontSize: '0.75rem', textTransform: 'uppercase', color: 'var(--muted-foreground)' }}>Value</th>
                      <th style={{ padding: '0.75rem', textAlign: 'right' }}></th>
                    </tr>
                  </thead>
                  <tbody>
                    {selectedPicklist.options.map(opt => (
                      <tr key={opt.id} style={{ borderBottom: '1px solid var(--border)' }}>
                        <td style={{ padding: '0.75rem' }}>
                          <div style={{ width: '24px', height: '24px', borderRadius: '4px', background: opt.color || '#adb5bd', border: '1px solid var(--border)' }} />
                        </td>
                        <td style={{ padding: '0.75rem', fontSize: '0.875rem' }}>{opt.label}</td>
                        <td style={{ padding: '0.75rem', fontSize: '0.875rem', color: 'var(--muted-foreground)', fontFamily: 'monospace' }}>{opt.value}</td>
                        <td style={{ padding: '0.75rem', textAlign: 'right' }}>
                          <button onClick={() => handleDeleteOption(opt.id)} style={{ border: 'none', background: 'transparent', color: 'var(--destructive)', padding: '0.25rem' }}>
                            <Trash2 size={16} />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="card" style={{ background: 'var(--background)' }}>
                <h3 style={{ fontSize: '0.875rem', fontWeight: 600, marginBottom: '1rem' }}>Add New Option</h3>
                <form onSubmit={handleAddOption} style={{ display: 'grid', gridTemplateColumns: 'auto 1fr 1fr auto', gap: '1rem', alignItems: 'flex-end' }}>
                  <div className="field" style={{ margin: 0 }}>
                    <label className="label">Color</label>
                    <input 
                      type="color" 
                      value={newColor} 
                      onChange={(e) => setNewColor(e.target.value)} 
                      style={{ width: '40px', height: '2.5rem', padding: '2px', cursor: 'pointer' }}
                    />
                  </div>
                  <div className="field" style={{ margin: 0 }}>
                    <label className="label">Label</label>
                    <input 
                      value={newLabel}
                      onChange={(e) => {
                        setNewLabel(e.target.value);
                        if (!newValue) setNewValue(e.target.value.replace(/\s+/g, '_').toLowerCase());
                      }}
                      placeholder="e.g. Finance" required 
                    />
                  </div>
                  <div className="field" style={{ margin: 0 }}>
                    <label className="label">Value</label>
                    <input value={newValue} onChange={(e) => setNewValue(e.target.value)} placeholder="e.g. finance" required />
                  </div>
                  <button type="submit" className="primary" style={{ height: '2.5rem' }}>
                    <Plus size={18} /> Add
                  </button>
                </form>
              </div>
            </div>
          ) : activeTab === 'metadata' ? (
            <div className="card">
              <div style={{ marginBottom: '1.5rem', borderBottom: '1px solid var(--border)', paddingBottom: '1rem' }}>
                <h2 style={{ fontSize: '1.25rem', fontWeight: 600 }}>Custom Meta model</h2>
                <p style={{ fontSize: '0.875rem', color: 'var(--muted-foreground)' }}>Add dynamically rendered fields to Applications or Capabilities.</p>
              </div>

              <div style={{ marginBottom: '2rem' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr style={{ textAlign: 'left', borderBottom: '1px solid var(--border)' }}>
                      <th style={{ padding: '0.75rem', fontSize: '0.75rem', textTransform: 'uppercase', color: 'var(--muted-foreground)' }}>Entity</th>
                      <th style={{ padding: '0.75rem', fontSize: '0.75rem', textTransform: 'uppercase', color: 'var(--muted-foreground)' }}>Label</th>
                      <th style={{ padding: '0.75rem', fontSize: '0.75rem', textTransform: 'uppercase', color: 'var(--muted-foreground)' }}>Field Name</th>
                      <th style={{ padding: '0.75rem', fontSize: '0.75rem', textTransform: 'uppercase', color: 'var(--muted-foreground)' }}>Type</th>
                      <th style={{ padding: '0.75rem', fontSize: '0.75rem', textTransform: 'uppercase', color: 'var(--muted-foreground)' }}>Range/Palette</th>
                      <th style={{ padding: '0.75rem', textAlign: 'right' }}></th>
                    </tr>
                  </thead>
                  <tbody>
                    {metaDefs?.map(def => (
                      <tr key={def.id} style={{ borderBottom: '1px solid var(--border)' }}>
                        <td style={{ padding: '0.75rem', fontSize: '0.875rem' }}>
                          <span style={{ background: 'var(--accent)', padding: '0.1rem 0.4rem', borderRadius: '4px', fontSize: '0.75rem' }}>{def.entityType}</span>
                        </td>
                        <td style={{ padding: '0.75rem', fontSize: '0.875rem' }}>{def.label}</td>
                        <td style={{ padding: '0.75rem', fontSize: '0.875rem', color: 'var(--muted-foreground)', fontFamily: 'monospace' }}>{def.fieldName}</td>
                        <td style={{ padding: '0.75rem', fontSize: '0.875rem' }}>
                          <span style={{ background: 'var(--secondary)', padding: '0.1rem 0.4rem', borderRadius: '4px', fontSize: '0.75rem' }}>{def.fieldType}</span>
                        </td>
                        <td style={{ padding: '0.75rem', fontSize: '0.875rem' }}>
                          {def.fieldType === 'range' ? (
                            <span>{def.min}-{def.max} ({def.scaleType})</span>
                          ) : '—'}
                        </td>
                        <td style={{ padding: '0.75rem', textAlign: 'right' }}>
                          <div style={{ display: 'flex', gap: '0.25rem', justifyContent: 'flex-end' }}>
                            <EditMetadataDialog 
                              definition={def} 
                              onSuccess={() => queryClient.invalidateQueries({ queryKey: ['metadata-definitions'] })} 
                            />
                            <button onClick={() => handleDeleteMeta(def.id)} style={{ border: 'none', background: 'transparent', color: 'var(--destructive)', padding: '0.25rem' }}>
                              <Trash2 size={16} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="card" style={{ background: 'var(--background)' }}>
                <h3 style={{ fontSize: '0.875rem', fontWeight: 600, marginBottom: '1rem' }}>Add Custom Field</h3>
                <form onSubmit={handleAddMeta}>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: '1rem', marginBottom: '1rem' }}>
                    <div className="field" style={{ margin: 0 }}>
                      <label className="label">Entity Type</label>
                      <select value={metaEntity} onChange={(e) => setMetaEntity(e.target.value)}>
                        <option value="Application">Application</option>
                        <option value="Capability">Capability</option>
                      </select>
                    </div>
                    <div className="field" style={{ margin: 0 }}>
                      <label className="label">Field Label</label>
                      <input 
                        value={metaLabel}
                        onChange={(e) => {
                          setMetaLabel(e.target.value);
                          if (!metaName) setMetaName(e.target.value.replace(/\s+/g, '_').toLowerCase());
                        }}
                        placeholder="e.g. Criticality" required 
                      />
                    </div>
                    <div className="field" style={{ margin: 0 }}>
                      <label className="label">System Name</label>
                      <input value={metaName} onChange={(e) => setMetaName(e.target.value)} placeholder="e.g. criticality" required />
                    </div>
                    <div className="field" style={{ margin: 0 }}>
                      <label className="label">Field Type</label>
                      <select value={metaType} onChange={(e) => setMetaType(e.target.value)}>
                        <option value="string">Text (Short)</option>
                        <option value="textarea">Text (Long)</option>
                        <option value="number">Number</option>
                        <option value="range">Range Slider</option>
                        <option value="date">Date</option>
                        <option value="boolean">Boolean (Checkbox)</option>
                      </select>
                    </div>
                  </div>

                  {metaType === 'range' && (
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '1rem', marginBottom: '1rem' }}>
                      <div className="field" style={{ margin: 0 }}>
                        <label className="label">Minimum Value</label>
                        <input type="number" value={metaMin} onChange={(e) => setMetaMin(Number(e.target.value))} />
                      </div>
                      <div className="field" style={{ margin: 0 }}>
                        <label className="label">Maximum Value</label>
                        <input type="number" value={metaMax} onChange={(e) => setMetaMax(Number(e.target.value))} />
                      </div>
                      <div className="field" style={{ margin: 0 }}>
                        <label className="label">Scale Palette</label>
                        <select value={metaScale} onChange={(e) => setMetaScale(e.target.value)}>
                          <option value="neutral">Neutral (Blue)</option>
                          <option value="good-bad">Good to Bad (Green to Red)</option>
                          <option value="bad-good">Bad to Good (Red to Green)</option>
                          <option value="low-high">Low to High (Light to Dark)</option>
                          <option value="importance">Low to High (Gray to Purple)</option>
                        </select>
                      </div>
                    </div>
                  )}

                  <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                    <button type="submit" className="primary">
                      <Plus size={18} style={{ marginRight: '0.5rem' }} /> Add Custom Field
                    </button>
                  </div>
                </form>
              </div>
            </div>
          ) : activeTab === 'import-export' ? (
            <ImportExportSettings apps={apps} capabilities={capabilities} integrations={integrations} onRefresh={onRefresh} />
          ) : (
            <div style={{ textAlign: 'center', padding: '4rem', color: 'var(--muted-foreground)' }}>
              Select a category from the sidebar to manage configuration.
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
