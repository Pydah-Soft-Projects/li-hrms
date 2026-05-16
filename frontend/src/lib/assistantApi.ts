import { auth } from '@/lib/auth';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'https://hrms.pydah.edu.in/api';

export interface AssistantStatus {
  enabled: boolean;
  configured: boolean;
  provider?: 'builtin' | 'self_hosted';
  conversationMemory?: boolean;
  llmEnabled?: boolean;
  streaming: boolean;
}

export interface AssistantChatMeta {
  endpointsUsed?: string[];
  needsClarification?: boolean;
  answerEngine?: string;
  navigationTopicId?: string | null;
  navigationPath?: string | null;
}

export interface AssistantChatResponse {
  reply: string;
  sessionId: string;
  meta?: AssistantChatMeta;
}

export async function getAssistantStatus(): Promise<AssistantStatus | null> {
  const token = auth.getToken();
  if (!token) return null;

  try {
    const res = await fetch(`${API_BASE_URL}/assistant/status`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const json = await res.json();
    if (!res.ok || !json.success) return null;
    return json.data as AssistantStatus;
  } catch {
    return null;
  }
}

export async function sendAssistantMessage(
  message: string,
  sessionId?: string
): Promise<{ success: boolean; data?: AssistantChatResponse; message?: string }> {
  const token = auth.getToken();
  if (!token) {
    return { success: false, message: 'Please sign in to use the assistant.' };
  }

  const res = await fetch(`${API_BASE_URL}/assistant/chat`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ message, sessionId }),
  });

  const json = await res.json();
  if (!res.ok) {
    return { success: false, message: json.message || 'Assistant request failed' };
  }
  return { success: true, data: json.data };
}

export type StreamHandlers = {
  onSession?: (sessionId: string) => void;
  onStatus?: (phase: string) => void;
  onToken?: (text: string) => void;
  onDone?: (meta?: AssistantChatMeta) => void;
  onError?: (message: string) => void;
};

export async function streamAssistantMessage(
  message: string,
  sessionId: string | undefined,
  handlers: StreamHandlers
): Promise<void> {
  const token = auth.getToken();
  if (!token) {
    handlers.onError?.('Please sign in to use the assistant.');
    return;
  }

  const res = await fetch(`${API_BASE_URL}/assistant/chat/stream`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ message, sessionId }),
  });

  if (!res.ok || !res.body) {
    const err = await res.json().catch(() => ({}));
    handlers.onError?.(err.message || 'Stream failed');
    return;
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const parts = buffer.split('\n\n');
    buffer = parts.pop() || '';

    for (const part of parts) {
      const lines = part.split('\n');
      let event = 'message';
      let dataLine = '';
      for (const line of lines) {
        if (line.startsWith('event:')) event = line.slice(6).trim();
        if (line.startsWith('data:')) dataLine = line.slice(5).trim();
      }
      if (!dataLine) continue;
      try {
        const data = JSON.parse(dataLine);
        if (event === 'session' && data.sessionId) handlers.onSession?.(data.sessionId);
        if (event === 'status' && data.phase) handlers.onStatus?.(data.phase);
        if (event === 'token' && data.text) handlers.onToken?.(data.text);
        if (event === 'done') handlers.onDone?.(data.meta);
        if (event === 'error') handlers.onError?.(data.message || 'Error');
      } catch {
        /* ignore */
      }
    }
  }
}
