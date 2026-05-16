/**
 * Local LLM (Ollama) — multi-turn NLP routing and conversational analysis.
 */
const axios = require('axios');
const { formatHistoryForPrompt } = require('./conversationContext');

function isLlmEnabled() {
  return Boolean(process.env.HRMS_AI_OLLAMA_URL?.trim());
}

function getBase() {
  return (process.env.HRMS_AI_OLLAMA_URL || 'http://127.0.0.1:11434').replace(/\/$/, '');
}

function getModel() {
  return process.env.HRMS_AI_OLLAMA_MODEL || 'llama3.2';
}

async function llmChatWithMessages(messages, temperature = 0.3) {
  if (!isLlmEnabled()) return '';
  try {
    const { data } = await axios.post(
      `${getBase()}/api/chat`,
      {
        model: getModel(),
        messages,
        stream: false,
        options: { temperature },
      },
      { timeout: Number(process.env.HRMS_AI_OLLAMA_TIMEOUT_MS) || 120000 }
    );
    return (data?.message?.content || '').trim();
  } catch (err) {
    console.warn('[LLM]', err.message);
    return '';
  }
}

function extractJson(text) {
  const raw = (text || '').trim();
  const fence = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
  const body = fence ? fence[1].trim() : raw;
  const start = body.indexOf('{');
  const end = body.lastIndexOf('}');
  if (start === -1 || end === -1) return null;
  try {
    return JSON.parse(body.slice(start, end + 1));
  } catch {
    return null;
  }
}

async function llmPlanRoutes(message, userContext, catalog, history = []) {
  const catalogText = catalog
    .slice(0, 40)
    .map(
      (c) =>
        `- ${c.id}: ${c.description || ''} [query: ${(c.queryParams || []).join(', ')}]`
    )
    .join('\n');

  const system = `You are the HRMS API router. You remember the full conversation.
Output ONLY valid JSON. Pick 0-4 endpoints for the CURRENT question (use chat history for context).
- Follow-ups like "only active" or "that employee" refer to the previous topic — route accordingly.
- Employee number in question → leaves with search=EMPNO or employee_detail, NOT leaves_my.
- "My name" → empty endpoints [].
- Employee applications → employee_applications.
- Active headcount → employees_count with is_active=true.

{"endpoints":[{"endpointId":"","pathParams":{},"query":{},"reason":""}],"needsClarification":null}`;

  const messages = [{ role: 'system', content: system }];

  const prior = (history || []).slice(-10);
  for (const m of prior) {
    if (m.role === 'user' || m.role === 'assistant') {
      messages.push({ role: m.role, content: m.content });
    }
  }

  messages.push({
    role: 'user',
    content: `User profile: ${JSON.stringify(userContext)}\n\nAPI catalog:\n${catalogText}\n\nRoute this question (JSON only): ${message}`,
  });

  const out = await llmChatWithMessages(messages, 0.1);
  return extractJson(out);
}

async function llmAnalyzeAnswer(message, userName, facts, history = []) {
  const system = `You are ${userName}'s HRMS AI assistant. You remember the entire conversation in this chat.
Rules:
- Answer ONLY using the FACTS JSON in the latest message. Never invent data.
- Write naturally in 2-6 sentences. No raw JSON, no field dumps, no "Summary from...".
- Understand follow-ups (e.g. if they said "only active" after asking about employees, answer about ACTIVE employees only).
- Refer back to earlier turns when the user says "that", "same", "only active", etc.
- Be warm and clear like a knowledgeable HR colleague.`;

  const messages = [{ role: 'system', content: system }];

  for (const m of (history || []).slice(-14)) {
    if (m.role === 'user' || m.role === 'assistant') {
      messages.push({ role: m.role, content: m.content });
    }
  }

  messages.push({
    role: 'user',
    content: `HRMS DATA (for this answer — use only this):\n${JSON.stringify(facts).slice(0, 14000)}\n\nMy question now: ${message}`,
  });

  const out = await llmChatWithMessages(messages, 0.5);
  return out && out.length > 15 ? out : '';
}

module.exports = {
  isLlmEnabled,
  llmPlanRoutes,
  llmAnalyzeAnswer,
  llmChatWithMessages,
  formatHistoryForPrompt,
};
