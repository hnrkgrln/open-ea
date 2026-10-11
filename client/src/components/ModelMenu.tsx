import { useEffect, useRef, useState } from 'react';
import { useLocation, Link } from 'react-router-dom';
import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import { Boxes, ChevronDown, FileText, Layers, Network, Shapes, type LucideIcon } from 'lucide-react';

interface ModelLink {
  to: string;
  label: string;
  description: string;
  icon: LucideIcon;
}

const MODEL_LINKS: ModelLink[] = [
  { to: '/capabilities', label: 'Capabilities', description: 'What the business is able to do', icon: Boxes },
  { to: '/organizations', label: 'Organizations', description: 'Teams and accountability', icon: Layers },
  { to: '/information', label: 'Information', description: 'Business data', icon: FileText },
  { to: '/integrations', label: 'Integrations', description: 'How applications connect', icon: Network },
];

const isModelPath = (pathname: string, to: string) => pathname === to || pathname.startsWith(`${to}/`);

const OPEN_DELAY = 80;
const CLOSE_DELAY = 160;

export const ModelMenu = () => {
  const { pathname } = useLocation();
  const active = MODEL_LINKS.some((link) => isModelPath(pathname, link.to));
  const [open, setOpen] = useState(false);
  const openTimer = useRef<number | null>(null);
  const closeTimer = useRef<number | null>(null);

  const clearTimer = (timer: { current: number | null }) => {
    if (timer.current !== null) {
      window.clearTimeout(timer.current);
      timer.current = null;
    }
  };

  const hoverIn = () => {
    clearTimer(closeTimer);
    if (open || openTimer.current !== null) return;
    openTimer.current = window.setTimeout(() => {
      openTimer.current = null;
      setOpen(true);
    }, OPEN_DELAY);
  };

  const hoverOut = () => {
    clearTimer(openTimer);
    if (closeTimer.current !== null) return;
    closeTimer.current = window.setTimeout(() => {
      closeTimer.current = null;
      setOpen(false);
    }, CLOSE_DELAY);
  };

  useEffect(() => () => {
    clearTimer(openTimer);
    clearTimer(closeTimer);
  }, []);

  return (
    <DropdownMenu.Root open={open} onOpenChange={setOpen} modal={false}>
      <DropdownMenu.Trigger
        className={`model-menu-trigger${active ? ' active' : ''}`}
        onPointerEnter={(event) => {
          if (event.pointerType !== 'touch') hoverIn();
        }}
        onPointerLeave={(event) => {
          if (event.pointerType !== 'touch') hoverOut();
        }}
        onPointerDown={(event) => {
          // Hover already opens the menu. A mouse click would toggle it shut.
          if (event.pointerType === 'mouse') event.preventDefault();
        }}
      >
        <Shapes size={16} />
        Model
        <ChevronDown size={14} className="model-menu-chevron" />
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          className="model-menu-panel"
          sideOffset={10}
          align="start"
          collisionPadding={12}
          onPointerEnter={hoverIn}
          onPointerLeave={hoverOut}
        >
          {MODEL_LINKS.map((link) => {
            const Icon = link.icon;
            const current = isModelPath(pathname, link.to);
            return (
              <DropdownMenu.Item key={link.to} asChild>
                <Link
                  to={link.to}
                  className={`model-menu-item${current ? ' active' : ''}`}
                  aria-current={current ? 'page' : undefined}
                >
                  <span className="model-menu-icon"><Icon size={16} /></span>
                  <span className="model-menu-copy">
                    <span className="model-menu-label">{link.label}</span>
                    <span className="model-menu-desc">{link.description}</span>
                  </span>
                </Link>
              </DropdownMenu.Item>
            );
          })}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
};
