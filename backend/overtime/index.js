/**
 * Overtime Module Routes
 */

const express = require('express');
const router = express.Router();
const { protect, authorize } = require('../authentication/middleware/authMiddleware');
const {
  createOT,
  getOTRequests,
  getOTRequest,
  approveOT,
  rejectOT,
  checkConfusedShift,
  convertExtraHoursToOT
} = require('./controllers/otController');
const { getSettings, saveSettings } = require('./controllers/overtimeSettingsController');
const { applyScopeFilter } = require('../shared/middleware/dataScopeMiddleware');

// All routes require authentication
router.use(protect);

/**
 * @swagger
 * /api/overtime/settings:
 *   get:
 *     summary: Get overtime settings
 *     tags: [Overtime]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Settings retrieved
 */
router.get('/settings', getSettings);

/**
 * @swagger
 * /api/overtime/settings:
 *   post:
 *     summary: Update overtime settings
 *     tags: [Overtime]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Settings saved
 */
router.post('/settings', authorize('super_admin'), saveSettings);

/**
 * @swagger
 * /api/overtime:
 *   get:
 *     summary: Get all OT requests
 *     tags: [Overtime]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of OT requests
 */
router.get('/', getOTRequests);

/**
 * @swagger
 * /api/overtime:
 *   post:
 *     summary: Create OT request
 *     tags: [Overtime]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       201:
 *         description: OT request created
 */
router.post('/', authorize('manager', 'super_admin', 'sub_admin', 'hr', 'hod'), createOT);

/**
 * @swagger
 * /api/overtime/{id}:
 *   get:
 *     summary: Get OT request by ID
 *     tags: [Overtime]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *     responses:
 *       200:
 *         description: Request retrieved
 */
router.get('/:id', getOTRequest);

/**
 * @swagger
 * /api/overtime/check-confused/{employeeNumber}/{date}:
 *   get:
 *     summary: Check confused shift for OT
 *     tags: [Overtime]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: employeeNumber
 *         required: true
 *       - in: path
 *         name: date
 *         required: true
 *     responses:
 *       200:
 *         description: Status retrieved
 */
router.get('/check-confused/:employeeNumber/:date', checkConfusedShift);

/**
 * @swagger
 * /api/overtime/convert-from-attendance:
 *   post:
 *     summary: Convert extra hours to OT
 *     tags: [Overtime]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Hours converted
 */
router.post('/convert-from-attendance', authorize('manager', 'super_admin', 'sub_admin', 'hr'), convertExtraHoursToOT);

/**
 * @swagger
 * /api/overtime/{id}/approve:
 *   put:
 *     summary: Approve OT request
 *     tags: [Overtime]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *     responses:
 *       200:
 *         description: Approved
 */
router.put('/:id/approve', authorize('manager', 'super_admin', 'sub_admin', 'hr', 'hod'), approveOT);

/**
 * @swagger
 * /api/overtime/{id}/reject:
 *   put:
 *     summary: Reject OT request
 *     tags: [Overtime]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *     responses:
 *       200:
 *         description: Rejected
 */
router.put('/:id/reject', authorize('manager', 'super_admin', 'sub_admin', 'hr', 'hod'), rejectOT);

module.exports = router;
