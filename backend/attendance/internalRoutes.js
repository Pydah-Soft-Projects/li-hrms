/**
 * Internal System Routes
 * These routes are for Microservice-to-Backend communication only.
 * They DO NOT require user authentication (JWT).
 * They should be protected by network level security (firewall/localhost restrictions) in production.
 */

const express = require('express');
const router = express.Router();
const realtimeLogController = require('./controllers/realtimeLogController');

// POST /api/attendance/internal/sync
router.post('/sync', realtimeLogController.receiveRealTimeLogs);

module.exports = router;
