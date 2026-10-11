import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
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

export const ChatTranscript = React.forwardRef<HTMLDivElement, {
  messages: ChatTurn[];
  pendingLabel?: string;
  style?: React.CSSProperties;
}>(({ messages, pendingLabel, style }, ref) => {
  const nodeRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const thread = nodeRef.current;
    if (thread) thread.scrollTop = thread.scrollHeight;
  }, [messages, pendingLabel]);
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
    {messages.map((message, index) => (
      <div key={`${message.role}-${index}`} style={{ display: 'flex', justifyContent: message.role === 'user' ? 'flex-end' : 'flex-start' }}>
        <div className={message.role === 'user' ? 'chat-bubble chat-bubble-user' : 'chat-bubble chat-bubble-assistant'}>
          {message.role === 'assistant' ? <MarkdownAnswer text={message.content} /> : message.content}
        </div>
      </div>
    ))}
    {pendingLabel && (
      <p className="chat-pending">{pendingLabel}</p>
    )}
  </div>
  );
});
ChatTranscript.displayName = 'ChatTranscript';
