const express = require('express');
const rateLimit = require('express-rate-limit');
const { protect } = require('../../authentication/middleware/authMiddleware');
const {
  getStatus,
  chat,
  chatStream,
} = require('../controllers/assistantController');

const router = express.Router();

const assistantLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: Number(process.env.ASSISTANT_RATE_LIMIT_PER_MIN) || 20,
  message: { success: false, message: 'Too many assistant requests. Please wait a moment.' },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => String(req.user?._id || req.user?.id || 'anonymous'),
});

router.get('/status', protect, getStatus);
router.post('/chat', protect, assistantLimiter, chat);
router.post('/chat/stream', protect, assistantLimiter, chatStream);

module.exports = router;
