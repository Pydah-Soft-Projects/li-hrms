const express = require('express');
const router = express.Router();
const departmentController = require('./controllers/departmentController');
const designationController = require('./controllers/designationController');
const departmentSettingsController = require('./controllers/departmentSettingsController');
const { protect, authorize } = require('../authentication/middleware/authMiddleware');
const { applyScopeFilter } = require('../shared/middleware/dataScopeMiddleware');

// All routes are protected
router.use(protect);

/**
 * @swagger
 * /api/departments:
 *   get:
 *     summary: Get all departments
 *     tags: [Departments]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: isActive
 *         schema:
 *           type: boolean
 *     responses:
 *       200:
 *         description: List of departments
 */
router.get('/', applyScopeFilter, departmentController.getAllDepartments);

// ============== Global Designation Routes ==============

/**
 * @swagger
 * /api/departments/designations:
 *   get:
 *     summary: Get all designations
 *     tags: [Designations]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of designations
 */
router.get('/designations', designationController.getAllDesignations);

/**
 * @swagger
 * /api/departments/designations:
 *   post:
 *     summary: Create global designation
 *     tags: [Designations]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       201:
 *         description: Created
 */
router.post('/designations', authorize('manager', 'super_admin', 'sub_admin', 'hr'), designationController.createGlobalDesignation);

router.get('/designations/:id', designationController.getDesignation);
router.put('/designations/:id', authorize('manager', 'super_admin', 'sub_admin', 'hr'), designationController.updateDesignation);
router.put('/designations/:id/shifts', authorize('manager', 'super_admin', 'sub_admin', 'hr'), designationController.assignShifts);
router.delete('/designations/:id', authorize('super_admin', 'sub_admin'), designationController.deleteDesignation);

/**
 * @swagger
 * /api/departments/{id}:
 *   get:
 *     summary: Get single department
 *     tags: [Departments]
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
 *         description: Department details
 */
router.get('/:id', departmentController.getDepartment);

/**
 * @swagger
 * /api/departments/{id}/employees:
 *   get:
 *     summary: Get department employees
 *     tags: [Departments]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *     responses:
 *       200:
 *         description: List of employees
 */
router.get('/:id/employees', departmentController.getDepartmentEmployees);

/**
 * @swagger
 * /api/departments/{id}/configuration:
 *   get:
 *     summary: Get department configuration
 *     tags: [Departments]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *     responses:
 *       200:
 *         description: Configuration data
 */
router.get('/:id/configuration', departmentController.getDepartmentConfiguration);

/**
 * @swagger
 * /api/departments:
 *   post:
 *     summary: Create department
 *     tags: [Departments]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - name
 *             properties:
 *               name:
 *                 type: string
 *               code:
 *                 type: string
 *               description:
 *                 type: string
 *               divisionHODs:
 *                 type: array
 *                 items:
 *                   type: object
 *                   properties:
 *                     division:
 *                       type: string
 *                     hod:
 *                       type: string
 *     responses:
 *       201:
 *         description: Created
 */
router.post('/', authorize('manager', 'super_admin', 'sub_admin', 'hr'), departmentController.createDepartment);

/**
 * @swagger
 * /api/departments/{id}:
 *   put:
 *     summary: Update department
 *     tags: [Departments]
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
 *               name:
 *                 type: string
 *               code:
 *                 type: string
 *               description:
 *                 type: string
 *               divisionHODs:
 *                 type: array
 *               hr:
 *                 type: string
 *               shifts:
 *                 type: array
 *               paidLeaves:
 *                 type: integer
 *               isActive:
 *                 type: boolean
 *     responses:
 *       200:
 *         description: Department updated
 */
router.put('/:id', authorize('manager', 'super_admin', 'sub_admin', 'hr'), departmentController.updateDepartment);
/**
 * @swagger
 * /api/departments/{id}/configuration:
 *   put:
 *     summary: Update department configuration
 *     tags: [Departments]
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
 *               attendanceConfig:
 *                 type: object
 *               permissionPolicy:
 *                 type: object
 *               autoDeductionRules:
 *                 type: object
 *               leaveLimits:
 *                 type: object
 *               paidLeaves:
 *                 type: integer
 *     responses:
 *       200:
 *         description: Configuration updated
 */
router.put('/:id/configuration', authorize('manager', 'super_admin', 'sub_admin', 'hr'), departmentController.updateDepartmentConfiguration);
/**
 * @swagger
 * /api/departments/{id}/assign-hod:
 *   put:
 *     summary: Assign HOD (Division)
 *     tags: [Departments]
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
 *               - hodId
 *               - divisionId
 *             properties:
 *               hodId:
 *                 type: string
 *               divisionId:
 *                 type: string
 *     responses:
 *       200:
 *         description: HOD assigned
 */
router.put('/:id/assign-hod', authorize('manager', 'super_admin', 'sub_admin', 'hr'), departmentController.assignHOD);
/**
 * @swagger
 * /api/departments/{id}/assign-hr:
 *   put:
 *     summary: Assign HR
 *     tags: [Departments]
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
 *               - hrId
 *             properties:
 *               hrId:
 *                 type: string
 *     responses:
 *       200:
 *         description: HR assigned
 */
router.put('/:id/assign-hr', authorize('super_admin', 'sub_admin'), departmentController.assignHR);
/**
 * @swagger
 * /api/departments/{id}/shifts:
 *   put:
 *     summary: Assign shifts
 *     tags: [Departments]
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
 *               shifts:
 *                 type: array
 *     responses:
 *       200:
 *         description: Shifts assigned
 */
router.put('/:id/shifts', authorize('manager', 'super_admin', 'sub_admin', 'hr'), departmentController.assignShifts);
/**
 * @swagger
 * /api/departments/{id}/paid-leaves:
 *   put:
 *     summary: Update paid leaves
 *     tags: [Departments]
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
 *               paidLeaves:
 *                 type: integer
 *     responses:
 *       200:
 *         description: Paid leaves updated
 */
router.put('/:id/paid-leaves', authorize('manager', 'super_admin', 'sub_admin', 'hr'), departmentController.updatePaidLeaves);
/**
 * @swagger
 * /api/departments/{id}/leave-limits:
 *   put:
 *     summary: Update leave limits
 *     tags: [Departments]
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
 *               dailyLimit:
 *                 type: integer
 *               monthlyLimit:
 *                 type: integer
 *     responses:
 *       200:
 *         description: Limits updated
 */
router.put('/:id/leave-limits', authorize('manager', 'super_admin', 'sub_admin', 'hr'), departmentController.updateLeaveLimits);

/**
 * @swagger
 * /api/departments/{id}:
 *   delete:
 *     summary: Delete department
 *     tags: [Departments]
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
 *         description: Deleted
 */
router.delete('/:id', authorize('super_admin', 'sub_admin'), departmentController.deleteDepartment);

// ============== Department-Specific Designation Routes (Backward Compatible) ==============

router.get('/:departmentId/designations', designationController.getDesignationsByDepartment);
router.post('/:departmentId/designations/link', authorize('manager', 'super_admin', 'sub_admin', 'hr'), designationController.linkDesignation);
router.post('/:departmentId/designations', authorize('manager', 'super_admin', 'sub_admin', 'hr'), designationController.createDesignation);

// Department Settings routes
router.get('/:deptId/settings', departmentSettingsController.getDepartmentSettings);
router.get('/:deptId/settings/resolved', departmentSettingsController.getResolvedSettings);
router.put('/:deptId/settings', departmentSettingsController.updateDepartmentSettings);

module.exports = router;


