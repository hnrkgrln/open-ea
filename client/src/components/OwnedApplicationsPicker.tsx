import React, { useMemo, useState } from 'react';
import { CheckCircle2, Database, Plus } from 'lucide-react';
import { InlineFilter } from './FilterControls';

export type OwnedApplicationOption = {
  id: string;
  name?: string | null;
  ownerOrgId?: string | null;
  ownerOrg?: { name?: string | null } | null;
};

// Same searchable toggle grid as Supported Capabilities. Directly owned
// applications are selected. Applications owned by a child organization sit
// with them, labeled with that child, and are not part of the saved selection.
export const OwnedApplicationsPicker = ({
  applications,
  selectedIds,
  onToggle,
  currentOrgId,
  childOwnedLabels,
}: {
  applications: OwnedApplicationOption[];
  selectedIds: string[];
  onToggle: (id: string) => void;
  currentOrgId?: string | null;
  childOwnedLabels?: ReadonlyMap<string, string>;
}) => {
  const [search, setSearch] = useState('');
  const selected = useMemo(() => new Set(selectedIds), [selectedIds]);
  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    const rank = (id: string) => selected.has(id) ? 0 : childOwnedLabels?.has(id) ? 1 : 2;
    return [...applications]
      .filter((app) => app?.id && (!query || String(app.name || '').toLowerCase().includes(query)))
      .sort((left, right) => {
        const byRank = rank(left.id) - rank(right.id);
        if (byRank !== 0) return byRank;
        return String(left.name || '').localeCompare(String(right.name || ''), undefined, { numeric: true });
      });
  }, [applications, search, selected, childOwnedLabels]);

  return (
    <section>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '1rem', marginBottom: '1.25rem' }}>
        <h3 style={{ fontSize: '0.75rem', fontWeight: 800, textTransform: 'uppercase', color: 'var(--muted-foreground)', display: 'flex', alignItems: 'center', gap: '0.6rem', margin: 0 }}>
          <Database size={16} /> Owned Applications
        </h3>
        <InlineFilter value={search} onChange={setSearch} placeholder="Search applications..." width="250px" />
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: '0.75rem', maxHeight: '350px', overflowY: 'auto', padding: '1rem', background: 'var(--card)', borderRadius: '16px', border: '1px solid var(--border)' }}>
          {filtered.length === 0 ? (
            <div style={{ color: 'var(--muted-foreground)', fontSize: '0.8rem', fontStyle: 'italic', gridColumn: '1 / -1' }}>
              {applications.length === 0 ? 'No applications defined yet.' : 'No matches.'}
            </div>
          ) : filtered.map((app) => {
            const on = selected.has(app.id);
            const viaChild = !on ? childOwnedLabels?.get(app.id) || '' : '';
            const hint = !on && !viaChild && app.ownerOrgId && app.ownerOrgId !== currentOrgId ? app.ownerOrg?.name || '' : '';
            return (
              <button
                key={app.id}
                type="button"
                data-ownership={on ? 'direct' : viaChild ? 'child' : 'none'}
                title={viaChild ? `Owned by ${viaChild}` : undefined}
                onClick={() => { if (!viaChild) onToggle(app.id); }}
                style={{
                  height: 'auto',
                  padding: '0.75rem',
                  justifyContent: 'flex-start',
                  background: on ? 'var(--primary)' : viaChild ? 'color-mix(in srgb, var(--primary) 16%, var(--background))' : 'var(--background)',
                  color: on ? 'var(--primary-foreground)' : 'var(--foreground)',
                  border: viaChild ? '1px dashed var(--primary)' : '1px solid var(--border)',
                  textAlign: 'left',
                  fontSize: '0.8rem',
                  cursor: viaChild ? 'default' : 'pointer',
                }}
              >
                {on || viaChild
                  ? <CheckCircle2 size={14} style={{ marginRight: '0.4rem', flexShrink: 0, color: on ? undefined : 'var(--primary)' }} />
                  : <Plus size={14} style={{ marginRight: '0.4rem', opacity: 0.3, flexShrink: 0 }} />}
                <span style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', minWidth: 0 }}>
                  <span>{app.name || 'Untitled'}</span>
                  {viaChild ? <span style={{ fontSize: '0.65rem', fontWeight: 700, color: 'var(--primary)' }}>{viaChild}</span> : null}
                  {hint ? <span style={{ fontSize: '0.65rem', fontWeight: 600, opacity: 0.7 }}>{hint}</span> : null}
                </span>
              </button>
            );
          })}
        </div>
    </section>
  );
};
