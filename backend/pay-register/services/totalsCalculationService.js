/**
 * Totals Calculation Service
 * Calculates monthly totals from pay register dailyRecords (fallback when no MonthlyAttendanceSummary).
 * Pay register month totals in production are synced from MonthlyAttendanceSummary via syncTotalsFromMonthlySummary (async; reads attendance settings for single-shift partial merge).
 */

const PreScheduledShift = require('../../shifts/model/PreScheduledShift');
const AttendanceSettings = require('../../attendance/model/AttendanceSettings');

/**
 * Get week-off and holiday counts from shift roster for the given employee and date range.
 * Used to ensure pay register totals respect roster (not just daily record statuses).
 * @param {String} emp_no - Employee number (will be normalized to uppercase)
 * @param {String} startDate - YYYY-MM-DD
 * @param {String} endDate - YYYY-MM-DD
 * @returns {Promise<{ totalWeeklyOffs: number, totalHolidays: number }>}
 */
async function getRosterWOHOLCounts(emp_no, startDate, endDate) {
  const empNoNorm = (emp_no && String(emp_no).trim()) ? String(emp_no).trim().toUpperCase() : '';
  if (!empNoNorm || !startDate || !endDate) {
    return { totalWeeklyOffs: 0, totalHolidays: 0 };
  }
  const startStr = typeof startDate === 'string' ? startDate : (startDate && startDate.toISOString) ? startDate.toISOString().slice(0, 10) : '';
  const endStr = typeof endDate === 'string' ? endDate : (endDate && endDate.toISOString) ? endDate.toISOString().slice(0, 10) : '';
  if (!startStr || !endStr) return { totalWeeklyOffs: 0, totalHolidays: 0 };

  const rosterNonWorking = await PreScheduledShift.find({
    employeeNumber: empNoNorm,
    date: { $gte: startStr, $lte: endStr },
    status: { $in: ['WO', 'HOL'] },
  })
    .select('date status')
    .lean();

  let totalWeeklyOffs = 0;
  let totalHolidays = 0;
  for (const row of rosterNonWorking) {
    if (row.status === 'WO') totalWeeklyOffs += 1;
    if (row.status === 'HOL') totalHolidays += 1;
  }
  return { totalWeeklyOffs, totalHolidays };
}

/**
 * Overwrite totals.totalWeeklyOffs and totals.totalHolidays from shift roster so pay register respects roster.
 * Call after calculateTotals() whenever pay register totals are set.
 * @param {Object} totals - Totals object (mutated in place)
 * @param {String} emp_no - Employee number
 * @param {String} startDate - YYYY-MM-DD
 * @param {String} endDate - YYYY-MM-DD
 * @returns {Promise<Object>} The same totals object (with totalWeeklyOffs/totalHolidays updated)
 */
async function ensureTotalsRespectRoster(totals, emp_no, startDate, endDate) {
  // if (!totals || typeof totals !== 'object') return totals;
  // const { totalWeeklyOffs, totalHolidays } = await getRosterWOHOLCounts(emp_no, startDate, endDate);
  // totals.totalWeeklyOffs = totalWeeklyOffs;
  // totals.totalHolidays = totalHolidays;
  return totals;
}

/**
 * Early-out counts in pay-register totals only if the second half is worked (present or OD).
 * Split day present+leave: early counts only when the second half is present/OD (not first-half-only).
 * Full non-split days: count when the day status is present, OD, or partial (both halves mirror full day).
 * @param {Object} record - Daily pay register row
 * @returns {boolean}
 */
function isLopNature(nRaw, ltRaw) {
  const n = String(nRaw || '').toLowerCase();
  const lt = String(ltRaw || '').toLowerCase();
  return (
    n === 'lop' ||
    n === 'without_pay' ||
    lt.includes('lop') ||
    lt.includes('loss of pay') ||
    lt.includes('sandwich')
  );
}

/**
 * Sum numeric `value` fields on contributingDates buckets (attendance summary → pay register).
 * @param {Object|null|undefined} contributingDates
 * @param {string[]} keys
 */
function sumContributingDateValues(contributingDates, keys) {
  if (!contributingDates || typeof contributingDates !== 'object') return 0;
  let t = 0;
  for (const k of keys) {
    const arr = contributingDates[k];
    if (!Array.isArray(arr)) continue;
    for (const e of arr) {
      const v = Number(e && e.value);
      if (Number.isFinite(v)) t += v;
    }
  }
  return Math.round(t * 100) / 100;
}

