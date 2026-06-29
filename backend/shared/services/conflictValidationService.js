/**
 * Conflict Validation Service
 * Validates conflicts between Leave, OD, OT, and Permission requests
 */

const Leave = require('../../leaves/model/Leave');
const OD = require('../../leaves/model/OD');
const OT = require('../../overtime/model/OT');
const Permission = require('../../permissions/model/Permission');
const AttendanceDaily = require('../../attendance/model/AttendanceDaily');
const { extractISTComponents, createISTDate } = require('../utils/dateUtils');
const {
  expandLeaveToDailySegments,
  getLeaveCoverageOnDate,
  checkDayHalfCoverageConflict,
  eachDateStrInRange,
} = require('../utils/leaveDayRangeUtils');
const {
  timeStringsOverlap,
  dateToIstTimeStr,
  computeHoursOdCredit,
  formatMinsAsHm,
  timeStrToMins,
} = require('../utils/hoursOdOverlapUtils');

/**
 * Inclusive calendar overlap in Asia/Kolkata (string compare on YYYY-MM-DD).
 */
const istYmdRangeOverlaps = (aFrom, aTo, bFrom, bTo) => {
  const a0 = extractISTComponents(aFrom).dateStr;
  const a1 = extractISTComponents(aTo).dateStr;
  const b0 = extractISTComponents(bFrom).dateStr;
  const b1 = extractISTComponents(bTo).dateStr;
  return a0 <= b1 && a1 >= b0;
};

/** For Mongo: instant bounds covering full IST start day → full IST end day (inclusive). */
const getIstQueryBounds = (fromDate, toDate) => {
  const fromStr = extractISTComponents(fromDate).dateStr;
  const toStr = extractISTComponents(toDate).dateStr;
  return {
    start: createISTDate(fromStr),
    end: new Date(`${toStr}T23:59:59.999+05:30`),
  };
};

/** User-facing error text: always the IST calendar day (avoids toLocaleDateString on UTC). */
const formatIstErrorDate = (date) => {
  if (!date) return '';
  const d = new Date(date);
  return new Intl.DateTimeFormat('en-IN', { timeZone: 'Asia/Kolkata', day: '2-digit', month: 'short', year: 'numeric' }).format(d);
};

/**
 * Check if a date falls within a date range
 * @param {String|Date} date - Date to check (YYYY-MM-DD or Date object)
 * @param {Date} fromDate - Start date
 * @param {Date} toDate - End date
 * @returns {Boolean}
 */
const isDateInRange = (date, fromDate, toDate) => {
  const checkDateStr = extractISTComponents(typeof date === 'string' ? new Date(`${date}T12:00:00+05:30`) : date).dateStr;
  const fromDateStr = extractISTComponents(fromDate).dateStr;
  const toDateStr = extractISTComponents(toDate).dateStr;
  return checkDateStr >= fromDateStr && checkDateStr <= toDateStr;
};

/**
 * Check if two dates are the same day (ignoring time)
 * @param {Date} date1 - First date
 * @param {Date} date2 - Second date
 * @returns {Boolean}
 */
const isSameDay = (date1, date2) => {
  return extractISTComponents(date1).dateStr === extractISTComponents(date2).dateStr;
};

/**
 * Check if two half-day requests conflict
 * @param {Boolean} isHalfDay1 - Is first request half day
 * @param {String} halfDayType1 - Half day type of first request ('first_half', 'second_half', null)
 * @param {Boolean} isHalfDay2 - Is second request half day
 * @param {String} halfDayType2 - Half day type of second request ('first_half', 'second_half', null)
 * @returns {Boolean} - true if they conflict
 */
const checkHalfDayConflict = (isHalfDay1, halfDayType1, isHalfDay2, halfDayType2) => {
  // If neither is half day, they conflict (both full day)
  if (!isHalfDay1 && !isHalfDay2) {
    return true;
  }

  // If one is full day and other is half day, they conflict
  if ((!isHalfDay1 && isHalfDay2) || (isHalfDay1 && !isHalfDay2)) {
    return true;
  }

  // Both are half day - check if same half
  if (isHalfDay1 && isHalfDay2) {
    // If same half type, they conflict
    if (halfDayType1 === halfDayType2) {
      return true;
    }
    // Different halves (first_half vs second_half) - no conflict
    return false;
  }

  return false;
};

/**
 * Check if employee has an approved or pending Leave on a date
 * @param {String} employeeId - Employee ID
 * @param {String} employeeNumber - Employee number
 * @param {String} date - Date to check (YYYY-MM-DD)
 * @param {Boolean} approvedOnly - If true, only check approved records (for creation). If false, check all (for approval)
 * @returns {Object} - { hasLeave: boolean, leave: Leave|null }
 */
