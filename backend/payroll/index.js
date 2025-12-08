const express = require('express');
const router = express.Router();
const payrollController = require('./controllers/payrollController');
const { protect, authorize } = require('../authentication/middleware/authMiddleware');

// All routes require authentication
router.use(protect);

// Calculate payroll (Super Admin, Sub Admin, HR)
router.post('/calculate', authorize('super_admin', 'sub_admin', 'hr'), payrollController.calculatePayroll);

// Recalculate payroll (Super Admin, Sub Admin, HR)
router.post('/recalculate', authorize('super_admin', 'sub_admin', 'hr'), payrollController.recalculatePayroll);

// Get payslip
router.get('/payslip/:employeeId/:month', payrollController.getPayslip);

// Get payroll records
router.get('/', payrollController.getPayrollRecords);

// Get payroll transactions
router.get('/:payrollRecordId/transactions', payrollController.getPayrollTransactions);

// Get payroll transactions with analytics for a month
router.get('/transactions/analytics', payrollController.getPayrollTransactionsWithAnalytics);

// Approve payroll (Super Admin, Sub Admin, HR)
router.put('/:payrollRecordId/approve', authorize('super_admin', 'sub_admin', 'hr'), payrollController.approvePayroll);

// Process payroll (Super Admin, Sub Admin, HR)
router.put('/:payrollRecordId/process', authorize('super_admin', 'sub_admin', 'hr'), payrollController.processPayroll);

// Get single payroll record (must be last to avoid route conflicts)
router.get('/:employeeId/:month', payrollController.getPayrollRecord);

module.exports = router;

