const express = require('express');
const router = express.Router();
const complaintController = require('./controllers/complaintController');
const { protect } = require('../authentication/middleware/authMiddleware');

const { applyScopeFilter } = require('../shared/middleware/dataScopeMiddleware');

// All routes require authentication
router.use(protect);

// Get my complaints
router.get('/my', complaintController.getMyComplaints);

// Get pending complaint approvals
router.get('/pending-approvals', complaintController.getPendingApprovals);

// Get all complaints (scoped)
router.get('/', applyScopeFilter, complaintController.getComplaints);

// Get single complaint details
router.get('/:id', complaintController.getComplaint);

// Submit new complaint
router.post('/', complaintController.applyComplaint);

// Process complaint action (approve/reject)
router.put('/:id/action', complaintController.processComplaintAction);

// Cancel complaint
router.put('/:id/cancel', complaintController.cancelComplaint);

module.exports = router;
