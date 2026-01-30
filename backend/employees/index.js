const express = require('express');
const router = express.Router();
const employeeController = require('./controllers/employeeController');
const { protect, authorize } = require('../authentication/middleware/authMiddleware');
const { applyScopeFilter } = require('../shared/middleware/dataScopeMiddleware');
const multer = require('multer');
const upload = multer({ storage: multer.memoryStorage() });

// All routes are protected
router.use(protect);

/**
 * @swagger
 * /api/employees/settings:
 *   get:
 *     summary: Get employee settings
 *     tags: [Employees]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Employee settings retrieved
 */
router.get('/settings', employeeController.getSettings);

/**
 * @swagger
 * /api/employees/components/defaults:
 *   get:
 *     summary: Get allowance/deduction defaults
 *     tags: [Employees]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Default components retrieved
 */
router.get('/components/defaults', employeeController.getAllowanceDeductionDefaults);

/**
 * @swagger
 * /api/employees/count:
 *   get:
 *     summary: Get employee count
 *     tags: [Employees]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Count retrieved
 */
router.get('/count', applyScopeFilter, employeeController.getEmployeeCount);

/**
 * @swagger
 * /api/employees:
 *   get:
 *     summary: Get all employees
 *     tags: [Employees]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *       - in: query
 *         name: search
 *         schema:
 *           type: string
 *       - in: query
 *         name: is_active
 *         schema:
 *           type: boolean
 *       - in: query
 *         name: division_id
 *         schema:
 *           type: string
 *       - in: query
 *         name: department_id
 *         schema:
 *           type: string
 *       - in: query
 *         name: designation_id
 *         schema:
 *           type: string
 *       - in: query
 *         name: includeLeft
 *         schema:
 *           type: boolean
 *     responses:
 *       200:
 *         description: List of employees
 */
router.get('/', applyScopeFilter, employeeController.getAllEmployees);

/**
 * @swagger
 * /api/employees/{empNo}:
 *   get:
 *     summary: Get single employee
 *     tags: [Employees]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: empNo
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Employee details
 *       404:
 *         description: Not found
 */
router.get('/:empNo', employeeController.getEmployee);

/**
 * @swagger
 * /api/employees:
 *   post:
 *     summary: Create employee
 *     tags: [Employees]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               emp_no:
 *                 type: string
 *               employee_name:
 *                 type: string
 *               division_id:
 *                 type: string
 *               department_id:
 *                 type: string
 *               designation_id:
 *                 type: string
 *               email:
 *                 type: string
 *               phone_number:
 *                 type: string
 *               doj:
 *                 type: string
 *                 format: date
 *     responses:
 *       201:
 *         description: Created
 */
router.post('/', authorize('manager', 'super_admin', 'sub_admin', 'hr'), upload.any(), employeeController.createEmployee);

/**
 * @swagger
 * /api/employees/{empNo}/resend-credentials:
 *   post:
 *     summary: Resend employee credentials
 *     tags: [Employees]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: empNo
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: false
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               passwordMode:
 *                 type: string
 *               notificationChannels:
 *                 type: object
 *     responses:
 *       200:
 *         description: Credentials resent
 */
router.post('/:empNo/resend-credentials', authorize('super_admin'), employeeController.resendEmployeePassword);

/**
 * @swagger
 * /api/employees/bulk-export-passwords:
 *   post:
 *     summary: Bulk export employee passwords
 *     tags: [Employees]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: false
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               empNos:
 *                 type: array
 *                 items:
 *                   type: string
 *               passwordMode:
 *                 type: string
 *     responses:
 *       200:
 *         description: Passwords exported
 */
router.post('/bulk-export-passwords', authorize('super_admin'), employeeController.bulkExportEmployeePasswords);

/**
 * @swagger
 * /api/employees/{empNo}:
 *   put:
 *     summary: Update employee
 *     tags: [Employees]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: empNo
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               employee_name:
 *                 type: string
 *               division_id:
 *                 type: string
 *               department_id:
 *                 type: string
 *               designation_id:
 *                 type: string
 *     responses:
 *       200:
 *         description: Updated
 */
router.put('/:empNo', authorize('manager', 'super_admin', 'sub_admin', 'hr'), upload.any(), employeeController.updateEmployee);

/**
 * @swagger
 * /api/employees/{empNo}/left-date:
 *   put:
 *     summary: Set employee left date
 *     tags: [Employees]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: empNo
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               leftDate:
 *                 type: string
 *                 format: date
 *               leftReason:
 *                 type: string
 *     responses:
 *       200:
 *         description: Left date set
 */
router.put('/:empNo/left-date', authorize('manager', 'super_admin', 'sub_admin', 'hr'), employeeController.setLeftDate);

/**
 * @swagger
 * /api/employees/{empNo}/left-date:
 *   delete:
 *     summary: Remove employee left date
 *     tags: [Employees]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: empNo
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Left date removed
 */
router.delete('/:empNo/left-date', authorize('manager', 'super_admin', 'sub_admin', 'hr'), employeeController.removeLeftDate);

/**
 * @swagger
 * /api/employees/{empNo}:
 *   delete:
 *     summary: Delete employee
 *     tags: [Employees]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: empNo
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Deleted
 */
router.delete('/:empNo', authorize('super_admin', 'sub_admin'), employeeController.deleteEmployee);

module.exports = router;
