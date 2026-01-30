const express = require('express');
const router = express.Router();
const payrollController = require('./controllers/payrollController');
const { protect, authorize } = require('../authentication/middleware/authMiddleware');
const { applyScopeFilter } = require('../shared/middleware/dataScopeMiddleware');

// All routes require authentication
router.use(protect);

/**
 * @swagger
 * /api/payroll/calculate:
 *   post:
 *     summary: Calculate payroll for an employee
 *     tags: [Payroll]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Payroll calculated
 */
router.post('/calculate', authorize('manager', 'super_admin', 'sub_admin', 'hr'), payrollController.calculatePayroll);

/**
 * @swagger
 * /api/payroll/bulk-calculate:
 *   post:
 *     summary: Bulk calculate payroll
 *     tags: [Payroll]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Bulk calculation started
 */
router.post('/bulk-calculate', applyScopeFilter, authorize('manager', 'super_admin', 'sub_admin', 'hr'), payrollController.calculatePayrollBulk);

/**
 * @swagger
 * /api/payroll/recalculate:
 *   post:
 *     summary: Recalculate payroll for an employee
 *     tags: [Payroll]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Payroll recalculated
 */
router.post('/recalculate', authorize('manager', 'super_admin', 'sub_admin', 'hr'), payrollController.recalculatePayroll);

/**
 * @swagger
 * /api/payroll/payslip/{employeeId}/{month}:
 *   get:
 *     summary: Get payslip for an employee
 *     tags: [Payroll]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: employeeId
 *         required: true
 *         schema:
 *           type: string
 *       - in: path
 *         name: month
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Payslip retrieved
 */
router.get('/payslip/:employeeId/:month', applyScopeFilter, payrollController.getPayslip);

/**
 * @swagger
 * /api/payroll:
 *   get:
 *     summary: Get all payroll records
 *     tags: [Payroll]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Records retrieved
 */
router.get('/', applyScopeFilter, payrollController.getPayrollRecords);

/**
 * @swagger
 * /api/payroll/record/{id}:
 *   get:
 *     summary: Get payroll record by ID
 *     tags: [Payroll]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *     responses:
 *       200:
 *         description: Record retrieved
 */
router.get('/record/:id', payrollController.getPayrollRecordById);

/**
 * @swagger
 * /api/payroll/{payrollRecordId}/transactions:
 *   get:
 *     summary: Get transactions for a payroll record
 *     tags: [Payroll]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: payrollRecordId
 *         required: true
 *     responses:
 *       200:
 *         description: Transactions retrieved
 */
router.get('/:payrollRecordId/transactions', payrollController.getPayrollTransactions);

/**
 * @swagger
 * /api/payroll/transactions/analytics:
 *   get:
 *     summary: Get payroll transaction analytics
 *     tags: [Payroll]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Analytics retrieved
 */
router.get('/transactions/analytics', payrollController.getPayrollTransactionsWithAnalytics);

/**
 * @swagger
 * /api/payroll/attendance-range:
 *   get:
 *     summary: Get attendance data range for payroll
 *     tags: [Payroll]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Range retrieved
 */
router.get('/attendance-range', payrollController.getAttendanceDataRange);

/**
 * @swagger
 * /api/payroll/export:
 *   get:
 *     summary: Export payroll records to Excel
 *     tags: [Payroll]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: File retrieved
 */
router.get('/export', applyScopeFilter, payrollController.exportPayrollExcel);

/**
 * @swagger
 * /api/payroll/{payrollRecordId}/process:
 *   put:
 *     summary: Process payroll record
 *     tags: [Payroll]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: payrollRecordId
 *         required: true
 *     responses:
 *       200:
 *         description: Processed
 */
router.put('/:payrollRecordId/process', authorize('manager', 'super_admin', 'sub_admin', 'hr'), payrollController.processPayroll);

/**
 * @swagger
 * /api/payroll/{employeeId}/{month}:
 *   get:
 *     summary: Get payroll record by employee and month
 *     tags: [Payroll]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: employeeId
 *         required: true
 *       - in: path
 *         name: month
 *         required: true
 *     responses:
 *       200:
 *         description: Record retrieved
 */
router.get('/:employeeId/:month', payrollController.getPayrollRecord);

module.exports = router;

