/**
 * Integration tests for mobile app usage analytics routes.
 */
const request = require('supertest');
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
require('dotenv').config();

const express = require('express');
const app = express();
app.use(express.json());

// Set up routes on the test app
app.use('/api/auth', require('../../authentication/index'));
app.use('/api/mobile-analytics', require('../index'));

const User = require('../../users/model/User');
const MobileSession = require('../model/MobileSession');
const LoginAudit = require('../../authentication/model/LoginAudit');
const sessionService = require('../../authentication/services/sessionService');
const tokenService = require('../../authentication/services/tokenService');

const TEST_EMAIL = `analytics_test_${Date.now()}@hrms-test.local`;
const TEST_PASSWORD = 'RobustTest@456';
const ADMIN_EMAIL = `analytics_admin_${Date.now()}@hrms-test.local`;

describe('Mobile app usage analytics integration', () => {
  let user;
  let admin;
  let userTokens;
  let adminTokens;

  beforeAll(async () => {
    if (!process.env.MONGODB_URI) {
      throw new Error('MONGODB_URI is required for analytics integration tests');
    }
    if (mongoose.connection.readyState === 0) {
      await mongoose.connect(process.env.MONGODB_URI);
    }

    // Create a regular user
    user = await User.create({
      email: TEST_EMAIL,
      password: TEST_PASSWORD,
      name: 'Regular Mobile User',
      role: 'employee',
      isActive: true,
      tokenVersion: 0,
    });

    // Create an admin user
    admin = await User.create({
      email: ADMIN_EMAIL,
      password: TEST_PASSWORD,
      name: 'Admin User',
      role: 'super_admin',
      isActive: true,
      tokenVersion: 0,
    });

    // Login and get tokens for user
    const userSession = await sessionService.createSession({
      userId: user._id.toString(),
      tokenVersion: 0,
      deviceId: 'test-device-id',
      deviceName: 'Jest-Device',
    });
    userTokens = {
      accessToken: tokenService.generateAccessToken({
        userId: user._id.toString(),
        sessionId: userSession.sessionId,
        tokenVersion: 0,
      }),
    };

    // Login and get tokens for admin
    const adminSession = await sessionService.createSession({
      userId: admin._id.toString(),
      tokenVersion: 0,
      deviceId: 'admin-device-id',
      deviceName: 'Jest-Admin',
    });
    adminTokens = {
      accessToken: tokenService.generateAccessToken({
        userId: admin._id.toString(),
        sessionId: adminSession.sessionId,
        tokenVersion: 0,
      }),
    };
  });

  afterAll(async () => {
    if (user) {
      await User.deleteOne({ _id: user._id });
      await MobileSession.deleteMany({ userId: user._id });
      await LoginAudit.deleteMany({ userId: user._id });
      await sessionService.destroySession(user._id.toString());
    }
    if (admin) {
      await User.deleteOne({ _id: admin._id });
      await MobileSession.deleteMany({ userId: admin._id });
      await LoginAudit.deleteMany({ userId: admin._id });
      await sessionService.destroySession(admin._id.toString());
    }
    if (mongoose.connection.readyState === 1) {
      await mongoose.disconnect();
    }
  });

  let createdSessionId;

  test('POST /session/start fails without authentication', async () => {
    const res = await request(app)
      .post('/api/mobile-analytics/session/start')
      .send({ deviceId: 'test-device' });
    expect(res.status).toBe(401);
  });

  test('POST /session/start succeeds with auth and creates session', async () => {
    const res = await request(app)
      .post('/api/mobile-analytics/session/start')
      .set('Authorization', `Bearer ${userTokens.accessToken}`)
      .send({ deviceId: 'test-device', appVersion: '1.0.0' });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.sessionId).toBeDefined();

    createdSessionId = res.body.data.sessionId;

    // Verify session was written to DB
    const session = await MobileSession.findById(createdSessionId);
    expect(session).toBeTruthy();
    expect(session.userId.toString()).toBe(user._id.toString());
    expect(session.deviceId).toBe('test-device');
    expect(session.appVersion).toBe('1.0.0');
    expect(session.sessionEnd).toBeNull();
  });

  test('POST /session/end updates session with duration', async () => {
    expect(createdSessionId).toBeDefined();

    const res = await request(app)
      .post('/api/mobile-analytics/session/end')
      .set('Authorization', `Bearer ${userTokens.accessToken}`)
      .send({ sessionId: createdSessionId });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.durationSeconds).toBeDefined();

    const session = await MobileSession.findById(createdSessionId);
    expect(session.sessionEnd).toBeTruthy();
    expect(session.durationSeconds).toBeGreaterThanOrEqual(0);
  });

  test('GET /report/daily is blocked for non-admin users', async () => {
    const res = await request(app)
      .get('/api/mobile-analytics/report/daily')
      .set('Authorization', `Bearer ${userTokens.accessToken}`);
    expect(res.status).toBe(403);
  });

  test('GET /report/daily returns summary for admin users', async () => {
    const today = new Date().toISOString().slice(0, 10);
    const res = await request(app)
      .get(`/api/mobile-analytics/report/daily?date=${today}`)
      .set('Authorization', `Bearer ${adminTokens.accessToken}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.date).toBe(today);
    expect(res.body.data.totalActiveUsers).toBeGreaterThanOrEqual(1);

    const userEntry = res.body.data.users.find(u => u.userId.toString() === user._id.toString());
    expect(userEntry).toBeDefined();
    expect(userEntry.userName).toBe(user.name);
  });

  test('GET /report/summary returns summary rows for a date range', async () => {
    const today = new Date().toISOString().slice(0, 10);
    const res = await request(app)
      .get(`/api/mobile-analytics/report/summary?fromDate=${today}&toDate=${today}`)
      .set('Authorization', `Bearer ${adminTokens.accessToken}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.rows).toBeDefined();
    expect(res.body.data.rows.length).toBeGreaterThanOrEqual(1);
  });

  test('GET /report/user-detail returns daily breakdown for a user', async () => {
    const today = new Date().toISOString().slice(0, 10);
    const res = await request(app)
      .get(`/api/mobile-analytics/report/user-detail?userId=${user._id.toString()}&fromDate=${today}&toDate=${today}`)
      .set('Authorization', `Bearer ${adminTokens.accessToken}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.rows).toBeDefined();
    expect(res.body.data.rows.length).toBeGreaterThanOrEqual(1);
    expect(res.body.data.rows[0].totalSessions).toBe(1);
  });
});
