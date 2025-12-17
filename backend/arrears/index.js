const express = require('express');
const router = express.Router();
const arrearsController = require('./controllers/arrearsController');
const { protect, authorize } = require('../authentication/middleware/authMiddleware');

// All routes require authentication
router.use(protect);

// ==========================================
// ARREARS MANAGEMENT ROUTES
// ==========================================

// Get my arrears
router.get('/my', arrearsController.getMyArrears);

// Get pending approvals (for HOD, HR, Admin)
router.get('/pending-approvals', authorize('hod', 'hr', 'sub_admin', 'super_admin'), arrearsController.getPendingApprovals);

// Get arrears statistics
router.get('/stats/summary', arrearsController.getArrearsStats);

// Get arrears for payroll inclusion
router.get('/for-payroll', authorize('hr', 'sub_admin', 'super_admin'), arrearsController.getArrearsForPayroll);

// Get employee's pending arrears
router.get('/employee/:employeeId/pending', arrearsController.getEmployeePendingArrears);

// Get all arrears (with filters)
router.get('/', authorize('hod', 'hr', 'sub_admin', 'super_admin'), arrearsController.getArrears);

// Create new arrears request
router.post('/', authorize('hr', 'sub_admin', 'super_admin'), arrearsController.createArrears);

// ==========================================
// SPECIFIC ROUTES (Must come BEFORE generic /:id routes)
// ==========================================

// Edit arrears details (at any approval level)
router.put('/:id/edit', authorize('sub_admin', 'super_admin'), arrearsController.editArrears);

// Transition arrears to next approval level (SuperAdmin only)
router.put('/:id/transition', authorize('sub_admin', 'super_admin'), arrearsController.transitionArrears);

// Cancel arrears request
router.put('/:id/cancel', arrearsController.cancelArrears);

// Process arrears action (approve/reject/forward at different levels)
router.put('/:id/action', authorize('hod', 'hr', 'sub_admin', 'super_admin'), arrearsController.processArrearsAction);

// Process arrears settlement
router.post('/:id/settle', authorize('hr', 'sub_admin', 'super_admin'), arrearsController.processSettlement);

// Update arrears settlement status
router.put('/:id/settlement', authorize('hr', 'sub_admin', 'super_admin'), arrearsController.updateArrearsSettlement);

// Revoke arrears approval (within time limit)
router.put('/:id/revoke', authorize('hod', 'hr', 'sub_admin', 'super_admin'), arrearsController.revokeArrearsApproval);

// ==========================================
// GENERIC ROUTES (Must come AFTER specific routes)
// ==========================================

// Get single arrears - MUST be after all specific routes like /my, /pending-approvals, /stats, /transition, /cancel, etc
router.get('/:id', arrearsController.getArrearsById);

// Update arrears (only draft)
router.put('/:id', arrearsController.updateArrears);

module.exports = router;
