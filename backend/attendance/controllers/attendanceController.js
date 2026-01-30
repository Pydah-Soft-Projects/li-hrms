/**
 * Attendance Controller
 * Handles attendance data retrieval and display
 */

const AttendanceRawLog = require('../model/AttendanceRawLog');
const AttendanceDaily = require('../model/AttendanceDaily');
const Employee = require('../../employees/model/Employee');
const Shift = require('../../shifts/model/Shift');
const Leave = require('../../leaves/model/Leave');
const OD = require('../../leaves/model/OD');
const MonthlyAttendanceSummary = require('../model/MonthlyAttendanceSummary');
const { calculateMonthlySummary } = require('../services/summaryCalculationService');
const Settings = require('../../settings/model/Settings');

/**
 * Format date to YYYY-MM-DD
 */
const formatDate = (date) => {
  const d = new Date(date);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

/**
 * @desc    Get attendance records for calendar view
 * @route   GET /api/attendance/calendar
 * @access  Private
 */
exports.getAttendanceCalendar = async (req, res) => {
  try {
    const { employeeNumber, year, month } = req.query;

    if (!employeeNumber) {
      return res.status(400).json({
        success: false,
        message: 'Employee number is required',
      });
    }

    // Default to current month if not provided
    const currentDate = new Date();
    const targetYear = parseInt(year) || currentDate.getFullYear();
    const targetMonth = parseInt(month) || (currentDate.getMonth() + 1);

    // Get employee with scope validation
    const employee = await Employee.findOne({
      ...req.scopeFilter,
      emp_no: employeeNumber.toUpperCase(),
      is_active: { $ne: false }
    });

    if (!employee) {
      return res.status(403).json({
        success: false,
        message: 'Access denied or employee not found',
      });
    }

    const { getCalendarViewData } = require('../services/attendanceViewService');
    const attendanceMap = await getCalendarViewData(employee, targetYear, targetMonth);

    res.status(200).json({
      success: true,
      data: attendanceMap,
      year: targetYear,
      month: targetMonth,
    });

  } catch (error) {
    console.error('Error fetching attendance calendar:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to fetch attendance calendar',
    });
  }
};

/**
 * @desc    Get attendance records for list view
 * @route   GET /api/attendance/list
 * @access  Private
 */
exports.getAttendanceList = async (req, res) => {
  try {
    const { employeeNumber, startDate, endDate, page = 1, limit = 30 } = req.query;

    if (!employeeNumber) {
      return res.status(400).json({
        success: false,
        message: 'Employee number is required',
      });
    }

    if (!startDate || !endDate) {
      return res.status(400).json({
        success: false,
        message: 'Start date and end date are required',
      });
    }

    // Scope validation
    const allowedEmployee = await Employee.findOne({
      ...req.scopeFilter,
      emp_no: employeeNumber.toUpperCase()
    });

    if (!allowedEmployee) {
      return res.status(403).json({
        success: false,
        message: 'Access denied or employee not found',
      });
    }

    const query = {
      employeeNumber: employeeNumber.toUpperCase(),
      date: { $gte: startDate, $lte: endDate },
    };

    const skip = (parseInt(page) - 1) * parseInt(limit);

    const records = await AttendanceDaily.find(query)
      .populate('shiftId', 'name startTime endTime duration')
      .sort({ date: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    const total = await AttendanceDaily.countDocuments(query);

    res.status(200).json({
      success: true,
      data: records,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / parseInt(limit)),
      },
    });

  } catch (error) {
    console.error('Error fetching attendance list:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to fetch attendance list',
    });
  }
};

/**
 * @desc    Get available shifts for an employee for a specific date
 * @route   GET /api/attendance/:employeeNumber/:date/available-shifts
 * @access  Private
 */
