/**
 * Totals Calculation Service
 * Calculates monthly totals from dailyRecords array
 */

/**
 * Compute attendance and payroll-related aggregates from an array of daily attendance records.
 *
 * Produces counts for full and half days across categories (present, absent, paid leave, LOP, OD),
 * totals for OT hours, weekly offs, holidays, late and early-out occurrences, and total payable shifts.
 * Numeric totals are rounded to two decimal places.
 *
 * @param {Array<Object>} dailyRecords - Array of daily record objects; each record may include
 *   status, isSplit, firstHalf, secondHalf, otHours, payableShifts, isLate, isEarlyOut, leaveType/leaveNature, etc.
 * @returns {Object} An object containing aggregated numeric totals:
 *   - presentDays, presentHalfDays, totalPresentDays
 *   - absentDays, absentHalfDays, totalAbsentDays
 *   - paidLeaveDays, paidLeaveHalfDays, totalPaidLeaveDays
 *   - unpaidLeaveDays, unpaidLeaveHalfDays, totalUnpaidLeaveDays
 *   - lopDays, lopHalfDays, totalLopDays
 *   - totalLeaveDays
 *   - odDays, odHalfDays, totalODDays
 *   - totalOTHours
 *   - totalPayableShifts
 *   - totalWeeklyOffs
 *   - totalHolidays
 *   - lateCount
 *   - earlyOutCount
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
    totalWeeklyOffs: 0,
    totalHolidays: 0,
    lateCount: 0,
    earlyOutCount: 0,
  };

  if (!dailyRecords || dailyRecords.length === 0) {
    return totals;
  }

  for (const record of dailyRecords) {
    // Track Holidays and Weekly Offs (can be fractional if split)
    const isHoliday = record.status === 'holiday' || record.firstHalf?.status === 'holiday' || record.secondHalf?.status === 'holiday';
    const isWeekOff = record.status === 'week_off' || record.firstHalf?.status === 'week_off' || record.secondHalf?.status === 'week_off';

    if (record.isSplit) {
      if (record.firstHalf?.status === 'holiday') totals.totalHolidays += 0.5;
      if (record.firstHalf?.status === 'week_off') totals.totalWeeklyOffs += 0.5;
      if (record.secondHalf?.status === 'holiday') totals.totalHolidays += 0.5;
      if (record.secondHalf?.status === 'week_off') totals.totalWeeklyOffs += 0.5;
    } else {
      if (record.status === 'holiday') totals.totalHolidays += 1;
      if (record.status === 'week_off') totals.totalWeeklyOffs += 1;
    }

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

    // Add Lates and Early Outs (only if NOT absent/leave/holiday/week_off)
    // A late/early out only makes sense if there's some actual presence
    const isPresentOrPartial = record.status === 'present' || record.status === 'partial' || record.status === 'od' ||
      record.firstHalf?.status === 'present' || record.secondHalf?.status === 'present' ||
      record.firstHalf?.status === 'od' || record.secondHalf?.status === 'od';

    if (record.isLate && isPresentOrPartial) totals.lateCount++;
    if (record.isEarlyOut && isPresentOrPartial) totals.earlyOutCount++;
  }

  // Calculate totals (full days + half days * 0.5)
  totals.totalPresentDays = totals.presentDays + totals.presentHalfDays * 0.5;
  totals.totalAbsentDays = totals.absentDays + totals.absentHalfDays * 0.5;
  totals.totalPaidLeaveDays = totals.paidLeaveDays + totals.paidLeaveHalfDays * 0.5;
  totals.totalUnpaidLeaveDays = 0; // No separate unpaid bucket; all non-paid leaves are LOP
  totals.totalLopDays = totals.lopDays + totals.lopHalfDays * 0.5;
  totals.totalLeaveDays = totals.totalPaidLeaveDays + totals.totalLopDays;
  totals.totalODDays = totals.odDays + totals.odHalfDays * 0.5;

  // Calculate totalPayableShifts by summing up individual record values
  // This respects shifts with multiple payable units (e.g. 2.0)
  let totalPayableShiftsValue = 0;
  for (const record of dailyRecords) {
    const isHoliday = record.status === 'holiday' || record.firstHalf?.status === 'holiday' || record.secondHalf?.status === 'holiday';
    const isWeekOff = record.status === 'week_off' || record.firstHalf?.status === 'week_off' || record.secondHalf?.status === 'week_off';

    // Only count if it's a "payable" status (present, od, or paid leave)
    // For simplicity in totalPayableShifts, we don't count holiday/weekoff here 
    // as payroll calculation service adds those separately or handles them via totalPaidDays

    // Check first half
    if (record.firstHalf) {
      const h1 = record.firstHalf;
      if (h1.status === 'present' || h1.status === 'od' || (h1.status === 'leave' && h1.leaveType === 'paid')) {
        totalPayableShiftsValue += (Number(record.payableShifts || 1) / 2);
      }
    }

    // Check second half
    if (record.secondHalf) {
      const h2 = record.secondHalf;
      if (h2.status === 'present' || h2.status === 'od' || (h2.status === 'leave' && h2.leaveType === 'paid')) {
        totalPayableShiftsValue += (Number(record.payableShifts || 1) / 2);
      }
    }

    // Special case: If status is 'HALF_DAY' from attendance (recorded in dailyRecord if synced)
    // Attendance status map: attendanceRecordId.status or similar? 
    // Actually, resolveConflicts maps HALF_DAY to a single present half if appropriate.
    // So the split logic above already handles it (0.5 * payableShifts).
  }

  totals.totalPayableShifts = totalPayableShiftsValue;

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
