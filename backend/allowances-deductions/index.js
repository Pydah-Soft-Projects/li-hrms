const express = require('express');
const router = express.Router();
const allowanceDeductionController = require('./controllers/allowanceDeductionController');
const { protect, authorize } = require('../authentication/middleware/authMiddleware');

// All routes are protected
router.use(protect);

/**
 * @swagger
 * /api/allowances-deductions:
 *   get:
 *     summary: Get all allowances and deductions
 *     tags: [AllowancesDeductions]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of items retrieved
 */
router.get('/', allowanceDeductionController.getAllAllowancesDeductions);

/**
 * @swagger
 * /api/allowances-deductions/allowances:
 *   get:
 *     summary: Get only allowances
 *     tags: [AllowancesDeductions]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of allowances
 */
router.get('/allowances', allowanceDeductionController.getAllowances);

/**
 * @swagger
 * /api/allowances-deductions/deductions:
 *   get:
 *     summary: Get only deductions
 *     tags: [AllowancesDeductions]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of deductions
 */
router.get('/deductions', allowanceDeductionController.getDeductions);

/**
 * @swagger
 * /api/allowances-deductions/template:
 *   get:
 *     summary: Download bulk update template
 *     tags: [AllowancesDeductions]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Excel template file
 */
router.get('/template', allowanceDeductionController.downloadTemplate);

const multer = require('multer');
const upload = multer();

/**
 * @swagger
 * /api/allowances-deductions/bulk-update:
 *   post:
 *     summary: Bulk update allowances and deductions via Excel
 *     tags: [AllowancesDeductions]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Update successful
 */
router.post('/bulk-update', authorize('super_admin'), upload.single('file'), allowanceDeductionController.bulkUpdateAllowancesDeductions);

router.get('/:id', allowanceDeductionController.getAllowanceDeduction);
router.get('/:id/resolved/:deptId', allowanceDeductionController.getResolvedRule);

/**
 * @swagger
 * /api/allowances-deductions:
 *   post:
 *     summary: Create new allowance or deduction
 *     tags: [AllowancesDeductions]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       201:
 *         description: Item created
 */
router.post('/', authorize('super_admin', 'sub_admin', 'hr'), allowanceDeductionController.createAllowanceDeduction);

router.put('/:id', authorize('super_admin', 'sub_admin', 'hr'), allowanceDeductionController.updateAllowanceDeduction);
router.put('/:id/department-rule', authorize('super_admin', 'sub_admin', 'hr'), allowanceDeductionController.addOrUpdateDepartmentRule);
router.delete('/:id/department-rule/:deptId', authorize('super_admin', 'sub_admin', 'hr'), allowanceDeductionController.removeDepartmentRule);

/**
 * @swagger
 * /api/allowances-deductions/{id}:
 *   delete:
 *     summary: Delete allowance or deduction
 *     tags: [AllowancesDeductions]
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
 *         description: Deleted successfuly
 */
router.delete('/:id', authorize('super_admin', 'sub_admin'), allowanceDeductionController.deleteAllowanceDeduction);

module.exports = router;

