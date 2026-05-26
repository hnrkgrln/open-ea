import React, { useState, useEffect, useCallback, useMemo } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { Search, Database, Boxes, X, FileText, Layers, Network, ArrowRight } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';

interface Props {}

export const UnifiedSearch = ({}: Props) => {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [query, setQ] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);

  const [isMac, setIsMac] = useState(false);

  useEffect(() => {
    setIsMac(navigator.platform.toUpperCase().indexOf('MAC') >= 0);
  }, []);

  const { data: results, isLoading } = useQuery({
    queryKey: ['search', query],
    queryFn: async () => {
      if (!query) return { applications: [], capabilities: [], organizations: [], informationObjects: [], integrations: [] };
      const res = await fetch(`/api/search?q=${encodeURIComponent(query)}`);
      return res.json();
    },
    enabled: query.length > 1,
  });

  const flatResults = useMemo(() => {
    const apps = (results?.applications || []).map((item: any) => ({ ...item, _type: 'app' }));
    const caps = (results?.capabilities || []).map((item: any) => ({ ...item, _type: 'cap' }));
    const orgs = (results?.organizations || []).map((item: any) => ({ ...item, _type: 'org' }));
    const info = (results?.informationObjects || []).map((item: any) => ({ ...item, _type: 'info' }));
    const integrations = (results?.integrations || []).map((item: any) => ({ ...item, _type: 'integration' }));
    return [...apps, ...caps, ...orgs, ...info, ...integrations];
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

  const closeAndSelect = useCallback((type: 'app' | 'cap' | 'org' | 'info' | 'integration', item: any) => {
    setOpen(false);
    setQ('');
    if (type === 'app') navigate(`/apps/${item.id}`);
    else if (type === 'cap') navigate(`/capabilities/${item.id}`);
    else if (type === 'org') navigate(`/organizations/${item.id}`);
    else if (type === 'info') navigate(`/information/${item.id}`);
    else if (type === 'integration') navigate(`/integrations/${item.id}`);
  }, [navigate]);

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
        closeAndSelect(item._type as any, item);
      }
    }
  };

  const lineClampStyle: React.CSSProperties = {
    display: '-webkit-box',
    WebkitLineClamp: 2,
    WebkitBoxOrient: 'vertical',
    overflow: 'hidden',
    textOverflow: 'ellipsis'
  };

  return (
    <>
      <button 
        onClick={() => setOpen(true)}
        className="secondary"
        style={{ height: '2.1rem', display: 'flex', gap: '0.4rem', alignItems: 'center', padding: '0 0.85rem', width: '280px', justifyContent: 'space-between' }}
      >
        <div style={{ display: 'flex', gap: '0.4rem', alignItems: 'center' }}>
          <Search size={14} />
          <span style={{ fontSize: '0.9rem' }}>Search everything...</span>
        </div>
        <kbd style={{ fontSize: '0.8rem', background: 'var(--muted)', padding: '0.15rem 0.4rem', borderRadius: '4px', opacity: 0.7 }}>{isMac ? '⌘K' : 'Ctrl+K'}</kbd>
      </button>

      <Dialog.Root open={open} onOpenChange={setOpen}>
        <Dialog.Portal>
          <Dialog.Overlay style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 200 }} />
          <Dialog.Content style={{ 
            position: 'fixed', top: '10%', left: '50%', transform: 'translateX(-50%)',
            width: '95vw', maxWidth: '1100px', background: 'var(--card)', padding: '0',
            borderRadius: 'var(--radius)', zIndex: 250, border: '1px solid var(--border)',
            boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)'
          }}>
            <Dialog.Title style={{ display: 'none' }}>Search</Dialog.Title>
            <Dialog.Description style={{ display: 'none' }}>Search for apps, owners, capabilities, information, or integrations.</Dialog.Description>
            <div style={{ padding: '1.5rem', borderBottom: '1px solid var(--border)', display: 'flex', gap: '1.25rem', alignItems: 'center' }}>
              <Search size={28} style={{ color: 'var(--muted-foreground)' }} />
              <div style={{ position: 'relative', flex: 1, display: 'flex', alignItems: 'center' }}>
                <input 
                  autoFocus
                  placeholder="Search apps, owners, capabilities, information, or integrations..."
                  value={query}
                  onChange={(e) => setQ(e.target.value)}
                  onKeyDown={handleKeyDown}
                  style={{ border: 'none', background: 'transparent', width: '100%', fontSize: '1.5rem', outline: 'none', paddingRight: '3rem', fontWeight: 500 }}
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
                      padding: '0.5rem',
                      height: 'auto',
                      width: 'auto',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: 'var(--muted-foreground)',
                      cursor: 'pointer'
                    }}
                  >
                    <X size={20} />
                  </button>
                )}
              </div>
              <Dialog.Close asChild>
                <button style={{ border: 'none', background: 'transparent', padding: '0.5rem', cursor: 'pointer' }}><X size={24} /></button>
              </Dialog.Close>
            </div>

            <div style={{ maxHeight: '70vh', overflowY: 'auto', padding: '1.25rem' }}>
              {!query && (
                <div style={{ padding: '8rem 2rem', textAlign: 'center', color: 'var(--muted-foreground)' }}>
                  <div style={{ fontSize: '1.5rem', fontWeight: 700, marginBottom: '0.5rem', color: 'var(--foreground)' }}>Quick Landscape Search</div>
                  <div style={{ fontSize: '1.1rem' }}>Find apps, owners, capabilities, information objects or system integrations...</div>
                </div>
              )}

              {query && query.length > 1 && !isLoading && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
                  {/* Applications Section */}
                  {results?.applications?.length > 0 && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                      <div style={{ padding: '0 1.5rem 0.5rem', fontSize: '0.85rem', fontWeight: 800, textTransform: 'uppercase', color: 'var(--muted-foreground)', display: 'flex', alignItems: 'center', gap: '0.6rem', letterSpacing: '0.1em' }}>
                        <Database size={16} /> Applications
                      </div>
                      {results.applications.map((app: any, idx: number) => {
                        const isSelected = selectedIndex === idx;
                        return (
                          <button
                            key={app.id}
                            onClick={() => closeAndSelect('app', app)}
                            onMouseEnter={() => setSelectedIndex(idx)}
                            style={{ 
                              width: '100%', padding: '1.5rem 2rem', textAlign: 'left', 
                              background: isSelected ? 'var(--accent)' : 'transparent', 
                              border: 'none', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start',
                              borderRadius: '12px', cursor: 'pointer', transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
                              minHeight: '100px'
                            }}
                            className="search-result-item"
                          >
                            <div style={{ flex: 1, minWidth: 0, marginRight: '3rem' }}>
                              <div style={{ fontWeight: 800, fontSize: '1.15rem', marginBottom: '0.4rem', color: isSelected ? 'var(--primary)' : 'inherit' }}>{app.name}</div>
                              <div style={{ fontSize: '0.925rem', color: 'var(--muted-foreground)', lineHeight: 1.5, ...lineClampStyle }}>{app.description || 'No description provided.'}</div>
                            </div>
                            <div style={{ display: 'flex', gap: '1rem', flexShrink: 0, alignItems: 'center', marginTop: '0.25rem' }}>
                              {app.ownerOrg && <div style={{ textAlign: 'right' }}>
                                <div style={{ fontSize: '0.65rem', fontWeight: 700, color: 'var(--muted-foreground)', textTransform: 'uppercase', marginBottom: '0.25rem' }}>Owning Org</div>
                                <span style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--primary)', border: '1px solid var(--primary)', padding: '0.25rem 0.7rem', borderRadius: '5px', background: 'var(--card)', display: 'inline-flex', alignItems: 'center', gap: '0.25rem' }}><Layers size={10} /> {app.ownerOrg.name}</span>
                              </div>}
                              {app.owner && <div style={{ textAlign: 'right' }}>
                                <div style={{ fontSize: '0.65rem', fontWeight: 700, color: 'var(--muted-foreground)', textTransform: 'uppercase', marginBottom: '0.25rem' }}>Owner</div>
                                <span style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--foreground)', border: '1px solid var(--border)', padding: '0.25rem 0.7rem', borderRadius: '5px', background: 'var(--card)' }}>{app.owner}</span>
                              </div>}
                              <div style={{ textAlign: 'right' }}>
                                <div style={{ fontSize: '0.65rem', fontWeight: 700, color: 'var(--muted-foreground)', textTransform: 'uppercase', marginBottom: '0.25rem' }}>Status</div>
                                <span style={{ fontSize: '0.75rem', fontWeight: 800, background: 'var(--secondary)', color: 'var(--secondary-foreground)', padding: '0.25rem 0.75rem', borderRadius: '5px', textTransform: 'uppercase' }}>{app.lifecycle || 'Discovery'}</span>
                              </div>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  )}

                  {/* Capabilities Section */}
                  {results?.capabilities?.length > 0 && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                      <div style={{ padding: '0 1.5rem 0.5rem', fontSize: '0.85rem', fontWeight: 800, textTransform: 'uppercase', color: 'var(--muted-foreground)', display: 'flex', alignItems: 'center', gap: '0.6rem', letterSpacing: '0.1em' }}>
                        <Boxes size={16} /> Capabilities
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
                              width: '100%', padding: '1.5rem 2rem', textAlign: 'left', 
                              background: isSelected ? 'var(--accent)' : 'transparent', 
                              border: 'none', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start',
                              borderRadius: '12px', cursor: 'pointer', minHeight: '90px'
                            }}
                            className="search-result-item"
                          >
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ fontWeight: 800, fontSize: '1.15rem', marginBottom: '0.4rem', color: isSelected ? 'var(--primary)' : 'inherit' }}>{cap.name}</div>
                              <div style={{ fontSize: '0.925rem', color: 'var(--muted-foreground)', lineHeight: 1.5, ...lineClampStyle }}>{cap.description || 'No description provided.'}</div>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  )}

                  {/* Organizations Section */}
                  {results?.organizations?.length > 0 && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                      <div style={{ padding: '0 1.5rem 0.5rem', fontSize: '0.85rem', fontWeight: 800, textTransform: 'uppercase', color: 'var(--muted-foreground)', display: 'flex', alignItems: 'center', gap: '0.6rem', letterSpacing: '0.1em' }}>
                        <Layers size={16} /> Organizations
                      </div>
                      {results.organizations.map((org: any, idx: number) => {
                        const actualIdx = (results.applications?.length || 0) + (results.capabilities?.length || 0) + idx;
                        const isSelected = selectedIndex === actualIdx;
                        return (
                          <button
                            key={org.id}
                            onClick={() => closeAndSelect('org', org)}
                            onMouseEnter={() => setSelectedIndex(actualIdx)}
                            style={{ 
                              width: '100%', padding: '1.5rem 2rem', textAlign: 'left', 
                              background: isSelected ? 'var(--accent)' : 'transparent', 
                              border: 'none', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start',
                              borderRadius: '12px', cursor: 'pointer', minHeight: '90px'
                            }}
                            className="search-result-item"
                          >
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ fontWeight: 800, fontSize: '1.15rem', marginBottom: '0.4rem', color: isSelected ? 'var(--primary)' : 'inherit' }}>{org.name}</div>
                              <div style={{ fontSize: '0.925rem', color: 'var(--muted-foreground)', lineHeight: 1.5, ...lineClampStyle }}>{org.description || 'Organization Unit'}</div>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  )}

                  {/* Information Section */}
                  {results?.informationObjects?.length > 0 && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                      <div style={{ padding: '0 1.5rem 0.5rem', fontSize: '0.85rem', fontWeight: 800, textTransform: 'uppercase', color: 'var(--muted-foreground)', display: 'flex', alignItems: 'center', gap: '0.6rem', letterSpacing: '0.1em' }}>
                        <FileText size={16} /> Information Objects
                      </div>
                      {results.informationObjects.map((io: any, idx: number) => {
                        const actualIdx = (results.applications?.length || 0) + (results.capabilities?.length || 0) + (results.organizations?.length || 0) + idx;
                        const isSelected = selectedIndex === actualIdx;
                        return (
                          <button
                            key={io.id}
                            onClick={() => closeAndSelect('info', io)}
                            onMouseEnter={() => setSelectedIndex(actualIdx)}
                            style={{ 
                              width: '100%', padding: '1.5rem 2rem', textAlign: 'left', 
                              background: isSelected ? 'var(--accent)' : 'transparent', 
                              border: 'none', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start',
                              borderRadius: '12px', cursor: 'pointer', minHeight: '90px'
                            }}
                            className="search-result-item"
                          >
                            <div style={{ flex: 1, minWidth: 0, marginRight: '3rem' }}>
                              <div style={{ fontWeight: 800, fontSize: '1.15rem', marginBottom: '0.4rem', color: isSelected ? 'var(--primary)' : 'inherit' }}>{io.name}</div>
                              <div style={{ fontSize: '0.925rem', color: 'var(--muted-foreground)', lineHeight: 1.5, ...lineClampStyle }}>{io.description || 'Information Object'}</div>
                            </div>
                            <div style={{ flexShrink: 0, marginTop: '0.25rem' }}>
                                <div style={{ fontSize: '0.65rem', fontWeight: 700, color: 'var(--muted-foreground)', textTransform: 'uppercase', marginBottom: '0.25rem', textAlign: 'right' }}>Type</div>
                                {io.type && <span style={{ fontSize: '0.75rem', fontWeight: 750, background: 'var(--secondary)', color: 'var(--secondary-foreground)', padding: '0.25rem 0.75rem', borderRadius: '5px' }}>{io.type}</span>}
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  )}

                  {/* Integrations Section */}
                  {results?.integrations?.length > 0 && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                      <div style={{ padding: '0 1.5rem 0.5rem', fontSize: '0.85rem', fontWeight: 800, textTransform: 'uppercase', color: 'var(--muted-foreground)', display: 'flex', alignItems: 'center', gap: '0.6rem', letterSpacing: '0.1em' }}>
                        <Network size={16} /> Integrations
                      </div>
                      {results.integrations.map((i: any, idx: number) => {
                        const actualIdx = (results.applications?.length || 0) + (results.capabilities?.length || 0) + (results.organizations?.length || 0) + (results.informationObjects?.length || 0) + idx;
                        const isSelected = selectedIndex === actualIdx;
                        return (
                          <button
                            key={i.id}
                            onClick={() => closeAndSelect('integration', i)}
                            onMouseEnter={() => setSelectedIndex(actualIdx)}
                            style={{ 
                              width: '100%', padding: '1.5rem 2rem', textAlign: 'left', 
                              background: isSelected ? 'var(--accent)' : 'transparent', 
                              border: 'none', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start',
                              borderRadius: '12px', cursor: 'pointer', minHeight: '100px'
                            }}
                            className="search-result-item"
                          >
                            <div style={{ flex: 1, minWidth: 0, marginRight: '3rem' }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '0.8rem', marginBottom: '0.6rem' }}>
                                  <span style={{ fontWeight: 800, fontSize: '1.15rem' }}>{i.sourceApp?.name}</span>
                                  <ArrowRight size={20} style={{ opacity: 0.5, color: 'var(--primary)' }} />
                                  <span style={{ fontWeight: 800, fontSize: '1.15rem' }}>{i.targetApp?.name}</span>
                              </div>
                              <div style={{ fontSize: '0.925rem', color: 'var(--muted-foreground)', lineHeight: 1.5, ...lineClampStyle }}>
                                <strong style={{ color: 'var(--foreground)' }}>Payload:</strong> {i.payload?.name || 'Undefined Information Object'}
                              </div>
                            </div>
                            <div style={{ flexShrink: 0, marginTop: '0.25rem', textAlign: 'right' }}>
                                <div style={{ fontSize: '0.65rem', fontWeight: 700, color: 'var(--muted-foreground)', textTransform: 'uppercase', marginBottom: '0.25rem' }}>Pattern</div>
                                {i.pattern && <span style={{ fontSize: '0.7rem', fontWeight: 800, background: 'var(--secondary)', color: 'var(--primary)', padding: '0.3rem 0.75rem', borderRadius: '5px', textTransform: 'uppercase', border: '1px solid var(--border)', display: 'inline-block' }}>{i.pattern}</span>}
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  )}

                  {(!results?.applications?.length && !results?.capabilities?.length && !results?.organizations?.length && !results?.informationObjects?.length && !results?.integrations?.length) && (
                    <div style={{ padding: '6rem', textAlign: 'center', color: 'var(--muted-foreground)', fontSize: '1.25rem' }}>
                      No results found for "<strong style={{ color: 'var(--foreground)' }}>{query}</strong>"
                    </div>
                  )}
                </div>
              )}

              {isLoading && (
                <div style={{ padding: '6rem', textAlign: 'center', color: 'var(--muted-foreground)', fontSize: '1.25rem' }}>
                  Searching the landscape...
                </div>
              )}
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </>
  );
};
