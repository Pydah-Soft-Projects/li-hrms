const AttendanceDaily = require('../model/AttendanceDaily');
const Leave = require('../../leaves/model/Leave');
const OD = require('../../leaves/model/OD');
const MonthlyAttendanceSummary = require('../model/MonthlyAttendanceSummary');
const Shift = require('../../shifts/model/Shift');

/**
 * Calculate and update monthly attendance summary for an employee
 * @param {string} employeeId - Employee ID
 * @param {string} emp_no - Employee number
 * @param {number} year - Year (e.g., 2024)
 * @param {number} monthNumber - Month number (1-12)
 * @returns {Promise<Object>} Updated summary
 */
async function calculateMonthlySummary(employeeId, emp_no, year, monthNumber) {
  try {
    // Get or create summary
    const summary = await MonthlyAttendanceSummary.getOrCreate(employeeId, emp_no, year, monthNumber);

    // Calculate date range for the month
    const startDate = new Date(year, monthNumber - 1, 1);
    const endDate = new Date(year, monthNumber, 0); // Last day of month
    const startDateStr = `${year}-${String(monthNumber).padStart(2, '0')}-01`;
    const endDateStr = `${year}-${String(monthNumber).padStart(2, '0')}-${String(endDate.getDate()).padStart(2, '0')}`;

    // 1. Get all attendance records for this month (Using .lean() and projections)
    const attendanceRecords = await AttendanceDaily.find({
      employeeNumber: emp_no,
      date: {
        $gte: startDateStr,
        $lte: endDateStr,
      },
    })
      .select('status shifts totalWorkingHours extraHours totalEarlyOutMinutes payableShifts')
      .populate('shifts.shiftId', 'payableShifts name')
      .lean();

    // 2. Calculate total present days (Half-day counts as 0.5)
    let totalPresentDays = 0;
    for (const record of attendanceRecords) {
      if (record.status === 'PRESENT' || record.status === 'PARTIAL') {
        totalPresentDays += 1;
      } else if (record.status === 'HALF_DAY') {
        totalPresentDays += 0.5;
      }
    }
    summary.totalPresentDays = Math.round(totalPresentDays * 10) / 10;

    // 3. Calculate total payable shifts from attendance
    // Include HALF_DAY in the set of days that contribute to payable shifts
    const activeAttendanceDays = attendanceRecords.filter(r =>
      r.status === 'PRESENT' || r.status === 'PARTIAL' || r.status === 'HALF_DAY'
    );

    let totalPayableShifts = 0;
    for (const record of activeAttendanceDays) {
      if (record.payableShifts !== undefined && record.payableShifts !== null) {
        totalPayableShifts += Number(record.payableShifts);
      }
    }

    // 4. Get approved leaves for this month (Using .lean() and projections)
    const approvedLeaves = await Leave.find({
      employeeId,
      status: 'approved',
      $or: [
        {
          fromDate: { $lte: endDate },
          toDate: { $gte: startDate },
        },
      ],
      isActive: true,
    }).select('fromDate toDate isHalfDay').lean();

    // Calculate total leave days in this month - count each day individually
    let totalLeaveDays = 0;
    for (const leave of approvedLeaves) {
      const leaveStart = new Date(leave.fromDate);
      const leaveEnd = new Date(leave.toDate);
      // Reset time to avoid timezone issues
      leaveStart.setHours(0, 0, 0, 0);
      leaveEnd.setHours(23, 59, 59, 999);

      // Count each day in the leave range that falls within the month
      let currentDate = new Date(leaveStart);
      while (currentDate <= leaveEnd) {
        const currentYear = currentDate.getFullYear();
        const currentMonth = currentDate.getMonth() + 1;

        // Check if this date is within the target month
        if (currentYear === year && currentMonth === monthNumber) {
          totalLeaveDays += leave.isHalfDay ? 0.5 : 1;
        }

        // Move to next day
        currentDate.setDate(currentDate.getDate() + 1);
      }
    }
    summary.totalLeaves = Math.round(totalLeaveDays * 10) / 10; // Round to 1 decimal

    // 5. Get approved ODs for this month (Using .lean() and projections)
    const approvedODs = await OD.find({
      employeeId,
      status: 'approved',
      $or: [
        {
          fromDate: { $lte: endDate },
          toDate: { $gte: startDate },
        },
      ],
      isActive: true,
    }).select('fromDate toDate isHalfDay odType_extended').lean();

    // Calculate total OD days in this month
    // IMPORTANT: Exclude hour-based ODs (they're stored as hours, not days)
    let totalODDays = 0;
    for (const od of approvedODs) {
      // Skip hour-based ODs - they don't count as days
      if (od.odType_extended === 'hours') {
        continue;
      }

      const odStart = new Date(od.fromDate);
      const odEnd = new Date(od.toDate);

      // Reset time to avoid timezone issues
      odStart.setHours(0, 0, 0, 0);
      odEnd.setHours(23, 59, 59, 999);

      // Count each day in the OD range that falls within the month
      let currentDate = new Date(odStart);
      while (currentDate <= odEnd) {
        const currentYear = currentDate.getFullYear();
        const currentMonth = currentDate.getMonth() + 1;

        // Check if this date is within the target month
        if (currentYear === year && currentMonth === monthNumber) {
          totalODDays += od.isHalfDay ? 0.5 : 1;
        }

        // Move to next day
        currentDate.setDate(currentDate.getDate() + 1);
      }
    }
    summary.totalODs = Math.round(totalODDays * 10) / 10; // Round to 1 decimal

    // 6. Add ODs to payable shifts (each OD day = 1 payable shift)
    // IMPORTANT: Only full-day and half-day ODs contribute to payable shifts
    // Hour-based ODs are excluded (they're stored as hours in attendance, not days)
    totalPayableShifts += totalODDays;
    summary.totalPayableShifts = Math.round(totalPayableShifts * 100) / 100; // Round to 2 decimals

    // 7. Calculate total OT hours (from approved OT requests)
    const OT = require('../../overtime/model/OT');
    const approvedOTs = await OT.find({
      employeeId,
      status: 'approved',
      date: { $gte: startDateStr, $lte: endDateStr },
      isActive: true,
    }).select('otHours').lean();

    let totalOTHours = 0;
    for (const ot of approvedOTs) {
      totalOTHours += ot.otHours || 0;
    }
    summary.totalOTHours = Math.round(totalOTHours * 100) / 100; // Round to 2 decimals

    // 8. Calculate total extra hours (from attendance records)
    let totalExtraHours = 0;
    for (const record of attendanceRecords) {
      totalExtraHours += record.extraHours || 0;
    }
    summary.totalExtraHours = Math.round(totalExtraHours * 100) / 100; // Round to 2 decimals

    // 9. Calculate total permission hours and count
    const Permission = require('../../permissions/model/Permission');
    const approvedPermissions = await Permission.find({
      employeeId,
      status: 'approved',
      date: { $gte: startDateStr, $lte: endDateStr },
      isActive: true,
    }).select('permissionHours').lean();

    let totalPermissionHours = 0;
    let totalPermissionCount = 0;
    for (const permission of approvedPermissions) {
      totalPermissionHours += permission.permissionHours || 0;
      totalPermissionCount += 1;
    }
    summary.totalPermissionHours = Math.round(totalPermissionHours * 100) / 100; // Round to 2 decimals
    summary.totalPermissionCount = totalPermissionCount;

    // 10. Calculate early-out deductions (NEW)
    const { calculateMonthlyEarlyOutDeductions } = require('./earlyOutDeductionService');
    const earlyOutDeductions = await calculateMonthlyEarlyOutDeductions(emp_no, year, monthNumber);
    summary.totalEarlyOutMinutes = earlyOutDeductions.totalEarlyOutMinutes;
    summary.totalEarlyOutDeductionDays = earlyOutDeductions.totalDeductionDays;
    summary.totalEarlyOutDeductionAmount = earlyOutDeductions.totalDeductionAmount;
    summary.earlyOutDeductionBreakdown = {
      quarter_day: earlyOutDeductions.deductionBreakdown.quarter_day,
      half_day: earlyOutDeductions.deductionBreakdown.half_day,
      full_day: earlyOutDeductions.deductionBreakdown.full_day,
      custom_amount: earlyOutDeductions.deductionBreakdown.custom_amount,
    };
    summary.earlyOutCount = earlyOutDeductions.earlyOutCount;

    // 11. Update last calculated timestamp
    summary.lastCalculatedAt = new Date();

    // 12. Save summary
    await summary.save();

    return summary;
  } catch (error) {
    console.error(`Error calculating monthly summary for employee ${emp_no}, month ${year}-${monthNumber}:`, error);
    throw error;
  }
}

