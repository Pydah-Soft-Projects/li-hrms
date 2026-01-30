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
 * Get leave nature from leave type
 * @param {String} leaveType - Leave type code
 * @returns {String} Leave nature ('paid', 'lop', 'without_pay')
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
 * Builds a map of attendance records for an employee over a date range.
 * @param {string} emp_no - Employee number.
 * @param {string} startDate - Start date in `YYYY-MM-DD` format (inclusive).
 * @param {string} endDate - End date in `YYYY-MM-DD` format (inclusive).
 * @returns {Object} An object mapping `YYYY-MM-DD` date strings to AttendanceDaily documents (attendance records).
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
 * Build a map of per-date leave information for an employee within a date range.
 *
 * Fetches approved, active leaves that overlap the date range and approved leave splits for the given payroll month,
 * then produces a map keyed by `YYYY-MM-DD` containing consolidated leave data. Leave splits override full-leave
 * values for the specific dates they cover.
 *
 * @param {String} employeeId - Employee MongoDB ID.
 * @param {String} startDate - Inclusive start date in `YYYY-MM-DD` format.
 * @param {String} endDate - Inclusive end date in `YYYY-MM-DD` format.
 * @param {String} payrollMonth - Payroll month identifier used to scope leave splits (format as used by LeaveSplit.month).
 * @returns {Object} An object mapping date strings (`YYYY-MM-DD`) to leave info:
 *   {
 *     leaveIds: Array<ObjectId>,       // IDs of full leave documents covering the date
 *     leaveSplitIds: Array<ObjectId>,  // IDs of leave-split documents for the date
 *     isHalfDay: Boolean,              // true if the recorded leave for the date is a half day
 *     halfDayType: String|null,        // half-day type (e.g., 'first_half'|'second_half') or null
 *     leaveType: String|null,          // effective leave type for the date
 *     originalLeaveType: String|null,  // original leave type from the full leave (when applicable)
 *     leaveNature: String|undefined    // leave nature from split when present (e.g., 'paid'|'lop'|'without_pay')
 *   }
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
 * Build a map of approved, active OD records for an employee across a date range.
 *
 * @param {String} employeeId - Employee Mongo ID.
 * @param {String} startDate - Start date inclusive in 'YYYY-MM-DD' format.
 * @param {String} endDate - End date inclusive in 'YYYY-MM-DD' format.
 * @returns {Object} A map keyed by date string 'YYYY-MM-DD' to OD info objects containing `odIds` (array of OD ObjectIds), `isHalfDay` (boolean), `halfDayType` (string|null), and `odType` (string|null).
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
 * Aggregate approved overtime entries for an employee into a date-keyed map.
 * @param {String} employeeId - Employee's unique identifier.
 * @param {String} startDate - Start date in YYYY-MM-DD (inclusive).
 * @param {String} endDate - End date in YYYY-MM-DD (inclusive).
 * @returns {Object} A map where each key is a date string and the value is an object with `otIds` (array of OT document IDs) and `totalHours` (number of OT hours for that date).
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
 * Builds a map of pre-scheduled shift information for an employee over an inclusive date range.
 * @param {String} emp_no - Employee number.
 * @param {String} startDate - Start date (inclusive) in `YYYY-MM-DD` format.
 * @param {String} endDate - End date (inclusive) in `YYYY-MM-DD` format.
 * @returns {Object} Map where keys are date strings (`YYYY-MM-DD`) and values are shift data objects:
 *                   `{ shiftId: ObjectId|null, shiftName: string, payableShifts: number, status: string|null }`.
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
 * Determine the per-half-day status for a date by resolving attendance, leave, OD, and shift information.
 * @param {Object} dateData - Aggregated source data for the date.
 * @param {Object} [dateData.attendance] - Attendance record; may contain `status` values like `'PRESENT'`, `'HALF_DAY'`, or `'PARTIAL'`.
 * @param {Object} [dateData.leave] - Leave information; may contain `isHalfDay`, `halfDayType` (`'first_half'|'second_half'`), `leaveType`, and `leaveNature`.
 * @param {Object} [dateData.od] - Official duty information; may contain `isHalfDay`, `halfDayType` and `odType`.
 * @param {Object} [dateData.shift] - Shift information; may contain `status` (`'HOL'` for holiday, `'WO'` for week off).
 * @returns {Object} An object with `firstHalf` and `secondHalf` entries. Each entry has:
 *  - `status` {string} — one of `'present'`, `'leave'`, `'od'`, `'absent'`, `'holiday'`, or `'week_off'`.
 *  - `leaveType` {string|null} — the leave nature when status is `'leave'`, otherwise `null`.
 *  - `isOD` {boolean} — `true` when the half is marked as official duty, otherwise `false`.
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
 * Builds daily pay register records for an employee for a payroll month by aggregating attendance, leave, OD, OT, and shift data.
 *
 * @param {String} employeeId - Employee database ID used to fetch leave, OD, and OT records.
 * @param {String} emp_no - Employee number used to fetch attendance and pre-scheduled shift records.
 * @param {Number} year - Year used to derive the payroll date range.
 * @param {Number} monthNumber - Month number (1-12) used to derive the payroll date range.
 * @returns {Array} Array of dailyRecords — each record aggregates attendance, leave, OD, OT, and shift information for a single date within the payroll range (includes per-half statuses, overall status, shift info, OT hours, related record IDs, and flags).
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