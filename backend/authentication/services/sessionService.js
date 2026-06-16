const crypto = require('crypto');
const { redisConnection } = require('../../config/redis');
const AuthSession = require('../model/Session');

const SESSION_TTL_SECONDS = parseInt(process.env.SESSION_TTL_SECONDS || String(7 * 24 * 3600), 10);
const SINGLE_DEVICE = process.env.SESSION_SINGLE_DEVICE !== 'false';

function hashToken(token) {
  return crypto.createHash('sha256').update(String(token)).digest('hex');
}

function isRedisReady() {
  return redisConnection && redisConnection.status === 'ready';
}

function redisKey(userId) {
  return `session:${userId}`;
}

function buildRefreshToken(userId, sessionId) {
  return `rt:${userId}:${sessionId}:${crypto.randomBytes(32).toString('hex')}`;
}

function parseRefreshToken(refreshToken) {
  if (!refreshToken || typeof refreshToken !== 'string') return null;
  const parts = refreshToken.split(':');
  if (parts.length !== 4 || parts[0] !== 'rt') return null;
  const [, userId, sessionId] = parts;
  if (!userId || !sessionId) return null;
  return { userId, sessionId };
}

async function saveSessionToRedis(userId, sessionData) {
  await redisConnection.set(redisKey(userId), JSON.stringify(sessionData), 'EX', SESSION_TTL_SECONDS);
}

async function getSessionFromRedis(userId) {
  const raw = await redisConnection.get(redisKey(userId));
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

async function deleteSessionFromRedis(userId) {
  await redisConnection.del(redisKey(userId));
}

async function saveSessionToMongo(userId, sessionData) {
  const expiresAt = new Date(Date.now() + SESSION_TTL_SECONDS * 1000);
  await AuthSession.findOneAndUpdate(
    { userId },
    {
      userId,
      sessionId: sessionData.sessionId,
      refreshTokenHash: sessionData.refreshTokenHash,
      tokenVersion: sessionData.tokenVersion,
      deviceId: sessionData.deviceId,
      deviceName: sessionData.deviceName,
      ip: sessionData.ip,
      userAgent: sessionData.userAgent,
      lastActivityAt: sessionData.lastActivityAt,
      expiresAt,
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );
}

async function getSessionFromMongo(userId) {
  const doc = await AuthSession.findOne({ userId, expiresAt: { $gt: new Date() } }).lean();
  if (!doc) return null;
  return {
    sessionId: doc.sessionId,
    refreshTokenHash: doc.refreshTokenHash,
    tokenVersion: doc.tokenVersion,
    deviceId: doc.deviceId,
    deviceName: doc.deviceName,
    ip: doc.ip,
    userAgent: doc.userAgent,
    lastActivityAt: doc.lastActivityAt,
  };
}

async function deleteSessionFromMongo(userId) {
  await AuthSession.deleteOne({ userId });
}

async function getSession(userId) {
  const id = String(userId);
  if (isRedisReady()) {
    const session = await getSessionFromRedis(id);
    if (session) return session;
  }
  return getSessionFromMongo(id);
}

async function destroySession(userId) {
  const id = String(userId);
  if (isRedisReady()) {
    await deleteSessionFromRedis(id);
  }
  await deleteSessionFromMongo(id);
}

/**
 * Create a new session. Replaces any existing session when single-device mode is on.
 */
async function createSession({
  userId,
  tokenVersion = 0,
  deviceId = 'unknown',
  deviceName = 'unknown',
  ip = '',
  userAgent = '',
}) {
  const id = String(userId);
  const sessionId = crypto.randomUUID();
  const refreshToken = buildRefreshToken(id, sessionId);
  const refreshTokenHash = hashToken(refreshToken);
  const now = new Date().toISOString();

  const sessionData = {
    sessionId,
    refreshTokenHash,
    tokenVersion,
    deviceId,
    deviceName,
    ip,
    userAgent,
    lastActivityAt: now,
  };

  if (SINGLE_DEVICE) {
    await destroySession(id);
  }

  if (isRedisReady()) {
    await saveSessionToRedis(id, sessionData);
  }
  await saveSessionToMongo(id, sessionData);

  return { sessionId, refreshToken };
}

async function touchSession(userId, expectedSessionId) {
  const id = String(userId);
  const session = await getSession(id);
  if (!session || (expectedSessionId && session.sessionId !== expectedSessionId)) {
    return;
  }

  session.lastActivityAt = new Date().toISOString();

  if (isRedisReady()) {
    const current = await getSessionFromRedis(id);
    if (!current || current.sessionId !== session.sessionId) return;
    await saveSessionToRedis(id, session);
  }

  const mongoUpdated = await AuthSession.updateOne(
    { userId: id, sessionId: session.sessionId },
    { lastActivityAt: new Date(), expiresAt: new Date(Date.now() + SESSION_TTL_SECONDS * 1000) }
  ).catch(() => null);

  if (!mongoUpdated || mongoUpdated.matchedCount === 0) {
    return;
  }
}

async function validateSession(userId, sessionId, tokenVersion = 0) {
  const id = String(userId);
  const session = await getSession(id);

  if (!session) {
    return {
      ok: false,
      code: 'SESSION_REPLACED',
      message: 'Your session ended because you logged in on another device.',
    };
  }

  if (session.sessionId !== sessionId) {
    return {
      ok: false,
      code: 'SESSION_REPLACED',
      message: 'Your session is no longer valid. Please login again.',
    };
  }

  if (Number(session.tokenVersion) !== Number(tokenVersion)) {
    return {
      ok: false,
      code: 'TOKEN_VERSION_MISMATCH',
      message: 'Your credentials were changed. Please login again.',
    };
  }

  return { ok: true };
}

async function refreshSession(userId, refreshToken) {
  const id = String(userId);
  const parsed = parseRefreshToken(refreshToken);
  if (!parsed || parsed.userId !== id) {
    return { ok: false, code: 'INVALID_REFRESH_TOKEN', message: 'Invalid refresh token' };
  }

  const session = await getSession(id);
  if (!session) {
    return {
      ok: false,
      code: 'SESSION_REPLACED',
      message: 'Your session ended because you logged in on another device.',
    };
  }

  if (session.sessionId !== parsed.sessionId) {
    return { ok: false, code: 'SESSION_REPLACED', message: 'Session no longer valid' };
  }

  const incomingHash = hashToken(refreshToken);
  if (session.refreshTokenHash !== incomingHash) {
    return { ok: false, code: 'INVALID_REFRESH_TOKEN', message: 'Invalid refresh token' };
  }

  const newRefreshToken = buildRefreshToken(id, session.sessionId);
  session.refreshTokenHash = hashToken(newRefreshToken);
  session.lastActivityAt = new Date().toISOString();

  if (isRedisReady()) {
    await saveSessionToRedis(id, session);
  }
  await saveSessionToMongo(id, session);

  return { ok: true, sessionId: session.sessionId, tokenVersion: session.tokenVersion, newRefreshToken };
}

async function getSessionInfo(userId) {
  const session = await getSession(String(userId));
  if (!session) return null;
  return {
    deviceId: session.deviceId,
    deviceName: session.deviceName,
    ip: session.ip,
    lastActivityAt: session.lastActivityAt,
  };
}

module.exports = {
  createSession,
  destroySession,
  validateSession,
  refreshSession,
  touchSession,
  getSessionInfo,
  parseRefreshToken,
  hashToken,
  SESSION_TTL_SECONDS,
  buildRefreshToken,
};
