/**
 * End-to-end auth session tests (login, refresh, logout, single-device, password invalidation).
 * Requires: MONGODB_URI, JWT_SECRET in backend/.env
 */
const request = require('supertest');
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
require('dotenv').config();

const app = require('./testAuthApp');
const User = require('../../users/model/User');
const AuthSession = require('../model/Session');
const LoginAudit = require('../model/LoginAudit');
const sessionService = require('../services/sessionService');
const tokenService = require('../services/tokenService');

const TEST_EMAIL = `auth_session_robust_${Date.now()}@hrms-test.local`;
const TEST_PASSWORD = 'RobustTest@456';
const WRONG_PASSWORD = 'WrongPass@999';

describe('Auth session integration (HTTP)', () => {
  let testUser;
  let userId;

  beforeAll(async () => {
    if (!process.env.MONGODB_URI) {
      throw new Error('MONGODB_URI is required for auth session integration tests');
    }
    if (!process.env.JWT_SECRET) {
      throw new Error('JWT_SECRET is required for auth session integration tests');
    }

    if (mongoose.connection.readyState === 0) {
      await mongoose.connect(process.env.MONGODB_URI);
    }

    testUser = await User.create({
      email: TEST_EMAIL,
      password: TEST_PASSWORD,
      name: 'Auth Session Robust Test',
      role: 'employee',
      isActive: true,
      tokenVersion: 0,
    });
    userId = testUser._id.toString();
  });

  afterAll(async () => {
    if (testUser?._id) {
      await AuthSession.deleteMany({ userId: testUser._id });
      await LoginAudit.deleteMany({ userId: testUser._id });
      await sessionService.destroySession(userId);
      await User.deleteOne({ _id: testUser._id });
    }
    if (mongoose.connection.readyState === 1) {
      await mongoose.disconnect();
    }
  });

  afterEach(async () => {
    // Reset password if a test changed it
    const current = await User.findById(testUser._id).select('+password');
    if (current) {
      const valid = await current.comparePassword(TEST_PASSWORD);
      if (!valid) {
        current.password = TEST_PASSWORD;
        current.tokenVersion = 0;
        await current.save();
      }
    }
    await AuthSession.deleteMany({ userId: testUser._id });
    await sessionService.destroySession(userId);
  });

  async function loginAs(deviceId = 'test-device-a') {
    const res = await request(app)
      .post('/api/auth/login')
      .set('X-Device-Id', deviceId)
      .send({
        identifier: TEST_EMAIL,
        password: TEST_PASSWORD,
        deviceId,
        deviceName: `Jest-${deviceId}`,
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.accessToken).toBeTruthy();
    expect(res.body.data.refreshToken).toBeTruthy();
    expect(res.body.data.token).toBe(res.body.data.accessToken);
    expect(res.body.data.expiresIn).toBeGreaterThan(0);

    return res.body.data;
  }

  test('login issues session-backed tokens and /me succeeds', async () => {
    const tokens = await loginAs('device-login-me');

    const me = await request(app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${tokens.accessToken}`);

    expect(me.status).toBe(200);
    expect(me.body.success).toBe(true);
    expect(me.body.data.user.email).toBe(TEST_EMAIL);
  });

  test('refresh rotates refresh token and returns new access token', async () => {
    const first = await loginAs('device-refresh');

    const refreshRes = await request(app)
      .post('/api/auth/refresh')
      .send({ refreshToken: first.refreshToken });

    expect(refreshRes.status).toBe(200);
    expect(refreshRes.body.success).toBe(true);
    expect(refreshRes.body.data.accessToken).toBeTruthy();
    expect(refreshRes.body.data.refreshToken).toBeTruthy();
    expect(refreshRes.body.data.refreshToken).not.toBe(first.refreshToken);

    const me = await request(app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${refreshRes.body.data.accessToken}`);
    expect(me.status).toBe(200);

    const oldRefresh = await request(app)
      .post('/api/auth/refresh')
      .send({ refreshToken: first.refreshToken });
    expect(oldRefresh.status).toBe(401);
    expect(oldRefresh.body.code).toBe('INVALID_REFRESH_TOKEN');
  });

  test('single-device login kicks previous session (SESSION_REPLACED)', async () => {
    const deviceA = await loginAs('device-a-single');

    const deviceB = await loginAs('device-b-single');

    const kicked = await request(app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${deviceA.accessToken}`);

    expect(kicked.status).toBe(401);
    expect(kicked.body.code).toBe('SESSION_REPLACED');

    const stillValid = await request(app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${deviceB.accessToken}`);
    expect(stillValid.status).toBe(200);
  });

  test('logout destroys session server-side', async () => {
    const tokens = await loginAs('device-logout');

    const logoutRes = await request(app)
      .post('/api/auth/logout')
      .set('Authorization', `Bearer ${tokens.accessToken}`);
    expect(logoutRes.status).toBe(200);
    expect(logoutRes.body.success).toBe(true);

    const me = await request(app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${tokens.accessToken}`);
    expect(me.status).toBe(401);
    expect(['SESSION_REPLACED', 'SESSION_EXPIRED']).toContain(me.body.code);
  });

  test('legacy JWT without sessionId is rejected', async () => {
    const legacy = jwt.sign({ userId }, process.env.JWT_SECRET, { expiresIn: '1h' });

    const me = await request(app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${legacy}`);

    expect(me.status).toBe(401);
    expect(me.body.code).toBe('SESSION_EXPIRED');
  });

  test('expired access token returns TOKEN_EXPIRED', async () => {
    const created = await sessionService.createSession({ userId, tokenVersion: 0 });
    const expired = jwt.sign(
      {
        userId,
        sessionId: created.sessionId,
        tokenVersion: 0,
        type: 'access',
      },
      process.env.JWT_SECRET,
      { expiresIn: '-1s' }
    );

    const me = await request(app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${expired}`);

    expect(me.status).toBe(401);
    expect(me.body.code).toBe('TOKEN_EXPIRED');
  });

  test('wrong password fails and writes login audit', async () => {
    const beforeCount = await LoginAudit.countDocuments({
      identifier: TEST_EMAIL,
      success: false,
    });

    const res = await request(app)
      .post('/api/auth/login')
      .send({ identifier: TEST_EMAIL, password: WRONG_PASSWORD });

    expect(res.status).toBe(401);

    const afterCount = await LoginAudit.countDocuments({
      identifier: TEST_EMAIL,
      success: false,
    });
    expect(afterCount).toBeGreaterThan(beforeCount);
  });

  test('change password invalidates active session (TOKEN_VERSION_MISMATCH)', async () => {
    const tokens = await loginAs('device-pwd-change');

    const changeRes = await request(app)
      .put('/api/auth/change-password')
      .set('Authorization', `Bearer ${tokens.accessToken}`)
      .send({
        currentPassword: TEST_PASSWORD,
        newPassword: 'NewRobust@789',
      });
    expect(changeRes.status).toBe(200);

    const me = await request(app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${tokens.accessToken}`);
    expect(me.status).toBe(401);
    expect(['SESSION_REPLACED', 'TOKEN_VERSION_MISMATCH']).toContain(me.body.code);

    // Restore password via direct DB update (avoid depending on stale tokens)
    const userDoc = await User.findById(testUser._id).select('+password');
    userDoc.password = TEST_PASSWORD;
    userDoc.tokenVersion = 0;
    await userDoc.save();
    await sessionService.destroySession(userId);
  });

  test('GET /auth/session returns device metadata', async () => {
    const tokens = await loginAs('device-session-info');

    const sessionRes = await request(app)
      .get('/api/auth/session')
      .set('Authorization', `Bearer ${tokens.accessToken}`);

    expect(sessionRes.status).toBe(200);
    expect(sessionRes.body.success).toBe(true);
    expect(sessionRes.body.data.deviceId).toBe('device-session-info');
  });

  test('refresh with invalid token is rejected', async () => {
    const res = await request(app)
      .post('/api/auth/refresh')
      .send({ refreshToken: 'not-a-valid-refresh-token' });

    expect(res.status).toBe(401);
    expect(res.body.code).toBe('INVALID_REFRESH_TOKEN');
  });

  test('access token with tampered sessionId is rejected', async () => {
    const tokens = await loginAs('device-tamper');
    const decoded = jwt.verify(tokens.accessToken, process.env.JWT_SECRET);
    const tampered = tokenService.generateAccessToken({
      userId: decoded.userId,
      sessionId: '00000000-0000-0000-0000-000000000000',
      tokenVersion: decoded.tokenVersion,
    });

    const me = await request(app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${tampered}`);

    expect(me.status).toBe(401);
    expect(me.body.code).toBe('SESSION_REPLACED');
  });
});
