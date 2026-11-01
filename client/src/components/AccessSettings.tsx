import { useMemo, useState, type FormEvent } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ACCESS_AREAS, type AccessArea, type AccessLevel, useAccess } from '../access';

type GroupRecord = {
  id: string;
  name: string;
  builtIn: string | null;
  locked: boolean;
  memberCount: number;
  areas: Record<AccessArea, AccessLevel>;
  applicationEdits: string[];
  applicationViews: string[];
};

type UserRecord = {
  id: string;
  name: string;
  email: string;
  groupIds: string[];
};

type OrgRecord = { id: string; name: string; parentId: string | null; type: string | null };

const AREA_LABELS: Record<AccessArea, string> = {
  applications: 'Applications',
  organizations: 'Organizations',
  capabilities: 'Capabilities',
  strategicGoals: 'Strategic Goals',
  information: 'Information',
  integrations: 'Integrations',
  diagrams: 'Diagrams',
  insights: 'Insights',
};

const LEVELS: { value: AccessLevel; label: string }[] = [
  { value: 'none', label: 'No access' },
  { value: 'view', label: 'View' },
  { value: 'edit', label: 'Edit' },
];

const BUILTIN_SUMMARY: Record<string, string> = {
  administrators: 'Edit every portfolio area and all settings, including users, groups, the meta model, frameworks, AI, branding, import and export, and landscape states. This group cannot be changed or removed.',
  architects: 'Edit every portfolio area: applications, organizations, capabilities, strategic goals, information, integrations, diagrams, and insights. Settings stay with Administrators.',
  viewers: 'View every portfolio area. Nothing can be edited, and settings stay closed.',
};

const emptyAreas = () => Object.fromEntries(ACCESS_AREAS.map((area) => [area, 'none'])) as Record<AccessArea, AccessLevel>;

function areasFrom(kind: 'architects' | 'viewers' | 'none') {
  const level: AccessLevel = kind === 'architects' ? 'edit' : kind === 'viewers' ? 'view' : 'none';
  return Object.fromEntries(ACCESS_AREAS.map((area) => [area, level])) as Record<AccessArea, AccessLevel>;
}

async function readError(res: Response) {
  const body = await res.json().catch(() => null);
  return body?.error || 'The change could not be saved.';
}

export function AccessBootstrap() {
  const access = useAccess();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [pending, setPending] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (pending) return;
    const displayName = name.trim();
    if (!displayName) {
      setError('Enter a display name.');
      return;
    }
    setPending(true);
    setError('');
    try {
      const res = await fetch('/api/access/bootstrap', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name: displayName, email, password }),
      });
      if (!res.ok) {
        setError(await readError(res));
        return;
      }
      await access.refresh();
    } catch {
      setError('The server could not be reached.');
    } finally {
      setPending(false);
    }
  };

  return (
    <form onSubmit={(event) => void submit(event)} className="card" style={{ padding: '1.5rem', maxWidth: '36rem' }}>
      <h2 style={{ margin: '0 0 0.35rem', fontSize: '1.35rem' }}>Create the first administrator</h2>
      <p style={{ margin: '0 0 1rem', color: 'var(--muted-foreground)', fontSize: '0.9rem' }}>
        Until this account exists, the workspace stays open. The account is the email address. Saving creates the Administrators, Architects, and Viewers groups and starts requiring a sign-in. Portfolio data is left as it is.
      </p>
      <div className="field">
        <label className="label" htmlFor="admin-email">Email</label>
        <input id="admin-email" type="email" autoComplete="email" required value={email} onChange={(event) => setEmail(event.target.value)} />
      </div>
      <div className="field">
        <label className="label" htmlFor="admin-password">Password</label>
        <input id="admin-password" type="password" autoComplete="new-password" required minLength={8} value={password} onChange={(event) => setPassword(event.target.value)} />
      </div>
      <div className="field">
        <label className="label" htmlFor="admin-name">Display name</label>
        <input id="admin-name" autoComplete="name" required value={name} onChange={(event) => setName(event.target.value)} />
        <p style={{ margin: '0.35rem 0 0', color: 'var(--muted-foreground)', fontSize: '0.8rem' }}>Shown in the workspace. Sign-in uses the email address.</p>
      </div>
      {error && <p style={{ color: 'var(--destructive, #c92a2a)', fontSize: '0.85rem' }}>{error}</p>}
      <button type="submit" className="primary" disabled={pending}>{pending ? 'Creating…' : 'Create administrator'}</button>
    </form>
  );
}

