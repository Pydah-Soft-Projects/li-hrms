const express = require('express');
const router = express.Router();
const { protect, authorize } = require('../../authentication/middleware/authMiddleware');

const {
  getPolicies,
  getPolicyById,
  createPolicy,
  updatePolicy,
  deletePolicy
} = require('../controllers/bonusPolicyController');

const {
  getBatches,
  createBatch,
  getBatchById,
  updateBatchStatus,
  requestRecalculation,
  updateRecord
} = require('../controllers/bonusBatchController');

// Policy Routes
/**
 * @swagger
 * /api/bonus/policies:
 *   get:
 *     summary: Get all bonus policies
 *     tags: [Bonus]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of bonus policies
 *   post:
 *     summary: Create a new bonus policy
 *     tags: [Bonus]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       201:
 *         description: Policy created
 */
router.route('/policies')
  .get(protect, authorize('super_admin', 'superadmin', 'admin', 'sub_admin', 'hr', 'hod', 'manager', 'employee'), getPolicies)
  .post(protect, authorize('super_admin', 'superadmin', 'admin', 'sub_admin', 'hr'), createPolicy);

/**
 * @swagger
 * /api/bonus/policies/{id}:
 *   get:
 *     summary: Get bonus policy by ID
 *     tags: [Bonus]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *     responses:
 *       200:
 *         description: Policy details retrieved
 *   put:
 *     summary: Update bonus policy
 *     tags: [Bonus]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *     responses:
 *       200:
 *         description: Policy updated
 *   delete:
 *     summary: Delete bonus policy
 *     tags: [Bonus]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *     responses:
 *       200:
 *         description: Policy deleted
 */
router.route('/policies/:id')
  .get(protect, authorize('super_admin', 'superadmin', 'admin', 'sub_admin', 'hr'), getPolicyById)
  .put(protect, authorize('super_admin', 'superadmin', 'admin', 'sub_admin', 'hr'), updatePolicy)
  .delete(protect, authorize('super_admin', 'superadmin', 'admin'), deletePolicy);

// Batch Routes
/**
 * @swagger
 * /api/bonus/batches:
 *   get:
 *     summary: Get all bonus computation batches
 *     tags: [Bonus]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of bonus batches
 *   post:
 *     summary: Create a new bonus batch
 *     tags: [Bonus]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       201:
 *         description: Batch created
 */
router.route('/batches')
  .get(protect, authorize('super_admin', 'superadmin', 'admin', 'sub_admin', 'hr', 'hod', 'manager', 'employee'), getBatches)
  .post(protect, authorize('super_admin', 'superadmin', 'admin', 'sub_admin', 'hr'), createBatch);

/**
 * @swagger
 * /api/bonus/batches/{id}:
 *   get:
 *     summary: Get bonus batch by ID
 *     tags: [Bonus]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *     responses:
 *       200:
 *         description: Batch details retrieved
 */
router.route('/batches/:id')
  .get(protect, authorize('super_admin', 'superadmin', 'admin', 'sub_admin', 'hr', 'hod', 'manager', 'employee'), getBatchById);

/**
 * @swagger
 * /api/bonus/batches/{id}/status:
 *   put:
 *     summary: Update bonus batch status
 *     tags: [Bonus]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *     responses:
 *       200:
 *         description: Status updated
 */
router.route('/batches/:id/status')
  .put(protect, authorize('super_admin', 'superadmin', 'admin', 'sub_admin', 'hr'), updateBatchStatus);

module.exports = router;