const checkLeaveConflict = async (employeeId, employeeNumber, date, approvedOnly = false) => {
  try {
    const statusFilter = approvedOnly
      ? ['approved'] // Only approved for creation
      : ['pending', 'reporting_manager_approved', 'hod_approved', 'manager_approved', 'hr_approved', 'principal_approved', 'approved']; // All in-flight + approved

    const leaves = await Leave.find({
      $or: [
        { employeeId: employeeId },
        { emp_no: employeeNumber.toUpperCase() }
      ],
      status: { $in: statusFilter },
      isActive: true,
    });

    for (const leave of leaves) {
      if (isDateInRange(date, leave.fromDate, leave.toDate)) {
        return {
          hasLeave: true,
          leave: leave,
          message: `Employee has a ${leave.status} leave from ${formatIstErrorDate(leave.fromDate)} to ${formatIstErrorDate(leave.toDate)}`,
        };
      }
    }

    return {
      hasLeave: false,
      leave: null,
    };
  } catch (error) {
    console.error('Error checking leave conflict:', error);
    return {
      hasLeave: false,
      leave: null,
      error: error.message,
    };
  }
};

/**
 * Check if employee has an approved or pending OD on a date
 * @param {String} employeeId - Employee ID
 * @param {String} employeeNumber - Employee number
 * @param {String} date - Date to check (YYYY-MM-DD)
 * @param {Boolean} approvedOnly - If true, only check approved records (for creation). If false, check all (for approval)
 * @returns {Object} - { hasOD: boolean, od: OD|null }
 */
const checkODConflict = async (employeeId, employeeNumber, date, approvedOnly = false) => {
  try {
    const statusFilter = approvedOnly
      ? ['approved'] // Only approved for creation
      : ['pending', 'reporting_manager_approved', 'hod_approved', 'manager_approved', 'hr_approved', 'principal_approved', 'approved']; // All in-flight + approved

    const ods = await OD.find({
      $or: [
        { employeeId: employeeId },
        { emp_no: employeeNumber.toUpperCase() }
      ],
      status: { $in: statusFilter },
      isActive: true,
    });

    for (const od of ods) {
      if (isDateInRange(date, od.fromDate, od.toDate)) {
        return {
          hasOD: true,
          od: od,
          message: `Employee has a ${od.status} OD from ${formatIstErrorDate(od.fromDate)} to ${formatIstErrorDate(od.toDate)}`,
        };
      }
    }

    return {
      hasOD: false,
      od: null,
    };
  } catch (error) {
    console.error('Error checking OD conflict:', error);
    return {
      hasOD: false,
      od: null,
      error: error.message,
    };
  }
};

/**
 * Check if employee has attendance for a date
 * @param {String} employeeNumber - Employee number
 * @param {String} date - Date to check (YYYY-MM-DD)
 * @returns {Object} - { hasAttendance: boolean, attendance: AttendanceDaily|null }
 */
const checkAttendanceExists = async (employeeNumber, date) => {
  try {
    const attendance = await AttendanceDaily.findOne({
      employeeNumber: employeeNumber.toUpperCase(),
      date: date,
    });

    if (!attendance) {
      return {
        hasAttendance: false,
        attendance: null,
        message: 'No attendance record found for this date',
      };
    }

    // We no longer require an in-time to create a permission request, as requested by the user.
    // However, if there are shifts, we can still capture the first one's inTime for reference if we wanted to.

    // Just return success if the attendance record exists for the date
    return {
      hasAttendance: true,
      attendance: attendance,
    };
  } catch (error) {
    console.error('Error checking attendance:', error);
    return {
      hasAttendance: false,
      attendance: null,
      error: error.message,
    };
  }
};

/**
 * Set full-day presence flags on apply-dialog attendance info.
 */
const setFullDayAttendancePresence = (out, label = 'Full-day attendance present') => {
  out.firstHalfPresent = true;
  out.secondHalfPresent = true;
  out.fullDayPresent = true;
  out.label = label;
};

/**
 * From first shift's segments: which halves are marked present (break-aware).
 */
const presenceFromShiftSegments = (shift) => {
  const result = { first: false, second: false };
  if (!shift?.shiftSegments || !Array.isArray(shift.shiftSegments) || shift.shiftSegments.length < 2) {
    return result;
  }
  const firstHalf = shift.shiftSegments[0];
  const secondHalf = shift.shiftSegments[1];
  if (firstHalf?.segmentName?.toLowerCase() === 'firsthalf' && firstHalf.present === true) {
    result.first = true;
  }
  if (secondHalf?.segmentName?.toLowerCase() === 'secondhalf' && secondHalf.present === true) {
    result.second = true;
  }
  return result;
};

