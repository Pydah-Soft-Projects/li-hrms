const express = require('express');
const router = express.Router();
const employeeUpdateController = require('./controllers/employeeUpdateController');
const { protect, authorize } = require('../authentication/middleware/authMiddleware');

// All routes require authentication
router.use(protect);

// Employee routes
router.post('/', employeeUpdateController.createRequest);
router.get('/my', employeeUpdateController.getMyRequests);

// Approver routes (Superadmin, Sub-admin, HR)
router.get('/', authorize('super_admin', 'sub_admin', 'hr'), employeeUpdateController.getRequests);
router.put('/:id/approve', authorize('super_admin', 'sub_admin', 'hr'), employeeUpdateController.approveRequest);
router.put('/:id/reject', authorize('super_admin', 'sub_admin', 'hr'), employeeUpdateController.rejectRequest);

module.exports = router;
