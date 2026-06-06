/**
 * Extended sessionService edge-case tests.
 */
const crypto = require('crypto');
const mongoose = require('mongoose');
require('dotenv').config();

jest.mock('../../config/redis', () => ({
  redisConnection: { status: 'end' },
}));

const AuthSession = require('../model/Session');
const sessionService = require('../services/sessionService');

describe('sessionService extended', () => {
  const userId = '507f1f77bcf86cd799439012';

  beforeAll(async () => {
    if (!process.env.MONGODB_URI) {
      throw new Error('MONGODB_URI required');
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

  test('parseRefreshToken rejects malformed tokens', () => {
    expect(sessionService.parseRefreshToken(null)).toBeNull();
    expect(sessionService.parseRefreshToken('')).toBeNull();
    expect(sessionService.parseRefreshToken('bad-token')).toBeNull();
    expect(sessionService.parseRefreshToken('rt:only:two')).toBeNull();
  });

  test('refreshSession rejects token for wrong user id segment', async () => {
    const created = await sessionService.createSession({ userId, tokenVersion: 0 });
    const wrongUserToken = created.refreshToken.replace(userId, '507f1f77bcf86cd799439099');

    const result = await sessionService.refreshSession(userId, wrongUserToken);
    expect(result.ok).toBe(false);
    expect(result.code).toBe('INVALID_REFRESH_TOKEN');
  });

  test('getSessionInfo returns stored device metadata', async () => {
    await sessionService.createSession({
      userId,
      tokenVersion: 0,
      deviceId: 'pixel-8',
      deviceName: 'Chrome/Android',
      ip: '10.0.0.5',
      userAgent: 'jest-agent',
    });

    const info = await sessionService.getSessionInfo(userId);
    expect(info).toMatchObject({
      deviceId: 'pixel-8',
      deviceName: 'Chrome/Android',
      ip: '10.0.0.5',
    });
    expect(info.lastActivityAt).toBeTruthy();
  });

  test('destroySession is idempotent', async () => {
    await sessionService.createSession({ userId, tokenVersion: 0 });
    await sessionService.destroySession(userId);
    await sessionService.destroySession(userId);

    const info = await sessionService.getSessionInfo(userId);
    expect(info).toBeNull();
  });

  test('hashToken is deterministic', () => {
    const a = sessionService.hashToken('same-value');
    const b = sessionService.hashToken('same-value');
    const c = sessionService.hashToken('other-value');
    expect(a).toBe(b);
    expect(a).not.toBe(c);
    expect(a).toHaveLength(64);
  });

  test('concurrent createSession ends with one active session (single device)', async () => {
    const results = await Promise.all([
      sessionService.createSession({ userId, tokenVersion: 0, deviceId: 'c1' }),
      sessionService.createSession({ userId, tokenVersion: 0, deviceId: 'c2' }),
      sessionService.createSession({ userId, tokenVersion: 0, deviceId: 'c3' }),
    ]);

    const uniqueSessionIds = new Set(results.map((r) => r.sessionId));
    expect(uniqueSessionIds.size).toBe(3);

    let validCount = 0;
    for (const r of results) {
      const check = await sessionService.validateSession(userId, r.sessionId, 0);
      if (check.ok) validCount += 1;
    }
    expect(validCount).toBe(1);
  });
});