/**
 * Paid/LOP totals in contributingDates can exceed what we infer from daily cells alone
 * (e.g. sandwich LOP, partial LOP, halves still shown as absent in the grid).
 * Top up breakdown rows so modal "Sum (daily grid)" matches paidLeaves + lopLeaves highlights.
 */
function reconcileLeaveBreakdownWithContributingDates(rows, contributingDates) {
  if (!Array.isArray(rows) || !contributingDates || typeof contributingDates !== 'object') {
    return Array.isArray(rows) ? rows : [];
  }
  const targetPaid = sumContributingDateValues(contributingDates, ['paidLeaves']);
  const targetLop = sumContributingDateValues(contributingDates, ['lopLeaves']);
  if (targetPaid <= 0 && targetLop <= 0) return rows;

  let sumPaid = 0;
  let sumLop = 0;
  for (const r of rows) {
    if (r.kind === 'paid') sumPaid += Number(r.days) || 0;
    else if (r.kind === 'lop') sumLop += Number(r.days) || 0;
  }
  sumPaid = Math.round(sumPaid * 100) / 100;
  sumLop = Math.round(sumLop * 100) / 100;

  let dPaid = Math.round((targetPaid - sumPaid) * 100) / 100;
  let dLop = Math.round((targetLop - sumLop) * 100) / 100;
  if (dPaid < 0) dPaid = 0;
  if (dLop < 0) dLop = 0;

  const out = rows.map((r) => ({ ...r, days: Number(r.days) || 0 }));

  if (dPaid > 0.001) {
    const paidRows = out.filter((r) => r.kind === 'paid');
    if (paidRows.length === 1) {
      paidRows[0].days = Math.round((paidRows[0].days + dPaid) * 100) / 100;
    } else if (paidRows.length === 0) {
      out.push({ leaveType: 'Paid leave', kind: 'paid', days: dPaid });
    } else {
      out.push({ leaveType: 'Paid leave (summary)', kind: 'paid', days: dPaid });
    }
  }

  if (dLop > 0.001) {
    const lopRows = out.filter((r) => r.kind === 'lop');
    if (lopRows.length === 1) {
      lopRows[0].days = Math.round((lopRows[0].days + dLop) * 100) / 100;
    } else if (lopRows.length === 0) {
      out.push({ leaveType: 'LOP', kind: 'lop', days: dLop });
    } else {
      out.push({ leaveType: 'LOP (summary)', kind: 'lop', days: dLop });
    }
  }

  return out
    .filter((r) => (Number(r.days) || 0) > 0.0001)
    .sort((a, b) => b.days - a.days || String(a.leaveType).localeCompare(String(b.leaveType)));
}

/**
 * Leave days by configured leave type (from daily grid), aligned with pay-register UI / contributingDates.
 * Stored on payRegister.totals.leaveTypeBreakdown for reporting without re-walking dailyRecords clientside.
 * @param {Array} dailyRecords
 * @param {Object|null|undefined} contributingDates - When set (e.g. from monthly summary), reconcile paid/lop totals with lopLeaves/paidLeaves.
 * @returns {Array<{ leaveType: string, kind: 'paid'|'lop', days: number }>}
 */
function computeLeaveTypeBreakdownFromDailyRecords(dailyRecords, contributingDates) {
  const map = new Map();
  const bump = (ltRaw, natureRaw, inc) => {
    const add = Number(inc) || 0;
    if (add <= 0) return;
    const label = (String(ltRaw || '').trim()) || 'Unspecified';
    const kind = isLopNature(natureRaw, ltRaw) ? 'lop' : 'paid';
    const key = `${kind}\0${label}`;
    const prev = map.get(key);
    map.set(key, {
      days: Math.round(((prev && prev.days) || 0) + add * 100) / 100,
      kind,
      leaveType: label,
    });
  };

  if (!Array.isArray(dailyRecords)) return [];

  for (const record of dailyRecords) {
    if (!record || !record.date) continue;
    const isBlank =
      record.status === 'blank' ||
      (record.firstHalf?.status === 'blank' && record.secondHalf?.status === 'blank');
    if (isBlank) continue;

    const h1 = record.firstHalf && record.firstHalf.status;
    const h2 = record.secondHalf && record.secondHalf.status;
    const split = record.isSplit === true || !!(h1 && h2 && h1 !== h2);

    if (!split) {
      const s = record.status || h1 || h2;
      if (s === 'leave') {
        bump(record.leaveType || record.firstHalf?.leaveType, record.leaveNature || record.firstHalf?.leaveNature, 1);
      } else if (s === 'partial') {
        bump(
          record.leaveType || record.firstHalf?.leaveType || record.secondHalf?.leaveType,
          record.leaveNature || record.firstHalf?.leaveNature || record.secondHalf?.leaveNature,
          0.5
        );
      }
    } else {
      const halves = [record.firstHalf, record.secondHalf];
      for (const half of halves) {
        if (half && half.status === 'leave') {
          bump(half.leaveType, half.leaveNature, 0.5);
        }
      }
    }
  }

  const base = Array.from(map.values())
    .filter((r) => r.days > 0)
    .sort((a, b) => b.days - a.days || String(a.leaveType).localeCompare(String(b.leaveType)))
    .map((v) => ({ leaveType: v.leaveType, kind: v.kind, days: v.days }));

  return reconcileLeaveBreakdownWithContributingDates(base, contributingDates);
}

