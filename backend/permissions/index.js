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
const permissionDeductionSettingsController = require('./controllers/permissionDeductionSettingsController');

// Public route for outpass (no authentication required)
router.get('/outpass/:qrCode', getOutpass);

// All other routes require authentication
router.use(protect);

// Create permission request
router.post('/', createPermission);

// Pending permission approvals (must come before /:id)
router.get('/pending-approvals', authorize('manager', 'hod', 'hr', 'sub_admin', 'super_admin'), getPendingPermissionApprovals);

// Get permission requests - employee allowed; applyScopeFilter restricts to own/scope
router.get('/', authorize('employee', 'manager', 'hod', 'hr', 'sub_admin', 'super_admin'), applyScopeFilter, getPermissions);

// Get single permission request
router.get('/:id', getPermission);

// Get QR code for permission
router.get('/:id/qr', getQRCode);

// Approve permission request (HOD, HR, Super Admin)
router.put('/:id/approve', authorize('super_admin', 'sub_admin', 'hr', 'hod'), approvePermission);

// Reject permission request (HOD, HR, Super Admin)
router.put('/:id/reject', authorize('super_admin', 'sub_admin', 'hr', 'hod'), rejectPermission);

// Settings Routes (Must come before dynamic routes)
// Get permission deduction settings
router.get('/settings/deduction', permissionDeductionSettingsController.getSettings);

// Save permission deduction settings
router.post('/settings/deduction', authorize('super_admin', 'sub_admin'), permissionDeductionSettingsController.saveSettings);
router.put('/settings/deduction', authorize('super_admin', 'sub_admin'), permissionDeductionSettingsController.saveSettings);

module.exports = router;

