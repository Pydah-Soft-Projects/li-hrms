/**
 * Employee Applications Routes
 */

const express = require('express');
const router = express.Router();
const { protect, authorize } = require('../authentication/middleware/authMiddleware');
const {
  createApplication,
  getApplications,
  getApplication,
  approveApplication,
  rejectApplication,
  bulkApproveApplications,
  bulkCreateApplications,
  bulkRejectApplications,
} = require('./controllers/employeeApplicationController');

const {
  getSettings,
  initializeSettings,
  updateSettings,
  addGroup,
  updateGroup,
  deleteGroup,
  addField,
  updateField,
  deleteField,
  updateQualificationsConfig,
  addQualificationsField,
  updateQualificationsField,
  deleteQualificationsField,
} = require('./controllers/formSettingsController');

// All routes require authentication
router.use(protect);

/**
 * @swagger
 * /api/employee-applications/form-settings:
 *   get:
 *     summary: Get active form settings for employee applications
 *     tags: [EmployeeApplications]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Form settings retrieved
 */
router.get('/form-settings', getSettings);

router.post('/form-settings/initialize', authorize('super_admin', 'sub_admin'), initializeSettings);
router.put('/form-settings', authorize('super_admin', 'sub_admin'), updateSettings);

// Group management
router.post('/form-settings/groups', authorize('super_admin', 'sub_admin'), addGroup);
router.put('/form-settings/groups/:groupId', authorize('super_admin', 'sub_admin'), updateGroup);
router.delete('/form-settings/groups/:groupId', authorize('super_admin', 'sub_admin'), deleteGroup);

// Field management
router.post('/form-settings/groups/:groupId/fields', authorize('super_admin', 'sub_admin'), addField);
router.put('/form-settings/groups/:groupId/fields/:fieldId', authorize('super_admin', 'sub_admin'), updateField);
router.delete('/form-settings/groups/:groupId/fields/:fieldId', authorize('super_admin', 'sub_admin'), deleteField);

// Qualifications management
router.put('/form-settings/qualifications', authorize('super_admin', 'sub_admin'), updateQualificationsConfig);
router.post('/form-settings/qualifications/fields', authorize('super_admin', 'sub_admin'), addQualificationsField);
router.put('/form-settings/qualifications/fields/:fieldId', authorize('super_admin', 'sub_admin'), updateQualificationsField);
router.delete('/form-settings/qualifications/fields/:fieldId', authorize('super_admin', 'sub_admin'), deleteQualificationsField);

// ==========================================
// APPLICATION ROUTES
// ==========================================

const multer = require('multer');
const upload = multer({ storage: multer.memoryStorage() });

/**
 * @swagger
 * /api/employee-applications:
 *   post:
 *     summary: Create a new employee application
 *     tags: [EmployeeApplications]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       201:
 *         description: Application created
 */
router.post('/', upload.any(), createApplication);

router.put('/bulk-approve', authorize('super_admin', 'sub_admin'), bulkApproveApplications);
router.put('/bulk-reject', authorize('super_admin', 'sub_admin'), bulkRejectApplications);
router.post('/bulk', authorize('super_admin', 'sub_admin', 'hr'), bulkCreateApplications);

router.put('/:id', upload.any(), require('./controllers/employeeApplicationController').updateApplication);

/**
 * @swagger
 * /api/employee-applications:
 *   get:
 *     summary: Get all employee applications
 *     tags: [EmployeeApplications]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of applications retrieved
 */
router.get('/', getApplications);

/**
 * @swagger
 * /api/employee-applications/{id}:
 *   get:
 *     summary: Get single application details
 *     tags: [EmployeeApplications]
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
 *         description: Application details retrieved
 */
router.get('/:id', getApplication);

router.put('/:id/approve', authorize('super_admin', 'sub_admin'), approveApplication);
router.put('/:id/reject', authorize('super_admin', 'sub_admin'), rejectApplication);

module.exports = router;


