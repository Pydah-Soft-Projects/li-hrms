const express = require('express');
const router = express.Router();
const leaveController = require('./controllers/leaveController');
const odController = require('./controllers/odController');
const settingsController = require('./controllers/leaveSettingsController');
const { protect, authorize } = require('../authentication/middleware/authMiddleware');
const { applyScopeFilter } = require('../shared/middleware/dataScopeMiddleware');

// All routes require authentication
router.use(protect);

/**
 * @swagger
 * /api/leaves/my:
 *   get:
 *     summary: Get leaves of the current user
 *     tags: [Leaves]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *       - in: query
 *         name: fromDate
 *         schema:
 *           type: string
 *           format: date
 *       - in: query
 *         name: toDate
 *         schema:
 *           type: string
 *           format: date
 *     responses:
 *       200:
 *         description: List of my leaves
 */
router.get('/my', leaveController.getMyLeaves);

/**
 * @swagger
 * /api/leaves:
 *   get:
 *     summary: Get all leaves (filtered)
 *     tags: [Leaves]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *       - in: query
 *         name: employeeId
 *         schema:
 *           type: string
 *       - in: query
 *         name: department
 *         schema:
 *           type: string
 *       - in: query
 *         name: fromDate
 *         schema:
 *           type: string
 *           format: date
 *       - in: query
 *         name: toDate
 *         schema:
 *           type: string
 *           format: date
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: List of leaves
 */
router.get('/', authorize('manager', 'hod', 'hr', 'sub_admin', 'super_admin'), applyScopeFilter, leaveController.getLeaves);

/**
 * @swagger
 * /api/leaves:
 *   post:
 *     summary: Apply for leave
 *     tags: [Leaves]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - leaveType
 *               - fromDate
 *               - toDate
 *               - purpose
 *             properties:
 *               leaveType:
 *                 type: string
 *               fromDate:
 *                 type: string
 *                 format: date
 *               toDate:
 *                 type: string
 *                 format: date
 *               purpose:
 *                 type: string
 *               contactNumber:
 *                 type: string
 *               emergencyContact:
 *                 type: string
 *               addressDuringLeave:
 *                 type: string
 *               isHalfDay:
 *                 type: boolean
 *               halfDayType:
 *                 type: string
 *               remarks:
 *                 type: string
 *               empNo:
 *                 type: string
 *     responses:
 *       201:
 *         description: Created
 */
router.post('/', leaveController.applyLeave);

/**
 * @swagger
 * /api/leaves/stats:
 *   get:
 *     summary: Get leave stats
 *     tags: [Leaves]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: employeeId
 *         schema:
 *           type: string
 *       - in: query
 *         name: department
 *         schema:
 *           type: string
 *       - in: query
 *         name: year
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Stats retrieved
 */
router.get('/stats', leaveController.getLeaveStats);

/**
 * @swagger
 * /api/leaves/pending-approvals:
 *   get:
 *     summary: Get pending approvals
 *     tags: [Leaves]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Pending approvals
 */
router.get('/pending-approvals', leaveController.getPendingApprovals);

/**
 * @swagger
 * /api/leaves/approved-records:
 *   get:
 *     summary: Get approved records
 *     tags: [Leaves]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: employeeId
 *         schema:
 *           type: string
 *       - in: query
 *         name: employeeNumber
 *         schema:
 *           type: string
 *       - in: query
 *         name: date
 *         required: true
 *         schema:
 *           type: string
 *           format: date
 *     responses:
 *       200:
 *         description: Approved records
 */
router.get('/approved-records', leaveController.getApprovedRecordsForDate);

/**
 * @swagger
 * /api/leaves/conflicts:
 *   get:
 *     summary: Get leave conflicts
 *     tags: [Leaves]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: employeeNumber
 *         required: true
 *       - in: query
 *         name: date
 *         required: true
 *     responses:
 *       200:
 *         description: Conflicts
 */
router.get('/conflicts', leaveController.getLeaveConflicts);

/**
 * @swagger
 * /api/leaves/{id}:
 *   get:
 *     summary: Get single leave
 *     tags: [Leaves]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *     responses:
 *       200:
 *         description: Leave details
 */
router.get('/:id', leaveController.getLeave);

/**
 * @swagger
 * /api/leaves/{id}:
 *   put:
 *     summary: Update leave
 *     tags: [Leaves]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               leaveType:
 *                 type: string
 *               fromDate:
 *                 type: string
 *               toDate:
 *                 type: string
 *               purpose:
 *                 type: string
 *               status:
 *                 type: string
 *     responses:
 *       200:
 *         description: Updated
 */
router.put('/:id', leaveController.updateLeave);

/**
 * @swagger
 * /api/leaves/{id}/cancel:
 *   put:
 *     summary: Cancel leave
 *     tags: [Leaves]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *     requestBody:
 *       required: false
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               reason:
 *                 type: string
 *     responses:
 *       200:
 *         description: Cancelled
 */
router.put('/:id/cancel', leaveController.cancelLeave);

/**
 * @swagger
 * /api/leaves/{id}/action:
 *   put:
 *     summary: Process leave action (approve/reject/forward)
 *     tags: [Leaves]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - action
 *             properties:
 *               action:
 *                 type: string
 *                 enum: [approve, reject, forward]
 *               comments:
 *                 type: string
 *     responses:
 *       200:
 *         description: Action processed
 */
router.put('/:id/action', authorize('hod', 'hr', 'sub_admin', 'super_admin', 'manager'), leaveController.processLeaveAction);

/**
 * @swagger
 * /api/leaves/{id}/revoke:
 *   put:
 *     summary: Revoke leave approval
 *     tags: [Leaves]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *     requestBody:
 *       required: false
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               reason:
 *                 type: string
 *     responses:
 *       200:
 *         description: Revoked
 */
router.put('/:id/revoke', authorize('hod', 'hr', 'sub_admin', 'super_admin'), leaveController.revokeLeaveApproval);

/**
 * @swagger
 * /api/leaves/{id}:
 *   delete:
 *     summary: Delete leave
 *     tags: [Leaves]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *     responses:
 *       200:
 *         description: Deleted
 */
router.delete('/:id', authorize('sub_admin', 'super_admin'), leaveController.deleteLeave);

// OD (ON DUTY) ROUTES
/**
 * @swagger
 * /api/leaves/od/my:
 *   get:
 *     summary: Get my ODs
 *     tags: [OD]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List retrieved
 */
router.get('/od/my', odController.getMyODs);

/**
 * @swagger
 * /api/leaves/od/pending-approvals:
 *   get:
 *     summary: Get pending OD approvals
 *     tags: [OD]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List retrieved
 */
router.get('/od/pending-approvals', authorize('hod', 'hr', 'manager', 'sub_admin', 'super_admin'), odController.getPendingApprovals);

/**
 * @swagger
 * /api/leaves/od:
 *   get:
 *     summary: Get all ODs
 *     tags: [OD]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List retrieved
 */
router.get('/od', authorize('hod', 'hr', 'manager', 'sub_admin', 'super_admin'), odController.getODs);

/**
 * @swagger
 * /api/leaves/od:
 *   post:
 *     summary: Apply for OD
 *     tags: [OD]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       201:
 *         description: Created
 */
router.post('/od', odController.applyOD);

module.exports = router;

