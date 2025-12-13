/**
 * Totals Calculation Service
 * Calculates monthly totals from dailyRecords array
 */

/**
 * Calculate totals from dailyRecords array
 * @param {Array} dailyRecords - Array of daily record objects
 * @returns {Object} Calculated totals
 */
function calculateTotals(dailyRecords) {
  const totals = {
    presentDays: 0,
    presentHalfDays: 0,
    totalPresentDays: 0,
    absentDays: 0,
    absentHalfDays: 0,
    totalAbsentDays: 0,
    paidLeaveDays: 0,
    paidLeaveHalfDays: 0,
    totalPaidLeaveDays: 0,
    unpaidLeaveDays: 0,
    unpaidLeaveHalfDays: 0,
    totalUnpaidLeaveDays: 0,
    lopDays: 0,
    lopHalfDays: 0,
    totalLopDays: 0,
    totalLeaveDays: 0,
    odDays: 0,
    odHalfDays: 0,
    totalODDays: 0,
    totalOTHours: 0,
    totalPayableShifts: 0,
  };

  if (!dailyRecords || dailyRecords.length === 0) {
    return totals;
  }

  for (const record of dailyRecords) {
    // Process first half
    if (record.firstHalf && record.firstHalf.status) {
      if (record.firstHalf.status === 'present') {
        totals.presentHalfDays++;
      } else if (record.firstHalf.status === 'absent') {
        totals.absentHalfDays++;
      } else if (record.firstHalf.status === 'leave') {
        const leaveType = (record.firstHalf.leaveType || '').toLowerCase();
        if (leaveType === 'paid') {
          totals.paidLeaveHalfDays++;
        } else if (leaveType === 'lop' || leaveType === 'loss_of_pay') {
          totals.lopHalfDays++;
        } else {
          totals.unpaidLeaveHalfDays++;
        }
      } else if (record.firstHalf.status === 'od') {
        totals.odHalfDays++;
      }
    }

    // Process second half
    if (record.secondHalf && record.secondHalf.status) {
      if (record.secondHalf.status === 'present') {
        totals.presentHalfDays++;
      } else if (record.secondHalf.status === 'absent') {
        totals.absentHalfDays++;
      } else if (record.secondHalf.status === 'leave') {
        const leaveType = (record.secondHalf.leaveType || '').toLowerCase();
        if (leaveType === 'paid') {
          totals.paidLeaveHalfDays++;
        } else if (leaveType === 'lop' || leaveType === 'loss_of_pay') {
          totals.lopHalfDays++;
        } else {
          totals.unpaidLeaveHalfDays++;
        }
      } else if (record.secondHalf.status === 'od') {
        totals.odHalfDays++;
      }
    }

    // Count full days (when both halves are same and not split)
    if (!record.isSplit && record.status) {
      if (record.status === 'present') {
        totals.presentDays++;
      } else if (record.status === 'absent') {
        totals.absentDays++;
      } else if (record.status === 'leave') {
        const leaveType = (record.leaveType || '').toLowerCase();
        if (leaveType === 'paid') {
          totals.paidLeaveDays++;
        } else if (leaveType === 'lop' || leaveType === 'loss_of_pay') {
          totals.lopDays++;
        } else {
          totals.unpaidLeaveDays++;
        }
      } else if (record.status === 'od') {
        totals.odDays++;
      }
    }

    // Add OT hours (total for the day)
    totals.totalOTHours += record.otHours || 0;
  }

  // Calculate totals (full days + half days * 0.5)
  totals.totalPresentDays = totals.presentDays + totals.presentHalfDays * 0.5;
  totals.totalAbsentDays = totals.absentDays + totals.absentHalfDays * 0.5;
  totals.totalPaidLeaveDays = totals.paidLeaveDays + totals.paidLeaveHalfDays * 0.5;
  totals.totalUnpaidLeaveDays = totals.unpaidLeaveDays + totals.unpaidLeaveHalfDays * 0.5;
  totals.totalLopDays = totals.lopDays + totals.lopHalfDays * 0.5;
  totals.totalLeaveDays = totals.totalPaidLeaveDays + totals.totalUnpaidLeaveDays + totals.totalLopDays;
  totals.totalODDays = totals.odDays + totals.odHalfDays * 0.5;

  // Calculate payable shifts = present + OD + paid leaves
  totals.totalPayableShifts = totals.totalPresentDays + totals.totalODDays + totals.totalPaidLeaveDays;

  // Round to 2 decimal places
  Object.keys(totals).forEach(key => {
    if (typeof totals[key] === 'number') {
      totals[key] = Math.round(totals[key] * 100) / 100;
    }
  });

  return totals;
}

/**
 * Count days by category
 * @param {Array} dailyRecords - Array of daily record objects
 * @param {String} category - Category to count ('present', 'absent', 'leave', 'od')
 * @returns {Object} Count of full days and half days
 */
function countDaysByCategory(dailyRecords, category) {
  let fullDays = 0;
  let halfDays = 0;

  for (const record of dailyRecords) {
    // Check first half
    if (record.firstHalf && record.firstHalf.status === category) {
      halfDays++;
    }
    // Check second half
    if (record.secondHalf && record.secondHalf.status === category) {
      halfDays++;
    }
    // Check full day (if not split)
    if (!record.isSplit && record.status === category) {
      fullDays++;
    }
  }

  return { fullDays, halfDays, total: fullDays + halfDays * 0.5 };
}

/**
 * Calculate payable shifts
 * @param {Number} totalPresentDays - Total present days
 * @param {Number} totalODDays - Total OD days
 * @param {Number} totalPaidLeaveDays - Total paid leave days
 * @returns {Number} Total payable shifts
 */
function calculatePayableShifts(totalPresentDays, totalODDays, totalPaidLeaveDays) {
  return totalPresentDays + totalODDays + totalPaidLeaveDays;
}

module.exports = {
  calculateTotals,
  countDaysByCategory,
  calculatePayableShifts,
};

