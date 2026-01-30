const express = require('express');
const router = express.Router();
const payrollBatchController = require('../controllers/payrollBatchController');
const { protect } = require('../../authentication/middleware/authMiddleware');

// Batch Management
/**
 * @swagger
 * /api/payroll-batch/calculate:
 *   post:
 *     summary: Calculate payroll batch for a given month and criteria
 *     tags: [PayrollBatch]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       201:
 *         description: Batch calculation started/completed
 */
router.post('/calculate', protect, payrollBatchController.calculatePayrollBatch);

/**
 * @swagger
 * /api/payroll-batch:
 *   get:
 *     summary: Get all payroll batches
 *     tags: [PayrollBatch]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of payroll batches
 */
router.get('/', protect, payrollBatchController.getPayrollBatches);

/**
 * @swagger
 * /api/payroll-batch/{id}:
 *   get:
 *     summary: Get single payroll batch details
 *     tags: [PayrollBatch]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Batch details retrieved
 */
router.get('/:id', protect, payrollBatchController.getPayrollBatch);

/**
 * @swagger
 * /api/payroll-batch/{id}/employees:
 *   get:
 *     summary: Get employees in a batch
 *     tags: [PayrollBatch]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *     responses:
 *       200:
 *         description: List retrieved
 */
router.get('/:id/employees', protect, payrollBatchController.getBatchEmployeePayrolls);

/**
 * @swagger
 * /api/payroll-batch/{id}:
 *   delete:
 *     summary: Delete a payroll batch
 *     tags: [PayrollBatch]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *     responses:
 *       200:
 *         description: Batch deleted
 */
router.delete('/:id', protect, payrollBatchController.deleteBatch);

// Status Management
/**
 * @swagger
 * /api/payroll-batch/{id}/approve:
 *   put:
 *     summary: Approve a payroll batch
 *     tags: [PayrollBatch]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *     responses:
 *       200:
 *         description: Batch approved
 */
router.put('/:id/approve', protect, payrollBatchController.approveBatch);

/**
 * @swagger
 * /api/payroll-batch/{id}/freeze:
 *   put:
 *     summary: Freeze a payroll batch
 *     tags: [PayrollBatch]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *     responses:
 *       200:
 *         description: Batch frozen
 */
router.put('/:id/freeze', protect, payrollBatchController.freezeBatch);

/**
 * @swagger
 * /api/payroll-batch/{id}/complete:
 *   put:
 *     summary: Complete a payroll batch
 *     tags: [PayrollBatch]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *     responses:
 *       200:
 *         description: Batch completed
 */
router.put('/:id/complete', protect, payrollBatchController.completeBatch);

// Recalculation
/**
 * @swagger
 * /api/payroll-batch/{id}/request-recalculation:
 *   post:
 *     summary: Request recalculation for a batch
 *     tags: [PayrollBatch]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *     responses:
 *       200:
 *         description: Request submitted
 */
router.post('/:id/request-recalculation', protect, payrollBatchController.requestRecalculation);

/**
 * @swagger
 * /api/payroll-batch/{id}/grant-recalculation:
 *   post:
 *     summary: Grant recalculation for a batch
 *     tags: [PayrollBatch]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *     responses:
 *       200:
 *         description: Request granted
 */
router.post('/:id/grant-recalculation', protect, payrollBatchController.grantRecalculation);

/**
 * @swagger
 * /api/payroll-batch/{id}/recalculate:
 *   post:
 *     summary: Recalculate a batch
 *     tags: [PayrollBatch]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *     responses:
 *       200:
 *         description: Batch recalculated
 */
router.post('/:id/recalculate', protect, payrollBatchController.recalculateBatch);

/**
 * @swagger
 * /api/payroll-batch/{id}/rollback/{historyId}:
 *   post:
 *     summary: Rollback a batch to a history snapshot
 *     tags: [PayrollBatch]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *       - in: path
 *         name: historyId
 *         required: true
 *     responses:
 *       200:
 *         description: Batch rolled back
 */
router.post('/:id/rollback/:historyId', protect, payrollBatchController.rollbackBatch);

// Validation
/**
 * @swagger
 * /api/payroll-batch/{id}/validation:
 *   get:
 *     summary: Validate a payroll batch
 *     tags: [PayrollBatch]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *     responses:
 *       200:
 *         description: Validation result
 */
router.get('/:id/validation', protect, payrollBatchController.validateBatch);

/**
 * @swagger
 * /api/payroll-batch/bulk-approve:
 *   post:
 *     summary: Bulk approve payroll batches
 *     tags: [PayrollBatch]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Batches approved
 */
router.post('/bulk-approve', protect, payrollBatchController.bulkApproveBatches);

/**
 * @swagger
 * /api/payroll-batch/migrate:
 *   post:
 *     summary: Migrate batch divisions
 *     tags: [PayrollBatch]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Migration completed
 */
router.post('/migrate', protect, payrollBatchController.migrateBatchDivisions);

module.exports = router;
