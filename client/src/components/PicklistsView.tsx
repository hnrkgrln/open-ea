import React, { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, Trash2, Settings2, FileCode, ShieldCheck, Palette, Database, Boxes, Layers, Share2, Network, ChevronRight } from 'lucide-react';
import { EditMetadataDialog } from './EditMetadataDialog';
import { EditRangePicklistDialog } from './EditRangePicklistDialog';
import { ImportExportSettings } from './ImportExport';
import { useLocalStorage } from '../App';

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
  const [activeTab, setActiveTab] = useLocalStorage<'strategic' | 'picklists' | 'metadata' | 'branding' | 'import-export'>('openea_settings_tab', 'strategic');
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
  const strategicPicklists = picklists?.filter(p => strategicFieldNames.includes(p.name)) || [];
  
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

  const artifacts = [
    { id: 'Application', label: 'Applications', icon: <Database size={16} />, picklists: ['application_type', 'owner', 'lifecycle'] },
    { id: 'Capability', label: 'Capabilities', icon: <Boxes size={16} />, picklists: [] },
    { id: 'Organization', label: 'Organizations', icon: <Layers size={16} />, picklists: ['organization_type'] },
    { id: 'InformationObject', label: 'Information Model', icon: <Share2 size={16} />, picklists: ['information_type', 'pii_category'] },
    { id: 'Integration', label: 'Integrations', icon: <Network size={16} />, picklists: ['integration_type', 'integration_pattern', 'integration_frequency', 'integration_crud'] },
  ];

  return (
    <div style={{ maxWidth: '1400px', margin: '0 auto', padding: '0 1rem' }}>
      <div style={{ marginBottom: '2.5rem' }}>
        <h1 style={{ fontSize: '2rem', fontWeight: 800, letterSpacing: '-0.02em' }}>Settings & Configuration</h1>
        <p style={{ color: 'var(--muted-foreground)', fontSize: '1.1rem' }}>Fine-tune your enterprise meta model and global branding.</p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '300px 1fr', gap: '3rem', alignItems: 'flex-start' }}>
        {/* Unified Sidebar */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          
          {/* Global Tabs */}
          <div className="card" style={{ padding: '0.5rem' }}>
            <button
              onClick={() => { setActiveTab('strategic'); setSelectedPicklistId(null); }}
              style={{
                width: '100%', justifyContent: 'flex-start', border: 'none',
                background: activeTab === 'strategic' ? 'var(--primary)' : 'transparent',
                color: activeTab === 'strategic' ? 'var(--primary-foreground)' : 'var(--foreground)',
                padding: '0.75rem 1rem', fontSize: '0.875rem', fontWeight: 700,
                textAlign: 'left', display: 'flex', gap: '0.75rem', alignItems: 'center', borderRadius: '8px', cursor: 'pointer'
              }}
            >
              <ShieldCheck size={18} /> Strategic Scales
            </button>
            <button
              onClick={() => { setActiveTab('metadata'); setSelectedPicklistId(null); }}
              style={{
                width: '100%', justifyContent: 'flex-start', border: 'none',
                background: activeTab === 'metadata' ? 'var(--primary)' : 'transparent',
                color: activeTab === 'metadata' ? 'var(--primary-foreground)' : 'var(--foreground)',
                padding: '0.75rem 1rem', fontSize: '0.875rem', fontWeight: 700,
                textAlign: 'left', display: 'flex', gap: '0.75rem', alignItems: 'center', borderRadius: '8px', cursor: 'pointer'
              }}
            >
              <FileCode size={18} /> Custom Attributes
            </button>
          </div>

          {/* Artifact Groups */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            <div style={{ padding: '0 1rem', fontSize: '0.7rem', fontWeight: 800, color: 'var(--muted-foreground)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>Artifact Configuration</div>
            {artifacts.map(art => (
              <div key={art.id} className="card" style={{ padding: '0.5rem', background: 'var(--card)' }}>
                <div style={{ padding: '0.5rem 0.75rem', display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--foreground)', fontWeight: 800, fontSize: '0.8rem', borderBottom: '1px solid var(--border)', marginBottom: '0.25rem', paddingBottom: '0.75rem' }}>
                  {art.icon} {art.label}
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
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
                          padding: '0.6rem 0.75rem', fontSize: '0.825rem', fontWeight: 500,
                          textAlign: 'left', borderRadius: '6px', cursor: 'pointer',
                          display: 'flex', alignItems: 'center', gap: '0.5rem'
                        }}
                      >
                        <ChevronRight size={12} style={{ opacity: isSelected ? 1 : 0.3 }} />
                        {p.label}
                      </button>
                    );
                  })}
                  {art.picklists.length === 0 && <div style={{ padding: '0.5rem 0.75rem', fontSize: '0.75rem', color: 'var(--muted-foreground)', fontStyle: 'italic' }}>No standard picklists</div>}
                </div>
              </div>
            ))}
          </div>

          <div className="card" style={{ padding: '0.5rem' }}>
            <button
              onClick={() => { setActiveTab('branding'); setSelectedPicklistId(null); }}
              style={{
                width: '100%', justifyContent: 'flex-start', border: 'none',
                background: activeTab === 'branding' ? 'var(--accent)' : 'transparent',
                color: activeTab === 'branding' ? 'var(--foreground)' : 'var(--muted-foreground)',
                padding: '0.75rem 1rem', fontSize: '0.875rem', fontWeight: 600,
                textAlign: 'left', display: 'flex', gap: '0.75rem', alignItems: 'center', borderRadius: '8px', cursor: 'pointer'
              }}
            >
              <Palette size={18} /> Global Branding
            </button>
            <button
              onClick={() => { setActiveTab('import-export'); setSelectedPicklistId(null); }}
              style={{
                width: '100%', justifyContent: 'flex-start', border: 'none',
                background: activeTab === 'import-export' ? 'var(--accent)' : 'transparent',
                color: activeTab === 'import-export' ? 'var(--foreground)' : 'var(--muted-foreground)',
                padding: '0.75rem 1rem', fontSize: '0.875rem', fontWeight: 600,
                textAlign: 'left', display: 'flex', gap: '0.75rem', alignItems: 'center', borderRadius: '8px', cursor: 'pointer'
              }}
            >
              <Settings2 size={18} /> Data Management
            </button>
          </div>
        </div>

        {/* Main Content Area */}
        <div style={{ minWidth: 0 }}>
          {activeTab === 'strategic' ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
              <div className="card" style={{ padding: '2rem' }}>
                <h2 style={{ fontSize: '1.5rem', fontWeight: 800, marginBottom: '0.75rem', letterSpacing: '-0.01em' }}>Strategic Assessment Scales</h2>
                <p style={{ fontSize: '1rem', color: 'var(--muted-foreground)', marginBottom: '2.5rem' }}>Configure the scoring ranges and colors used for heat-mapping and CIA risk profiles.</p>
                
                <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '2rem' }}>
                  {strategicPicklists.map(p => (
                    <div key={p.id} style={{ padding: '2rem', background: 'var(--background)', borderRadius: '20px', border: '1px solid var(--border)' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
                        <div>
                          <h3 style={{ fontSize: '1.125rem', fontWeight: 700 }}>{p.label}</h3>
                          <p style={{ fontSize: '0.8rem', color: 'var(--muted-foreground)' }}>System ID: <code style={{ background: 'var(--muted)', padding: '0.1rem 0.4rem', borderRadius: '4px' }}>{p.name}</code></p>
                        </div>
                        <EditRangePicklistDialog 
                          picklist={p} 
                          onSuccess={() => queryClient.invalidateQueries({ queryKey: ['picklists'] })} 
                        />
                      </div>
                      
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', background: 'var(--card)', padding: '1.25rem', borderRadius: '16px', border: '1px solid var(--border)', boxShadow: 'inset 0 2px 4px rgba(0,0,0,0.05)' }}>
                        {p.options.map(opt => (
                          <div key={opt.id} style={{ flex: 1, height: '40px', background: opt.color, borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1px solid rgba(0,0,0,0.1)', position: 'relative' }} title={opt.label}>
                            <span style={{ fontSize: '0.75rem', fontWeight: 900, color: 'white', textShadow: '0 1px 2px rgba(0,0,0,0.3)' }}>{opt.value}</span>
                          </div>
                        ))}
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '0.75rem', padding: '0 0.5rem' }}>
                        <span style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--muted-foreground)' }}>{p.options[0]?.label}</span>
                        <span style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--muted-foreground)' }}>{p.options[p.options.length-1]?.label}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ) : activeTab === 'branding' ? (
            <div className="card" style={{ padding: '2rem' }}>
              <div style={{ marginBottom: '2rem', borderBottom: '1px solid var(--border)', paddingBottom: '1.5rem' }}>
                <h2 style={{ fontSize: '1.5rem', fontWeight: 800 }}>Global Branding</h2>
                <p style={{ color: 'var(--muted-foreground)' }}>Customize the identification of your OpenEA instance.</p>
              </div>
              <div style={{ background: 'var(--background)', padding: '2rem', borderRadius: '16px', border: '1px solid var(--border)' }}>
                <h3 style={{ fontSize: '1rem', fontWeight: 700, marginBottom: '1.25rem' }}>Organization Identity</h3>
                <div className="field">
                  <label className="label">Brand Logo Text</label>
                  <div style={{ display: 'flex', gap: '1rem', marginTop: '0.5rem' }}>
                    <input 
                      value={brandName} 
                      onChange={(e) => onUpdateBrand(e.target.value)} 
                      placeholder="e.g. Acme Corp Architecture"
                      style={{ maxWidth: '400px', fontSize: '1rem', padding: '0.75rem' }}
                    />
                    <button onClick={() => onUpdateBrand('OpenEA')} className="secondary" style={{ height: '3rem' }}>Reset</button>
                  </div>
                  <p style={{ fontSize: '0.8rem', color: 'var(--muted-foreground)', marginTop: '1rem' }}>This text will appear in the main navigation and loading screens.</p>
                </div>
              </div>
            </div>
          ) : activeTab === 'picklists' && selectedPicklist ? (
            <div className="card" style={{ padding: '2rem' }}>
              <div style={{ marginBottom: '2rem', borderBottom: '1px solid var(--border)', paddingBottom: '1.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
                <div>
                  <div style={{ fontSize: '0.75rem', fontWeight: 800, color: 'var(--primary)', textTransform: 'uppercase', marginBottom: '0.5rem' }}>Standard Picklist</div>
                  <h2 style={{ fontSize: '1.75rem', fontWeight: 800, letterSpacing: '-0.02em' }}>{selectedPicklist.label}</h2>
                  <p style={{ color: 'var(--muted-foreground)' }}>
                    Managing allowed values for <code>{selectedPicklist.name}</code>
                  </p>
                </div>
              </div>

              <div style={{ marginBottom: '3rem' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr style={{ textAlign: 'left', borderBottom: '1px solid var(--border)' }}>
                      <th style={{ padding: '1rem', fontSize: '0.75rem', textTransform: 'uppercase', color: 'var(--muted-foreground)' }}>Color</th>
                      <th style={{ padding: '1rem', fontSize: '0.75rem', textTransform: 'uppercase', color: 'var(--muted-foreground)' }}>Label</th>
                      <th style={{ padding: '1rem', fontSize: '0.75rem', textTransform: 'uppercase', color: 'var(--muted-foreground)' }}>Value</th>
                      <th style={{ padding: '1rem', textAlign: 'right' }}></th>
                    </tr>
                  </thead>
                  <tbody>
                    {selectedPicklist.options.map(opt => (
                      <tr key={opt.id} style={{ borderBottom: '1px solid var(--border)' }} className="row-hover">
                        <td style={{ padding: '1rem' }}>
                          <div style={{ width: '28px', height: '28px', borderRadius: '6px', background: opt.color || '#adb5bd', border: '1px solid var(--border)' }} />
                        </td>
                        <td style={{ padding: '1rem', fontSize: '0.925rem', fontWeight: 600 }}>{opt.label}</td>
                        <td style={{ padding: '1rem', fontSize: '0.875rem', color: 'var(--muted-foreground)', fontFamily: 'monospace' }}>{opt.value}</td>
                        <td style={{ padding: '1rem', textAlign: 'right' }}>
                          <button onClick={() => handleDeleteOption(opt.id)} style={{ border: 'none', background: 'transparent', color: 'var(--destructive)', padding: '0.5rem', cursor: 'pointer' }}>
                            <Trash2 size={18} />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div style={{ background: 'var(--background)', padding: '2rem', borderRadius: '16px', border: '1px solid var(--border)' }}>
                <h3 style={{ fontSize: '1rem', fontWeight: 700, marginBottom: '1.5rem' }}>Add New Allowed Value</h3>
                <form onSubmit={handleAddOption} style={{ display: 'grid', gridTemplateColumns: 'auto 1fr 1fr auto', gap: '1.5rem', alignItems: 'flex-end' }}>
                  <div className="field" style={{ margin: 0 }}>
                    <label className="label">Badge Color</label>
                    <input 
                      type="color" 
                      value={newColor} 
                      onChange={(e) => setNewColor(e.target.value)} 
                      style={{ width: '60px', height: '3rem', padding: '4px', cursor: 'pointer' }}
                    />
                  </div>
                  <div className="field" style={{ margin: 0 }}>
                    <label className="label">Display Label</label>
                    <input 
                      value={newLabel}
                      onChange={(e) => {
                        setNewLabel(e.target.value);
                        if (!newValue) setNewValue(e.target.value.replace(/\s+/g, '_').toLowerCase());
                      }}
                      placeholder="e.g. High Priority" required 
                      style={{ height: '3rem' }}
                    />
                  </div>
                  <div className="field" style={{ margin: 0 }}>
                    <label className="label">Database Value</label>
                    <input value={newValue} onChange={(e) => setNewValue(e.target.value)} placeholder="e.g. high_priority" required style={{ height: '3rem' }} />
                  </div>
                  <button type="submit" className="primary" style={{ height: '3rem', padding: '0 1.5rem' }}>
                    <Plus size={18} /> Add Option
                  </button>
                </form>
              </div>
            </div>
          ) : activeTab === 'metadata' ? (
            <div className="card" style={{ padding: '2rem' }}>
              <div style={{ marginBottom: '2rem', borderBottom: '1px solid var(--border)', paddingBottom: '1.5rem' }}>
                <h2 style={{ fontSize: '1.5rem', fontWeight: 800 }}>Custom Attributes</h2>
                <p style={{ color: 'var(--muted-foreground)' }}>Inject dynamically rendered fields into any artifact type.</p>
              </div>

              <div style={{ marginBottom: '3rem' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr style={{ textAlign: 'left', borderBottom: '1px solid var(--border)' }}>
                      <th style={{ padding: '1rem', fontSize: '0.75rem', textTransform: 'uppercase', color: 'var(--muted-foreground)' }}>Target Artifact</th>
                      <th style={{ padding: '1rem', fontSize: '0.75rem', textTransform: 'uppercase', color: 'var(--muted-foreground)' }}>Label</th>
                      <th style={{ padding: '1rem', fontSize: '0.75rem', textTransform: 'uppercase', color: 'var(--muted-foreground)' }}>System Name</th>
                      <th style={{ padding: '1rem', fontSize: '0.75rem', textTransform: 'uppercase', color: 'var(--muted-foreground)' }}>Type</th>
                      <th style={{ padding: '1rem', textAlign: 'right' }}></th>
                    </tr>
                  </thead>
                  <tbody>
                    {metaDefs?.map(def => (
                      <tr key={def.id} style={{ borderBottom: '1px solid var(--border)' }} className="row-hover">
                        <td style={{ padding: '1rem' }}>
                          <span style={{ background: 'var(--primary)', color: 'var(--primary-foreground)', padding: '0.2rem 0.5rem', borderRadius: '4px', fontSize: '0.7rem', fontWeight: 800, textTransform: 'uppercase' }}>{def.entityType}</span>
                        </td>
                        <td style={{ padding: '1rem', fontSize: '0.925rem', fontWeight: 600 }}>{def.label}</td>
                        <td style={{ padding: '1rem', fontSize: '0.825rem', color: 'var(--muted-foreground)', fontFamily: 'monospace' }}>{def.fieldName}</td>
                        <td style={{ padding: '1rem' }}>
                          <span style={{ background: 'var(--secondary)', color: 'var(--secondary-foreground)', padding: '0.2rem 0.5rem', borderRadius: '4px', fontSize: '0.7rem', fontWeight: 700 }}>{def.fieldType}</span>
                        </td>
                        <td style={{ padding: '1rem', textAlign: 'right' }}>
                          <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
                            <EditMetadataDialog 
                              definition={def} 
                              onSuccess={() => queryClient.invalidateQueries({ queryKey: ['metadata-definitions'] })} 
                            />
                            <button onClick={() => handleDeleteMeta(def.id)} style={{ border: 'none', background: 'transparent', color: 'var(--destructive)', padding: '0.5rem', cursor: 'pointer' }}>
                              <Trash2 size={18} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div style={{ background: 'var(--background)', padding: '2rem', borderRadius: '16px', border: '1px solid var(--border)' }}>
                <h3 style={{ fontSize: '1rem', fontWeight: 700, marginBottom: '1.5rem' }}>Define New Attribute</h3>
                <form onSubmit={handleAddMeta}>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '1.5rem', marginBottom: '2rem' }}>
                    <div className="field" style={{ margin: 0 }}>
                      <label className="label">Target Artifact</label>
                      <select value={metaEntity} onChange={(e) => setMetaEntity(e.target.value)} style={{ height: '3rem' }}>
                        {artifacts.map(art => <option key={art.id} value={art.id}>{art.label}</option>)}
                      </select>
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
                        style={{ height: '3rem' }}
                      />
                    </div>
                    <div className="field" style={{ margin: 0 }}>
                      <label className="label">System Property Name</label>
                      <input value={metaName} onChange={(e) => setMetaName(e.target.value)} placeholder="e.g. support_tier" required style={{ height: '3rem' }} />
                    </div>
                    <div className="field" style={{ margin: 0 }}>
                      <label className="label">Input Type</label>
                      <select value={metaType} onChange={(e) => setMetaType(e.target.value)} style={{ height: '3rem' }}>
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
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '1.5rem', marginBottom: '2rem', padding: '1.5rem', background: 'var(--card)', borderRadius: '12px', border: '1px solid var(--border)' }}>
                      <div className="field" style={{ margin: 0 }}>
                        <label className="label">Min Value</label>
                        <input type="number" value={metaMin} onChange={(e) => setMetaMin(Number(e.target.value))} style={{ height: '3rem' }} />
                      </div>
                      <div className="field" style={{ margin: 0 }}>
                        <label className="label">Max Value</label>
                        <input type="number" value={metaMax} onChange={(e) => setMetaMax(Number(e.target.value))} style={{ height: '3rem' }} />
                      </div>
                      <div className="field" style={{ margin: 0 }}>
                        <label className="label">Scale Color Logic</label>
                        <select value={metaScale} onChange={(e) => setMetaScale(e.target.value)} style={{ height: '3rem' }}>
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
                    <button type="submit" className="primary" style={{ height: '3.5rem', padding: '0 2rem' }}>
                      <Plus size={20} style={{ marginRight: '0.5rem' }} /> Create Attribute
                    </button>
                  </div>
                </form>
              </div>
            </div>
          ) : activeTab === 'import-export' ? (
            <ImportExportSettings apps={apps} capabilities={capabilities} integrations={integrations} onRefresh={onRefresh} />
          ) : (
            <div style={{ textAlign: 'center', padding: '4rem', color: 'var(--muted-foreground)' }}>
              Select a configuration category from the sidebar.
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
