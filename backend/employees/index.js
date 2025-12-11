const express = require('express');
const router = express.Router();
const employeeController = require('./controllers/employeeController');
const { protect, authorize } = require('../authentication/middleware/authMiddleware');

// All routes are protected
router.use(protect);

// Get employee settings
router.get('/settings', employeeController.getSettings);

// Get resolved allowance/deduction defaults for a department/gross salary (optional employee overrides via empNo)
router.get('/components/defaults', employeeController.getAllowanceDeductionDefaults);

// Get employee count
router.get('/count', employeeController.getEmployeeCount);

// Get all employees
router.get('/', employeeController.getAllEmployees);

// Get single employee
router.get('/:empNo', employeeController.getEmployee);

// Create employee (Super Admin, Sub Admin, HR)
router.post('/', authorize('super_admin', 'sub_admin', 'hr'), employeeController.createEmployee);

// Update employee (Super Admin, Sub Admin, HR)
router.put('/:empNo', authorize('super_admin', 'sub_admin', 'hr'), employeeController.updateEmployee);

// Delete employee (Super Admin, Sub Admin)
router.delete('/:empNo', authorize('super_admin', 'sub_admin'), employeeController.deleteEmployee);

module.exports = router;
