import React, { useState, useEffect } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { Search, Database, Network, Boxes, X, ArrowRight } from 'lucide-react';
import { LifecycleBadge } from './LifecycleBadge';

interface Props {
  onSelectApp: (app: any) => void;
}

export const UnifiedSearch = ({ onSelectApp }: Props) => {
  const [open, setOpen] = useState(false);
  const [query, setQ] = useState('');
  const [results, setResults] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === 'k' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((open) => !open);
      }
    };
    document.addEventListener('keydown', down);
    return () => document.removeEventListener('keydown', down);
  }, []);

  useEffect(() => {
    if (query.length < 2) {
      setResults(null);
      return;
    }

    const timer = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(query)}`);
        const data = await res.json();
        setResults(data);
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [query]);

  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Trigger asChild>
        <button style={{ borderRadius: '50%', width: '2.5rem', padding: 0 }} title="Search (Ctrl+K)">
          <Search size={18} />
        </button>
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 100, backdropFilter: 'blur(2px)' }} />
        <Dialog.Content style={{ 
          position: 'fixed', 
          top: '20%', 
          left: '50%', 
          transform: 'translateX(-50%)',
          width: '90vw',
          maxWidth: '600px',
          background: 'var(--card)',
          borderRadius: 'var(--radius)',
          zIndex: 150,
          border: '1px solid var(--border)',
          overflow: 'hidden',
          boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)'
        }}>
          <div style={{ padding: '1rem', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <Search size={20} color="var(--muted-foreground)" />
            <input 
              autoFocus
              placeholder="Search applications, capabilities, relations..."
              value={query}
              onChange={(e) => setQ(e.target.value)}
              style={{ border: 'none', padding: 0, margin: 0, fontSize: '1rem', background: 'transparent', outline: 'none', color: 'var(--foreground)' }}
            />
            <div style={{ fontSize: '0.75rem', background: 'var(--muted)', padding: '0.2rem 0.4rem', borderRadius: '4px', color: 'var(--muted-foreground)' }}>
              ESC
            </div>
          </div>

          <div style={{ maxHeight: '400px', overflowY: 'auto', padding: '0.5rem' }}>
            {loading && <p style={{ padding: '1rem', color: 'var(--muted-foreground)', fontSize: '0.875rem' }}>Searching...</p>}
            
            {results && (
              <>
                {results.applications.length > 0 && (
                  <div style={{ marginBottom: '1rem' }}>
                    <div style={{ padding: '0.5rem', fontSize: '0.75rem', fontWeight: 600, color: 'var(--muted-foreground)', textTransform: 'uppercase' }}>Applications</div>
                    {results.applications.map((app: any) => (
                      <div 
                        key={app.id} 
                        onClick={() => { onSelectApp(app); setOpen(false); }}
                        style={{ padding: '0.75rem', borderRadius: 'var(--radius)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.75rem' }}
                        className="search-item"
                      >
                        <Database size={16} />
                        <div style={{ flex: 1 }}>
                          <div style={{ fontSize: '0.875rem', fontWeight: 500 }}>{app.name}</div>
                          <div style={{ fontSize: '0.75rem', color: 'var(--muted-foreground)' }}>{app.owner || 'No owner'}</div>
                        </div>
                        <LifecycleBadge lifecycle={app.lifecycle} style={{ transform: 'scale(0.8)' }} />
                      </div>
                    ))}
                  </div>
                )}

                {results.capabilities.length > 0 && (
                  <div style={{ marginBottom: '1rem' }}>
                    <div style={{ padding: '0.5rem', fontSize: '0.75rem', fontWeight: 600, color: 'var(--muted-foreground)', textTransform: 'uppercase' }}>Capabilities</div>
                    {results.capabilities.map((cap: any) => (
                      <div 
                        key={cap.id} 
                        style={{ padding: '0.75rem', borderRadius: 'var(--radius)', display: 'flex', alignItems: 'center', gap: '0.75rem' }}
                        className="search-item"
                      >
                        <Boxes size={16} />
                        <div style={{ fontSize: '0.875rem', fontWeight: 500 }}>{cap.name}</div>
                      </div>
                    ))}
                  </div>
                )}

                {results.relations.length > 0 && (
                  <div style={{ marginBottom: '1rem' }}>
                    <div style={{ padding: '0.5rem', fontSize: '0.75rem', fontWeight: 600, color: 'var(--muted-foreground)', textTransform: 'uppercase' }}>Relations</div>
                    {results.relations.map((rel: any) => (
                      <div 
                        key={rel.id} 
                        style={{ padding: '0.75rem', borderRadius: 'var(--radius)', display: 'flex', alignItems: 'center', gap: '0.75rem' }}
                        className="search-item"
                      >
                        <Network size={16} />
                        <div style={{ fontSize: '0.875rem', fontWeight: 500, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                          {rel.sourceApp.name} <ArrowRight size={12} /> {rel.targetApp.name}
                          <span style={{ fontSize: '0.7rem', opacity: 0.7 }}>({rel.type})</span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {!results.applications.length && !results.capabilities.length && !results.relations.length && (
                  <p style={{ padding: '2rem', textAlign: 'center', color: 'var(--muted-foreground)', fontSize: '0.875rem' }}>No results found for "{query}"</p>
                )}
              </>
            )}

            {!results && !loading && (
              <p style={{ padding: '2rem', textAlign: 'center', color: 'var(--muted-foreground)', fontSize: '0.875rem' }}>
                Type to search across your enterprise architecture...
              </p>
            )}
          </div>
          <Dialog.Title style={{ display: 'none' }}>Unified Search</Dialog.Title>
          <Dialog.Description style={{ display: 'none' }}>Search for applications, capabilities, and relationships.</Dialog.Description>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
};
