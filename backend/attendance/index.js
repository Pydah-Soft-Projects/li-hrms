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
    fileSize: 50 * 1024 * 1024, // 50MB limit
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

/**
 * @swagger
 * /api/attendance/calendar:
 *   get:
 *     summary: Get attendance calendar data
 *     tags: [Attendance]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: employeeNumber
 *         required: true
 *         schema:
 *           type: string
 *       - in: query
 *         name: year
 *         schema:
 *           type: integer
 *       - in: query
 *         name: month
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Calendar data retrieved
 */
router.get('/calendar', applyScopeFilter, attendanceController.getAttendanceCalendar);

/**
 * @swagger
 * /api/attendance/list:
 *   get:
 *     summary: Get attendance list
 *     tags: [Attendance]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: employeeNumber
 *         required: true
 *         schema:
 *           type: string
 *       - in: query
 *         name: startDate
 *         required: true
 *         schema:
 *           type: string
 *           format: date
 *       - in: query
 *         name: endDate
 *         required: true
 *         schema:
 *           type: string
 *           format: date
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: List retrieved
 */
router.get('/list', applyScopeFilter, attendanceController.getAttendanceList);

/**
 * @swagger
 * /api/attendance/detail:
 *   get:
 *     summary: Get attendance details
 *     tags: [Attendance]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: employeeNumber
 *         required: true
 *         schema:
 *           type: string
 *       - in: query
 *         name: date
 *         required: true
 *         schema:
 *           type: string
 *           format: date
 *     responses:
 *       200:
 *         description: Details retrieved
 */
router.get('/detail', applyScopeFilter, attendanceController.getAttendanceDetail);

/**
 * @swagger
 * /api/attendance/employees:
 *   get:
 *     summary: Get employees with attendance
 *     tags: [Attendance]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: date
 *         schema:
 *           type: string
 *           format: date
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: List retrieved
 */
router.get('/employees', applyScopeFilter, attendanceController.getEmployeesWithAttendance);

/**
 * @swagger
 * /api/attendance/monthly:
 *   get:
 *     summary: Get monthly attendance
 *     tags: [Attendance]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: year
 *         required: true
 *         schema:
 *           type: integer
 *       - in: query
 *         name: month
 *         required: true
 *         schema:
 *           type: integer
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *       - in: query
 *         name: search
 *         schema:
 *           type: string
 *       - in: query
 *         name: divisionId
 *         schema:
 *           type: string
 *       - in: query
 *         name: departmentId
 *         schema:
 *           type: string
 *       - in: query
 *         name: designationId
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Data retrieved
 */
router.get('/monthly', applyScopeFilter, attendanceController.getMonthlyAttendance);

/**
 * @swagger
 * /api/attendance/activity/recent:
 *   get:
 *     summary: Get recent attendance activity
 *     tags: [Attendance]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Activity retrieved
 */
router.get('/activity/recent', applyScopeFilter, attendanceController.getRecentActivity);

/**
 * @swagger
 * /api/attendance/{employeeNumber}/{date}/available-shifts:
 *   get:
 *     summary: Get available shifts for a date
 *     tags: [Attendance]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: employeeNumber
 *         required: true
 *         schema:
 *           type: string
 *       - in: path
 *         name: date
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Shifts retrieved
 */
router.get('/:employeeNumber/:date/available-shifts', attendanceController.getAvailableShifts);

/**
 * @swagger
 * /api/attendance/{employeeNumber}/{date}/outtime:
 *   put:
 *     summary: Update attendance out-time
 *     tags: [Attendance]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: employeeNumber
 *         required: true
 *       - in: path
 *         name: date
 *         required: true
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               outTime:
 *                 type: string
 *                 format: date-time
 *     responses:
 *       200:
 *         description: Out-time updated
 */
router.put('/:employeeNumber/:date/outtime', authorize('manager', 'super_admin', 'sub_admin', 'hr', 'hod'), attendanceController.updateOutTime);

/**
 * @swagger
 * /api/attendance/{employeeNumber}/{date}/intime:
 *   put:
 *     summary: Update attendance in-time
 *     tags: [Attendance]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: employeeNumber
 *         required: true
 *       - in: path
 *         name: date
 *         required: true
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               intTime:
 *                 type: string
 *                 format: date-time
 *     responses:
 *       200:
 *         description: In-time updated
 */
router.put('/:employeeNumber/:date/intime', authorize('super_admin', 'sub_admin', 'hr'), attendanceController.updateInTime);

