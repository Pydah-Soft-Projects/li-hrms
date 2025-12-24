const express = require('express');
const router = express.Router();
const settingsController = require('./controllers/settingsController');
const { protect, authorize } = require('../authentication/middleware/authMiddleware');

// All routes require authentication
router.use(protect);

// Principal feature control routes (Super Admin only)

// Get all settings
router.get('/', settingsController.getAllSettings);

// Get single setting
router.get('/:key', settingsController.getSetting);

// Create or update setting (Super Admin, Sub Admin)
router.post('/', authorize('super_admin', 'sub_admin'), settingsController.upsertSetting);
router.put('/:key', authorize('super_admin', 'sub_admin'), settingsController.upsertSetting);

// Delete setting (Super Admin only)
router.delete('/:key', authorize('super_admin'), settingsController.deleteSetting);

module.exports = router;

