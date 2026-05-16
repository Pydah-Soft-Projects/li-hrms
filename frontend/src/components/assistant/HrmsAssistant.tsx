'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Bot, ExternalLink, Loader2, MessageCircle, Send, Sparkles, X } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { manualPathPrefix } from '@/lib/hrmsUserManual';
import { useAuth } from '@/contexts/AuthContext';
import {
  getAssistantStatus,
  streamAssistantMessage,
  type AssistantStatus,
} from '@/lib/assistantApi';

type ChatMessage = {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  streaming?: boolean;
  navigationTopicId?: string | null;
  navigationPath?: string | null;
};

const SESSION_KEY = 'hrms-assistant-session';
const CHAT_KEY = 'hrms-assistant-chat';

function loadStoredChat(): { sessionId?: string; messages: ChatMessage[] } {
  if (typeof window === 'undefined') return { messages: [] };
  try {
    const sessionId = sessionStorage.getItem(SESSION_KEY) || undefined;
    const raw = sessionStorage.getItem(CHAT_KEY);
    if (!raw) return { sessionId, messages: [] };
    const parsed = JSON.parse(raw) as { sessionId?: string; messages: ChatMessage[] };
    if (parsed.sessionId && sessionId && parsed.sessionId !== sessionId) {
      return { sessionId, messages: [] };
    }
    return { sessionId: sessionId || parsed.sessionId, messages: parsed.messages || [] };
  } catch {
    return { messages: [] };
  }
}

function saveStoredChat(sessionId: string | undefined, messages: ChatMessage[]) {
  if (typeof window === 'undefined' || !sessionId) return;
  const toSave = messages.filter((m) => m.id !== 'welcome' || m.content.length > 20);
  sessionStorage.setItem(
    CHAT_KEY,
    JSON.stringify({ sessionId, messages: toSave.slice(-30) })
  );
}

const STATUS_LABELS: Record<string, string> = {
  thinking: 'Understanding your question…',
  fetching: 'Looking up your HRMS data…',
  responding: 'Composing a reply…',
};

function formatReply(text: string) {
  return text
    .split(/\n\n+/)
    .map((p) => p.trim())
    .filter(Boolean);
}

