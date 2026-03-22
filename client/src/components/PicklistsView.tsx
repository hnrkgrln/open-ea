import React, { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, Trash2, Settings2, GripVertical, FileCode, Edit2 } from 'lucide-react';
import { EditMetadataDialog } from './EditMetadataDialog';

interface PicklistOption {
  id: string;
  value: string;
  label: string;
  color?: string;
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

export const PicklistsView = () => {
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<'picklists' | 'metadata'>('picklists');
  const [selectedPicklistId, setSelectedPicklistId] = useState<string | null>(null);
  
  // States for new picklist option
  const [newValue, setNewValue] = useState('');
  const [newLabel, setNewLabel] = useState('');

  // States for new metadata field
  const [metaLabel, setMetaLabel] = useState('');
  const [metaName, setMetaName] = useState('');
  const [metaType, setMetaType] = useState('string');
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

  const selectedPicklist = picklists?.find(p => p.id === selectedPicklistId) || picklists?.[0];

  React.useEffect(() => {
    if (picklists && picklists.length > 0 && !selectedPicklistId) {
      setSelectedPicklistId(picklists[0].id);
    }
  }, [picklists, selectedPicklistId]);

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
          order: selectedPicklist.options.length + 1
        }),
      });

      if (res.ok) {
        setNewValue('');
        setNewLabel('');
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
          entityType: 'Application',
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
    if (!confirm('Are you sure? Existing application data for this field will not be deleted but won\'t show up in forms.')) return;
    try {
      const res = await fetch(`/api/metadata-definitions/${id}`, { method: 'DELETE' });
      if (res.ok) queryClient.invalidateQueries({ queryKey: ['metadata-definitions'] });
    } catch (err) {
      console.error(err);
    }
  };

  if (loadingPicklists || loadingMeta) return <div>Loading settings...</div>;

  return (
    <div>
      <div style={{ marginBottom: '2rem' }}>
        <h1 style={{ fontSize: '1.875rem', fontWeight: 700 }}>Picklists & Configuration</h1>
        <p style={{ color: 'var(--muted-foreground)' }}>Manage the allowed values and custom fields for your meta-model.</p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '250px 1fr', gap: '2rem' }}>
        {/* Sidebar */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <div className="card" style={{ padding: '0.5rem' }}>
            <div style={{ padding: '0.5rem 1rem', fontSize: '0.75rem', fontWeight: 700, color: 'var(--muted-foreground)', textTransform: 'uppercase' }}>Picklists</div>
            {picklists?.map(p => (
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
              <FileCode size={16} /> Custom Fields
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="card">
          {activeTab === 'picklists' && selectedPicklist ? (
            <>
              <div style={{ marginBottom: '1.5rem', borderBottom: '1px solid var(--border)', paddingBottom: '1rem' }}>
                <h2 style={{ fontSize: '1.25rem', fontWeight: 600 }}>{selectedPicklist.label} Options</h2>
                <p style={{ fontSize: '0.875rem', color: 'var(--muted-foreground)' }}>Values available in the "{selectedPicklist.name}" dropdowns.</p>
              </div>

              <div style={{ marginBottom: '2rem' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr style={{ textAlign: 'left', borderBottom: '1px solid var(--border)' }}>
                      <th style={{ padding: '0.75rem', fontSize: '0.75rem', textTransform: 'uppercase', color: 'var(--muted-foreground)' }}>Label</th>
                      <th style={{ padding: '0.75rem', fontSize: '0.75rem', textTransform: 'uppercase', color: 'var(--muted-foreground)' }}>Internal Value</th>
                      <th style={{ padding: '0.75rem', textAlign: 'right' }}></th>
                    </tr>
                  </thead>
                  <tbody>
                    {selectedPicklist.options.map(opt => (
                      <tr key={opt.id} style={{ borderBottom: '1px solid var(--border)' }}>
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
                <form onSubmit={handleAddOption} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr auto', gap: '1rem', alignItems: 'flex-end' }}>
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
                    <label className="label">Internal Value</label>
                    <input value={newValue} onChange={(e) => setNewValue(e.target.value)} placeholder="e.g. finance" required />
                  </div>
                  <button type="submit" className="primary" style={{ height: '2.5rem' }}>
                    <Plus size={18} /> Add
                  </button>
                </form>
              </div>
            </>
          ) : activeTab === 'metadata' ? (
            <>
              <div style={{ marginBottom: '1.5rem', borderBottom: '1px solid var(--border)', paddingBottom: '1rem' }}>
                <h2 style={{ fontSize: '1.25rem', fontWeight: 600 }}>Custom Fields (Application)</h2>
                <p style={{ fontSize: '0.875rem', color: 'var(--muted-foreground)' }}>Add dynamically rendered fields to the Application model.</p>
              </div>

              <div style={{ marginBottom: '2rem' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr style={{ textAlign: 'left', borderBottom: '1px solid var(--border)' }}>
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
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '1rem', marginBottom: '1rem' }}>
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
            </>
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
