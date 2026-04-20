const express = require('express');
const router = express.Router();
const assetController = require('./controllers/assetController');
const { protect, authorize } = require('../authentication/middleware/authMiddleware');
const { applyScopeFilter } = require('../shared/middleware/dataScopeMiddleware');

router.use(protect);

router.get('/metadata', applyScopeFilter, assetController.getMetadata);
router.get('/my', assetController.getMyAssignments);

router.get(
  '/assignments',
  authorize('manager', 'super_admin', 'sub_admin', 'hr', 'hod'),
  applyScopeFilter,
  assetController.getAssignments
);

router.post(
  '/assignments/:id/return',
  applyScopeFilter,
  assetController.returnAssignment
);

router.get(
  '/',
  authorize('manager', 'super_admin', 'sub_admin', 'hr', 'hod'),
  applyScopeFilter,
  assetController.getAssets
);

router.post(
  '/',
  authorize('manager', 'super_admin', 'sub_admin', 'hr', 'hod'),
  applyScopeFilter,
  assetController.createAsset
);

router.put(
  '/:id',
  authorize('manager', 'super_admin', 'sub_admin', 'hr', 'hod'),
  applyScopeFilter,
  assetController.updateAsset
);

router.delete(
  '/:id',
  authorize('manager', 'super_admin', 'sub_admin', 'hr', 'hod'),
  applyScopeFilter,
  assetController.deleteAsset
);

router.post(
  '/:id/assign',
  authorize('manager', 'super_admin', 'sub_admin', 'hr', 'hod'),
  applyScopeFilter,
  assetController.assignAsset
);

module.exports = router;
