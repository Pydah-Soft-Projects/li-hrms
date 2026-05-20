const express = require('express');
const router = express.Router();
const holidayController = require('./controllers/holidayController');
const { protect } = require('../authentication/middleware/authMiddleware');
const { requireHolidayWrite, requireHolidayGlobalManage } = require('./middleware/holidayMiddleware');

router.use(protect);

// Group routes (must be registered before /:id routes)
router.get('/groups', requireHolidayWrite, holidayController.getHolidayGroupsAdmin);
router.post('/groups', requireHolidayGlobalManage, holidayController.saveHolidayGroup);
router.delete('/groups/:id', requireHolidayGlobalManage, holidayController.deleteHolidayGroup);

// Admin routes (feature-based; see holidayAccess.js)
router.get('/admin', requireHolidayWrite, holidayController.getAllHolidaysAdmin);
router.post('/', requireHolidayWrite, holidayController.saveHoliday);
router.get('/:id/activity', requireHolidayWrite, holidayController.getHolidayActivity);
router.delete('/:id', requireHolidayWrite, holidayController.deleteHoliday);

// Employee routes
router.get('/my', holidayController.getMyHolidays);

module.exports = router;