/**
 * Detect physical attendance half coverage from AttendanceDaily (same basis used in reconciliation).
 * Returns first/second/full coverage hints for apply dialog.
 */
const getAttendanceCoverageForDate = async (employeeNumber, date) => {
  const out = {
    hasAttendance: false,
    status: null,
    firstHalfPresent: false,
    secondHalfPresent: false,
    fullDayPresent: false,
    label: null,
    punchInTime: null,
    punchOutTime: null,
    shiftStartTime: null,
    shiftEndTime: null,
    expectedHours: null,
    punchHours: null,
  };
  try {
    const attendance = await AttendanceDaily.findOne({
      employeeNumber: employeeNumber.toUpperCase(),
      date: date,
    }).select('status totalLateInMinutes totalEarlyOutMinutes shifts inTime outTime totalWorkingHours');
    if (!attendance) return out;

    out.hasAttendance = true;
    out.status = attendance.status || null;

    const primaryShift =
      attendance.shifts && attendance.shifts.length > 0 ? attendance.shifts[0] : null;
    if (primaryShift) {
      out.shiftStartTime = primaryShift.shiftStartTime || null;
      out.shiftEndTime = primaryShift.shiftEndTime || null;
      out.expectedHours = primaryShift.expectedHours ?? null;
      out.punchHours = primaryShift.punchHours ?? null;
      out.punchInTime = dateToIstTimeStr(primaryShift.inTime);
      out.punchOutTime = dateToIstTimeStr(primaryShift.outTime);
    }
    if (!out.punchInTime && attendance.inTime) {
      out.punchInTime = dateToIstTimeStr(attendance.inTime);
    }
    if (!out.punchOutTime && attendance.outTime) {
      out.punchOutTime = dateToIstTimeStr(attendance.outTime);
    }

    const st = String(attendance.status || '').toUpperCase();
    if (st === 'PRESENT') {
      setFullDayAttendancePresence(out);
      return out;
    }

    if (st === 'HALF_DAY') {
      // PRIORITY 1: shift segments (most accurate for half-day rows)
      if (attendance.shifts && attendance.shifts.length > 0) {
        const seg = presenceFromShiftSegments(attendance.shifts[0]);
        if (seg.first && seg.second) {
          setFullDayAttendancePresence(out);
          return out;
        }
        if (seg.first) {
          out.firstHalfPresent = true;
          out.label = 'First-half attendance present';
          return out;
        }
        if (seg.second) {
          out.secondHalfPresent = true;
          out.label = 'Second-half attendance present';
          return out;
        }
      }

      // PRIORITY 2: early-out vs late-in heuristic (backward compatibility)
      const eo = Number(attendance.totalEarlyOutMinutes) || 0;
      const li = Number(attendance.totalLateInMinutes) || 0;
      if (eo > li) {
        out.firstHalfPresent = true;
        out.label = 'First-half attendance present';
      } else if (li > eo) {
        out.secondHalfPresent = true;
        out.label = 'Second-half attendance present';
      } else {
        out.firstHalfPresent = true;
        out.label = 'First-half attendance present';
      }
      return out;
    }

    if (st === 'PARTIAL') {
      const { attendanceHalfPresenceFlags } = require('../../attendance/utils/attendanceHalfPresence');
      const { getProcessingModeForEmployeeNumber } = require('../../attendance/services/processingModeResolutionService');
      const processingMode = (await getProcessingModeForEmployeeNumber(employeeNumber)).mode;
      if (processingMode === 'single_shift') {
        const flags = attendanceHalfPresenceFlags(attendance, processingMode);
        out.firstHalfPresent = flags.attFirst;
        out.secondHalfPresent = flags.attSecond;
        out.fullDayPresent = flags.attFirst && flags.attSecond;
        if (flags.attFirst && flags.attSecond) {
          out.label = 'Full-day attendance present (partial)';
        } else if (flags.attFirst) {
          out.label = 'First-half attendance present (partial check-in)';
        } else if (flags.attSecond) {
          out.label = 'Second-half attendance present (partial check-out)';
        } else {
          out.label = 'Partial attendance present';
        }
        return out;
      }
      out.label = 'Partial attendance present';
      return out;
    }

    out.label = st ? `${st} attendance row exists` : 'Attendance row exists';
    return out;
  } catch (error) {
    console.error('Error resolving attendance coverage:', error);
    return out;
  }
};

