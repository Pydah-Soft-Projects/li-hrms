const express = require('express');
const router = express.Router();
const payrollBatchController = require('../controllers/payrollBatchController');
const { protect } = require('../../authentication/middleware/authMiddleware');

// Batch Management
router.post('/calculate', protect, payrollBatchController.calculatePayrollBatch);
router.get('/', protect, payrollBatchController.getPayrollBatches);
router.get('/:id', protect, payrollBatchController.getPayrollBatch);
router.get('/:id/employees', protect, payrollBatchController.getBatchEmployeePayrolls);
router.delete('/:id', protect, payrollBatchController.deleteBatch);

// Status Management
router.put('/:id/approve', protect, payrollBatchController.approveBatch);
router.put('/:id/freeze', protect, payrollBatchController.freezeBatch);
router.put('/:id/complete', protect, payrollBatchController.completeBatch);

// Recalculation
router.post('/:id/request-recalculation', protect, payrollBatchController.requestRecalculation);
router.post('/:id/grant-recalculation', protect, payrollBatchController.grantRecalculation);
router.post('/:id/recalculate', protect, payrollBatchController.recalculateBatch);
router.post('/:id/rollback/:historyId', protect, payrollBatchController.rollbackBatch);

// Validation
router.get('/:id/validation', protect, payrollBatchController.validateBatch);

// Bulk Operations
router.post('/bulk-approve', protect, payrollBatchController.bulkApproveBatches);
router.post('/migrate', protect, payrollBatchController.migrateBatchDivisions); // One-off migration route

module.exports = router;
