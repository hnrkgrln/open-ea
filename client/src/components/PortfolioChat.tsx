import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { Check, Copy } from 'lucide-react';
import { MarkdownAnswer } from './MarkdownAnswer';
import { renderPlainMath } from '../plainMath';
import { useApplicationLinks } from '../useApplicationLinks';
import { activeLlmProvider, useLlmProviders } from './useLlmProviders';
import { readStoredTimeThresholds } from '../timeAssessment';

export interface ChatTurn {
  role: 'user' | 'assistant';
  content: string;
}

const MAX_TURNS = 12;
const MAX_ANSWER = 20000;

interface PortfolioChatValue {
  messages: ChatTurn[];
  pending: boolean;
  error: string;
  answeredBy: string;
  ask: (text: string) => Promise<boolean>;
  startNew: (text?: string) => Promise<boolean>;
  reset: () => void;
}

export interface SearchChatRecord {
  id: string;
  title: string;
  messages: ChatTurn[];
  answeredBy: string;
  updatedAt: number;
}

export interface SearchChatValue extends PortfolioChatValue {
  sessions: SearchChatRecord[];
  activeId: string | null;
  selectSession: (id: string) => void;
}

const SearchChatContext = createContext<SearchChatValue | null>(null);
const MAX_SESSIONS = 20;

