import React from 'react';
import { useNavigate } from 'react-router-dom';
import { FileText, PlusCircle, LayoutGrid, List, Trash2, Edit2, ShieldCheck } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { useLocalStorage } from '../App';

interface InformationObject {
  id: string;
  name: string;
  description?: string;
  confidentiality?: string;
  integrity?: string;
  availability?: string;
  piiCategory?: string;
  type?: string;
  businessOwner?: { name: string };
}

const InfoCard = ({ item, onRefresh, picklists }: { item: InformationObject, onRefresh: () => void, picklists: any[] }) => {
  const navigate = useNavigate();
  
  const getPicklistInfo = (picklistName: string, value: string) => {
    const list = picklists?.find(p => p.name === picklistName);
    const option = list?.options?.find((o: any) => o.value === String(value));
    return option || { label: value || '—', color: 'var(--muted-foreground)' };
  };

  const piiInfo = getPicklistInfo('pii_category', item.piiCategory || '1');
  const confInfo = getPicklistInfo('cia_scale', item.confidentiality || '1');

  const typeInfo = getPicklistInfo('information_type', item.type || '');

  return (
    <div className="card row-hover" style={{ padding: '1rem', display: 'flex', flexDirection: 'column', gap: '0.75rem', height: '100%' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div onClick={() => navigate(`/information/${item.id}`)} style={{ cursor: 'pointer', flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginBottom: '0.2rem' }}>
            <FileText size={16} style={{ color: '#e67700' }} />
            <h3 style={{ fontSize: '0.95rem', fontWeight: 700, margin: 0 }}>{item.name}</h3>
          </div>
          <div style={{ fontSize: '0.7rem', color: 'var(--muted-foreground)', fontWeight: 600, textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
            {typeInfo.color !== 'var(--muted-foreground)' && <div style={{ width: '6px', height: '6px', borderRadius: '50%', background: typeInfo.color }} />}
            {typeInfo.label || item.type || 'Data Concept'}
          </div>
        </div>
        <div style={{ display: 'flex', gap: '0.4rem' }}>
          <button onClick={() => navigate(`/information/${item.id}/edit`)} className="secondary" style={{ height: '1.6rem', width: '1.6rem', padding: 0 }}><Edit2 size={12} /></button>
          <button onClick={async (e) => { e.stopPropagation(); if(confirm('Delete?')) { await fetch(`/api/information-objects/${item.id}`, {method: 'DELETE'}); onRefresh(); } }} className="secondary" style={{ height: '1.6rem', width: '1.6rem', padding: 0, color: 'var(--destructive)' }}><Trash2 size={12} /></button>
        </div>
      </div>
      
      {item.description && <p style={{ fontSize: '0.75rem', color: 'var(--muted-foreground)', margin: 0, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{item.description}</p>}

      <div style={{ marginTop: 'auto', display: 'flex', flexWrap: 'wrap', gap: '0.4rem' }}>
        <span style={{ fontSize: '0.55rem', fontWeight: 900, textTransform: 'uppercase', padding: '0.1rem 0.4rem', borderRadius: '4px', background: 'var(--secondary)', color: 'var(--secondary-foreground)', border: '1px solid var(--border)' }}>
          C: {confInfo.label.split(' - ')[0]}
        </span>
        <span style={{ fontSize: '0.55rem', fontWeight: 900, textTransform: 'uppercase', padding: '0.1rem 0.4rem', borderRadius: '4px', background: piiInfo.color, color: 'white' }}>
          PII: {piiInfo.label.split(' - ')[0]}
        </span>
      </div>
      
      <div style={{ borderTop: '1px solid var(--border)', paddingTop: '0.6rem', display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.7rem', color: 'var(--muted-foreground)' }}>
        <ShieldCheck size={10} />
        <span>Owner: <strong>{item.businessOwner?.name || 'Unassigned'}</strong></span>
      </div>
    </div>
  );
};

export const InformationView = ({ informationObjects, onRefresh }: { informationObjects: InformationObject[], onRefresh: () => void }) => {
  const navigate = useNavigate();
  const [viewMode, setViewMode] = useLocalStorage<'grid' | 'list'>('openea_information_view', 'grid');
  const { data: picklists } = useQuery<any[]>({ queryKey: ['picklists'], queryFn: () => fetch('/api/picklists').then(res => res.json()) });

  const getLabel = (picklist: string, val: string) => {
    const list = picklists?.find(p => p.name === picklist);
    return list?.options?.find((o: any) => o.value === String(val))?.label || val || '—';
  };

  return (
    <div>
      <div style={{ marginBottom: '1.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
        <div>
          <h1 style={{ fontSize: '1.25rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '0.6rem' }}><FileText size={24} /> Information Model</h1>
          <p style={{ color: 'var(--muted-foreground)', fontSize: '0.8rem' }}>Conceptual business data objects and compliance metadata.</p>
        </div>
        <div style={{ display: 'flex', gap: '0.65rem', alignItems: 'center' }}>
          <div style={{ display: 'flex', background: 'var(--secondary)', padding: '0.15rem', borderRadius: 'var(--radius)', gap: '0.15rem' }}>
            <button onClick={() => setViewMode('grid')} style={{ height: '1.8rem', padding: '0 0.6rem', border: 'none', background: viewMode === 'grid' ? 'var(--background)' : 'transparent', boxShadow: viewMode === 'grid' ? '0 1px 2px rgba(0,0,0,0.1)' : 'none', cursor: 'pointer' }}><LayoutGrid size={14} /></button>
            <button onClick={() => setViewMode('list')} style={{ height: '1.8rem', padding: '0 0.6rem', border: 'none', background: viewMode === 'list' ? 'var(--background)' : 'transparent', boxShadow: viewMode === 'list' ? '0 1px 2px rgba(0,0,0,0.1)' : 'none', cursor: 'pointer' }}><List size={14} /></button>
          </div>
          <button onClick={() => navigate('/information/new')} className="primary" style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', height: '1.8rem', fontSize: '0.8rem' }}>
            <PlusCircle size={14} />
            New
          </button>
        </div>
      </div>

      {viewMode === 'grid' ? (
        <div className="grid">
          {Array.isArray(informationObjects) && informationObjects.map(io => (
            <InfoCard key={io.id} item={io} onRefresh={onRefresh} picklists={picklists || []} />
          ))}
        </div>
      ) : (
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border)', background: 'var(--muted)' }}>
                <th style={{ padding: '0.6rem 1rem', fontSize: '0.75rem' }}>Name</th>
                <th style={{ padding: '0.6rem 1rem', fontSize: '0.75rem' }}>Confidentiality</th>
                <th style={{ padding: '0.6rem 1rem', fontSize: '0.75rem' }}>PII Category</th>
                <th style={{ padding: '0.6rem 1rem', fontSize: '0.75rem' }}>Business Owner</th>
                <th style={{ padding: '0.6rem 1rem', fontSize: '0.75rem', textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {Array.isArray(informationObjects) && informationObjects.map(io => {
                const listTypeInfo = picklists?.find(p => p.name === 'information_type')?.options?.find((o: any) => o.value === io.type);
                return (
                <tr key={io.id} className="row-hover" style={{ borderBottom: '1px solid var(--border)' }} onClick={() => navigate(`/information/${io.id}`)}>
                  <td style={{ padding: '0.6rem 1rem' }}>
                    <div style={{ fontWeight: 700, fontSize: '0.85rem' }}>{io.name}</div>
                    <div style={{ fontSize: '0.65rem', color: 'var(--muted-foreground)', display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                      {listTypeInfo?.color && <div style={{ width: '6px', height: '6px', borderRadius: '50%', background: listTypeInfo.color }} />}
                      {listTypeInfo?.label || io.type}
                    </div>
                  </td>
                  <td style={{ padding: '0.6rem 1rem', fontSize: '0.75rem' }}>{getLabel('cia_scale', io.confidentiality || '1')}</td>
                  <td style={{ padding: '0.6rem 1rem', fontSize: '0.75rem' }}>{getLabel('pii_category', io.piiCategory || '1')}</td>
                  <td style={{ padding: '0.6rem 1rem', fontSize: '0.75rem' }}>{io.businessOwner?.name || '—'}</td>
                  <td style={{ padding: '0.6rem 1rem', textAlign: 'right' }}>
                    <button onClick={(e) => { e.stopPropagation(); navigate(`/information/${io.id}/edit`); }} className="secondary" style={{ height: '1.6rem', width: '1.6rem', padding: 0, background: 'transparent', border: 'none' }}><Edit2 size={12} /></button>
                  </td>
                </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};
