const express = require('express');
const router = express.Router();
const secondSalaryController = require('../controllers/secondSalaryController');
const { protect, authorize } = require('../../authentication/middleware/authMiddleware');
const { applyScopeFilter } = require('../../shared/middleware/dataScopeMiddleware');
const requireSecondSalaryEnabled = require('../../settings/middleware/requireSecondSalaryEnabled');

// Batch Management — Super Admin only (staff must not post second salary)
router.post('/calculate', protect, authorize('super_admin'), applyScopeFilter, requireSecondSalaryEnabled, secondSalaryController.calculateSecondSalary);
router.get('/batches', protect, authorize('super_admin'), requireSecondSalaryEnabled, secondSalaryController.getSecondSalaryBatches);
router.get('/batches/:id', protect, authorize('super_admin'), requireSecondSalaryEnabled, secondSalaryController.getSecondSalaryBatch);

// Status Management
router.put('/batches/:id/status', protect, authorize('super_admin'), requireSecondSalaryEnabled, secondSalaryController.updateBatchStatus);

// Records (Payslips) — read for scoped users via other routes; batch ops superadmin only
router.get('/records', protect, authorize('super_admin'), requireSecondSalaryEnabled, secondSalaryController.getSecondSalaryRecords);
router.get('/records/:id', protect, authorize('super_admin'), requireSecondSalaryEnabled, secondSalaryController.getSecondSalaryRecordById);

// Comparison
router.get('/comparison', protect, authorize('super_admin'), requireSecondSalaryEnabled, secondSalaryController.getSalaryComparison);
router.get('/comparison/export', protect, authorize('super_admin'), requireSecondSalaryEnabled, secondSalaryController.exportSalaryComparisonExcel);

// Export
router.get('/export', protect, authorize('super_admin'), requireSecondSalaryEnabled, secondSalaryController.exportSecondSalaryExcel);

module.exports = router;