function newSessionId() {
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  return `chat-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

async function readError(res: Response) {
  try {
    const body = await res.json();
    return body.error || body.message || res.statusText;
  } catch {
    return res.statusText || 'Request failed';
  }
}

// Keep the earlier questions and answers. The ask route allows 12 turns and must start with a question.
export function turnsForRequest(messages: ChatTurn[], question: string): ChatTurn[] {
  const room = messages.length >= MAX_TURNS ? messages.slice(messages.length - (MAX_TURNS - 1)) : messages;
  const history = room[0]?.role === 'assistant' ? room.slice(1) : room;
  return [...history, { role: 'user', content: question }];
}

async function requestLandscapeAnswer(messages: ChatTurn[], fallbackName: string) {
  const thresholds = readStoredTimeThresholds();
  const res = await fetch('/api/llm/ask', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      messages,
      timeThresholds: {
        technicalFit: thresholds.technicalFit,
        functionalFit: thresholds.functionalFit,
      },
    }),
  });
  if (!res.ok) throw new Error(await readError(res));
  const body = await res.json();
  const reply = ((typeof body.text === 'string' ? body.text.trim() : '') || 'The provider returned an empty reply.').slice(0, MAX_ANSWER);
  const answeredBy = body.providerName && body.model ? `${body.providerName} · ${body.model}` : fallbackName;
  return { reply, answeredBy };
}

function sessionTitle(messages: ChatTurn[]) {
  const text = messages.find((message) => message.role === 'user')?.content ?? '';
  const title = text.replace(/\s+/g, ' ').trim();
  return title.slice(0, 180) || 'New chat';
}

function upsertSession(list: SearchChatRecord[], incoming: SearchChatRecord) {
  const existing = list.find((item) => item.id === incoming.id);
  const record = existing
    ? { ...existing, messages: incoming.messages, answeredBy: incoming.answeredBy, updatedAt: incoming.updatedAt }
    : incoming;
  return [record, ...list.filter((item) => item.id !== record.id)].slice(0, MAX_SESSIONS);
}

function SearchChatSession({ children }: { children: React.ReactNode }) {
  const [sessions, setSessions] = useState<SearchChatRecord[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatTurn[]>([]);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const [answeredBy, setAnsweredBy] = useState('');
  const messagesRef = useRef(messages);
  const sessionsRef = useRef(sessions);
  const activeIdRef = useRef(activeId);
  const answeredByRef = useRef(answeredBy);
  const pendingRef = useRef(false);
  const epochRef = useRef(0);
  const { data: providers } = useLlmProviders();
  const active = activeLlmProvider(providers);
  messagesRef.current = messages;
  sessionsRef.current = sessions;
  activeIdRef.current = activeId;
  answeredByRef.current = answeredBy;

  const remember = useCallback((id: string, nextMessages: ChatTurn[], by: string) => {
    const record: SearchChatRecord = {
      id,
      title: sessionTitle(nextMessages),
      messages: nextMessages,
      answeredBy: by,
      updatedAt: Date.now(),
    };
    const next = upsertSession(sessionsRef.current, record);
    sessionsRef.current = next;
    setSessions(next);
  }, []);

  const ask = useCallback(async (text: string) => {
    const question = text.trim();
    if (!question || pendingRef.current || !active) return false;
    const previous = messagesRef.current;
    const previousId = activeIdRef.current;
    const id = previousId ?? newSessionId();
    const next = turnsForRequest(previous, question);
    const epoch = epochRef.current;
    const by = answeredByRef.current;
    pendingRef.current = true;
    activeIdRef.current = id;
    messagesRef.current = next;
    setActiveId(id);
    setMessages(next);
    setError('');
    setPending(true);
    remember(id, next, previousId ? by : '');
    try {
      const result = await requestLandscapeAnswer(next, active.name);
      if (epochRef.current !== epoch) return false;
      const withReply = [...next, { role: 'assistant' as const, content: result.reply }];
      messagesRef.current = withReply;
      answeredByRef.current = result.answeredBy;
      setAnsweredBy(result.answeredBy);
      setMessages(withReply);
      remember(id, withReply, result.answeredBy);
      return true;
    } catch (err) {
      if (epochRef.current !== epoch) return false;
      if (previousId) {
        messagesRef.current = previous;
        setMessages(previous);
        remember(previousId, previous, by);
      } else {
        activeIdRef.current = null;
        messagesRef.current = [];
        setActiveId(null);
        setMessages([]);
        const next = sessionsRef.current.filter((item) => item.id !== id);
        sessionsRef.current = next;
        setSessions(next);
      }
      setError(err instanceof Error ? err.message : 'Request failed');
      return false;
    } finally {
      if (epochRef.current === epoch) {
        pendingRef.current = false;
        setPending(false);
      }
    }
  }, [active, remember]);

  const startNew = useCallback(async (text = '') => {
    if (pendingRef.current) return false;
    epochRef.current += 1;
    activeIdRef.current = null;
    messagesRef.current = [];
    setActiveId(null);
    setMessages([]);
    setError('');
    setAnsweredBy('');
    answeredByRef.current = '';
    const question = text.trim();
    if (!question) return true;
    return ask(question);
  }, [ask]);

  const selectSession = useCallback((id: string) => {
    if (pendingRef.current) return;
    const session = sessionsRef.current.find((item) => item.id === id);
    if (!session) return;
    activeIdRef.current = id;
    messagesRef.current = session.messages;
    answeredByRef.current = session.answeredBy;
    setActiveId(id);
    setMessages(session.messages);
    setAnsweredBy(session.answeredBy);
    setError('');
  }, []);

  const reset = useCallback(() => {
    epochRef.current += 1;
    activeIdRef.current = null;
    messagesRef.current = [];
    sessionsRef.current = [];
    answeredByRef.current = '';
    setSessions([]);
    setActiveId(null);
    setMessages([]);
    setError('');
    setAnsweredBy('');
    pendingRef.current = false;
    setPending(false);
  }, []);

  return (
    <SearchChatContext.Provider value={{ messages, pending, error, answeredBy, ask, startNew, reset, sessions, activeId, selectSession }}>
      {children}
    </SearchChatContext.Provider>
  );
}

export function PortfolioChatProvider({ children }: { children: React.ReactNode }) {
  return (
    <SearchChatSession>
      {children}
    </SearchChatSession>
  );
}

function useChatSession<T extends PortfolioChatValue>(context: React.Context<T | null>) {
  const value = useContext(context);
  if (!value) throw new Error('Portfolio chat is unavailable.');
  return value;
}

export function useSearchPortfolioChat() {
  return useChatSession(SearchChatContext);
}

function conversationText(messages: ChatTurn[], linkAnswer: (text: string) => string) {
  return messages.map((message) => {
    const who = message.role === 'user' ? 'You' : 'Landscape';
    const body = message.role === 'assistant' ? renderPlainMath(linkAnswer(message.content)) : message.content;
    return `${who}\n${body.trim()}`;
  }).join('\n\n');
}

async function copyText(value: string) {
  const text = value.replace(/\r\n/g, '\n');
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    const area = document.createElement('textarea');
    area.value = text;
    area.setAttribute('readonly', '');
    area.style.position = 'fixed';
    area.style.left = '-9999px';
    document.body.appendChild(area);
    area.select();
    const ok = document.execCommand('copy');
    area.remove();
    if (!ok) throw new Error('copy failed');
  }
}

export const ChatTranscript = React.forwardRef<HTMLDivElement, {
  messages: ChatTurn[];
  pending?: boolean;
  style?: React.CSSProperties;
}>(({ messages, pending, style }, ref) => {
  const linkAnswer = useApplicationLinks();
  const nodeRef = useRef<HTMLDivElement | null>(null);
  const [copied, setCopied] = useState<number | 'all' | null>(null);
  useEffect(() => {
    const thread = nodeRef.current;
    if (thread) thread.scrollTop = thread.scrollHeight;
  }, [messages, pending]);
  useEffect(() => {
    if (copied == null) return;
    const timer = window.setTimeout(() => setCopied(null), 1600);
    return () => window.clearTimeout(timer);
  }, [copied]);
  const copy = async (value: string, mark: number | 'all') => {
    try {
      await copyText(value);
      setCopied(mark);
    } catch {
      setCopied(null);
    }
  };
  return (
  <div
    ref={(node) => {
      nodeRef.current = node;
      if (typeof ref === 'function') ref(node);
      else if (ref) ref.current = node;
    }}
    className="chat-thread"
    style={style}
  >
    {messages.length > 0 && (
      <div className="chat-thread-bar">
        <button
          type="button"
          className="chat-copy"
          onClick={() => copy(conversationText(messages, linkAnswer), 'all')}
        >
          {copied === 'all' ? <Check size={13} /> : <Copy size={13} />}
          {copied === 'all' ? 'Copied' : 'Copy conversation'}
        </button>
      </div>
    )}
    {messages.map((message, index) => (
      <div key={`${message.role}-${index}`} className={message.role === 'user' ? 'chat-turn chat-turn-user' : 'chat-turn chat-turn-assistant'}>
        <div className={message.role === 'user' ? 'chat-bubble chat-bubble-user' : 'chat-bubble chat-bubble-assistant'}>
          {message.role === 'assistant' ? <MarkdownAnswer text={message.content} /> : message.content}
        </div>
        <button
          type="button"
          className="chat-copy"
          aria-label={copied === index ? 'Copied' : message.role === 'user' ? 'Copy question' : 'Copy answer'}
          onClick={() => copy(message.role === 'assistant' ? renderPlainMath(linkAnswer(message.content)) : message.content, index)}
        >
          {copied === index ? <Check size={13} /> : <Copy size={13} />}
          {copied === index ? 'Copied' : 'Copy'}
        </button>
      </div>
    ))}
    {pending && (
      <div className="chat-turn chat-turn-assistant">
        <div className="chat-bubble chat-bubble-assistant chat-typing" role="status" aria-label="Writing an answer">
          <span className="chat-ellipsis" aria-hidden="true"><span /><span /><span /></span>
        </div>
      </div>
    )}
  </div>
  );
});
ChatTranscript.displayName = 'ChatTranscript';
