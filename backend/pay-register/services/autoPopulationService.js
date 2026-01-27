const AttendanceDaily = require('../../attendance/model/AttendanceDaily');
const Leave = require('../../leaves/model/Leave');
const LeaveSplit = require('../../leaves/model/LeaveSplit');
const OD = require('../../leaves/model/OD');
const OT = require('../../overtime/model/OT');
const PreScheduledShift = require('../../shifts/model/PreScheduledShift');
const LeaveSettings = require('../../leaves/model/LeaveSettings');
const Shift = require('../../shifts/model/Shift');
const { getPayrollDateRange, getAllDatesInRange } = require('../../shared/utils/dateUtils');

/**
 * Auto Population Service
 * Populates pay register from existing data sources
 */

/**
 * Determine the leave nature associated with a leave type code.
 * @param {string} leaveType - Leave type code (case-insensitive).
 * @returns {string} The leave nature: `'paid'`, `'lop'`, or `'without_pay'`. Returns `'paid'` if no matching active configuration is found or on error.
 */
async function getLeaveNature(leaveType) {
  try {
    const leaveSettings = await LeaveSettings.findOne({ type: 'leave', isActive: true });
    if (!leaveSettings || !leaveSettings.types) {
      return 'paid'; // Default
    }

    const leaveTypeConfig = leaveSettings.types.find(
      (lt) => lt.code.toUpperCase() === leaveType.toUpperCase() && lt.isActive
    );

    if (leaveTypeConfig) {
      return leaveTypeConfig.leaveNature || 'paid';
    }

    return 'paid'; // Default
  } catch (error) {
    console.error('Error getting leave nature:', error);
    return 'paid'; // Default
  }
}

/**
 * Fetch attendance data for employee and date range
 * @param {String} emp_no - Employee number
 * @param {String} startDate - YYYY-MM-DD
 * @param {String} endDate - YYYY-MM-DD
 * @returns {Object} Map of date -> attendance record
 */
async function fetchAttendanceData(emp_no, startDate, endDate) {
  const attendanceRecords = await AttendanceDaily.find({
    employeeNumber: emp_no,
    date: { $gte: startDate, $lte: endDate },
  }).populate('shiftId', 'name payableShifts');

  const attendanceMap = {};
  attendanceRecords.forEach((record) => {
    attendanceMap[record.date] = record;
  });

  return attendanceMap;
}

/**
 * Build a map of dates to approved leave information for an employee within a date range.
 *
 * @param {String} employeeId - Employee identifier used to query leave records.
 * @param {String} startDate - Inclusive start date in YYYY-MM-DD format.
 * @param {String} endDate - Inclusive end date in YYYY-MM-DD format.
 * @param {String} payrollMonth - Payroll month identifier used to filter LeaveSplit entries.
 * @returns {Object} An object keyed by date string (YYYY-MM-DD). Each value contains:
 *  - {Array} leaveIds - IDs of full leave records covering the date.
 *  - {Array} leaveSplitIds - IDs of leave split records for the date.
 *  - {Boolean} isHalfDay - true if the leave/split for the date is a half day.
 *  - {String|null} halfDayType - 'firstHalf' or 'secondHalf' when isHalfDay is true, otherwise null.
 *  - {String|null} leaveType - Effective leave type for the date (may come from a split).
 *  - {String|null} originalLeaveType - Original leave type from the full leave record when applicable.
 *  - {String|undefined} leaveNature - Leave nature from a split when provided (e.g., 'paid', 'lop').
 */
