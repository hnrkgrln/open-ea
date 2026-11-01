import React from 'react';
import { Database, Edit2, Layers } from 'lucide-react';
import { LifecycleBadge } from './LifecycleBadge';
import { DEFAULT_TIME_THRESHOLDS, getAppTimeAssessment, type TimeThresholds } from '../timeAssessment';

export const APPLICATION_SCORE_FIELDS = [
  { id: 'crit', fieldName: 'criticality', label: 'Criticality', scaleType: 'importance', min: 1, max: 5 },
  { id: 'cost', fieldName: 'cost', label: 'Cost', scaleType: 'good-bad', min: 1, max: 5 },
  { id: 'func', fieldName: 'functionalFit', label: 'Functional Fit', scaleType: 'bad-good', min: 1, max: 5 },
  { id: 'tech', fieldName: 'technicalFit', label: 'Technical Fit', scaleType: 'bad-good', min: 1, max: 5 },
];

const SCORE_FIELD_NAMES = new Set(APPLICATION_SCORE_FIELDS.map((field) => field.fieldName));

export function applicationRangeFields(metaDefs: any[] | undefined) {
  const custom = (metaDefs || []).filter(
    (def) => def.entityType === 'Application' && def.fieldType === 'range' && !SCORE_FIELD_NAMES.has(def.fieldName),
  );
  return [...APPLICATION_SCORE_FIELDS, ...custom];
}

