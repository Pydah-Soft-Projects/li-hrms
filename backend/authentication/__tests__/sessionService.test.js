/**
 * Session service unit tests (Mongo fallback path; Redis mocked as unavailable).
 */
const crypto = require('crypto');
const mongoose = require('mongoose');
require('dotenv').config();

jest.mock('../../config/redis', () => ({
  redisConnection: { status: 'end' },
}));

const AuthSession = require('../model/Session');
const sessionService = require('../services/sessionService');
const tokenService = require('../services/tokenService');

describe('sessionService', () => {
  const userId = '507f1f77bcf86cd799439011';

  beforeAll(async () => {
    if (!process.env.MONGODB_URI) {
      throw new Error('MONGODB_URI required for sessionService tests');
    }
    await mongoose.connect(process.env.MONGODB_URI);
  });

  afterAll(async () => {
    await AuthSession.deleteMany({});
    if (mongoose.connection.readyState === 1) {
      await mongoose.disconnect();
    }
  });

  beforeEach(async () => {
    await AuthSession.deleteMany({});
  });

  test('createSession replaces previous session for single device', async () => {
    const first = await sessionService.createSession({
      userId,
      tokenVersion: 0,
      deviceId: 'device-a',
    });
    const second = await sessionService.createSession({
      userId,
      tokenVersion: 0,
      deviceId: 'device-b',
    });

    expect(first.sessionId).not.toBe(second.sessionId);

    const checkFirst = await sessionService.validateSession(userId, first.sessionId, 0);
    expect(checkFirst.ok).toBe(false);
    expect(checkFirst.code).toBe('SESSION_REPLACED');

    const checkSecond = await sessionService.validateSession(userId, second.sessionId, 0);
    expect(checkSecond.ok).toBe(true);
  });

  test('refreshSession rotates refresh token', async () => {
    const created = await sessionService.createSession({ userId, tokenVersion: 1 });
    const refreshed = await sessionService.refreshSession(userId, created.refreshToken);

    expect(refreshed.ok).toBe(true);
    expect(refreshed.newRefreshToken).toBeTruthy();
    expect(refreshed.newRefreshToken).not.toBe(created.refreshToken);

    const oldRefresh = await sessionService.refreshSession(userId, created.refreshToken);
    expect(oldRefresh.ok).toBe(false);
  });

  test('tokenVersion mismatch is rejected', async () => {
    const created = await sessionService.createSession({ userId, tokenVersion: 2 });
    const check = await sessionService.validateSession(userId, created.sessionId, 1);
    expect(check.ok).toBe(false);
    expect(check.code).toBe('TOKEN_VERSION_MISMATCH');
  });

  test('access token pairs with session validation', async () => {
    const created = await sessionService.createSession({ userId, tokenVersion: 0 });
    const accessToken = tokenService.generateAccessToken({
      userId,
      sessionId: created.sessionId,
      tokenVersion: 0,
    });

    const jwt = require('jsonwebtoken');
    process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret';
    const decoded = jwt.verify(accessToken, process.env.JWT_SECRET);
    const valid = await sessionService.validateSession(decoded.userId, decoded.sessionId, decoded.tokenVersion);
    expect(valid.ok).toBe(true);
  });

  test('destroySession removes active session', async () => {
    const created = await sessionService.createSession({ userId, tokenVersion: 0 });
    await sessionService.destroySession(userId);
    const check = await sessionService.validateSession(userId, created.sessionId, 0);
    expect(check.ok).toBe(false);
  });

  test('parseRefreshToken extracts user and session ids', () => {
    const sessionId = crypto.randomUUID();
    const token = `rt:${userId}:${sessionId}:abc123`;
    const parsed = sessionService.parseRefreshToken(token);
    expect(parsed).toEqual({ userId, sessionId });
  });
});
