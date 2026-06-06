const jwt = require('jsonwebtoken');

const ACCESS_EXPIRE = process.env.JWT_ACCESS_EXPIRE || '15m';
const REFRESH_EXPIRE = process.env.JWT_REFRESH_EXPIRE || '7d';

function getAccessExpireSeconds() {
  const raw = ACCESS_EXPIRE;
  if (raw.endsWith('m')) return parseInt(raw, 10) * 60;
  if (raw.endsWith('h')) return parseInt(raw, 10) * 3600;
  if (raw.endsWith('d')) return parseInt(raw, 10) * 86400;
  return 900;
}

function generateAccessToken({ userId, sessionId, tokenVersion = 0 }) {
  return jwt.sign(
    {
      userId,
      sessionId,
      tokenVersion,
      type: 'access',
    },
    process.env.JWT_SECRET,
    { expiresIn: ACCESS_EXPIRE }
  );
}

/** @deprecated Use session-based access tokens from auth login instead. */
function generateLegacyToken(userId) {
  return jwt.sign({ userId }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRE || '7d',
  });
}

module.exports = {
  generateAccessToken,
  generateLegacyToken,
  getAccessExpireSeconds,
  ACCESS_EXPIRE,
  REFRESH_EXPIRE,
};
