const express = require('express');
const router = express.Router();
const transportController = require('../controllers/transportController');
const { protect } = require('../../authentication/middleware/authMiddleware');

// Protect all transport routes with HRMS authentication
router.use(protect);

// Transport reports endpoints
router.get('/reports', transportController.getReports);
router.get('/reports/export', transportController.exportReports);
router.get('/bus-reports', transportController.getBusWiseReports);

module.exports = router;
