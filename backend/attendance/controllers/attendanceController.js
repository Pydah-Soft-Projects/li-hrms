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
const { extractISTComponents, getPayrollDateRange } = require('../../shared/utils/dateUtils');
const { buildLeftDuringPeriodOrClause, mergeScopeWithEmployeeClauses } = require('../services/attendanceEmployeeQuery');
const dateCycleService = require('../../leaves/services/dateCycleService');
const {
  getApprovedEsiLeaveForDate,
  sumPunchHours,
  upsertEsiOtForAttendanceDay,
} = require('../../overtime/services/esiLeaveOtService');
const { assertEmployeeNumberDateEditable } = require('../../shared/services/payrollPeriodLockService');
const { reprocessAttendanceForEmployeeDate } = require('../services/attendanceSyncService');

/**
 * Format date to YYYY-MM-DD
 */
const formatDate = (date) => {
  return extractISTComponents(date).dateStr;
};

const escapeRegex = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const isPayrollCompletedLockError = (error) =>
  String(error?.message || '').toLowerCase().includes('payroll batch is completed');
const isAttendanceImmutableError = (error) =>
  String(error?.code || '') === 'ATTENDANCE_DAILY_LOCKED' ||
  String(error?.reason || '') === 'attendance_daily_locked';

function buildAttendanceImmutableError(employeeNumber, date, reason = 'Attendance is locked and cannot be edited') {
  const error = new Error(`${reason} for ${String(employeeNumber).toUpperCase()} on ${date}`);
  error.code = 'ATTENDANCE_DAILY_LOCKED';
  error.reason = 'attendance_daily_locked';
  error.statusCode = 409;
  return error;
}

