/**
 * Employee Applications Routes
 */

const express = require('express');
const router = express.Router();
const { protect, authorize } = require('../authentication/middleware/authMiddleware');
const { applyScopeFilter } = require('../shared/middleware/dataScopeMiddleware');
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
  reorderGroups,
  reorderFields,
  reorderQualificationsFields,
  updateWeekdayShiftScheduleConfig,
} = require('./controllers/formSettingsController');

const {
  resolveProfile,
  listScopeTypes,
  listProfiles,
  getProfile,
  lookupProfile,
  upsertProfile,
  deleteProfile,
  copyFromGlobal,
} = require('./controllers/qualificationProfileController');

// All routes require authentication
router.use(protect);

// ==========================================
// FORM SETTINGS ROUTES (must come before /:id routes)
// ==========================================

// Get active form settings
router.get('/form-settings', getSettings);

// Initialize default form settings
router.post('/form-settings/initialize', authorize('super_admin', 'sub_admin'), initializeSettings);

// Update form settings
router.put('/form-settings', authorize('super_admin', 'sub_admin'), updateSettings);

// Group management
router.post('/form-settings/groups', authorize('super_admin', 'sub_admin'), addGroup);
router.put('/form-settings/groups/:groupId', authorize('super_admin', 'sub_admin'), updateGroup);
router.delete('/form-settings/groups/:groupId', authorize('super_admin', 'sub_admin'), deleteGroup);
router.put('/form-settings/reorder-groups', authorize('super_admin', 'sub_admin'), reorderGroups);

// Field management
router.post('/form-settings/groups/:groupId/fields', authorize('super_admin', 'sub_admin'), addField);
router.put('/form-settings/groups/:groupId/fields/:fieldId', authorize('super_admin', 'sub_admin'), updateField);
router.delete('/form-settings/groups/:groupId/fields/:fieldId', authorize('super_admin', 'sub_admin'), deleteField);
router.put('/form-settings/groups/:groupId/reorder-fields', authorize('super_admin', 'sub_admin'), reorderFields);

// Qualifications management
router.put('/form-settings/qualifications', authorize('super_admin', 'sub_admin'), updateQualificationsConfig);
router.post('/form-settings/qualifications/fields', authorize('super_admin', 'sub_admin'), addQualificationsField);
router.put('/form-settings/qualifications/fields/:fieldId', authorize('super_admin', 'sub_admin'), updateQualificationsField);
router.delete('/form-settings/qualifications/fields/:fieldId', authorize('super_admin', 'sub_admin'), deleteQualificationsField);
router.put('/form-settings/qualifications/reorder-fields', authorize('super_admin', 'sub_admin'), reorderQualificationsFields);
router.put('/form-settings/weekday-shift-schedule', authorize('super_admin', 'sub_admin'), updateWeekdayShiftScheduleConfig);

// Qualification profiles (dept + designation)
router.get('/qualification-profiles/resolve', resolveProfile);
router.get('/qualification-profiles/scope-types', listScopeTypes);
router.get('/qualification-profiles/lookup', lookupProfile);
router.get('/qualification-profiles/copy-from-global', authorize('super_admin', 'sub_admin'), copyFromGlobal);
router.post('/qualification-profiles/copy-from-global', authorize('super_admin', 'sub_admin'), copyFromGlobal);
router.get('/qualification-profiles', authorize('super_admin', 'sub_admin'), listProfiles);
router.get('/qualification-profiles/:id', authorize('super_admin', 'sub_admin'), getProfile);
router.post('/qualification-profiles', authorize('super_admin', 'sub_admin'), upsertProfile);
router.delete('/qualification-profiles/:id', authorize('super_admin', 'sub_admin'), deleteProfile);

// ==========================================
// APPLICATION ROUTES
// ==========================================

const multer = require('multer');
const upload = multer({ storage: multer.memoryStorage() });

// Create application (HR) - handle file uploads
router.post('/', upload.any(), createApplication);

// Create rejoin application for left employee (HR)
router.post('/rejoin', authorize('super_admin', 'sub_admin', 'hr', 'manager'), require('./controllers/employeeApplicationController').createRejoinApplication);

// Bulk approve applications (Superadmin)
router.put('/bulk-approve', authorize('super_admin'), bulkApproveApplications);

// Bulk reject applications (Superadmin)
router.put('/bulk-reject', authorize('super_admin'), bulkRejectApplications);

// Bulk create applications (HR/Admin)
router.post('/bulk', authorize('super_admin', 'sub_admin', 'hr'), bulkCreateApplications);

// Update application (HR/Admin) - handle file uploads
router.put('/:id', upload.any(), require('./controllers/employeeApplicationController').updateApplication);

// Get all applications (with data scope / division mapping)
router.get('/', applyScopeFilter, getApplications);

// Get single application
router.get('/:id', getApplication);

// Verify application (HR/Manager) - Stage 2: Create Employee
router.put('/:id/verify', authorize('super_admin', 'sub_admin', 'hr', 'manager'), require('./controllers/employeeApplicationController').verifyApplication);

// Approve salary (Superadmin) - Stage 3: Finalize Salary
router.put('/:id/approve-salary', authorize('super_admin'), require('./controllers/employeeApplicationController').approveSalary);

// Reject application (Superadmin)
router.put('/:id/reject', authorize('super_admin'), rejectApplication);

module.exports = router;


