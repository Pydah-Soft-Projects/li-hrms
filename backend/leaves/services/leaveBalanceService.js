const MonthlyLeaveRecord = require('../model/MonthlyLeaveRecord');
const Leave = require('../model/Leave');
const LeaveSettings = require('../model/LeaveSettings');
const Employee = require('../../employees/model/Employee');

/**
 * Get financial year from a date
 * @param {Date} date - Date to get financial year for
 * @returns {String} Financial year in format "YYYY-YYYY" (e.g., "2024-2025")
 */
function getFinancialYear(date) {
  const year = date.getFullYear();
  const month = date.getMonth() + 1; // 1-12
  // Assuming financial year starts from April (month 4)
  // If month is Jan-Mar, financial year is previous year - current year
  // If month is Apr-Dec, financial year is current year - next year
  if (month >= 4) {
    return `${year}-${year + 1}`;
  } else {
    return `${year - 1}-${year}`;
  }
}

/**
 * Get or create monthly leave record for an employee and month
 * @param {String} employeeId - Employee ID
 * @param {String} emp_no - Employee number
 * @param {Date} date - Date to get month for
 * @returns {Object} MonthlyLeaveRecord
 */
async function getOrCreateMonthlyRecord(employeeId, emp_no, date) {
  const year = date.getFullYear();
  const monthNumber = date.getMonth() + 1;
  const month = `${year}-${String(monthNumber).padStart(2, '0')}`;
  const financialYear = getFinancialYear(date);

  let record = await MonthlyLeaveRecord.findOne({
    employeeId,
    month,
  });

  if (!record) {
    record = await MonthlyLeaveRecord.create({
      employeeId,
      emp_no,
      month,
      year,
      monthNumber,
      financialYear,
      leaveIds: [],
      summary: {
        totalLeaves: 0,
        paidLeaves: 0,
        withoutPayLeaves: 0,
        lopLeaves: 0,
        leaveTypesBreakdown: [],
        leaveNaturesBreakdown: [],
      },
    });
  }

  return record;
}

/**
 * Get leave nature from leave type settings
 * @param {String} leaveType - Leave type code
 * @returns {String} Leave nature ('paid', 'lop', or 'without_pay')
 */
async function getLeaveNature(leaveType) {
  try {
    const settings = await LeaveSettings.getActiveSettings('leave');
    if (!settings || !settings.types) {
      return 'paid'; // Default to paid if settings not found
    }

    const leaveTypeConfig = settings.types.find(
      (t) => t.code === leaveType && t.isActive
    );

    if (!leaveTypeConfig) {
      return 'paid'; // Default to paid if leave type not found
    }

    return leaveTypeConfig.leaveNature || (leaveTypeConfig.isPaid ? 'paid' : 'without_pay');
  } catch (error) {
    console.error('Error getting leave nature:', error);
    return 'paid'; // Default to paid on error
  }
}

/**
 * Recalculate monthly leave record summary
 * @param {String} employeeId - Employee ID
 * @param {String} month - Month in format "YYYY-MM"
 * @returns {Object} Updated MonthlyLeaveRecord
 */