/**
 * Validate OT request - check conflicts and attendance
 * @param {String} employeeId - Employee ID
 * @param {String} employeeNumber - Employee number
 * @param {String} date - Date (YYYY-MM-DD)
 * @returns {Object} - Validation result
 */
const validateOTRequest = async (employeeId, employeeNumber, date) => {
  const errors = [];
  const warnings = [];

  // Check attendance
  const attendanceCheck = await checkAttendanceExists(employeeNumber, date);
  if (!attendanceCheck.hasAttendance) {
    errors.push(attendanceCheck.message || 'Attendance record not found or incomplete');
  }

  // Check Leave conflict
  const leaveCheck = await checkLeaveConflict(employeeId, employeeNumber, date);
  if (leaveCheck.hasLeave) {
    errors.push(leaveCheck.message || 'Employee has a leave on this date');
  }

  // Check OD conflict
  const odCheck = await checkODConflict(employeeId, employeeNumber, date);
  if (odCheck.hasOD) {
    errors.push(odCheck.message || 'Employee has an OD on this date');
  }

  return {
    isValid: errors.length === 0,
    errors: errors,
    warnings: warnings,
    attendance: attendanceCheck.attendance,
    leave: leaveCheck.leave,
    od: odCheck.od,
  };
};

/**
 * Validate Permission request - check conflicts and attendance
 * @param {String} employeeId - Employee ID
 * @param {String} employeeNumber - Employee number
 * @param {String} date - Date (YYYY-MM-DD)
 * @returns {Object} - Validation result
 */
const validatePermissionRequest = async (employeeId, employeeNumber, date, options = {}) => {
  const errors = [];
  const warnings = [];
  const permissionType = options.permissionType || 'mid_shift';

  const attendanceCheck = await checkAttendanceExists(employeeNumber, date);
  if (permissionType === 'mid_shift') {
    if (!attendanceCheck.hasAttendance) {
      errors.push(attendanceCheck.message || 'No attendance record found for this date');
    }
  } else if (!attendanceCheck.hasAttendance) {
    warnings.push(
      'No attendance daily record yet for this date. Edge permissions still apply after punches sync and gate scan.'
    );
  }

  // Check Leave conflict
  const leaveCheck = await checkLeaveConflict(employeeId, employeeNumber, date);
  if (leaveCheck.hasLeave) {
    errors.push(leaveCheck.message || 'Employee has a leave on this date');
  }

  // Check OD conflict
  const odCheck = await checkODConflict(employeeId, employeeNumber, date);
  if (odCheck.hasOD) {
    errors.push(odCheck.message || 'Employee has an OD on this date');
  }

  return {
    isValid: errors.length === 0,
    errors: errors,
    warnings: warnings,
    attendance: attendanceCheck.attendance,
    leave: leaveCheck.leave,
    od: odCheck.od,
  };
};

/**
 * Validate Leave request - check OD conflict with half-day support
 * @param {String} employeeId - Employee ID
 * @param {String} employeeNumber - Employee number
 * @param {Date} fromDate - Start date
 * @param {Date} toDate - End date
 * @param {Boolean} isHalfDay - Is this a half-day leave
 * @param {String} halfDayType - Half day type ('first_half', 'second_half', null)
 * @param {Boolean} approvedOnly - If true, only check approved records (for creation). If false, check all (for approval)
 * @returns {Object} - Validation result
 */