/**
 * @swagger
 * /api/attendance/{employeeNumber}/{date}/shift:
 *   put:
 *     summary: Assign shift to attendance
 *     tags: [Attendance]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: employeeNumber
 *         required: true
 *       - in: path
 *         name: date
 *         required: true
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               shiftId:
 *                 type: string
 *     responses:
 *       200:
 *         description: Shift assigned
 */
router.put('/:employeeNumber/:date/shift', authorize('manager', 'super_admin', 'sub_admin', 'hr', 'hod'), attendanceController.assignShift);

// Settings Routes (Super Admin, Sub Admin only)
/**
 * @swagger
 * /api/attendance/settings:
 *   get:
 *     summary: Get attendance settings
 *     tags: [Attendance]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Settings retrieved
 */
router.get('/settings', attendanceSettingsController.getSettings);

/**
 * @swagger
 * /api/attendance/settings:
 *   put:
 *     summary: Update attendance settings
 *     tags: [Attendance]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               dataSource:
 *                 type: string
 *                 enum: [mongodb, mssql, both]
 *               mssqlConfig:
 *                 type: object
 *                 properties:
 *                   databaseName:
 *                     type: string
 *                   tableName:
 *                     type: string
 *                   columnMapping:
 *                     type: object
 *                     properties:
 *                       employeeNumberColumn:
 *                         type: string
 *                       timestampColumn:
 *                         type: string
 *                       typeColumn:
 *                         type: string
 *                       hasTypeColumn:
 *                         type: boolean
 *               syncSettings:
 *                 type: object
 *                 properties:
 *                   autoSyncEnabled:
 *                     type: boolean
 *                   syncIntervalHours:
 *                     type: number
 *               previousDayLinking:
 *                 type: object
 *                 properties:
 *                   enabled:
 *                     type: boolean
 *                   requireConfirmation:
 *                     type: boolean
 *     responses:
 *       200:
 *         description: Settings updated
 */
router.put('/settings', authorize('super_admin', 'sub_admin'), attendanceSettingsController.updateSettings);

/**
 * @swagger
 * /api/attendance/settings/deduction:
 *   get:
 *     summary: Get deduction settings
 *     tags: [Attendance]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Settings retrieved
 */
router.get('/settings/deduction', attendanceDeductionSettingsController.getSettings);

/**
 * @swagger
 * /api/attendance/settings/deduction:
 *   post:
 *     summary: Save deduction settings
 *     tags: [Attendance]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               deductionRules:
 *                 type: object
 *                 properties:
 *                   combinedCountThreshold:
 *                     type: integer
 *                   deductionType:
 *                     type: string
 *                     enum: [half_day, full_day, custom_amount]
 *                   deductionAmount:
 *                     type: number
 *                   minimumDuration:
 *                     type: integer
 *                   calculationMode:
 *                     type: string
 *                     enum: [monthly, per_instance]
 *     responses:
 *       200:
 *         description: Settings saved
 */
router.post('/settings/deduction', authorize('super_admin', 'sub_admin'), attendanceDeductionSettingsController.saveSettings);
router.put('/settings/deduction', authorize('super_admin', 'sub_admin'), attendanceDeductionSettingsController.saveSettings);

/**
 * @swagger
 * /api/attendance/settings/early-out:
 *   get:
 *     summary: Get early-out settings
 *     tags: [Attendance]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Settings retrieved
 */
router.get('/settings/early-out', earlyOutSettingsController.getSettings);

/**
 * @swagger
 * /api/attendance/settings/early-out:
 *   post:
 *     summary: Save early-out settings
 *     tags: [Attendance]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               isEnabled:
 *                 type: boolean
 *               allowedDurationMinutes:
 *                 type: integer
 *               minimumDuration:
 *                 type: integer
 *               deductionRanges:
 *                 type: array
 *                 items:
 *                   type: object
 *                   properties:
 *                     minMinutes:
 *                       type: integer
 *                     maxMinutes:
 *                       type: integer
 *                     deductionType:
 *                       type: string
 *                     deductionAmount:
 *                       type: number
 *                     description:
 *                       type: string
 *     responses:
 *       200:
 *         description: Settings saved
 */
router.post('/settings/early-out', authorize('super_admin', 'sub_admin'), earlyOutSettingsController.saveSettings);
router.put('/settings/early-out', authorize('super_admin', 'sub_admin'), earlyOutSettingsController.saveSettings);

/**
 * @swagger
 * /api/attendance/settings/early-out/ranges:
 *   post:
 *     summary: Add early-out range
 *     tags: [Attendance]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - minMinutes
 *               - maxMinutes
 *               - deductionType
 *             properties:
 *               minMinutes:
 *                 type: integer
 *               maxMinutes:
 *                 type: integer
 *               deductionType:
 *                 type: string
 *               deductionAmount:
 *                 type: number
 *               description:
 *                 type: string
 *     responses:
 *       201:
 *         description: Range added
 */
