const express = require('express');
const router = express.Router();
const payrollController = require('./controllers/payrollController');
const { protect, authorize } = require('../authentication/middleware/authMiddleware');
const { applyScopeFilter } = require('../shared/middleware/dataScopeMiddleware');

// All routes require authentication
router.use(protect);

// Calculate payroll (Super Admin, Sub Admin, HR)
router.post('/calculate', authorize('super_admin', 'sub_admin', 'hr'), payrollController.calculatePayroll);

// Recalculate payroll (Super Admin, Sub Admin, HR)
router.post('/recalculate', authorize('super_admin', 'sub_admin', 'hr'), payrollController.recalculatePayroll);

// Get payslip (with scope filtering)
router.get('/payslip/:employeeId/:month', applyScopeFilter, payrollController.getPayslip);

// Get payroll records (with scope filtering)
router.get('/', applyScopeFilter, payrollController.getPayrollRecords);

// Get single payroll record by ID
router.get('/record/:id', payrollController.getPayrollRecordById);

// Get payroll transactions
router.get('/:payrollRecordId/transactions', payrollController.getPayrollTransactions);

// Get payroll transactions with analytics for a month
router.get('/transactions/analytics', payrollController.getPayrollTransactionsWithAnalytics);

// Get attendance data for a range of months
router.get('/attendance-range', payrollController.getAttendanceDataRange);

// Export payroll payslips as Excel (with scope filtering)
router.get('/export', applyScopeFilter, payrollController.exportPayrollExcel);

// Approve payroll (Super Admin, Sub Admin, HR)
router.put('/:payrollRecordId/approve', authorize('super_admin', 'sub_admin', 'hr'), payrollController.approvePayroll);

// Process payroll (Super Admin, Sub Admin, HR)
router.put('/:payrollRecordId/process', authorize('super_admin', 'sub_admin', 'hr'), payrollController.processPayroll);

// Get single payroll record (must be last to avoid route conflicts)
router.get('/:employeeId/:month', payrollController.getPayrollRecord);

module.exports = router;

