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
const validateLeaveRequest = async (employeeId, employeeNumber, fromDate, toDate, isHalfDay = false, halfDayType = null, approvedOnly = true, excludeId = null) => {
  const errors = [];
  const warnings = [];

  // IST instants for Mongo pre-filter; calendar overlap is verified in IST
  const { start, end } = getIstQueryBounds(fromDate, toDate);

  // Resolve status list: for creation, block both pending AND approved records
  const statusFilter = ['pending', 'reporting_manager_approved', 'hod_approved', 'manager_approved', 'hr_approved', 'principal_approved', 'approved'];

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

  // Check each OD for conflicts
  for (const od of ods) {
    if (!istYmdRangeOverlaps(fromDate, toDate, od.fromDate, od.toDate)) continue;
    if (isSameDay(fromDate, toDate) && isHalfDay) {
      if (isSameDay(fromDate, od.fromDate) && isSameDay(fromDate, od.toDate)) {
        if (checkHalfDayConflict(isHalfDay, halfDayType, od.isHalfDay, od.halfDayType)) {
          conflictingODs.push(od);
          const statusText = od.status === 'approved' ? 'approved' : 'pending';
          errors.push(`Employee has a ${statusText} OD on ${formatIstErrorDate(od.fromDate)} that conflicts with this leave (${isHalfDay ? (halfDayType === 'first_half' ? 'First Half' : 'Second Half') : 'Full Day'} vs ${od.isHalfDay ? (od.halfDayType === 'first_half' ? 'First Half' : 'Second Half') : 'Full Day'})`);
        }
      } else {
        conflictingODs.push(od);
        const statusText = od.status === 'approved' ? 'approved' : 'pending';
        errors.push(`Employee has a ${statusText} OD from ${formatIstErrorDate(od.fromDate)} to ${formatIstErrorDate(od.toDate)} that conflicts with this leave period`);
      }
    } else {
      if (isSameDay(fromDate, toDate) && !isHalfDay) {
        if (isSameDay(fromDate, od.fromDate) && isSameDay(fromDate, od.toDate)) {
          conflictingODs.push(od);
          const statusText = od.status === 'approved' ? 'approved' : 'pending';
          errors.push(`Employee has a ${statusText} OD on ${formatIstErrorDate(od.fromDate)} that conflicts with this full-day leave`);
        }
      } else {
        conflictingODs.push(od);
        const statusText = od.status === 'approved' ? 'approved' : 'pending';
        errors.push(`Employee has a ${statusText} OD from ${formatIstErrorDate(od.fromDate)} to ${formatIstErrorDate(od.toDate)} that conflicts with this leave period`);
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
    // Skip if it's the current application being updated
    if (excludeId && String(leave._id) === String(excludeId)) continue;

    if (!istYmdRangeOverlaps(fromDate, toDate, leave.fromDate, leave.toDate)) continue;
    if (isSameDay(fromDate, toDate) && leave.isHalfDay && isHalfDay) {
      if (checkHalfDayConflict(isHalfDay, halfDayType, leave.isHalfDay, leave.halfDayType)) {
        conflictingLeaves.push(leave);
        const statusText = leave.status === 'approved' ? 'approved' : 'pending';
        errors.push(`Employee has a ${statusText} leave on ${formatIstErrorDate(leave.fromDate)} that conflicts with this request (${isHalfDay ? (halfDayType === 'first_half' ? 'First Half' : 'Second Half') : 'Full Day'} vs ${leave.isHalfDay ? (leave.halfDayType === 'first_half' ? 'First Half' : 'Second Half') : 'Full Day'})`);
      }
    } else {
      conflictingLeaves.push(leave);
      const statusText = leave.status === 'approved' ? 'approved' : 'pending';
      errors.push(`Employee has a ${statusText} leave from ${formatIstErrorDate(leave.fromDate)} to ${formatIstErrorDate(leave.toDate)} that conflicts with this request period`);
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
const validateODRequest = async (employeeId, employeeNumber, fromDate, toDate, isHalfDay = false, halfDayType = null, approvedOnly = true, excludeId = null) => {
  const errors = [];
  const warnings = [];

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
    if (isSameDay(fromDate, toDate) && isHalfDay) {
      if (isSameDay(fromDate, leave.fromDate) && isSameDay(fromDate, leave.toDate)) {
        if (checkHalfDayConflict(isHalfDay, halfDayType, leave.isHalfDay, leave.halfDayType)) {
          conflictingLeaves.push(leave);
          const statusText = leave.status === 'approved' ? 'approved' : 'pending';
          errors.push(`Employee has a ${statusText} leave on ${formatIstErrorDate(leave.fromDate)} that conflicts with this OD (${isHalfDay ? (halfDayType === 'first_half' ? 'First Half' : 'Second Half') : 'Full Day'} vs ${leave.isHalfDay ? (leave.halfDayType === 'first_half' ? 'First Half' : 'Second Half') : 'Full Day'})`);
        }
      } else {
        conflictingLeaves.push(leave);
        const statusText = leave.status === 'approved' ? 'approved' : 'pending';
        errors.push(`Employee has a ${statusText} leave from ${formatIstErrorDate(leave.fromDate)} to ${formatIstErrorDate(leave.toDate)} that conflicts with this OD period`);
      }
    } else {
      if (isSameDay(fromDate, toDate) && !isHalfDay) {
        if (isSameDay(fromDate, leave.fromDate) && isSameDay(fromDate, leave.toDate)) {
          conflictingLeaves.push(leave);
          const statusText = leave.status === 'approved' ? 'approved' : 'pending';
          errors.push(`Employee has a ${statusText} leave on ${formatIstErrorDate(leave.fromDate)} that conflicts with this full-day OD`);
        }
      } else {
        conflictingLeaves.push(leave);
        const statusText = leave.status === 'approved' ? 'approved' : 'pending';
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

  for (const od of ods) {
    if (excludeId && String(od._id) === String(excludeId)) continue;
    if (!istYmdRangeOverlaps(fromDate, toDate, od.fromDate, od.toDate)) continue;
    if (isSameDay(fromDate, toDate) && od.isHalfDay && isHalfDay) {
      if (checkHalfDayConflict(isHalfDay, halfDayType, od.isHalfDay, od.halfDayType)) {
        conflictingODs.push(od);
        const statusText = od.status === 'approved' ? 'approved' : 'pending';
        errors.push(`Employee has a ${statusText} OD on ${formatIstErrorDate(od.fromDate)} that conflicts with this request (${isHalfDay ? (halfDayType === 'first_half' ? 'First Half' : 'Second Half') : 'Full Day'} vs ${od.isHalfDay ? (od.halfDayType === 'first_half' ? 'First Half' : 'Second Half') : 'Full Day'})`);
      }
    } else {
      conflictingODs.push(od);
      const statusText = od.status === 'approved' ? 'approved' : 'pending';
      errors.push(`Employee has a ${statusText} OD from ${formatIstErrorDate(od.fromDate)} to ${formatIstErrorDate(od.toDate)} that conflicts with this request period`);
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
    for (const od of ods) {
      if (isDateInRange(checkDateStr, od.fromDate, od.toDate)) {
        odInfo = {
          id: od._id,
          status: od.status,
          isHalfDay: od.isHalfDay,
          halfDayType: od.halfDayType,
          fromDate: od.fromDate,
          toDate: od.toDate,
        };
        break;
      }
    }

    return {
      hasLeave: leaveInfo !== null,
      hasOD: odInfo !== null,
      leaveInfo: leaveInfo,
      odInfo: odInfo,
    };
  } catch (error) {
    console.error('Error getting approved records for date:', error);
    return {
      hasLeave: false,
      hasOD: false,
      leaveInfo: null,
      odInfo: null,
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
  getApprovedRecordsForDate,
};

