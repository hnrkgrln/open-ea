export function MissingRecord({ noun, onBack }: { noun: string; onBack: () => void }) {
  const title = `${noun.charAt(0).toUpperCase()}${noun.slice(1)} not found`;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', gap: '0.75rem', textAlign: 'center', padding: '2rem' }}>
      <div className="loading-logo" style={{ fontSize: '1.5rem' }}>OpenEA</div>
      <h1 style={{ fontSize: '1.25rem', fontWeight: 800, margin: 0 }}>{title}</h1>
      <p style={{ margin: 0, color: 'var(--muted-foreground)', maxWidth: '26rem', lineHeight: 1.5 }}>
        This id is not in the landscape you are viewing.
      </p>
      <button type="button" className="secondary" onClick={onBack} style={{ marginTop: '0.35rem' }}>
        Go back
      </button>
    </div>
  );
}
