const express = require('express');
const router = express.Router();
const settingsController = require('./controllers/settingsController');
const { protect, authorize } = require('../authentication/middleware/authMiddleware');

// All routes require authentication
router.use(protect);

/**
 * @swagger
 * /api/settings:
 *   get:
 *     summary: Get all system settings
 *     tags: [Settings]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of settings retrieved
 */
router.get('/', settingsController.getAllSettings);

/**
 * @swagger
 * /api/settings/{key}:
 *   get:
 *     summary: Get single setting by key
 *     tags: [Settings]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: key
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Setting value retrieved
 */
router.get('/:key', settingsController.getSetting);

/**
 * @swagger
 * /api/settings:
 *   post:
 *     summary: Create or update a setting
 *     tags: [Settings]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Setting saved
 */
router.post('/', authorize('manager', 'super_admin', 'sub_admin'), settingsController.upsertSetting);

router.put('/:key', authorize('manager', 'super_admin', 'sub_admin'), settingsController.upsertSetting);
router.delete('/:key', authorize('super_admin'), settingsController.deleteSetting);

module.exports = router;

