import React, { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Network, PlusCircle, ArrowRight, Trash2, Edit2, Map as MapIcon, Filter, X } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { useLocalStorage } from '../App';
import { getContrastColor } from '../utils/colors';
import { FilterDot, MultiSelect, SearchInput } from './FilterControls';
import { SelectionBar, SelectionHeader, SelectionRowCheck, useTableSelection } from './TableSelection';

interface Integration {
  id: string;
  name?: string | null;
  description?: string | null;
  sourceAppId: string;
  targetAppId: string;
  infoObjectId?: string | null;
  pattern?: string;
  frequency?: string;
  crud?: string;
  sourceApp: { id?: string; name: string };
  targetApp: { id?: string; name: string };
  payload?: { id?: string; name: string };
}

type IntegrationFilters = {
  search: string;
  sourceAppId: string[];
  targetAppId: string[];
  payloadId: string[];
  pattern: string[];
  frequency: string[];
  crud: string[];
};

const EMPTY_INTEGRATION_FILTERS: IntegrationFilters = {
  search: '',
  sourceAppId: [],
  targetAppId: [],
  payloadId: [],
  pattern: [],
  frequency: [],
  crud: [],
};

const selected = (values: string[] | undefined, value: string | null | undefined) => {
  if (!values || values.length === 0) return true;
  const raw = value ?? '';
  const lower = raw.toLowerCase();
  return values.some((item) => item === raw || item.toLowerCase() === lower);
};

const crudSelected = (values: string[] | undefined, crud: string | null | undefined) => {
  if (!values || values.length === 0) return true;
  const ops = (crud || '').split(',').map((part) => part.trim()).filter(Boolean);
  return values.some((item) => ops.some((op) => op === item || op.toLowerCase() === item.toLowerCase()));
};

const getPicklistInfo = (picklists: any[] | undefined, picklistName: string, value: string | undefined) => {
  if (!value) return null;
  const list = picklists?.find(p => p.name === picklistName);
  const option = list?.options?.find((o: any) => o.value === String(value));
  return option || { label: value, color: 'var(--secondary)' };
};

