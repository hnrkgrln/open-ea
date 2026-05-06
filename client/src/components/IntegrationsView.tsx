import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Network, PlusCircle, ArrowRight, Trash2, Edit2, ShieldAlert } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { useLocalStorage } from '../App';

interface Integration {
  id: string;
  sourceAppId: string;
  targetAppId: string;
  infoObjectId?: string | null;
  pattern?: string;
  frequency?: string;
  crud?: string;
  sourceApp: { name: string };
  targetApp: { name: string };
  payload?: { name: string };
}

const getPicklistInfo = (picklists: any[] | undefined, picklistName: string, value: string | undefined) => {
  if (!value) return null;
  const list = picklists?.find(p => p.name === picklistName);
  const option = list?.options?.find((o: any) => o.value === String(value));
  return option || { label: value, color: 'var(--secondary)' };
};

export const IntegrationsView = ({ integrations, onRefresh }: { integrations: Integration[], onRefresh: () => void }) => {
  const navigate = useNavigate();
  const [viewMode, setViewMode] = useLocalStorage<'grid' | 'list'>('openea_integrations_view', 'grid');
  const { data: picklists } = useQuery<any[]>({ queryKey: ['picklists'], queryFn: () => fetch('/api/picklists').then(res => res.json()) });

  return (
    <div>
      <div style={{ marginBottom: '2.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
        <div>
          <h1 style={{ fontSize: '1.875rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '0.75rem' }}><Network size={32} /> Integrations</h1>
          <p style={{ color: 'var(--muted-foreground)' }}>Active data flows and dependencies between systems.</p>
        </div>
        <button onClick={() => navigate('/integrations/new')} className="primary" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <PlusCircle size={18} />
          New Integration
        </button>
      </div>

      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
          <thead>
            <tr style={{ borderBottom: '1px solid var(--border)', background: 'var(--muted)' }}>
              <th style={{ padding: '1rem', fontSize: '0.875rem' }}>Source Application</th>
              <th style={{ padding: '1rem', fontSize: '0.875rem', textAlign: 'center' }}>Payload & Pattern</th>
              <th style={{ padding: '1rem', fontSize: '0.875rem' }}>Target Application</th>
              <th style={{ padding: '1rem', fontSize: '0.875rem', textAlign: 'right' }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {Array.isArray(integrations) && integrations.map(i => {
              const patternInfo = getPicklistInfo(picklists, 'integration_pattern', i.pattern);
              return (
              <tr key={i.id} className="row-hover" style={{ borderBottom: '1px solid var(--border)' }} onClick={() => navigate(`/integrations/${i.id}`)}>
                <td style={{ padding: '1rem' }}>
                  <div style={{ fontWeight: 700, fontSize: '0.925rem' }}>{i.sourceApp?.name}</div>
                </td>
                <td style={{ padding: '1rem' }}>
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.4rem' }}>
                    <div style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--primary)' }}>{i.payload?.name || '—'}</div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', color: 'var(--muted-foreground)' }}>
                      <span style={{ fontSize: '0.6rem', fontWeight: 800, textTransform: 'uppercase', background: patternInfo?.color !== 'var(--secondary)' ? patternInfo?.color : 'var(--secondary)', color: patternInfo?.color !== 'var(--secondary)' ? 'white' : 'var(--secondary-foreground)', padding: '0.1rem 0.4rem', borderRadius: '4px' }}>{patternInfo?.label || i.pattern || 'API'}</span>
                      <ArrowRight size={14} style={{ opacity: 0.3 }} />
                      <div style={{ display: 'flex', gap: '0.2rem' }}>
                        {i.crud?.split(',').filter(Boolean).map(op => {
                          const crudInfo = getPicklistInfo(picklists, 'integration_crud', op);
                          return (
                          <span key={op} style={{ fontSize: '0.6rem', fontWeight: 800, textTransform: 'uppercase', background: crudInfo?.color !== 'var(--secondary)' ? crudInfo?.color : 'var(--primary)', color: crudInfo?.color !== 'var(--secondary)' ? 'white' : 'var(--primary-foreground)', padding: '0.1rem 0.4rem', borderRadius: '4px' }}>{crudInfo?.label || op}</span>
                        )})}
                      </div>
                    </div>
                  </div>
                </td>
                <td style={{ padding: '1rem' }}>
                  <div style={{ fontWeight: 700, fontSize: '0.925rem' }}>{i.targetApp?.name}</div>
                </td>
                <td style={{ padding: '1rem', textAlign: 'right' }}>
                  <button onClick={(e) => { e.stopPropagation(); navigate(`/integrations/${i.id}/edit`); }} className="secondary" style={{ height: '2rem', width: '2rem', padding: 0, background: 'transparent', border: 'none' }}><Edit2 size={14} /></button>
                  <button onClick={async (e) => { e.stopPropagation(); if(confirm('Delete integration?')) { await fetch(`/api/integrations/${i.id}`, {method: 'DELETE'}); onRefresh(); } }} className="secondary" style={{ height: '2rem', width: '2rem', padding: 0, background: 'transparent', border: 'none', color: 'var(--destructive)' }}><Trash2 size={14} /></button>
                </td>
              </tr>
            )})}
            {(!Array.isArray(integrations) || integrations.length === 0) && (
              <tr>
                <td colSpan={4} style={{ padding: '3rem', textAlign: 'center', color: 'var(--muted-foreground)', fontStyle: 'italic' }}>No integrations recorded yet.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};
