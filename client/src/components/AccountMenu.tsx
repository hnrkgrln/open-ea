import { useState } from 'react';
import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import { LogOut } from 'lucide-react';
import { useAccess, type AccessUser } from '../access';

function accountInitials(user: AccessUser): string {
  const words = user.name.trim().split(/\s+/).filter(Boolean);
  if (words.length >= 2) return `${words[0].charAt(0)}${words[1].charAt(0)}`.toUpperCase();
  if (words.length === 1) {
    const letters = words[0].replace(/[^\p{L}\p{N}]/gu, '') || words[0];
    return letters.slice(0, 2).toUpperCase();
  }
  const local = user.email.split('@')[0] || user.email;
  return (local.slice(0, 2) || '?').toUpperCase();
}

function AccountFace({ user, picture, onError }: { user: AccessUser; picture: string | null; onError: () => void }) {
  if (picture) return <img src={picture} alt="" onError={onError} />;
  return <span aria-hidden="true">{accountInitials(user)}</span>;
}

export function AccountMenu() {
  const access = useAccess();
  const user = access.user;
  const [brokenUrl, setBrokenUrl] = useState<string | null>(null);
  if (!user) return null;
  const picture = user.picture && brokenUrl !== user.picture ? user.picture : null;
  const label = user.name.trim() || user.email;
  const onError = () => {
    if (user.picture) setBrokenUrl(user.picture);
  };

  return (
    <DropdownMenu.Root modal={false}>
      <DropdownMenu.Trigger className="account-menu-trigger" aria-label={`Account, ${label}`} title={label}>
        <AccountFace user={user} picture={picture} onError={onError} />
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content className="model-menu-panel account-menu-panel" sideOffset={10} align="end" collisionPadding={12}>
          <div className="account-menu-identity">
            <span className="account-menu-avatar" aria-hidden="true">
              <AccountFace user={user} picture={picture} onError={onError} />
            </span>
            <span className="account-menu-copy">
              <span className="account-menu-name">{label}</span>
              <span className="account-menu-email" title={user.email}>{user.email}</span>
            </span>
          </div>
          <DropdownMenu.Separator className="state-menu-separator" />
          <DropdownMenu.Item className="model-menu-item" onSelect={() => { void access.signOut(); }}>
            <LogOut size={16} aria-hidden="true" />
            <span>Sign out</span>
          </DropdownMenu.Item>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}
