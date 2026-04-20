import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Share2, PlusCircle, LayoutGrid, List, Trash2, Edit2, ShieldAlert, ShieldCheck } from 'lucide-react';

interface InformationObject {
  id: string;
  name: string;
  description?: string;
  classification?: string;
  piiCategory?: string;
  type?: string;
  businessOwner?: { name: string };
}

const InfoCard = ({ item, onRefresh }: { item: InformationObject, onRefresh: () => void }) => {
  const navigate = useNavigate();
  return (
    <div className="card row-hover" style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1rem', height: '100%' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div onClick={() => navigate(`/information/${item.id}`)} style={{ cursor: 'pointer', flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.25rem' }}>
            <Share2 size={18} style={{ color: 'var(--primary)' }} />
            <h3 style={{ fontSize: '1.125rem', fontWeight: 700, margin: 0 }}>{item.name}</h3>
          </div>
          <div style={{ fontSize: '0.75rem', color: 'var(--muted-foreground)', fontWeight: 600, textTransform: 'uppercase' }}>{item.type || 'Data Concept'}</div>
        </div>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <button onClick={() => navigate(`/information/${item.id}/edit`)} className="secondary" style={{ height: '2rem', width: '2rem', padding: 0 }}><Edit2 size={14} /></button>
          <button onClick={async (e) => { e.stopPropagation(); if(confirm('Delete?')) { await fetch(`/api/information-objects/${item.id}`, {method: 'DELETE'}); onRefresh(); } }} className="secondary" style={{ height: '2rem', width: '2rem', padding: 0, color: 'var(--destructive)' }}><Trash2 size={14} /></button>
        </div>
      </div>
      
      {item.description && <p style={{ fontSize: '0.875rem', color: 'var(--muted-foreground)', margin: 0, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{item.description}</p>}

      <div style={{ marginTop: 'auto', display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
        {item.classification && <span style={{ fontSize: '0.65rem', fontWeight: 800, textTransform: 'uppercase', padding: '0.15rem 0.5rem', borderRadius: '4px', background: 'var(--secondary)', color: 'var(--secondary-foreground)' }}>{item.classification}</span>}
        {item.piiCategory && <span style={{ fontSize: '0.65rem', fontWeight: 800, textTransform: 'uppercase', padding: '0.15rem 0.5rem', borderRadius: '4px', background: item.piiCategory === 'None' ? 'var(--muted)' : '#fff0f6', color: item.piiCategory === 'None' ? 'var(--muted-foreground)' : '#d6336c', border: item.piiCategory === 'None' ? '1px solid var(--border)' : '1px solid #ffdeeb' }}>{item.piiCategory}</span>}
      </div>
      
      <div style={{ borderTop: '1px solid var(--border)', paddingTop: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.75rem', color: 'var(--muted-foreground)' }}>
        <ShieldCheck size={12} />
        <span>Owner: <strong>{item.businessOwner?.name || 'Unassigned'}</strong></span>
      </div>
    </div>
  );
};

export const InformationView = ({ informationObjects, onRefresh }: { informationObjects: InformationObject[], onRefresh: () => void }) => {
  const navigate = useNavigate();
  const [viewMode, setViewMode] = React.useState<'grid' | 'list'>('grid');

  return (
    <div>
      <div style={{ marginBottom: '2.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
        <div>
          <h1 style={{ fontSize: '1.875rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '0.75rem' }}><Share2 size={32} /> Information Model</h1>
          <p style={{ color: 'var(--muted-foreground)' }}>Conceptual business data objects and compliance metadata.</p>
        </div>
        <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
          <div style={{ display: 'flex', background: 'var(--secondary)', padding: '0.25rem', borderRadius: 'var(--radius)', gap: '0.25rem' }}>
            <button onClick={() => setViewMode('grid')} style={{ height: '2rem', padding: '0 0.75rem', border: 'none', background: viewMode === 'grid' ? 'var(--background)' : 'transparent', boxShadow: viewMode === 'grid' ? '0 1px 2px rgba(0,0,0,0.1)' : 'none', cursor: 'pointer' }}><LayoutGrid size={16} /></button>
            <button onClick={() => setViewMode('list')} style={{ height: '2rem', padding: '0 0.75rem', border: 'none', background: viewMode === 'list' ? 'var(--background)' : 'transparent', boxShadow: viewMode === 'list' ? '0 1px 2px rgba(0,0,0,0.1)' : 'none', cursor: 'pointer' }}><List size={16} /></button>
          </div>
          <button onClick={() => navigate('/information/new')} className="primary" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <PlusCircle size={18} />
            New Information Object
          </button>
        </div>
      </div>

      {viewMode === 'grid' ? (
        <div className="grid">
          {informationObjects.map(io => (
            <InfoCard key={io.id} item={io} onRefresh={onRefresh} />
          ))}
        </div>
      ) : (
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border)', background: 'var(--muted)' }}>
                <th style={{ padding: '1rem', fontSize: '0.875rem' }}>Name</th>
                <th style={{ padding: '1rem', fontSize: '0.875rem' }}>Classification</th>
                <th style={{ padding: '1rem', fontSize: '0.875rem' }}>PII Category</th>
                <th style={{ padding: '1rem', fontSize: '0.875rem' }}>Business Owner</th>
                <th style={{ padding: '1rem', fontSize: '0.875rem', textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {informationObjects.map(io => (
                <tr key={io.id} className="row-hover" style={{ borderBottom: '1px solid var(--border)' }} onClick={() => navigate(`/information/${io.id}`)}>
                  <td style={{ padding: '1rem' }}>
                    <div style={{ fontWeight: 700, fontSize: '0.925rem' }}>{io.name}</div>
                    <div style={{ fontSize: '0.7rem', color: 'var(--muted-foreground)' }}>{io.type}</div>
                  </td>
                  <td style={{ padding: '1rem', fontSize: '0.875rem' }}>{io.classification || '—'}</td>
                  <td style={{ padding: '1rem', fontSize: '0.875rem' }}>{io.piiCategory || '—'}</td>
                  <td style={{ padding: '1rem', fontSize: '0.875rem' }}>{io.businessOwner?.name || '—'}</td>
                  <td style={{ padding: '1rem', textAlign: 'right' }}>
                    <button onClick={(e) => { e.stopPropagation(); navigate(`/information/${io.id}/edit`); }} className="secondary" style={{ height: '2rem', width: '2rem', padding: 0, background: 'transparent', border: 'none' }}><Edit2 size={14} /></button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};
