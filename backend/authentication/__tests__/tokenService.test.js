const jwt = require('jsonwebtoken');
require('dotenv').config();

const tokenService = require('../services/tokenService');

describe('tokenService', () => {
  beforeAll(() => {
    process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-jwt-secret';
  });

  test('generateAccessToken embeds session fields', () => {
    const token = tokenService.generateAccessToken({
      userId: '507f1f77bcf86cd799439011',
      sessionId: 'sess-123',
      tokenVersion: 2,
    });

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    expect(decoded.userId).toBe('507f1f77bcf86cd799439011');
    expect(decoded.sessionId).toBe('sess-123');
    expect(decoded.tokenVersion).toBe(2);
    expect(decoded.type).toBe('access');
  });

  test('getAccessExpireSeconds returns positive seconds', () => {
    expect(tokenService.getAccessExpireSeconds()).toBeGreaterThan(60);
  });

  test('legacy token has no sessionId', () => {
    const token = tokenService.generateLegacyToken('507f1f77bcf86cd799439011');
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    expect(decoded.userId).toBe('507f1f77bcf86cd799439011');
    expect(decoded.sessionId).toBeUndefined();
  });
});
