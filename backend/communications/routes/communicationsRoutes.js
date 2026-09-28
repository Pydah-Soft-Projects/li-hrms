const express = require('express');
const router = express.Router();
const communicationsController = require('../controllers/communicationsController');
const { protect, authorize } = require('../../authentication/middleware/authMiddleware');

// All communications routes require authentication
router.use(protect);

// Send broadcast message (SMS / Popup Notification)
router.post('/send', authorize('super_admin', 'sub_admin', 'hr', 'hod', 'manager'), communicationsController.sendBroadcast);

// SMS Templates management
router.get('/templates', communicationsController.getTemplates);
router.post('/templates', authorize('super_admin', 'sub_admin', 'hr'), communicationsController.createTemplate);
router.put('/templates/:id', authorize('super_admin', 'sub_admin', 'hr'), communicationsController.updateTemplate);
router.delete('/templates/:id', authorize('super_admin', 'sub_admin', 'hr'), communicationsController.deleteTemplate);

// Communication reports & analytics
router.get('/reports', communicationsController.getReports);
router.get('/stats', communicationsController.getStats);

module.exports = router;