function isEarlyOutCountableSecondHalf(record) {
  const h2 = record.secondHalf && record.secondHalf.status;
  if (h2 === 'present' || h2 === 'od') return true;

  const h1 = record.firstHalf && record.firstHalf.status;
  const looksSplit =
    record.isSplit === true ||
    (h1 && h2 && h1 !== h2);
  if (looksSplit) return false;

  const full = record.status || h1 || h2;
  return full === 'present' || full === 'od' || full === 'partial';
}

/**
 * Calculate totals from dailyRecords array
 * @param {Array} dailyRecords - Array of daily record objects
 * @param {Object|null|undefined} contributingDates - Optional; improves leaveTypeBreakdown vs highlights
 * @returns {Object} Calculated totals
 */
function calculateTotals(dailyRecords, contributingDates) {
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
    totalLateInMinutes: 0,
    totalEarlyOutMinutes: 0,
    leaveTypeBreakdown: [],
  };

  if (!dailyRecords || dailyRecords.length === 0) {
    totals.leaveTypeBreakdown = [];
    return totals;
  }

  for (const record of dailyRecords) {
    const isBlankDay =
      record.status === 'blank' ||
      (record.firstHalf?.status === 'blank' && record.secondHalf?.status === 'blank');
    if (isBlankDay) continue;

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

    if (record.isLate && isPresentOrPartial) {
      totals.lateCount++;
      if (typeof record.lateInMinutes === 'number') {
        totals.totalLateInMinutes += record.lateInMinutes;
      }
    }
    if (record.isEarlyOut && isEarlyOutCountableSecondHalf(record)) {
      totals.earlyOutCount++;
      if (typeof record.earlyOutMinutes === 'number') {
        totals.totalEarlyOutMinutes += record.earlyOutMinutes;
      }
    }
  }

  // Calculate totals (full days + half days * 0.5)
  totals.totalODDays = totals.odDays + totals.odHalfDays * 0.5;
  // Present days = attendance present + OD days. When a day/half is marked OD (e.g. edited from absent), it is included here.
  totals.totalPresentDays = totals.presentDays + totals.presentHalfDays * 0.5 + totals.totalODDays;
  totals.totalAbsentDays = totals.absentDays + totals.absentHalfDays * 0.5;
  totals.totalPaidLeaveDays = totals.paidLeaveDays + totals.paidLeaveHalfDays * 0.5;
  totals.totalUnpaidLeaveDays = 0; // No separate unpaid bucket; all non-paid leaves are LOP
  totals.totalLopDays = totals.lopDays + totals.lopHalfDays * 0.5;
  totals.totalLeaveDays = totals.totalPaidLeaveDays + totals.totalLopDays;

  // Calculate totalPayableShifts by summing up individual record values
  // This respects shifts with multiple payable units (e.g. 2.0)
  let totalPayableShiftsValue = 0;
  for (const record of dailyRecords) {
    const isBlankDay =
      record.status === 'blank' ||
      (record.firstHalf?.status === 'blank' && record.secondHalf?.status === 'blank');
    if (isBlankDay) continue;

    const isHoliday = record.status === 'holiday' || record.firstHalf?.status === 'holiday' || record.secondHalf?.status === 'holiday';
    const isWeekOff = record.status === 'week_off' || record.firstHalf?.status === 'week_off' || record.secondHalf?.status === 'week_off';

    // Only count if it's a "payable" status (present, od, or paid leave)
    // For simplicity in totalPayableShifts, we don't count holiday/weekoff here 
    // as payroll calculation service adds those separately or handles them via totalPaidDays

    // Check first half
    if (record.firstHalf) {
      const h1 = record.firstHalf;
      if (h1.status === 'present' || h1.status === 'od') {
        totalPayableShiftsValue += (Number(record.payableShifts || 1) / 2);
      }
    }

    // Check second half
    if (record.secondHalf) {
      const h2 = record.secondHalf;
      if (h2.status === 'present' || h2.status === 'od') {
        totalPayableShiftsValue += (Number(record.payableShifts || 1) / 2);
      }
    }

    // Special case: If status is 'HALF_DAY' from attendance (recorded in dailyRecord if synced)
    // Attendance status map: attendanceRecordId.status or similar? 
    // Actually, resolveConflicts maps HALF_DAY to a single present half if appropriate.
    // So the split logic above already handles it (0.5 * payableShifts).
  }

  totals.totalPayableShifts = Math.round(
    (totalPayableShiftsValue + sumPartialPayableFromDailyRecords(dailyRecords)) * 100
  ) / 100;

  totals.leaveTypeBreakdown = computeLeaveTypeBreakdownFromDailyRecords(dailyRecords, contributingDates);

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

