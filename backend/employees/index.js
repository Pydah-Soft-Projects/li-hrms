const express = require('express');
const router = express.Router();
const employeeController = require('./controllers/employeeController');
const { protect, authorize } = require('../authentication/middleware/authMiddleware');
const { roleBasedFilter } = require('../shared/middleware/roleBasedFilter');

// All routes are protected
router.use(protect);

// Get employee settings
router.get('/settings', employeeController.getSettings);

// Get resolved allowance/deduction defaults for a department/gross salary (optional employee overrides via empNo)
router.get('/components/defaults', employeeController.getAllowanceDeductionDefaults);

// Get employee count
router.get('/count', employeeController.getEmployeeCount);

// Get all employees (with role-based filtering)
router.get('/', roleBasedFilter('employees'), employeeController.getAllEmployees);

// Get single employee
router.get('/:empNo', employeeController.getEmployee);

// Create employee (Super Admin, Sub Admin, HR)
router.post('/', authorize('super_admin', 'sub_admin', 'hr'), employeeController.createEmployee);

// Resend credentials (Super Admin)
router.post('/:empNo/resend-credentials', authorize('super_admin'), employeeController.resendEmployeePassword);

// Bulk export passwords (Super Admin)
router.post('/bulk-export-passwords', authorize('super_admin'), employeeController.bulkExportEmployeePasswords);

// Update employee (Super Admin, Sub Admin, HR)
router.put('/:empNo', authorize('super_admin', 'sub_admin', 'hr'), employeeController.updateEmployee);

// Set employee left date (Super Admin, Sub Admin, HR)
router.put('/:empNo/left-date', authorize('super_admin', 'sub_admin', 'hr'), employeeController.setLeftDate);

// Remove employee left date / Reactivate (Super Admin, Sub Admin, HR)
router.delete('/:empNo/left-date', authorize('super_admin', 'sub_admin', 'hr'), employeeController.removeLeftDate);

// Delete employee (Super Admin, Sub Admin)
router.delete('/:empNo', authorize('super_admin', 'sub_admin'), employeeController.deleteEmployee);

module.exports = router;
