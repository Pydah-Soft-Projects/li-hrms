const express = require('express');
const router = express.Router();
const { protect } = require('../../authentication/middleware/authMiddleware'); // Verify path!
const { getDashboardStats, getSuperAdminAnalytics } = require('../controllers/dashboardController');

router.get('/stats', protect, getDashboardStats);
router.get('/analytics', protect, getSuperAdminAnalytics);

module.exports = router;