async function fetchLeaveData(employeeId, startDate, endDate, payrollMonth) {
  const start = new Date(startDate);
  start.setHours(0, 0, 0, 0);
  const end = new Date(endDate);
  end.setHours(23, 59, 59, 999);

  // Fetch approved leaves overlapping the range
  const leaves = await Leave.find({
    employeeId,
    status: { $in: ['approved', 'hr_approved', 'hod_approved'] },
    isActive: true,
    $or: [
      { fromDate: { $lte: end }, toDate: { $gte: start } },
    ],
  });

  // Fetch leave splits for the payroll month
  const leaveSplits = await LeaveSplit.find({
    employeeId,
    month: payrollMonth,
    status: 'approved',
  });

  const leaveMap = {};

  // Process full leaves
  for (const leave of leaves) {
    const fromDate = new Date(leave.fromDate);
    const toDate = new Date(leave.toDate);

    let currentDate = new Date(fromDate);
    while (currentDate <= toDate) {
      const dateStr = currentDate.toISOString().split('T')[0];

      // Check if this date is within the target range
      if (dateStr >= startDate && dateStr <= endDate) {
        if (!leaveMap[dateStr]) {
          leaveMap[dateStr] = {
            leaveIds: [],
            leaveSplitIds: [],
            isHalfDay: leave.isHalfDay,
            halfDayType: leave.halfDayType,
            leaveType: leave.leaveType,
            originalLeaveType: leave.originalLeaveType || leave.leaveType,
          };
        }

        leaveMap[dateStr].leaveIds.push(leave._id);
      }

      currentDate.setDate(currentDate.getDate() + 1);
    }
  }

  // Process leave splits (these override full leaves for specific dates)
  for (const split of leaveSplits) {
    const dateStr = split.date.toISOString().split('T')[0];

    if (dateStr >= startDate && dateStr <= endDate) {
      if (!leaveMap[dateStr]) {
        leaveMap[dateStr] = {
          leaveIds: [],
          leaveSplitIds: [],
          isHalfDay: false,
          halfDayType: null,
          leaveType: null,
          originalLeaveType: null,
        };
      }

      leaveMap[dateStr].leaveSplitIds.push(split._id);
      leaveMap[dateStr].isHalfDay = split.isHalfDay;
      leaveMap[dateStr].halfDayType = split.halfDayType;
      leaveMap[dateStr].leaveType = split.leaveType;
      leaveMap[dateStr].leaveNature = split.leaveNature;
    }
  }

  return leaveMap;
}

/**
 * Build a map of dates in the given range to the employee's approved OD records.
 *
 * Only OD entries that are active and have status 'approved', 'hr_approved', or 'hod_approved'
 * and overlap the provided date range are included.
 *
 * @param {String} employeeId - Employee identifier.
 * @param {String} startDate - Range start in 'YYYY-MM-DD' format (inclusive).
 * @param {String} endDate - Range end in 'YYYY-MM-DD' format (inclusive).
 * @returns {Object} A map where keys are 'YYYY-MM-DD' dates and values are objects with:
 *  - {Array} odIds - Array of OD record IDs for that date.
 *  - {Boolean} isHalfDay - Whether the OD is a half-day (from the latest matching OD entry).
 *  - {String|null} halfDayType - Which half ('firstHalf' or 'secondHalf') when half-day, or null.
 *  - {String} odType - Type/category of the OD.
 */
async function fetchODData(employeeId, startDate, endDate) {
  const start = new Date(startDate);
  start.setHours(0, 0, 0, 0);
  const end = new Date(endDate);
  end.setHours(23, 59, 59, 999);

  const ods = await OD.find({
    employeeId,
    status: { $in: ['approved', 'hr_approved', 'hod_approved'] },
    isActive: true,
    $or: [
      { fromDate: { $lte: end }, toDate: { $gte: start } },
    ],
  });

  const odMap = {};

  for (const od of ods) {
    const fromDate = new Date(od.fromDate);
    const toDate = new Date(od.toDate);

    let currentDate = new Date(fromDate);
    while (currentDate <= toDate) {
      const dateStr = currentDate.toISOString().split('T')[0];

      if (dateStr >= startDate && dateStr <= endDate) {
        if (!odMap[dateStr]) {
          odMap[dateStr] = {
            odIds: [],
            isHalfDay: od.isHalfDay,
            halfDayType: od.halfDayType,
            odType: od.odType,
          };
        }

        odMap[dateStr].odIds.push(od._id);
      }

      currentDate.setDate(currentDate.getDate() + 1);
    }
  }

  return odMap;
}

/**
 * Aggregate approved overtime entries for an employee across a date range by date.
 *
 * @param {String} employeeId - Employee identifier.
 * @param {String} startDate - Start date (inclusive) in YYYY-MM-DD format.
 * @param {String} endDate - End date (inclusive) in YYYY-MM-DD format.
 * @returns {Object} An object mapping date strings (YYYY-MM-DD) to `{ otIds: Array, totalHours: Number }`, where `otIds` are the OT record ids for that date and `totalHours` is the sum of `otHours` for those records.
 */
async function fetchOTData(employeeId, startDate, endDate) {
  const ots = await OT.find({
    employeeId,
    status: 'approved',
    date: { $gte: startDate, $lte: endDate },
  });

  const otMap = {};
  ots.forEach((ot) => {
    const dateStr = ot.date;
    if (!otMap[dateStr]) {
      otMap[dateStr] = {
        otIds: [],
        totalHours: 0,
      };
    }
    otMap[dateStr].otIds.push(ot._id);
    otMap[dateStr].totalHours += ot.otHours || 0;
  });

  return otMap;
}

