import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Network, PlusCircle, ArrowRight, Trash2, Edit2, ShieldAlert } from 'lucide-react';

interface Integration {
  id: string;
  sourceAppId: string;
  targetAppId: string;
  infoObjectId?: string | null;
  status?: string;
  pattern?: string;
  frequency?: string;
  crud?: string;
  sourceApp: { name: string };
  targetApp: { name: string };
  payload?: { name: string };
}

export const IntegrationsView = ({ integrations, onRefresh }: { integrations: Integration[], onRefresh: () => void }) => {
  const navigate = useNavigate();

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
              <th style={{ padding: '1rem', fontSize: '0.875rem' }}>Status</th>
              <th style={{ padding: '1rem', fontSize: '0.875rem', textAlign: 'right' }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {Array.isArray(integrations) && integrations.map(i => (
              <tr key={i.id} className="row-hover" style={{ borderBottom: '1px solid var(--border)' }} onClick={() => navigate(`/integrations/${i.id}`)}>
                <td style={{ padding: '1rem' }}>
                  <div style={{ fontWeight: 700, fontSize: '0.925rem' }}>{i.sourceApp?.name}</div>
                </td>
                <td style={{ padding: '1rem' }}>
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.25rem' }}>
                    <div style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--primary)' }}>{i.payload?.name || '—'}</div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--muted-foreground)' }}>
                      <span style={{ fontSize: '0.6rem', fontWeight: 800, textTransform: 'uppercase', background: 'var(--secondary)', padding: '0.1rem 0.4rem', borderRadius: '4px' }}>{i.pattern || 'API'}</span>
                      <ArrowRight size={14} style={{ opacity: 0.3 }} />
                      <span style={{ fontSize: '0.6rem', fontWeight: 800, textTransform: 'uppercase', background: 'var(--secondary)', padding: '0.1rem 0.4rem', borderRadius: '4px' }}>{i.crud || 'READ'}</span>
                    </div>
                  </div>
                </td>
                <td style={{ padding: '1rem' }}>
                  <div style={{ fontWeight: 700, fontSize: '0.925rem' }}>{i.targetApp?.name}</div>
                </td>
                <td style={{ padding: '1rem' }}>
                  <span style={{ fontSize: '0.7rem', fontWeight: 800, textTransform: 'uppercase', padding: '0.15rem 0.6rem', borderRadius: '4px', background: 'var(--secondary)', color: 'var(--secondary-foreground)' }}>
                    {i.status || 'Active'}
                  </span>
                </td>
                <td style={{ padding: '1rem', textAlign: 'right' }}>
                  <button onClick={(e) => { e.stopPropagation(); navigate(`/integrations/${i.id}/edit`); }} className="secondary" style={{ height: '2rem', width: '2rem', padding: 0, background: 'transparent', border: 'none' }}><Edit2 size={14} /></button>
                  <button onClick={async (e) => { e.stopPropagation(); if(confirm('Delete integration?')) { await fetch(`/api/integrations/${i.id}`, {method: 'DELETE'}); onRefresh(); } }} className="secondary" style={{ height: '2rem', width: '2rem', padding: 0, background: 'transparent', border: 'none', color: 'var(--destructive)' }}><Trash2 size={14} /></button>
                </td>
              </tr>
            ))}
            {integrations.length === 0 && (
              <tr>
                <td colSpan={5} style={{ padding: '3rem', textAlign: 'center', color: 'var(--muted-foreground)', fontStyle: 'italic' }}>No integrations recorded yet.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};