function assertAttendanceDailyUnlocked(attendanceRecord, employeeNumber, date) {
  if (attendanceRecord?.locked) {
    throw buildAttendanceImmutableError(
      employeeNumber,
      date,
      'Attendance is locked for a completed payroll period'
    );
  }
}

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

    // Default to current month if not provided (IST Aware)
    const { year: curYear, month: curMonth } = extractISTComponents(new Date());
    const targetYear = parseInt(year) || curYear;
    const targetMonth = parseInt(month) || curMonth;

    const pr = await getPayrollDateRange(targetYear, targetMonth);
    const rosterVisibility = buildLeftDuringPeriodOrClause(pr.startDate, pr.endDate);

    // Scope + same roster rule as monthly attendance (incl. left during this payroll month).
    // Do not spread rosterVisibility onto scopeFilter — both use `$or` and would overwrite scope.
    const employee = await Employee.findOne(
      mergeScopeWithEmployeeClauses(req.scopeFilter, [
        { emp_no: employeeNumber.toUpperCase() },
        rosterVisibility,
      ])
    );

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
      .populate('shifts.shiftId', 'name startTime endTime duration')
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
      .populate('shifts.shiftId', 'name startTime endTime duration gracePeriod');

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

    // Check for OT request (pending or approved) for Convert button logic
    const OT = require('../../overtime/model/OT');
    const Permission = require('../../permissions/model/Permission');
    const otRequest = await OT.findOne({
      employeeId: allowedEmployee._id,
      date: date,
      status: { $in: ['pending', 'approved', 'manager_approved', 'hod_approved'] },
      isActive: true,
    }).select('status otHours source rawOtHours computedOtHours otPolicySnapshot').lean();

    const approvedOt = await OT.findOne({
      employeeId: allowedEmployee._id,
      date: date,
      status: 'approved',
      isActive: true,
    }).select('otHours source rawOtHours computedOtHours otPolicySnapshot').lean();

    const permissionRequests = await Permission.find({
      employeeId: allowedEmployee._id,
      date,
      isActive: true,
      status: { $in: ['pending', 'approved', 'checked_out', 'checked_in'] },
    })
      .select('permissionType permittedEdgeTime permissionStartTime permissionEndTime permissionHours status gateOutTime gateInTime purpose comments')
      .sort({ createdAt: -1 })
      .lean();

    const approvedEsiLeave = await getApprovedEsiLeaveForDate(employeeNumber, date);
    const punchHours = sumPunchHours(record);
    const esiConversion = approvedEsiLeave
      ? {
        leaveId: approvedEsiLeave._id,
        isHalfDay: !!approvedEsiLeave.isHalfDay,
        halfDayType: approvedEsiLeave.halfDayType || null,
        punchHours,
        maxConvertibleHours: punchHours,
        consideredOtHours: Number(otRequest?.otHours) || 0,
        approvedOtHours: Number(approvedOt?.otHours) || 0,
        remainingHoursForAttendance: Math.max(0, (punchHours || 0) - (Number(otRequest?.otHours) || 0)),
      }
      : null;

    const isEsiLeaveDay =
      !!approvedEsiLeave &&
      String(approvedEsiLeave.leaveType || '').trim().toUpperCase() === 'ESI' &&
      !approvedEsiLeave.isHalfDay;
    const maskedRawLogs = isEsiLeaveDay ? [] : rawLogs;
    const maskedShifts = isEsiLeaveDay
      ? (record.shifts || []).map((s) => {
        const shiftObj = typeof s?.toObject === 'function' ? s.toObject() : s;
        return {
          ...shiftObj,
          inTime: null,
          outTime: null,
          punchHours: 0,
        };
      })
      : record.shifts;

    res.status(200).json({
      success: true,
      data: {
        ...record.toObject(),
        status: isEsiLeaveDay ? 'LEAVE' : record.status,
        shifts: maskedShifts,
        totalWorkingHours: isEsiLeaveDay ? 0 : record.totalWorkingHours,
        rawLogs: maskedRawLogs,
        otRequest: otRequest
          ? {
            status: otRequest.status,
            otHours: otRequest.otHours,
            source: otRequest.source || null,
            rawOtHours: Number(otRequest.rawOtHours ?? otRequest.otHours) || 0,
            consideredOtHours: Number(otRequest.computedOtHours ?? otRequest.otHours) || 0,
            otPolicySnapshot: otRequest.otPolicySnapshot || null,
          }
          : null,
        approvedOtHours: Number(approvedOt?.otHours) || 0,
        approvedOtActualHours: Number(approvedOt?.rawOtHours ?? approvedOt?.otHours) || 0,
        approvedOtConsideredHours: Number(approvedOt?.computedOtHours ?? approvedOt?.otHours) || 0,
        approvedEsiLeave: approvedEsiLeave
          ? {
            id: approvedEsiLeave._id,
            leaveType: approvedEsiLeave.leaveType,
            isHalfDay: !!approvedEsiLeave.isHalfDay,
            halfDayType: approvedEsiLeave.halfDayType || null,
          }
          : null,
        esiConversion,
        punchesHiddenDueToEsiLeave: isEsiLeaveDay,
        permissionRequests,
        leftDate: allowedEmployee.leftDate || null,
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
 * @desc    Set ESI half-day OT hours for a date (create/update OT)
 * @route   PUT /api/attendance/:employeeNumber/:date/esi-halfday-ot
 * @access  Private (Manager/HR/Admin/HOD)
 */
exports.setEsiHalfDayOtHours = async (req, res) => {
  try {
    const { employeeNumber, date } = req.params;
    const { otHours } = req.body || {};
    await assertEmployeeNumberDateEditable(employeeNumber, date);

    const allowedEmployee = await Employee.findOne({
      ...req.scopeFilter,
      emp_no: employeeNumber.toUpperCase(),
    });
    if (!allowedEmployee) {
      return res.status(403).json({ success: false, message: 'Access denied or employee not found' });
    }

    const approvedEsiLeave = await getApprovedEsiLeaveForDate(employeeNumber, date);
    if (!approvedEsiLeave) {
      return res.status(400).json({ success: false, message: 'No approved ESI leave found for this date' });
    }
    if (!approvedEsiLeave.isHalfDay) {
      return res.status(400).json({ success: false, message: 'This endpoint is only for half-day ESI leaves' });
    }

    const attendanceRecord = await AttendanceDaily.findOne({
      employeeNumber: employeeNumber.toUpperCase(),
      date,
    });
    if (!attendanceRecord) {
      return res.status(404).json({ success: false, message: 'Attendance record not found' });
    }

    const punchHours = sumPunchHours(attendanceRecord);
    const parsedOt = Number(otHours);
    if (!Number.isFinite(parsedOt) || parsedOt < 0 || parsedOt > punchHours) {
      return res.status(400).json({
        success: false,
        message: `otHours must be between 0 and ${punchHours}`,
      });
    }

    const result = await upsertEsiOtForAttendanceDay({
      leave: approvedEsiLeave,
      employee: allowedEmployee,
      attendanceRecord,
      date,
      requestedByUserId: req.user?._id || req.user?.userId,
      selectedOtHours: parsedOt,
    });
    if (!result.success) {
      return res.status(400).json({
        success: false,
        message: result.message || 'Failed to apply ESI half-day OT conversion',
      });
    }

    return res.status(200).json({
      success: true,
      message: `ESI half-day OT ${result.action} successfully`,
      data: {
        otId: result.data?._id || null,
        otHours: result.otHours,
        punchHours: result.punchHours,
        remainingHoursForAttendance: Math.max(0, (result.punchHours || 0) - (result.otHours || 0)),
      },
    });
  } catch (error) {
    console.error('Error setting ESI half-day OT hours:', error);
    if (isPayrollCompletedLockError(error)) {
      return res.status(409).json({
        success: false,
        message: error.message,
      });
    }
    return res.status(500).json({
      success: false,
      message: error.message || 'Failed to set ESI half-day OT hours',
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
    const pageNum = parseInt(page, 10) || 1;
    const limitNum = parseInt(limit, 10) || 50;
    const anchor = date ? new Date(date) : new Date();
    const cycle = await dateCycleService.getPayrollCycleForDate(anchor);
    const ps = extractISTComponents(cycle.startDate).dateStr;
    const pe = extractISTComponents(cycle.endDate).dateStr;
    const rosterVisibility = buildLeftDuringPeriodOrClause(ps, pe);

    const skip = limitNum === -1 ? 0 : (pageNum - 1) * limitNum;

    const employeesFilter = mergeScopeWithEmployeeClauses(req.scopeFilter, [rosterVisibility]);

    let employeeQuery = Employee.find(employeesFilter)
      .select('emp_no employee_name email division_id department_id designation_id doj')
      .populate('division_id', 'name')
      .populate('department_id', 'name')
      .populate('designation_id', 'name')
      .sort({ emp_no: 1 });

    if (limitNum !== -1) {
      employeeQuery = employeeQuery.skip(skip).limit(limitNum);
    }

    const employees = await employeeQuery;

    const total = await Employee.countDocuments(employeesFilter);

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

    const employeesWithAttendance = employees.map(emp => {
      const no = String(emp.emp_no || '').trim().toUpperCase();
      return {
        ...emp.toObject(),
        attendance: (no && attendanceMap[no]) || null,
      };
    });

    res.status(200).json({
      success: true,
      data: employeesWithAttendance,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        totalPages: limitNum === -1 ? 1 : Math.ceil(total / limitNum),
      },
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
    const { year, month, page = 1, limit = 20, search, divisionId, departmentId, designationId, startDate, endDate } = req.query;

    if (!year || !month) {
      return res.status(400).json({
        success: false,
        message: 'Year and month are required',
      });
    }

    const targetYear = parseInt(year, 10);
    const targetMonth = parseInt(month, 10);
    const dateCycleService = require('../../leaves/services/dateCycleService');

    let periodStartStr = startDate;
    let periodEndStr = endDate;
    if (!periodStartStr || !periodEndStr) {
      const anchorDateStr = `${targetYear}-${String(targetMonth).padStart(2, '0')}-15`;
      const periodInfo = await dateCycleService.getPeriodInfo(new Date(anchorDateStr));
      periodStartStr = extractISTComponents(periodInfo.payrollCycle.startDate).dateStr;
      periodEndStr = extractISTComponents(periodInfo.payrollCycle.endDate).dateStr;
    }

    const periodStart = new Date(`${periodStartStr}T00:00:00.000Z`);
    const periodEnd = new Date(`${periodEndStr}T23:59:59.999Z`);

    // Active employees, OR inactive employees whose last working day (leftDate) falls in this payroll period.
    // Must $and with scopeFilter: scope often has top-level `$or`; assigning `filter.$or` for roster would drop scope.
    const rosterVisibility = {
      $or: [
        { is_active: { $ne: false } },
        {
          is_active: false,
          leftDate: { $gte: periodStart, $lte: periodEnd },
        },
      ],
    };

    const extraClauses = [rosterVisibility];
    if (search) {
      const safeSearch = escapeRegex(search);
      extraClauses.push({
        $or: [
          { employee_name: { $regex: safeSearch, $options: 'i' } },
          { emp_no: { $regex: safeSearch, $options: 'i' } },
        ],
      });
    }
    if (divisionId) extraClauses.push({ division_id: divisionId });
    if (departmentId) extraClauses.push({ department_id: departmentId });
    if (designationId) extraClauses.push({ designation_id: designationId });

    const filter = mergeScopeWithEmployeeClauses(req.scopeFilter, extraClauses);

    const pageNum = parseInt(page, 10) || 1;
    const limitNum = parseInt(limit, 10) || 20;
    const skip = limitNum === -1 ? 0 : (pageNum - 1) * limitNum;

    let employeeFind = Employee.find(filter)
      .populate('division_id', 'name')
      .populate('department_id', 'name')
      .populate('designation_id', 'name')
      .sort({ employee_name: 1 });

    if (limitNum !== -1) {
      employeeFind = employeeFind.skip(skip).limit(limitNum);
    }

    // Active + those who left in this payroll period (and optional "fetch all" via limit=-1)
    const employees = await employeeFind;

    const totalEmployees = await Employee.countDocuments(filter);

    const { getMonthlyTableViewData } = require('../services/attendanceViewService');
    const employeesWithAttendance = await getMonthlyTableViewData(
      employees,
      year,
      month,
      periodStartStr,
      periodEndStr
    );

    res.status(200).json({
      success: true,
      data: employeesWithAttendance,
      pagination: {
        total: totalEmployees,
        page: pageNum,
        limit: limitNum,
        totalPages: limitNum === -1 ? 1 : Math.ceil(totalEmployees / limitNum),
      },
      month: parseInt(month),
      year: parseInt(year),
      daysInMonth: new Date(parseInt(year), parseInt(month), 0).getDate(),
      startDate: periodStartStr,
      endDate: periodEndStr,
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
    const { outTime, shiftRecordId } = req.body;
    await assertEmployeeNumberDateEditable(employeeNumber, date);

    const AttendanceSettings = require('../model/AttendanceSettings');
    const attSettings = await AttendanceSettings.getSettings();
    if (attSettings?.featureFlags?.allowOutTimeEditing === false) {
      return res.status(403).json({
        success: false,
        message: 'Out-time editing is disabled by settings.',
      });
    }

    // Restrict to HR/Superadmin/Subadmin
    if (!req.user || (req.user.role !== 'hr' && req.user.role !== 'sub_admin' && req.user.role !== 'super_admin' && req.user.role !== 'superadmin' && req.user.role !== 'admin')) {
      return res.status(403).json({
        success: false,
        message: 'Permission denied. Only HR and Admins can edit attendance details.'
      });
    }

    if (!outTime) {
      return res.status(400).json({
        success: false,
        message: 'Out time is required',
      });
    }

    // Get attendance record
    const AttendanceDaily = require('../model/AttendanceDaily');
    const Shift = require('../../shifts/model/Shift');
    const Settings = require('../../settings/model/Settings');

    // Fetch global general settings
    const generalConfig = await Settings.getSettingsByCategory('general');

    const attendanceRecord = await AttendanceDaily.findOne({
      employeeNumber: employeeNumber.toUpperCase(),
      date: date,
    }).populate('shifts.shiftId');

    if (!attendanceRecord) {
      return res.status(404).json({
        success: false,
        message: 'Attendance record not found',
      });
    }
    assertAttendanceDailyUnlocked(attendanceRecord, employeeNumber, date);

    // Ensure we have shifts
    if (!attendanceRecord.shifts || attendanceRecord.shifts.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'No shifts found for this attendance record',
      });
    }

    // Determine which shift to update
    let shiftSegment;

    if (shiftRecordId) {
      shiftSegment = attendanceRecord.shifts.id(shiftRecordId);
      if (!shiftSegment) {
        return res.status(404).json({
          success: false,
          message: 'Shift segment not found',
        });
      }
    } else {
      // Default to the last shift if not specified
      shiftSegment = attendanceRecord.shifts.find(s => !s.outTime) || attendanceRecord.shifts[attendanceRecord.shifts.length - 1];
    }

    // Check if shift has inTime
    if (!shiftSegment.inTime) {
      return res.status(400).json({
        success: false,
        message: 'Shift segment has no in-time',
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

    // Get shift details
    let shiftDetails = shiftSegment.shiftId;
    // If shiftId is just an ID (not populated), fetch it
    if (shiftDetails && !shiftDetails.startTime) {
      shiftDetails = await Shift.findById(shiftSegment.shiftId);
    }

    // Handle overnight logic
    let isOvernightShift = false;
    if (shiftDetails && shiftDetails.startTime && shiftDetails.endTime) {
      const [startH, startM] = shiftDetails.startTime.split(':').map(Number);
      const [endH, endM] = shiftDetails.endTime.split(':').map(Number);
      isOvernightShift = startH > 20 || (endH * 60 + endM) < (startH * 60 + startM);
    }
    // Auto-adjust date if needed (e.g. if outTime is earlier than inTime on same date)
    if (outTimeDate < shiftSegment.inTime && outTimeDate.toDateString() === shiftSegment.inTime.toDateString()) {
      outTimeDate.setDate(outTimeDate.getDate() + 1);
    }
    
    // --- NEW APPROACH: Add Manual Log and Trigger Full Re-Processing ---
    const punchDateStr = attendanceRecord.date;
    const oldOutTime = shiftSegment.outTime;
    
    // 1. Delete the PREVIOUS manual log for this specific segment (if it was manual)
    // We use the exact timestamp to avoid wiping out manual edits on OTHER segments of the same day
    if (oldOutTime) {
      await AttendanceRawLog.deleteOne({
        employeeNumber: attendanceRecord.employeeNumber,
        timestamp: oldOutTime,
        type: 'OUT',
        source: 'manual'
      });
    }

    // 2. Create the new manual log
    await AttendanceRawLog.create({
      employeeNumber: attendanceRecord.employeeNumber,
      timestamp: outTimeDate,
      type: 'OUT',
      source: 'manual',
      date: punchDateStr
    });

    // 3. Set isEdited to true as requested (now used for UI tracking only, not locking)
    attendanceRecord.isEdited = true;

    // 4. Update history
    attendanceRecord.editHistory.push({
      action: 'OUT_TIME_UPDATE',
      modifiedBy: req.user._id,
      modifiedByName: req.user.name,
      modifiedAt: new Date(),
      details: `Out time updated manually to ${outTimeDate.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true, timeZone: 'Asia/Kolkata' })}. Triggering full re-processing.`
    });

    // 5. Save the flags and history first
    await attendanceRecord.save();

    // 6. Trigger full system re-processing (handles multi-shift splitting, status, etc.)
    const reprocessResult = await reprocessAttendanceForEmployeeDate(
      attendanceRecord.employeeNumber,
      punchDateStr
    );

    if (!reprocessResult.success) {
      return res.status(500).json({
        success: false,
        message: 'Manual log saved but re-processing failed',
        error: reprocessResult.error
      });
    }

    return res.status(200).json({
      success: true,
      message: 'Out time updated and day re-processed successfully',
      data: reprocessResult.dailyRecord
    });
  } catch (error) {
    console.error('Error updating out time:', error);
    if (isPayrollCompletedLockError(error) || isAttendanceImmutableError(error)) {
      return res.status(409).json({
        success: false,
        code: error.code,
        reason: error.reason,
        message: error.message,
      });
    }
    res.status(500).json({
      success: false,
      message: 'Server error',
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
    const { shiftId, shiftRecordId } = req.body;
    await assertEmployeeNumberDateEditable(employeeNumber, date);

    // Restrict to HR/Superadmin/Subadmin
    if (!req.user || (req.user.role !== 'hr' && req.user.role !== 'sub_admin' && req.user.role !== 'super_admin' && req.user.role !== 'superadmin' && req.user.role !== 'admin')) {
      return res.status(403).json({
        success: false,
        message: 'Permission denied. Only HR and Admins can assign shifts.'
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
    const Shift = require('../../shifts/model/Shift');

    const attendanceRecord = await AttendanceDaily.findOne({
      employeeNumber: employeeNumber.toUpperCase(),
      date: date,
    });

    if (!attendanceRecord) {
      return res.status(404).json({
        success: false,
        message: 'Attendance record not found',
      });
    }
    assertAttendanceDailyUnlocked(attendanceRecord, employeeNumber, date);

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

    // Mark as manually edited
    if (!attendanceRecord.source) attendanceRecord.source = [];
    if (!attendanceRecord.source.includes('manual')) {
      attendanceRecord.source.push('manual');
    }
    // --- NEW APPROACH: Trigger Full Re-Processing ---
    
    // 1. Set isEdited to true (now used for UI tracking only, not locking)
    attendanceRecord.isEdited = true;

    attendanceRecord.editHistory.push({
      action: 'SHIFT_CHANGE',
      modifiedBy: req.user?._id || req.user?.userId,
      modifiedByName: req.user.name,
      modifiedAt: new Date(),
      details: `Changed shift to ${shift.name}. Triggering full re-processing.`
    });

    // 2. Save flags and history
    await attendanceRecord.save();

    // 3. Trigger full system re-processing
    // Since we updated rosterRecord.actualShiftId above, the engine will pick it up
    const reprocessResult = await reprocessAttendanceForEmployeeDate(
      attendanceRecord.employeeNumber,
      attendanceRecord.date
    );

    if (!reprocessResult.success) {
      return res.status(500).json({
        success: false,
        message: 'Shift assigned in roster but re-processing failed',
        error: reprocessResult.error
      });
    }

    return res.status(200).json({
      success: true,
      message: 'Shift assigned and day re-processed successfully',
      data: reprocessResult.dailyRecord
    });
  } catch (error) {
    console.error('Error assigning shift:', error);
    if (isPayrollCompletedLockError(error) || isAttendanceImmutableError(error)) {
      return res.status(409).json({
        success: false,
        code: error.code,
        reason: error.reason,
        message: error.message,
      });
    }
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
    const { inTime, shiftRecordId } = req.body;
    await assertEmployeeNumberDateEditable(employeeNumber, date);

    const AttendanceSettings = require('../model/AttendanceSettings');
    const attSettings = await AttendanceSettings.getSettings();
    if (attSettings?.featureFlags?.allowInTimeEditing === false) {
      return res.status(403).json({
        success: false,
        message: 'In-time editing is disabled by settings.',
      });
    }

    // Validate inTime format (YYYY-MM-DDTHH:mm:ss.sssZ or similar ISO string)
    if (!inTime) {
      return res.status(400).json({
        success: false,
        message: 'In Time is required',
      });
    }

    // Get attendance record
    const AttendanceDaily = require('../model/AttendanceDaily');
    const { reprocessAttendanceForEmployeeDate } = require('../services/attendanceProcessingService');
    const AttendanceRawLog = require('../model/AttendanceRawLog');

    const attendanceRecord = await AttendanceDaily.findOne({
      employeeNumber: employeeNumber.toUpperCase(),
      date: date,
    });

    if (!attendanceRecord) {
      return res.status(404).json({
        success: false,
        message: 'Attendance record not found',
      });
    }
    assertAttendanceDailyUnlocked(attendanceRecord, employeeNumber, date);

    // Parse new In Time
    const newInTime = new Date(inTime);

    // Mark as manual
    if (!attendanceRecord.source) attendanceRecord.source = [];
    if (!attendanceRecord.source.includes('manual')) {
      attendanceRecord.source.push('manual');
    }

    // --- NEW APPROACH: Add Manual Log and Trigger Full Re-Processing ---
    const punchDateStr = attendanceRecord.date;
    const oldInTime = shiftSegment.inTime;

    // 1. Delete the PREVIOUS manual log for this specific segment (if it was manual)
    if (oldInTime) {
      await AttendanceRawLog.deleteOne({
        employeeNumber: attendanceRecord.employeeNumber,
        timestamp: oldInTime,
        type: 'IN',
        source: 'manual'
      });
    }

    // 2. Create the new manual log
    await AttendanceRawLog.create({
      employeeNumber: attendanceRecord.employeeNumber,
      timestamp: newInTime,
      type: 'IN',
      source: 'manual',
      date: punchDateStr
    });

    // 3. Set isEdited to true (now used for UI tracking only, not locking)
    attendanceRecord.isEdited = true;

    // 4. Update history
    attendanceRecord.editHistory.push({
      action: 'IN_TIME_UPDATE',
      modifiedBy: req.user?._id || req.user?.userId,
      modifiedByName: req.user.name,
      modifiedAt: new Date(),
      details: `In time updated manually to ${newInTime.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true, timeZone: 'Asia/Kolkata' })}. Triggering full re-processing.`
    });

    // 5. Save flags and history
    await attendanceRecord.save();

    // 6. Trigger full system re-processing
    const reprocessResult = await reprocessAttendanceForEmployeeDate(
      attendanceRecord.employeeNumber,
      punchDateStr
    );

    if (!reprocessResult.success) {
      return res.status(500).json({
        success: false,
        message: 'Manual log saved but re-processing failed',
        error: reprocessResult.error
      });
    }

    return res.status(200).json({
      success: true,
      message: 'In time updated and day re-processed successfully',
      data: reprocessResult.dailyRecord
    });

  } catch (error) {
    console.error('Error updating in-time:', error);
    if (isPayrollCompletedLockError(error) || isAttendanceImmutableError(error)) {
      return res.status(409).json({
        success: false,
        code: error.code,
        reason: error.reason,
        message: error.message,
      });
    }
    res.status(500).json({
      success: false,
      message: 'Error updating in-time',
      error: error.message,
    });
  }
};