/**
 * Calculate monthly summary for all employees for a specific month
 * @param {number} year - Year
 * @param {number} monthNumber - Month number (1-12)
 * @returns {Promise<Array>} Array of updated summaries
 */
async function calculateAllEmployeesSummary(year, monthNumber) {
  try {
    const Employee = require('../../employees/model/Employee');
    const employees = await Employee.find({ isActive: true }).select('_id emp_no');

    const results = [];
    for (const employee of employees) {
      try {
        const summary = await calculateMonthlySummary(
          employee._id,
          employee.emp_no,
          year,
          monthNumber
        );
        results.push({ employee: employee.emp_no, success: true, summary });
      } catch (error) {
        console.error(`Error calculating summary for employee ${employee.emp_no}:`, error);
        results.push({ employee: employee.emp_no, success: false, error: error.message });
      }
    }

    return results;
  } catch (error) {
    console.error(`Error calculating all employees summary for ${year}-${monthNumber}:`, error);
    throw error;
  }
}

/**
 * Recalculate summary when attendance is updated
 * @param {string} emp_no - Employee number
 * @param {string} date - Date in YYYY-MM-DD format
 */
async function recalculateOnAttendanceUpdate(emp_no, date) {
  try {
    const Employee = require('../../employees/model/Employee');
    const employee = await Employee.findOne({ emp_no, is_active: true });

    if (!employee) {
      console.warn(`Employee not found for emp_no: ${emp_no}`);
      return;
    }

    const dateObj = new Date(date);
    const year = dateObj.getFullYear();
    const monthNumber = dateObj.getMonth() + 1;

    await calculateMonthlySummary(employee._id, emp_no, year, monthNumber);
  } catch (error) {
    console.error(`Error recalculating summary on attendance update for ${emp_no}, ${date}:`, error);
    // Don't throw - this is a background operation
  }
}

