import React, { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Send, Sparkles, X } from 'lucide-react';
import { ChatTranscript, usePortfolioChat } from './PortfolioChat';
import { activeLlmProvider, useLlmProviders } from './useLlmProviders';

const SUGGESTIONS = [
  'Which applications are the strongest candidates to eliminate?',
  'Which high-criticality applications are still in Discovery?',
  'Which capabilities have no application supporting them?',
];

export const InventoryChat = () => {
  const sectionRef = useRef<HTMLElement>(null);
  const threadRef = useRef<HTMLDivElement>(null);
  const questionRef = useRef<HTMLTextAreaElement>(null);
  const pendingRef = useRef(false);
  const wasPending = useRef(false);
  const [draft, setDraft] = useState('');
  const [open, setOpen] = useState(false);
  const { messages, pending, error, answeredBy, ask, startNew } = usePortfolioChat();

  const { data: providers, isLoading, isError } = useLlmProviders();
  const active = activeLlmProvider(providers);
  pendingRef.current = pending;

  const focusQuestion = () => {
    const field = questionRef.current;
    if (!field || field.disabled) return;
    const active = document.activeElement;
    if (active instanceof Element && active.closest('[role="dialog"]')) return;
    field.focus({ preventScroll: true });
    const card = field.closest('.ask-portfolio');
    if (card instanceof HTMLElement) card.scrollTop = card.scrollHeight;
  };

  useEffect(() => {
    const thread = threadRef.current;
    if (thread) thread.scrollTop = thread.scrollHeight;
  }, [messages, pending, open]);

  useEffect(() => {
    const was = wasPending.current;
    wasPending.current = pending;
    if (!was || pending || !open) return;
    focusQuestion();
  }, [pending, open]);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Node) || sectionRef.current?.contains(target)) return;
      if (pendingRef.current) return;
      const focused = document.activeElement;
      if (focused instanceof HTMLElement && sectionRef.current?.contains(focused)) focused.blur();
      setOpen(false);
    };
    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, [open]);

  const send = async (text: string) => {
    const question = text.trim();
    if (!question || pending || !active) return;
    setOpen(true);
    setDraft('');
    const ok = await ask(question);
    if (!ok) setDraft(question);
  };

  const beginNew = async () => {
    if (pending) return;
    const question = draft.trim();
    setOpen(true);
    if (question) setDraft('');
    const ok = await startNew(question);
    if (question && !ok) setDraft(question);
    focusQuestion();
  };

  if (isLoading) return null;
  if (isError || !active) {
    return (
      <p style={{ color: 'var(--muted-foreground)', fontSize: '0.82rem', margin: '0 0 0.9rem' }}>
        AI answers are unavailable. Add a provider in{' '}
        <Link
          to="/settings"
          onClick={() => localStorage.setItem('openea_settings_tab', JSON.stringify('ai'))}
          style={{ color: 'var(--brand-focus)' }}
        >
          Settings
        </Link>
        .
      </p>
    );
  }

  const collapse = () => {
    if (pendingRef.current) return;
    const focused = document.activeElement;
    if (focused instanceof HTMLElement && sectionRef.current?.contains(focused)) focused.blur();
    setOpen(false);
  };

  return (
    <div className="ask-portfolio-slot">
      <section
        ref={sectionRef}
        className={`card ask-portfolio${open ? ' is-open' : ''}${draft.trim() ? ' has-draft' : ''}`}
        aria-expanded={open}
        onFocus={() => setOpen(true)}
        onBlur={(event) => {
          const next = event.relatedTarget;
          if (next instanceof Node && event.currentTarget.contains(next)) return;
          if (pendingRef.current) return;
          setOpen(false);
        }}
        onKeyDown={(event) => {
          if (event.key === 'Escape') collapse();
        }}
        onMouseDown={(event) => {
          const target = event.target;
          if (!(target instanceof Element) || target.closest('textarea, button, a, input, label')) return;
          event.preventDefault();
          document.getElementById('inventory-question')?.focus();
        }}
      >
        <div className="ask-portfolio-reveal" inert={!open}>
          <div className="ask-portfolio-reveal-inner">
            <div className="ask-portfolio-head">
              <div className="ask-portfolio-heading">
                <h2 className="ask-portfolio-title">
                  <Sparkles size={20} aria-hidden="true" />
                  Ask the portfolio
                </h2>
                <p className="ask-portfolio-lead">
                  Questions are answered from the current inventory. The provider in Settings is used, and the portfolio is included with the question.
                </p>
              </div>
              <button type="button" className="ask-portfolio-close" aria-label="Close" onClick={collapse} disabled={pending}>
                <X size={18} />
              </button>
            </div>
            {messages.length > 0 && (
              <ChatTranscript ref={threadRef} messages={messages} pendingLabel={pending ? `Asking ${active.name}...` : undefined} />
            )}
            {messages.length === 0 && (
              <div className="ask-portfolio-suggestions">
                {SUGGESTIONS.map((suggestion) => (
                  <button
                    key={suggestion}
                    type="button"
                    className="ask-portfolio-chip"
                    onClick={() => send(suggestion)}
                    disabled={pending}
                  >
                    {suggestion}
                  </button>
                ))}
              </div>
            )}
            <label htmlFor="inventory-question" className="label">Question</label>
          </div>
        </div>

        <form onSubmit={(event) => { event.preventDefault(); send(draft); }}>
          <div className="ask-portfolio-field">
            <span className="ask-portfolio-spark" aria-hidden="true"><Sparkles size={18} /></span>
            <textarea
              ref={questionRef}
              id="inventory-question"
              aria-label="Ask the portfolio"
              rows={2}
              maxLength={4000}
              value={draft}
              placeholder={open ? 'Ask about owners, TIME, contracts, capabilities...' : 'Ask the portfolio'}
              disabled={pending}
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && !event.shiftKey) {
                  event.preventDefault();
                  send(draft);
                }
              }}
            />
          </div>
          <div className="ask-portfolio-reveal" inert={!open}>
            <div className="ask-portfolio-reveal-inner">
              <div className="ask-portfolio-foot">
                <p className="ask-portfolio-meta">
                  {answeredBy ? `Answered by ${answeredBy}` : `Using ${active.name} · ${active.model}`}
                </p>
                <div className="ask-portfolio-actions">
                  {messages.length > 0 && (
                    <button type="button" onClick={beginNew} disabled={pending}>
                      New question
                    </button>
                  )}
                  <button type="submit" className="primary" disabled={pending || !draft.trim()}>
                    <Send size={16} />
                    {pending ? 'Asking...' : 'Ask'}
                  </button>
                </div>
              </div>
              {error && <p className="ask-portfolio-error">{error}</p>}
            </div>
          </div>
        </form>
      </section>
    </div>
  );
};