async function recalculateMonthlyRecord(employeeId, month) {
  const record = await MonthlyLeaveRecord.findOne({ employeeId, month });
  if (!record) {
    return null;
  }

  // Get all approved leaves for this month
  const [year, monthNum] = month.split('-').map(Number);
  const startDate = new Date(year, monthNum - 1, 1);
  const endDate = new Date(year, monthNum, 0, 23, 59, 59, 999);

  // Get regular approved leaves (non-split)
  const leaves = await Leave.find({
    employeeId,
    status: 'approved',
    isActive: true,
    splitStatus: { $in: [null, ''] }, // Only non-split leaves
    $or: [
      {
        fromDate: { $lte: endDate },
        toDate: { $gte: startDate },
      },
    ],
  }).populate('employeeId', 'emp_no');

  // Get approved leave splits for this month
  const LeaveSplit = require('../model/LeaveSplit');
  const splits = await LeaveSplit.find({
    employeeId,
    status: 'approved',
    month,
  }).populate('leaveId', 'leaveType');

  // Initialize summary
  const summary = {
    totalLeaves: 0,
    paidLeaves: 0,
    withoutPayLeaves: 0,
    lopLeaves: 0,
    leaveTypesBreakdown: [],
    leaveNaturesBreakdown: [],
  };

  const leaveIds = [];
  const leaveTypeMap = new Map();
  const natureMap = new Map();

  // Process each leave
  for (const leave of leaves) {
    // Check if this leave falls within the month
    const leaveStart = new Date(leave.fromDate);
    const leaveEnd = new Date(leave.toDate);
    leaveStart.setHours(0, 0, 0, 0);
    leaveEnd.setHours(23, 59, 59, 999);

    let daysInMonth = 0;
    let currentDate = new Date(leaveStart);
    while (currentDate <= leaveEnd) {
      const currentYear = currentDate.getFullYear();
      const currentMonth = currentDate.getMonth() + 1;
      if (currentYear === year && currentMonth === monthNum) {
        daysInMonth += leave.isHalfDay ? 0.5 : 1;
      }
      currentDate.setDate(currentDate.getDate() + 1);
    }

    if (daysInMonth === 0) {
      continue; // This leave doesn't fall in this month
    }

    leaveIds.push(leave._id);

    // Get leave nature
    const nature = await getLeaveNature(leave.leaveType);
    const leaveTypeName = leave.leaveType; // You can enhance this to get actual name from settings

    // Update totals
    summary.totalLeaves += daysInMonth;
    if (nature === 'paid') {
      summary.paidLeaves += daysInMonth;
    } else if (nature === 'lop') {
      summary.lopLeaves += daysInMonth;
    } else if (nature === 'without_pay') {
      summary.withoutPayLeaves += daysInMonth;
    }

    // Update leave type breakdown
    if (!leaveTypeMap.has(leave.leaveType)) {
      leaveTypeMap.set(leave.leaveType, {
        leaveType: leave.leaveType,
        leaveTypeName,
        days: 0,
        nature,
        leaveIds: [],
      });
    }
    const typeBreakdown = leaveTypeMap.get(leave.leaveType);
    typeBreakdown.days += daysInMonth;
    if (!typeBreakdown.leaveIds.includes(leave._id)) {
      typeBreakdown.leaveIds.push(leave._id);
    }

    // Update nature breakdown
    if (!natureMap.has(nature)) {
      natureMap.set(nature, {
        nature,
        days: 0,
        leaveIds: [],
      });
    }
    const natureBreakdown = natureMap.get(nature);
    natureBreakdown.days += daysInMonth;
    if (!natureBreakdown.leaveIds.includes(leave._id)) {
      natureBreakdown.leaveIds.push(leave._id);
    }
  }

  // Process leave splits (split-approved leaves)
  for (const split of splits) {
    const splitDate = new Date(split.date);
    const splitYear = splitDate.getFullYear();
    const splitMonth = splitDate.getMonth() + 1;
    
    // Only process splits for this month
    if (splitYear !== year || splitMonth !== monthNum) {
      continue;
    }

    const splitDays = split.numberOfDays || (split.isHalfDay ? 0.5 : 1);
    
    // Add split leave ID if not already added
    if (split.leaveId && !leaveIds.includes(split.leaveId._id)) {
      leaveIds.push(split.leaveId._id);
    }

    // Update totals
    summary.totalLeaves += splitDays;
    if (split.leaveNature === 'paid') {
      summary.paidLeaves += splitDays;
    } else if (split.leaveNature === 'lop') {
      summary.lopLeaves += splitDays;
    } else if (split.leaveNature === 'without_pay') {
      summary.withoutPayLeaves += splitDays;
    }

    // Update leave type breakdown
    if (!leaveTypeMap.has(split.leaveType)) {
      const settings = await LeaveSettings.getActiveSettings('leave');
      const leaveTypeConfig = settings?.types?.find(t => t.code === split.leaveType);
      leaveTypeMap.set(split.leaveType, {
        leaveType: split.leaveType,
        leaveTypeName: leaveTypeConfig?.name || split.leaveType,
        days: 0,
        nature: split.leaveNature,
        leaveIds: [],
      });
    }
    const typeBreakdown = leaveTypeMap.get(split.leaveType);
    typeBreakdown.days += splitDays;
    if (split.leaveId && !typeBreakdown.leaveIds.includes(split.leaveId._id)) {
      typeBreakdown.leaveIds.push(split.leaveId._id);
    }

    // Update nature breakdown
    if (!natureMap.has(split.leaveNature)) {
      natureMap.set(split.leaveNature, {
        nature: split.leaveNature,
        days: 0,
        leaveIds: [],
      });
    }
    const natureBreakdown = natureMap.get(split.leaveNature);
    natureBreakdown.days += splitDays;
    if (split.leaveId && !natureBreakdown.leaveIds.includes(split.leaveId._id)) {
      natureBreakdown.leaveIds.push(split.leaveId._id);
    }
  }

  // Convert maps to arrays
  summary.leaveTypesBreakdown = Array.from(leaveTypeMap.values());
  summary.leaveNaturesBreakdown = Array.from(natureMap.values());

  // Update record
  record.leaveIds = leaveIds;
  record.summary = summary;
  await record.save();

  return record;
}