/**
 * Payable shift credit from PARTIAL halves/days (uses per-day payableShifts units).
 * The present/OD loop in calculateTotals ignores partial; monthly summary still credits dayPayable for partial.
 */
function sumPartialPayableFromDailyRecords(dailyRecords) {
  if (!Array.isArray(dailyRecords)) return 0;
  let t = 0;
  for (const record of dailyRecords) {
    const isBlankDay =
      record.status === 'blank' ||
      (record.firstHalf?.status === 'blank' && record.secondHalf?.status === 'blank');
    if (isBlankDay) continue;

    const isHoliday =
      record.status === 'holiday' ||
      record.firstHalf?.status === 'holiday' ||
      record.secondHalf?.status === 'holiday';
    const isWeekOff =
      record.status === 'week_off' ||
      record.firstHalf?.status === 'week_off' ||
      record.secondHalf?.status === 'week_off';
    if (isHoliday || isWeekOff) continue;

    const unitRaw = Number(record.payableShifts);
    const unit = Number.isFinite(unitRaw) && unitRaw > 0 ? unitRaw : 1;

    const fh = record.firstHalf?.status;
    const sh = record.secondHalf?.status;
    if (record.firstHalf && fh === 'partial') t += unit / 2;
    if (record.secondHalf && sh === 'partial') t += unit / 2;
    if (!record.isSplit && record.status === 'partial' && fh !== 'partial' && sh !== 'partial') {
      t += unit;
    }
  }
  return Math.round(t * 100) / 100;
}

/**
 * When summary.totalPartialPresentPayableOverlap is missing (older Mongo docs), approximate the same
 * quantity from contributingDates: same calendar date in both `present` and `partial` means the engine
 * credited both dayPresent and dayPayable (e.g. PARTIAL + ESI half-day) — subtract min(sum) per date.
 * @param {Object|null|undefined} summary
 * @returns {number}
 */
function contributingDatesPartialPresentOverlap(summary) {
  const cd = summary && summary.contributingDates;
  if (!cd || typeof cd !== 'object') return 0;
  const partialArr = cd.partial;
  const presentArr = cd.present;
  if (!Array.isArray(partialArr) || !Array.isArray(presentArr) || partialArr.length === 0) return 0;

  const presentByDate = new Map();
  for (const e of presentArr) {
    if (!e || !e.date) continue;
    const d = String(e.date);
    const v = Number(e.value);
    if (!Number.isFinite(v) || v <= 0) continue;
    presentByDate.set(d, Math.round(((presentByDate.get(d) || 0) + v) * 100) / 100);
  }

  const partialByDate = new Map();
  for (const e of partialArr) {
    if (!e || !e.date) continue;
    const d = String(e.date);
    const v = Number(e.value);
    if (!Number.isFinite(v) || v <= 0) continue;
    partialByDate.set(d, Math.round(((partialByDate.get(d) || 0) + v) * 100) / 100);
  }

  let t = 0;
  for (const [d, partSum] of partialByDate) {
    const pSum = presentByDate.get(d);
    if (pSum == null || pSum <= 0 || partSum <= 0) continue;
    t += Math.min(pSum, partSum);
  }
  return Math.round(t * 100) / 100;
}

