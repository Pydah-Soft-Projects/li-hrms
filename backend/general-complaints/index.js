const express = require('express');
const { protect } = require('../authentication/middleware/authMiddleware');
const requireGeneralComplaintsEnabled = require('./middleware/requireGeneralComplaintsEnabled');
const controller = require('./controllers/generalComplaintController');

const router = express.Router();

router.use(protect, requireGeneralComplaintsEnabled);
router.get('/categories', controller.getCategories);
router.get('/my', controller.getMyComplaints);
router.post('/', controller.createComplaint);
router.get('/:id', controller.getComplaint);
router.post('/:id/comments', controller.addComment);
router.post('/:id/feedback', controller.submitFeedback);

module.exports = router;