/**
 * Update monthly leave record when a leave is approved/rejected/cancelled
 * @param {Object} leave - Leave document
 * @param {String} action - 'approved', 'rejected', or 'cancelled'
 */
async function updateMonthlyRecordOnLeaveAction(leave, action) {
  try {
    if (!leave.employeeId || !leave.fromDate || !leave.toDate) {
      console.error('Invalid leave data for monthly record update');
      return;
    }

    const employee = await Employee.findById(leave.employeeId).select('emp_no');
    if (!employee) {
      console.error('Employee not found for leave:', leave._id);
      return;
    }

    // Get all months this leave spans
    const startDate = new Date(leave.fromDate);
    const endDate = new Date(leave.toDate);
    const months = new Set();

    let currentDate = new Date(startDate);
    while (currentDate <= endDate) {
      const year = currentDate.getFullYear();
      const monthNum = currentDate.getMonth() + 1;
      const month = `${year}-${String(monthNum).padStart(2, '0')}`;
      months.add(month);
      currentDate.setMonth(currentDate.getMonth() + 1);
      currentDate.setDate(1); // Move to first day of next month
    }

    // Recalculate for each affected month
    for (const month of months) {
      if (action === 'approved') {
        // Recalculate to include this leave
        await recalculateMonthlyRecord(leave.employeeId, month);
      } else if (action === 'rejected' || action === 'cancelled') {
        // Recalculate to exclude this leave
        await recalculateMonthlyRecord(leave.employeeId, month);
      }
    }
  } catch (error) {
    console.error('Error updating monthly leave record:', error);
  }
}

/**
 * Calculate current leave balance for without_pay leaves
 * @param {String} employeeId - Employee ID
 * @param {String} financialYear - Financial year (e.g., "2024-2025")
 * @returns {Object} Balance information
 */
async function calculateLeaveBalance(employeeId, financialYear) {
  try {
    const employee = await Employee.findById(employeeId).select('allottedLeaves emp_no');
    if (!employee) {
      throw new Error('Employee not found');
    }

    // Get all monthly records for this financial year
    const records = await MonthlyLeaveRecord.find({
      employeeId,
      financialYear,
    });

    // Sum all without_pay and lop leaves
    let totalWithoutPayLeaves = 0;
    for (const record of records) {
      totalWithoutPayLeaves += record.summary.withoutPayLeaves || 0;
      totalWithoutPayLeaves += record.summary.lopLeaves || 0;
    }

    const allottedLeaves = employee.allottedLeaves || 0;
    const balance = Math.max(0, allottedLeaves - totalWithoutPayLeaves);
    const used = totalWithoutPayLeaves;

    return {
      employeeId,
      emp_no: employee.emp_no,
      financialYear,
      allottedLeaves,
      used,
      balance,
      available: balance,
    };
  } catch (error) {
    console.error('Error calculating leave balance:', error);
    throw error;
  }
}

/**
 * Get leave balance for current financial year
 * @param {String} employeeId - Employee ID
 * @returns {Object} Balance information
 */
async function getCurrentLeaveBalance(employeeId) {
  const currentDate = new Date();
  const financialYear = getFinancialYear(currentDate);
  return calculateLeaveBalance(employeeId, financialYear);
}

module.exports = {
  getFinancialYear,
  getOrCreateMonthlyRecord,
  getLeaveNature,
  recalculateMonthlyRecord,
  updateMonthlyRecordOnLeaveAction,
  calculateLeaveBalance,
  getCurrentLeaveBalance,
};