export function UsersSettings() {
  const queryClient = useQueryClient();
  const users = useQuery({
    queryKey: ['access-users'],
    queryFn: async () => {
      const res = await fetch('/api/access/users');
      if (!res.ok) throw new Error(await readError(res));
      return res.json() as Promise<UserRecord[]>;
    },
  });
  const groups = useQuery({
    queryKey: ['access-groups'],
    queryFn: async () => {
      const res = await fetch('/api/access/groups');
      if (!res.ok) throw new Error(await readError(res));
      return res.json() as Promise<GroupRecord[]>;
    },
  });
  const [draft, setDraft] = useState<UserRecord | null>(null);
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [pending, setPending] = useState(false);
  const creating = draft?.id === '';

  const reload = () => {
    void queryClient.invalidateQueries({ queryKey: ['access-users'] });
    void queryClient.invalidateQueries({ queryKey: ['access-groups'] });
  };

  const save = async (event: FormEvent) => {
    event.preventDefault();
    if (!draft || pending) return;
    const displayName = draft.name.trim();
    if (!displayName) {
      setError('Enter a display name.');
      return;
    }
    setPending(true);
    setError('');
    try {
      const payload = {
        name: displayName,
        email: draft.email,
        groupIds: draft.groupIds,
        ...(password ? { password } : {}),
      };
      const res = await fetch(creating ? '/api/access/users' : `/api/access/users/${draft.id}`, {
        method: creating ? 'POST' : 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(creating ? { ...payload, password } : payload),
      });
      if (!res.ok) {
        setError(await readError(res));
        return;
      }
      setDraft(null);
      setPassword('');
      reload();
    } catch {
      setError('The server could not be reached.');
    } finally {
      setPending(false);
    }
  };

  const remove = async (user: UserRecord) => {
    if (!window.confirm(`Delete the account ${user.email}?`)) return;
    const res = await fetch(`/api/access/users/${user.id}`, { method: 'DELETE' });
    if (!res.ok) {
      window.alert(await readError(res));
      return;
    }
    if (draft?.id === user.id) setDraft(null);
    reload();
  };

  const groupName = (id: string) => groups.data?.find((group) => group.id === id)?.name || id;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', gap: '1rem' }}>
        <div>
          <h2 style={{ margin: 0, fontSize: '1.35rem' }}>Users</h2>
          <p style={{ margin: '0.3rem 0 0', color: 'var(--muted-foreground)', fontSize: '0.9rem' }}>An account is an email address and has a display name. A person can belong to more than one group, and the most permissive group wins.</p>
        </div>
        <button type="button" className="primary" onClick={() => { setError(''); setPassword(''); setDraft({ id: '', name: '', email: '', groupIds: [] }); }}>New user</button>
      </div>
      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
          <thead>
            <tr style={{ borderBottom: '1px solid var(--border)', background: 'var(--muted)' }}>
              <th style={{ padding: '0.6rem 1rem', fontSize: '0.75rem' }}>Email</th>
              <th style={{ padding: '0.6rem 1rem', fontSize: '0.75rem' }}>Display name</th>
              <th style={{ padding: '0.6rem 1rem', fontSize: '0.75rem' }}>Groups</th>
              <th style={{ padding: '0.6rem 1rem', fontSize: '0.75rem' }}></th>
            </tr>
          </thead>
          <tbody>
            {(users.data || []).map((user) => (
              <tr key={user.id} style={{ borderBottom: '1px solid var(--border)' }}>
                <td style={{ padding: '0.6rem 1rem', fontWeight: 650 }}>{user.email}</td>
                <td style={{ padding: '0.6rem 1rem' }}>{user.name.trim() || '—'}</td>
                <td style={{ padding: '0.6rem 1rem', fontSize: '0.85rem' }}>{user.groupIds.map(groupName).join(', ') || '—'}</td>
                <td style={{ padding: '0.6rem 1rem', textAlign: 'right' }}>
                  <button type="button" className="secondary" onClick={() => { setError(''); setPassword(''); setDraft(user); }}>Edit</button>
                  <button type="button" className="secondary" style={{ marginLeft: '0.4rem', color: 'var(--destructive)' }} onClick={() => void remove(user)}>Delete</button>
                </td>
              </tr>
            ))}
            {users.data && users.data.length === 0 && (
              <tr><td colSpan={4} style={{ padding: '1rem', color: 'var(--muted-foreground)' }}>No users yet.</td></tr>
            )}
          </tbody>
        </table>
      </div>
      {draft && (
        <form onSubmit={(event) => void save(event)} className="card" style={{ padding: '1.25rem' }}>
          <h3 style={{ margin: '0 0 0.8rem' }}>{creating ? 'New user' : `Edit ${draft.email}`}</h3>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
            <div className="field" style={{ margin: 0 }}>
              <label className="label">Email</label>
              <input type="email" autoComplete="email" required value={draft.email} onChange={(event) => setDraft({ ...draft, email: event.target.value })} />
            </div>
            <div className="field" style={{ margin: 0 }}>
              <label className="label">Display name</label>
              <input autoComplete="name" required value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} />
            </div>
            <div className="field" style={{ margin: 0 }}>
              <label className="label">{creating ? 'Password' : 'New password'}</label>
              <input type="password" autoComplete="new-password" required={creating} minLength={creating || password ? 8 : undefined} value={password} placeholder={creating ? '' : 'Leave blank to keep the current password'} onChange={(event) => setPassword(event.target.value)} />
            </div>
          </div>
          <div className="field" style={{ marginTop: '1rem' }}>
            <span className="label">Groups</span>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.6rem 1rem' }}>
              {(groups.data || []).map((group) => (
                <label key={group.id} style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.9rem' }}>
                  <input
                    type="checkbox"
                    checked={draft.groupIds.includes(group.id)}
                    onChange={(event) => {
                      const groupIds = event.target.checked
                        ? [...draft.groupIds, group.id]
                        : draft.groupIds.filter((id) => id !== group.id);
                      setDraft({ ...draft, groupIds });
                    }}
                  />
                  {group.name}
                </label>
              ))}
            </div>
          </div>
          {error && <p style={{ color: 'var(--destructive, #c92a2a)', fontSize: '0.85rem' }}>{error}</p>}
          <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
            <button type="button" className="secondary" onClick={() => setDraft(null)}>Cancel</button>
            <button type="submit" className="primary" disabled={pending}>{pending ? 'Saving…' : 'Save'}</button>
          </div>
        </form>
      )}
    </div>
  );
}

