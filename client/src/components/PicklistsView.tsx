import React, { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, Trash2, Settings2, GripVertical } from 'lucide-react';

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

export const PicklistsView = () => {
  const queryClient = useQueryClient();
  const [selectedPicklistId, setSelectedPicklistId] = useState<string | null>(null);
  const [newValue, setNewValue] = useState('');
  const [newLabel, setNewLabel] = useState('');

  const { data: picklists, isLoading } = useQuery<Picklist[]>({
    queryKey: ['picklists'],
    queryFn: async () => {
      const res = await fetch('/api/picklists');
      return res.json();
    }
  });

  const selectedPicklist = picklists?.find(p => p.id === selectedPicklistId) || picklists?.[0];

  // Set initial selected picklist once data is loaded
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
      const res = await fetch(`/api/picklist-options/${id}`, {
        method: 'DELETE'
      });

      if (res.ok) {
        queryClient.invalidateQueries({ queryKey: ['picklists'] });
      }
    } catch (err) {
      console.error(err);
    }
  };

  if (isLoading) return <div>Loading settings...</div>;

  return (
    <div>
      <div style={{ marginBottom: '2rem' }}>
        <h1 style={{ fontSize: '1.875rem', fontWeight: 700 }}>Picklists & Configuration</h1>
        <p style={{ color: 'var(--muted-foreground)' }}>Manage the allowed values for multiple-choice fields.</p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '250px 1fr', gap: '2rem' }}>
        {/* Sidebar */}
        <div className="card" style={{ padding: '0.5rem' }}>
          {picklists?.map(p => (
            <button
              key={p.id}
              onClick={() => setSelectedPicklistId(p.id)}
              style={{
                width: '100%',
                justifyContent: 'flex-start',
                border: 'none',
                background: selectedPicklistId === p.id ? 'var(--accent)' : 'transparent',
                color: selectedPicklistId === p.id ? 'var(--foreground)' : 'var(--muted-foreground)',
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

        {/* Content */}
        <div className="card">
          {selectedPicklist ? (
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
                          <button 
                            onClick={() => handleDeleteOption(opt.id)}
                            style={{ border: 'none', background: 'transparent', color: 'var(--destructive)', padding: '0.25rem' }}
                          >
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
                    <label className="label">Label (Visible to user)</label>
                    <input 
                      value={newLabel}
                      onChange={(e) => {
                        setNewLabel(e.target.value);
                        // Auto-slugify label to value if value is empty
                        if (!newValue) setNewValue(e.target.value.replace(/\s+/g, '_').toLowerCase());
                      }}
                      placeholder="e.g. Finance" 
                      required 
                    />
                  </div>
                  <div className="field" style={{ margin: 0 }}>
                    <label className="label">Internal Value (ID)</label>
                    <input 
                      value={newValue}
                      onChange={(e) => setNewValue(e.target.value)}
                      placeholder="e.g. finance" 
                      required 
                    />
                  </div>
                  <button type="submit" className="primary" style={{ height: '2.5rem' }}>
                    <Plus size={18} style={{ marginRight: '0.5rem' }} /> Add
                  </button>
                </form>
              </div>
            </>
          ) : (
            <div style={{ textAlign: 'center', padding: '4rem', color: 'var(--muted-foreground)' }}>
              Select a picklist from the sidebar to manage its options.
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
