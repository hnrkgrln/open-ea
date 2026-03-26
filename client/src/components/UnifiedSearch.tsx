import React, { useState, useEffect, useCallback, useMemo } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { Search, Database, Boxes, X } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';

interface Props {
  onSelectApp: (app: any) => void;
  onSelectCapability: (cap: any) => void;
}

export const UnifiedSearch = ({ onSelectApp, onSelectCapability }: Props) => {
  const [open, setOpen] = useState(false);
  const [query, setQ] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);

  const { data: results, isLoading } = useQuery({
    queryKey: ['search', query],
    queryFn: async () => {
      if (!query) return { applications: [], capabilities: [] };
      const res = await fetch(`/api/search?q=${encodeURIComponent(query)}`);
      return res.json();
    },
    enabled: query.length > 1,
  });

  const flatResults = useMemo(() => {
    const apps = (results?.applications || []).map((item: any) => ({ ...item, _type: 'app' }));
    const caps = (results?.capabilities || []).map((item: any) => ({ ...item, _type: 'cap' }));
    return [...apps, ...caps];
  }, [results]);

  useEffect(() => {
    setSelectedIndex(0);
  }, [query, results]);

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === 'k' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen(open => !open);
      }
    };
    document.addEventListener('keydown', down);
    return () => document.removeEventListener('keydown', down);
  }, []);

  const closeAndSelect = useCallback((type: 'app' | 'cap', item: any) => {
    setOpen(false);
    setQ('');
    if (type === 'app') onSelectApp(item);
    else onSelectCapability(item);
  }, [onSelectApp, onSelectCapability]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (flatResults.length === 0) return;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex((prev) => (prev + 1) % flatResults.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex((prev) => (prev - 1 + flatResults.length) % flatResults.length);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const item = flatResults[selectedIndex];
      if (item) {
        closeAndSelect(item._type as 'app' | 'cap', item);
      }
    }
  };

  return (
    <>
      <button 
        onClick={() => setOpen(true)}
        className="secondary"
        style={{ height: '2.5rem', display: 'flex', gap: '0.5rem', alignItems: 'center', padding: '0 1rem', width: '240px', justifyContent: 'space-between' }}
      >
        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
          <Search size={16} />
          <span style={{ fontSize: '0.875rem' }}>Search inventory...</span>
        </div>
        <kbd style={{ fontSize: '0.75rem', background: 'var(--muted)', padding: '0.1rem 0.3rem', borderRadius: '4px', opacity: 0.7 }}>⌘K</kbd>
      </button>

      <Dialog.Root open={open} onOpenChange={setOpen}>
        <Dialog.Portal>
          <Dialog.Overlay style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 200 }} />
          <Dialog.Content style={{ 
            position: 'fixed', top: '20%', left: '50%', transform: 'translateX(-50%)',
            width: '90vw', maxWidth: '600px', background: 'var(--card)', padding: '0',
            borderRadius: 'var(--radius)', zIndex: 250, border: '1px solid var(--border)',
            boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)'
          }}>
            <Dialog.Title style={{ display: 'none' }}>Search</Dialog.Title>
            <Dialog.Description style={{ display: 'none' }}>Quickly find applications and capabilities.</Dialog.Description>
            <div style={{ padding: '1rem', borderBottom: '1px solid var(--border)', display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
              <Search size={20} style={{ color: 'var(--muted-foreground)' }} />
              <div style={{ position: 'relative', flex: 1, display: 'flex', alignItems: 'center' }}>
                <input 
                  autoFocus
                  placeholder="Type to search applications or capabilities..." 
                  value={query}
                  onChange={(e) => setQ(e.target.value)}
                  onKeyDown={handleKeyDown}
                  style={{ border: 'none', background: 'transparent', width: '100%', fontSize: '1rem', outline: 'none', paddingRight: '2rem' }}
                />
                {query && (
                  <button
                    onClick={() => setQ('')}
                    style={{
                      position: 'absolute',
                      right: '0',
                      top: '50%',
                      transform: 'translateY(-50%)',
                      border: 'none',
                      background: 'transparent',
                      padding: '0.25rem',
                      height: 'auto',
                      width: 'auto',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: 'var(--muted-foreground)',
                      cursor: 'pointer'
                    }}
                  >
                    <X size={14} />
                  </button>
                )}
              </div>
              <Dialog.Close asChild>
                <button style={{ border: 'none', background: 'transparent', padding: '0.25rem', cursor: 'pointer' }}><X size={18} /></button>
              </Dialog.Close>
            </div>

            <div style={{ maxHeight: '400px', overflowY: 'auto', padding: '0.5rem' }}>
              {!query && (
                <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--muted-foreground)', fontSize: '0.875rem' }}>
                  Search for apps, capabilities, or descriptions...
                </div>
              )}

              {query && query.length > 1 && !isLoading && (
                <>
                  {/* Applications Section */}
                  {results?.applications?.length > 0 && (
                    <div style={{ marginBottom: '1rem' }}>
                      <div style={{ padding: '0.5rem 0.75rem', fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase', color: 'var(--muted-foreground)', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <Database size={12} /> Applications
                      </div>
                      {results.applications.map((app: any, idx: number) => {
                        const isSelected = selectedIndex === idx;
                        return (
                          <button
                            key={app.id}
                            onClick={() => closeAndSelect('app', app)}
                            onMouseEnter={() => setSelectedIndex(idx)}
                            style={{ 
                              width: '100%', padding: '0.75rem', textAlign: 'left', 
                              background: isSelected ? 'var(--accent)' : 'transparent', 
                              border: 'none', display: 'flex', flexDirection: 'column', 
                              borderRadius: '4px', cursor: 'pointer' 
                            }}
                            className="search-result-item"
                          >
                            <span style={{ fontWeight: 600, fontSize: '0.875rem' }}>{app.name}</span>
                            <span style={{ fontSize: '0.75rem', color: 'var(--muted-foreground)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{app.description}</span>
                          </button>
                        );
                      })}
                    </div>
                  )}

                  {/* Capabilities Section */}
                  {results?.capabilities?.length > 0 && (
                    <div style={{ marginBottom: '1rem' }}>
                      <div style={{ padding: '0.5rem 0.75rem', fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase', color: 'var(--muted-foreground)', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <Boxes size={12} /> Capabilities
                      </div>
                      {results.capabilities.map((cap: any, idx: number) => {
                        const actualIdx = (results.applications?.length || 0) + idx;
                        const isSelected = selectedIndex === actualIdx;
                        return (
                          <button
                            key={cap.id}
                            onClick={() => closeAndSelect('cap', cap)}
                            onMouseEnter={() => setSelectedIndex(actualIdx)}
                            style={{ 
                              width: '100%', padding: '0.75rem', textAlign: 'left', 
                              background: isSelected ? 'var(--accent)' : 'transparent', 
                              border: 'none', display: 'flex', flexDirection: 'column', 
                              borderRadius: '4px', cursor: 'pointer' 
                            }}
                            className="search-result-item"
                          >
                            <span style={{ fontWeight: 600, fontSize: '0.875rem' }}>{cap.name}</span>
                            <span style={{ fontSize: '0.75rem', color: 'var(--muted-foreground)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{cap.description}</span>
                          </button>
                        );
                      })}
                    </div>
                  )}

                  {(!results?.applications?.length && !results?.capabilities?.length) && (
                    <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--muted-foreground)', fontSize: '0.875rem' }}>
                      No results found for "{query}"
                    </div>
                  )}
                </>
              )}

              {isLoading && (
                <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--muted-foreground)', fontSize: '0.875rem' }}>
                  Searching...
                </div>
              )}
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </>
  );
};