exports.getAvailableShifts = async (req, res) => {
  try {
    const { employeeNumber, date } = req.params;

    const { getShiftsForEmployee } = require('../../shifts/services/shiftDetectionService');
    const { shifts, source } = await getShiftsForEmployee(employeeNumber, date);

    res.status(200).json({
      success: true,
      data: shifts,
      source: source,
    });

  } catch (error) {
    console.error('Error fetching available shifts:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching available shifts',
      error: error.message,
    });
  }
};

/**
 * @desc    Get attendance detail for a specific date
 * @route   GET /api/attendance/detail
 * @access  Private
 */
exports.getAttendanceDetail = async (req, res) => {
  try {
    const { employeeNumber, date } = req.query;

    if (!employeeNumber || !date) {
      return res.status(400).json({
        success: false,
        message: 'Employee number and date are required',
      });
    }

    // Scope validation
    const allowedEmployee = await Employee.findOne({
      ...req.scopeFilter,
      emp_no: employeeNumber.toUpperCase()
    });

    if (!allowedEmployee) {
      return res.status(403).json({
        success: false,
        message: 'Access denied or employee not found',
      });
    }

    const record = await AttendanceDaily.findOne({
      employeeNumber: employeeNumber.toUpperCase(),
      date: date,
    })
      .populate('shiftId', 'name startTime endTime duration gracePeriod');

    if (!record) {
      return res.status(404).json({
        success: false,
        message: 'Attendance record not found',
      });
    }

    // Also fetch raw logs for that day
    const rawLogs = await AttendanceRawLog.find({
      employeeNumber: employeeNumber.toUpperCase(),
      date: date,
    }).sort({ timestamp: 1 });

    res.status(200).json({
      success: true,
      data: {
        ...record.toObject(),
        rawLogs,
      },
    });

  } catch (error) {
    console.error('Error fetching attendance detail:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to fetch attendance detail',
    });
  }
};

/**
 * @desc    Get all employees with their attendance summary
 * @route   GET /api/attendance/employees
 * @access  Private
 */
exports.getEmployeesWithAttendance = async (req, res) => {
  try {
    const { date, page = 1, limit = 50 } = req.query;
    const skip = (parseInt(page) - 1) * parseInt(limit);

    // Get paginated employees within scope
    const employees = await Employee.find({
      ...req.scopeFilter,
      is_active: { $ne: false }
    })
      .select('emp_no employee_name department_id designation_id')
      .populate('department_id', 'name')
      .populate('designation_id', 'name')
      .sort({ emp_no: 1 })
      .skip(skip)
      .limit(parseInt(limit));

    const total = await Employee.countDocuments({
      ...req.scopeFilter,
      is_active: { $ne: false }
    });

    // If date provided, get attendance for that date for these SPECIFIC employees
    let attendanceMap = {};
    if (date) {
      const empNos = employees.map(e => e.emp_no);
      const records = await AttendanceDaily.find({
        date,
        employeeNumber: { $in: empNos }
      });
      records.forEach(record => {
        attendanceMap[record.employeeNumber] = record;
      });
    }

    const employeesWithAttendance = employees.map(emp => ({
      ...emp.toObject(),
      attendance: attendanceMap[emp.emp_no] || null,
    }));

    res.status(200).json({
      success: true,
      data: employeesWithAttendance,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        totalPages: Math.ceil(total / parseInt(limit))
      }
    });

  } catch (error) {
    console.error('Error fetching employees with attendance:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to fetch employees with attendance',
    });
  }
};

/**
 * @desc    Get all employees attendance for a month (for table view)
 * @route   GET /api/attendance/monthly
 * @access  Private
 */
