/**
 * Permissions Module Routes
 */

const express = require('express');
const router = express.Router();
const { protect, authorize } = require('../authentication/middleware/authMiddleware');
const { applyScopeFilter } = require('../shared/middleware/dataScopeMiddleware');
const {
  createPermission,
  getPermissions,
  getPermission,
  getPendingPermissionApprovals,
  approvePermission,
  rejectPermission,
  getOutpass,
  getQRCode,
} = require('./controllers/permissionController');
const { generateAutoEdgePermissions } = require('./controllers/autoEdgePermissionController');
const permissionDeductionSettingsController = require('./controllers/permissionDeductionSettingsController');
const autoEdgePermissionSettingsController = require('./controllers/autoEdgePermissionSettingsController');

// Public route for outpass (no authentication required)
router.get('/outpass/:qrCode', getOutpass);

// All other routes require authentication
router.use(protect);

// Create permission request
router.post('/', createPermission);

// Pending permission approvals (must come before /:id)
router.get('/pending-approvals', authorize('manager', 'hod', 'hr', 'sub_admin', 'super_admin'), getPendingPermissionApprovals);

// Settings Routes (Must come before dynamic /:id routes)
router.get('/settings/deduction', permissionDeductionSettingsController.getSettings);
router.post('/settings/deduction', authorize('super_admin', 'sub_admin'), permissionDeductionSettingsController.saveSettings);
router.put('/settings/deduction', authorize('super_admin', 'sub_admin'), permissionDeductionSettingsController.saveSettings);

router.get('/settings/auto-edge', autoEdgePermissionSettingsController.getSettings);
router.post('/settings/auto-edge', authorize('super_admin', 'sub_admin'), autoEdgePermissionSettingsController.saveSettings);
router.put('/settings/auto-edge', authorize('super_admin', 'sub_admin'), autoEdgePermissionSettingsController.saveSettings);

router.post('/generate-auto-edge-permissions', authorize('super_admin', 'sub_admin'), applyScopeFilter, generateAutoEdgePermissions);

// Get permission requests - employee allowed; applyScopeFilter restricts to own/scope
router.get('/', authorize('employee', 'manager', 'hod', 'hr', 'sub_admin', 'super_admin'), applyScopeFilter, getPermissions);

// Get single permission request
router.get('/:id', getPermission);

// Get QR code for permission
router.get('/:id/qr', getQRCode);

// Approve permission request (workflow roles incl. manager/reporting-manager path)
router.put('/:id/approve', authorize('super_admin', 'sub_admin', 'hr', 'hod', 'manager'), approvePermission);

// Reject permission request (workflow roles incl. manager/reporting-manager path)
router.put('/:id/reject', authorize('super_admin', 'sub_admin', 'hr', 'hod', 'manager'), rejectPermission);

module.exports = router;

