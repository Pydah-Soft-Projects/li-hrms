const express = require('express');
const router = express.Router();
const shiftController = require('./controllers/shiftController');
const shiftDurationController = require('./controllers/shiftDurationController');
const confusedShiftController = require('./controllers/confusedShiftController');
const preScheduledShiftController = require('./controllers/preScheduledShiftController');
const shiftSyncController = require('./controllers/shiftSyncController');
const { protect, authorize } = require('../authentication/middleware/authMiddleware');

// All routes are protected
router.use(protect);

/**
 * @swagger
 * /api/shifts/durations:
 *   get:
 *     summary: Get allowed shift durations
 *     tags: [Shifts]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of allowed durations
 */
router.get('/durations', shiftController.getAllowedDurations);

router.get('/durations/all', shiftDurationController.getAllShiftDurations);
router.post('/durations', authorize('super_admin', 'sub_admin'), shiftDurationController.createShiftDuration);
router.put('/durations/:id', authorize('super_admin', 'sub_admin'), shiftDurationController.updateShiftDuration);
router.delete('/durations/:id', authorize('super_admin', 'sub_admin'), shiftDurationController.deleteShiftDuration);

/**
 * @swagger
 * /api/shifts:
 *   get:
 *     summary: Get all shifts
 *     tags: [Shifts]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of shifts
 */
router.get('/', shiftController.getAllShifts);

router.get('/scoped', shiftController.getScopedShiftData);

/**
 * @swagger
 * /api/shifts:
 *   post:
 *     summary: Create a new shift
 *     tags: [Shifts]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       201:
 *         description: Shift created
 */
router.post('/', authorize('manager', 'super_admin', 'sub_admin', 'hr'), shiftController.createShift);

router.post('/sync', authorize('manager', 'super_admin', 'sub_admin', 'hr', 'hod'), shiftSyncController.syncShifts);

// Confused Shift routes
router.get('/confused/stats', authorize('manager', 'super_admin', 'sub_admin', 'hr', 'hod'), confusedShiftController.getConfusedShiftStats);
router.get('/confused', authorize('manager', 'super_admin', 'sub_admin', 'hr', 'hod'), confusedShiftController.getConfusedShifts);

/**
 * @swagger
 * /api/shifts/roster:
 *   get:
 *     summary: Get employee roster
 *     tags: [Roster]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Roster retrieved
 */
router.get('/roster', authorize('manager', 'super_admin', 'sub_admin', 'hr', 'hod'), preScheduledShiftController.getRoster);

/**
 * @swagger
 * /api/shifts/my-roster:
 *   get:
 *     summary: Get my shift roster
 *     tags: [Roster]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: My roster retrieved
 */
router.get('/my-roster', preScheduledShiftController.getMyRoster);

router.get('/:id', shiftController.getShift);
router.put('/:id', authorize('manager', 'super_admin', 'sub_admin', 'hr'), shiftController.updateShift);
router.delete('/:id', authorize('super_admin', 'sub_admin'), shiftController.deleteShift);

module.exports = router;

