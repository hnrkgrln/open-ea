import React, { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, Trash2, Settings2, FileCode, Palette, Database, Boxes, Layers, FileText, Network, ChevronRight } from 'lucide-react';
import { EditMetadataDialog } from './EditMetadataDialog';
import { EditRangePicklistDialog } from './EditRangePicklistDialog';
import { ImportExportSettings } from './ImportExport';
import { useLocalStorage } from '../App';
import { ColoredSelect } from './ColoredSelect';

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
  organizations: any[];
  informationObjects: any[];
  integrations: any[];
  onRefresh: () => void;
}

export const PicklistsView = ({ brandName, onUpdateBrand, apps, capabilities, organizations, informationObjects, integrations, onRefresh }: Props) => {
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useLocalStorage<'picklists' | 'metadata' | 'branding' | 'import-export'>('openea_settings_tab', 'picklists');
  const [selectedPicklistId, setSelectedPicklistId] = useLocalStorage<string | null>('openea_settings_picklist', null);
  
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

  if (loadingPicklists || loadingMeta) return <div style={{ padding: '2rem', textAlign: 'center' }}>Loading configuration...</div>;

  const strategicFieldNames = ['criticality', 'functional_fit', 'technical_fit', 'cia_scale'];
  
  const selectedPicklist = picklists?.find(p => p.id === selectedPicklistId);
  const isScalePicklist = selectedPicklist && strategicFieldNames.includes(selectedPicklist.name);

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

  const artifacts = [
    { 
      id: 'Application', 
      label: 'Applications', 
      icon: <Database size={16} />, 
      picklists: ['application_type', 'owner', 'lifecycle', 'criticality', 'functional_fit', 'technical_fit'] 
    },
    { 
      id: 'Capability', 
      label: 'Capabilities', 
      icon: <Boxes size={16} />, 
      picklists: ['criticality'] 
    },
    { 
      id: 'Organization', 
      label: 'Organizations', 
      icon: <Layers size={16} />, 
      picklists: ['organization_type'] 
    },
    { 
      id: 'InformationObject', 
      label: 'Information Model', 
      icon: <FileText size={16} />, 
      picklists: ['information_type', 'pii_category', 'cia_scale'] 
    },
    { 
      id: 'Integration', 
      label: 'Integrations', 
      icon: <Network size={16} />, 
      picklists: ['integration_type', 'integration_pattern', 'integration_frequency', 'integration_crud'] 
    },
  ];

  return (
    <div style={{ maxWidth: '1400px', margin: '0 auto', padding: '0 0.75rem' }}>
      <div style={{ marginBottom: '1.5rem' }}>
        <h1 style={{ fontSize: '1.5rem', fontWeight: 800, letterSpacing: '-0.02em' }}>Settings & Configuration</h1>
        <p style={{ color: 'var(--muted-foreground)', fontSize: '0.9rem' }}>Fine-tune your enterprise meta model and global branding.</p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '260px 1fr', gap: '2rem', alignItems: 'flex-start' }}>
        {/* Unified Sidebar */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          
          {/* Global Tabs */}
          <div className="card" style={{ padding: '0.4rem' }}>
            <button
              onClick={() => { setActiveTab('metadata'); setSelectedPicklistId(null); }}
              style={{
                width: '100%', justifyContent: 'flex-start', border: 'none',
                background: activeTab === 'metadata' ? 'var(--primary)' : 'transparent',
                color: activeTab === 'metadata' ? 'var(--primary-foreground)' : 'var(--foreground)',
                padding: '0.6rem 0.85rem', fontSize: '0.8rem', fontWeight: 700,
                textAlign: 'left', display: 'flex', gap: '0.6rem', alignItems: 'center', borderRadius: '6px', cursor: 'pointer'
              }}
            >
              <FileCode size={16} /> Custom Attributes
            </button>
          </div>

          {/* Artifact Groups */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
            <div style={{ padding: '0 0.85rem', fontSize: '0.65rem', fontWeight: 800, color: 'var(--muted-foreground)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>Artifact Configuration</div>
            {artifacts.map(art => (
              <div key={art.id} className="card" style={{ padding: '0.4rem', background: 'var(--card)' }}>
                <div style={{ padding: '0.4rem 0.65rem', display: 'flex', alignItems: 'center', gap: '0.4rem', color: 'var(--foreground)', fontWeight: 800, fontSize: '0.75rem', borderBottom: '1px solid var(--border)', marginBottom: '0.2rem', paddingBottom: '0.6rem' }}>
                  {React.cloneElement(art.icon as React.ReactElement, { size: 14 })} {art.label}
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1px' }}>
                  {art.picklists.map(pName => {
                    const p = picklists?.find(pl => pl.name === pName);
                    if (!p) return null;
                    const isSelected = activeTab === 'picklists' && selectedPicklistId === p.id;
                    return (
                      <button
                        key={p.id}
                        onClick={() => { setActiveTab('picklists'); setSelectedPicklistId(p.id); }}
                        style={{
                          width: '100%', justifyContent: 'flex-start', border: 'none',
                          background: isSelected ? 'var(--accent)' : 'transparent',
                          color: isSelected ? 'var(--foreground)' : 'var(--muted-foreground)',
                          padding: '0.5rem 0.65rem', fontSize: '0.75rem', fontWeight: 500,
                          textAlign: 'left', borderRadius: '5px', cursor: 'pointer',
                          display: 'flex', alignItems: 'center', gap: '0.4rem'
                        }}
                      >
                        <ChevronRight size={10} style={{ opacity: isSelected ? 1 : 0.3 }} />
                        {p.label}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>

          <div className="card" style={{ padding: '0.4rem' }}>
            <button
              onClick={() => { setActiveTab('branding'); setSelectedPicklistId(null); }}
              style={{
                width: '100%', justifyContent: 'flex-start', border: 'none',
                background: activeTab === 'branding' ? 'var(--accent)' : 'transparent',
                color: activeTab === 'branding' ? 'var(--foreground)' : 'var(--muted-foreground)',
                padding: '0.6rem 0.85rem', fontSize: '0.8rem', fontWeight: 600,
                textAlign: 'left', display: 'flex', gap: '0.6rem', alignItems: 'center', borderRadius: '6px', cursor: 'pointer'
              }}
            >
              <Palette size={16} /> Global Branding
            </button>
            <button
              onClick={() => { setActiveTab('import-export'); setSelectedPicklistId(null); }}
              style={{
                width: '100%', justifyContent: 'flex-start', border: 'none',
                background: activeTab === 'import-export' ? 'var(--accent)' : 'transparent',
                color: activeTab === 'import-export' ? 'var(--foreground)' : 'var(--muted-foreground)',
                padding: '0.6rem 0.85rem', fontSize: '0.8rem', fontWeight: 600,
                textAlign: 'left', display: 'flex', gap: '0.6rem', alignItems: 'center', borderRadius: '6px', cursor: 'pointer'
              }}
            >
              <Settings2 size={16} /> Data Management
            </button>
          </div>
        </div>

        {/* Main Content Area */}
        <div style={{ minWidth: 0 }}>
          {activeTab === 'picklists' && selectedPicklist ? (
            <div className="card" style={{ padding: '1.5rem' }}>
              <div style={{ marginBottom: '1.5rem', borderBottom: '1px solid var(--border)', paddingBottom: '1rem', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
                <div>
                  <div style={{ fontSize: '0.7rem', fontWeight: 800, color: 'var(--primary)', textTransform: 'uppercase', marginBottom: '0.4rem' }}>
                    {isScalePicklist ? 'Strategic Assessment Scale' : 'Standard Picklist'}
                  </div>
                  <h2 style={{ fontSize: '1.5rem', fontWeight: 800, letterSpacing: '-0.02em' }}>{selectedPicklist.label}</h2>
                  <p style={{ color: 'var(--muted-foreground)', fontSize: '0.85rem' }}>
                    {isScalePicklist 
                      ? 'Configure the scoring range and color profile for this assessment field.' 
                      : `Managing allowed values for ${selectedPicklist.name}`}
                  </p>
                </div>
                <EditRangePicklistDialog 
                  picklist={selectedPicklist} 
                  isScale={isScalePicklist}
                  onSuccess={() => queryClient.invalidateQueries({ queryKey: ['picklists'] })} 
                />
              </div>

              {isScalePicklist ? (
                <div style={{ padding: '1.5rem', background: 'var(--background)', borderRadius: '16px', border: '1px solid var(--border)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', background: 'var(--card)', padding: '1rem', borderRadius: '12px', border: '1px solid var(--border)', boxShadow: 'inset 0 2px 4px rgba(0,0,0,0.05)' }}>
                    {selectedPicklist.options.map(opt => (
                      <div key={opt.id} style={{ flex: 1, height: '34px', background: opt.color, borderRadius: '6px', display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1px solid rgba(0,0,0,0.1)', position: 'relative' }} title={opt.label}>
                        <span style={{ fontSize: '0.7rem', fontWeight: 900, color: 'white', textShadow: '0 1px 2px rgba(0,0,0,0.3)' }}>{opt.value}</span>
                      </div>
                    ))}
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '0.6rem', padding: '0 0.4rem' }}>
                    <span style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--muted-foreground)' }}>{selectedPicklist.options[0]?.label}</span>
                    <span style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--muted-foreground)' }}>{selectedPicklist.options[selectedPicklist.options.length-1]?.label}</span>
                  </div>
                </div>
              ) : (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: '0.75rem' }}>
                  {selectedPicklist.options.map(opt => (
                    <div key={opt.id} style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.75rem', background: 'var(--card)', borderRadius: '10px', border: '1px solid var(--border)' }}>
                      <div style={{ width: '20px', height: '20px', borderRadius: '5px', background: opt.color || '#adb5bd', border: '1px solid var(--border)', flexShrink: 0 }} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: '0.8rem', fontWeight: 700, textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' }}>{opt.label}</div>
                        <div style={{ fontSize: '0.65rem', color: 'var(--muted-foreground)', fontFamily: 'monospace', textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' }}>{opt.value}</div>
                      </div>
                    </div>
                  ))}
                  {selectedPicklist.options.length === 0 && (
                    <div style={{ color: 'var(--muted-foreground)', fontSize: '0.8rem', padding: '0.75rem' }}>No options defined yet.</div>
                  )}
                </div>
              )}
            </div>
          ) : activeTab === 'metadata' ? (
            <div className="card" style={{ padding: '1.5rem' }}>
              <div style={{ marginBottom: '1.5rem', borderBottom: '1px solid var(--border)', paddingBottom: '1rem' }}>
                <h2 style={{ fontSize: '1.25rem', fontWeight: 800 }}>Custom Attributes</h2>
                <p style={{ color: 'var(--muted-foreground)', fontSize: '0.85rem' }}>Inject dynamically rendered fields into any artifact type.</p>
              </div>

              <div style={{ marginBottom: '2rem' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr style={{ textAlign: 'left', borderBottom: '1px solid var(--border)' }}>
                      <th style={{ padding: '0.75rem', fontSize: '0.65rem', textTransform: 'uppercase', color: 'var(--muted-foreground)' }}>Target Artifact</th>
                      <th style={{ padding: '0.75rem', fontSize: '0.65rem', textTransform: 'uppercase', color: 'var(--muted-foreground)' }}>Label</th>
                      <th style={{ padding: '0.75rem', fontSize: '0.65rem', textTransform: 'uppercase', color: 'var(--muted-foreground)' }}>System Name</th>
                      <th style={{ padding: '0.75rem', fontSize: '0.65rem', textTransform: 'uppercase', color: 'var(--muted-foreground)' }}>Type</th>
                      <th style={{ padding: '0.75rem', textAlign: 'right' }}></th>
                    </tr>
                  </thead>
                  <tbody>
                    {metaDefs?.map(def => (
                      <tr key={def.id} style={{ borderBottom: '1px solid var(--border)' }} className="row-hover">
                        <td style={{ padding: '0.75rem' }}>
                          <span style={{ background: 'var(--primary)', color: 'var(--primary-foreground)', padding: '0.15rem 0.4rem', borderRadius: '4px', fontSize: '0.6rem', fontWeight: 800, textTransform: 'uppercase' }}>{def.entityType}</span>
                        </td>
                        <td style={{ padding: '0.75rem', fontSize: '0.85rem', fontWeight: 600 }}>{def.label}</td>
                        <td style={{ padding: '0.75rem', fontSize: '0.75rem', color: 'var(--muted-foreground)', fontFamily: 'monospace' }}>{def.fieldName}</td>
                        <td style={{ padding: '0.75rem' }}>
                          <span style={{ background: 'var(--secondary)', color: 'var(--secondary-foreground)', padding: '0.15rem 0.4rem', borderRadius: '4px', fontSize: '0.6rem', fontWeight: 700 }}>{def.fieldType}</span>
                        </td>
                        <td style={{ padding: '0.75rem', textAlign: 'right' }}>
                          <div style={{ display: 'flex', gap: '0.4rem', justifyContent: 'flex-end' }}>
                            <EditMetadataDialog 
                              definition={def} 
                              onSuccess={() => queryClient.invalidateQueries({ queryKey: ['metadata-definitions'] })} 
                            />
                            <button onClick={() => handleDeleteMeta(def.id)} style={{ border: 'none', background: 'transparent', color: 'var(--destructive)', padding: '0.4rem', cursor: 'pointer' }}>
                              <Trash2 size={16} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div style={{ background: 'var(--background)', padding: '1.5rem', borderRadius: '12px', border: '1px solid var(--border)' }}>
                <h3 style={{ fontSize: '0.9rem', fontWeight: 700, marginBottom: '1rem' }}>Define New Attribute</h3>
                <form onSubmit={handleAddMeta}>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '1rem', marginBottom: '1.5rem' }}>
                    <div className="field" style={{ margin: 0 }}>
                      <label className="label">Target Artifact</label>
                      <ColoredSelect
                        value={metaEntity}
                        onChange={setMetaEntity}
                        options={artifacts.map(art => ({ value: art.id, label: art.label }))}
                        style={{ height: '2rem', fontSize: '0.8rem' }}
                      />
                    </div>
                    <div className="field" style={{ margin: 0 }}>
                      <label className="label">Display Label</label>
                      <input 
                        value={metaLabel}
                        onChange={(e) => {
                          setMetaLabel(e.target.value);
                          if (!metaName) setMetaName(e.target.value.replace(/\s+/g, '_').toLowerCase());
                        }}
                        placeholder="e.g. Support Tier" required 
                        style={{ height: '2rem', fontSize: '0.8rem' }}
                      />
                    </div>
                    <div className="field" style={{ margin: 0 }}>
                      <label className="label">System Property Name</label>
                      <input value={metaName} onChange={(e) => setMetaName(e.target.value)} placeholder="e.g. support_tier" required style={{ height: '2rem', fontSize: '0.8rem' }} />
                    </div>
                    <div className="field" style={{ margin: 0 }}>
                      <label className="label">Input Type</label>
                      <ColoredSelect
                        value={metaType}
                        onChange={setMetaType}
                        options={[
                          { value: 'string', label: 'Text (Short)' },
                          { value: 'textarea', label: 'Text (Long)' },
                          { value: 'number', label: 'Number' },
                          { value: 'range', label: 'Range Slider' },
                          { value: 'date', label: 'Date' },
                          { value: 'boolean', label: 'Boolean (Checkbox)' },
                        ]}
                        style={{ height: '2rem', fontSize: '0.8rem' }}
                      />
                    </div>
                  </div>

                  {metaType === 'range' && (
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '1rem', marginBottom: '1.5rem', padding: '1rem', background: 'var(--card)', borderRadius: '10px', border: '1px solid var(--border)' }}>
                      <div className="field" style={{ margin: 0 }}>
                        <label className="label">Min Value</label>
                        <input type="number" value={metaMin} onChange={(e) => setMetaMin(Number(e.target.value))} style={{ height: '2rem', fontSize: '0.8rem' }} />
                      </div>
                      <div className="field" style={{ margin: 0 }}>
                        <label className="label">Max Value</label>
                        <input type="number" value={metaMax} onChange={(e) => setMetaMax(Number(e.target.value))} style={{ height: '2rem', fontSize: '0.8rem' }} />
                      </div>
                      <div className="field" style={{ margin: 0 }}>
                        <label className="label">Scale Color Logic</label>
                        <ColoredSelect
                          value={metaScale}
                          onChange={setMetaScale}
                          options={[
                            { value: 'neutral', label: 'Neutral (Blue)' },
                            { value: 'good-bad', label: 'Good to Bad (Green to Red)' },
                            { value: 'bad-good', label: 'Bad to Good (Red to Green)' },
                            { value: 'low-high', label: 'Low to High (Light to Dark)' },
                            { value: 'importance', label: 'Low to High (Gray to Purple)' },
                          ]}
                          style={{ height: '2rem', fontSize: '0.8rem' }}
                        />
                      </div>
                    </div>
                  )}

                  <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                    <button type="submit" className="primary" style={{ height: '2.4rem', padding: '0 1.5rem', fontSize: '0.85rem' }}>
                      <Plus size={16} style={{ marginRight: '0.4rem' }} /> Create Attribute
                    </button>
                  </div>
                </form>
              </div>
            </div>
          ) : activeTab === 'import-export' ? (
            <ImportExportSettings apps={apps} capabilities={capabilities} organizations={organizations} informationObjects={informationObjects} integrations={integrations} onRefresh={onRefresh} />
          ) : (
            <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--muted-foreground)', fontSize: '0.9rem' }}>
              Select a configuration category from the sidebar.
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