const validateLeaveRequest = async (
  employeeId,
  employeeNumber,
  fromDate,
  toDate,
  isHalfDay = false,
  halfDayType = null,
  approvedOnly = true,
  excludeId = null,
  boundaryNorm = null
) => {
  const errors = [];
  const warnings = [];

  const requestedSegments = expandLeaveToDailySegments({
    fromDate,
    toDate: toDate || fromDate,
    isHalfDay,
    halfDayType,
    ...(boundaryNorm || {}),
  });

  // IST instants for Mongo pre-filter; calendar overlap is verified in IST
  const { start, end } = getIstQueryBounds(fromDate, toDate);

  // Resolve status list: for creation, block both pending AND approved records
  const statusFilter = ['pending', 'reporting_manager_approved', 'hod_approved', 'manager_approved', 'hr_approved', 'principal_approved', 'approved'];

  const formatHalfLabel = (isHalf, half) =>
    isHalf ? (half === 'second_half' ? 'Second Half' : 'First Half') : 'Full Day';

  // 1. Validate against OD conflicts
  const ods = await OD.find({
    $or: [
      { employeeId: employeeId },
      { emp_no: employeeNumber.toUpperCase() }
    ],
    status: { $in: statusFilter },
    isActive: true,
    // Optimization: Only fetch potentially overlapping records
    fromDate: { $lte: end },
    toDate: { $gte: start },
  });

  const conflictingODs = [];

  // Check each OD for conflicts (per overlapping calendar day)
  for (const od of ods) {
    if (!istYmdRangeOverlaps(fromDate, toDate, od.fromDate, od.toDate)) continue;

    const overlapDates = eachDateStrInRange(fromDate, toDate).filter((d) =>
      eachDateStrInRange(od.fromDate, od.toDate).includes(d)
    );

    for (const dateStr of overlapDates) {
      const reqSeg = requestedSegments.find((s) => s.dateStr === dateStr);
      if (!reqSeg) continue;
      const reqCov = {
        isHalfDay: reqSeg.isHalfDay,
        halfDayType: reqSeg.halfDayType,
      };
      let odCov;
      if (isSameDay(od.fromDate, od.toDate)) {
        odCov = { isHalfDay: Boolean(od.isHalfDay), halfDayType: od.halfDayType };
      } else if (dateStr === extractISTComponents(od.fromDate).dateStr && od.fromIsHalfDay) {
        odCov = { isHalfDay: true, halfDayType: od.fromHalfDayType || 'second_half' };
      } else if (dateStr === extractISTComponents(od.toDate).dateStr && od.toIsHalfDay) {
        odCov = { isHalfDay: true, halfDayType: od.toHalfDayType || 'first_half' };
      } else {
        odCov = { isHalfDay: false, halfDayType: null };
      }

      if (checkDayHalfCoverageConflict(reqCov, odCov)) {
        conflictingODs.push(od);
        const statusText = od.status === 'approved' ? 'approved' : 'pending';
        errors.push(
          `Employee has a ${statusText} OD on ${formatIstErrorDate(createISTDate(dateStr, '00:00'))} that conflicts with this leave (${formatHalfLabel(reqCov.isHalfDay, reqCov.halfDayType)} vs ${formatHalfLabel(odCov.isHalfDay, odCov.halfDayType)})`
        );
        break;
      }
    }
  }

  // 2. Validate against OTHER LEAVE conflicts (Same type)
  const leaves = await Leave.find({
    $or: [
      { employeeId: employeeId },
      { emp_no: employeeNumber.toUpperCase() }
    ],
    status: { $in: statusFilter },
    isActive: true,
    // Optimization: Only fetch potentially overlapping records
    fromDate: { $lte: end },
    toDate: { $gte: start },
  });

  const conflictingLeaves = [];

  for (const leave of leaves) {
    if (excludeId && String(leave._id) === String(excludeId)) continue;
    if (!istYmdRangeOverlaps(fromDate, toDate, leave.fromDate, leave.toDate)) continue;

    const overlapDates = eachDateStrInRange(fromDate, toDate).filter((d) =>
      eachDateStrInRange(leave.fromDate, leave.toDate).includes(d)
    );

    for (const dateStr of overlapDates) {
      const reqSeg = requestedSegments.find((s) => s.dateStr === dateStr);
      const existCov = getLeaveCoverageOnDate(leave, dateStr);
      if (!reqSeg || !existCov) continue;
      const reqCov = { isHalfDay: reqSeg.isHalfDay, halfDayType: reqSeg.halfDayType };
      if (checkDayHalfCoverageConflict(reqCov, existCov)) {
        conflictingLeaves.push(leave);
        const statusText = leave.status === 'approved' ? 'approved' : 'pending';
        errors.push(
          `Employee has a ${statusText} leave on ${formatIstErrorDate(createISTDate(dateStr, '00:00'))} that conflicts with this request (${formatHalfLabel(reqCov.isHalfDay, reqCov.halfDayType)} vs ${formatHalfLabel(existCov.isHalfDay, existCov.halfDayType)})`
        );
        break;
      }
    }
  }

  return {
    isValid: errors.length === 0,
    errors: errors,
    warnings: warnings,
    conflictingODs: conflictingODs,
    conflictingLeaves: conflictingLeaves,
  };
};

/**
 * Validate OD request - check Leave conflict with half-day support
 * @param {String} employeeId - Employee ID
 * @param {String} employeeNumber - Employee number
 * @param {Date} fromDate - Start date
 * @param {Date} toDate - End date
 * @param {Boolean} isHalfDay - Is this a half-day OD
 * @param {String} halfDayType - Half day type ('first_half', 'second_half', null)
 * @param {Boolean} approvedOnly - If true, only check approved records (for creation). If false, check all (for approval)
 * @returns {Object} - Validation result
 */
