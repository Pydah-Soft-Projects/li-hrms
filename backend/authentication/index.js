const express = require('express');
const router = express.Router();
const authController = require('./controllers/authController');
const { protect } = require('./middleware/authMiddleware');

// Public routes
router.post('/login', authController.login);
router.post('/sso-login', authController.ssoLogin);

// Protected routes
router.get('/me', protect, authController.getMe);
router.put('/change-password', protect, authController.changePassword);

module.exports = router;