/**
 * Produce a map of dates to pre-scheduled shift information for an employee within a date range.
 * @param {string} emp_no - Employee number.
 * @param {string} startDate - Start date (inclusive) in YYYY-MM-DD format.
 * @param {string} endDate - End date (inclusive) in YYYY-MM-DD format.
 * @returns {Object} An object mapping date strings (YYYY-MM-DD) to shift data objects. Each shift data object contains:
 *  - {ObjectId|null} shiftId - The referenced shift id, or `null` for week off/holiday entries.
 *  - {string} shiftName - The shift name, or 'Week Off' / 'Holiday' when `shiftId` is null.
 *  - {number} payableShifts - Number of payable shifts (0 for non-working days).
 *  - {string|null} status - Original pre-scheduled status (may be `null`, 'WO', or 'HOL').
 */
async function fetchShiftData(emp_no, startDate, endDate) {
  const preScheduledShifts = await PreScheduledShift.find({
    employeeNumber: emp_no,
    date: { $gte: startDate, $lte: endDate },
  }).populate('shiftId', 'name payableShifts');

  const shiftMap = {};
  preScheduledShifts.forEach((ps) => {
    if (ps.shiftId) {
      shiftMap[ps.date] = {
        shiftId: ps.shiftId._id,
        shiftName: ps.shiftId.name,
        payableShifts: ps.shiftId.payableShifts || 1,
        status: ps.status // Might be null or 'WO' or 'HOL'
      };
    } else if (ps.status === 'WO' || ps.status === 'HOL') {
      shiftMap[ps.date] = {
        shiftId: null,
        shiftName: ps.status === 'WO' ? 'Week Off' : 'Holiday',
        payableShifts: 0,
        status: ps.status
      };
    }
  });

  return shiftMap;
}

/**
 * Determine the final firstHalf and secondHalf statuses for a date by combining attendance, leave, OD, and shift information.
 * @param {Object} dateData - Aggregated source data for the date.
 * @param {Object} [dateData.attendance] - Attendance record; expected to have a `status` field (e.g., 'PRESENT', 'HALF_DAY', 'PARTIAL').
 * @param {Object} [dateData.leave] - Leave information; may include `isHalfDay` (boolean), `halfDayType` ('first_half'|'second_half'), `leaveType`, and optional `leaveNature`.
 * @param {Object} [dateData.od] - Over-duration (OD) information; may include `isHalfDay` (boolean) and `halfDayType` ('first_half'|'second_half').
 * @param {Object} [dateData.shift] - Shift information; may include `status` ('HOL' for holiday, 'WO' for week off) to influence defaults.
 * @returns {Object} An object with `firstHalf` and `secondHalf` entries. Each entry has:
 *  - `status` (one of 'leave', 'od', 'present', 'holiday', 'week_off', 'absent'),
 *  - `leaveType` (leave nature string or `null`),
 *  - `isOD` (boolean indicating OD assignment).
 */
async function resolveConflicts(dateData) {
  const { attendance, leave, od, shift } = dateData;
  const isHoliday = shift?.status === 'HOL';
  const isWeekOff = shift?.status === 'WO';

  const defaultStatus = isHoliday ? 'holiday' : (isWeekOff ? 'week_off' : 'absent');
  let firstHalf = { status: defaultStatus, leaveType: null, isOD: false };
  let secondHalf = { status: defaultStatus, leaveType: null, isOD: false };

  if (leave) {
    const leaveNature = leave.leaveNature || await getLeaveNature(leave.leaveType);

    if (leave.isHalfDay) {
      if (leave.halfDayType === 'first_half') {
        firstHalf.status = 'leave';
        firstHalf.leaveType = leaveNature;
      } else if (leave.halfDayType === 'second_half') {
        secondHalf.status = 'leave';
        secondHalf.leaveType = leaveNature;
      }
    } else {
      firstHalf.status = 'leave';
      firstHalf.leaveType = leaveNature;
      secondHalf.status = 'leave';
      secondHalf.leaveType = leaveNature;
    }
  }

  const isNonWorking = (status) => ['absent', 'week_off', 'holiday'].includes(status);

  if (od && (!leave || (leave.isHalfDay && od.isHalfDay && leave.halfDayType !== od.halfDayType))) {
    if (od.isHalfDay) {
      if (od.halfDayType === 'first_half' && isNonWorking(firstHalf.status)) {
        firstHalf.status = 'od';
        firstHalf.isOD = true;
      } else if (od.halfDayType === 'second_half' && isNonWorking(secondHalf.status)) {
        secondHalf.status = 'od';
        secondHalf.isOD = true;
      }
    } else {
      if (isNonWorking(firstHalf.status)) {
        firstHalf.status = 'od';
        firstHalf.isOD = true;
      }
      if (isNonWorking(secondHalf.status)) {
        secondHalf.status = 'od';
        secondHalf.isOD = true;
      }
    }
  }

  if (attendance && (attendance.status === 'PRESENT' || attendance.status === 'HALF_DAY' || attendance.status === 'PARTIAL')) {
    if (attendance.status === 'HALF_DAY') {
      if (isNonWorking(firstHalf.status)) {
        firstHalf.status = 'present';
      } else if (isNonWorking(secondHalf.status)) {
        secondHalf.status = 'present';
      }
    } else {
      if (isNonWorking(firstHalf.status)) {
        firstHalf.status = 'present';
      }
      if (isNonWorking(secondHalf.status)) {
        secondHalf.status = 'present';
      }
    }
  }

  return { firstHalf, secondHalf };
}

