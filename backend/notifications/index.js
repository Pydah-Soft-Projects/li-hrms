const express = require('express');
const router = express.Router();
const { protect, authorize } = require('../authentication/middleware/authMiddleware');
const controller = require('./controllers/notificationController');

router.get('/push/vapid-public', controller.getVapidPublicKey);

router.use(protect);
router.get('/', authorize('employee', 'manager', 'hod', 'hr', 'sub_admin', 'super_admin'), controller.getNotifications);
router.get('/unread-count', authorize('employee', 'manager', 'hod', 'hr', 'sub_admin', 'super_admin'), controller.getUnreadCount);
router.patch('/:id/read', authorize('employee', 'manager', 'hod', 'hr', 'sub_admin', 'super_admin'), controller.markAsRead);
router.patch('/read-all', authorize('employee', 'manager', 'hod', 'hr', 'sub_admin', 'super_admin'), controller.markAllAsRead);

router.post(
  '/push/subscribe',
  authorize('employee', 'manager', 'hod', 'hr', 'sub_admin', 'super_admin'),
  controller.subscribePush
);
router.post(
  '/push/unsubscribe',
  authorize('employee', 'manager', 'hod', 'hr', 'sub_admin', 'super_admin'),
  controller.unsubscribePush
);
router.get(
  '/push/status',
  authorize('employee', 'manager', 'hod', 'hr', 'sub_admin', 'super_admin'),
  controller.getPushSubscriptionStatus
);

module.exports = router;