exports.getMonthlyAttendance = async (req, res) => {
  try {
    const { year, month, page = 1, limit = 20, search, divisionId, departmentId, designationId } = req.query;

    if (!year || !month) {
      return res.status(400).json({
        success: false,
        message: 'Year and month are required',
      });
    }

    // Build filter based on scope and provided filters
    const filter = { ...req.scopeFilter, is_active: { $ne: false } };

    if (search) {
      filter.$or = [
        { employee_name: { $regex: search, $options: 'i' } },
        { emp_no: { $regex: search, $options: 'i' } }
      ];
    }

    if (divisionId) filter.division_id = divisionId;
    if (departmentId) filter.department_id = departmentId;
    if (designationId) filter.designation_id = designationId;

    const skip = (parseInt(page) - 1) * parseInt(limit);

    // Get paginated active employees
    const employees = await Employee.find(filter)
      .populate('division_id', 'name')
      .populate('department_id', 'name')
      .populate('designation_id', 'name')
      .sort({ employee_name: 1 })
      .skip(skip)
      .limit(parseInt(limit));

    const totalEmployees = await Employee.countDocuments(filter);

    const { getMonthlyTableViewData } = require('../services/attendanceViewService');
    const employeesWithAttendance = await getMonthlyTableViewData(employees, year, month);

    res.status(200).json({
      success: true,
      data: employeesWithAttendance,
      pagination: {
        total: totalEmployees,
        page: parseInt(page),
        limit: parseInt(limit),
        totalPages: Math.ceil(totalEmployees / parseInt(limit))
      },
      month: parseInt(month),
      year: parseInt(year),
      daysInMonth: new Date(parseInt(year), parseInt(month), 0).getDate(),
    });

  } catch (error) {
    console.error('Error fetching monthly attendance:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to fetch monthly attendance',
    });
  }
};

/**
 * @desc    Update outTime for attendance record (for PARTIAL attendance)
 * @route   PUT /api/attendance/:employeeNumber/:date/outtime
 * @access  Private (Super Admin, Sub Admin, HR, HOD)
 */
