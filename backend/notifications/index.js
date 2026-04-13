const express = require('express');
const router = express.Router();
const { protect, authorize } = require('../authentication/middleware/authMiddleware');
const controller = require('./controllers/notificationController');

router.use(protect);
router.get('/', authorize('employee', 'manager', 'hod', 'hr', 'sub_admin', 'super_admin'), controller.getNotifications);
router.get('/unread-count', authorize('employee', 'manager', 'hod', 'hr', 'sub_admin', 'super_admin'), controller.getUnreadCount);
router.patch('/:id/read', authorize('employee', 'manager', 'hod', 'hr', 'sub_admin', 'super_admin'), controller.markAsRead);
router.patch('/read-all', authorize('employee', 'manager', 'hod', 'hr', 'sub_admin', 'super_admin'), controller.markAllAsRead);

module.exports = router;
