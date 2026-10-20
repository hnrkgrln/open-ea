import { useEffect } from 'react';
import { ColoredSelect } from './ColoredSelect';

export type DiagramMode = 'network' | 'landscape' | 'app-landscape' | 'org-landscape';

interface Aspect {
  fieldName: string;
  label: string;
  /** When set, the aspect is offered only in these diagram views. */
  modes?: DiagramMode[];
}

const ASPECTS: Aspect[] = [
  { fieldName: 'lifecycle', label: 'Lifecycle' },
  { fieldName: 'time', label: 'TIME Assessment' },
  { fieldName: 'criticality', label: 'Business Criticality', modes: ['network', 'app-landscape', 'org-landscape'] },
  { fieldName: 'cost', label: 'Cost' },
  { fieldName: 'functionalFit', label: 'Functional Fit' },
  { fieldName: 'technicalFit', label: 'Technical Fit' },
];

const aspectsForMode = (mode: string) =>
  ASPECTS.filter((aspect) => !aspect.modes || aspect.modes.includes(mode as DiagramMode));

export const AspectsMenu = ({
  mode,
  value,
  onChange,
}: {
  mode: string;
  value: string;
  onChange: (fieldName: string) => void;
}) => {
  const aspects = aspectsForMode(mode);
  const selected = aspects.some((aspect) => aspect.fieldName === value) ? value : aspects[0]?.fieldName ?? 'lifecycle';

  useEffect(() => {
    if (selected === value) return;
    onChange(selected);
  }, [selected, value, onChange]);

  return (
    <div role="group" aria-label="Aspect" style={{ display: 'flex', background: 'var(--secondary)', padding: '0.15rem', borderRadius: 'var(--radius)', gap: '0.15rem', alignItems: 'center', position: 'relative' }}>
      <span className="diagram-aspect-label" style={{ fontSize: '8.5px', fontWeight: 700, textTransform: 'uppercase', padding: '0 0.35rem', opacity: 0.6 }}>Aspect</span>
      <div style={{ minWidth: '140px' }}>
        <ColoredSelect
          value={selected}
          onChange={onChange}
          options={aspects.map((aspect) => ({ value: aspect.fieldName, label: aspect.label }))}
          style={{
            height: '1.65rem',
            marginTop: 0,
            background: 'var(--background)',
            fontSize: '10.5px',
            color: 'var(--primary)',
            fontWeight: 600,
          }}
        />
      </div>
    </div>
  );
};
