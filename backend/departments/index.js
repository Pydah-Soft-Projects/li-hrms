const express = require('express');
const router = express.Router();
const departmentController = require('./controllers/departmentController');
const designationController = require('./controllers/designationController');
const departmentSettingsController = require('./controllers/departmentSettingsController');
const { protect, authorize } = require('../authentication/middleware/authMiddleware');
const { applyScopeFilter, applyMetadataScopeFilter } = require('../shared/middleware/dataScopeMiddleware');

// All routes are protected
router.use(protect);

// Get all departments
router.get('/', applyMetadataScopeFilter('Department'), departmentController.getAllDepartments);


// ============== Global Designation Routes ==============
// These routes handle designations as independent entities

// Get all designations (global)
router.get('/designations', designationController.getAllDesignations);

// Create global designation (Super Admin, Sub Admin, HR)
router.post('/designations', authorize('manager', 'super_admin', 'sub_admin', 'hr'), designationController.createGlobalDesignation);

// Get single designation
router.get('/designations/:id', designationController.getDesignation);

// Update designation (Super Admin, Sub Admin, HR)
router.put('/designations/:id', authorize('manager', 'super_admin', 'sub_admin', 'hr'), designationController.updateDesignation);

// Assign shifts to designation (Super Admin, Sub Admin, HR)
router.put('/designations/:id/shifts', authorize('manager', 'super_admin', 'sub_admin', 'hr'), designationController.assignShifts);

// Delete designation (Super Admin, Sub Admin)
router.delete('/designations/:id', authorize('super_admin', 'sub_admin'), designationController.deleteDesignation);

// Get single department
router.get('/:id', departmentController.getDepartment);

// Get department employees
router.get('/:id/employees', departmentController.getDepartmentEmployees);

// Get department configuration
router.get('/:id/configuration', departmentController.getDepartmentConfiguration);

// Create department (Super Admin, Sub Admin, HR)
router.post('/', authorize('manager', 'super_admin', 'sub_admin', 'hr'), departmentController.createDepartment);

// Update department (Super Admin, Sub Admin, HR)
router.put('/:id', authorize('manager', 'super_admin', 'sub_admin', 'hr'), departmentController.updateDepartment);

// Update department configuration (Super Admin, Sub Admin, HR)
router.put('/:id/configuration', authorize('manager', 'super_admin', 'sub_admin', 'hr'), departmentController.updateDepartmentConfiguration);

// Assign HOD (Super Admin, Sub Admin, HR)
router.put('/:id/assign-hod', authorize('manager', 'super_admin', 'sub_admin', 'hr'), departmentController.assignHOD);

// Assign HR (Super Admin, Sub Admin)
router.put('/:id/assign-hr', authorize('super_admin', 'sub_admin'), departmentController.assignHR);

// Assign shifts to department (Super Admin, Sub Admin, HR)
router.put('/:id/shifts', authorize('manager', 'super_admin', 'sub_admin', 'hr'), departmentController.assignShifts);

// Update paid leaves (Super Admin, Sub Admin, HR)
router.put('/:id/paid-leaves', authorize('manager', 'super_admin', 'sub_admin', 'hr'), departmentController.updatePaidLeaves);

// Update leave limits (Super Admin, Sub Admin, HR)
router.put('/:id/leave-limits', authorize('manager', 'super_admin', 'sub_admin', 'hr'), departmentController.updateLeaveLimits);

// Delete department (Super Admin, Sub Admin)
router.delete('/:id', authorize('super_admin', 'sub_admin'), departmentController.deleteDepartment);



// ============== Department-Specific Designation Routes (Backward Compatible) ==============

// Get designations by department
router.get('/:departmentId/designations', designationController.getDesignationsByDepartment);

// Link existing designation to department
router.post('/:departmentId/designations/link', authorize('manager', 'super_admin', 'sub_admin', 'hr'), designationController.linkDesignation);

// Create designation (Super Admin, Sub Admin, HR) - backward compatible
router.post('/:departmentId/designations', authorize('manager', 'super_admin', 'sub_admin', 'hr'), designationController.createDesignation);

// Department Settings routes
// Get department settings
router.get('/:deptId/settings', departmentSettingsController.getDepartmentSettings);

// Get resolved settings (department + global fallback)
router.get('/:deptId/settings/resolved', departmentSettingsController.getResolvedSettings);

// Update department settings (Any authenticated user)
router.put('/:deptId/settings', departmentSettingsController.updateDepartmentSettings);

module.exports = router;


