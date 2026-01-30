const express = require('express');
const router = express.Router();
const arrearsController = require('./controllers/arrearsController');
const { protect, authorize } = require('../authentication/middleware/authMiddleware');

// All routes require authentication
router.use(protect);

/**
 * @swagger
 * /api/arrears/my:
 *   get:
 *     summary: Get arrears requests of the current user
 *     tags: [Arrears]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of my arrears
 */
router.get('/my', arrearsController.getMyArrears);

/**
 * @swagger
 * /api/arrears/pending-approvals:
 *   get:
 *     summary: Get pending arrears approvals
 *     tags: [Arrears]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of pending approvals
 */
router.get('/pending-approvals', authorize('hod', 'hr', 'sub_admin', 'super_admin'), arrearsController.getPendingApprovals);

/**
 * @swagger
 * /api/arrears/stats/summary:
 *   get:
 *     summary: Get arrears statistics summary
 *     tags: [Arrears]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Stats retrieved
 */
router.get('/stats/summary', arrearsController.getArrearsStats);

/**
 * @swagger
 * /api/arrears:
 *   post:
 *     summary: Create a new arrears request
 *     tags: [Arrears]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       201:
 *         description: Arrears request created
 */
router.post('/', authorize('hr', 'sub_admin', 'super_admin'), arrearsController.createArrears);

/**
 * @swagger
 * /api/arrears:
 *   get:
 *     summary: Get all arrears requests
 *     tags: [Arrears]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List retrieved
 */
router.get('/', authorize('hod', 'hr', 'sub_admin', 'super_admin'), arrearsController.getArrears);

/**
 * @swagger
 * /api/arrears/{id}:
 *   get:
 *     summary: Get arrears request by ID
 *     tags: [Arrears]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *     responses:
 *       200:
 *         description: Arrears retrieved
 */
router.get('/:id', arrearsController.getArrearsById);

/**
 * @swagger
 * /api/arrears/{id}/action:
 *   put:
 *     summary: Process action on arrears request
 *     tags: [Arrears]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *     responses:
 *       200:
 *         description: Action processed
 */
router.put('/:id/action', authorize('hod', 'hr', 'sub_admin', 'super_admin'), arrearsController.processArrearsAction);

/**
 * @swagger
 * /api/arrears/{id}/settle:
 *   post:
 *     summary: Settle an arrears request
 *     tags: [Arrears]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *     responses:
 *       200:
 *         description: Arrears settled
 */
router.post('/:id/settle', authorize('hr', 'sub_admin', 'super_admin'), arrearsController.processSettlement);

module.exports = router;
