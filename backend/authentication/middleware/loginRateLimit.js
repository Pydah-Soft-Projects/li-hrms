const rateLimit = require('express-rate-limit');

const loginRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: parseInt(process.env.LOGIN_RATE_LIMIT_MAX || '20', 10),
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: 'Too many login attempts. Please try again after 15 minutes.',
  },
  keyGenerator: (req) => {
    const identifier = req.body?.identifier || req.body?.email || '';
    return `${String(identifier).toLowerCase()}`;
  },
});

module.exports = { loginRateLimit };
