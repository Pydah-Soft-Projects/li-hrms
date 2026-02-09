const express = require('express');
const router = express.Router();
const leaveController = require('./controllers/leaveController');
const odController = require('./controllers/odController');
const settingsController = require('./controllers/leaveSettingsController');
const { protect, authorize } = require('../authentication/middleware/authMiddleware');
const { applyScopeFilter } = require('../shared/middleware/dataScopeMiddleware');

// All routes require authentication
router.use(protect);

// ==========================================
// SETTINGS ROUTES (Must come before dynamic routes)
// ==========================================

// Initialize default settings
router.post('/settings/initialize', authorize('super_admin'), settingsController.initializeSettings);

// Get settings for leave or OD
router.get('/settings/:type', settingsController.getSettings);

// Save settings
router.post('/settings/:type', authorize('super_admin'), settingsController.saveSettings);

// Get types (leave types or OD types)
router.get('/types/:type', settingsController.getTypes);

// Add new type
router.post('/types/:type', authorize('super_admin'), settingsController.addType);

// ==========================================
// OD (ON DUTY) ROUTES - MUST COME BEFORE /:id routes!
// ==========================================

// Get my ODs
router.get('/od/my', odController.getMyODs);

// Get pending OD approvals
router.get('/od/pending-approvals', authorize('manager', 'hod', 'hr', 'sub_admin', 'super_admin'), odController.getPendingApprovals);

// Get all ODs (scoped by division/department) - employee allowed; applyScopeFilter restricts to own/scope
router.get('/od', authorize('employee', 'manager', 'hod', 'hr', 'sub_admin', 'super_admin'), applyScopeFilter, odController.getODs);

// Get single OD
router.get('/od/:id', odController.getOD);

// Apply for OD
router.post('/od', odController.applyOD);

// Update OD
router.put('/od/:id', odController.updateOD);

// Cancel OD
router.put('/od/:id/cancel', odController.cancelOD);

// Process OD action (approve/reject/forward)
router.put('/od/:id/action', authorize('manager', 'hod', 'hr', 'sub_admin', 'super_admin'), odController.processODAction);

// Revoke OD approval (within 2-3 hours)
router.put('/od/:id/revoke', authorize('manager', 'hod', 'hr', 'sub_admin', 'super_admin'), odController.revokeODApproval);

// Update OD outcome
router.put('/od/:id/outcome', odController.updateODOutcome);

// Delete OD
router.delete('/od/:id', authorize('sub_admin', 'super_admin'), odController.deleteOD);

// ==========================================
// LEAVE ROUTES
// ==========================================

// Get my leaves
router.get('/my', leaveController.getMyLeaves);

// Get pending approvals
router.get('/pending-approvals', authorize('manager', 'hod', 'hr', 'sub_admin', 'super_admin'), leaveController.getPendingApprovals);

// Get leave statistics
router.get('/stats', leaveController.getLeaveStats);

// Get approved records for a date (for conflict checking)
router.get('/approved-records', leaveController.getApprovedRecordsForDate);

// Get leave conflicts for attendance date
router.get('/conflicts', leaveController.getLeaveConflicts);

// Revoke leave for attendance
router.post('/:id/revoke-for-attendance', authorize('manager', 'super_admin', 'sub_admin', 'hr', 'hod'), leaveController.revokeLeaveForAttendance);

// Update leave for attendance (multi-day leave adjustments)
router.post('/:id/update-for-attendance', authorize('manager', 'super_admin', 'sub_admin', 'hr', 'hod'), leaveController.updateLeaveForAttendance);

// Get all leaves (with filters) - employee allowed; applyScopeFilter restricts to own/scope
router.get('/', authorize('employee', 'manager', 'hod', 'hr', 'sub_admin', 'super_admin'), applyScopeFilter, leaveController.getLeaves);

// Apply for leave
router.post('/', leaveController.applyLeave);

// Get single leave - MUST be after all specific routes like /my, /pending-approvals, /stats, /od/*
router.get('/:id', leaveController.getLeave);

// Update leave
router.put('/:id', leaveController.updateLeave);

// Cancel leave
router.put('/:id/cancel', leaveController.cancelLeave);

// Process leave action (approve/reject/forward)
router.put('/:id/action', authorize('manager', 'hod', 'hr', 'sub_admin', 'super_admin'), leaveController.processLeaveAction);

// Revoke leave approval (within 2-3 hours)
router.put('/:id/revoke', authorize('manager', 'hod', 'hr', 'sub_admin', 'super_admin'), leaveController.revokeLeaveApproval);

// Delete leave
router.delete('/:id', authorize('sub_admin', 'super_admin'), leaveController.deleteLeave);

// ==========================================
// LEAVE SPLIT ROUTES
// ==========================================

// Validate splits before creating
router.post('/:id/validate-splits', authorize('manager', 'hod', 'hr', 'sub_admin', 'super_admin'), leaveController.validateLeaveSplits);

// Create splits for a leave
router.post('/:id/split', authorize('manager', 'hod', 'hr', 'sub_admin', 'super_admin'), leaveController.createLeaveSplits);

// Get splits for a leave
router.get('/:id/splits', leaveController.getLeaveSplits);

// Get split summary for a leave
router.get('/:id/split-summary', leaveController.getLeaveSplitSummary);

// Update a single split
router.put('/:id/splits/:splitId', authorize('manager', 'hod', 'hr', 'sub_admin', 'super_admin'), leaveController.updateLeaveSplit);

// Delete a split
router.delete('/:id/splits/:splitId', authorize('manager', 'hod', 'hr', 'sub_admin', 'super_admin'), leaveController.deleteLeaveSplit);

module.exports = router;