/**
 * Overlap to subtract when folding totalPartialDays into present (single-shift).
 * Uses max(engine, contributingDates) so stale/missing DB field still matches CD when both buckets exist.
 * Capped at partialRollup — overlap cannot exceed the partial bucket.
 * @param {Object|null|undefined} summary
 * @param {number} partialRollup - summary.totalPartialDays (rounded), upper bound for overlap
 * @returns {number}
 */
function getPartialPresentOverlapForSync(summary, partialRollup) {
  if (!summary || typeof summary !== 'object') return 0;
  const cdOverlap = contributingDatesPartialPresentOverlap(summary);
  let stored = 0;
  if (Object.prototype.hasOwnProperty.call(summary, 'totalPartialPresentPayableOverlap')) {
    const n = Number(summary.totalPartialPresentPayableOverlap);
    if (Number.isFinite(n)) stored = Math.round(n * 100) / 100;
  }
  const raw = Math.round(Math.max(stored, cdOverlap) * 100) / 100;
  const partCap = Math.round((Number(partialRollup) || 0) * 100) / 100;
  if (partCap <= 0) return 0;
  return Math.round(Math.min(raw, partCap) * 100) / 100;
}

/**
 * Map totals from MonthlyAttendanceSummary to PayRegisterSummary structure.
 * This ensures Pay Register uses the "correct mark" from Attendance module.
 * @param {Object} payRegister - PayRegisterSummary document (mutated in place)
 * @param {Object} summary - MonthlyAttendanceSummary document
 */
async function syncTotalsFromMonthlySummary(payRegister, summary) {
  if (!payRegister || !summary) return;

  const totals = payRegister.totals || {};

  const settings = await AttendanceSettings.getSettings();
  const pm = AttendanceSettings.getProcessingMode(settings);

  // Core attendance metrics
  const sPresRaw = Math.round((Number(summary.totalPresentDays) || 0) * 100) / 100;
  const sPartRaw = Math.round((Number(summary.totalPartialDays) || 0) * 100) / 100;
  const sOverlapRaw = getPartialPresentOverlapForSync(summary, sPartRaw);

  // Single-shift: fold partial payable into stored present for payroll, but not double-count halves that
  // already contributed to totalPresentDays (e.g. PARTIAL + ESI half-day → dayPresent and dayPayable both 0.5).
  if (pm.mode === 'single_shift') {
    let merged = Math.round((sPresRaw + sPartRaw - sOverlapRaw) * 100) / 100;
    const ceiling = Math.round((sPresRaw + sPartRaw) * 100) / 100;
    merged = Math.min(ceiling, Math.max(sPresRaw, merged));
    totals.totalPresentDays = merged;
  } else {
    totals.totalPresentDays = sPresRaw;
  }
  totals.totalAbsentDays = summary.totalAbsentDays || 0;
  totals.totalODDays = summary.totalODs || 0;
  
  // Leave breakdown (now with Paid/LOP from attendance summary)
  totals.totalPaidLeaveDays = summary.totalPaidLeaves || 0;
  totals.totalLopDays = summary.totalLopLeaves || 0;
  totals.totalLeaveDays = summary.totalLeaves || 0;
  
  // Payroll specific
  totals.totalPayableShifts = summary.totalPayableShifts || 0;
  // Single-shift: ensure payable shifts never sit below present + partial PT + OD + paid
  // (summary engine can differ from stored summary rows; partial halves are easy to drop on daily recompute).
  if (pm.mode === 'single_shift') {
    let mergedPres = Math.round((sPresRaw + sPartRaw - sOverlapRaw) * 100) / 100;
    mergedPres = Math.min(
      Math.round((sPresRaw + sPartRaw) * 100) / 100,
      Math.max(sPresRaw, mergedPres)
    );
    const sOd = Math.round((Number(summary.totalODs) || 0) * 100) / 100;
    const sPaid = Math.round((Number(summary.totalPaidLeaves) || 0) * 100) / 100;
    const payableFloor = Math.round((mergedPres + sOd + sPaid) * 100) / 100;
    const cur = Math.round((Number(totals.totalPayableShifts) || 0) * 100) / 100;
    if (payableFloor > cur) totals.totalPayableShifts = payableFloor;
  }
  totals.totalOTHours = summary.totalOTHours || 0;
  totals.totalWeeklyOffs = summary.totalWeeklyOffs || 0;
  totals.totalHolidays = summary.totalHolidays || 0;
  
  // Exceptions (Late/Early)
  totals.lateCount = summary.lateInCount || 0;
  totals.earlyOutCount = summary.earlyOutCount || 0;
  
  // Optional but helpful for debugging
  totals.totalLateInMinutes = summary.totalLateInMinutes || 0;
  totals.totalEarlyOutMinutes = summary.totalEarlyOutMinutes || 0;

  // Since we are overriding the totals, we should probably also 
  // clear the full/half sub-counters as they are now derived from the attendance summary
  totals.presentDays = Math.floor(totals.totalPresentDays);
  totals.presentHalfDays = (totals.totalPresentDays % 1) >= 0.5 ? 1 : 0;
  
  totals.absentDays = Math.floor(totals.totalAbsentDays);
  totals.absentHalfDays = (totals.totalAbsentDays % 1) >= 0.5 ? 1 : 0;

  totals.paidLeaveDays = Math.floor(totals.totalPaidLeaveDays);
  totals.paidLeaveHalfDays = (totals.totalPaidLeaveDays % 1) >= 0.5 ? 1 : 0;

  totals.lopDays = Math.floor(totals.totalLopDays);
  totals.lopHalfDays = (totals.totalLopDays % 1) >= 0.5 ? 1 : 0;

  totals.leaveTypeBreakdown = computeLeaveTypeBreakdownFromDailyRecords(
    payRegister.dailyRecords || [],
    summary.contributingDates || payRegister.contributingDates
  );

  payRegister.totals = totals;
  payRegister.markModified('totals');
}