exports.updateOutTime = async (req, res) => {
  try {
    const { employeeNumber, date } = req.params;
    const { outTime } = req.body;

    // Restrict to HR/Superadmin
    if (!req.user || (req.user.role !== 'hr' && req.user.role !== 'super_admin' && req.user.role !== 'superadmin' && req.user.role !== 'admin')) {
      return res.status(403).json({
        success: false,
        message: 'Permission denied. Only HR can edit attendance details.'
      });
    }

    const PreScheduledShift = require('../../shifts/model/PreScheduledShift');
    const { detectAndAssignShift } = require('../../shifts/services/shiftDetectionService');

    // Fetch global general settings
    const generalConfig = await Settings.getSettingsByCategory('general');

    if (!outTime) {
      return res.status(400).json({
        success: false,
        message: 'Out time is required',
      });
    }

    // Get attendance record
    const AttendanceDaily = require('../model/AttendanceDaily');
    const attendanceRecord = await AttendanceDaily.findOne({
      employeeNumber: employeeNumber.toUpperCase(),
      date: date,
    }).populate('shiftId');

    if (!attendanceRecord) {
      return res.status(404).json({
        success: false,
        message: 'Attendance record not found',
      });
    }

    if (!attendanceRecord.inTime) {
      return res.status(400).json({
        success: false,
        message: 'Attendance record has no in-time',
      });
    }

    // Ensure outTime is a Date object
    let outTimeDate = outTime instanceof Date ? outTime : new Date(outTime);

    if (isNaN(outTimeDate.getTime())) {
      return res.status(400).json({
        success: false,
        message: 'Invalid out time format',
      });
    }

    // Handle next-day scenario for overnight shifts
    // Check if the shift is overnight and adjust out-time accordingly
    const outTimeOnly = outTimeDate.getHours() * 60 + outTimeDate.getMinutes();
    const inTimeOnly = attendanceRecord.inTime.getHours() * 60 + attendanceRecord.inTime.getMinutes();
    const outTimeDateStr = outTimeDate.toDateString();
    const inTimeDateStr = attendanceRecord.inTime.toDateString();

    // Get shift to check if it's overnight
    let isOvernightShift = false;
    if (attendanceRecord.shiftId &&
      typeof attendanceRecord.shiftId === 'object' &&
      attendanceRecord.shiftId.startTime &&
      attendanceRecord.shiftId.endTime) {
      const [shiftStartHour] = attendanceRecord.shiftId.startTime.split(':').map(Number);
      const [shiftEndHour] = attendanceRecord.shiftId.endTime.split(':').map(Number);
      isOvernightShift = shiftStartHour >= 20 || (shiftEndHour < shiftStartHour);
    }

    // If shift is overnight or out-time is earlier than in-time and on same date, it's next day
    if (isOvernightShift || (outTimeOnly < inTimeOnly && outTimeDateStr === inTimeDateStr)) {
      // For overnight shifts, out-time on the next day is expected
      // Ensure out-time date is set correctly
      if (!isOvernightShift && outTimeDateStr === inTimeDateStr) {
        // Same date but out-time earlier - must be next day
        outTimeDate = new Date(outTimeDate);
        outTimeDate.setDate(outTimeDate.getDate() + 1);
      }
      // For overnight shifts, the out-time date might already be correct, just ensure it's preserved
    }

    // Update outTime
    attendanceRecord.outTime = outTimeDate;

    // Mark as manually edited
    if (!attendanceRecord.source) attendanceRecord.source = [];
    if (!attendanceRecord.source.includes('manual')) {
      attendanceRecord.source.push('manual');
    }

    // Status will be automatically updated by the AttendanceDaily pre-save hook 
    // based on total hours, OD hours and shift duration (70% threshold)

    // Re-run shift detection with new outTime
    const detectionResult = await detectAndAssignShift(
      employeeNumber.toUpperCase(),
      date,
      attendanceRecord.inTime,
      outTimeDate,
      generalConfig
    );

    if (detectionResult.success && detectionResult.assignedShift) {
      attendanceRecord.shiftId = detectionResult.assignedShift;
      attendanceRecord.lateInMinutes = detectionResult.lateInMinutes;
      attendanceRecord.earlyOutMinutes = detectionResult.earlyOutMinutes;
      attendanceRecord.isLateIn = detectionResult.isLateIn || false;
      attendanceRecord.isEarlyOut = detectionResult.isEarlyOut || false;
      attendanceRecord.expectedHours = detectionResult.expectedHours;

      // Update roster tracking if rosterRecordId exists
      if (detectionResult.rosterRecordId) {
        await PreScheduledShift.findByIdAndUpdate(detectionResult.rosterRecordId, {
          attendanceDailyId: attendanceRecord._id
        });
      }
    }

    // Check and resolve ConfusedShift if exists
    const ConfusedShift = require('../../shifts/model/ConfusedShift');
    const confusedShift = await ConfusedShift.findOne({
      employeeNumber: employeeNumber.toUpperCase(),
      date: date,
      status: 'pending',
    });

    if (confusedShift && detectionResult.success && detectionResult.assignedShift) {
      // Resolve ConfusedShift
      confusedShift.status = 'resolved';
      confusedShift.assignedShiftId = detectionResult.assignedShift;
      confusedShift.reviewedBy = req.user?.userId || req.user?._id;
      confusedShift.reviewedAt = new Date();
      await confusedShift.save();
    }

    // If out-time is on next day (for overnight shifts), ensure it's stored with correct date
    // The attendance record date should remain as the shift date (in-time date)
    // But out-time can be on the next day

    await attendanceRecord.save();

    // If this is an overnight shift and out-time is on next day, ensure next day doesn't have duplicate
    if (attendanceRecord.shiftId && typeof attendanceRecord.shiftId === 'object' && attendanceRecord.shiftId.startTime) {
      const shift = attendanceRecord.shiftId;
      const [shiftStartHour] = shift.startTime.split(':').map(Number);
      const isOvernight = shiftStartHour >= 20;

      if (isOvernight && attendanceRecord.outTime) {
        const outDateStr = formatDate(attendanceRecord.outTime);
        if (outDateStr !== date) {
          // Out-time is on next day - check and clean up duplicate record if exists
          const nextDayRecord = await AttendanceDaily.findOne({
            employeeNumber: employeeNumber.toUpperCase(),
            date: outDateStr,
          });

          // If next day has only out-time (no in-time), it's likely a duplicate - remove it
          if (nextDayRecord && !nextDayRecord.inTime && nextDayRecord.outTime) {
            // Check if it's the same out-time
            const nextDayOutTimeStr = formatDate(nextDayRecord.outTime);
            const currentOutTimeStr = formatDate(attendanceRecord.outTime);
            if (nextDayOutTimeStr === currentOutTimeStr) {
              await AttendanceDaily.deleteOne({ _id: nextDayRecord._id });
            }
          }
        }
      }
    }

    // Detect extra hours
    const { detectExtraHours } = require('../services/extraHoursService');
    await detectExtraHours(employeeNumber.toUpperCase(), date);

    // Recalculate monthly summary for both current and next day (if overnight)
    const { recalculateOnAttendanceUpdate } = require('../services/summaryCalculationService');
    await recalculateOnAttendanceUpdate(employeeNumber.toUpperCase(), date);

    // If out-time is on next day, also recalculate next day's summary
    if (attendanceRecord.outTime) {
      const outDateStr = formatDate(attendanceRecord.outTime);
      if (outDateStr !== date) {
        await recalculateOnAttendanceUpdate(employeeNumber.toUpperCase(), outDateStr);
      }
    }

    const updatedRecord = await AttendanceDaily.findOne({
      employeeNumber: employeeNumber.toUpperCase(),
      date: date,
    })
      .populate('shiftId', 'name startTime endTime duration payableShifts');

    res.status(200).json({
      success: true,
      message: 'Out time updated successfully',
      data: updatedRecord,
    });

  } catch (error) {
    console.error('Error updating out time:', error);
    res.status(500).json({
      success: false,
      message: 'Error updating out time',
      error: error.message,
    });
  }
};

