const MAX_SESSIONS_PER_USER = 20;
const MAX_MESSAGES = 40;
const SESSION_TTL_MS = 24 * 60 * 60 * 1000;

/** @type {Map<string, { messages: Array<{role:string,content:string}>, updatedAt: number }>} */
const sessions = new Map();

function sessionKey(userId, sessionId) {
  return `${userId}:${sessionId}`;
}

function pruneUserSessions(userId) {
  const prefix = `${userId}:`;
  const userSessions = [...sessions.entries()]
    .filter(([k]) => k.startsWith(prefix))
    .sort((a, b) => b[1].updatedAt - a[1].updatedAt);

  if (userSessions.length <= MAX_SESSIONS_PER_USER) return;

  for (const [key] of userSessions.slice(MAX_SESSIONS_PER_USER)) {
    sessions.delete(key);
  }
}

function getHistory(userId, sessionId) {
  const key = sessionKey(userId, sessionId);
  const session = sessions.get(key);
  if (!session) return [];
  if (Date.now() - session.updatedAt > SESSION_TTL_MS) {
    sessions.delete(key);
    return [];
  }
  return session.messages;
}

function appendMessages(userId, sessionId, newMessages) {
  const key = sessionKey(userId, sessionId);
  const existing = sessions.get(key) || { messages: [], updatedAt: Date.now() };
  existing.messages = [...existing.messages, ...newMessages].slice(-MAX_MESSAGES);
  existing.updatedAt = Date.now();
  sessions.set(key, existing);
  pruneUserSessions(userId);
}

function clearExpired() {
  const now = Date.now();
  for (const [key, session] of sessions.entries()) {
    if (now - session.updatedAt > SESSION_TTL_MS) {
      sessions.delete(key);
    }
  }
}

setInterval(clearExpired, 60 * 60 * 1000).unref?.();

module.exports = {
  getHistory,
  appendMessages,
};
