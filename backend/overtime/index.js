/**
 * Overtime Module Routes
 */

const express = require('express');
const router = express.Router();
const { protect, authorize } = require('../authentication/middleware/authMiddleware');
const { applyScopeFilter } = require('../shared/middleware/dataScopeMiddleware');
const {
  createOT,
  getOTRequests,
  getOTRequest,
  getPendingOTApprovals,
  approveOT,
  rejectOT,
  checkConfusedShift,
  convertExtraHoursToOT,
} = require('./controllers/otController');
const { getSettings, saveSettings } = require('./controllers/overtimeSettingsController');

// All routes require authentication
router.use(protect);

// Overtime Settings Routes
router.get('/settings', getSettings);
router.post('/settings', authorize('super_admin'), saveSettings);

// Create OT request (HOD, HR, Super Admin)
router.post('/', authorize('manager', 'super_admin', 'sub_admin', 'hr', 'hod'), createOT);

// Pending OT approvals (must come before /:id)
router.get('/pending-approvals', authorize('manager', 'hod', 'hr', 'sub_admin', 'super_admin'), getPendingOTApprovals);

// Get OT requests - employee allowed; applyScopeFilter restricts to own/scope
router.get('/', authorize('employee', 'manager', 'hod', 'hr', 'sub_admin', 'super_admin'), applyScopeFilter, getOTRequests);

// Get single OT request
router.get('/:id', getOTRequest);

// Check ConfusedShift for employee date
router.get('/check-confused/:employeeNumber/:date', checkConfusedShift);

// Convert extra hours from attendance to OT (HR, Super Admin, Sub Admin)
router.post('/convert-from-attendance', authorize('manager', 'super_admin', 'sub_admin', 'hr'), convertExtraHoursToOT);

// Approve OT request (HOD, HR, Super Admin)
router.put('/:id/approve', authorize('manager', 'super_admin', 'sub_admin', 'hr', 'hod'), approveOT);

// Reject OT request (HOD, HR, Super Admin)
router.put('/:id/reject', authorize('manager', 'super_admin', 'sub_admin', 'hr', 'hod'), rejectOT);

module.exports = router;

