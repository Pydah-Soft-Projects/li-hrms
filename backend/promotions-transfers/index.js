const express = require('express');
const router = express.Router();
const { protect, authorize } = require('../authentication/middleware/authMiddleware');
const { applyScopeFilter } = require('../shared/middleware/dataScopeMiddleware');
const settingsController = require('./controllers/promotionTransferSettingsController');
const ptController = require('./controllers/promotionTransferController');

router.use(protect);
router.use(applyScopeFilter);

router.get('/settings', settingsController.getSettings);
router.post('/settings', authorize('super_admin'), settingsController.saveSettings);

router.get('/payroll-months', ptController.getPayrollMonths);

router.get(
  '/pending-approvals',
  authorize('manager', 'hod', 'hr', 'sub_admin', 'super_admin'),
  ptController.getPendingApprovals
);

router.post(
  '/',
  authorize('employee', 'manager', 'hod', 'hr', 'sub_admin', 'super_admin'),
  ptController.createRequest
);

router.put('/:id/cancel', ptController.cancelRequest);
router.delete(
  '/:id',
  authorize('super_admin', 'sub_admin'),
  ptController.deleteRequest
);
router.put(
  '/:id/action',
  authorize('manager', 'hod', 'hr', 'sub_admin', 'super_admin'),
  ptController.approveOrReject
);

router.put('/:id', authorize('super_admin'), ptController.updateRequestBySuperAdmin);

router.get('/:id', ptController.getRequestById);
router.get('/', ptController.getRequests);

module.exports = router;
