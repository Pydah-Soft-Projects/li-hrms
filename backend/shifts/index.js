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

// Shift Duration routes
// Get allowed durations (for shift creation validation)
router.get('/durations', shiftController.getAllowedDurations);
// Get all shift durations with full details (for settings page)
router.get('/durations/all', shiftDurationController.getAllShiftDurations);
// CRUD operations for shift durations
router.post('/durations', authorize('super_admin', 'sub_admin'), shiftDurationController.createShiftDuration);
router.put('/durations/:id', authorize('super_admin', 'sub_admin'), shiftDurationController.updateShiftDuration);
router.delete('/durations/:id', authorize('super_admin', 'sub_admin'), shiftDurationController.deleteShiftDuration);

// Shift routes - specific routes first, then parameterized routes
router.get('/scoped', shiftController.getScopedShiftData);
router.get('/', shiftController.getAllShifts);
router.post('/', authorize('manager', 'super_admin', 'sub_admin', 'hr'), shiftController.createShift);

// Shift Sync route (must be before /:id)
router.post('/sync', authorize('manager', 'super_admin', 'sub_admin', 'hr', 'hod'), shiftSyncController.syncShifts);

// Confused Shift routes (MUST be before /:id routes to avoid conflicts)
router.get('/confused/stats', authorize('manager', 'super_admin', 'sub_admin', 'hr', 'hod'), confusedShiftController.getConfusedShiftStats);
router.get('/confused', authorize('manager', 'super_admin', 'sub_admin', 'hr', 'hod'), confusedShiftController.getConfusedShifts);
router.get('/confused/:id', authorize('manager', 'super_admin', 'sub_admin', 'hr', 'hod'), confusedShiftController.getConfusedShift);
router.put('/confused/auto-assign-all', authorize('manager', 'super_admin', 'sub_admin', 'hr', 'hod'), confusedShiftController.autoAssignAllConfusedShifts);
router.put('/confused/:id/auto-assign', authorize('manager', 'super_admin', 'sub_admin', 'hr', 'hod'), confusedShiftController.autoAssignConfusedShift);
router.put('/confused/:id/resolve', authorize('manager', 'super_admin', 'sub_admin', 'hr', 'hod'), confusedShiftController.resolveConfusedShift);
router.put('/confused/:id/dismiss', authorize('manager', 'super_admin', 'sub_admin', 'hr', 'hod'), confusedShiftController.dismissConfusedShift);

// Pre-Scheduled Shift routes (MUST be before /:id routes)
router.post('/pre-schedule/bulk', authorize('manager', 'super_admin', 'sub_admin', 'hr', 'hod'), preScheduledShiftController.bulkCreatePreScheduledShifts);
router.get('/pre-schedule', preScheduledShiftController.getPreScheduledShifts);
router.post('/pre-schedule', authorize('manager', 'super_admin', 'sub_admin', 'hr', 'hod'), preScheduledShiftController.createPreScheduledShift);
router.put('/pre-schedule/:id', authorize('manager', 'super_admin', 'sub_admin', 'hr', 'hod'), preScheduledShiftController.updatePreScheduledShift);
router.delete('/pre-schedule/:id', authorize('manager', 'super_admin', 'sub_admin', 'hr', 'hod'), preScheduledShiftController.deletePreScheduledShift);

// Roster (monthly) routes
router.get('/roster', authorize('manager', 'super_admin', 'sub_admin', 'hr', 'hod'), preScheduledShiftController.getRoster);
router.post('/roster', authorize('manager', 'super_admin', 'sub_admin', 'hr', 'hod'), preScheduledShiftController.saveRoster);
router.post('/roster/auto-fill-next-cycle', authorize('manager', 'super_admin', 'sub_admin', 'hr', 'hod'), preScheduledShiftController.autoFillNextCycle);

// Parameterized shift routes (must be last)
router.get('/:id', shiftController.getShift);
router.put('/:id', authorize('manager', 'super_admin', 'sub_admin', 'hr'), shiftController.updateShift);
router.delete('/:id', authorize('super_admin', 'sub_admin'), shiftController.deleteShift);

module.exports = router;