/**
 * @desc    Manually assign shift to attendance record
 * @route   PUT /api/attendance/:employeeNumber/:date/shift
 * @access  Private (Super Admin, Sub Admin, HR, HOD)
 */
exports.assignShift = async (req, res) => {
  try {
    const { employeeNumber, date } = req.params;
    const { shiftId } = req.body;

    // Restrict to HR/Superadmin
    if (!req.user || (req.user.role !== 'hr' && req.user.role !== 'super_admin' && req.user.role !== 'superadmin' && req.user.role !== 'admin')) {
      return res.status(403).json({
        success: false,
        message: 'Permission denied. Only HR can assign shifts.'
      });
    }

    if (!shiftId) {
      return res.status(400).json({
        success: false,
        message: 'Shift ID is required',
      });
    }

    // Get attendance record
    const AttendanceDaily = require('../model/AttendanceDaily');
    const attendanceRecord = await AttendanceDaily.findOne({
      employeeNumber: employeeNumber.toUpperCase(),
      date: date,
    }).populate('shiftId');

    if (!attendanceRecord) {
      return res.status(404).json({
        success: false,
        message: 'Attendance record not found',
      });
    }

    if (!attendanceRecord.inTime) {
      return res.status(400).json({
        success: false,
        message: 'Attendance record has no in-time',
      });
    }

    // Verify shift exists
    const shift = await Shift.findById(shiftId);
    if (!shift) {
      return res.status(404).json({
        success: false,
        message: 'Shift not found',
      });
    }

    // Delete ConfusedShift if it exists for this date
    const ConfusedShift = require('../../shifts/model/ConfusedShift');
    const confusedShift = await ConfusedShift.findOne({
      employeeNumber: employeeNumber.toUpperCase(),
      date: date,
      status: 'pending',
    });

    if (confusedShift) {
      confusedShift.status = 'resolved';
      confusedShift.assignedShiftId = shiftId;
      confusedShift.reviewedBy = req.user?.userId || req.user?._id;
      confusedShift.reviewedAt = new Date();
      await confusedShift.save();
    }

    // Calculate late-in and early-out with the assigned shift
    const { calculateLateIn, calculateEarlyOut } = require('../../shifts/services/shiftDetectionService');
    // Fetch global general settings
    const generalConfig = await Settings.getSettingsByCategory('general');
    const globalLateInGrace = generalConfig.late_in_grace_time ?? null;
    const globalEarlyOutGrace = generalConfig.early_out_grace_time ?? null;

    // Pass the date parameter for proper overnight shift handling
    const lateInMinutes = calculateLateIn(attendanceRecord.inTime, shift.startTime, shift.gracePeriod || 15, date, globalLateInGrace);
    const earlyOutMinutes = attendanceRecord.outTime
      ? calculateEarlyOut(attendanceRecord.outTime, shift.endTime, shift.startTime, date, globalEarlyOutGrace)
      : null;

    // Update attendance record
    attendanceRecord.shiftId = shiftId;
    attendanceRecord.lateInMinutes = lateInMinutes > 0 ? lateInMinutes : null;
    attendanceRecord.earlyOutMinutes = earlyOutMinutes && earlyOutMinutes > 0 ? earlyOutMinutes : null;
    attendanceRecord.isLateIn = lateInMinutes > 0;
    attendanceRecord.isEarlyOut = earlyOutMinutes && earlyOutMinutes > 0;
    attendanceRecord.isEarlyOut = earlyOutMinutes && earlyOutMinutes > 0;
    attendanceRecord.expectedHours = shift.duration;

    // Mark as manually edited
    if (!attendanceRecord.source) attendanceRecord.source = [];
    if (!attendanceRecord.source.includes('manual')) {
      attendanceRecord.source.push('manual');
    }

    await attendanceRecord.save();

    // Update roster tracking for manual assignment
    const PreScheduledShift = require('../../shifts/model/PreScheduledShift');
    const rosterRecord = await PreScheduledShift.findOne({
      employeeNumber: employeeNumber.toUpperCase(),
      date: date
    });

    if (rosterRecord) {
      const isDeviation = rosterRecord.shiftId && rosterRecord.shiftId.toString() !== shiftId.toString();
      rosterRecord.actualShiftId = shiftId;
      rosterRecord.isDeviation = !!isDeviation;
      rosterRecord.attendanceDailyId = attendanceRecord._id;
      await rosterRecord.save();
    }

    // Detect extra hours if out-time exists
    if (attendanceRecord.outTime) {
      const { detectExtraHours } = require('../services/extraHoursService');
      await detectExtraHours(employeeNumber.toUpperCase(), date);
    }

    // Recalculate monthly summary
    const { recalculateOnAttendanceUpdate } = require('../services/summaryCalculationService');
    await recalculateOnAttendanceUpdate(employeeNumber.toUpperCase(), date);

    const updatedRecord = await AttendanceDaily.findOne({
      employeeNumber: employeeNumber.toUpperCase(),
      date: date,
    })
      .populate('shiftId', 'name startTime endTime duration payableShifts');

    res.status(200).json({
      success: true,
      message: 'Shift assigned successfully',
      data: updatedRecord,
    });

  } catch (error) {
    console.error('Error assigning shift:', error);
    res.status(500).json({
      success: false,
      message: 'Error assigning shift',
      error: error.message,
    });
  }
};

