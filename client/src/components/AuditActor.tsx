export type AuditActor = { name?: string | null; email?: string | null } | null | undefined;

export function auditActorName(actor: AuditActor) {
  const name = actor?.name?.trim();
  if (name) return name;
  const email = actor?.email?.trim();
  if (email) return email;
  return '—';
}

export function AuditActorName({ actor }: { actor: AuditActor }) {
  return (
    <span style={{ fontWeight: 600, fontSize: '0.75rem', color: 'var(--muted-foreground)' }}>{auditActorName(actor)}</span>
  );
}
