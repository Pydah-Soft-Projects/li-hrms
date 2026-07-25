const express = require('express');
const router = express.Router();
const logger = require('../utils/logger');
const { runMongoWindowReplayToHrms } = require('../services/mongoReplayToHrmsService');
const {
  deactivateUserOnAllActiveDevices,
  activateUserOnDevices
} = require('../services/userCloneService');

function requireSystemKey(req, res) {
  const expected = process.env.HRMS_MICROSERVICE_SECRET_KEY;
  if (!expected) {
    logger.error('[internal] HRMS_MICROSERVICE_SECRET_KEY is not configured');
    res.status(500).json({ success: false, message: 'Server configuration error' });
    return false;
  }
  if (req.headers['x-system-key'] !== expected) {
    res.status(401).json({ success: false, message: 'Unauthorized' });
    return false;
  }
  return true;
}

/**
 * POST /api/internal/replay-window-to-hrms
 * Body: { empNo, doj, verifiedAt, employeeName? }
 * Reads AttendanceLog from this service's MongoDB only (no device). Pushes to HRMS internal sync.
 */
router.post('/replay-window-to-hrms', async (req, res) => {
  if (!requireSystemKey(req, res)) return;

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

/**
 * POST /api/internal/users/deactivate-all
 * Body: { userId | empNo }
 * Queues delete on every active device membership; keeps golden record as inactive.
 */
router.post('/users/deactivate-all', async (req, res) => {
  if (!requireSystemKey(req, res)) return;

  const userId = String(req.body?.userId || req.body?.empNo || '').trim();
  if (!userId) {
    return res.status(400).json({ success: false, message: 'userId (or empNo) is required' });
  }

  try {
    const result = await deactivateUserOnAllActiveDevices(userId);
    return res.json({ success: true, ...result });
  } catch (err) {
    logger.error('[internal] deactivate-all failed:', err.message);
    return res.status(500).json({ success: false, message: err.message || 'Internal error' });
  }
});

/**
 * POST /api/internal/users/activate-on-devices
 * Body: { userId | empNo, deviceIds?: string[] }
 * Writes user back to deviceIds, or to inactiveDeviceIds when deviceIds omitted.
 */
router.post('/users/activate-on-devices', async (req, res) => {
  if (!requireSystemKey(req, res)) return;

  const userId = String(req.body?.userId || req.body?.empNo || '').trim();
  if (!userId) {
    return res.status(400).json({ success: false, message: 'userId (or empNo) is required' });
  }

  try {
    const result = await activateUserOnDevices(userId, req.body?.deviceIds);
    return res.json({ success: true, ...result });
  } catch (err) {
    logger.error('[internal] activate-on-devices failed:', err.message);
    return res.status(500).json({ success: false, message: err.message || 'Internal error' });
  }
});

module.exports = router;