/**
 * @desc    Get recent live activity feed for dashboard
 * @route   GET /api/attendance/activity/recent
 * @access  Private
 */
exports.getRecentActivity = async (req, res) => {
  try {
    const { page = 1, limit = 20 } = req.query;
    const skip = (parseInt(page) - 1) * parseInt(limit);

    // 1. Determine Scope & Filter
    let logQuery = {};

    // If we have a specific scope filter (Division/HR/HOD/Emp)
    if (req.scopeFilter && Object.keys(req.scopeFilter).length > 0) {
      // Find allowed Employee Numbers
      const allowedEmployees = await Employee.find(req.scopeFilter).select('emp_no').lean();
      const allowedEmpNos = allowedEmployees.map(e => e.emp_no);

      if (allowedEmpNos.length === 0) {
        return res.status(200).json({
          success: true,
          data: [],
          pagination: { page: parseInt(page), limit: parseInt(limit), total: 0, totalPages: 0 }
        });
      }
      logQuery.employeeNumber = { $in: allowedEmpNos };
    }

    // 2. Fetch Recent Logs (Paginated)
    const rawLogs = await AttendanceRawLog.find(logQuery)
      .sort({ timestamp: -1 })
      .skip(skip)
      .limit(parseInt(limit))
      .lean();

    const total = await AttendanceRawLog.countDocuments(logQuery);

    if (rawLogs.length === 0) {
      return res.status(200).json({
        success: true,
        data: [],
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total,
          totalPages: Math.ceil(total / parseInt(limit))
        }
      });
    }

    // 3. Hydrate Data
    const uniqueEmpNos = [...new Set(rawLogs.map(l => l.employeeNumber))];

    const employeesInfo = await Employee.find({ emp_no: { $in: uniqueEmpNos } })
      .select('emp_no employee_name department_id designation_id')
      .populate('department_id', 'name')
      .populate('designation_id', 'name')
      .lean();

    const empMap = {};
    employeesInfo.forEach(e => { empMap[e.emp_no] = e; });

    const dailyMap = {};
    const relevantDates = [...new Set(rawLogs.map(l => ({ emp: l.employeeNumber, date: l.date })))];

    const dailyQuery = {
      $or: relevantDates.map(i => ({ employeeNumber: i.emp, date: i.date }))
    };

    if (relevantDates.length > 0) {
      const dailyRecords = await AttendanceDaily.find(dailyQuery)
        .select('employeeNumber date shiftId status')
        .populate('shiftId', 'name startTime endTime')
        .lean();

      dailyRecords.forEach(d => {
        dailyMap[`${d.employeeNumber}_${d.date}`] = d;
      });
    }

    // 4. Assemble Response
    const activityFeed = rawLogs.map(log => {
      const emp = empMap[log.employeeNumber] || {};
      const daily = dailyMap[`${log.employeeNumber}_${log.date}`] || {};
      const shift = daily.shiftId || {};

      return {
        _id: log._id,
        timestamp: log.timestamp,
        employee: {
          name: emp.employee_name || 'Unknown',
          number: log.employeeNumber,
          department: emp.department_id?.name || '-',
          designation: emp.designation_id?.name || '-'
        },
        punch: {
          type: log.type,
          subType: log.subType,
          device: log.deviceName || log.deviceId
        },
        shift: {
          name: shift.name || 'Detecting...',
          startTime: shift.startTime,
          endTime: shift.endTime
        },
        status: daily.status || 'PROCESSING'
      };
    });

    res.status(200).json({
      success: true,
      data: activityFeed,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        totalPages: Math.ceil(total / parseInt(limit))
      }
    });

  } catch (error) {
    console.error('Error fetching recent activity:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch activity feed'
    });
  }
};

