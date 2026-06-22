const express = require('express');
const router = express.Router();
const sessionController = require('./controllers/mobileAnalyticsController');
const reportController = require('./controllers/mobileAnalyticsReportController');
const { protect, authorize } = require('../authentication/middleware/authMiddleware');

// All session endpoints require authentication
router.post('/session/start', protect, sessionController.startSession);
router.post('/session/end', protect, sessionController.endSession);

// Admin-only report endpoints
const adminRoles = ['super_admin', 'sub_admin', 'hr'];
router.get('/report/daily', protect, authorize(...adminRoles), reportController.getDailyReport);
router.get('/report/summary', protect, authorize(...adminRoles), reportController.getSummaryReport);
router.get('/report/user-detail', protect, authorize(...adminRoles), reportController.getUserDetailReport);

module.exports = router;
