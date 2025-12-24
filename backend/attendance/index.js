/**
 * Attendance Routes
 */

const express = require('express');
const router = express.Router();
const multer = require('multer');
const { protect, authorize } = require('../authentication/middleware/authMiddleware');
const { applyScopeFilter } = require('../shared/middleware/dataScopeMiddleware');

// Controllers
const attendanceController = require('./controllers/attendanceController');
const attendanceSettingsController = require('./controllers/attendanceSettingsController');
const attendanceDeductionSettingsController = require('./controllers/attendanceDeductionSettingsController');
const earlyOutSettingsController = require('./controllers/earlyOutSettingsController');
const attendanceSyncController = require('./controllers/attendanceSyncController');
const attendanceUploadController = require('./controllers/attendanceUploadController');
const monthlySummaryController = require('./controllers/monthlySummaryController');

// Configure multer for file uploads (memory storage)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB limit
  },
  fileFilter: (req, file, cb) => {
    if (file.mimetype === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' ||
      file.mimetype === 'application/vnd.ms-excel' ||
      file.mimetype === 'text/csv') {
      cb(null, true);
    } else {
      cb(new Error('Only Excel files (.xlsx, .xls) and CSV files are allowed'), false);
    }
  },
});

// All routes require authentication
router.use(protect);

// Attendance Data Routes (with scope filtering)
router.get('/calendar', applyScopeFilter, attendanceController.getAttendanceCalendar);
router.get('/list', applyScopeFilter, attendanceController.getAttendanceList);
router.get('/detail', applyScopeFilter, attendanceController.getAttendanceDetail);
router.get('/employees', applyScopeFilter, attendanceController.getEmployeesWithAttendance);
router.get('/monthly', applyScopeFilter, attendanceController.getMonthlyAttendance);
router.get('/:employeeNumber/:date/available-shifts', attendanceController.getAvailableShifts);

// Update outTime for PARTIAL attendance (Super Admin, Sub Admin, HR, HOD)
router.put('/:employeeNumber/:date/outtime', authorize('super_admin', 'sub_admin', 'hr', 'hod'), attendanceController.updateOutTime);

// Assign shift to attendance record (Super Admin, Sub Admin, HR, HOD)
router.put('/:employeeNumber/:date/shift', authorize('super_admin', 'sub_admin', 'hr', 'hod'), attendanceController.assignShift);

// Settings Routes (Super Admin, Sub Admin only)
router.get('/settings', attendanceSettingsController.getSettings);
router.put('/settings', authorize('super_admin', 'sub_admin'), attendanceSettingsController.updateSettings);

// Deduction Settings Routes (Must come before dynamic routes)
// Get attendance deduction settings
router.get('/settings/deduction', attendanceDeductionSettingsController.getSettings);

// Save attendance deduction settings
router.post('/settings/deduction', authorize('super_admin', 'sub_admin'), attendanceDeductionSettingsController.saveSettings);
router.put('/settings/deduction', authorize('super_admin', 'sub_admin'), attendanceDeductionSettingsController.saveSettings);

// Early-Out Settings Routes
// Get early-out settings
router.get('/settings/early-out', earlyOutSettingsController.getSettings);

// Save early-out settings
router.post('/settings/early-out', authorize('super_admin', 'sub_admin'), earlyOutSettingsController.saveSettings);
router.put('/settings/early-out', authorize('super_admin', 'sub_admin'), earlyOutSettingsController.saveSettings);

// Early-Out Deduction Range Routes
router.post('/settings/early-out/ranges', authorize('super_admin', 'sub_admin'), earlyOutSettingsController.addRange);
router.put('/settings/early-out/ranges/:rangeId', authorize('super_admin', 'sub_admin'), earlyOutSettingsController.updateRange);
router.delete('/settings/early-out/ranges/:rangeId', authorize('super_admin', 'sub_admin'), earlyOutSettingsController.deleteRange);

// Sync Routes (Super Admin, Sub Admin only)
router.post('/sync', authorize('super_admin', 'sub_admin'), attendanceSyncController.manualSync);
router.get('/sync/status', attendanceSyncController.getSyncStatus);

// Upload Routes (Super Admin, Sub Admin, HR)
router.post('/upload', authorize('super_admin', 'sub_admin', 'hr'), upload.single('file'), attendanceUploadController.uploadExcel);
router.get('/upload/template', attendanceUploadController.downloadTemplate);

// Monthly Summary Routes
router.get('/monthly-summary', monthlySummaryController.getAllMonthlySummaries);
router.get('/monthly-summary/:employeeId', monthlySummaryController.getEmployeeMonthlySummary);
router.post('/monthly-summary/calculate/:employeeId', authorize('super_admin', 'sub_admin', 'hr'), monthlySummaryController.calculateEmployeeSummary);
router.post('/monthly-summary/calculate-all', authorize('super_admin', 'sub_admin', 'hr'), monthlySummaryController.calculateAllSummaries);

module.exports = router;