export function GroupsSettings() {
  const queryClient = useQueryClient();
  const groups = useQuery({
    queryKey: ['access-groups'],
    queryFn: async () => {
      const res = await fetch('/api/access/groups');
      if (!res.ok) throw new Error(await readError(res));
      return res.json() as Promise<GroupRecord[]>;
    },
  });
  const organizations = useQuery({
    queryKey: ['access-organizations'],
    queryFn: async () => {
      const res = await fetch('/api/access/organizations');
      if (!res.ok) throw new Error(await readError(res));
      return res.json() as Promise<OrgRecord[]>;
    },
  });
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [areas, setAreas] = useState(emptyAreas);
  const [applicationEdits, setApplicationEdits] = useState<string[]>([]);
  const [applicationViews, setApplicationViews] = useState<string[]>([]);
  const [template, setTemplate] = useState<'architects' | 'viewers' | 'none'>('none');
  const [error, setError] = useState('');
  const [pending, setPending] = useState(false);
  const selected = groups.data?.find((group) => group.id === selectedId) ?? null;
  const creating = selectedId === '';

  const orgOptions = useMemo(() => {
    const orgs = organizations.data || [];
    const byParent = new Map<string | null, OrgRecord[]>();
    const ids = new Set(orgs.map((org) => org.id));
    for (const org of orgs) {
      const parent = org.parentId && ids.has(org.parentId) ? org.parentId : null;
      const list = byParent.get(parent) ?? [];
      list.push(org);
      byParent.set(parent, list);
    }
    for (const list of byParent.values()) list.sort((a, b) => a.name.localeCompare(b.name));
    const rows: { id: string; name: string; depth: number }[] = [];
    const walk = (parent: string | null, depth: number) => {
      for (const org of byParent.get(parent) ?? []) {
        rows.push({ id: org.id, name: org.name, depth });
        walk(org.id, depth + 1);
      }
    };
    walk(null, 0);
    return rows;
  }, [organizations.data]);

  const open = (group: GroupRecord | null) => {
    setError('');
    if (!group) {
      setSelectedId('');
      setName('');
      setTemplate('none');
      setAreas(areasFrom('none'));
      setApplicationEdits([]);
      setApplicationViews([]);
      return;
    }
    setSelectedId(group.id);
    setName(group.name);
    setAreas({ ...group.areas });
    setApplicationEdits([...group.applicationEdits]);
    setApplicationViews([...group.applicationViews]);
  };

  const save = async (event: FormEvent) => {
    event.preventDefault();
    if (pending || (selected && selected.locked)) return;
    setPending(true);
    setError('');
    try {
      const grants = { areas, applicationEdits, applicationViews };
      const res = await fetch(creating ? '/api/access/groups' : `/api/access/groups/${selectedId}`, {
        method: creating ? 'POST' : 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(creating ? { name, grants } : { name, grants }),
      });
      if (!res.ok) {
        setError(await readError(res));
        return;
      }
      setSelectedId(null);
      void queryClient.invalidateQueries({ queryKey: ['access-groups'] });
    } catch {
      setError('The server could not be reached.');
    } finally {
      setPending(false);
    }
  };

  const remove = async (group: GroupRecord) => {
    if (group.locked) return;
    if (!window.confirm(`Delete the group ${group.name}?`)) return;
    const res = await fetch(`/api/access/groups/${group.id}`, { method: 'DELETE' });
    if (!res.ok) {
      window.alert(await readError(res));
      return;
    }
    if (selectedId === group.id) setSelectedId(null);
    void queryClient.invalidateQueries({ queryKey: ['access-groups'] });
  };

  const toggleOrg = (list: string[], setList: (ids: string[]) => void, id: string) => {
    setList(list.includes(id) ? list.filter((item) => item !== id) : [...list, id]);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', gap: '1rem' }}>
        <div>
          <h2 style={{ margin: 0, fontSize: '1.35rem' }}>Groups</h2>
          <p style={{ margin: '0.3rem 0 0', color: 'var(--muted-foreground)', fontSize: '0.9rem' }}>A group is the role. Built-in groups stay. A custom group chooses view or edit for each part of the portfolio.</p>
        </div>
        <button type="button" className="primary" onClick={() => open(null)}>New group</button>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
        {(groups.data || []).map((group) => (
          <div key={group.id} className="card" style={{ padding: '0.9rem 1rem', display: 'flex', justifyContent: 'space-between', gap: '1rem', alignItems: 'flex-start' }}>
            <div>
              <div style={{ fontWeight: 750 }}>{group.name}</div>
              <div style={{ color: 'var(--muted-foreground)', fontSize: '0.8rem', marginTop: '0.2rem' }}>
                {group.memberCount} {group.memberCount === 1 ? 'member' : 'members'}
                {group.locked ? ' · Built in' : ''}
              </div>
              {group.builtIn && <p style={{ margin: '0.4rem 0 0', fontSize: '0.85rem', maxWidth: '46rem' }}>{BUILTIN_SUMMARY[group.builtIn]}</p>}
            </div>
            <div style={{ display: 'flex', gap: '0.4rem' }}>
              {!group.locked && <button type="button" className="secondary" onClick={() => open(group)}>Edit</button>}
              {!group.locked && <button type="button" className="secondary" style={{ color: 'var(--destructive)' }} onClick={() => void remove(group)}>Delete</button>}
            </div>
          </div>
        ))}
      </div>
      {selectedId !== null && !selected?.locked && (
        <form onSubmit={(event) => void save(event)} className="card" style={{ padding: '1.25rem', display: 'flex', flexDirection: 'column', gap: '0.9rem' }}>
          <h3 style={{ margin: 0 }}>{creating ? 'New group' : `Edit ${selected?.name || 'group'}`}</h3>
          <div className="field" style={{ margin: 0 }}>
            <label className="label" htmlFor="group-name">Name</label>
            <input id="group-name" required value={name} onChange={(event) => setName(event.target.value)} />
          </div>
          {creating && (
            <div className="field" style={{ margin: 0 }}>
              <label className="label" htmlFor="group-template">Start from</label>
              <select
                id="group-template"
                value={template}
                onChange={(event) => {
                  const next = event.target.value as 'architects' | 'viewers' | 'none';
                  setTemplate(next);
                  setAreas(areasFrom(next));
                  setApplicationEdits([]);
                  setApplicationViews([]);
                }}
              >
                <option value="none">No access</option>
                <option value="viewers">Viewers</option>
                <option value="architects">Architects</option>
              </select>
            </div>
          )}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '0.75rem' }}>
            {ACCESS_AREAS.map((area) => (
              <div key={area} className="field" style={{ margin: 0 }}>
                <label className="label" htmlFor={`area-${area}`}>{AREA_LABELS[area]}</label>
                <select
                  id={`area-${area}`}
                  value={areas[area]}
                  onChange={(event) => {
                    const level = event.target.value as AccessLevel;
                    setAreas({ ...areas, [area]: level });
                    if (area === 'applications' && level === 'edit') {
                      setApplicationEdits([]);
                      setApplicationViews([]);
                    }
                    if (area === 'applications' && level === 'view') setApplicationViews([]);
                  }}
                >
                  {LEVELS.map((level) => <option key={level.value} value={level.value}>{level.label}</option>)}
                </select>
              </div>
            ))}
          </div>
          {areas.applications !== 'edit' && (
            <OrgExceptions
              orgs={orgOptions}
              applicationEdits={applicationEdits}
              applicationViews={applicationViews}
              showViews={areas.applications === 'none'}
              onToggleEdit={(id) => {
                toggleOrg(applicationEdits, setApplicationEdits, id);
                if (!applicationEdits.includes(id)) setApplicationViews(applicationViews.filter((item) => item !== id));
              }}
              onToggleView={(id) => toggleOrg(applicationViews, setApplicationViews, id)}
            />
          )}
          <p style={{ margin: 0, color: 'var(--muted-foreground)', fontSize: '0.8rem' }}>
            Application exceptions follow the organization in Current and in every target state by its place in the tree. A child unit is not included unless it is selected too. Settings are not granted here.
          </p>
          {error && <p style={{ margin: 0, color: 'var(--destructive, #c92a2a)', fontSize: '0.85rem' }}>{error}</p>}
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem' }}>
            <button type="button" className="secondary" onClick={() => setSelectedId(null)}>Cancel</button>
            <button type="submit" className="primary" disabled={pending}>{pending ? 'Saving…' : 'Save group'}</button>
          </div>
        </form>
      )}
    </div>
  );
}