export const IntegrationsView = ({ integrations, onRefresh }: { integrations: Integration[], onRefresh: () => void }) => {
  const navigate = useNavigate();
  const [filters, setFilters] = useLocalStorage<IntegrationFilters>('openea_integrations_filters', EMPTY_INTEGRATION_FILTERS);
  const { data: picklists } = useQuery<any[]>({ queryKey: ['picklists'], queryFn: () => fetch('/api/picklists').then(res => res.json()) });
  const rows = useMemo(() => Array.isArray(integrations) ? integrations : [], [integrations]);

  const optionList = (name: string, used: Array<string | null | undefined>) => {
    const fromPicklist = (picklists?.find((list: any) => list.name === name)?.options || [])
      .map((option: any) => ({ value: String(option.value), label: option.label || String(option.value) }));
    const known = new Set(fromPicklist.map((option: { value: string }) => option.value));
    const extras = new Set<string>();
    for (const value of used) {
      const text = (value || '').trim();
      if (text && !known.has(text)) extras.add(text);
    }
    return [
      ...fromPicklist,
      ...[...extras].sort((a, b) => a.localeCompare(b)).map((value) => ({ value, label: value })),
    ];
  };

  const appOptions = (pick: (row: Integration) => { id?: string; name?: string } | undefined, idOf: (row: Integration) => string) => {
    const names = new Map<string, string>();
    for (const row of rows) {
      const id = idOf(row);
      if (!id) continue;
      names.set(id, pick(row)?.name || id);
    }
    return [...names.entries()]
      .map(([value, label]) => ({ value, label }))
      .sort((a, b) => a.label.localeCompare(b.label));
  };

  const sourceOptions = useMemo(() => appOptions((row) => row.sourceApp, (row) => row.sourceAppId), [rows]);
  const targetOptions = useMemo(() => appOptions((row) => row.targetApp, (row) => row.targetAppId), [rows]);
  const payloadOptions = useMemo(() => {
    const names = new Map<string, string>();
    for (const row of rows) {
      const id = row.infoObjectId || row.payload?.id;
      if (id) names.set(id, row.payload?.name || id);
    }
    return [...names.entries()]
      .map(([value, label]) => ({ value, label }))
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [rows]);
  const patternOptions = useMemo(() => optionList('integration_pattern', rows.map((row) => row.pattern)), [picklists, rows]);
  const frequencyOptions = useMemo(() => optionList('integration_frequency', rows.map((row) => row.frequency)), [picklists, rows]);
  const crudOptions = useMemo(
    () => optionList('integration_crud', rows.flatMap((row) => String(row.crud || '').split(',').map((part) => part.trim()))),
    [picklists, rows],
  );

  const labelOf = (picklistName: string, value: string | undefined) => getPicklistInfo(picklists, picklistName, value)?.label || value || '';

  const visible = useMemo(() => {
    const query = (filters.search || '').trim().toLowerCase();
    return rows.filter((row) => {
      const payloadId = row.infoObjectId || row.payload?.id || '';
      const matchesLists = selected(filters.sourceAppId, row.sourceAppId)
        && selected(filters.targetAppId, row.targetAppId)
        && selected(filters.payloadId, payloadId)
        && selected(filters.pattern, row.pattern)
        && selected(filters.frequency, row.frequency)
        && crudSelected(filters.crud, row.crud);
      if (!matchesLists) return false;
      if (!query) return true;
      const crudParts = String(row.crud || '').split(',').map((part) => part.trim()).filter(Boolean);
      const haystack = [
        row.name,
        row.description,
        row.sourceApp?.name,
        row.targetApp?.name,
        row.payload?.name,
        row.pattern,
        labelOf('integration_pattern', row.pattern),
        row.frequency,
        labelOf('integration_frequency', row.frequency),
        ...crudParts,
        ...crudParts.map((op) => labelOf('integration_crud', op)),
      ];
      return haystack.some((part) => (part || '').toLowerCase().includes(query));
    });
  }, [rows, filters, picklists]);

  const visibleIds = useMemo(() => visible.map((row) => row.id), [visible]);
  const selection = useTableSelection(visibleIds);

  const isPanelFilterActive = [filters.sourceAppId, filters.targetAppId, filters.payloadId, filters.pattern, filters.frequency, filters.crud]
    .some((values) => (values?.length || 0) > 0);
  const [showFilters, setShowFilters] = useState(isPanelFilterActive);
  const filtersActive = isPanelFilterActive || (filters.search || '').trim().length > 0;
  const clearFilters = () => setFilters(EMPTY_INTEGRATION_FILTERS);

  const openDiagram = () => {
    const params = new URLSearchParams();
    params.set('mode', 'network');
    const put = (key: string, value: string | string[] | undefined) => {
      if (Array.isArray(value)) {
        if (value.length > 0) params.set(key, value.join(','));
        return;
      }
      const text = (value || '').trim();
      if (text) params.set(key, text);
    };
    put('q', filters.search);
    put('sourceApp', filters.sourceAppId);
    put('targetApp', filters.targetAppId);
    put('payload', filters.payloadId);
    put('pattern', filters.pattern);
    put('frequency', filters.frequency);
    put('crud', filters.crud);
    navigate(`/diagrams?${params.toString()}`);
  };

  return (
    <div>
      <div style={{ marginBottom: '1.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', gap: '1rem', flexWrap: 'wrap' }}>
        <div>
          <h1 style={{ fontSize: '1.25rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '0.6rem' }}><Network size={24} /> Integrations</h1>
          <p style={{ color: 'var(--muted-foreground)', fontSize: '0.8rem' }}>
            Active data flows and dependencies between systems.
            {filtersActive && <> Showing <strong>{visible.length}</strong> of <strong>{rows.length}</strong>.</>}
          </p>
        </div>
        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
          <div style={{ width: '220px' }}>
            <SearchInput
              value={filters.search || ''}
              onChange={(val) => setFilters({ ...filters, search: val })}
              placeholder="Quick filter"
              ariaLabel="Quick filter"
              style={{ height: '2.2rem', fontSize: '0.9rem' }}
            />
          </div>
          <button
            type="button"
            onClick={() => setShowFilters(!showFilters)}
            aria-expanded={showFilters}
            aria-label={isPanelFilterActive ? 'Filters, applied' : 'Filters'}
            style={{ position: 'relative', height: '2.2rem', padding: isPanelFilterActive ? '0 1.15rem 0 0.6rem' : '0 0.6rem', border: `1px solid ${isPanelFilterActive ? 'var(--brand-focus)' : 'var(--border)'}`, background: showFilters ? 'var(--accent)' : 'var(--background)', fontSize: '0.9rem' }}
          >
            <Filter size={16} style={{ marginRight: '0.4rem', color: isPanelFilterActive ? 'var(--brand-focus)' : undefined }} />
            Filters
            {isPanelFilterActive && <FilterDot badge />}
          </button>
          <button
            type="button"
            onClick={openDiagram}
            title={filtersActive ? 'Show these integrations on the landscape' : 'Show integrations on the landscape'}
            style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', height: '2.2rem', padding: '0 0.75rem', fontSize: '0.9rem', background: 'var(--background)', border: '1px solid var(--brand-focus)' }}
          >
            <MapIcon size={16} />
            View diagram
          </button>
          <button onClick={() => navigate('/integrations/new')} className="primary" style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', height: '2.2rem', fontSize: '0.9rem' }}>
            <PlusCircle size={14} />
            New Integration
          </button>
        </div>
      </div>

      {showFilters && (
        <div className="card" style={{ marginBottom: '1.25rem', background: 'var(--background)', padding: '1rem' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: '0.75rem', alignItems: 'flex-end' }}>
            <MultiSelect label="Source" options={sourceOptions} selectedValues={filters.sourceAppId || []} onChange={(val) => setFilters({ ...filters, sourceAppId: val })} placeholder="All" style={{ height: '2.2rem', fontSize: '0.9rem' }} />
            <MultiSelect label="Target" options={targetOptions} selectedValues={filters.targetAppId || []} onChange={(val) => setFilters({ ...filters, targetAppId: val })} placeholder="All" style={{ height: '2.2rem', fontSize: '0.9rem' }} />
            <MultiSelect label="Payload" options={payloadOptions} selectedValues={filters.payloadId || []} onChange={(val) => setFilters({ ...filters, payloadId: val })} placeholder="All" style={{ height: '2.2rem', fontSize: '0.9rem' }} />
            <MultiSelect label="Pattern" options={patternOptions} selectedValues={filters.pattern || []} onChange={(val) => setFilters({ ...filters, pattern: val })} placeholder="All" style={{ height: '2.2rem', fontSize: '0.9rem' }} />
            <MultiSelect label="Frequency" options={frequencyOptions} selectedValues={filters.frequency || []} onChange={(val) => setFilters({ ...filters, frequency: val })} placeholder="All" style={{ height: '2.2rem', fontSize: '0.9rem' }} />
            <MultiSelect label="CRUD" options={crudOptions} selectedValues={filters.crud || []} onChange={(val) => setFilters({ ...filters, crud: val })} placeholder="All" style={{ height: '2.2rem', fontSize: '0.9rem' }} />
            <button type="button" onClick={clearFilters} style={{ height: '2.2rem', borderColor: 'transparent', color: 'var(--muted-foreground)', fontSize: '0.9rem' }}><X size={16} style={{ marginRight: '0.4rem' }} /> Clear</button>
          </div>
        </div>
      )}

      <div className="card" style={{ padding: '0.5rem', overflow: 'hidden' }}>
        <SelectionBar
          selection={selection}
          singular="integration"
          plural="integrations"
          deletePath={(id) => `/api/integrations/${id}`}
          editPath={(id) => `/integrations/${id}/edit`}
          onRefresh={onRefresh}
        />
        <table style={{ width: '100%' }}>
          <thead>
            <tr style={{ background: 'var(--muted)' }}>
              <SelectionHeader selection={selection} style={{ borderTopLeftRadius: 'var(--radius)', borderBottomLeftRadius: 'var(--radius)' }} />
              <th style={{ padding: '0.6rem 1rem', fontSize: '0.75rem' }}>Source Application</th>
              <th style={{ padding: '0.6rem 1rem', fontSize: '0.75rem', textAlign: 'center' }}>Payload & Pattern</th>
              <th style={{ padding: '0.6rem 1rem', fontSize: '0.75rem' }}>Target Application</th>
              <th style={{ padding: '0.6rem 1rem', fontSize: '0.75rem', textAlign: 'right', borderTopRightRadius: 'var(--radius)', borderBottomRightRadius: 'var(--radius)' }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {visible.map(i => {
              const patternInfo = getPicklistInfo(picklists, 'integration_pattern', i.pattern);
              return (
              <tr key={i.id} className={selection.has(i.id) ? 'row-hover table-row-selected' : 'row-hover'} onClick={() => navigate(`/integrations/${i.id}`)}>
                <SelectionRowCheck selection={selection} id={i.id} label={`${i.sourceApp?.name || 'Source'} to ${i.targetApp?.name || 'target'}`} />
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
            {visible.length === 0 && (
              <tr>
                <td colSpan={5} style={{ padding: '2rem', textAlign: 'center', color: 'var(--muted-foreground)', fontStyle: 'italic', fontSize: '0.8rem' }}>
                  {rows.length === 0 ? 'No integrations recorded yet.' : 'No integrations match the filter.'}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};
