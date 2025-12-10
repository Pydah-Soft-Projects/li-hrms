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
} = require('./controllers/formSettingsController');

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

// Field management
router.post('/form-settings/groups/:groupId/fields', authorize('super_admin', 'sub_admin'), addField);
router.put('/form-settings/groups/:groupId/fields/:fieldId', authorize('super_admin', 'sub_admin'), updateField);
router.delete('/form-settings/groups/:groupId/fields/:fieldId', authorize('super_admin', 'sub_admin'), deleteField);

// ==========================================
// APPLICATION ROUTES
// ==========================================

// Create application (HR)
router.post('/', createApplication);

// Get all applications
router.get('/', getApplications);

// Get single application
router.get('/:id', getApplication);

// Approve application (Superadmin)
router.put('/:id/approve', approveApplication);

// Reject application (Superadmin)
router.put('/:id/reject', rejectApplication);

module.exports = router;


