const express = require('express');
const router = express.Router();
const authController = require('./controllers/authController');
const { protect } = require('./middleware/authMiddleware');
const { loginRateLimit } = require('./middleware/loginRateLimit');

// Public routes
router.post('/login', loginRateLimit, authController.login);
router.post('/sso-login', loginRateLimit, authController.ssoLogin);
router.post('/refresh', authController.refresh);
router.post('/forgot-password', authController.forgotPassword);
router.post('/verify-identifier', authController.verifyIdentifier);

// Protected routes
router.get('/me', protect, authController.getMe);
router.get('/ticket-sso-url', protect, authController.getTicketSsoUrl);
router.get('/session', protect, authController.getSession);
router.put('/change-password', protect, authController.changePassword);
router.post('/logout', protect, authController.logout);

module.exports = router;
