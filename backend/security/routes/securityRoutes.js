const express = require('express');
const router = express.Router();
const { protect, authorize } = require('../../authentication/middleware/authMiddleware');
const {
    getTodayPermissions,
    generateGateOutQR,
    generateGateInQR,
    verifyGatePass
} = require('../controllers/securityController');

// All routes are protected
router.use(protect);

// Security Dashboard Routes (Super Admin & Security roles)
/**
 * @swagger
 * /api/security/permissions/today:
 *   get:
 *     summary: Get all permissions for today (Security view)
 *     tags: [Security]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of today's permissions retrieved
 */
router.get('/permissions/today', authorize('super_admin', 'sub_admin', 'security'), getTodayPermissions);

/**
 * @swagger
 * /api/security/verify:
 *   post:
 *     summary: Verify a gate pass
 *     tags: [Security]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Gate pass verification result
 */
router.post('/verify', authorize('super_admin', 'sub_admin', 'security'), verifyGatePass);

/**
 * @swagger
 * /api/security/gate-pass/out/{id}:
 *   post:
 *     summary: Generate gate-out QR code
 *     tags: [Security]
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
 *         description: QR code generated
 */
router.post('/gate-pass/out/:id', generateGateOutQR);

router.post('/gate-pass/in/:id', generateGateInQR);

module.exports = router;
