import { useState, type FormEvent } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';

type ProviderKind = 'entra' | 'google' | 'oidc' | 'saml';

type ProviderRecord = {
  id: string;
  name: string;
  protocol: string;
  kind: ProviderKind;
  enabled: boolean;
  domains: string[];
  issuer: string | null;
  clientId: string | null;
  hasSecret: boolean;
  tenantId: string | null;
  entryPoint: string | null;
  idpEntityId: string | null;
  hasCert: boolean;
  emailAttribute: string | null;
  nameAttribute: string | null;
  allowIdpInitiated: boolean;
  urls: { redirect: string; acs: string; metadata: string } | null;
};

type Draft = {
  id: string;
  isNew: boolean;
  kind: ProviderKind;
  name: string;
  enabled: boolean;
  domains: string;
  issuer: string;
  clientId: string;
  clientSecret: string;
  tenantId: string;
  entryPoint: string;
  idpEntityId: string;
  idpCert: string;
  emailAttribute: string;
  nameAttribute: string;
  allowIdpInitiated: boolean;
  hasSecret: boolean;
  hasCert: boolean;
};

const KIND_LABELS: Record<ProviderKind, string> = {
  entra: 'Microsoft Entra ID',
  google: 'Google Workspace',
  oidc: 'OpenID Connect',
  saml: 'SAML 2.0',
};

async function readError(res: Response) {
  const body = await res.json().catch(() => null);
  return body?.error || 'The change could not be saved.';
}

