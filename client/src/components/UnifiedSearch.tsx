import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { Search, Database, Boxes, X, FileText, Layers, Network, ArrowRight, Sparkles, Target } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { ChatTranscript, useSearchPortfolioChat } from './PortfolioChat';
import { activeLlmProvider, useLlmProviders } from './useLlmProviders';

interface Props {}

export const UnifiedSearch = ({}: Props) => {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [query, setQ] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [isMac, setIsMac] = useState(false);
  const { messages, pending, error, ask, startNew, reset } = useSearchPortfolioChat();
  const openRef = useRef(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const wasPending = useRef(false);
  openRef.current = open;

  const focusQuery = useCallback(() => {
    if (!openRef.current) return;
    inputRef.current?.focus({ preventScroll: true });
  }, []);

  useEffect(() => {
    const was = wasPending.current;
    wasPending.current = pending;
    if (was && !pending) focusQuery();
  }, [pending, focusQuery]);

  useEffect(() => {
    setIsMac(navigator.platform.toUpperCase().indexOf('MAC') >= 0);
  }, []);

  const { data: results, isLoading } = useQuery({
    queryKey: ['search', query],
    queryFn: async () => {
      if (!query) return { applications: [], capabilities: [], strategicGoals: [], organizations: [], informationObjects: [], integrations: [] };
      const res = await fetch(`/api/search?q=${encodeURIComponent(query)}`);
      return res.json();
    },
    enabled: query.length > 1,
  });

  const { data: providers } = useLlmProviders();
  const activeProvider = activeLlmProvider(providers);
  const question = query.trim();
  const canAsk = Boolean(activeProvider) && question.length > 1 && question.length <= 4000;

  // Helper to score match relevance
  const getScore = (item: any, queryStr: string) => {
    const q = queryStr.trim().toLowerCase();
    const n = (item?.name || '').toLowerCase();
    let score = 10;
    if (n === q) score = 100;
    else if (n.startsWith(q)) score = 60;
    else if (n.includes(q)) score = 40;

    // Rank decommissioned apps lower
    if ((item?.lifecycle || '').toLowerCase() === 'decommissioned') {
      score -= 50;
    }
    return score;
  };

  const { sortedApps, sortedCaps, sortedGoals, sortedOrgs, sortedInfo, sortedIntegrations, flatResults } = useMemo(() => {
    const apps = [...(results?.applications || [])]
      .sort((a: any, b: any) => getScore(b, query) - getScore(a, query));
    const caps = [...(results?.capabilities || [])]
      .sort((a: any, b: any) => getScore(b, query) - getScore(a, query));
    const goals = [...(results?.strategicGoals || [])]
      .sort((a: any, b: any) => getScore(b, query) - getScore(a, query));
    const orgs = [...(results?.organizations || [])]
      .sort((a: any, b: any) => getScore(b, query) - getScore(a, query));
    const info = [...(results?.informationObjects || [])]
      .sort((a: any, b: any) => getScore(b, query) - getScore(a, query));
    const integrations = [...(results?.integrations || [])]
      .sort((a: any, b: any) => getScore(b, query) - getScore(a, query));

    const flat = [
      ...apps.map((item: any) => ({ ...item, _type: 'app' })),
      ...caps.map((item: any) => ({ ...item, _type: 'cap' })),
      ...goals.map((item: any) => ({ ...item, _type: 'goal' })),
      ...orgs.map((item: any) => ({ ...item, _type: 'org' })),
      ...info.map((item: any) => ({ ...item, _type: 'info' })),
      ...integrations.map((item: any) => ({ ...item, _type: 'integration' }))
    ];

    return {
      sortedApps: apps,
      sortedCaps: caps,
      sortedGoals: goals,
      sortedOrgs: orgs,
      sortedInfo: info,
      sortedIntegrations: integrations,
      flatResults: flat
    };
  }, [results, query]);

  useEffect(() => {
    setSelectedIndex(0);
  }, [query, results]);

  const openSearch = useCallback(() => {
    if (openRef.current) return;
    setQ('');
    setSelectedIndex(0);
    reset();
    setOpen(true);
  }, [reset]);

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === 'k' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        if (openRef.current) setOpen(false);
        else openSearch();
      }
    };
    document.addEventListener('keydown', down);
    return () => document.removeEventListener('keydown', down);
  }, [openSearch]);

  const closeAndSelect = useCallback((type: 'app' | 'cap' | 'goal' | 'org' | 'info' | 'integration', item: any) => {
    setOpen(false);
    setQ('');
    if (type === 'app') navigate(`/apps/${item.id}`);
    else if (type === 'cap') navigate(`/capabilities/${item.id}`);
    else if (type === 'goal') navigate(`/strategic-goals/${item.id}`);
    else if (type === 'org') navigate(`/organizations/${item.id}`);
    else if (type === 'info') navigate(`/information/${item.id}`);
    else if (type === 'integration') navigate(`/integrations/${item.id}`);
  }, [navigate]);

  const askIndex = flatResults.length;
  const optionCount = flatResults.length + (canAsk ? 1 : 0);
  const hasAssistantAnswer = messages.some((message) => message.role === 'assistant');
  const waitingForRecords = query.length > 1 && isLoading;
  const showingRecords = query.length > 1 && !isLoading && flatResults.length > 0;
  const answerFillsDialog = hasAssistantAnswer && !waitingForRecords && !showingRecords;

  const askAi = useCallback(async () => {
    if (!canAsk || pending) return;
    const asked = question;
    setQ('');
    focusQuery();
    const ok = await ask(asked);
    if (!ok) setQ((current) => current.trim() ? current : asked);
    focusQuery();
  }, [ask, canAsk, focusQuery, pending, question]);

  const beginNew = useCallback(async () => {
    if (pending) return;
    focusQuery();
    await startNew(canAsk ? question : '');
    focusQuery();
  }, [canAsk, focusQuery, pending, question, startNew]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (optionCount === 0) return;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex((prev) => (prev + 1) % optionCount);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex((prev) => (prev - 1 + optionCount) % optionCount);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (canAsk && selectedIndex === askIndex) {
        askAi();
        return;
      }
      const item = flatResults[selectedIndex];
      if (item) closeAndSelect(item._type as any, item);
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
        onClick={openSearch}
        className="secondary header-search-button"
        style={{ height: '2.1rem', display: 'flex', gap: '0.4rem', alignItems: 'center', padding: '0 0.85rem', justifyContent: 'space-between' }}
      >
        <div className="header-search-query">
          <Search size={14} />
          <span style={{ fontSize: '0.9rem' }}>Search everything...</span>
        </div>
        <kbd style={{ fontSize: '0.8rem', background: 'var(--muted)', padding: '0.15rem 0.4rem', borderRadius: '4px', opacity: 0.7, flexShrink: 0 }}>{isMac ? '⌘K' : 'Ctrl+K'}</kbd>
      </button>

      <Dialog.Root open={open} onOpenChange={(next) => { if (next) openSearch(); else setOpen(false); }}>
        <Dialog.Portal>
          <Dialog.Overlay style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 200 }} />
          <Dialog.Content style={{ 
            position: 'fixed', top: '10%', left: '50%', transform: 'translateX(-50%)',
            width: '95vw', maxWidth: '1100px', background: 'var(--card)', padding: '0',
            borderRadius: 'var(--radius)', zIndex: 250, border: '1px solid var(--border)',
            boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
            ...(answerFillsDialog ? { display: 'flex', flexDirection: 'column', height: '80vh' } : {}),
          }}>
            <Dialog.Title style={{ display: 'none' }}>Search</Dialog.Title>
            <Dialog.Description style={{ display: 'none' }}>Search for apps, owners, strategic goals, capabilities, information, or integrations.</Dialog.Description>
            <div style={{ padding: '1.5rem', borderBottom: '1px solid var(--border)', display: 'flex', gap: '1.25rem', alignItems: 'center', flexShrink: 0 }}>
              <Search size={28} style={{ color: 'var(--muted-foreground)' }} />
              <div style={{ position: 'relative', flex: 1, display: 'flex', alignItems: 'center' }}>
                <input
                  ref={inputRef}
                  autoFocus
                  placeholder={messages.length > 0 ? 'Ask a follow-up, or search again...' : 'Search apps, owners, strategic goals, capabilities, information, or integrations...'}
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

            <div style={{
              maxHeight: answerFillsDialog ? undefined : '70vh',
              overflowY: answerFillsDialog ? 'hidden' : 'auto',
              padding: '1.25rem',
              ...(answerFillsDialog ? { flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' } : {}),
            }}>
              {(canAsk || messages.length > 0 || error) && (
                <div style={{
                  marginBottom: answerFillsDialog ? 0 : '1.25rem',
                  border: '1px solid var(--border)',
                  borderRadius: '12px',
                  ...(answerFillsDialog ? { flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' } : {}),
                }}>
                  {messages.length > 0 && (
                    <ChatTranscript
                      messages={messages}
                      pending={pending}
                      style={answerFillsDialog
                        ? { flex: 1, minHeight: 0, maxHeight: 'none', margin: '0.75rem 1rem 0.35rem', overflowY: 'auto' }
                        : { maxHeight: '14rem', margin: '0.75rem 1rem 0.35rem' }}
                    />
                  )}
                  {canAsk && (
                    <button
                      type="button"
                      onClick={askAi}
                      onMouseEnter={() => setSelectedIndex(askIndex)}
                      disabled={pending}
                      style={{
                        width: '100%',
                        padding: '0.9rem 1.25rem',
                        textAlign: 'left',
                        background: selectedIndex === askIndex ? 'var(--accent)' : 'transparent',
                        border: 'none',
                        borderRadius: '12px',
                        display: 'flex',
                        justifyContent: 'flex-start',
                        alignItems: 'center',
                        gap: '0.75rem',
                        cursor: 'pointer',
                        height: 'auto',
                        flexShrink: 0,
                      }}
                    >
                      <Sparkles size={16} />
                      <span style={{ minWidth: 0 }}>
                        <span style={{ display: 'block', fontWeight: 800, fontSize: '0.95rem' }}>Ask the Landscape</span>
                        <span style={{ display: 'block', fontSize: '0.8rem', color: 'var(--muted-foreground)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {pending ? 'Asking...' : messages.length > 0 ? `Continue with “${question}”` : `Ask “${question}” about the inventory`}
                        </span>
                      </span>
                    </button>
                  )}
                  {messages.length > 0 && (
                    <div style={{ display: 'flex', justifyContent: 'flex-end', padding: '0 1.25rem 0.85rem', flexShrink: 0 }}>
                      <button type="button" onClick={beginNew} disabled={pending} style={{ height: '2rem', padding: '0 0.85rem', fontSize: '0.78rem' }}>
                        New question
                      </button>
                    </div>
                  )}
                  {error && <p style={{ color: 'var(--destructive)', fontSize: '0.82rem', margin: '0 1.25rem 0.9rem' }}>{error}</p>}
                </div>
              )}
              {!query && messages.length === 0 && (
                <div style={{ padding: '8rem 2rem', textAlign: 'center', color: 'var(--muted-foreground)' }}>
                  <div style={{ fontSize: '1.5rem', fontWeight: 700, marginBottom: '0.5rem', color: 'var(--foreground)' }}>Quick Landscape Search</div>
                  <div style={{ fontSize: '1.1rem' }}>Find apps, owners, strategic goals, capabilities, information objects or system integrations...</div>
                </div>
              )}

              {query && query.length > 1 && !isLoading && !answerFillsDialog && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
                  {/* Applications Section */}
                  {sortedApps?.length > 0 && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                      <div style={{ padding: '0 1.5rem 0.5rem', fontSize: '0.85rem', fontWeight: 800, textTransform: 'uppercase', color: 'var(--muted-foreground)', display: 'flex', alignItems: 'center', gap: '0.6rem', letterSpacing: '0.1em' }}>
                        <Database size={16} /> Applications
                      </div>
                      {sortedApps.map((app: any, idx: number) => {
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
                  {sortedCaps?.length > 0 && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                      <div style={{ padding: '0 1.5rem 0.5rem', fontSize: '0.85rem', fontWeight: 800, textTransform: 'uppercase', color: 'var(--muted-foreground)', display: 'flex', alignItems: 'center', gap: '0.6rem', letterSpacing: '0.1em' }}>
                        <Boxes size={16} /> Capabilities
                      </div>
                      {sortedCaps.map((cap: any, idx: number) => {
                        const actualIdx = (sortedApps?.length || 0) + idx;
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

                  {sortedGoals?.length > 0 && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                      <div style={{ padding: '0 1.5rem 0.5rem', fontSize: '0.85rem', fontWeight: 800, textTransform: 'uppercase', color: 'var(--muted-foreground)', display: 'flex', alignItems: 'center', gap: '0.6rem', letterSpacing: '0.1em' }}>
                        <Target size={16} /> Strategic Goals
                      </div>
                      {sortedGoals.map((goal: any, idx: number) => {
                        const actualIdx = (sortedApps?.length || 0) + (sortedCaps?.length || 0) + idx;
                        const isSelected = selectedIndex === actualIdx;
                        const required = (goal.capabilities || []).map((capability: { name: string }) => capability.name).join(', ');
                        return (
                          <button
                            key={goal.id}
                            onClick={() => closeAndSelect('goal', goal)}
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
                              <div style={{ fontWeight: 800, fontSize: '1.15rem', marginBottom: '0.4rem', color: isSelected ? 'var(--primary)' : 'inherit' }}>{goal.name}</div>
                              <div style={{ fontSize: '0.925rem', color: 'var(--muted-foreground)', lineHeight: 1.5, ...lineClampStyle }}>{goal.description || (required ? `Requires ${required}` : 'Strategic goal')}</div>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  )}

                  {/* Organizations Section */}
                  {sortedOrgs?.length > 0 && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                      <div style={{ padding: '0 1.5rem 0.5rem', fontSize: '0.85rem', fontWeight: 800, textTransform: 'uppercase', color: 'var(--muted-foreground)', display: 'flex', alignItems: 'center', gap: '0.6rem', letterSpacing: '0.1em' }}>
                        <Layers size={16} /> Organizations
                      </div>
                      {sortedOrgs.map((org: any, idx: number) => {
                        const actualIdx = (sortedApps?.length || 0) + (sortedCaps?.length || 0) + (sortedGoals?.length || 0) + idx;
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
                  {sortedInfo?.length > 0 && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                      <div style={{ padding: '0 1.5rem 0.5rem', fontSize: '0.85rem', fontWeight: 800, textTransform: 'uppercase', color: 'var(--muted-foreground)', display: 'flex', alignItems: 'center', gap: '0.6rem', letterSpacing: '0.1em' }}>
                        <FileText size={16} /> Information Objects
                      </div>
                      {sortedInfo.map((io: any, idx: number) => {
                        const actualIdx = (sortedApps?.length || 0) + (sortedCaps?.length || 0) + (sortedGoals?.length || 0) + (sortedOrgs?.length || 0) + idx;
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
                  {sortedIntegrations?.length > 0 && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                      <div style={{ padding: '0 1.5rem 0.5rem', fontSize: '0.85rem', fontWeight: 800, textTransform: 'uppercase', color: 'var(--muted-foreground)', display: 'flex', alignItems: 'center', gap: '0.6rem', letterSpacing: '0.1em' }}>
                        <Network size={16} /> Integrations
                      </div>
                      {sortedIntegrations.map((i: any, idx: number) => {
                        const actualIdx = (sortedApps?.length || 0) + (sortedCaps?.length || 0) + (sortedGoals?.length || 0) + (sortedOrgs?.length || 0) + (sortedInfo?.length || 0) + idx;
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

                  {(!results?.applications?.length && !results?.capabilities?.length && !results?.strategicGoals?.length && !results?.organizations?.length && !results?.informationObjects?.length && !results?.integrations?.length) && (
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