const isFullDayOdRecord = (od) => {
  if (!od) return false;
  if (String(od.odType_extended || '') === 'hours') return false;
  if (od.isHalfDay || String(od.odType_extended || '') === 'half_day') return false;
  const nd = Number(od.numberOfDays);
  return !(Number.isFinite(nd) && nd > 0 && nd < 1 - 1e-6);
};

const isHalfDayOdRecord = (od) => {
  if (!od) return false;
  if (String(od.odType_extended || '') === 'hours') return false;
  return Boolean(od.isHalfDay || String(od.odType_extended || '') === 'half_day');
};

const isHoursOdRecord = (od) => String(od?.odType_extended || '') === 'hours';

/**
 * Validate hour-based OD against attendance punches + shift (gap credit only).
 */
const validateHoursOdAttendance = async (employeeNumber, dateStr, odStartTime, odEndTime) => {
  const errors = [];
  const warnings = [];
  const attendanceInfo = await getAttendanceCoverageForDate(employeeNumber, dateStr);
  const credit = computeHoursOdCredit({
    odStartTime,
    odEndTime,
    shiftStartTime: attendanceInfo.shiftStartTime,
    shiftEndTime: attendanceInfo.shiftEndTime,
    punchInTime: attendanceInfo.punchInTime,
    punchOutTime: attendanceInfo.punchOutTime,
  });

  if (credit.fullyCoveredByPunches) {
    errors.push(
      `OD window ${odStartTime}–${odEndTime} is fully covered by attendance punches (${attendanceInfo.punchInTime}–${attendanceInfo.punchOutTime}). No gap to credit — adjust times or correct attendance first.`
    );
  } else if (credit.partialPunchOverlap) {
    warnings.push(
      `Only about ${formatMinsAsHm(credit.creditableMinutes)} of ${formatMinsAsHm(credit.requestedMinutes)} will count after punch overlap.`
    );
  }

  if (credit.odOutsideShift && attendanceInfo.shiftStartTime && attendanceInfo.shiftEndTime) {
    warnings.push(
      `OD is outside assigned shift (${attendanceInfo.shiftStartTime}–${attendanceInfo.shiftEndTime}) and may not improve attendance.`
    );
  }

  if (!attendanceInfo.punchInTime && !attendanceInfo.punchOutTime) {
    warnings.push(
      'No punches recorded yet. Hour OD will credit when attendance is processed if it falls within the shift window.'
    );
  }

  return {
    isValid: errors.length === 0,
    errors,
    warnings,
    credit,
    attendanceInfo,
  };
};

