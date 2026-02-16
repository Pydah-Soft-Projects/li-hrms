const express = require('express');
const router = express.Router();
const holidayController = require('./controllers/holidayController');
const { protect, authorize } = require('../authentication/middleware/authMiddleware');

router.use(protect);

// Admin Routes
router.get('/admin', authorize('super_admin', 'sub_admin', 'hr'), holidayController.getAllHolidaysAdmin);
router.post('/', authorize('super_admin', 'sub_admin', 'hr'), holidayController.saveHoliday);
router.delete('/:id', authorize('super_admin', 'sub_admin', 'hr'), holidayController.deleteHoliday);

// Group Routes
router.post('/groups', authorize('super_admin', 'sub_admin', 'hr'), holidayController.saveHolidayGroup);
router.delete('/groups/:id', authorize('super_admin', 'sub_admin', 'hr'), holidayController.deleteHolidayGroup);

// Employee Routes
router.get('/my', holidayController.getMyHolidays);

module.exports = router;
