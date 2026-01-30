const express = require('express');
const router = express.Router();
const loanController = require('./controllers/loanController');
const settingsController = require('./controllers/loanSettingsController');
const { protect, authorize } = require('../authentication/middleware/authMiddleware');
const { applyScopeFilter } = require('../shared/middleware/dataScopeMiddleware');

// All routes require authentication
router.use(protect);
router.use(applyScopeFilter);

/**
 * @swagger
 * /api/loans/my:
 *   get:
 *     summary: Get loans of the current user
 *     tags: [Loans]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of my loans
 */
router.get('/my', loanController.getMyLoans);

/**
 * @swagger
 * /api/loans/pending-approvals:
 *   get:
 *     summary: Get pending loan approvals
 *     tags: [Loans]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of pending approvals
 */
router.get('/pending-approvals', authorize('manager', 'hod', 'hr', 'sub_admin', 'super_admin'), loanController.getPendingApprovals);

/**
 * @swagger
 * /api/loans:
 *   post:
 *     summary: Apply for a loan/advance
 *     tags: [Loans]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       201:
 *         description: Application created
 */
router.post('/', loanController.applyLoan);

router.get('/settings/:type', settingsController.getSettings);
router.post('/settings/:type', authorize('manager', 'super_admin'), settingsController.saveSettings);
router.get('/calculate-eligibility', loanController.calculateEligibility);
router.get('/:id', loanController.getLoan);
router.put('/:id', loanController.updateLoan);
router.put('/:id/cancel', loanController.cancelLoan);
router.put('/:id/action', authorize('manager', 'hod', 'hr', 'sub_admin', 'super_admin'), loanController.processLoanAction);
router.put('/:id/disburse', authorize('manager', 'hr', 'sub_admin', 'super_admin'), loanController.disburseLoan);

module.exports = router;

