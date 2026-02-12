const express = require('express');
const router = express.Router();
const userController = require('./controllers/userController');
const { protect, authorize } = require('../authentication/middleware/authMiddleware');
const { applyMetadataScopeFilter } = require('../shared/middleware/dataScopeMiddleware');

// All routes are protected
router.use(protect);

// ==========================================
// STATS & UTILITY ROUTES (before :id routes)
// ==========================================

// Get user statistics
router.get('/stats', authorize('super_admin', 'sub_admin'), userController.getUserStats);

// Get employees without user accounts
router.get(
  '/employees-without-account',
  authorize('manager', 'super_admin', 'sub_admin', 'hr'),
  userController.getEmployeesWithoutAccount
);

// Update own profile (any authenticated user)
router.put('/profile', userController.updateProfile);

// ==========================================
// USER CREATION ROUTES
// ==========================================

// Create new user (manual)
router.post('/register', authorize('manager', 'super_admin', 'sub_admin', 'hr'), userController.registerUser);

// Create user from existing employee
router.post(
  '/from-employee',
  authorize('manager', 'super_admin', 'sub_admin', 'hr'),
  userController.createUserFromEmployee
);

// ==========================================
// USER LIST & SINGLE USER ROUTES
// ==========================================

// Get all users
router.get('/', authorize('manager', 'super_admin', 'sub_admin', 'hr'), applyMetadataScopeFilter('User'), userController.getAllUsers);


// Get single user
router.get('/:id', userController.getUser);

// ==========================================
// USER UPDATE ROUTES
// ==========================================

// Update user
router.put('/:id', authorize('manager', 'super_admin', 'sub_admin', 'hr'), userController.updateUser);

// Reset user password
router.put('/:id/reset-password', authorize('super_admin', 'sub_admin'), userController.resetPassword);

// Toggle user active status
router.put('/:id/toggle-status', authorize('super_admin', 'sub_admin'), userController.toggleUserStatus);

// ==========================================
// USER DELETE ROUTE
// ==========================================

// Delete user
router.delete('/:id', authorize('super_admin', 'sub_admin'), userController.deleteUser);

module.exports = router;
