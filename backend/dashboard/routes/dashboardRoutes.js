const express = require('express');
const router = express.Router();
const { protect } = require('../../authentication/middleware/authMiddleware'); // Verify path!
const { getDashboardStats, getSuperAdminAnalytics } = require('../controllers/dashboardController');

/**
 * @swagger
 * /api/dashboard/stats:
 *   get:
 *     summary: Get overview statistics for the dashboard
 *     tags: [Dashboard]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Dashboard statistics retrieved
 */
router.get('/stats', protect, getDashboardStats);

/**
 * @swagger
 * /api/dashboard/analytics:
 *   get:
 *     summary: Get advanced analytics for Super Admins
 *     tags: [Dashboard]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Advanced analytics retrieved
 */
router.get('/analytics', protect, getSuperAdminAnalytics);

module.exports = router;
