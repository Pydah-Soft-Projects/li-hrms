/**
 * Permissions Module Routes
 */

const express = require('express');
const router = express.Router();
const { protect, authorize } = require('../authentication/middleware/authMiddleware');
const {
  createPermission,
  getPermissions,
  getPermission,
  approvePermission,
  rejectPermission,
  getOutpass,
  getQRCode,
} = require('./controllers/permissionController');
const permissionDeductionSettingsController = require('./controllers/permissionDeductionSettingsController');

// Public route for outpass (no authentication required)
/**
 * @swagger
 * /api/permissions/outpass/{qrCode}:
 *   get:
 *     summary: Get outpass details via QR code
 *     tags: [Permissions]
 *     parameters:
 *       - in: path
 *         name: qrCode
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Outpass details retrieved
 */
router.get('/outpass/:qrCode', getOutpass);

// All other routes require authentication
router.use(protect);

/**
 * @swagger
 * /api/permissions:
 *   post:
 *     summary: Create permission request
 *     tags: [Permissions]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       201:
 *         description: Permission request created
 */
router.post('/', createPermission);

/**
 * @swagger
 * /api/permissions:
 *   get:
 *     summary: Get permission requests
 *     tags: [Permissions]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of permission requests
 */
router.get('/', getPermissions);

/**
 * @swagger
 * /api/permissions/{id}:
 *   get:
 *     summary: Get single permission request
 *     tags: [Permissions]
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
 *         description: Permission request details
 */
router.get('/:id', getPermission);

/**
 * @swagger
 * /api/permissions/{id}/qr:
 *   get:
 *     summary: Get QR code for permission
 *     tags: [Permissions]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: QR code retrieved
 */
router.get('/:id/qr', getQRCode);

router.put('/:id/approve', authorize('super_admin', 'sub_admin', 'hr', 'hod'), approvePermission);
router.put('/:id/reject', authorize('super_admin', 'sub_admin', 'hr', 'hod'), rejectPermission);

// Settings Routes
router.get('/settings/deduction', permissionDeductionSettingsController.getSettings);
router.post('/settings/deduction', authorize('super_admin', 'sub_admin'), permissionDeductionSettingsController.saveSettings);
router.put('/settings/deduction', authorize('super_admin', 'sub_admin'), permissionDeductionSettingsController.saveSettings);

module.exports = router;

