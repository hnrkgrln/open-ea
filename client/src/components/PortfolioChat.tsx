import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { Check, Copy } from 'lucide-react';
import { MarkdownAnswer } from './MarkdownAnswer';
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

const InsightsChatContext = createContext<PortfolioChatValue | null>(null);
const SearchChatContext = createContext<PortfolioChatValue | null>(null);

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

function ChatSession({ context: Context, children }: { context: React.Context<PortfolioChatValue | null>; children: React.ReactNode }) {
  const [messages, setMessages] = useState<ChatTurn[]>([]);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const [answeredBy, setAnsweredBy] = useState('');
  const messagesRef = useRef(messages);
  const pendingRef = useRef(false);
  const epochRef = useRef(0);
  const { data: providers } = useLlmProviders();
  const active = activeLlmProvider(providers);
  messagesRef.current = messages;

  const ask = useCallback(async (text: string) => {
    const question = text.trim();
    if (!question || pendingRef.current || !active) return false;
    const previous = messagesRef.current;
    const next = turnsForRequest(previous, question);
    const epoch = epochRef.current;
    pendingRef.current = true;
    setMessages(next);
    setError('');
    setPending(true);
    try {
      const thresholds = readStoredTimeThresholds();
      const res = await fetch('/api/llm/ask', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          messages: next,
          timeThresholds: {
            technicalFit: thresholds.technicalFit,
            functionalFit: thresholds.functionalFit,
          },
        }),
      });
      if (epochRef.current !== epoch) return false;
      if (!res.ok) {
        setMessages(previous);
        setError(await readError(res));
        return false;
      }
      const body = await res.json();
      if (epochRef.current !== epoch) return false;
      const reply = (typeof body.text === 'string' ? body.text.trim() : '') || 'The provider returned an empty reply.';
      setAnsweredBy(body.providerName && body.model ? `${body.providerName} · ${body.model}` : active.name);
      setMessages([...next, { role: 'assistant', content: reply.slice(0, MAX_ANSWER) }]);
      return true;
    } catch (err) {
      if (epochRef.current !== epoch) return false;
      setMessages(previous);
      setError(err instanceof Error ? err.message : 'Request failed');
      return false;
    } finally {
      if (epochRef.current === epoch) {
        pendingRef.current = false;
        setPending(false);
      }
    }
  }, [active]);

  const startNew = useCallback(async (text = '') => {
    if (pendingRef.current) return false;
    epochRef.current += 1;
    messagesRef.current = [];
    setMessages([]);
    setError('');
    setAnsweredBy('');
    const question = text.trim();
    if (!question) return true;
    return ask(question);
  }, [ask]);

  const reset = useCallback(() => {
    epochRef.current += 1;
    messagesRef.current = [];
    setMessages([]);
    setError('');
    setAnsweredBy('');
    pendingRef.current = false;
    setPending(false);
  }, []);

  return (
    <Context.Provider value={{ messages, pending, error, answeredBy, ask, startNew, reset }}>
      {children}
    </Context.Provider>
  );
}

export function PortfolioChatProvider({ children }: { children: React.ReactNode }) {
  return (
    <ChatSession context={InsightsChatContext}>
      <ChatSession context={SearchChatContext}>
        {children}
      </ChatSession>
    </ChatSession>
  );
}

function useChatSession(context: React.Context<PortfolioChatValue | null>) {
  const value = useContext(context);
  if (!value) throw new Error('Portfolio chat is unavailable.');
  return value;
}

export function usePortfolioChat() {
  return useChatSession(InsightsChatContext);
}

export function useSearchPortfolioChat() {
  return useChatSession(SearchChatContext);
}

function conversationText(messages: ChatTurn[]) {
  return messages.map((message) => {
    const who = message.role === 'user' ? 'You' : 'Landscape';
    return `${who}\n${message.content.trim()}`;
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
          onClick={() => copy(conversationText(messages), 'all')}
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
          onClick={() => copy(message.content, index)}
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
