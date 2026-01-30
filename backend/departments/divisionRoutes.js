const express = require('express');
const router = express.Router();
const divisionController = require('./controllers/divisionController');
const { protect, authorize } = require('../authentication/middleware/authMiddleware');

const { applyScopeFilter } = require('../shared/middleware/dataScopeMiddleware');

// All routes are protected
router.use(protect);

/**
 * @swagger
 * /api/divisions:
 *   get:
 *     summary: Get all divisions
 *     tags: [Divisions]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of divisions
 */
router.get('/', applyScopeFilter, divisionController.getDivisions);

/**
 * @swagger
 * /api/divisions/{id}:
 *   get:
 *     summary: Get single division
 *     tags: [Divisions]
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
 *         description: Division details
 */
router.get('/:id', divisionController.getDivision);

/**
 * @swagger
 * /api/divisions:
 *   post:
 *     summary: Create division
 *     tags: [Divisions]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       201:
 *         description: Created
 */
router.post('/', authorize('super_admin', 'sub_admin'), divisionController.createDivision);

router.put('/:id', authorize('super_admin', 'sub_admin'), divisionController.updateDivision);
router.delete('/:id', authorize('super_admin', 'sub_admin'), divisionController.deleteDivision);
router.post('/:id/departments', authorize('super_admin', 'sub_admin'), divisionController.linkDepartments);
router.post('/:id/shifts', authorize('super_admin', 'sub_admin'), divisionController.assignShifts);

module.exports = router;