const validateODRequest = async (
  employeeId,
  employeeNumber,
  fromDate,
  toDate,
  isHalfDay = false,
  halfDayType = null,
  approvedOnly = true,
  excludeId = null,
  odOptions = null
) => {
  const errors = [];
  const warnings = [];

  const reqIsHours = String(odOptions?.odType_extended || '') === 'hours';
  const reqOdStart = odOptions?.odStartTime || null;
  const reqOdEnd = odOptions?.odEndTime || null;

  const { start, end } = getIstQueryBounds(fromDate, toDate);

  // Resolve status list: for creation, block both pending AND approved records
  const statusFilter = ['pending', 'reporting_manager_approved', 'hod_approved', 'manager_approved', 'hr_approved', 'principal_approved', 'approved'];

  // 1. Validate against Leave conflicts
  const leaves = await Leave.find({
    $or: [
      { employeeId: employeeId },
      { emp_no: employeeNumber.toUpperCase() }
    ],
    status: { $in: statusFilter },
    isActive: true,
    // Optimization: Only fetch potentially overlapping records
    fromDate: { $lte: end },
    toDate: { $gte: start },
  });

  const conflictingLeaves = [];

  for (const leave of leaves) {
    if (!istYmdRangeOverlaps(fromDate, toDate, leave.fromDate, leave.toDate)) continue;
    const statusText = leave.status === 'approved' ? 'approved' : 'pending';

    if (reqIsHours && isSameDay(fromDate, toDate)) {
      if (isSameDay(fromDate, leave.fromDate) && isSameDay(fromDate, leave.toDate) && !leave.isHalfDay) {
        conflictingLeaves.push(leave);
        errors.push(
          `Employee has a ${statusText} full-day leave on ${formatIstErrorDate(leave.fromDate)} that conflicts with hour-based OD.`
        );
      } else if (leave.isHalfDay) {
        warnings.push(
          `Employee has a ${statusText} half-day leave on ${formatIstErrorDate(leave.fromDate)}. Confirm OD times do not overlap the leave half.`
        );
      } else if (!isSameDay(fromDate, leave.fromDate) || !isSameDay(fromDate, leave.toDate)) {
        conflictingLeaves.push(leave);
        errors.push(
          `Employee has a ${statusText} leave from ${formatIstErrorDate(leave.fromDate)} to ${formatIstErrorDate(leave.toDate)} that conflicts with this OD period`
        );
      }
      continue;
    }

    if (isSameDay(fromDate, toDate) && isHalfDay) {
      if (isSameDay(fromDate, leave.fromDate) && isSameDay(fromDate, leave.toDate)) {
        if (checkHalfDayConflict(isHalfDay, halfDayType, leave.isHalfDay, leave.halfDayType)) {
          conflictingLeaves.push(leave);
          errors.push(`Employee has a ${statusText} leave on ${formatIstErrorDate(leave.fromDate)} that conflicts with this OD (${isHalfDay ? (halfDayType === 'first_half' ? 'First Half' : 'Second Half') : 'Full Day'} vs ${leave.isHalfDay ? (leave.halfDayType === 'first_half' ? 'First Half' : 'Second Half') : 'Full Day'})`);
        }
      } else {
        conflictingLeaves.push(leave);
        errors.push(`Employee has a ${statusText} leave from ${formatIstErrorDate(leave.fromDate)} to ${formatIstErrorDate(leave.toDate)} that conflicts with this OD period`);
      }
    } else {
      if (isSameDay(fromDate, toDate) && !isHalfDay) {
        if (isSameDay(fromDate, leave.fromDate) && isSameDay(fromDate, leave.toDate)) {
          conflictingLeaves.push(leave);
          errors.push(`Employee has a ${statusText} leave on ${formatIstErrorDate(leave.fromDate)} that conflicts with this full-day OD`);
        }
      } else {
        conflictingLeaves.push(leave);
        errors.push(`Employee has a ${statusText} leave from ${formatIstErrorDate(leave.fromDate)} to ${formatIstErrorDate(leave.toDate)} that conflicts with this OD period`);
      }
    }
  }

  // 2. Validate against OTHER OD conflicts (Same type)
  const ods = await OD.find({
    $or: [
      { employeeId: employeeId },
      { emp_no: employeeNumber.toUpperCase() }
    ],
    status: { $in: statusFilter },
    isActive: true,
    // Optimization: Only fetch potentially overlapping records
    fromDate: { $lte: end },
    toDate: { $gte: start },
  });

  const conflictingODs = [];

  let existingHoursOdMinutes = 0;

  for (const od of ods) {
    if (excludeId && String(od._id) === String(excludeId)) continue;
    if (!istYmdRangeOverlaps(fromDate, toDate, od.fromDate, od.toDate)) continue;
    const statusText = od.status === 'approved' ? 'approved' : 'pending';

    if (reqIsHours && isSameDay(fromDate, toDate) && isSameDay(fromDate, od.fromDate) && isSameDay(fromDate, od.toDate)) {
      if (isFullDayOdRecord(od)) {
        conflictingODs.push(od);
        errors.push(`Employee has a ${statusText} full-day OD on ${formatIstErrorDate(od.fromDate)} that conflicts with hour-based OD.`);
        continue;
      }
      if (isHalfDayOdRecord(od)) {
        warnings.push(
          `Employee has a ${statusText} half-day OD on ${formatIstErrorDate(od.fromDate)}. Hour OD can still apply for a different time window.`
        );
        continue;
      }
      if (isHoursOdRecord(od) && od.odStartTime && od.odEndTime && reqOdStart && reqOdEnd) {
        if (timeStringsOverlap(reqOdStart, reqOdEnd, od.odStartTime, od.odEndTime)) {
          conflictingODs.push(od);
          errors.push(
            `Employee has a ${statusText} hour-based OD (${od.odStartTime}–${od.odEndTime}) that overlaps this window (${reqOdStart}–${reqOdEnd}).`
          );
        } else {
          const existMins = timeStrToMins(od.odEndTime) - timeStrToMins(od.odStartTime);
          if (existMins > 0) existingHoursOdMinutes += existMins;
        }
        continue;
      }
      continue;
    }

    if (isSameDay(fromDate, toDate) && od.isHalfDay && isHalfDay) {
      if (checkHalfDayConflict(isHalfDay, halfDayType, od.isHalfDay, od.halfDayType)) {
        conflictingODs.push(od);
        errors.push(`Employee has a ${statusText} OD on ${formatIstErrorDate(od.fromDate)} that conflicts with this request (${isHalfDay ? (halfDayType === 'first_half' ? 'First Half' : 'Second Half') : 'Full Day'} vs ${od.isHalfDay ? (od.halfDayType === 'first_half' ? 'First Half' : 'Second Half') : 'Full Day'})`);
      }
    } else {
      conflictingODs.push(od);
      errors.push(`Employee has a ${statusText} OD from ${formatIstErrorDate(od.fromDate)} to ${formatIstErrorDate(od.toDate)} that conflicts with this request period`);
    }
  }

  if (reqIsHours && reqOdStart && reqOdEnd) {
    const reqMins = timeStrToMins(reqOdEnd) - timeStrToMins(reqOdStart);
    if (reqMins > 0 && existingHoursOdMinutes + reqMins > 8 * 60) {
      errors.push('Total hour-based OD on this date would exceed 8 hours. Use half day or full day OD instead.');
    }
  }

  return {
    isValid: errors.length === 0,
    errors: errors,
    warnings: warnings,
    conflictingLeaves: conflictingLeaves,
    conflictingODs: conflictingODs,
  };
};

