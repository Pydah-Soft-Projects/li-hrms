const express = require('express');
const router = express.Router();
const secondSalaryController = require('../controllers/secondSalaryController');
const { protect } = require('../../authentication/middleware/authMiddleware');
const { applyScopeFilter } = require('../../shared/middleware/dataScopeMiddleware');
const requireSecondSalaryEnabled = require('../../settings/middleware/requireSecondSalaryEnabled');

// Batch Management
router.post('/calculate', protect, applyScopeFilter, requireSecondSalaryEnabled, secondSalaryController.calculateSecondSalary);
router.get('/batches', protect, requireSecondSalaryEnabled, secondSalaryController.getSecondSalaryBatches);
router.get('/batches/:id', protect, requireSecondSalaryEnabled, secondSalaryController.getSecondSalaryBatch);

// Status Management
router.put('/batches/:id/status', protect, requireSecondSalaryEnabled, secondSalaryController.updateBatchStatus);

// Records (Payslips)
router.get('/records', protect, requireSecondSalaryEnabled, secondSalaryController.getSecondSalaryRecords);
router.get('/records/:id', protect, requireSecondSalaryEnabled, secondSalaryController.getSecondSalaryRecordById);

// Comparison
router.get('/comparison', protect, requireSecondSalaryEnabled, secondSalaryController.getSalaryComparison);
router.get('/comparison/export', protect, requireSecondSalaryEnabled, secondSalaryController.exportSalaryComparisonExcel);

// Export
router.get('/export', protect, requireSecondSalaryEnabled, secondSalaryController.exportSecondSalaryExcel);

module.exports = router;
