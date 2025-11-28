const express = require('express');
const router = express.Router();
const loanController = require('./controllers/loanController');
const settingsController = require('./controllers/loanSettingsController');
const { protect, authorize } = require('../authentication/middleware/authMiddleware');

// All routes require authentication
router.use(protect);

// ==========================================
// SETTINGS ROUTES (Must come before dynamic routes)
// ==========================================

// Get settings for loan or salary_advance
router.get('/settings/:type', settingsController.getSettings);

// Save settings
router.post('/settings/:type', authorize('super_admin'), settingsController.saveSettings);
router.put('/settings/:type', authorize('super_admin'), settingsController.saveSettings);

// Get users for workflow configuration
router.get('/settings/:type/users', authorize('super_admin'), settingsController.getUsersForWorkflow);

// Get workflow configuration
router.get('/settings/:type/workflow', settingsController.getWorkflow);

// Update workflow configuration
router.put('/settings/:type/workflow', authorize('super_admin'), settingsController.updateWorkflow);

// ==========================================
// LOAN ROUTES
// ==========================================

// Get my loans
router.get('/my', loanController.getMyLoans);

// Get pending approvals
router.get('/pending-approvals', authorize('hod', 'hr', 'sub_admin', 'super_admin'), loanController.getPendingApprovals);

// Get all loans (with filters)
router.get('/', authorize('hod', 'hr', 'sub_admin', 'super_admin'), loanController.getLoans);

// Apply for loan/advance
router.post('/', loanController.applyLoan);

// Get single loan - MUST be after all specific routes like /my, /pending-approvals
router.get('/:id', loanController.getLoan);

// Cancel loan
router.put('/:id/cancel', loanController.cancelLoan);

// Process loan action (approve/reject/forward)
router.put('/:id/action', authorize('hod', 'hr', 'sub_admin', 'super_admin'), loanController.processLoanAction);

// Disburse loan
router.put('/:id/disburse', authorize('hr', 'sub_admin', 'super_admin'), loanController.disburseLoan);

// Record EMI payment
router.post('/:id/pay-emi', authorize('hr', 'sub_admin', 'super_admin'), loanController.payEMI);

// Record advance deduction
router.post('/:id/pay-advance', authorize('hr', 'sub_admin', 'super_admin'), loanController.payAdvance);

// Get transaction history
router.get('/:id/transactions', loanController.getTransactions);

module.exports = router;