/**
 * Recalculate monthly summary when leave is approved
 * @param {Object} leave - Leave document
 */
async function recalculateOnLeaveApproval(leave) {
  try {
    if (!leave.employeeId || !leave.fromDate || !leave.toDate) {
      return;
    }

    const Employee = require('../../employees/model/Employee');
    const employee = await Employee.findById(leave.employeeId);
    if (!employee) {
      console.warn(`Employee not found for leave: ${leave._id}`);
      return;
    }

    // Calculate all months affected by this leave
    const leaveStart = new Date(leave.fromDate);
    const leaveEnd = new Date(leave.toDate);

    let currentDate = new Date(leaveStart.getFullYear(), leaveStart.getMonth(), 1);
    const endMonth = new Date(leaveEnd.getFullYear(), leaveEnd.getMonth(), 1);

    while (currentDate <= endMonth) {
      const year = currentDate.getFullYear();
      const monthNumber = currentDate.getMonth() + 1;

      await calculateMonthlySummary(employee._id, employee.emp_no, year, monthNumber);

      // Move to next month
      currentDate.setMonth(currentDate.getMonth() + 1);
    }
  } catch (error) {
    console.error(`Error recalculating summary on leave approval for leave ${leave._id}:`, error);
    // Don't throw - this is a background operation
  }
}

/**
 * Recalculate monthly summary when OD is approved
 * @param {Object} od - OD document
 */
async function recalculateOnODApproval(od) {
  try {
    if (!od.employeeId || !od.fromDate || !od.toDate) {
      return;
    }

    const Employee = require('../../employees/model/Employee');
    const employee = await Employee.findById(od.employeeId);
    if (!employee) {
      console.warn(`Employee not found for OD: ${od._id}`);
      return;
    }

    // Calculate all months affected by this OD
    const odStart = new Date(od.fromDate);
    const odEnd = new Date(od.toDate);

    let currentDate = new Date(odStart.getFullYear(), odStart.getMonth(), 1);
    const endMonth = new Date(odEnd.getFullYear(), odEnd.getMonth(), 1);

    while (currentDate <= endMonth) {
      const year = currentDate.getFullYear();
      const monthNumber = currentDate.getMonth() + 1;

      await calculateMonthlySummary(employee._id, employee.emp_no, year, monthNumber);

      // Move to next month
      currentDate.setMonth(currentDate.getMonth() + 1);
    }
  } catch (error) {
    console.error(`Error recalculating summary on OD approval for OD ${od._id}:`, error);
    // Don't throw - this is a background operation
  }
}

module.exports = {
  calculateMonthlySummary,
  calculateAllEmployeesSummary,
  recalculateOnAttendanceUpdate,
  recalculateOnLeaveApproval,
  recalculateOnODApproval,
};

