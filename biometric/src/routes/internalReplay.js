const express = require('express');
const router = express.Router();
const logger = require('../utils/logger');
const { runMongoWindowReplayToHrms } = require('../services/mongoReplayToHrmsService');

/**
 * POST /api/internal/replay-window-to-hrms
 * Body: { empNo, doj, verifiedAt, employeeName? }
 * Reads AttendanceLog from this service's MongoDB only (no device). Pushes to HRMS internal sync.
 */
router.post('/replay-window-to-hrms', async (req, res) => {
  const expected = process.env.HRMS_MICROSERVICE_SECRET_KEY;
  if (!expected) {
    logger.error('[internalReplay] HRMS_MICROSERVICE_SECRET_KEY is not configured');
    return res.status(500).json({ success: false, message: 'Server configuration error' });
  }
  if (req.headers['x-system-key'] !== expected) {
    return res.status(401).json({ success: false, message: 'Unauthorized' });
  }

  const { empNo, doj, verifiedAt, employeeName } = req.body || {};
  if (!empNo || doj == null || verifiedAt == null) {
    return res.status(400).json({
      success: false,
      message: 'Required JSON body fields: empNo, doj, verifiedAt',
    });
  }

  try {
    const result = await runMongoWindowReplayToHrms({
      empNo,
      doj,
      verifiedAt,
      employeeName: employeeName != null ? String(employeeName).trim() || undefined : undefined,
    });
    return res.json({ success: true, ...result });
  } catch (err) {
    logger.error('[internalReplay] replay-window-to-hrms failed:', err.message);
    return res.status(500).json({ success: false, message: err.message || 'Internal error' });
  }
});

module.exports = router;