router.post('/settings/early-out/ranges', authorize('super_admin', 'sub_admin'), earlyOutSettingsController.addRange);

/**
 * @swagger
 * /api/attendance/settings/early-out/ranges/{rangeId}:
 *   put:
 *     summary: Update early-out range
 *     tags: [Attendance]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: rangeId
 *         required: true
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               minMinutes:
 *                 type: integer
 *               maxMinutes:
 *                 type: integer
 *               deductionType:
 *                 type: string
 *               deductionAmount:
 *                 type: number
 *               description:
 *                 type: string
 *     responses:
 *       200:
 *         description: Range updated
 */
router.put('/settings/early-out/ranges/:rangeId', authorize('super_admin', 'sub_admin'), earlyOutSettingsController.updateRange);

/**
 * @swagger
 * /api/attendance/settings/early-out/ranges/{rangeId}:
 *   delete:
 *     summary: Delete early-out range
 *     tags: [Attendance]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: rangeId
 *         required: true
 *     responses:
 *       200:
 *         description: Range deleted
 */
router.delete('/settings/early-out/ranges/:rangeId', authorize('super_admin', 'sub_admin'), earlyOutSettingsController.deleteRange);

// Sync Routes (Super Admin, Sub Admin only)
/**
 * @swagger
 * /api/attendance/sync:
 *   post:
 *     summary: Manually sync attendance
 *     tags: [Attendance]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: false
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               fromDate:
 *                 type: string
 *                 format: date
 *               toDate:
 *                 type: string
 *                 format: date
 *     responses:
 *       200:
 *         description: Sync started
 */
router.post('/sync', authorize('super_admin', 'sub_admin'), attendanceSyncController.manualSync);
/**
 * @swagger
 * /api/attendance/sync/status:
 *   get:
 *     summary: Get manual sync status
 *     tags: [Attendance]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Status retrieved
 */
router.get('/sync/status', attendanceSyncController.getSyncStatus);

// Upload Routes (Super Admin, Sub Admin, HR)
/**
 * @swagger
 * /api/attendance/upload:
 *   post:
 *     summary: Upload attendance Excel
 *     tags: [Attendance]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               file:
 *                 type: string
 *                 format: binary
 *     responses:
 *       200:
 *         description: Uploaded
 */
router.post('/upload', authorize('manager', 'super_admin', 'sub_admin', 'hr'), upload.single('file'), attendanceUploadController.uploadExcel);
/**
 * @swagger
 * /api/attendance/upload/template:
 *   get:
 *     summary: Download attendance template
 *     tags: [Attendance]
 *     responses:
 *       200:
 *         description: File retrieved
 */
router.get('/upload/template', attendanceUploadController.downloadTemplate);

// Monthly Summary Routes
/**
 * @swagger
 * /api/attendance/monthly-summary:
 *   get:
 *     summary: Get all monthly summaries
 *     tags: [Attendance]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Summaries retrieved
 */
router.get('/monthly-summary', applyScopeFilter, monthlySummaryController.getAllMonthlySummaries);
/**
 * @swagger
 * /api/attendance/monthly-summary/{employeeId}:
 *   get:
 *     summary: Get monthly summary for an employee
 *     tags: [Attendance]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: employeeId
 *         required: true
 *     responses:
 *       200:
 *         description: Summary retrieved
 */
router.get('/monthly-summary/:employeeId', applyScopeFilter, monthlySummaryController.getEmployeeMonthlySummary);

/**
 * @swagger
 * /api/attendance/monthly-summary/calculate/{employeeId}:
 *   post:
 *     summary: Calculate monthly summary for an employee
 *     tags: [Attendance]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: employeeId
 *         required: true
 *     requestBody:
 *       required: false
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               year:
 *                 type: integer
 *               monthNumber:
 *                 type: integer
 *     responses:
 *       200:
 *         description: Summary calculated
 */
router.post('/monthly-summary/calculate/:employeeId', authorize('manager', 'super_admin', 'sub_admin', 'hr'), monthlySummaryController.calculateEmployeeSummary);

/**
 * @swagger
 * /api/attendance/monthly-summary/calculate-all:
 *   post:
 *     summary: Calculate all monthly summaries
 *     tags: [Attendance]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: false
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               year:
 *                 type: integer
 *               monthNumber:
 *                 type: integer
 *     responses:
 *       200:
 *         description: Calculation started
 */
router.post('/monthly-summary/calculate-all', applyScopeFilter, authorize('manager', 'super_admin', 'sub_admin', 'hr'), monthlySummaryController.calculateAllSummaries);

module.exports = router;

