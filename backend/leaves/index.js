const express = require('express');
const router = express.Router();
const leaveController = require('./controllers/leaveController');
const odController = require('./controllers/odController');
const settingsController = require('./controllers/leaveSettingsController');
const { protect, authorize } = require('../authentication/middleware/authMiddleware');

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

// Get workflow
router.get('/workflow/:type', settingsController.getWorkflow);

// Update workflow
router.put('/workflow/:type', authorize('super_admin'), settingsController.updateWorkflow);

// ==========================================
// OD (ON DUTY) ROUTES - MUST COME BEFORE /:id routes!
// ==========================================

// Get my ODs
router.get('/od/my', odController.getMyODs);

// Get pending OD approvals
router.get('/od/pending-approvals', authorize('hod', 'hr', 'sub_admin', 'super_admin'), odController.getPendingApprovals);

// Get all ODs
router.get('/od', authorize('hod', 'hr', 'sub_admin', 'super_admin'), odController.getODs);

// Get single OD
router.get('/od/:id', odController.getOD);

// Apply for OD
router.post('/od', odController.applyOD);

// Update OD
router.put('/od/:id', odController.updateOD);

// Cancel OD
router.put('/od/:id/cancel', odController.cancelOD);

// Process OD action (approve/reject/forward)
router.put('/od/:id/action', authorize('hod', 'hr', 'sub_admin', 'super_admin'), odController.processODAction);

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
router.get('/pending-approvals', authorize('hod', 'hr', 'sub_admin', 'super_admin'), leaveController.getPendingApprovals);

// Get leave statistics
router.get('/stats', leaveController.getLeaveStats);

// Get all leaves (with filters)
router.get('/', authorize('hod', 'hr', 'sub_admin', 'super_admin'), leaveController.getLeaves);

// Apply for leave
router.post('/', leaveController.applyLeave);

// Get single leave - MUST be after all specific routes like /my, /pending-approvals, /stats, /od/*
router.get('/:id', leaveController.getLeave);

// Update leave
router.put('/:id', leaveController.updateLeave);

// Cancel leave
router.put('/:id/cancel', leaveController.cancelLeave);

// Process leave action (approve/reject/forward)
router.put('/:id/action', authorize('hod', 'hr', 'sub_admin', 'super_admin'), leaveController.processLeaveAction);

// Delete leave
router.delete('/:id', authorize('sub_admin', 'super_admin'), leaveController.deleteLeave);

module.exports = router;