/**
 * @desc    Update inTime for attendance record (manual correction)
 * @route   PUT /api/attendance/:employeeNumber/:date/intime
 * @access  Private (Super Admin, HR)
 */
exports.updateInTime = async (req, res) => {
  try {
    const { employeeNumber, date } = req.params;
    const { inTime } = req.body;

    // Validate inTime format (YYYY-MM-DDTHH:mm:ss.sssZ or similar ISO string)
    if (!inTime) {
      return res.status(400).json({
        success: false,
        message: 'In Time is required',
      });
    }

    // Get attendance record
    const AttendanceDaily = require('../model/AttendanceDaily');
    const attendanceRecord = await AttendanceDaily.findOne({
      employeeNumber: employeeNumber.toUpperCase(),
      date: date,
    }).populate('shiftId');

    if (!attendanceRecord) {
      return res.status(404).json({
        success: false,
        message: 'Attendance record not found',
      });
    }

    // Parse new In Time
    // Ensure the date part matches the attendance date (or handle overnight shifts carefully if changing date)
    // For simplicity, we assume the user sends the full ISO string
    const newInTime = new Date(inTime);

    // Update inTime
    attendanceRecord.inTime = newInTime;

    // Status update logic (if needed - e.g. was Absent, now Present?) 
    // Usually if record exists, status is likely Present or Partial. 
    // If status was Absent but record exists (rare unless manually created), ensure it is Present/Partial.
    if (attendanceRecord.status === 'ABSENT') {
      attendanceRecord.status = 'PRESENT'; // Or 'PARTIAL' depends on later checks
    }

    // Mark as manual
    if (!attendanceRecord.source) attendanceRecord.source = [];
    if (!attendanceRecord.source.includes('manual')) {
      attendanceRecord.source.push('manual');
    }

    // Recalculate Late In
    const { calculateLateIn, calculateEarlyOut } = require('../../shifts/services/shiftDetectionService');
    const Settings = require('../model/AttendanceSettings'); // Or verify correct path
    // Wait, Settings model import path might be different based on project structure
    // In `assignShift` it was passed or imported. Let's use generic getter if available or default.
    // Actually, `attendanceController` likely has `Settings` required at top or uses helper.
    // I'll check imports at top of file separately if needed, but safe to assume I can require it if not sure.
    // Checking `assignShift` logic (approx line 668): `const Settings = require('../model/AttendanceSettings');`
    // Wait, earlier view showed `const generalConfig = await Settings.getSettingsByCategory('general');` so `Settings` must be available or imported.
    // I will dynamically require it to be safe as I am appending to bottom.

    // In assignShift (Line 668, based on earlier view), `Settings` seemed to be used. 
    // Let's assume standard import pattern or locally require if needed.
    // I'll check `assignShift` in previous turn output... 
    // Line 668: `const generalConfig = await Settings.getSettingsByCategory('general');`
    // So `Settings` is likely defined at module scope or imported inside function? 
    // Javascript allows `require` anywhere.

    const SettingsModel = require('../model/AttendanceSettings');
    const generalConfig = await SettingsModel.getSettingsByCategory('general');
    const globalLateInGrace = generalConfig.late_in_grace_time ?? null;
    const globalEarlyOutGrace = generalConfig.early_out_grace_time ?? null;

    if (attendanceRecord.shiftId) {
      const shift = attendanceRecord.shiftId;
      const lateInMinutes = calculateLateIn(newInTime, shift.startTime, shift.gracePeriod || 15, date, globalLateInGrace);
      attendanceRecord.lateInMinutes = lateInMinutes > 0 ? lateInMinutes : null;
      attendanceRecord.isLateIn = lateInMinutes > 0;

      // Also recalculate Early Out if OutTime exists (since total hours change, usually logic is independent but good to be safe)
      // Actually Late In depends on In Time. Early Out depends on Out Time.
      // But Total Hours depends on both.
    }

    // Calculate Total Hours
    if (attendanceRecord.outTime) {
      const outTimeDate = new Date(attendanceRecord.outTime);
      const durationMs = outTimeDate - newInTime;
      const durationHours = durationMs / (1000 * 60 * 60);
      attendanceRecord.totalHours = durationHours > 0 ? durationHours : 0;
    }

    await attendanceRecord.save();

    // Recalculate monthly summary
    const { recalculateOnAttendanceUpdate } = require('../services/summaryCalculationService');
    await recalculateOnAttendanceUpdate(employeeNumber.toUpperCase(), date);

    const updatedRecord = await AttendanceDaily.findOne({
      employeeNumber: employeeNumber.toUpperCase(),
      date: date,
    }).populate('shiftId');

    res.status(200).json({
      success: true,
      message: 'In Time updated successfully',
      data: updatedRecord,
    });

  } catch (error) {
    console.error('Error updating in-time:', error);
    res.status(500).json({
      success: false,
      message: 'Error updating in-time',
      error: error.message,
    });
  }
};
