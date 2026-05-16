/**
 * Conversation awareness — format history and resolve follow-up questions.
 */

const FOLLOW_UP_RE =
  /^(yes|no|yeah|ok|okay|sure|please|thanks|and |also |but |what about|how about|same|only|just|that|those|them|it\b|the one|previous)/i;

function formatHistoryForPrompt(history, maxTurns = 12) {
  if (!history?.length) return '';
  return history
    .slice(-maxTurns)
    .map((m) => `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.content}`)
    .join('\n');
}

function isFollowUp(message) {
  const t = (message || '').trim();
  if (!t) return false;
  if (FOLLOW_UP_RE.test(t)) return true;
  if (t.length < 80 && /\b(active|inactive|that employee|same employee|those|earlier|before)\b/i.test(t)) {
    return true;
  }
  return false;
}

/**
 * Combine short follow-ups with prior turn so router/analyst understand context.
 */
function enrichMessageFromHistory(message, history) {
  const text = (message || '').trim();
  if (!history?.length || !isFollowUp(text)) return text;

  const recent = history.slice(-8);
  const lastUser = [...recent].reverse().find((m) => m.role === 'user');
  const lastAssistant = [...recent].reverse().find((m) => m.role === 'assistant');

  if (!lastUser && !lastAssistant) return text;

  const parts = [text];
  // Only prior user turn — assistant replies pollute routing (e.g. trigger leave/payroll APIs).
  if (lastUser?.content && lastUser.content.trim() !== text) {
    parts.push(`(Earlier you asked: "${lastUser.content.slice(0, 400)}")`);
  }
  return parts.join(' ');
}

function buildSessionSummary(history) {
  const h = history?.slice(-6) || [];
  if (!h.length) return null;
  const topics = [];
  for (const m of h) {
    if (m.role !== 'user') continue;
    const c = m.content.toLowerCase();
    if (c.includes('employee') && c.includes('active')) topics.push('active employee count');
    else if (c.includes('leave')) topics.push('leaves');
    else if (c.includes('application')) topics.push('employee applications');
    else if (c.includes('name')) topics.push('user identity');
    else if (/\b\d{2,6}\b/.test(c)) topics.push('specific employee lookup');
  }
  return [...new Set(topics)].slice(-4);
}

module.exports = {
  formatHistoryForPrompt,
  enrichMessageFromHistory,
  isFollowUp,
  buildSessionSummary,
};
