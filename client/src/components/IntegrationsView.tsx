import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Network, PlusCircle, ArrowRight, Trash2, Edit2 } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { useLocalStorage } from '../App';
import { getContrastColor } from '../utils/colors';

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
      <div style={{ marginBottom: '1.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
        <div>
          <h1 style={{ fontSize: '1.25rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '0.6rem' }}><Network size={24} /> Integrations</h1>
          <p style={{ color: 'var(--muted-foreground)', fontSize: '0.8rem' }}>Active data flows and dependencies between systems.</p>
        </div>
        <button onClick={() => navigate('/integrations/new')} className="primary" style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', height: '1.8rem', fontSize: '0.8rem' }}>
          <PlusCircle size={14} />
          New Integration
        </button>
      </div>

      <div className="card" style={{ padding: '0.5rem', overflow: 'hidden' }}>
        <table style={{ width: '100%' }}>
          <thead>
            <tr style={{ background: 'var(--muted)' }}>
              <th style={{ padding: '0.6rem 1rem', fontSize: '0.75rem', borderTopLeftRadius: 'var(--radius)', borderBottomLeftRadius: 'var(--radius)' }}>Source Application</th>
              <th style={{ padding: '0.6rem 1rem', fontSize: '0.75rem', textAlign: 'center' }}>Payload & Pattern</th>
              <th style={{ padding: '0.6rem 1rem', fontSize: '0.75rem' }}>Target Application</th>
              <th style={{ padding: '0.6rem 1rem', fontSize: '0.75rem', textAlign: 'right', borderTopRightRadius: 'var(--radius)', borderBottomRightRadius: 'var(--radius)' }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {Array.isArray(integrations) && integrations.map(i => {
              const patternInfo = getPicklistInfo(picklists, 'integration_pattern', i.pattern);
              return (
              <tr key={i.id} className="row-hover" onClick={() => navigate(`/integrations/${i.id}`)}>
                <td style={{ padding: '0.6rem 1rem' }}>
                  <div style={{ fontWeight: 700, fontSize: '0.85rem' }}>{i.sourceApp?.name}</div>
                </td>
                <td style={{ padding: '0.6rem 1rem' }}>
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.35rem' }}>
                    <div style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--primary)' }}>{i.payload?.name || '—'}</div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', color: 'var(--muted-foreground)' }}>
                      {(() => {
                        const hasColor = patternInfo?.color && patternInfo.color !== 'var(--secondary)';
                        const bg = hasColor ? patternInfo!.color : 'var(--secondary)';
                        const text = hasColor ? getContrastColor(patternInfo!.color) : 'var(--secondary-foreground)';
                        return <span style={{ fontSize: '0.55rem', fontWeight: 800, textTransform: 'uppercase', background: bg, color: text, padding: '0.1rem 0.4rem', borderRadius: '4px' }}>{patternInfo?.label || i.pattern || 'API'}</span>;
                      })()}
                      <ArrowRight size={12} style={{ opacity: 0.3 }} />
                      <div style={{ display: 'flex', gap: '0.2rem' }}>
                        {i.crud?.split(',').filter(Boolean).map(op => {
                          const crudInfo = getPicklistInfo(picklists, 'integration_crud', op);
                          const hasColor = crudInfo?.color && crudInfo.color !== 'var(--secondary)';
                          const bg = hasColor ? crudInfo!.color : 'var(--primary)';
                          const text = hasColor ? getContrastColor(crudInfo!.color) : 'var(--primary-foreground)';
                          return (
                          <span key={op} style={{ fontSize: '0.55rem', fontWeight: 800, textTransform: 'uppercase', background: bg, color: text, padding: '0.1rem 0.4rem', borderRadius: '4px' }}>{crudInfo?.label || op}</span>
                        )})}
                      </div>
                    </div>
                  </div>
                </td>
                <td style={{ padding: '0.6rem 1rem' }}>
                  <div style={{ fontWeight: 700, fontSize: '0.85rem' }}>{i.targetApp?.name}</div>
                </td>
                <td style={{ padding: '0.6rem 1rem', textAlign: 'right' }}>
                  <button onClick={(e) => { e.stopPropagation(); navigate(`/integrations/${i.id}/edit`); }} className="secondary" style={{ height: '1.6rem', width: '1.6rem', padding: 0, background: 'transparent', border: 'none' }}><Edit2 size={12} /></button>
                  <button onClick={async (e) => { e.stopPropagation(); if(confirm('Delete integration?')) { await fetch(`/api/integrations/${i.id}`, {method: 'DELETE'}); onRefresh(); } }} className="secondary" style={{ height: '1.6rem', width: '1.6rem', padding: 0, background: 'transparent', border: 'none', color: 'var(--destructive)' }}><Trash2 size={12} /></button>
                </td>
              </tr>
            )})}
            {(!Array.isArray(integrations) || integrations.length === 0) && (
              <tr>
                <td colSpan={4} style={{ padding: '2rem', textAlign: 'center', color: 'var(--muted-foreground)', fontStyle: 'italic', fontSize: '0.8rem' }}>No integrations recorded yet.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};
