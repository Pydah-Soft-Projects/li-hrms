const express = require('express');
const router = express.Router();
const secondSalaryController = require('../controllers/secondSalaryController');
const { protect } = require('../../authentication/middleware/authMiddleware');

// Batch Management
router.post('/calculate', protect, secondSalaryController.calculateSecondSalary);
router.get('/batches', protect, secondSalaryController.getSecondSalaryBatches);
router.get('/batches/:id', protect, secondSalaryController.getSecondSalaryBatch);

// Status Management
router.put('/batches/:id/status', protect, secondSalaryController.updateBatchStatus);

// Records (Payslips)
router.get('/records', protect, secondSalaryController.getSecondSalaryRecords);
router.get('/records/:id', protect, secondSalaryController.getSecondSalaryRecordById);

// Comparison
router.get('/comparison', protect, secondSalaryController.getSalaryComparison);
router.get('/comparison/export', protect, secondSalaryController.exportSalaryComparisonExcel);

// Export
router.get('/export', protect, secondSalaryController.exportSecondSalaryExcel);

module.exports = router;