export default function HrmsAssistant() {
  const pathname = usePathname();
  const { user, loading } = useAuth();
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState<AssistantStatus | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [phase, setPhase] = useState<string | null>(null);
  const [sessionId, setSessionId] = useState<string | undefined>();
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const hidden =
    loading ||
    !user ||
    pathname === '/login' ||
    pathname?.startsWith('/login/');

  useEffect(() => {
    if (hidden) return;
    const stored = loadStoredChat();
    if (stored.sessionId) {
      setSessionId(stored.sessionId);
      sessionStorage.setItem(SESSION_KEY, stored.sessionId);
    }
    if (stored.messages.length > 0) {
      setMessages(stored.messages);
    }
    getAssistantStatus().then(setStatus);
  }, [hidden]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, phase, open]);

  useEffect(() => {
    if (open && status?.configured) {
      inputRef.current?.focus();
    }
  }, [open, status?.configured]);

  const greet = useCallback(() => {
    const name = user?.name?.split(' ')[0] || 'there';
    return `Hi ${name}! I can answer HRMS questions from live data and guide you in the app — e.g. how to apply leave or OD, where to find your leaves, payslips, and OT. Try “How do I apply for leave?” or open User Manual from the dashboard.`;
  }, [user?.name]);

  useEffect(() => {
    if (open && messages.length === 0 && status?.configured) {
      setMessages([
        {
          id: 'welcome',
          role: 'assistant',
          content: greet(),
        },
      ]);
    }
  }, [open, messages.length, status?.configured, greet]);

  const send = async () => {
    const text = input.trim();
    if (!text || busy || !status?.configured) return;

    setInput('');
    setBusy(true);
    setPhase('thinking');

    const userMsg: ChatMessage = {
      id: `u-${Date.now()}`,
      role: 'user',
      content: text,
    };
    const assistantId = `a-${Date.now()}`;
    setMessages((prev) => [
      ...prev,
      userMsg,
      { id: assistantId, role: 'assistant', content: '', streaming: true },
    ]);

    let accumulated = '';

    try {
      await streamAssistantMessage(text, sessionId, {
        onSession: (id) => {
          setSessionId(id);
          sessionStorage.setItem(SESSION_KEY, id);
        },
        onStatus: (p) => setPhase(p),
        onToken: (chunk) => {
          accumulated += chunk;
          setMessages((prev) =>
            prev.map((m) =>
              m.id === assistantId ? { ...m, content: accumulated } : m
            )
          );
        },
        onError: (msg) => {
          setMessages((prev) =>
            prev.map((m) =>
              m.id === assistantId
                ? { ...m, content: msg, streaming: false }
                : m
            )
          );
        },
        onDone: (meta) => {
          setMessages((prev) => {
            const next = prev.map((m) =>
              m.id === assistantId
                ? {
                    ...m,
                    streaming: false,
                    navigationTopicId: meta?.navigationTopicId ?? null,
                    navigationPath: meta?.navigationPath ?? null,
                  }
                : m
            );
            const sid =
              sessionStorage.getItem(SESSION_KEY) || sessionId || undefined;
            saveStoredChat(sid, next);
            return next;
          });
        },
      });
    } finally {
      setPhase(null);
      setBusy(false);
    }
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  };

  if (hidden) return null;

  const available = status !== null && status.enabled !== false && status.configured;

  return (
    <>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: 24, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 24, scale: 0.96 }}
            transition={{ type: 'spring', stiffness: 380, damping: 32 }}
            className="fixed bottom-24 right-4 z-[200] flex w-[min(100vw-2rem,420px)] flex-col overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-2xl shadow-slate-900/15"
          >
            <header className="flex items-center gap-3 border-b border-slate-100 bg-gradient-to-r from-indigo-600 to-violet-600 px-4 py-3 text-white">
              <motion.div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/20 backdrop-blur">
                <Sparkles className="h-5 w-5" />
              </motion.div>
              <motion.div className="min-w-0 flex-1">
                <p className="font-semibold leading-tight">HR Assistant</p>
                <p className="text-xs text-white/80">
                  {available ? 'Built-in HRMS intelligence' : 'Loading…'}
                </p>
              </motion.div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded-lg p-1.5 text-white/90 transition hover:bg-white/20"
                aria-label="Close assistant"
              >
                <X className="h-5 w-5" />
              </button>
            </header>

            <motion.div className="flex max-h-[min(60vh,520px)] min-h-[280px] flex-1 flex-col bg-slate-50/80">
              <div className="flex-1 space-y-3 overflow-y-auto px-3 py-4">
                {messages.map((m) => (
                  <div
                    key={m.id}
                    className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}
                  >
                    <div
                      className={`max-w-[88%] rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed shadow-sm ${
                        m.role === 'user'
                          ? 'rounded-br-md bg-indigo-600 text-white'
                          : 'rounded-bl-md border border-slate-200/80 bg-white text-slate-800'
                      }`}
                    >
                      {m.role === 'assistant' && (
                        <Bot className="mb-1 h-4 w-4 text-indigo-500" />
                      )}
                      {formatReply(m.content).map((para, i) => (
                        <p key={i} className={i > 0 ? 'mt-2' : ''}>
                          {para}
                        </p>
                      ))}
                      {m.streaming && (
                        <span className="ml-0.5 inline-block h-4 w-1 animate-pulse bg-indigo-400" />
                      )}
                      {m.role === 'assistant' &&
                        !m.streaming &&
                        (m.navigationPath || m.navigationTopicId) && (
                          <div className="mt-3 flex flex-wrap gap-2 border-t border-slate-100 pt-2">
                            {m.navigationPath && (
                              <Link
                                href={`${manualPathPrefix(pathname)}${m.navigationPath}`}
                                className="inline-flex items-center gap-1 rounded-lg bg-indigo-50 px-2.5 py-1.5 text-xs font-semibold text-indigo-700 hover:bg-indigo-100"
                              >
                                Open page <ExternalLink className="h-3 w-3" />
                              </Link>
                            )}
                            {m.navigationTopicId && (
                              <Link
                                href={`${manualPathPrefix(pathname)}/user-manual?topic=${m.navigationTopicId}`}
                                className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-semibold text-slate-700 hover:border-indigo-200"
                              >
                                Full guide
                              </Link>
                            )}
                          </div>
                        )}
                    </div>
                  </div>
                ))}

                {phase && (
                  <motion.div className="flex items-center gap-2 text-xs text-slate-500">
                    <Loader2 className="h-3.5 w-3.5 animate-spin text-indigo-500" />
                    {STATUS_LABELS[phase] || 'Working on it…'}
                  </motion.div>
                )}
                <motion.div ref={bottomRef} />
              </div>

              {!available && !busy && (
                <motion.div className="border-t border-slate-100 bg-slate-50 px-3 py-2 text-xs text-slate-600">
                  Connecting to HR assistant…
                </motion.div>
              )}

              <div className="border-t border-slate-200/80 bg-white p-3">
                <div className="flex items-end gap-2 rounded-xl border border-slate-200 bg-slate-50 px-2 py-1.5 focus-within:border-indigo-300 focus-within:ring-2 focus-within:ring-indigo-100">
                  <textarea
                    ref={inputRef}
                    rows={1}
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={onKeyDown}
                    disabled={!available || busy}
                    placeholder={
                      available
                        ? 'How do I apply leave? Where are my leaves?'
                        : 'Assistant unavailable'
                    }
                    className="max-h-28 min-h-[40px] flex-1 resize-none bg-transparent px-1 py-2 text-sm text-slate-800 outline-none placeholder:text-slate-400 disabled:opacity-50"
                  />
                  <button
                    type="button"
                    onClick={send}
                    disabled={!available || busy || !input.trim()}
                    className="mb-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-indigo-600 text-white transition hover:bg-indigo-700 disabled:opacity-40"
                    aria-label="Send message"
                  >
                    {busy ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Send className="h-4 w-4" />
                    )}
                  </button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <motion.button
        type="button"
        onClick={() => setOpen((v) => !v)}
        whileHover={{ scale: 1.04 }}
        whileTap={{ scale: 0.96 }}
        className="fixed bottom-5 right-4 z-[199] flex h-14 w-14 items-center justify-center rounded-full bg-gradient-to-br from-indigo-600 to-violet-600 text-white shadow-lg shadow-indigo-600/30 ring-4 ring-white"
        aria-label={open ? 'Close HR assistant' : 'Open HR assistant'}
      >
        {open ? <X className="h-6 w-6" /> : <MessageCircle className="h-6 w-6" />}
      </motion.button>
    </>
  );
}