/**
 * Get approved leave/OD info for a specific date (for frontend display)
 * @param {String} employeeId - Employee ID
 * @param {String} employeeNumber - Employee number
 * @param {String} date - Date to check (YYYY-MM-DD)
 * @returns {Object} - { hasLeave: boolean, hasOD: boolean, leaveInfo: object|null, odInfo: object|null }
 */
const getApprovedRecordsForDate = async (employeeId, employeeNumber, date) => {
  try {
    const checkDateStr =
      typeof date === 'string'
        ? date
        : extractISTComponents(date).dateStr;

    // Check for approved Leave (only approved for creation dialog)
    const leaves = await Leave.find({
      $or: [
        { employeeId: employeeId },
        { emp_no: employeeNumber?.toUpperCase() }
      ],
      status: 'approved',
      isActive: true,
    });

    let leaveInfo = null;
    for (const leave of leaves) {
      if (isDateInRange(checkDateStr, leave.fromDate, leave.toDate)) {
        leaveInfo = {
          id: leave._id,
          status: leave.status,
          isHalfDay: leave.isHalfDay,
          halfDayType: leave.halfDayType,
          fromDate: leave.fromDate,
          toDate: leave.toDate,
        };
        break;
      }
    }

    // Check for approved OD (only approved for creation dialog)
    const ods = await OD.find({
      $or: [
        { employeeId: employeeId },
        { emp_no: employeeNumber?.toUpperCase() }
      ],
      status: 'approved',
      isActive: true,
    });

    let odInfo = null;
    const hoursOdsOnDate = [];
    for (const od of ods) {
      if (!isDateInRange(checkDateStr, od.fromDate, od.toDate)) continue;
      const entry = {
        id: od._id,
        status: od.status,
        isHalfDay: od.isHalfDay,
        halfDayType: od.halfDayType,
        odType_extended: od.odType_extended || null,
        odStartTime: od.odStartTime || null,
        odEndTime: od.odEndTime || null,
        durationHours: od.durationHours ?? null,
        fromDate: od.fromDate,
        toDate: od.toDate,
      };
      if (isHoursOdRecord(od)) {
        hoursOdsOnDate.push(entry);
      }
      if (!odInfo) {
        odInfo = entry;
      } else if (isFullDayOdRecord(od)) {
        odInfo = entry;
      } else if (isHalfDayOdRecord(od) && !isFullDayOdRecord(odInfo) && !isHalfDayOdRecord(odInfo)) {
        odInfo = entry;
      }
    }

    const attendanceInfo = await getAttendanceCoverageForDate(employeeNumber, checkDateStr);
    return {
      hasLeave: leaveInfo !== null,
      hasOD: odInfo !== null,
      leaveInfo: leaveInfo,
      odInfo: odInfo,
      hoursOdsOnDate,
      attendanceInfo,
    };
  } catch (error) {
    console.error('Error getting approved records for date:', error);
    return {
      hasLeave: false,
      hasOD: false,
      leaveInfo: null,
      odInfo: null,
      attendanceInfo: null,
      error: error.message,
    };
  }
};

module.exports = {
  checkLeaveConflict,
  checkODConflict,
  checkAttendanceExists,
  validateOTRequest,
  validatePermissionRequest,
  validateLeaveRequest,
  validateODRequest,
  validateHoursOdAttendance,
  getAttendanceCoverageForDate,
  getApprovedRecordsForDate,
};

