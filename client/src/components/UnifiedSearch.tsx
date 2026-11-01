import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { Search, Database, Boxes, X, FileText, Layers, Network, ArrowRight, Sparkles, Target, SquarePen, History, Send, ChevronDown } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { ChatTranscript, useSearchPortfolioChat, type ChatTurn, type SearchChatRecord } from './PortfolioChat';
import { activeLlmProvider, useLlmProviders } from './useLlmProviders';

const SUGGESTIONS = [
  'Which applications are the strongest candidates to eliminate?',
  'Which high-criticality applications are still in Discovery?',
  'Which capabilities have no application supporting them?',
];

function SearchAskResult({
  rowRef,
  inputRef,
  selected,
  expanded,
  label,
  activeProvider,
  unavailable,
  messages,
  pending,
  error,
  answeredBy,
  sessions,
  activeId,
  historyOpen,
  draft,
  canSend,
  onHover,
  onActivate,
  onToggle,
  onToggleHistory,
  onSelectSession,
  onNewChat,
  onDraft,
  onSend,
  onOpenSettings,
}: {
  rowRef: React.RefObject<HTMLDivElement | null>;
  inputRef: React.RefObject<HTMLTextAreaElement | null>;
  selected: boolean;
  expanded: boolean;
  label: string;
  activeProvider: { name: string; model: string } | undefined;
  unavailable: boolean;
  messages: ChatTurn[];
  pending: boolean;
  error: string;
  answeredBy: string;
  sessions: SearchChatRecord[];
  activeId: string | null;
  historyOpen: boolean;
  draft: string;
  canSend: boolean;
  onHover: () => void;
  onActivate: () => void;
  onToggle: () => void;
  onToggleHistory: () => void;
  onSelectSession: (id: string) => void;
  onNewChat: () => void;
  onDraft: (value: string) => void;
  onSend: (text: string) => void;
  onOpenSettings: () => void;
}) {
  return (
    <div
      ref={rowRef}
      className={`search-ask-result${expanded ? ' is-open' : ''}${selected ? ' is-selected' : ''}`}
    >
      <div className="search-ask-summary">
        <button
          type="button"
          className="search-ask-main"
          aria-label={label}
          onMouseEnter={onHover}
          onClick={onActivate}
        >
          <Sparkles size={16} aria-hidden="true" />
          <span className="search-result-copy">
            <span className="search-result-title">Ask the Landscape</span>
            <span className="search-ask-hint">{label}</span>
          </span>
          {(pending || messages.length > 0) && <span className="search-ask-dot" aria-hidden="true" />}
        </button>
        {expanded && (
          <>
            <button type="button" className="unified-search-icon" aria-label="New chat" title="New chat" onClick={onNewChat} disabled={pending}>
              <SquarePen size={16} />
            </button>
            <button
              type="button"
              className="unified-search-icon"
              aria-label="Chat history"
              title="Chat history"
              aria-pressed={historyOpen}
              onClick={onToggleHistory}
            >
              <History size={16} />
            </button>
          </>
        )}
        <button
          type="button"
          className="unified-search-icon search-ask-toggle"
          aria-expanded={expanded}
          aria-label={expanded ? 'Collapse answer' : 'Expand answer'}
          title={expanded ? 'Collapse answer' : 'Expand answer'}
          onClick={onToggle}
        >
          <ChevronDown size={16} />
        </button>
      </div>
      {expanded && (
        <div className="search-ask-body">
          {historyOpen && (
            <ul className="unified-search-history" aria-label="Chat history">
              {sessions.length === 0 && <li className="unified-search-history-empty">No earlier chats</li>}
              {sessions.map((session) => (
                <li key={session.id}>
                  <button
                    type="button"
                    aria-current={session.id === activeId ? 'true' : undefined}
                    title={session.title}
                    disabled={pending}
                    onClick={() => onSelectSession(session.id)}
                  >
                    <span>{session.title}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          {unavailable && messages.length === 0 && (
            <p className="unified-search-unavailable">
              AI answers are unavailable. Add a provider in{' '}
              <button type="button" onClick={onOpenSettings}>Settings</button>.
            </p>
          )}
          {!unavailable && messages.length > 0 && (
            <ChatTranscript messages={messages} pending={pending} />
          )}
          {!unavailable && messages.length === 0 && activeProvider && (
            <div className="unified-search-suggestions">
              {SUGGESTIONS.map((suggestion) => (
                <button key={suggestion} type="button" onClick={() => onSend(suggestion)} disabled={pending}>
                  {suggestion}
                </button>
              ))}
            </div>
          )}
          {(activeProvider || messages.length > 0) && (
            <form
              className="unified-search-composer"
              onSubmit={(event) => {
                event.preventDefault();
                onSend(draft);
              }}
            >
              <textarea
                ref={inputRef}
                aria-label="Ask the Landscape"
                rows={2}
                maxLength={4000}
                value={draft}
                placeholder="Ask about owners, TIME, contracts, capabilities..."
                disabled={pending || !activeProvider}
                onChange={(event) => onDraft(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' && !event.shiftKey) {
                    event.preventDefault();
                    onSend(draft);
                  }
                }}
              />
              <div className="unified-search-composer-bar">
                <p>
                  {answeredBy
                    ? `Answered by ${answeredBy}`
                    : activeProvider
                      ? `Using ${activeProvider.name} · ${activeProvider.model}`
                      : ''}
                </p>
                <button type="submit" className="primary" disabled={!canSend}>
                  <Send size={15} />
                  {pending ? 'Asking...' : 'Ask'}
                </button>
              </div>
              {error && <p className="unified-search-chat-error">{error}</p>}
            </form>
          )}
        </div>
      )}
    </div>
  );
}

export const UnifiedSearch = () => {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [query, setQ] = useState('');
  const [chatDraft, setChatDraft] = useState('');
  const [historyOpen, setHistoryOpen] = useState(false);
  const [askExpanded, setAskExpanded] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [isMac, setIsMac] = useState(false);
  const { messages, pending, error, answeredBy, ask, startNew, sessions, activeId, selectSession } = useSearchPortfolioChat();
  const openRef = useRef(false);
  const pendingRef = useRef(false);
  const focusChatAfterOpen = useRef(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const chatInputRef = useRef<HTMLTextAreaElement>(null);
  const askRowRef = useRef<HTMLDivElement>(null);
  const wasPending = useRef(false);

  const focusChat = useCallback(() => {
    if (!openRef.current) return;
    chatInputRef.current?.focus({ preventScroll: true });
  }, []);

  useEffect(() => {
    openRef.current = open;
    pendingRef.current = pending;
  }, [open, pending]);

  useEffect(() => {
    const was = wasPending.current;
    wasPending.current = pending;
    if (!was || pending || !openRef.current) return;
    if (askExpanded) focusChat();
    else inputRef.current?.focus({ preventScroll: true });
  }, [pending, askExpanded, focusChat]);

  useEffect(() => {
    if (!open) return;
    inputRef.current?.focus({ preventScroll: true });
  }, [open]);

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

  const { data: providers, isLoading: providersLoading, isError: providersError } = useLlmProviders();
  const activeProvider = activeLlmProvider(providers);
  const aiOff = !providersLoading && !activeProvider;
  const searchOnly = aiOff && !pending;

  useEffect(() => {
    if (!open || !askExpanded || !focusChatAfterOpen.current) return;
    const field = chatInputRef.current;
    if (!field || field.disabled) return;
    focusChatAfterOpen.current = false;
    field.focus({ preventScroll: true });
  }, [open, askExpanded, activeProvider]);
  const question = query.trim();
  const canAsk = Boolean(activeProvider) && question.length > 1 && question.length <= 4000;
  const chatQuestion = chatDraft.trim();
  const canSendChat = Boolean(activeProvider) && chatQuestion.length > 1 && chatQuestion.length <= 4000 && !pending;

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
    openRef.current = true;
    setQ('');
    setSelectedIndex(0);
    setHistoryOpen(false);
    const reveal = pendingRef.current;
    setAskExpanded(reveal);
    if (reveal) focusChatAfterOpen.current = true;
    setOpen(true);
  }, []);

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === 'k' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        if (openRef.current) {
          openRef.current = false;
          setAskExpanded(false);
          setOpen(false);
        } else openSearch();
      }
    };
    document.addEventListener('keydown', down);
    return () => document.removeEventListener('keydown', down);
  }, [openSearch]);

  const closeSearch = useCallback(() => {
    openRef.current = false;
    setAskExpanded(false);
    setOpen(false);
  }, []);

  const expandAsk = useCallback(() => {
    focusChatAfterOpen.current = true;
    setAskExpanded(true);
  }, []);

  const toggleAsk = useCallback(() => {
    setAskExpanded((current) => {
      if (current) {
        inputRef.current?.focus({ preventScroll: true });
        return false;
      }
      focusChatAfterOpen.current = true;
      return true;
    });
  }, []);

  const closeAndSelect = useCallback((type: 'app' | 'cap' | 'goal' | 'org' | 'info' | 'integration', item: any) => {
    closeSearch();
    setQ('');
    if (type === 'app') navigate(`/apps/${item.id}`);
    else if (type === 'cap') navigate(`/capabilities/${item.id}`);
    else if (type === 'goal') navigate(`/strategic-goals/${item.id}`);
    else if (type === 'org') navigate(`/organizations/${item.id}`);
    else if (type === 'info') navigate(`/information/${item.id}`);
    else if (type === 'integration') navigate(`/integrations/${item.id}`);
  }, [closeSearch, navigate]);

  const recordsReady = query.length > 1 && !isLoading;
  const visibleCount = recordsReady ? flatResults.length : 0;
  const showAsk = pending || (!searchOnly && (canAsk || messages.length > 0 || Boolean(error) || askExpanded));
  const askOpen = askExpanded && !searchOnly;
  const askIndex = visibleCount;
  const optionCount = visibleCount + (showAsk ? 1 : 0);
  const askLabel = pending
    ? 'Asking...'
    : canAsk && messages.length > 0
      ? `Continue with “${question}”`
      : canAsk
        ? `Ask “${question}” about the inventory`
        : messages.length > 0
          ? 'Continue this chat'
          : 'Ask about the inventory';

  const askAi = useCallback(async () => {
    if (!canAsk || pending) return;
    const asked = question;
    setQ('');
    focusChatAfterOpen.current = true;
    setAskExpanded(true);
    setHistoryOpen(false);
    focusChat();
    let ok = false;
    try {
      ok = await ask(asked);
    } catch {
      ok = false;
    }
    if (!ok) setQ((current) => current.trim() ? current : asked);
    focusChat();
  }, [ask, canAsk, focusChat, pending, question]);

  const activateAsk = useCallback(() => {
    if (canAsk && !pending) {
      void askAi();
      return;
    }
    if (!askExpanded) expandAsk();
  }, [askAi, askExpanded, canAsk, expandAsk, pending]);

  const sendChat = useCallback(async (text: string) => {
    const asked = text.trim();
    if (!activeProvider || pending || asked.length < 2 || asked.length > 4000) return;
    setChatDraft('');
    setAskExpanded(true);
    setHistoryOpen(false);
    focusChat();
    let ok = false;
    try {
      ok = await ask(asked);
    } catch {
      ok = false;
    }
    if (!ok) setChatDraft((current) => current.trim() ? current : asked);
    focusChat();
  }, [activeProvider, ask, focusChat, pending]);

  const beginNew = useCallback(async () => {
    if (pending) return;
    setChatDraft('');
    focusChat();
    await startNew('');
    focusChat();
  }, [focusChat, pending, startNew]);

  const openAiSettings = useCallback(() => {
    localStorage.setItem('openea_settings_tab', JSON.stringify('ai'));
    closeSearch();
    navigate('/settings');
  }, [closeSearch, navigate]);

  useEffect(() => {
    if (!open || !showAsk || selectedIndex !== askIndex) return;
    askRowRef.current?.scrollIntoView({ block: 'nearest' });
  }, [open, showAsk, selectedIndex, askIndex]);

  useEffect(() => {
    if (!open || !askExpanded) return;
    askRowRef.current?.scrollIntoView({ block: 'nearest' });
  }, [open, askExpanded]);

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
      if (showAsk && selectedIndex === askIndex) {
        activateAsk();
        return;
      }
      const item = recordsReady ? flatResults[selectedIndex] : undefined;
      if (item) closeAndSelect(item._type as any, item);
    }
  };

  return (
    <>
      <div className="header-search-cluster">
        <button
          onClick={() => openSearch()}
          className="secondary header-search-button"
          style={{ height: '2.1rem', display: 'flex', gap: '0.4rem', alignItems: 'center', padding: '0 0.85rem', justifyContent: 'space-between' }}
        >
          <div className="header-search-query">
            {searchOnly ? <Search size={14} /> : <Sparkles size={14} />}
            <span style={{ fontSize: '0.9rem' }}>{searchOnly ? 'Search everything...' : 'Ask or search everything...'}</span>
          </div>
          <kbd style={{ fontSize: '0.8rem', background: 'var(--muted)', padding: '0.15rem 0.4rem', borderRadius: '4px', opacity: 0.7, flexShrink: 0 }}>{isMac ? '⌘K' : 'Ctrl+K'}</kbd>
        </button>
      </div>

      <Dialog.Root open={open} onOpenChange={(next) => { if (next) openSearch(); else closeSearch(); }}>
        <Dialog.Portal>
          <Dialog.Overlay className="unified-search-overlay" />
          <Dialog.Content
            className={`unified-search-dialog${askOpen ? ' is-ai' : ''}`}
            onOpenAutoFocus={(event) => {
              event.preventDefault();
              inputRef.current?.focus({ preventScroll: true });
            }}
          >
            <Dialog.Title style={{ display: 'none' }}>{searchOnly ? 'Search' : 'Ask or search'}</Dialog.Title>
            <Dialog.Description style={{ display: 'none' }}>
              {searchOnly
                ? 'Search for apps, owners, strategic goals, capabilities, information, or integrations.'
                : 'Type a question to start a chat, or search for apps, owners, strategic goals, capabilities, information, or integrations.'}
            </Dialog.Description>
            <div className="unified-search-bar">
              {searchOnly ? <Search size={18} aria-hidden="true" /> : <Sparkles size={18} aria-hidden="true" />}
              <div className="unified-search-field">
                <input
                  ref={inputRef}
                  placeholder={searchOnly ? 'Search everything...' : 'Ask or search everything...'}
                  value={query}
                  onChange={(e) => setQ(e.target.value)}
                  onKeyDown={handleKeyDown}
                />
                {query && (
                  <button type="button" className="unified-search-icon unified-search-clear" aria-label="Clear search" onClick={() => setQ('')}>
                    <X size={16} />
                  </button>
                )}
              </div>
              <Dialog.Close asChild>
                <button type="button" className="unified-search-icon" aria-label="Close"><X size={18} /></button>
              </Dialog.Close>
            </div>
            {searchOnly && (
              <p className="unified-search-ai-setup">
                AI can be configured in{' '}
                <button type="button" onClick={openAiSettings}>Settings</button>.
              </p>
            )}

            <div className="unified-search-body">
            <div className="unified-search-results">
            <div className="unified-search-results-list">
              {!query && !askOpen && (
                <div className="unified-search-empty">
                  <Search size={22} aria-hidden="true" />
                  <div className="unified-search-empty-title">{searchOnly ? 'Search' : 'Ask or search'}</div>
                  <p>
                    {searchOnly
                      ? 'Search for apps, owners, goals, capabilities, and integrations.'
                      : 'Type a question to start a chat, or search for apps, owners, goals, capabilities, and integrations.'}
                  </p>
                </div>
              )}

              {query && query.length > 1 && !isLoading && (
                <div className="search-result-groups">
                  {/* Applications Section */}
                  {sortedApps?.length > 0 && (
                    <div className="search-result-group">
                      <div className="unified-search-label">
                        <Database size={16} /> Applications
                      </div>
                      {sortedApps.map((app: any, idx: number) => {
                        const isSelected = selectedIndex === idx;
                        return (
                          <button
                            key={app.id}
                            type="button"
                            onClick={() => closeAndSelect('app', app)}
                            onMouseEnter={() => setSelectedIndex(idx)}
                            className={`search-result-item${isSelected ? ' is-selected' : ''}`}
                          >
                            <div className="search-result-copy">
                              <div className="search-result-title">{app.name}</div>
                              <div className="search-result-desc">{app.description || 'No description provided.'}</div>
                            </div>
                            <div className="search-result-meta">
                              {app.ownerOrg && <div className="search-result-meta-item">
                                <div className="search-result-meta-label">Owning Org</div>
                                <span className="search-result-chip is-org"><Layers size={10} aria-hidden="true" /> {app.ownerOrg.name}</span>
                              </div>}
                              {app.owner && <div className="search-result-meta-item">
                                <div className="search-result-meta-label">Owner</div>
                                <span className="search-result-chip">{app.owner}</span>
                              </div>}
                              <div className="search-result-meta-item">
                                <div className="search-result-meta-label">Status</div>
                                <span className="search-result-chip is-status">{app.lifecycle || 'Discovery'}</span>
                              </div>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  )}

                  {/* Capabilities Section */}
                  {sortedCaps?.length > 0 && (
                    <div className="search-result-group">
                      <div className="unified-search-label">
                        <Boxes size={16} /> Capabilities
                      </div>
                      {sortedCaps.map((cap: any, idx: number) => {
                        const actualIdx = (sortedApps?.length || 0) + idx;
                        const isSelected = selectedIndex === actualIdx;
                        return (
                          <button
                            key={cap.id}
                            type="button"
                            onClick={() => closeAndSelect('cap', cap)}
                            onMouseEnter={() => setSelectedIndex(actualIdx)}
                            className={`search-result-item${isSelected ? ' is-selected' : ''}`}
                          >
                            <div className="search-result-copy">
                              <div className="search-result-title">{cap.name}</div>
                              <div className="search-result-desc">{cap.description || 'No description provided.'}</div>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  )}

                  {sortedGoals?.length > 0 && (
                    <div className="search-result-group">
                      <div className="unified-search-label">
                        <Target size={16} /> Strategic Goals
                      </div>
                      {sortedGoals.map((goal: any, idx: number) => {
                        const actualIdx = (sortedApps?.length || 0) + (sortedCaps?.length || 0) + idx;
                        const isSelected = selectedIndex === actualIdx;
                        const required = (goal.capabilities || []).map((capability: { name: string }) => capability.name).join(', ');
                        return (
                          <button
                            key={goal.id}
                            type="button"
                            onClick={() => closeAndSelect('goal', goal)}
                            onMouseEnter={() => setSelectedIndex(actualIdx)}
                            className={`search-result-item${isSelected ? ' is-selected' : ''}`}
                          >
                            <div className="search-result-copy">
                              <div className="search-result-title">{goal.name}</div>
                              <div className="search-result-desc">{goal.description || (required ? `Requires ${required}` : 'Strategic goal')}</div>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  )}

                  {/* Organizations Section */}
                  {sortedOrgs?.length > 0 && (
                    <div className="search-result-group">
                      <div className="unified-search-label">
                        <Layers size={16} /> Organizations
                      </div>
                      {sortedOrgs.map((org: any, idx: number) => {
                        const actualIdx = (sortedApps?.length || 0) + (sortedCaps?.length || 0) + (sortedGoals?.length || 0) + idx;
                        const isSelected = selectedIndex === actualIdx;
                        return (
                          <button
                            key={org.id}
                            type="button"
                            onClick={() => closeAndSelect('org', org)}
                            onMouseEnter={() => setSelectedIndex(actualIdx)}
                            className={`search-result-item${isSelected ? ' is-selected' : ''}`}
                          >
                            <div className="search-result-copy">
                              <div className="search-result-title">{org.name}</div>
                              <div className="search-result-desc">{org.description || 'Organization Unit'}</div>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  )}

                  {/* Information Section */}
                  {sortedInfo?.length > 0 && (
                    <div className="search-result-group">
                      <div className="unified-search-label">
                        <FileText size={16} /> Information Objects
                      </div>
                      {sortedInfo.map((io: any, idx: number) => {
                        const actualIdx = (sortedApps?.length || 0) + (sortedCaps?.length || 0) + (sortedGoals?.length || 0) + (sortedOrgs?.length || 0) + idx;
                        const isSelected = selectedIndex === actualIdx;
                        return (
                          <button
                            key={io.id}
                            type="button"
                            onClick={() => closeAndSelect('info', io)}
                            onMouseEnter={() => setSelectedIndex(actualIdx)}
                            className={`search-result-item${isSelected ? ' is-selected' : ''}`}
                          >
                            <div className="search-result-copy">
                              <div className="search-result-title">{io.name}</div>
                              <div className="search-result-desc">{io.description || 'Information Object'}</div>
                            </div>
                            {io.type && (
                              <div className="search-result-meta">
                                <div className="search-result-meta-item">
                                  <div className="search-result-meta-label">Type</div>
                                  <span className="search-result-chip is-status">{io.type}</span>
                                </div>
                              </div>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  )}

                  {/* Integrations Section */}
                  {sortedIntegrations?.length > 0 && (
                    <div className="search-result-group">
                      <div className="unified-search-label">
                        <Network size={16} /> Integrations
                      </div>
                      {sortedIntegrations.map((i: any, idx: number) => {
                        const actualIdx = (sortedApps?.length || 0) + (sortedCaps?.length || 0) + (sortedGoals?.length || 0) + (sortedOrgs?.length || 0) + (sortedInfo?.length || 0) + idx;
                        const isSelected = selectedIndex === actualIdx;
                        return (
                          <button
                            key={i.id}
                            type="button"
                            onClick={() => closeAndSelect('integration', i)}
                            onMouseEnter={() => setSelectedIndex(actualIdx)}
                            className={`search-result-item${isSelected ? ' is-selected' : ''}`}
                          >
                            <div className="search-result-copy">
                              <div className="search-result-flow">
                                <span>{i.sourceApp?.name}</span>
                                <ArrowRight size={14} aria-hidden="true" />
                                <span>{i.targetApp?.name}</span>
                              </div>
                              <div className="search-result-desc">
                                <strong>Payload:</strong> {i.payload?.name || 'Undefined Information Object'}
                              </div>
                            </div>
                            {i.pattern && (
                              <div className="search-result-meta">
                                <div className="search-result-meta-item">
                                  <div className="search-result-meta-label">Pattern</div>
                                  <span className="search-result-chip is-pattern">{i.pattern}</span>
                                </div>
                              </div>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  )}

                  {(!results?.applications?.length && !results?.capabilities?.length && !results?.strategicGoals?.length && !results?.organizations?.length && !results?.informationObjects?.length && !results?.integrations?.length) && (
                    <div className="unified-search-status">
                      No results found for "<strong>{query}</strong>"
                    </div>
                  )}
                </div>
              )}

              {query.length > 1 && isLoading && (
                <div className="unified-search-status">
                  Searching the landscape...
                </div>
              )}
              {showAsk && (
                <SearchAskResult
                  rowRef={askRowRef}
                  inputRef={chatInputRef}
                  selected={selectedIndex === askIndex}
                  expanded={askExpanded}
                  label={askLabel}
                  activeProvider={activeProvider}
                  unavailable={Boolean(providersError || (!providersLoading && !activeProvider))}
                  messages={messages}
                  pending={pending}
                  error={error}
                  answeredBy={answeredBy}
                  sessions={sessions}
                  activeId={activeId}
                  historyOpen={historyOpen}
                  draft={chatDraft}
                  canSend={canSendChat}
                  onHover={() => setSelectedIndex(askIndex)}
                  onActivate={activateAsk}
                  onToggle={toggleAsk}
                  onToggleHistory={() => setHistoryOpen((current) => !current)}
                  onSelectSession={(id) => { selectSession(id); focusChat(); }}
                  onNewChat={beginNew}
                  onDraft={setChatDraft}
                  onSend={sendChat}
                  onOpenSettings={openAiSettings}
                />
              )}
            </div>
            </div>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </>
  );
};