function newProviderId(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = [...bytes].map((byte) => byte.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function emptyDraft(kind: ProviderKind): Draft {
  return {
    id: newProviderId(),
    isNew: true,
    kind,
    name: '',
    enabled: false,
    domains: '',
    issuer: '',
    clientId: '',
    clientSecret: '',
    tenantId: '',
    entryPoint: '',
    idpEntityId: '',
    idpCert: '',
    emailAttribute: '',
    nameAttribute: '',
    allowIdpInitiated: false,
    hasSecret: false,
    hasCert: false,
  };
}

function draftFrom(provider: ProviderRecord): Draft {
  return {
    id: provider.id,
    isNew: false,
    kind: provider.kind,
    name: provider.name,
    enabled: provider.enabled,
    domains: provider.domains.join('\n'),
    issuer: provider.issuer ?? '',
    clientId: provider.clientId ?? '',
    clientSecret: '',
    tenantId: provider.tenantId ?? '',
    entryPoint: provider.entryPoint ?? '',
    idpEntityId: provider.idpEntityId ?? '',
    idpCert: '',
    emailAttribute: provider.emailAttribute ?? '',
    nameAttribute: provider.nameAttribute ?? '',
    allowIdpInitiated: provider.allowIdpInitiated,
    hasSecret: provider.hasSecret,
    hasCert: provider.hasCert,
  };
}

function googleEntryPoint(entityId: string): string | null {
  try {
    const url = new URL(entityId.trim());
    const idpid = url.searchParams.get('idpid')?.trim() ?? '';
    const path = url.pathname.replace(/\/$/, '');
    if (url.protocol !== 'https:' || url.hostname !== 'accounts.google.com') return null;
    if (path !== '/o/saml2' && path !== '/o/saml2/idp') return null;
    if (!/^C[a-z0-9]+$/i.test(idpid)) return null;
    return `https://accounts.google.com/o/saml2/idp?idpid=${idpid}`;
  } catch {
    return null;
  }
}

function AddressField({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="field" style={{ margin: 0 }}>
      <label className="label">{label}</label>
      <div className="signin-address-row">
        <input readOnly value={value} onFocus={(event) => event.currentTarget.select()} />
        <button
          type="button"
          onClick={() => {
            void navigator.clipboard.writeText(value).then(() => {
              setCopied(true);
              window.setTimeout(() => setCopied(false), 1200);
            }).catch(() => undefined);
          }}
        >
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>
    </div>
  );
}

function ProviderAddresses({ kind, protocol, base, id }: { kind: ProviderKind; protocol: string | null; base: string; id: string }) {
  if (!base) {
    return (
      <div className="signin-addresses">
        <p className="signin-address-note">Save the workspace URL above. The address you register is built from it, before a client id or secret.</p>
      </div>
    );
  }
  const redirect = `${base}/api/access/sso/${id}/callback`;
  const acs = `${base}/api/access/sso/${id}/acs`;
  const metadata = `${base}/api/access/sso/${id}/metadata`;
  const googleOidc = kind === 'google' && protocol === 'oidc';
  const saml = kind === 'saml' || (kind === 'google' && !googleOidc);
  return (
    <div className="signin-addresses">
      <p className="signin-address-note">
        {googleOidc
          ? 'The saved OpenID client uses the redirect URL. The other two addresses are for SAML, after you paste the Entity ID and certificate and save.'
          : kind === 'google'
            ? 'Copy these into the Google SAML app first. Google then shows the Entity ID and certificate to paste below.'
            : kind === 'entra' || kind === 'oidc'
              ? 'Copy the redirect URL into the app registration. The client id and secret come after that.'
              : 'Copy these into the identity provider. Then paste its sign-in URL, entity id, and certificate below.'}
      </p>
      {(googleOidc || !saml) && <AddressField label="Redirect URL" value={redirect} />}
      {(saml || googleOidc) && (
        <>
          <AddressField label="Assertion consumer URL" value={acs} />
          <AddressField label="Service provider entity ID" value={metadata} />
        </>
      )}
    </div>
  );
}

function CheckRow({ checked, onChange, title, hint }: { checked: boolean; onChange: (value: boolean) => void; title: string; hint: string }) {
  return (
    <label className="check-row">
      <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} />
      <span>
        <span className="check-row-title">{title}</span>
        <span className="check-row-hint">{hint}</span>
      </span>
    </label>
  );
}

export function SignInSettings() {
  const queryClient = useQueryClient();
  const settings = useQuery({
    queryKey: ['sso-settings'],
    queryFn: async () => {
      const res = await fetch('/api/access/sso/settings');
      if (!res.ok) throw new Error(await readError(res));
      return res.json() as Promise<{ publicBaseUrl: string }>;
    },
  });
  const providers = useQuery({
    queryKey: ['identity-providers'],
    queryFn: async () => {
      const res = await fetch('/api/access/identity-providers');
      if (!res.ok) throw new Error(await readError(res));
      return res.json() as Promise<ProviderRecord[]>;
    },
  });
  const [workspaceUrl, setWorkspaceUrl] = useState<string | null>(null);
  const [urlError, setUrlError] = useState('');
  const [urlPending, setUrlPending] = useState(false);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [error, setError] = useState('');
  const [pending, setPending] = useState(false);

  const urlValue = workspaceUrl ?? settings.data?.publicBaseUrl ?? '';

  const saveUrl = async (event: FormEvent) => {
    event.preventDefault();
    if (urlPending) return;
    setUrlPending(true);
    setUrlError('');
    try {
      const res = await fetch('/api/access/sso/settings', {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ publicBaseUrl: urlValue }),
      });
      if (!res.ok) {
        setUrlError(await readError(res));
        return;
      }
      const body = await res.json() as { publicBaseUrl: string };
      setWorkspaceUrl(body.publicBaseUrl);
      void queryClient.invalidateQueries({ queryKey: ['sso-settings'] });
      void queryClient.invalidateQueries({ queryKey: ['identity-providers'] });
    } catch {
      setUrlError('The server could not be reached.');
    } finally {
      setUrlPending(false);
    }
  };

  const saveProvider = async (event: FormEvent) => {
    event.preventDefault();
    if (!draft || pending) return;
    setPending(true);
    setError('');
    try {
      const payload = {
        ...(draft.isNew ? { id: draft.id } : {}),
        name: draft.name.trim(),
        kind: draft.kind,
        enabled: draft.enabled,
        domains: draft.domains.split(/[\n,]/).map((domain) => domain.trim()).filter(Boolean),
        issuer: draft.issuer.trim() || undefined,
        clientId: draft.clientId.trim() || undefined,
        tenantId: draft.tenantId.trim() || undefined,
        entryPoint: draft.entryPoint.trim() || undefined,
        idpEntityId: draft.idpEntityId.trim() || undefined,
        emailAttribute: draft.emailAttribute.trim() || undefined,
        nameAttribute: draft.nameAttribute.trim() || undefined,
        allowIdpInitiated: draft.allowIdpInitiated,
        ...(draft.clientSecret.trim() ? { clientSecret: draft.clientSecret } : {}),
        ...(draft.idpCert.trim() ? { idpCert: draft.idpCert } : {}),
      };
      const creating = draft.isNew;
      const res = await fetch(creating ? '/api/access/identity-providers' : `/api/access/identity-providers/${draft.id}`, {
        method: creating ? 'POST' : 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        setError(await readError(res));
        return;
      }
      setDraft(null);
      void queryClient.invalidateQueries({ queryKey: ['identity-providers'] });
    } catch {
      setError('The server could not be reached.');
    } finally {
      setPending(false);
    }
  };

  const remove = async (provider: ProviderRecord) => {
    if (!window.confirm(`Delete the identity provider ${provider.name}?`)) return;
    const res = await fetch(`/api/access/identity-providers/${provider.id}`, { method: 'DELETE' });
    if (!res.ok) {
      window.alert(await readError(res));
      return;
    }
    if (draft?.id === provider.id) setDraft(null);
    void queryClient.invalidateQueries({ queryKey: ['identity-providers'] });
  };

  const kind = draft?.kind;
  const editing = providers.data?.find((provider) => provider.id === draft?.id);
  const savedBase = (settings.data?.publicBaseUrl ?? '').replace(/\/$/, '');

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      <div>
        <h2 style={{ margin: 0, fontSize: '1.35rem' }}>Sign-in</h2>
        <p style={{ margin: '0.3rem 0 0', color: 'var(--muted-foreground)', fontSize: '0.9rem' }}>
          People from an identity provider you enable can sign in. A new person becomes a Viewer. An existing account keeps its groups and its password. The sign-in button uses the name you enter here.
        </p>
      </div>

      <form onSubmit={(event) => void saveUrl(event)} className="card" style={{ padding: '1.25rem' }}>
        <div className="field" style={{ margin: 0 }}>
          <label className="label" htmlFor="workspace-url">Workspace URL</label>
          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
            <input
              id="workspace-url"
              value={urlValue}
              placeholder="https://ea.company.com"
              onChange={(event) => setWorkspaceUrl(event.target.value)}
              style={{ flex: 1 }}
            />
            <button type="submit" className="primary" disabled={urlPending} style={{ height: '2.4rem' }}>{urlPending ? 'Saving…' : 'Save'}</button>
          </div>
          <p style={{ margin: '0.35rem 0 0', color: 'var(--muted-foreground)', fontSize: '0.8rem' }}>
            The address people use to open this workspace. A provider cannot be enabled until this is saved. The callback addresses below are built from it.
          </p>
          {urlError && <p style={{ margin: '0.4rem 0 0', color: 'var(--destructive, #c92a2a)', fontSize: '0.85rem' }}>{urlError}</p>}
        </div>
      </form>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', gap: '1rem', flexWrap: 'wrap' }}>
        <h3 style={{ margin: 0, fontSize: '1.05rem' }}>Identity providers</h3>
        {!draft && (
          <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
            {(Object.keys(KIND_LABELS) as ProviderKind[]).map((item) => (
              <button key={item} type="button" onClick={() => { setError(''); setDraft(emptyDraft(item)); }}>
                {KIND_LABELS[item]}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
          <thead>
            <tr style={{ borderBottom: '1px solid var(--border)', background: 'var(--muted)' }}>
              <th style={{ padding: '0.6rem 1rem', fontSize: '0.75rem' }}>Name</th>
              <th style={{ padding: '0.6rem 1rem', fontSize: '0.75rem' }}>Type</th>
              <th style={{ padding: '0.6rem 1rem', fontSize: '0.75rem' }}>Domains</th>
              <th style={{ padding: '0.6rem 1rem', fontSize: '0.75rem' }}>Status</th>
              <th style={{ padding: '0.6rem 1rem', fontSize: '0.75rem' }}></th>
            </tr>
          </thead>
          <tbody>
            {(providers.data || []).map((provider) => (
              <tr key={provider.id} style={{ borderBottom: '1px solid var(--border)' }}>
                <td style={{ padding: '0.6rem 1rem', fontWeight: 650 }}>{provider.name}</td>
                <td style={{ padding: '0.6rem 1rem', fontSize: '0.85rem' }}>{KIND_LABELS[provider.kind] || provider.kind}</td>
                <td style={{ padding: '0.6rem 1rem', fontSize: '0.85rem' }}>{provider.domains.join(', ') || '—'}</td>
                <td style={{ padding: '0.6rem 1rem', fontSize: '0.85rem' }}>{provider.enabled ? 'Enabled' : 'Off'}</td>
                <td style={{ padding: '0.6rem 1rem', textAlign: 'right' }}>
                  <button type="button" onClick={() => { setError(''); setDraft(draftFrom(provider)); }}>Edit</button>
                  <button type="button" style={{ marginLeft: '0.4rem', color: 'var(--destructive)' }} onClick={() => void remove(provider)}>Delete</button>
                </td>
              </tr>
            ))}
            {providers.data && providers.data.length === 0 && (
              <tr><td colSpan={5} style={{ padding: '1rem', color: 'var(--muted-foreground)' }}>No identity providers yet.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {draft && (
        <form onSubmit={(event) => void saveProvider(event)} className="card" style={{ padding: '1.25rem', display: 'flex', flexDirection: 'column', gap: '0.9rem' }}>
          <h3 style={{ margin: 0 }}>{draft.isNew ? KIND_LABELS[draft.kind] : `Edit ${draft.name || KIND_LABELS[draft.kind]}`}</h3>
          {settings.isSuccess && <ProviderAddresses kind={draft.kind} protocol={draft.isNew ? null : editing?.protocol ?? null} base={savedBase} id={draft.id} />}
          <div className="field" style={{ margin: 0 }}>
            <label className="label" htmlFor="provider-name">Name on the sign-in page</label>
            <input id="provider-name" required value={draft.name} placeholder="Contoso" onChange={(event) => setDraft({ ...draft, name: event.target.value })} />
          </div>
          <div className="field" style={{ margin: 0 }}>
            <label className="label" htmlFor="provider-domains">Allowed email domains</label>
            <textarea id="provider-domains" rows={4} value={draft.domains} placeholder={'company.com\nexample.com'} onChange={(event) => setDraft({ ...draft, domains: event.target.value })} />
            <p style={{ margin: '0.35rem 0 0', color: 'var(--muted-foreground)', fontSize: '0.8rem' }}>
              {kind === 'google'
                ? 'One Workspace domain per line. Only an email address at one of these domains can sign in.'
                : 'One domain per line. Only email addresses at these domains can sign in through this provider.'}
            </p>
          </div>

          {kind === 'entra' && (
            <div className="field" style={{ margin: 0 }}>
              <label className="label" htmlFor="provider-tenant">Tenant id</label>
              <input id="provider-tenant" value={draft.tenantId} placeholder="Directory (tenant) id" onChange={(event) => setDraft({ ...draft, tenantId: event.target.value })} />
              <p style={{ margin: '0.35rem 0 0', color: 'var(--muted-foreground)', fontSize: '0.8rem' }}>
                Issuer: https://login.microsoftonline.com/{draft.tenantId.trim() || '{tenant}'}/v2.0. Use the directory id, not common or organizations.
              </p>
            </div>
          )}
          {kind === 'google' && (
            <>
              {editing?.protocol === 'oidc' && (
                <p style={{ margin: 0, color: 'var(--muted-foreground)', fontSize: '0.85rem' }}>
                  This provider still uses the saved OpenID client. Paste the Entity ID and certificate, then save, to use Google's SAML sign-in. Until then, the current sign-in keeps working.
                </p>
              )}
              <div className="field" style={{ margin: 0 }}>
                <label className="label" htmlFor="provider-entity">Entity ID</label>
                <input id="provider-entity" value={draft.idpEntityId} placeholder="https://accounts.google.com/o/saml2?idpid=C01234567" onChange={(event) => setDraft({ ...draft, idpEntityId: event.target.value })} />
                <p style={{ margin: '0.35rem 0 0', color: 'var(--muted-foreground)', fontSize: '0.8rem' }}>
                  Copy this from Google Identity Provider details. In the Swedish admin console the field is Enhets-ID.
                </p>
              </div>
              {googleEntryPoint(draft.idpEntityId) && (
                <div className="field" style={{ margin: 0 }}>
                  <label className="label">Sign-in URL</label>
                  <input readOnly value={googleEntryPoint(draft.idpEntityId) ?? ''} onFocus={(event) => event.currentTarget.select()} style={{ fontSize: '0.8rem' }} />
                </div>
              )}
              <div className="field" style={{ margin: 0 }}>
                <label className="label" htmlFor="provider-cert">Certificate</label>
                <textarea id="provider-cert" rows={6} value={draft.idpCert} placeholder={draft.hasCert ? 'A certificate is saved. Leave blank to keep it.' : 'Paste the certificate from Google Identity Provider details'} onChange={(event) => setDraft({ ...draft, idpCert: event.target.value })} style={{ fontFamily: 'ui-monospace, monospace', fontSize: '0.75rem' }} />
              </div>
              <CheckRow
                checked={draft.allowIdpInitiated}
                onChange={(allowIdpInitiated) => setDraft({ ...draft, allowIdpInitiated })}
                title="Google app launcher"
                hint="Allow sign-in that starts from the Google app launcher. The response still has to be signed, and the email domain still has to be allowed."
              />
            </>
          )}
          {kind === 'oidc' && (
            <div className="field" style={{ margin: 0 }}>
              <label className="label" htmlFor="provider-issuer">Issuer</label>
              <input id="provider-issuer" value={draft.issuer} placeholder="https://login.example.com" onChange={(event) => setDraft({ ...draft, issuer: event.target.value })} />
              <p style={{ margin: '0.35rem 0 0', color: 'var(--muted-foreground)', fontSize: '0.8rem' }}>Discovery uses the issuer's published OpenID configuration. Enabling checks that document.</p>
            </div>
          )}
          {(kind === 'entra' || kind === 'oidc') && (
            <>
              <div className="field" style={{ margin: 0 }}>
                <label className="label" htmlFor="provider-client">Client id</label>
                <input id="provider-client" value={draft.clientId} onChange={(event) => setDraft({ ...draft, clientId: event.target.value })} />
              </div>
              <div className="field" style={{ margin: 0 }}>
                <label className="label" htmlFor="provider-secret">Client secret</label>
                <input id="provider-secret" type="password" autoComplete="new-password" value={draft.clientSecret} placeholder={draft.hasSecret ? 'A secret is saved. Leave blank to keep it.' : ''} onChange={(event) => setDraft({ ...draft, clientSecret: event.target.value })} />
              </div>
            </>
          )}
          {kind === 'saml' && (
            <>
              <div className="field" style={{ margin: 0 }}>
                <label className="label" htmlFor="provider-entry">Identity provider sign-in URL</label>
                <input id="provider-entry" value={draft.entryPoint} placeholder="https://login.example.com/saml" onChange={(event) => setDraft({ ...draft, entryPoint: event.target.value })} />
              </div>
              <div className="field" style={{ margin: 0 }}>
                <label className="label" htmlFor="provider-entity">Identity provider entity id</label>
                <input id="provider-entity" value={draft.idpEntityId} onChange={(event) => setDraft({ ...draft, idpEntityId: event.target.value })} />
              </div>
              <div className="field" style={{ margin: 0 }}>
                <label className="label" htmlFor="provider-cert">Signing certificate</label>
                <textarea id="provider-cert" rows={6} value={draft.idpCert} placeholder={draft.hasCert ? 'A certificate is saved. Leave blank to keep it.' : 'Paste the PEM certificate'} onChange={(event) => setDraft({ ...draft, idpCert: event.target.value })} style={{ fontFamily: 'ui-monospace, monospace', fontSize: '0.75rem' }} />
              </div>
              <div className="field" style={{ margin: 0 }}>
                <label className="label" htmlFor="provider-email-attr">Email attribute</label>
                <input id="provider-email-attr" value={draft.emailAttribute} placeholder="Leave blank for the standard email attribute" onChange={(event) => setDraft({ ...draft, emailAttribute: event.target.value })} />
              </div>
              <div className="field" style={{ margin: 0 }}>
                <label className="label" htmlFor="provider-name-attr">Display name attribute</label>
                <input id="provider-name-attr" value={draft.nameAttribute} placeholder="Leave blank for the standard display name" onChange={(event) => setDraft({ ...draft, nameAttribute: event.target.value })} />
              </div>
              <CheckRow
                checked={draft.allowIdpInitiated}
                onChange={(allowIdpInitiated) => setDraft({ ...draft, allowIdpInitiated })}
                title="Identity provider starts the sign-in"
                hint="Allow sign-in that starts at the identity provider. The response still has to be signed, and the email domain still has to be allowed."
              />
            </>
          )}

          <CheckRow
            checked={draft.enabled}
            onChange={(enabled) => setDraft({ ...draft, enabled })}
            title="Enabled"
            hint="People from the allowed domains can sign in. A new person becomes a Viewer."
          />

          {error && <p style={{ margin: 0, color: 'var(--destructive, #c92a2a)', fontSize: '0.85rem' }}>{error}</p>}
          <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
            <button type="button" onClick={() => setDraft(null)}>Cancel</button>
            <button type="submit" className="primary" disabled={pending}>{pending ? 'Saving…' : 'Save'}</button>
          </div>
        </form>
      )}
    </div>
  );
}
