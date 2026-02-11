const express = require('express');
const router = express.Router();
const divisionController = require('./controllers/divisionController');
const { protect, authorize } = require('../authentication/middleware/authMiddleware');

const { applyScopeFilter, applyMetadataScopeFilter } = require('../shared/middleware/dataScopeMiddleware');

// All routes are protected
router.use(protect);

// Get all divisions
router.get('/', applyMetadataScopeFilter('Division'), divisionController.getDivisions);


// Get single division
router.get('/:id', divisionController.getDivision);

// Create division (Super Admin, Sub Admin)
router.post('/', authorize('super_admin', 'sub_admin'), divisionController.createDivision);

// Update division (Super Admin, Sub Admin)
router.put('/:id', authorize('super_admin', 'sub_admin'), divisionController.updateDivision);

// Delete division (Super Admin, Sub Admin)
router.delete('/:id', authorize('super_admin', 'sub_admin'), divisionController.deleteDivision);

// Link/Unlink departments
router.post('/:id/departments', authorize('super_admin', 'sub_admin'), divisionController.linkDepartments);

// Assign shifts
router.post('/:id/shifts', authorize('super_admin', 'sub_admin'), divisionController.assignShifts);

module.exports = router;
