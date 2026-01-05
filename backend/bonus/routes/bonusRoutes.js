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
router.route('/policies')
  .get(protect, authorize('super_admin', 'superadmin', 'admin', 'sub_admin', 'hr', 'hod', 'manager', 'employee'), getPolicies)
  .post(protect, authorize('super_admin', 'superadmin', 'admin', 'sub_admin', 'hr'), createPolicy);

router.route('/policies/:id')
  .get(protect, authorize('super_admin', 'superadmin', 'admin', 'sub_admin', 'hr'), getPolicyById)
  .put(protect, authorize('super_admin', 'superadmin', 'admin', 'sub_admin', 'hr'), updatePolicy)
  .delete(protect, authorize('super_admin', 'superadmin', 'admin'), deletePolicy);

// Batch Routes
router.route('/batches')
  .get(protect, authorize('super_admin', 'superadmin', 'admin', 'sub_admin', 'hr', 'hod', 'manager', 'employee'), getBatches)
  .post(protect, authorize('super_admin', 'superadmin', 'admin', 'sub_admin', 'hr'), createBatch); // Calc & Create

router.route('/batches/:id')
  .get(protect, authorize('super_admin', 'superadmin', 'admin', 'sub_admin', 'hr', 'hod', 'manager', 'employee'), getBatchById);

router.route('/batches/:id/status')
  .put(protect, authorize('super_admin', 'superadmin', 'admin', 'sub_admin', 'hr'), updateBatchStatus);

router.route('/batches/:id/recalculate-request')
  .post(protect, authorize('super_admin', 'superadmin', 'admin', 'sub_admin', 'hr', 'hod'), requestRecalculation);

// Record Routes
router.route('/records/:id')
  .put(protect, authorize('super_admin', 'superadmin', 'admin', 'sub_admin', 'hr'), updateRecord);

module.exports = router;