const safeJsonParse = (str: string | null | undefined, fallback: any = {}) => {
  if (!str) return fallback;
  try {
    return JSON.parse(str);
  } catch {
    try {
      const healed = str
        .replace(/([{,])\s*([a-zA-Z0-9._-]+)\s*:/g, '$1"$2":')
        .replace(/:\s*([^",}\s][^,}\s]*)\s*([,}])/g, ':"$1"$2');
      return JSON.parse(healed);
    } catch {
      return fallback;
    }
  }
};

const interpolateColor = (color1: string, color2: string, factor: number) => {
  if (!color1 || !color2) return '#adb5bd';
  const r1 = parseInt(color1.substring(1, 3), 16);
  const g1 = parseInt(color1.substring(3, 5), 16);
  const b1 = parseInt(color1.substring(5, 7), 16);
  const r2 = parseInt(color2.substring(1, 3), 16);
  const g2 = parseInt(color2.substring(3, 5), 16);
  const b2 = parseInt(color2.substring(5, 7), 16);
  const r = Math.round(r1 + factor * (r2 - r1));
  const g = Math.round(g1 + factor * (g2 - g1));
  const b = Math.round(b1 + factor * (b2 - b1));
  return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
};

const getOverlayColor = (value: number, def: any) => {
  const min = def.min ?? 0;
  const max = def.max ?? 100;
  const range = max - min;
  const normalized = range === 0 ? 0.5 : (value - min) / range;
  let colors = ['#2b8a3e', '#fab005', '#c92a2a'];
  if (def.scaleType === 'bad-good') colors = ['#c92a2a', '#fab005', '#2b8a3e'];
  if (def.scaleType === 'low-high') colors = ['#e7f5ff', '#1864ab'];
  if (def.scaleType === 'importance') colors = ['#dee2e6', '#7048e8', '#311b92'];
  if (def.scaleType === 'neutral') colors = ['#dee2e6', '#343a40'];
  if (colors.length === 3) {
    if (normalized < 0.5) return interpolateColor(colors[0], colors[1], normalized * 2);
    return interpolateColor(colors[1], colors[2], (normalized - 0.5) * 2);
  }
  return interpolateColor(colors[0], colors[1], normalized);
};

function inheritedCriticality(app: any, capabilities: { id: string; criticality?: string | number | null; parentId?: string | null }[]) {
  const getRecursiveMaxCrit = (capIds: string[]): number => {
    let max = 0;
    capIds.forEach((id) => {
      const cap = capabilities.find((item) => item.id === id);
      if (!cap) return;
      max = Math.max(max, Number(cap.criticality || 1));
      const childIds = capabilities.filter((item) => item.parentId === id).map((item) => item.id);
      if (childIds.length > 0) max = Math.max(max, getRecursiveMaxCrit(childIds));
    });
    return max;
  };

  const isInherited = !!(app.capabilities && app.capabilities.length > 0);
  const inheritedCrit = isInherited
    ? String(Math.max(Number(app.criticality || 1), getRecursiveMaxCrit(app.capabilities.map((cap: { id: string }) => cap.id))))
    : String(app.criticality || 1);
  return { isInherited, inheritedCrit };
}

interface Props {
  app: any;
  capabilities: { id: string; criticality?: string | number | null; parentId?: string | null }[];
  rangeFields: { id: string; fieldName: string; label: string; scaleType?: string; min?: number; max?: number }[];
  picklists?: any[];
  timeThresholds?: TimeThresholds;
  onOpen: () => void;
  onEdit?: () => void;
  compact?: boolean;
}

export const ApplicationGridCard = ({ app, capabilities, rangeFields, picklists, timeThresholds = DEFAULT_TIME_THRESHOLDS, onOpen, onEdit, compact = false }: Props) => {
  const meta = safeJsonParse(app.metadata);
  const { isInherited, inheritedCrit } = inheritedCriticality(app, capabilities);
  const timeInfo = getAppTimeAssessment(app, timeThresholds);
  const ownerOptions = picklists?.find((picklist) => picklist.name === 'owner')?.options || [];
  const appTypeOptions = picklists?.find((picklist) => picklist.name === 'application_type')?.options || [];
  const costOptions = picklists?.find((picklist) => picklist.name === 'application_cost')?.options || [];
  const lifecycleColor = picklists?.find((picklist) => picklist.name === 'lifecycle')?.options?.find((option: any) => option.value === app.lifecycle)?.color;
  const typeOption = appTypeOptions.find((option: any) => option.value === app.type);
  const costOption = costOptions.find((option: any) => String(option.value) === String(app.cost || '1'));

  return (
    <div className="card" onClick={onOpen} style={{ cursor: 'pointer', padding: compact ? '0.6rem 0.7rem' : '0.75rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: compact ? '0.4rem' : '0.6rem', alignItems: 'flex-start', gap: '0.35rem' }}>
        <div style={{ display: 'flex', gap: '0.4rem', alignItems: 'center' }}>
          <div style={{ background: 'var(--accent)', padding: '0.35rem', borderRadius: 'var(--radius)' }}><Database size={16} /></div>
          <div style={{ display: 'flex', gap: '3px' }}>
            {rangeFields.map((def) => {
              const val = def.fieldName === 'criticality' ? inheritedCrit : ((app as any)[def.fieldName] || meta[def.fieldName] || def.min);
              const isThisInherited = def.fieldName === 'criticality' && isInherited;
              return (
                <div
                  key={def.id}
                  title={`${def.label}: ${val}${isThisInherited ? ' (Inherited)' : ''}`}
                  style={{
                    width: '8px', height: '8px', borderRadius: '50%',
                    background: getOverlayColor(Number(val), def),
                    border: isThisInherited ? '1px solid var(--primary)' : 'none'
                  }}
                />
              );
            })}
          </div>
        </div>
        <div style={{ display: 'flex', gap: '0.35rem', alignItems: 'center' }}>
          {timeInfo && (
            <span
              title={`TIME Assessment: ${timeInfo.label} (Tech Fit: ${app.technicalFit || '—'}, Functional Fit: ${app.functionalFit || '—'}, Criticality: ${inheritedCrit})`}
              style={{
                fontSize: '0.62rem',
                fontWeight: 800,
                letterSpacing: '0.04em',
                textTransform: 'uppercase',
                padding: '0.15rem 0.45rem',
                borderRadius: '4px',
                background: timeInfo.bg,
                color: timeInfo.color,
                border: `1px solid ${timeInfo.border}`
              }}
            >
              {timeInfo.label}
            </span>
          )}
          <LifecycleBadge lifecycle={app.lifecycle} color={lifecycleColor} />
          {!compact && onEdit && (
            <button
              onClick={(event) => { event.stopPropagation(); onEdit(); }}
              className="secondary"
              style={{ border: 'none', height: '1.6rem', width: '1.6rem', padding: 0, background: 'transparent' }}
            >
              <Edit2 size={12} />
            </button>
          )}
        </div>
      </div>
      <h3 style={{ marginBottom: '0.35rem', fontSize: compact ? '0.9rem' : '1rem' }}>{app.name}</h3>
      <p style={{ fontSize: '0.75rem', color: 'var(--muted-foreground)', marginBottom: compact ? 0 : '0.75rem', display: '-webkit-box', WebkitLineClamp: '2', WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{app.description || 'No description provided.'}</p>
      {!compact && <div style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem', fontSize: '0.7rem', borderTop: '1px solid var(--border)', paddingTop: '0.75rem', marginTop: 'auto' }}>
        <div><strong>Owner:</strong> {ownerOptions.find((option: any) => option.value === app.owner)?.label || app.owner || 'Unassigned'}</div>
        <div>
          <strong>Owning Org:</strong> {app.ownerOrg ? (
            <span style={{ fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: '0.2rem', color: 'var(--primary)' }}>
              <Layers size={10} /> {app.ownerOrg.name}
            </span>
          ) : '—'}
        </div>
        <div><strong>Type:</strong> <span style={{ fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: '0.2rem' }}>{typeOption?.color && <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: typeOption.color }} />} {typeOption?.label || app.type || 'Unspecified'}</span></div>
        <div><strong>Cost:</strong> <span style={{ fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: '0.2rem' }}>{costOption?.color && <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: costOption.color }} />} {costOption?.label || app.cost || '1'}</span></div>
      </div>}
    </div>
  );
};
