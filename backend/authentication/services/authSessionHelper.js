const sessionService = require('./sessionService');
const tokenService = require('./tokenService');
const LoginAudit = require('../model/LoginAudit');

async function logLoginAttempt({
  identifier,
  userId = null,
  userType = null,
  success,
  reason = '',
  req,
}) {
  try {
    await LoginAudit.create({
      identifier: identifier || '',
      userId,
      userType,
      success,
      reason,
      ip: req.ip || req.headers['x-forwarded-for'] || '',
      userAgent: req.headers['user-agent'] || '',
      deviceId: req.body?.deviceId || req.headers['x-device-id'] || '',
    });
  } catch (err) {
    console.warn('[LoginAudit] Failed to write audit log:', err.message);
  }
}

async function issueAuthTokens(user, userType, req) {
  const userId = user._id.toString();
  const tokenVersion = user.tokenVersion || 0;
  const deviceId = req.body?.deviceId || req.headers['x-device-id'] || 'unknown';
  const deviceName = req.body?.deviceName || req.headers['user-agent'] || 'unknown';

  const { sessionId, refreshToken } = await sessionService.createSession({
    userId,
    tokenVersion,
    deviceId,
    deviceName,
    ip: req.ip || req.headers['x-forwarded-for'] || '',
    userAgent: req.headers['user-agent'] || '',
  });

  const accessToken = tokenService.generateAccessToken({
    userId,
    sessionId,
    tokenVersion,
  });

  return {
    token: accessToken,
    accessToken,
    refreshToken,
    expiresIn: tokenService.getAccessExpireSeconds(),
    sessionId,
  };
}

async function bumpTokenVersionAndDestroySession(user, userType) {
  user.tokenVersion = (user.tokenVersion || 0) + 1;
  await user.save();
  await sessionService.destroySession(user._id.toString());
  return user.tokenVersion;
}

module.exports = {
  issueAuthTokens,
  logLoginAttempt,
  bumpTokenVersionAndDestroySession,
};
