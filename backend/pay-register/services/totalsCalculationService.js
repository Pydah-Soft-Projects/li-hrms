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
    // Skip records with holiday or week_off status - they shouldn't be counted in any category
    const isHoliday = record.status === 'holiday' || record.firstHalf?.status === 'holiday' || record.secondHalf?.status === 'holiday';
    const isWeekOff = record.status === 'week_off' || record.firstHalf?.status === 'week_off' || record.secondHalf?.status === 'week_off';
    
    if (isHoliday || isWeekOff) {
      // Still count OT hours for holidays/week_off if any
      totals.totalOTHours += record.otHours || 0;
      continue; // Skip counting this record in attendance categories
    }

    // Determine if actually split by checking if halves have different statuses
    // Don't rely on isSplit flag as it might be incorrect
    const firstHalfStatus = record.firstHalf?.status;
    const secondHalfStatus = record.secondHalf?.status;
    // Consider split if: both halves exist and have different statuses, OR if record.isSplit is explicitly true
    const isActuallySplit = (firstHalfStatus && secondHalfStatus && firstHalfStatus !== secondHalfStatus) || 
                           (record.isSplit === true && firstHalfStatus && secondHalfStatus);

    // If record is actually split, count halves separately
    if (isActuallySplit) {
      // Process first half - only count if status is explicitly set and valid
      if (record.firstHalf && record.firstHalf.status && 
          ['present', 'absent', 'leave', 'od'].includes(record.firstHalf.status)) {
        if (record.firstHalf.status === 'present') {
          totals.presentHalfDays++;
        } else if (record.firstHalf.status === 'absent') {
          totals.absentHalfDays++;
        } else if (record.firstHalf.status === 'leave') {
          const leaveNature = record.firstHalf.leaveNature || (record.firstHalf.leaveType || '').toLowerCase();
          if (leaveNature === 'paid') {
            totals.paidLeaveHalfDays++;
          } else {
            // Treat any non-paid leave as LOP
            totals.lopHalfDays++;
          }
        } else if (record.firstHalf.status === 'od') {
          totals.odHalfDays++;
        }
      }

      // Process second half - only count if status is explicitly set and valid
      if (record.secondHalf && record.secondHalf.status && 
          ['present', 'absent', 'leave', 'od'].includes(record.secondHalf.status)) {
        if (record.secondHalf.status === 'present') {
          totals.presentHalfDays++;
        } else if (record.secondHalf.status === 'absent') {
          totals.absentHalfDays++;
        } else if (record.secondHalf.status === 'leave') {
          const leaveNature = record.secondHalf.leaveNature || (record.secondHalf.leaveType || '').toLowerCase();
          if (leaveNature === 'paid') {
            totals.paidLeaveHalfDays++;
          } else {
            // Treat any non-paid leave as LOP
            totals.lopHalfDays++;
          }
        } else if (record.secondHalf.status === 'od') {
          totals.odHalfDays++;
        }
      }
    } else {
      // If not split, count as full day only (don't count halves separately)
      // Use the record.status if available, otherwise use firstHalf.status (they should be the same)
      const statusToCount = record.status || firstHalfStatus || secondHalfStatus;
      
      // Only count if status is explicitly set and valid (not null, not holiday, not week_off)
      if (statusToCount && ['present', 'absent', 'leave', 'od'].includes(statusToCount)) {
        if (statusToCount === 'present') {
          totals.presentDays++;
        } else if (statusToCount === 'absent') {
          totals.absentDays++;
        } else if (statusToCount === 'leave') {
          const leaveNature = record.leaveNature || record.firstHalf?.leaveNature || (record.leaveType || record.firstHalf?.leaveType || '').toLowerCase();
          if (leaveNature === 'paid') {
            totals.paidLeaveDays++;
          } else {
            // Treat any non-paid leave as LOP
            totals.lopDays++;
          }
        } else if (statusToCount === 'od') {
          totals.odDays++;
        }
      }
    }

    // Add OT hours (total for the day)
    totals.totalOTHours += record.otHours || 0;
  }

  // Calculate totals (full days + half days * 0.5)
  totals.totalPresentDays = totals.presentDays + totals.presentHalfDays * 0.5;
  totals.totalAbsentDays = totals.absentDays + totals.absentHalfDays * 0.5;
  totals.totalPaidLeaveDays = totals.paidLeaveDays + totals.paidLeaveHalfDays * 0.5;
  totals.totalUnpaidLeaveDays = 0; // No separate unpaid bucket; all non-paid leaves are LOP
  totals.totalLopDays = totals.lopDays + totals.lopHalfDays * 0.5;
  totals.totalLeaveDays = totals.totalPaidLeaveDays + totals.totalLopDays;
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

