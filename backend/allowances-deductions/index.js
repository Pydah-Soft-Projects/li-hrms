const express = require('express');
const router = express.Router();
const allowanceDeductionController = require('./controllers/allowanceDeductionController');
const { protect, authorize } = require('../authentication/middleware/authMiddleware');

// All routes are protected
router.use(protect);

// Download template (Must be before /:id)
router.get('/template', allowanceDeductionController.downloadTemplate);

// Bulk update (Super Admin Only)
const multer = require('multer');
const upload = multer(); // Use memory storage for buffer access
router.post('/bulk-update', authorize('super_admin'), upload.single('file'), allowanceDeductionController.bulkUpdateAllowancesDeductions);

// Get all allowances and deductions
router.get('/', allowanceDeductionController.getAllAllowancesDeductions);

// Get only allowances
router.get('/allowances', allowanceDeductionController.getAllowances);

// Get only deductions
router.get('/deductions', allowanceDeductionController.getDeductions);

// Get single allowance/deduction
router.get('/:id', allowanceDeductionController.getAllowanceDeduction);

// Get resolved rule for a department
router.get('/:id/resolved/:deptId', allowanceDeductionController.getResolvedRule);

// Create allowance/deduction (Super Admin, Sub Admin, HR)
router.post('/', authorize('super_admin', 'sub_admin', 'hr'), allowanceDeductionController.createAllowanceDeduction);

// Update allowance/deduction (Super Admin, Sub Admin, HR)
router.put('/:id', authorize('super_admin', 'sub_admin', 'hr'), allowanceDeductionController.updateAllowanceDeduction);

// Add or update department rule (Super Admin, Sub Admin, HR)
router.put('/:id/department-rule', authorize('super_admin', 'sub_admin', 'hr'), allowanceDeductionController.addOrUpdateDepartmentRule);

// Remove department rule (Super Admin, Sub Admin, HR)
router.delete('/:id/department-rule/:deptId', authorize('super_admin', 'sub_admin', 'hr'), allowanceDeductionController.removeDepartmentRule);

// Delete allowance/deduction (Super Admin, Sub Admin)
router.delete('/:id', authorize('super_admin', 'sub_admin'), allowanceDeductionController.deleteAllowanceDeduction);

module.exports = router;