/**
 * Builds per-day pay register entries for an employee for a payroll month by aggregating attendance, leave, OD, OT, and shift data.
 *
 * Iterates each date in the payroll period, resolves first-half and second-half statuses from all sources, and returns an array of daily record objects.
 *
 * @param {String} employeeId - Internal employee identifier used to fetch leaves, leave splits, and OD records.
 * @param {String} emp_no - Employee number used to fetch attendance, pre-scheduled shifts, and related records.
 * @param {Number} year - Payroll year.
 * @param {Number} monthNumber - Payroll month number (1-12).
 * @returns {Array} An array of daily record objects for each date in the payroll period, each including per-half statuses (`firstHalf`, `secondHalf`), aggregated IDs (attendance, leave, od, ot), shift info, OT hours, and summary fields (`status`, `leaveType`, `isOD`, `isSplit`).
 */
async function populatePayRegisterFromSources(employeeId, emp_no, year, monthNumber) {
  const month = `${year}-${String(monthNumber).padStart(2, '0')}`;
  const { startDate, endDate } = await getPayrollDateRange(year, monthNumber);
  const dates = getAllDatesInRange(startDate, endDate);

  // Fetch all data sources
  const [attendanceMap, leaveMap, odMap, otMap, shiftMap] = await Promise.all([
    fetchAttendanceData(emp_no, startDate, endDate),
    fetchLeaveData(employeeId, startDate, endDate, month),
    fetchODData(employeeId, startDate, endDate),
    fetchOTData(employeeId, startDate, endDate),
    fetchShiftData(emp_no, startDate, endDate),
  ]);

  const dailyRecords = [];

  for (const date of dates) {
    const attendance = attendanceMap[date];
    const leave = leaveMap[date];
    const od = odMap[date];
    const ot = otMap[date];
    const shift = shiftMap[date] || (attendance?.shiftId ? {
      shiftId: attendance.shiftId._id,
      shiftName: attendance.shiftId.name,
      payableShifts: attendance.shiftId.payableShifts || 1,
    } : null);

    const { firstHalf, secondHalf } = await resolveConflicts({
      attendance,
      leave,
      od,
      shift,
    });

    const isSplit = firstHalf.status !== secondHalf.status;
    const status = isSplit ? null : (firstHalf.status || 'absent');
    const leaveType = isSplit ? null : (firstHalf.leaveType || null);
    const isOD = isSplit ? false : (firstHalf.isOD || false);

    const dailyRecord = {
      date,
      firstHalf: {
        status: firstHalf.status,
        leaveType: firstHalf.leaveType,
        isOD: firstHalf.isOD,
        otHours: 0,
        shiftId: shift?.shiftId || null,
        remarks: null,
      },
      secondHalf: {
        status: secondHalf.status,
        leaveType: secondHalf.leaveType,
        isOD: secondHalf.isOD,
        otHours: 0,
        shiftId: shift?.shiftId || null,
        remarks: null,
      },
      status,
      leaveType,
      isOD,
      isSplit,
      shiftId: shift?.shiftId || null,
      shiftName: shift?.shiftName || null,
      payableShifts: shift?.payableShifts || 1,
      otHours: ot?.totalHours || 0,
      attendanceRecordId: attendance?._id || null,
      leaveIds: leave?.leaveIds || [],
      leaveSplitIds: leave?.leaveSplitIds || [],
      odIds: od?.odIds || [],
      otIds: ot?.otIds || [],
      isLate: attendance?.isLateIn || false,
      isEarlyOut: attendance?.isEarlyOut || false,
      remarks: null,
    };

    dailyRecords.push(dailyRecord);
  }

  return dailyRecords;
}

module.exports = {
  populatePayRegisterFromSources,
  fetchAttendanceData,
  fetchLeaveData,
  fetchODData,
  fetchOTData,
  fetchShiftData,
  resolveConflicts,
  getLeaveNature,
};