import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import {
  Activity,
  Boxes,
  ChevronDown,
  Clock,
  Coins,
  Monitor,
  Palette,
  ShieldAlert,
  type LucideIcon,
} from 'lucide-react';

export type DiagramMode = 'network' | 'landscape' | 'app-landscape' | 'org-landscape';

interface Aspect {
  fieldName: string;
  label: string;
  description: string;
  icon: LucideIcon;
  /** When set, the aspect is offered only in these diagram views. */
  modes?: DiagramMode[];
}

const ASPECTS: Aspect[] = [
  { fieldName: 'lifecycle', label: 'Lifecycle', description: 'Stage in the application life', icon: Activity },
  { fieldName: 'time', label: 'TIME Assessment', description: 'Invest, migrate, tolerate, or eliminate', icon: Clock },
  { fieldName: 'criticality', label: 'Business Criticality', description: 'How severe a disruption would be', icon: ShieldAlert, modes: ['network', 'app-landscape', 'org-landscape'] },
  { fieldName: 'cost', label: 'Cost', description: 'Relative cost of the application', icon: Coins },
  { fieldName: 'functionalFit', label: 'Functional Fit', description: 'How well it meets the business need', icon: Boxes },
  { fieldName: 'technicalFit', label: 'Technical Fit', description: 'How sound the technology is', icon: Monitor },
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
  const current = ASPECTS.find((aspect) => aspect.fieldName === value) ?? aspects[0];

  return (
    <DropdownMenu.Root modal={false}>
      <DropdownMenu.Trigger
        className="diagram-aspects-trigger"
        aria-label={current ? `Aspects, ${current.label}` : 'Aspects'}
      >
        <Palette size={16} />
        Aspects
        <ChevronDown size={14} className="model-menu-chevron" />
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          className="model-menu-panel"
          sideOffset={10}
          align="end"
          collisionPadding={12}
        >
          <DropdownMenu.RadioGroup value={value} onValueChange={onChange}>
            {aspects.map((aspect) => {
              const Icon = aspect.icon;
              const selected = aspect.fieldName === value;
              return (
                <DropdownMenu.RadioItem
                  key={aspect.fieldName}
                  value={aspect.fieldName}
                  className={`model-menu-item${selected ? ' active' : ''}`}
                >
                  <span className="model-menu-icon"><Icon size={16} /></span>
                  <span className="model-menu-copy">
                    <span className="model-menu-label">{aspect.label}</span>
                    <span className="model-menu-desc">{aspect.description}</span>
                  </span>
                </DropdownMenu.RadioItem>
              );
            })}
          </DropdownMenu.RadioGroup>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
};
