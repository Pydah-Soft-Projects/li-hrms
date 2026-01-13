const AttendanceDaily = require('../../attendance/model/AttendanceDaily');
const Leave = require('../../leaves/model/Leave');
const LeaveSplit = require('../../leaves/model/LeaveSplit');
const OD = require('../../leaves/model/OD');
const OT = require('../../overtime/model/OT');
const PreScheduledShift = require('../../shifts/model/PreScheduledShift');
const LeaveSettings = require('../../leaves/model/LeaveSettings');
const Shift = require('../../shifts/model/Shift');

/**
 * Auto Population Service
 * Populates pay register from existing data sources
 */

/**
 * Get all dates in a month
 * @param {Number} year - Year
 * @param {Number} monthNumber - Month number (1-12)
 * @returns {Array} Array of date strings in YYYY-MM-DD format
 */
function getAllDatesInMonth(year, monthNumber) {
  const dates = [];
  const totalDays = new Date(year, monthNumber, 0).getDate();

  for (let day = 1; day <= totalDays; day++) {
    const dateStr = `${year}-${String(monthNumber).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    dates.push(dateStr);
  }

  return dates;
}

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
 * Fetch attendance data for employee and month
 * @param {String} employeeId - Employee ID
 * @param {String} emp_no - Employee number
 * @param {String} month - Month in YYYY-MM format
 * @returns {Object} Map of date -> attendance record
 */
async function fetchAttendanceData(employeeId, emp_no, month) {
  const [year, monthNum] = month.split('-').map(Number);
  const startDate = `${year}-${String(monthNum).padStart(2, '0')}-01`;
  const endDate = `${year}-${String(monthNum).padStart(2, '0')}-${new Date(year, monthNum, 0).getDate()}`;

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
 * Fetch leave data for employee and month
 * @param {String} employeeId - Employee ID
 * @param {String} month - Month in YYYY-MM format
 * @returns {Object} Map of date -> leave data
 */
async function fetchLeaveData(employeeId, month) {
  const [year, monthNum] = month.split('-').map(Number);
  const startDate = new Date(year, monthNum - 1, 1);
  const endDate = new Date(year, monthNum, 0, 23, 59, 59, 999);

  // Fetch approved leaves
  const leaves = await Leave.find({
    employeeId,
    status: { $in: ['approved', 'hr_approved', 'hod_approved'] },
    isActive: true,
    $or: [
      { fromDate: { $lte: endDate }, toDate: { $gte: startDate } },
    ],
  });

  // Fetch leave splits
  const leaveSplits = await LeaveSplit.find({
    employeeId,
    month,
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

      // Check if this date is within the target month
      if (dateStr.startsWith(month)) {
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

  return leaveMap;
}

/**
 * Fetch OD data for employee and month
 * @param {String} employeeId - Employee ID
 * @param {String} month - Month in YYYY-MM format
 * @returns {Object} Map of date -> OD data
 */
async function fetchODData(employeeId, month) {
  const [year, monthNum] = month.split('-').map(Number);
  const startDate = new Date(year, monthNum - 1, 1);
  const endDate = new Date(year, monthNum, 0, 23, 59, 59, 999);

  const ods = await OD.find({
    employeeId,
    status: { $in: ['approved', 'hr_approved', 'hod_approved'] },
    isActive: true,
    $or: [
      { fromDate: { $lte: endDate }, toDate: { $gte: startDate } },
    ],
  });

  const odMap = {};

  for (const od of ods) {
    const fromDate = new Date(od.fromDate);
    const toDate = new Date(od.toDate);

    let currentDate = new Date(fromDate);
    while (currentDate <= toDate) {
      const dateStr = currentDate.toISOString().split('T')[0];

      if (dateStr.startsWith(month)) {
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
 * Fetch OT data for employee and month
 * @param {String} employeeId - Employee ID
 * @param {String} month - Month in YYYY-MM format
 * @returns {Object} Map of date -> OT hours
 */
async function fetchOTData(employeeId, month) {
  const [year, monthNum] = month.split('-').map(Number);
  const startDate = new Date(year, monthNum - 1, 1);
  const endDate = new Date(year, monthNum, 0, 23, 59, 59, 999);

  const ots = await OT.find({
    employeeId,
    status: 'approved',
    date: {
      $gte: startDate.toISOString().split('T')[0],
      $lte: endDate.toISOString().split('T')[0],
    },
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
 * Fetch shift data for employee and month
 * @param {String} emp_no - Employee number
 * @param {String} month - Month in YYYY-MM format
 * @returns {Object} Map of date -> shift data
 */
async function fetchShiftData(emp_no, month) {
  const [year, monthNum] = month.split('-').map(Number);
  const startDate = `${year}-${String(monthNum).padStart(2, '0')}-01`;
  const endDate = `${year}-${String(monthNum).padStart(2, '0')}-${new Date(year, monthNum, 0).getDate()}`;

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
      };
    }
  });

  return shiftMap;
}

/**
 * Resolve conflicts and determine status for a date
 * Priority: Leave > OD > Present > Absent
 * @param {Object} dateData - Combined data for a date
 * @returns {Object} Resolved status for firstHalf and secondHalf
 */
async function resolveConflicts(dateData) {
  const { attendance, leave, od } = dateData;

  let firstHalf = { status: 'absent', leaveType: null, isOD: false };
  let secondHalf = { status: 'absent', leaveType: null, isOD: false };

  // If leave exists, prioritize leave
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

  // If OD exists and no leave, use OD
  if (od && (!leave || (leave.isHalfDay && od.isHalfDay && leave.halfDayType !== od.halfDayType))) {
    if (od.isHalfDay) {
      if (od.halfDayType === 'first_half' && firstHalf.status === 'absent') {
        firstHalf.status = 'od';
        firstHalf.isOD = true;
      } else if (od.halfDayType === 'second_half' && secondHalf.status === 'absent') {
        secondHalf.status = 'od';
        secondHalf.isOD = true;
      }
    } else {
      if (firstHalf.status === 'absent') {
        firstHalf.status = 'od';
        firstHalf.isOD = true;
      }
      if (secondHalf.status === 'absent') {
        secondHalf.status = 'od';
        secondHalf.isOD = true;
      }
    }
  }

  // If attendance exists and no leave/OD, use attendance
  if (attendance && (attendance.status === 'PRESENT' || attendance.status === 'HALF_DAY')) {
    if (attendance.status === 'HALF_DAY') {
      // Only fill ONE available half (preferably the first one if empty)
      if (firstHalf.status === 'absent') {
        firstHalf.status = 'present';
      } else if (secondHalf.status === 'absent') {
        secondHalf.status = 'present';
      }
    } else {
      // Full day PRESENT
      if (firstHalf.status === 'absent') {
        firstHalf.status = 'present';
      }
      if (secondHalf.status === 'absent') {
        secondHalf.status = 'present';
      }
    }
  }

  return { firstHalf, secondHalf };
}

/**
 * Populate pay register from all sources
 * @param {String} employeeId - Employee ID
 * @param {String} emp_no - Employee number
 * @param {Number} year - Year
 * @param {Number} monthNumber - Month number (1-12)
 * @returns {Array} Array of dailyRecords
 */
async function populatePayRegisterFromSources(employeeId, emp_no, year, monthNumber) {
  const month = `${year}-${String(monthNumber).padStart(2, '0')}`;
  const dates = getAllDatesInMonth(year, monthNumber);

  // Fetch all data sources
  const [attendanceMap, leaveMap, odMap, otMap, shiftMap] = await Promise.all([
    fetchAttendanceData(employeeId, emp_no, month),
    fetchLeaveData(employeeId, month),
    fetchODData(employeeId, month),
    fetchOTData(employeeId, month),
    fetchShiftData(emp_no, month),
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

    // Resolve conflicts
    const { firstHalf, secondHalf } = await resolveConflicts({
      attendance,
      leave,
      od,
    });

    // Determine if split
    const isSplit = firstHalf.status !== secondHalf.status;
    const status = isSplit ? null : (firstHalf.status || 'absent');
    const leaveType = isSplit ? null : (firstHalf.leaveType || null);
    const isOD = isSplit ? false : (firstHalf.isOD || false);

    // Create daily record
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
      otHours: ot?.totalHours || 0,
      attendanceRecordId: attendance?._id || null,
      leaveIds: leave?.leaveIds || [],
      leaveSplitIds: leave?.leaveSplitIds || [],
      odIds: od?.odIds || [],
      otIds: ot?.otIds || [],
      remarks: null,
    };

    dailyRecords.push(dailyRecord);
  }

  return dailyRecords;
}

module.exports = {
  populatePayRegisterFromSources,
  getAllDatesInMonth,
  fetchAttendanceData,
  fetchLeaveData,
  fetchODData,
  fetchOTData,
  fetchShiftData,
  resolveConflicts,
  getLeaveNature,
};