/**
 * After grid recalculation (recalculateTotals), re-apply only MAS-merged **Present Days** and **Payable Shifts**
 * for `processingMode.mode === 'single_shift'`, so the pay register header matches:
 *   monthly `totalPresentDays` + `totalPartialDays` − `totalPartialPresentPayableOverlap` (same as syncTotalsFromMonthlySummary),
 *   not a naive sum of `P` cells. Other totals (OD, leave, absent) stay from the grid pass.
 * Returns true if single_shift merge was applied, false if skipped (multi_shift or no settings).
 * @param {Object} totals - payRegister.totals (mutated in place)
 * @param {Object} summary - MonthlyAttendanceSummary
 */
async function mergeSingleShiftPresentPayableFromSummaryIfApplicable(totals, summary) {
  if (!totals || !summary) return false;
  const settings = await AttendanceSettings.getSettings();
  const pm = AttendanceSettings.getProcessingMode(settings);
  if (pm.mode !== 'single_shift') return false;

  const sPresRaw = Math.round((Number(summary.totalPresentDays) || 0) * 100) / 100;
  const sPartRaw = Math.round((Number(summary.totalPartialDays) || 0) * 100) / 100;
  const sOverlapRaw = getPartialPresentOverlapForSync(summary, sPartRaw);
  let merged = Math.round((sPresRaw + sPartRaw - sOverlapRaw) * 100) / 100;
  const ceiling = Math.round((sPresRaw + sPartRaw) * 100) / 100;
  merged = Math.min(ceiling, Math.max(sPresRaw, merged));
  totals.totalPresentDays = merged;
  totals.presentDays = Math.floor(merged);
  totals.presentHalfDays = (merged % 1) >= 0.5 ? 1 : 0;

  totals.totalPayableShifts = Math.round((Number(summary.totalPayableShifts) || 0) * 100) / 100;
  let mergedPres = merged;
  mergedPres = Math.min(
    Math.round((sPresRaw + sPartRaw) * 100) / 100,
    Math.max(sPresRaw, mergedPres)
  );
  const sOd = Math.round((Number(summary.totalODs) || 0) * 100) / 100;
  const sPaid = Math.round((Number(summary.totalPaidLeaves) || 0) * 100) / 100;
  const payableFloor = Math.round((mergedPres + sOd + sPaid) * 100) / 100;
  const cur = Math.round((Number(totals.totalPayableShifts) || 0) * 100) / 100;
  if (payableFloor > cur) totals.totalPayableShifts = payableFloor;
  return true;
}

module.exports = {
  calculateTotals,
  computeLeaveTypeBreakdownFromDailyRecords,
  countDaysByCategory,
  calculatePayableShifts,
  sumPartialPayableFromDailyRecords,
  getRosterWOHOLCounts,
  ensureTotalsRespectRoster,
  syncTotalsFromMonthlySummary,
  mergeSingleShiftPresentPayableFromSummaryIfApplicable,
  isEarlyOutCountableSecondHalf,
};