function OrgExceptions({
  orgs,
  applicationEdits,
  applicationViews,
  showViews,
  onToggleEdit,
  onToggleView,
}: {
  orgs: { id: string; name: string; depth: number }[];
  applicationEdits: string[];
  applicationViews: string[];
  showViews: boolean;
  onToggleEdit: (id: string) => void;
  onToggleView: (id: string) => void;
}) {
  return (
    <div className="field" style={{ margin: 0 }}>
      <span className="label">{showViews ? 'Applications owned by selected organizations' : 'Also edit applications owned by'}</span>
      <div style={{ maxHeight: '16rem', overflow: 'auto', border: '1px solid var(--border)', borderRadius: '8px', padding: '0.4rem 0.6rem' }}>
        {orgs.map((org) => (
          <label key={org.id} style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.2rem 0', paddingLeft: `${org.depth * 1}rem`, fontSize: '0.85rem' }}>
            {showViews && (
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.25rem' }}>
                <input type="checkbox" checked={applicationViews.includes(org.id)} disabled={applicationEdits.includes(org.id)} onChange={() => onToggleView(org.id)} />
                View
              </span>
            )}
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.25rem' }}>
              <input type="checkbox" checked={applicationEdits.includes(org.id)} onChange={() => onToggleEdit(org.id)} />
              Edit
            </span>
            <span>{org.name}</span>
          </label>
        ))}
        {orgs.length === 0 && <p style={{ margin: '0.4rem 0', color: 'var(--muted-foreground)' }}>No organizations in Current.</p>}
      </div>
    </div>
  );
}
