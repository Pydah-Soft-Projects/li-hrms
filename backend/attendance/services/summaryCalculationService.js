const AttendanceDaily = require('../model/AttendanceDaily');
const Leave = require('../../leaves/model/Leave');
const LeaveSplit = require('../../leaves/model/LeaveSplit');
const OD = require('../../leaves/model/OD');
const MonthlyAttendanceSummary = require('../model/MonthlyAttendanceSummary');
const AttendanceSettings = require('../model/AttendanceSettings');
const PreScheduledShift = require('../../shifts/model/PreScheduledShift');
const Shift = require('../../shifts/model/Shift');
const { createISTDate, extractISTComponents, getAllDatesInRange } = require('../../shared/utils/dateUtils');
const dateCycleService = require('../../leaves/services/dateCycleService');
const Employee = require('../../employees/model/Employee');
const OT = require('../../overtime/model/OT');
const deductionService = require('../../payroll/services/deductionService');
const { getAbsentDeductionSettings } = require('../../payroll/services/allowanceDeductionResolverService');

function defaultAttendancePolicyDeductionBreakdown() {
  return {
    lateInsCount: 0,
    earlyOutsCount: 0,
    combinedCount: 0,
    freeAllowedPerMonth: 0,
    effectiveCount: 0,
    daysDeducted: 0,
    lateEarlyDaysDeducted: 0,
    absentExtraDays: 0,
    absentDays: 0,
    lopDaysPerAbsent: null,
    deductionType: null,
    calculationMode: null,
  };
}

/** Normalize to YYYY-MM-DD for reliable set membership (attendance date vs OD loop date) */
function toNormalizedDateStr(val) {
  if (!val) return '';
  if (val instanceof Date) return extractISTComponents(val).dateStr;
  const s = String(val).trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.substring(0, 10);
  return extractISTComponents(new Date(val)).dateStr;
}

function isAbsentStatus(status) {
  return String(status || '').toUpperCase() === 'ABSENT';
}

function isEsiLeaveEntry(leaveEntry) {
  return String(leaveEntry?.leaveType || '').trim().toUpperCase() === 'ESI';
}

function isFullDayEsiLeaveEntry(leaveEntry) {
  if (!isEsiLeaveEntry(leaveEntry)) return false;
  if (leaveEntry?.isHalfDay) return false;
  if (typeof leaveEntry?.numberOfDays === 'number' && leaveEntry.numberOfDays < 1) return false;
  return true;
}

function isHalfDayEsiLeaveEntry(leaveEntry) {
  if (!isEsiLeaveEntry(leaveEntry)) return false;
  return !!leaveEntry?.isHalfDay || Number(leaveEntry?.numberOfDays) === 0.5;
}

function getPunchHoursFromAttendance(attendance) {
  if (!attendance) return 0;
  const shifts = Array.isArray(attendance.shifts) ? attendance.shifts : [];
  if (shifts.length > 0) {
    const sum = shifts.reduce((acc, s) => acc + (Number(s?.punchHours) || 0), 0);
    return Math.round(sum * 100) / 100;
  }
  return Math.round((Number(attendance.totalWorkingHours) || 0) * 100) / 100;
}

function getExpectedHoursFromAttendance(attendance) {
  if (!attendance) return 0;
  const totalExpected = Number(attendance.totalExpectedHours) || 0;
  if (totalExpected > 0) return totalExpected;
  const shifts = Array.isArray(attendance.shifts) ? attendance.shifts : [];
  const fromShifts = shifts.reduce((acc, s) => acc + (Number(s?.expectedHours) || 0), 0);
  return fromShifts > 0 ? fromShifts : 8;
}

/** Pay register leave halves use paid/lop keys (same as populate resolveConflicts). */
function normalizePayRegisterLeaveNature(l) {
  const n = String(l.leaveNature || '').toLowerCase();
  if (n === 'paid') return 'paid';
  if (n === 'lop' || n === 'without_pay') return 'lop';
  const lt = String(l.leaveType || '').toLowerCase();
  if (lt.includes('lop') || lt.includes('loss of pay') || lt.includes('sandwich')) return 'lop';
  return 'paid';
}

function pickLeaveMetaForHalf(leaves, half) {
  if (!leaves || !leaves.length) return { leaveTypeKey: 'paid', leaveNature: 'paid' };
  const full = leaves.find((x) => !x.isHalfDay);
  if (full) {
    const nat = normalizePayRegisterLeaveNature(full);
    return { leaveTypeKey: nat, leaveNature: nat };
  }
  const key = half === 'first' ? 'first_half' : 'second_half';
  const h = leaves.find((x) => x.isHalfDay && x.halfDayType === key);
  if (h) {
    const nat = normalizePayRegisterLeaveNature(h);
    return { leaveTypeKey: nat, leaveNature: nat };
  }
  const nat = normalizePayRegisterLeaveNature(leaves[0]);
  return { leaveTypeKey: nat, leaveNature: nat };
}

function buildPayRegisterHalfFromCredits(leaveC, odC, attC, day, halfKey, leaves) {
  if (day.isWO) {
    return { status: 'week_off', leaveType: null, leaveNature: null, isOD: false, otHours: 0 };
  }
  if (day.isHOL) {
    return { status: 'holiday', leaveType: null, leaveNature: null, isOD: false, otHours: 0 };
  }
  const lc = Number(leaveC) || 0;
  const oc = Number(odC) || 0;
  const ac = Number(attC) || 0;
  const m = Math.max(lc, oc, ac);
  if (m < 0.5) {
    return { status: 'absent', leaveType: null, leaveNature: null, isOD: false, otHours: 0 };
  }
  if (lc >= 0.5 && lc >= oc && lc >= ac) {
    const meta = pickLeaveMetaForHalf(leaves, halfKey);
    return {
      status: 'leave',
      leaveType: meta.leaveTypeKey,
      leaveNature: meta.leaveNature,
      isOD: false,
      otHours: 0,
    };
  }
  if (oc >= 0.5 && oc >= ac) {
    return { status: 'od', leaveType: null, leaveNature: null, isOD: true, otHours: 0 };
  }
  if (ac >= 0.5) {
    return { status: 'present', leaveType: null, leaveNature: null, isOD: false, otHours: 0 };
  }
  return { status: 'absent', leaveType: null, leaveNature: null, isOD: false, otHours: 0 };
}

function adjustPayRegisterHalvesForPartialDay(firstHalf, secondHalf, isPartialDay, dayPayable) {
  if (!isPartialDay) return { firstHalf, secondHalf };
  const pay = Math.min(1, Math.max(0, Number(dayPayable) || 0));
  if (pay <= 0) return { firstHalf, secondHalf };
  const bothAbsent =
    firstHalf.status === 'absent' &&
    secondHalf.status === 'absent';
  if (!bothAbsent) return { firstHalf, secondHalf };
  const present = {
    status: 'present',
    leaveType: null,
    leaveNature: null,
    isOD: false,
    otHours: 0,
  };
  const abs = {
    status: 'absent',
    leaveType: null,
    leaveNature: null,
    isOD: false,
    otHours: 0,
  };
  const lopLeave = {
    status: 'leave',
    leaveType: 'lop',
    leaveNature: 'lop',
    isOD: false,
    otHours: 0,
  };
  if (pay >= 1) {
    return { firstHalf: { ...present }, secondHalf: { ...present } };
  }
  if (pay >= 0.5) {
    return { firstHalf: { ...present }, secondHalf: { ...lopLeave } };
  }
  return { firstHalf, secondHalf };
}

/** Before DOJ / after last working day: no absent/WO/HOL — empty cells in pay register day grid. */
function buildBlankPayRegisterDaySnapshot(dStr) {
  const blankHalf = {
    status: 'blank',
    leaveType: null,
    leaveNature: null,
    isOD: false,
    otHours: 0,
  };
  return {
    date: dStr,
    firstHalf: { ...blankHalf },
    secondHalf: { ...blankHalf },
    status: 'blank',
    isSplit: false,
    leaveType: null,
    leaveNature: null,
    isOD: false,
  };
}

function buildPayRegisterDaySnapshotFromEngine(dStr, day, ctx) {
  const {
    leaveFirstAll,
    leaveSecondAll,
    attFirst,
    attSecond,
    odFirst,
    odSecond,
    isPartialDay,
    dayPayable,
  } = ctx;
  let firstHalf = buildPayRegisterHalfFromCredits(leaveFirstAll, odFirst, attFirst, day, 'first', day.leaves);
  let secondHalf = buildPayRegisterHalfFromCredits(leaveSecondAll, odSecond, attSecond, day, 'second', day.leaves);
  const adj = adjustPayRegisterHalvesForPartialDay(firstHalf, secondHalf, isPartialDay, dayPayable);
  firstHalf = adj.firstHalf;
  secondHalf = adj.secondHalf;
  const isSplit = firstHalf.status !== secondHalf.status;
  const status = isSplit ? null : firstHalf.status;
  const leaveType = isSplit ? null : (firstHalf.status === 'leave' ? firstHalf.leaveType : null);
  const leaveNature = isSplit ? null : (firstHalf.status === 'leave' ? firstHalf.leaveNature : null);
  const isOD = isSplit ? false : firstHalf.isOD;
  return {
    date: dStr,
    firstHalf,
    secondHalf,
    status,
    isSplit,
    leaveType,
    leaveNature,
    isOD,
  };
}

function getHalfPortion(status, targetStatus, leaveNature) {
  if (status !== targetStatus) return 0;
  if (targetStatus !== 'leave') return 0.5;
  const nat = String(leaveNature || '').toLowerCase();
  return nat === 'lop' || nat === 'without_pay' ? 0.5 : 0;
}

/**
 * Single-shift partial + payable credit: ensure pay-register halves show policy LOP (not default "paid").
 * Applies when worked/payable + policy LOP split the day (~0.5 + ~0.5) and there is no approved leave
 * using that capacity (see partialLopPortion, which subtracts leaveContrib before calling this).
 */
function enforceSingleShiftPartialLopSnapshot(snapshot, usePartialPayable, dayPayable, partialLopPortion) {
  if (!snapshot || !usePartialPayable) return snapshot;
  const lop = Math.min(1, Math.max(0, Number(partialLopPortion) || 0));
  if (lop <= 0.001) return snapshot;
  const pay = Math.min(1, Math.max(0, Number(dayPayable) || 0));
  if (pay < 0.5 - 1e-6 || lop < 0.5 - 1e-6 || pay + lop > 1.0001) return snapshot;
  const presentHalf = {
    status: 'present',
    leaveType: null,
    leaveNature: null,
    isOD: false,
    otHours: 0,
  };
  const lopHalf = {
    status: 'leave',
    leaveType: 'lop',
    leaveNature: 'lop',
    isOD: false,
    otHours: 0,
  };
  return {
    ...snapshot,
    firstHalf: { ...presentHalf },
    secondHalf: { ...lopHalf },
    isSplit: true,
    status: null,
    leaveType: null,
    leaveNature: null,
    isOD: false,
  };
}

/**
 * Monthly summary is recalculated in the background when:
 * - An AttendanceDaily doc is saved (post-save hook defers recalc via setImmediate)
 * - An AttendanceDaily doc is updated via findOneAndUpdate (post-hook, same defer)
 * - Leave/OD approved, OT applied, permissions, etc. (call recalculateOn* directly)
 * Summaries are not triggered by insertMany/bulk writes; missing summaries are
 * calculated on demand when loading the monthly attendance view.
 */

/**
 * Calculate and update monthly attendance summary for an employee
 * @param {string} employeeId - Employee ID
 * @param {string} emp_no - Employee number
 * @param {number} year - Year (e.g., 2024)
 * @param {number} monthNumber - Month number (1-12)
 * @param {{ startDateStr?: string, endDateStr?: string }} [periodOverride] - If set, use these bounds instead of resolving from anchor (ensures correct period when recalc is triggered by a specific date)
 * @returns {Promise<Object>} Updated summary
 */
async function calculateMonthlySummary(employeeId, emp_no, year, monthNumber, periodOverride) {
  try {
    console.log('[OD-FLOW] calculateMonthlySummary called', { employeeId: employeeId?.toString(), emp_no, year, monthNumber, periodOverride: !!periodOverride });
    // Get or create summary
    let summary = await MonthlyAttendanceSummary.getOrCreate(employeeId, emp_no, year, monthNumber);



    let startDateStr, endDateStr, payrollStart, payrollEnd, startComponents, endComponents;
    if (periodOverride && periodOverride.startDateStr && periodOverride.endDateStr) {
      startDateStr = periodOverride.startDateStr;
      endDateStr = periodOverride.endDateStr;
      payrollStart = createISTDate(startDateStr);
      payrollEnd = createISTDate(endDateStr);
      startComponents = extractISTComponents(payrollStart);
      endComponents = extractISTComponents(payrollEnd);
    } else {
      // Resolve the actual period window using payroll cycle (pay-cycle aware month).
      // Anchor must fall inside the period we want so we load the correct dailies.
      // - Calendar month (1-31): (year, monthNumber) = that month → anchor = 15th of that month.
      // - Custom cycle (e.g. 26-25, startDay >= 15): For month M we want the period that ENDS in M
      //   (e.g. February → 26 Jan–25 Feb). Using 15th of the current month as anchor gives that period.
      await dateCycleService.getPayrollCycleSettings(); // ensure settings loaded
      const anchorDateStr = `${year}-${String(monthNumber).padStart(2, '0')}-15`;
      const anchorDate = createISTDate(anchorDateStr);
      const periodInfo = await dateCycleService.getPeriodInfo(anchorDate);
      payrollStart = periodInfo.payrollCycle.startDate;
      payrollEnd = periodInfo.payrollCycle.endDate;
      startComponents = extractISTComponents(payrollStart);
      endComponents = extractISTComponents(payrollEnd);
      startDateStr = startComponents.dateStr;
      endDateStr = endComponents.dateStr;
    }

    // [SELF-REPAIR] If summary exists but missing bounds, or bounds don't match expected period, repair it.
    if (!summary.startDate || !summary.endDate || !summary.totalDaysInMonth) {
        summary.startDate = startDateStr;
        summary.endDate = endDateStr;
        
        // Correct total days logic
        const start = new Date(startDateStr);
        const end = new Date(endDateStr);
        summary.totalDaysInMonth = Math.round((end - start) / (1000 * 60 * 60 * 24)) + 1;
        
        // Force the model to recognize changes since these were newly added
        summary.markModified('startDate');
        summary.markModified('endDate');
        summary.markModified('totalDaysInMonth');
        
        await summary.save();
    }
    // IMPORTANT: endDate must be inclusive until end-of-day IST.
    // If we use 00:00 for endDate, Date comparisons ($lte) can drop leaves/splits
    // that occur later on the last day due to UTC storage offsets.
    const startDate = createISTDate(startDateStr, '00:00');
    const endDate = createISTDate(endDateStr, '23:59');

    // Month days = exact number of days in the pay period (fully respects pay cycle e.g. 25 Jan–26 Feb = 33 days)
    const periodDays = getAllDatesInRange(startDateStr, endDateStr).length;
    summary.totalDaysInMonth = Math.round(periodDays);
    const todayIstStr = extractISTComponents(new Date()).dateStr;

    const attendanceSettingsDoc = await AttendanceSettings.getSettings();
    const processingModeIsSingleShift =
      attendanceSettingsDoc?.processingMode?.mode === 'single_shift';
    const partialDaysContributeToPayableShifts =
      processingModeIsSingleShift &&
      attendanceSettingsDoc?.featureFlags?.partialDaysContributeToPayableShifts === true;

    // Initialize contributing dates tracker
    const contributingDates = {
      present: [],
      leaves: [],
      paidLeaves: [],
      lopLeaves: [],
      ods: [],
      partial: [],
      weeklyOffs: [],
      holidays: [],
      payableShifts: [],
      otHours: [],
      extraHours: [],
      lateIn: [],
      earlyOut: [],
      permissions: [],
      absent: [],
    };

    // Normalize emp_no so we match AttendanceDaily.employeeNumber (schema uses uppercase)
    const empNoNorm = (emp_no && String(emp_no).trim()) ? String(emp_no).toUpperCase() : emp_no;

    // 0. Fetch employee joining/resignation dates to respect boundaries
    const employeeInfoForBoundaries = await Employee.findById(employeeId).select('doj leftDate').lean();
    const dojStrBound = employeeInfoForBoundaries?.doj ? extractISTComponents(employeeInfoForBoundaries.doj).dateStr : null;
    const leftDateStrBound = employeeInfoForBoundaries?.leftDate ? extractISTComponents(employeeInfoForBoundaries.leftDate).dateStr : null;

    /** Before DOJ or after last working day: blank employment — no WO/HOL, leave, OD, absent, or other metrics. */
    const isOutsideEmploymentBound = (dStr) => {
      if (!dStr) return false;
      if (dojStrBound && dStr < dojStrBound) return true;
      if (leftDateStrBound && dStr > leftDateStrBound) return true;
      return false;
    };

    // 1. Get all attendance records for this month (fresh from DB so we see latest status/payableShifts after OD updates)
    const attendanceRecords = await AttendanceDaily.find({
      employeeNumber: empNoNorm,
      date: {
        $gte: startDateStr,
        $lte: endDateStr,
      },
    })
      .select('date status shifts inTime outTime totalWorkingHours extraHours totalLateInMinutes totalEarlyOutMinutes payableShifts earlyOutDeduction')
      .populate('shifts.shiftId', 'payableShifts name')
      .lean();
    console.log('[OD-FLOW] calculateMonthlySummary loaded dailies', { emp_no: empNoNorm, period: `${startDateStr}..${endDateStr}`, count: attendanceRecords.length });

    // --- DAILY MERGE ENGINE ---
    const dailyStatsMap = new Map();
    const allDates = getAllDatesInRange(startDateStr, endDateStr);
    for (const dStr of allDates) {
      dailyStatsMap.set(dStr, {
        date: dStr,
        attendance: null,
        ods: [],
        leaves: [],
        isWO: false, // Will be set from rosterNonWorking
        isHOL: false, // Will be set from rosterNonWorking
        // Results for this day
        present: 0,
        payable: 0,
        lateIn: 0,
        earlyOut: 0,
        lateInWaved: false,
        earlyOutWaved: false,
        isExtra: false,
      });
    }

    // 2. Week-offs and holidays in period from shift roster (PreScheduledShift), then leave + sandwich rules adjust counts below.
    const rosterNonWorking = await PreScheduledShift.find({
      employeeNumber: empNoNorm,
      date: { $gte: startDateStr, $lte: endDateStr },
      status: { $in: ['WO', 'HOL'] },
    })
      .select('date status')
      .lean();

    const weekOffDates = new Set();
    const holidayDates = new Set();
    const originalNonWorkingStatusByDate = new Map();
    for (const row of rosterNonWorking) {
      const dateKey = toNormalizedDateStr(row?.date);
      if (!dateKey || isOutsideEmploymentBound(dateKey)) continue;
      if (dailyStatsMap.has(dateKey)) {
        if (row.status === 'WO') {
          dailyStatsMap.get(dateKey).isWO = true;
          weekOffDates.add(dateKey);
          originalNonWorkingStatusByDate.set(dateKey, 'WO');
        }
        if (row.status === 'HOL') {
          dailyStatsMap.get(dateKey).isHOL = true;
          holidayDates.add(dateKey);
          originalNonWorkingStatusByDate.set(dateKey, 'HOL');
        }
      }
    }

    // 4. Get approved leaves for this month (Using .lean() and projections)
    // Load every approved leave overlapping the period (including split_approved parents).
    // Days that have an approved LeaveSplit for this leave use splits only; any date in
    // the parent range with no split row still uses the parent so we never drop coverage.
    const approvedLeaves = await Leave.find({
      employeeId,
      status: 'approved',
      isActive: true,
      fromDate: { $lte: endDate },
      toDate: { $gte: startDate },
    }).select('fromDate toDate isHalfDay halfDayType leaveType leaveNature numberOfDays').lean();

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
    }).select('fromDate toDate isHalfDay odType_extended halfDayType').lean(); // Added halfDayType

    // 4b. Get approved split leaves for this period (so leave totals are correct)
    const approvedLeaveSplits = await LeaveSplit.find({
      employeeId,
      status: 'approved',
      date: { $gte: startDate, $lte: endDate },
    }).select('leaveId date isHalfDay halfDayType numberOfDays leaveType leaveNature').lean();

    /** Dates where LeaveSplit already defines that leave — skip parent push to avoid double-counting paid/leave units. */
    const leaveSplitCoverageKeys = new Set();
    for (const split of approvedLeaveSplits) {
      if (!split?.leaveId) continue;
      const dStr = toNormalizedDateStr(split.date);
      leaveSplitCoverageKeys.add(`${String(split.leaveId)}_${dStr}`);
    }

    // Half-day ESI remaining-hours logic:
    // if OT was declared from ESI conversion, use remaining punch hours
    // (punch - declared OT) for present/payable contribution.
    const esiOtRecords = await OT.find({
      employeeId,
      date: { $gte: startDateStr, $lte: endDateStr },
      source: 'esi_leave_conversion',
      isActive: true,
      status: { $in: ['pending', 'manager_approved', 'approved'] },
    }).select('date otHours').lean();
    const esiOtHoursByDate = new Map(
      (esiOtRecords || []).map((r) => [toNormalizedDateStr(r.date), Number(r.otHours) || 0])
    );

    // Fill map from attendance (needed before sandwich rule uses ABSENT from dailies)
    for (const rec of attendanceRecords) {
      const dStr = toNormalizedDateStr(rec.date);
      if (dailyStatsMap.has(dStr)) {
        dailyStatsMap.get(dStr).attendance = rec;
      }
    }

    for (const od of approvedODs) {
      if (od.odType_extended === 'hours') continue;
      const start = toNormalizedDateStr(od.fromDate);
      const end = toNormalizedDateStr(od.toDate);
      const range = getAllDatesInRange(start, end);
      for (const dStr of range) {
        if (dailyStatsMap.has(dStr)) {
          dailyStatsMap.get(dStr).ods.push(od);
        }
      }
    }
    for (const lv of approvedLeaves) {
      const start = toNormalizedDateStr(lv.fromDate);
      const end = toNormalizedDateStr(lv.toDate);
      const range = getAllDatesInRange(start, end);
      const lvId = lv?._id != null ? String(lv._id) : '';
      for (const dStr of range) {
        if (!dailyStatsMap.has(dStr)) continue;
        if (lvId && leaveSplitCoverageKeys.has(`${lvId}_${dStr}`)) continue;
        dailyStatsMap.get(dStr).leaves.push(lv);
      }
    }

    for (const split of approvedLeaveSplits) {
      const dStr = toNormalizedDateStr(split.date);
      const day = dailyStatsMap.get(dStr);
      if (!day) continue;
      day.leaves.push({
        // Keep the minimal shape used below (isHalfDay + leaveType).
        isHalfDay: split.isHalfDay,
        numberOfDays: split.numberOfDays,
        leaveType: split.leaveType,
        leaveNature: split.leaveNature,
      });
    }

    // Leave override on roster non-working days:
    // if approved leave exists on WO/HOL, treat that date as leave/working for this employee.
    for (const dStr of allDates) {
      const day = dailyStatsMap.get(dStr);
      if (!day || day.leaves.length === 0) continue;
      if (day.isWO) {
        day.isWO = false;
        weekOffDates.delete(dStr);
      }
      if (day.isHOL) {
        day.isHOL = false;
        holidayDates.delete(dStr);
      }
    }

    /**
     * WO/HOL sandwich (week-off and holiday blocks use the same rules).
     * Neighbor types (calendar day before / after the block):
     * - LEAVE: approved leave on that date (map has day.leaves.length > 0)
     * - ABSENT: AttendanceDaily exists and status is ABSENT, and no approved day-level OD on that date
     * - PRESENT: not LEAVE/ABSENT as above — includes OD-only days and OD with daily status ABSENT
     * - NONE: no leave, no attendance, no approved day-level OD (or out of range — handled separately)
     *
     * | Before | After | What we do with the WO/HOL block |
     * | LEAVE | LEAVE | Remove WO/HOL; add full-day LOP (sandwich) leave on each block day |
     * | LEAVE | ABSENT | Remove WO/HOL; add full-day LOP (sandwich) on each block day |
     * | ABSENT | LEAVE | Same as row above |
     * | LEAVE | PRESENT | Keep as WO/HOL (no change) |
     * | PRESENT | LEAVE | Keep as WO/HOL (no change) |
     * | ABSENT | ABSENT | Remove WO/HOL only (legacy sandwich → absent / pay-register engine) |
     * | PRESENT | PRESENT | Keep as WO/HOL |
     * | ABSENT | PRESENT | Keep as WO/HOL |
     * | PRESENT | ABSENT | Keep as WO/HOL |
     * | NONE or missing neighbor (month edge) | any / any | Keep as WO/HOL |
     */
    const sandwichPolicyMetaByDate = new Map();
    const classifySandwichNeighbor = (dStr) => {
      if (!dStr || dStr > todayIstStr || isOutsideEmploymentBound(dStr)) return null;
      const d = dailyStatsMap.get(dStr);
      if (!d) return null;
      // If attendance exists and is not ABSENT, treat as PRESENT context first.
      // This covers punch-based days such as HALF_DAY/PARTIAL/PRESENT/OD.
      if (d.attendance && !isAbsentStatus(d.attendance.status)) return 'PRESENT';
      // Sandwich should consider LEAVE neighbor only when leave coverage is full-day.
      // Half-day leave on a side (e.g. HD + L) should not force WO/HOL conversion.
      const leaveCoverage = (d.leaves || []).reduce((sum, l) => {
        if (!l) return sum;
        if (l.isHalfDay) return sum + 0.5;
        if (typeof l.numberOfDays === 'number' && l.numberOfDays > 0 && l.numberOfDays < 1) return sum + 0.5;
        return sum + 1;
      }, 0);
      if (Math.min(1, leaveCoverage) >= 1) return 'LEAVE';
      const hasDayOd = d.ods.length > 0;
      // Align sandwich classification with summary absent logic:
      // on past working days, missing AttendanceDaily is effectively treated as absent.
      if (!d.isWO && !d.isHOL && !d.attendance && !hasDayOd) return 'ABSENT';
      if (!d.attendance) {
        return hasDayOd ? 'PRESENT' : 'NONE';
      }
      if (hasDayOd || !isAbsentStatus(d.attendance.status)) return 'PRESENT';
      return 'ABSENT';
    };

    const stripWoHolFromBlockDay = (blockDate, blockDay) => {
      if (blockDay.isWO) {
        blockDay.isWO = false;
        weekOffDates.delete(blockDate);
      }
      if (blockDay.isHOL) {
        blockDay.isHOL = false;
        holidayDates.delete(blockDate);
      }
    };

    const pushSandwichLopLeave = (blockDay) => {
      if (blockDay.leaves.some((l) => l && l._sandwichLop)) return;
      blockDay.leaves.push({
        isHalfDay: false,
        numberOfDays: 1,
        leaveType: 'LOP (sandwich)',
        leaveNature: 'lop',
        _sandwichLop: true,
      });
    };

    // Business rule: sandwich conversion is supported only in single-shift mode.
    if (processingModeIsSingleShift) {
      let idx = 0;
      while (idx < allDates.length) {
        const dStr = allDates[idx];
        const day = dailyStatsMap.get(dStr);
        const startsNonWorkingBlock = day && (day.isWO || day.isHOL);
        if (!startsNonWorkingBlock) {
          idx += 1;
          continue;
        }

        let endIdx = idx;
        while (
          endIdx + 1 < allDates.length &&
          (() => {
            const nextDay = dailyStatsMap.get(allDates[endIdx + 1]);
            return !!nextDay && (nextDay.isWO || nextDay.isHOL);
          })()
        ) {
          endIdx += 1;
        }

        const prevDate = idx > 0 ? allDates[idx - 1] : null;
        const nextDate = endIdx + 1 < allDates.length ? allDates[endIdx + 1] : null;
        const prevKind = classifySandwichNeighbor(prevDate);
        const nextKind = classifySandwichNeighbor(nextDate);

        let stripWoHolOnly = false;
        let stripAndLop = false;

        if (prevKind != null && nextKind != null) {
          if (prevKind === 'ABSENT' && nextKind === 'ABSENT') {
            stripWoHolOnly = true;
          } else if (prevKind === 'LEAVE' && nextKind === 'LEAVE') {
            stripAndLop = true;
          } else if (
            (prevKind === 'LEAVE' && nextKind === 'ABSENT')
            || (prevKind === 'ABSENT' && nextKind === 'LEAVE')
          ) {
            stripAndLop = true;
          }
          // LEAVE+PRESENT, PRESENT+LEAVE, PRESENT+PRESENT, ABSENT+PRESENT, PRESENT+ABSENT, NONE*: no flags
        }

        if (stripWoHolOnly || stripAndLop) {
          for (let k = idx; k <= endIdx; k += 1) {
            const blockDate = allDates[k];
            const blockDay = dailyStatsMap.get(blockDate);
            if (!blockDay) continue;
            sandwichPolicyMetaByDate.set(blockDate, {
              previousNeighborKind: prevKind || 'NONE',
              nextNeighborKind: nextKind || 'NONE',
              effect: stripAndLop ? 'strip_non_working_add_lop' : 'strip_non_working',
              ruleCode: stripAndLop ? 'SANDWICH_STRIP_AND_LOP_V1' : 'SANDWICH_STRIP_ONLY_V1',
              note: stripAndLop
                ? 'Sandwich rule applied: non-working block converted and LOP leave added.'
                : 'Sandwich rule applied: non-working block converted based on surrounding absents.',
            });
            stripWoHolFromBlockDay(blockDate, blockDay);
            if (stripAndLop) {
              pushSandwichLopLeave(blockDay);
            }
          }
        }

        idx = endIdx + 1;
      }
    }

    // Strip all calendar days outside [DOJ, last working day]: treat as blank (no roster WO/HOL, no dailies, no leave/OD).
    for (const dStr of allDates) {
      if (!isOutsideEmploymentBound(dStr)) continue;
      const day = dailyStatsMap.get(dStr);
      if (!day) continue;
      day.isWO = false;
      day.isHOL = false;
      day.leaves = [];
      day.ods = [];
      day.attendance = null;
      weekOffDates.delete(dStr);
      holidayDates.delete(dStr);
    }

    // Defensive: drop any WO/HOL keys that are still outside employment (e.g. date string mismatch vs allDates).
    for (const d of [...weekOffDates]) {
      if (isOutsideEmploymentBound(d)) weekOffDates.delete(d);
    }
    for (const d of [...holidayDates]) {
      if (isOutsideEmploymentBound(d)) holidayDates.delete(d);
    }

    summary.totalWeeklyOffs = weekOffDates.size;
    summary.totalHolidays = holidayDates.size;
    contributingDates.weeklyOffs = Array.from(weekOffDates)
      .filter((date) => !isOutsideEmploymentBound(date))
      .map((date) => ({ date, value: 1, label: 'WO' }));
    contributingDates.holidays = Array.from(holidayDates)
      .filter((date) => !isOutsideEmploymentBound(date))
      .map((date) => ({ date, value: 1, label: 'HOL' }));

    const payRegisterDaySnapshots = [];
    const partialPolicyMetaByDate = new Map();

    // Process each day
    let totalPresentDays = 0;
    let totalPayableShifts = 0;
    let totalLateInMinutes = 0;
    let lateInCount = 0;
    let totalEarlyOutMinutes = 0;
    let earlyOutCount = 0;
    let totalLeaveDays = 0;
    let totalPaidLeaveDays = 0;
    let totalLopLeaveDays = 0;
    let totalODDays = 0;
    /** Sum of payable-shift contributions on PARTIAL-status days (aligned with Payable column, not day-count). */
    let totalPartialPayableContribution = 0;

    for (const [dStr, day] of dailyStatsMap) {
      if (isOutsideEmploymentBound(dStr)) {
        payRegisterDaySnapshots.push(buildBlankPayRegisterDaySnapshot(dStr));
        continue;
      }
      const hasFullDayEsiLeave = Array.isArray(day.leaves) && day.leaves.some(isFullDayEsiLeaveEntry);
      const hasHalfDayEsiLeave = Array.isArray(day.leaves) && day.leaves.some(isHalfDayEsiLeaveEntry);
      /** Capped 0..1; used again for PARTIAL policy LOP so we never stack policy LOP on the same half as an approved leave/OD (leave wins). */
      let leaveContrib = 0;
      // 1. Leaves (Priority - if leave is taken, it counts as leave)
      if (day.leaves.length > 0) {
        // Sum all leave units on the same date (multiple 0.5 leaves can make 1.0)
        // and cap to 1.0 day because payroll works per-day (or per-half) capacity.
        const leaveContribRaw = day.leaves.reduce((sum, l) => {
          // If it's a multi-day leave, it contributes 1.0 to today.
          // If it's a half-day leave, it contributes 0.5.
          const dailyUnit = l.isHalfDay ? 0.5 : 1;
          return sum + dailyUnit;
        }, 0);
        leaveContrib = Math.min(1, leaveContribRaw);

        // Paid vs LOP for pay register: same per-day cap as leaveContrib (scale if raw units exceed 1, e.g. duplicate rows).
        let paidUnitSum = 0;
        let lopUnitSum = 0;
        for (const l of day.leaves) {
          const unit = l.isHalfDay ? 0.5 : 1;
          const nature = (l.leaveNature || '').toLowerCase();
          if (nature === 'lop' || nature === 'without_pay') lopUnitSum += unit;
          else paidUnitSum += unit; // explicit 'paid' or unset → paid (CL/EL legacy rows)
        }
        const paidLopRaw = paidUnitSum + lopUnitSum;
        if (paidLopRaw > 0) {
          const scale = leaveContrib / paidLopRaw;
          const paidScaled = Math.round(paidUnitSum * scale * 100) / 100;
          const lopScaled = Math.round(lopUnitSum * scale * 100) / 100;
          totalPaidLeaveDays += paidScaled;
          totalLopLeaveDays += lopScaled;
          if (paidScaled > 1e-9 && !contributingDates.paidLeaves.some((cd) => cd.date === dStr)) {
            contributingDates.paidLeaves.push({ date: dStr, value: paidScaled, label: 'Paid' });
          }
          if (lopScaled > 1e-9) {
            const existingLop = contributingDates.lopLeaves.find((cd) => cd.date === dStr);
            if (!existingLop) {
              contributingDates.lopLeaves.push({ date: dStr, value: lopScaled, label: `LOP (${lopScaled})` });
            } else {
              existingLop.value = Math.round((Number(existingLop.value) + lopScaled) * 100) / 100;
              existingLop.label = `LOP (${existingLop.value})`;
            }
          }
        }

        const firstLeave = day.leaves[0];
        if (!contributingDates.leaves.some(cd => cd.date === dStr)) {
          contributingDates.leaves.push({
            date: dStr,
            value: leaveContrib,
            label: `${firstLeave.leaveType || 'L'} (${leaveContrib})`
          });
        }
        totalLeaveDays += leaveContrib;
      }

      // 2. ODs & Attendance Merge (Half-Aware)
      let attFirst = 0, attSecond = 0;
      let odFirst = 0, odSecond = 0;

      // Base from Attendance
      if (day.attendance && !day.isWO && !day.isHOL) {
        const status = day.attendance.status;
        if (status === 'PRESENT') {
          attFirst = 0.5; attSecond = 0.5;
        } else if (status === 'HALF_DAY') {
          // Detect which half was worked based on which penalty is higher.
          const eo = Number(day.attendance.totalEarlyOutMinutes) || 0;
          const li = Number(day.attendance.totalLateInMinutes) || 0;
          if (eo > li) attFirst = 0.5;
          else if (li > eo) attSecond = 0.5;
          else attFirst = 0.5; // Default to first half if we can't tell
        } else if (status === 'OD' && day.ods.length > 0) {
          // Half-day OD while daily status is OD: credit the office half toward present (same intent as HD/OD in UI).
          const halfOd = day.ods.find(
            (o) =>
              o.isHalfDay &&
              o.odType_extended === 'half_day' &&
              (o.halfDayType === 'first_half' || o.halfDayType === 'second_half')
          );
          if (halfOd) {
            const shifts = Array.isArray(day.attendance.shifts) ? day.attendance.shifts : [];
            const hasIn = shifts.some((s) => s && s.inTime) || !!day.attendance.inTime;
            const hasOut = shifts.some((s) => s && s.outTime) || !!day.attendance.outTime;
            if (halfOd.halfDayType === 'second_half' && hasIn) attFirst = 0.5;
            else if (halfOd.halfDayType === 'first_half' && hasOut) attSecond = 0.5;
          }
        }
        // PARTIAL/ABSENT: base is 0.0 per user request
      }

      // Overlay ODs
      if (day.ods.length > 0 && !day.isWO && !day.isHOL) {
        for (const od of day.ods) {
          if (!od.isHalfDay || od.odType_extended === 'full_day') {
            odFirst = 0.5; odSecond = 0.5;
            day.lateInWaved = true;
            day.earlyOutWaved = true;
          } else if (od.halfDayType === 'first_half') {
            odFirst = 0.5;
            day.lateInWaved = true;
          } else if (od.halfDayType === 'second_half') {
            odSecond = 0.5;
            day.earlyOutWaved = true;
          } else {
            odFirst = 0.5; // Default half-day OD to first half
            day.lateInWaved = true;
          }
        }
        if (!contributingDates.ods.some(cd => cd.date === dStr)) {
          contributingDates.ods.push({ date: dStr, value: odFirst + odSecond, label: 'OD' });
        }
        totalODDays += (odFirst + odSecond);
      }

      // Half-day ESI with user-declared OT:
      // remaining worked hours (punch - OT) should decide half/full/none attendance contribution.
      if (hasHalfDayEsiLeave && day.attendance && !day.isWO && !day.isHOL && esiOtHoursByDate.has(dStr)) {
        const declaredOtHours = Math.max(0, Number(esiOtHoursByDate.get(dStr)) || 0);
        const punchHours = getPunchHoursFromAttendance(day.attendance);
        const remainingHours = Math.max(0, Math.round((punchHours - declaredOtHours) * 100) / 100);
        const expectedHours = Math.max(0.01, getExpectedHoursFromAttendance(day.attendance));
        const remainingRatio = remainingHours / expectedHours;

        if (remainingRatio >= 0.9) {
          attFirst = 0.5;
          attSecond = 0.5;
        } else if (remainingRatio >= 0.45) {
          attFirst = 0.5;
          attSecond = 0;
        } else {
          attFirst = 0;
          attSecond = 0;
        }
      }

      // ESI leave day override:
      // even if punches exist (used for OT conversion/pay), attendance should not
      // increase PRESENT or payable-shift totals in monthly summary.
      if (hasFullDayEsiLeave) {
        attFirst = 0;
        attSecond = 0;
      }

      // dayPresent: physical presence (PARTIAL status does not add to present; partial payable is tracked separately)
      const dayPresent = Math.min(Math.max(0, attFirst - odFirst) + Math.max(0, attSecond - odSecond), 1.0);

      const dayFirst = Math.max(attFirst, odFirst);
      const daySecond = Math.max(attSecond, odSecond);
      const mergedDailyCredit = Math.min(dayFirst + daySecond, 1.0);

      const isPartialDay =
        day.attendance &&
        day.attendance.status === 'PARTIAL' &&
        !day.isWO &&
        !day.isHOL;

      // PARTIAL + approved full-day leave (e.g. CL 1 day) + incomplete punch: treat as leave-only for
      // payroll/pay register — do not add partial payable or policy LOP; leaveContrib is already 1.0.
      // Half-day / OD cases keep using the existing partial + policy path.
      const usePartialPolicy =
        isPartialDay &&
        !day.isWO &&
        !day.isHOL &&
        !hasFullDayEsiLeave &&
        leaveContrib < 0.999;

      let mergedForPayable = mergedDailyCredit;
      if (usePartialPolicy && partialDaysContributeToPayableShifts) {
        mergedForPayable = Math.max(mergedForPayable, 0.5);
      }

      // Use AttendanceDaily payables as source of truth for aggregation.
      let dayPayable = mergedForPayable;
      if (day.attendance && !day.isWO && !day.isHOL) {
        const attendancePayable = Number(day.attendance.payableShifts);
        const shifts = Array.isArray(day.attendance.shifts) ? day.attendance.shifts : [];
        const shiftLevelPayable = shifts.reduce((sum, s) => sum + (Number(s?.payableShift) || 0), 0);
        const candidates = [mergedForPayable];
        if (Number.isFinite(attendancePayable) && attendancePayable >= 0) candidates.push(attendancePayable);
        if (Number.isFinite(shiftLevelPayable) && shiftLevelPayable >= 0) candidates.push(shiftLevelPayable);
        dayPayable = Math.round(Math.max(...candidates) * 100) / 100;
      }

      if (hasFullDayEsiLeave) {
        dayPayable = 0;
      } else if (isPartialDay && leaveContrib >= 0.999) {
        // Full-day leave wins over PARTIAL thumb / shift payables
        dayPayable = 0;
      }

      dayPayable = Math.min(dayPayable, 1.0);
      // Partial-day policy LOP: remainder of the day not covered by (work/OD) + payable credit,
      // plus *approved* leave (any nature) for full/half. Without leaveContrib we double-count:
      // e.g. 0.5 partial thumb + 0.5 approved half-day leave must not add 0.5 policy LOP.
      const partialLopPortion =
        usePartialPolicy
          ? Math.round(
              Math.max(0, 1 - Math.min(1, mergedDailyCredit + dayPayable + leaveContrib)) * 100
            ) / 100
          : 0;

      if (usePartialPolicy) {
        if (partialLopPortion > 0) {
          totalLeaveDays += partialLopPortion;
          totalLopLeaveDays += partialLopPortion;
          if (!contributingDates.leaves.some(cd => cd.date === dStr)) {
            contributingDates.leaves.push({
              date: dStr,
              value: partialLopPortion,
              label: `Leave (lop) (${partialLopPortion})`,
            });
          }
          const v = partialLopPortion;
          const existingLop = contributingDates.lopLeaves.find((cd) => cd.date === dStr);
          if (!existingLop) {
            contributingDates.lopLeaves.push({ date: dStr, value: v, label: `LOP (${v})` });
          } else {
            existingLop.value = Math.round((Number(existingLop.value) + v) * 100) / 100;
            existingLop.label = `LOP (${existingLop.value})`;
          }
        }
        if (!contributingDates.partial.some(cd => cd.date === dStr)) {
          contributingDates.partial.push({
            date: dStr,
            value: dayPayable,
            label: dayPayable > 0 ? `PT (${dayPayable})` : 'PARTIAL',
          });
        }
        totalPartialPayableContribution += dayPayable;
      }

      // 1. Handle Present Counts (Physical presence NOT on-duty)
      if (dayPresent > 0) {
        totalPresentDays += dayPresent;
        if (!contributingDates.present.some(cd => cd.date === dStr)) {
          contributingDates.present.push({ date: dStr, value: dayPresent, label: 'P' });
        }
      }

      // 2. Handle Payable Shifts (Merged & Capped Credit)
      if (dayPayable > 0) {
        if (!contributingDates.payableShifts.some(cd => cd.date === dStr)) {
          contributingDates.payableShifts.push({ date: dStr, value: dayPayable, label: 'Pay' });
        }
        totalPayableShifts += dayPayable;
      }

      // Leave half-credits (same basis as absent calc) — used for pay register day parity
      let leaveFirstAll = 0;
      let leaveSecondAll = 0;
      if (!day.isWO && !day.isHOL) {
        for (const l of day.leaves) {
          if (l.isHalfDay) {
            if (l.halfDayType === 'second_half') leaveSecondAll = Math.max(leaveSecondAll, 0.5);
            else leaveFirstAll = Math.max(leaveFirstAll, 0.5);
            continue;
          }
          const nd = typeof l.numberOfDays === 'number' ? l.numberOfDays : null;
          if (nd != null && nd >= 1) {
            leaveFirstAll = 0.5;
            leaveSecondAll = 0.5;
          } else if (nd != null && nd > 0 && nd < 1) {
            if (l.halfDayType === 'second_half') leaveSecondAll = Math.max(leaveSecondAll, 0.5);
            else leaveFirstAll = Math.max(leaveFirstAll, 0.5);
          } else {
            leaveFirstAll = 0.5;
            leaveSecondAll = 0.5;
          }
        }
      }

      // Absent = each working-day half not covered by leave, OD, or attendance (present / worked half).
      // Examples: half-day leave + no other credit → 0.5 absent; half-day OD + no attendance on other half → 0.5 absent.
      if (!day.isWO && !day.isHOL && dStr <= todayIstStr) {
        // Boundary Check: If date is before joining or after resignation, it's not "Absent"
        if (!(dojStrBound && dStr < dojStrBound) && !(leftDateStrBound && dStr > leftDateStrBound)) {
          const mergedFirst = Math.max(attFirst, odFirst, leaveFirstAll);
          const mergedSecond = Math.max(attSecond, odSecond, leaveSecondAll);
          const dayCovered = Math.min(mergedFirst + mergedSecond, 1.0);
          // PARTIAL days: attendance halves stay 0 (see attFirst/attSecond above) while payableShifts still
          // credits working portion (e.g. 0.5). Absent must not treat the full day as missing — add that
          // payable fraction so e.g. 0.5 pay + partial → 0.5 absent, not 1.0 absent.
          let effectiveCovered = dayCovered;
          if (usePartialPolicy) {
            const payPortion = Math.min(1, Math.max(0, Number(dayPayable) || 0));
            const lopPortion = Math.min(1, Math.max(0, Number(partialLopPortion) || 0));
            // Partial days are represented as worked/payable part + LOP leave part,
            // so they should not inflate "absent" by the missing half.
            effectiveCovered = Math.min(1.0, dayCovered + payPortion + lopPortion);
          }
          const absentPortion = Math.round(Math.max(0, 1.0 - effectiveCovered) * 100) / 100;

          if (absentPortion > 0 && !contributingDates.absent.some(cd => cd.date === dStr)) {
            contributingDates.absent.push({ date: dStr, value: absentPortion, label: '' });
          }
        }
      }

      let daySnapshot = buildPayRegisterDaySnapshotFromEngine(dStr, day, {
        leaveFirstAll,
        leaveSecondAll,
        attFirst,
        attSecond,
        odFirst,
        odSecond,
        isPartialDay: usePartialPolicy,
        dayPayable,
      });
      daySnapshot = enforceSingleShiftPartialLopSnapshot(
        daySnapshot,
        partialDaysContributeToPayableShifts,
        dayPayable,
        partialLopPortion
      );
      payRegisterDaySnapshots.push(daySnapshot);
      const latestSnapshot = payRegisterDaySnapshots[payRegisterDaySnapshots.length - 1];
      if (usePartialPolicy && latestSnapshot) {
        const firstStatus = latestSnapshot.firstHalf?.status || null;
        const secondStatus = latestSnapshot.secondHalf?.status || null;
        const firstLeaveNature = latestSnapshot.firstHalf?.leaveNature || null;
        const secondLeaveNature = latestSnapshot.secondHalf?.leaveNature || null;
        const presentPortion =
          getHalfPortion(firstStatus, 'present')
          + getHalfPortion(secondStatus, 'present');
        const lopPortion =
          getHalfPortion(firstStatus, 'leave', firstLeaveNature)
          + getHalfPortion(secondStatus, 'leave', secondLeaveNature);
        const coveredPortion =
          Math.round(Math.max(0, Math.min(1, mergedDailyCredit)) * 100) / 100;
        const note = lopPortion > 0
          ? 'Derived by summary partial rule: worked/payable half + LOP for uncovered half.'
          : 'Derived by summary partial rule: remaining half covered by OD/leave.';
        partialPolicyMetaByDate.set(dStr, {
          firstHalfStatus: firstStatus,
          secondHalfStatus: secondStatus,
          presentPortion: Math.round(presentPortion * 100) / 100,
          lopPortion: Math.round(lopPortion * 100) / 100,
          coveredPortion,
          note,
        });
      }

      // 3. Lates & Early Outs (only on PRESENT days)
      if (day.attendance && (day.attendance.status === 'PRESENT' || day.attendance.status === 'OD') && !day.isWO && !day.isHOL) {
        const shifts = Array.isArray(day.attendance.shifts) ? day.attendance.shifts : [];

        // Late In
        let dayLateMin = (shifts.length > 0)
          ? shifts.reduce((sum, s) => sum + (Number(s.lateInMinutes) || 0), 0)
          : (Number(day.attendance.totalLateInMinutes) || 0);

        if (dayLateMin > 0 && !day.lateInWaved) {
          totalLateInMinutes += dayLateMin;
          lateInCount++;
        }

        // Early Out
        let dayEarlyMin = (shifts.length > 0)
          ? shifts.reduce((sum, s) => sum + (Number(s.earlyOutMinutes) || 0), 0)
          : (Number(day.attendance.totalEarlyOutMinutes) || 0);

        if (dayEarlyMin > 0 && !day.earlyOutWaved) {
          totalEarlyOutMinutes += dayEarlyMin;
          earlyOutCount++;
        }

        // Combined Highlighting Contribution (Late + Early)
        const isLate = dayLateMin > 0 && !day.lateInWaved;
        const isEarly = dayEarlyMin > 0 && !day.earlyOutWaved;

        if (isLate || isEarly) {
          let countContribution = 0;
          if (isLate) countContribution++;
          if (isEarly) countContribution++;

          contributingDates.lateIn.push({
            date: dStr,
            value: countContribution,
            label: countContribution === 2 ? 'L+E' : (isLate ? 'Late' : 'Early')
          });
          // Also set in earlyOut for backwards compatibility/consistency if needed, 
          // but clicking "Lates" (lateIn category) will show both now.
          contributingDates.earlyOut.push({
            date: dStr,
            value: countContribution,
            label: countContribution === 2 ? 'L+E' : (isLate ? 'Late' : 'Early')
          });
        }
      }
    }

    summary.totalPresentDays = Math.round(totalPresentDays * 100) / 100;
    summary.totalPartialDays = Math.round(totalPartialPayableContribution * 100) / 100;
    summary.totalPayableShifts = Math.round(totalPayableShifts * 100) / 100;
    summary.totalLeaves = Math.round(totalLeaveDays * 100) / 100;
    summary.totalPaidLeaves = Math.round(totalPaidLeaveDays * 100) / 100;
    summary.totalLopLeaves = Math.round(totalLopLeaveDays * 100) / 100;
    summary.totalODs = Math.round(totalODDays * 100) / 100;
    const totalAbsentDays = contributingDates.absent.reduce((s, cd) => s + (Number(cd.value) || 0), 0);
    summary.totalAbsentDays = Math.round(totalAbsentDays * 100) / 100;
    summary.totalLateInMinutes = Math.round(totalLateInMinutes * 100) / 100;
    summary.lateInCount = lateInCount;
    summary.totalEarlyOutMinutes = Math.round(totalEarlyOutMinutes * 100) / 100;
    summary.earlyOutCount = earlyOutCount;

    // 7. Calculate total OT hours
    const approvedOTs = await OT.find({
      employeeId,
      status: 'approved',
      otHours: { $gt: 0 },
      date: { $gte: startDateStr, $lte: endDateStr },
    }).select('date otHours').lean();

    let totalOTHours = 0;
    for (const ot of approvedOTs) {
      const otDate = toNormalizedDateStr(ot.date);
      if (otDate && isOutsideEmploymentBound(otDate)) continue;
      totalOTHours += ot.otHours || 0;
      if (otDate && !contributingDates.otHours.some(cd => cd.date === otDate)) {
        contributingDates.otHours.push({
          date: otDate,
          value: ot.otHours,
          label: `OT (${ot.otHours})`
        });
      }
    }
    summary.totalOTHours = Math.round(totalOTHours * 100) / 100;

    // 8. Calculate total extra hours
    let totalExtraHours = 0;
    for (const record of attendanceRecords) {
      if (record.extraHours > 0) {
        const recordDate = toNormalizedDateStr(record.date);
        if (recordDate && isOutsideEmploymentBound(recordDate)) continue;
        totalExtraHours += record.extraHours || 0;
        if (!contributingDates.extraHours.some(cd => cd.date === recordDate)) {
          contributingDates.extraHours.push({
            date: recordDate,
            value: record.extraHours,
            label: `Ex (${record.extraHours})`
          });
        }
      }
    }
    summary.totalExtraHours = Math.round(totalExtraHours * 100) / 100;

    // 9. Calculate total permission hours
    const Permission = require('../../permissions/model/Permission');
    const approvedPermissions = await Permission.find({
      employeeId,
      status: 'approved',
      date: { $gte: startDateStr, $lte: endDateStr },
      isActive: true,
    }).select('permissionHours').lean();

    let totalPermissionHours = 0;
    for (const permission of approvedPermissions) {
      const permDate = toNormalizedDateStr(permission.date);
      if (permDate && isOutsideEmploymentBound(permDate)) continue;
      totalPermissionHours += permission.permissionHours || 0;
      if (permDate && !contributingDates.permissions.some(cd => cd.date === permDate)) {
        contributingDates.permissions.push({ date: permDate, value: permission.permissionHours, label: 'Perm' });
      }
    }
    summary.totalPermissionHours = Math.round(totalPermissionHours * 100) / 100;
    summary.totalPermissionCount = contributingDates.permissions.length;

    // Early Out Deductions Summary
    let totalEarlyOutDeductionDays = 0;
    let totalEarlyOutDeductionAmount = 0;
    const earlyOutDeductionBreakdown = { quarter_day: 0, half_day: 0, full_day: 0, custom_amount: 0 };

    for (const rec of attendanceRecords) {
      const recDate = toNormalizedDateStr(rec.date);
      if (recDate && isOutsideEmploymentBound(recDate)) continue;
      const deduction = rec.earlyOutDeduction;
      if (deduction && deduction.deductionApplied) {
        totalEarlyOutDeductionDays += (Number(deduction.deductionDays) || 0);
        totalEarlyOutDeductionAmount += (Number(deduction.deductionAmount) || 0);
        if (deduction.deductionType && earlyOutDeductionBreakdown[deduction.deductionType] !== undefined) {
          earlyOutDeductionBreakdown[deduction.deductionType] += (Number(deduction.deductionDays) || 0);
        }
        if (Number(deduction.deductionAmount) > 0) earlyOutDeductionBreakdown.custom_amount += Number(deduction.deductionAmount);
      }
    }

    summary.totalEarlyOutDeductionDays = Math.round(totalEarlyOutDeductionDays * 100) / 100;
    summary.totalEarlyOutDeductionAmount = Math.round(totalEarlyOutDeductionAmount * 100) / 100;
    summary.earlyOutDeductionBreakdown = {
      quarter_day: Math.round(earlyOutDeductionBreakdown.quarter_day * 100) / 100,
      half_day: Math.round(earlyOutDeductionBreakdown.half_day * 100) / 100,
      full_day: Math.round(earlyOutDeductionBreakdown.full_day * 100) / 100,
      custom_amount: Math.round(earlyOutDeductionBreakdown.custom_amount * 100) / 100,
    };

    summary.totalLateOrEarlyMinutes = Math.round((summary.totalLateInMinutes + summary.totalEarlyOutMinutes) * 100) / 100;
    summary.lateOrEarlyCount = summary.lateInCount + summary.earlyOutCount;

    // Policy attendance deduction (aligned with payroll deductionService — late/early counts + absent extra)
    let policyDedDays = 0;
    let policyBreakdown = defaultAttendancePolicyDeductionBreakdown();
    try {
      const employee = await Employee.findById(employeeId)
        .select(
          'gross_salary department_id division_id applyAttendanceDeduction deductLateIn deductEarlyOut deductAbsent'
        )
        .lean();
      if (employee && employee.department_id) {
        const monthStr = `${year}-${String(monthNumber).padStart(2, '0')}`;
        const gross = Number(employee.gross_salary) || 0;
        const perDayBasicPay =
          summary.totalDaysInMonth > 0
            ? Math.round((gross / summary.totalDaysInMonth) * 100) / 100
            : 0;
        const absentSettings = await getAbsentDeductionSettings(
          String(employee.department_id),
          employee.division_id ? String(employee.division_id) : null
        );
        const attDed = await deductionService.calculateAttendanceDeduction(
          employeeId,
          monthStr,
          String(employee.department_id),
          perDayBasicPay,
          employee.division_id ? String(employee.division_id) : null,
          {
            absentDays: summary.totalAbsentDays,
            enableAbsentDeduction: absentSettings.enableAbsentDeduction,
            lopDaysPerAbsent: absentSettings.lopDaysPerAbsent,
            employee,
            ignoreMonthlySummary: true,
            periodStartDateStr: startDateStr,
            periodEndDateStr: endDateStr,
          }
        );
        const b = attDed.breakdown || {};
        policyDedDays = Number(b.daysDeducted) || 0;
        policyBreakdown = {
          ...defaultAttendancePolicyDeductionBreakdown(),
          lateInsCount: Number(b.lateInsCount) || 0,
          earlyOutsCount: Number(b.earlyOutsCount) || 0,
          combinedCount: Number(b.combinedCount) || 0,
          freeAllowedPerMonth: Number(b.freeAllowedPerMonth) || 0,
          effectiveCount: Number(b.effectiveCount) || 0,
          daysDeducted: Number(b.daysDeducted) || 0,
          lateEarlyDaysDeducted: Number(b.lateEarlyDaysDeducted) || 0,
          absentExtraDays: Number(b.absentExtraDays) || 0,
          absentDays: Number(b.absentDays) || 0,
          lopDaysPerAbsent: b.lopDaysPerAbsent != null ? Number(b.lopDaysPerAbsent) : null,
          deductionType: b.deductionType != null ? String(b.deductionType) : null,
          calculationMode: b.calculationMode != null ? String(b.calculationMode) : null,
        };
      }
    } catch (err) {
      console.error('Policy attendance deduction for monthly summary failed:', err.message);
    }
    summary.totalAttendanceDeductionDays = Math.round(policyDedDays * 100) / 100;
    summary.attendanceDeductionBreakdown = policyBreakdown;

    payRegisterDaySnapshots.sort((a, b) => String(a.date).localeCompare(String(b.date)));
    summary.payRegisterDaySnapshots = payRegisterDaySnapshots;
    summary.markModified('payRegisterDaySnapshots');
    summary.contributingDates = contributingDates;
    summary.lastCalculatedAt = new Date();

    // Persist policy-derived partial metadata in AttendanceDaily for auditability.
    // This does not alter raw attendance status; it only records summary-rule interpretation.
    try {
      const policyNow = new Date();
      const policyOps = [];
      for (const dStr of allDates) {
        if (!dStr) continue;
        const partialMeta = partialPolicyMetaByDate.get(dStr);
        if (partialMeta) {
          policyOps.push({
            updateOne: {
              filter: { employeeNumber: empNoNorm, date: dStr },
              update: {
                $set: {
                  'policyMeta.partialDayRule.applied': true,
                  'policyMeta.partialDayRule.ruleCode': 'PARTIAL_PRESENT_PLUS_LOP_V1',
                  'policyMeta.partialDayRule.firstHalfStatus': partialMeta.firstHalfStatus,
                  'policyMeta.partialDayRule.secondHalfStatus': partialMeta.secondHalfStatus,
                  'policyMeta.partialDayRule.presentPortion': partialMeta.presentPortion,
                  'policyMeta.partialDayRule.lopPortion': partialMeta.lopPortion,
                  'policyMeta.partialDayRule.coveredPortion': partialMeta.coveredPortion,
                  'policyMeta.partialDayRule.note': partialMeta.note,
                  'policyMeta.partialDayRule.updatedAt': policyNow,
                },
              },
            },
          });
        } else {
          policyOps.push({
            updateOne: {
              filter: { employeeNumber: empNoNorm, date: dStr },
              update: {
                $set: {
                  'policyMeta.partialDayRule.applied': false,
                  'policyMeta.partialDayRule.ruleCode': null,
                  'policyMeta.partialDayRule.firstHalfStatus': null,
                  'policyMeta.partialDayRule.secondHalfStatus': null,
                  'policyMeta.partialDayRule.presentPortion': 0,
                  'policyMeta.partialDayRule.lopPortion': 0,
                  'policyMeta.partialDayRule.coveredPortion': 0,
                  'policyMeta.partialDayRule.note': null,
                  'policyMeta.partialDayRule.updatedAt': policyNow,
                },
              },
            },
          });
        }
        const sandwichMeta = sandwichPolicyMetaByDate.get(dStr);
        if (sandwichMeta) {
          const sandwichStatusSet = {
            // Sandwich converted non-working day:
            // - strip_non_working => ABSENT
            // - strip_non_working_add_lop => LEAVE (LOP-style day)
            status: sandwichMeta.effect === 'strip_non_working_add_lop' ? 'LEAVE' : 'ABSENT',
            payableShifts: 0,
          };
          policyOps.push({
            updateOne: {
              filter: { employeeNumber: empNoNorm, date: dStr },
              update: {
                $set: {
                  'policyMeta.sandwichRule.applied': true,
                  'policyMeta.sandwichRule.ruleCode': sandwichMeta.ruleCode,
                  'policyMeta.sandwichRule.previousNeighborKind': sandwichMeta.previousNeighborKind,
                  'policyMeta.sandwichRule.nextNeighborKind': sandwichMeta.nextNeighborKind,
                  'policyMeta.sandwichRule.effect': sandwichMeta.effect,
                  'policyMeta.sandwichRule.note': sandwichMeta.note,
                  'policyMeta.sandwichRule.updatedAt': policyNow,
                  ...sandwichStatusSet,
                },
              },
            },
          });
        } else {
          const originalNonWorking = originalNonWorkingStatusByDate.get(dStr);
          const restoreStatusSet =
            originalNonWorking === 'WO'
              ? { status: 'WEEK_OFF', payableShifts: 0 }
              : originalNonWorking === 'HOL'
                ? { status: 'HOLIDAY', payableShifts: 0 }
                : null;
          policyOps.push({
            updateOne: {
              filter: { employeeNumber: empNoNorm, date: dStr },
              update: {
                $set: {
                  'policyMeta.sandwichRule.applied': false,
                  'policyMeta.sandwichRule.ruleCode': null,
                  'policyMeta.sandwichRule.previousNeighborKind': null,
                  'policyMeta.sandwichRule.nextNeighborKind': null,
                  'policyMeta.sandwichRule.effect': null,
                  'policyMeta.sandwichRule.note': null,
                  'policyMeta.sandwichRule.updatedAt': policyNow,
                  ...(restoreStatusSet || {}),
                },
              },
            },
          });
        }
      }
      if (policyOps.length > 0) {
        await AttendanceDaily.bulkWrite(policyOps, { ordered: false });
      }
    } catch (policyMetaErr) {
      console.error('[summaryCalculationService] Failed to persist AttendanceDaily policyMeta:', policyMetaErr.message);
    }

    // 13. Save summary
    await summary.save();
    console.log('[OD-FLOW] calculateMonthlySummary saved', { emp_no, month: summary.month });

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
    const employees = await Employee.find({ is_active: { $ne: false } }).select('_id emp_no');

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
 * Recalculate stored monthly summary for one employee.
 * @param {string} emp_no - Employee number (any case)
 * @param {string} yyyyMm - Payroll month label, e.g. "2026-03" (uses same anchor as UI: cycle containing the 15th of that month)
 */
async function calculateMonthlySummaryByEmpNo(emp_no, yyyyMm) {
  const Employee = require('../../employees/model/Employee');
  const empNoNorm = (emp_no && String(emp_no).trim()) ? String(emp_no).toUpperCase() : emp_no;
  const employee = await Employee.findOne({ emp_no: empNoNorm });
  if (!employee) {
    throw new Error(`Employee not found for emp_no: ${emp_no}`);
  }
  const parts = String(yyyyMm).trim().split('-');
  const year = parseInt(parts[0], 10);
  const monthNumber = parseInt(parts[1], 10);
  if (!year || !monthNumber || monthNumber < 1 || monthNumber > 12) {
    throw new Error(`Invalid YYYY-MM: ${yyyyMm}`);
  }
  return calculateMonthlySummary(employee._id, employee.emp_no, year, monthNumber);
}

/**
 * Recalculate summary when attendance is updated
 * @param {string} emp_no - Employee number
 * @param {string} date - Date in YYYY-MM-DD format
 */
async function recalculateOnAttendanceUpdate(emp_no, date) {
  try {
    console.log('[OD-FLOW] recalculateOnAttendanceUpdate called', { emp_no, date });
    const Employee = require('../../employees/model/Employee');
    const empNoNorm = (emp_no && String(emp_no).trim()) ? String(emp_no).toUpperCase() : emp_no;
    const employee = await Employee.findOne({ emp_no: empNoNorm });

    if (!employee) {
      console.warn(`[OD-FLOW] Employee not found for emp_no: ${emp_no}`);
      return;
    }

    // Use payroll cycle for this specific attendance date (pay-cycle aware month)
    const baseDate = typeof date === 'string' ? createISTDate(date) : date;
    const periodInfo = await dateCycleService.getPeriodInfo(baseDate);
    const { year, month: monthNumber, startDate, endDate } = periodInfo.payrollCycle;
    const startDateStr = extractISTComponents(startDate).dateStr;
    const endDateStr = extractISTComponents(endDate).dateStr;
    const dateStr = extractISTComponents(baseDate).dateStr;
    console.log('[OD-FLOW] recalculateOnAttendanceUpdate period', { year, monthNumber, startDateStr, endDateStr });

    // Reconcile single-day approved leave with punches before aggregating (reject / narrow + register credits)
    try {
      const AttendanceDaily = require('../model/AttendanceDaily');
      const daily = await AttendanceDaily.findOne({ employeeNumber: empNoNorm, date: dateStr });
      if (daily) {
        const { runLeaveAttendanceReconciliation } = require('../../leaves/services/leaveAttendanceReconciliationService');
        const recon = await runLeaveAttendanceReconciliation(employee, dateStr, daily);
        if (recon?.results?.length) {
          const interesting = (recon.results || []).filter(
            (x) => x && x.action && !['none', 'skip'].includes(x.action) && !String(x.action).startsWith('no_')
          );
          if (interesting.length) {
            console.log('[leaveAttendanceReconciliation]', { emp: empNoNorm, date: dateStr, results: interesting });
          }
        }
      }
    } catch (reconErr) {
      console.error('[leaveAttendanceReconciliation] error:', reconErr);
    }

    // Pass period so we always aggregate the exact cycle that contains this date (avoids anchor mismatch)
    await calculateMonthlySummary(employee._id, empNoNorm, year, monthNumber, { startDateStr, endDateStr });
    console.log('[OD-FLOW] recalculateOnAttendanceUpdate done for', emp_no, date);
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

    // Calculate all payroll cycles affected by this leave using payroll-aware periods
    const { payrollCycle: startCycle } = await dateCycleService.getPeriodInfo(leave.fromDate);
    const { payrollCycle: endCycle } = await dateCycleService.getPeriodInfo(leave.toDate);

    let currentYear = startCycle.year;
    let currentMonth = startCycle.month;

    while (currentYear < endCycle.year || (currentYear === endCycle.year && currentMonth <= endCycle.month)) {
      await calculateMonthlySummary(employee._id, employee.emp_no, currentYear, currentMonth);

      // Move to next payroll month
      if (currentMonth === 12) {
        currentMonth = 1;
        currentYear += 1;
      } else {
        currentMonth += 1;
      }
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
    console.log('[OD-FLOW] recalculateOnODApproval (OD model post-save)', { odId: od._id?.toString(), odType_extended: od.odType_extended });
    if (!od.employeeId || !od.fromDate || !od.toDate) {
      console.log('[OD-FLOW] recalculateOnODApproval skip: missing employeeId/fromDate/toDate');
      return;
    }

    const Employee = require('../../employees/model/Employee');
    const AttendanceDaily = require('../model/AttendanceDaily');
    const employee = await Employee.findById(od.employeeId);
    if (!employee) {
      console.warn(`Employee not found for OD: ${od._id}`);
      return;
    }

    const empNo = (od.emp_no || employee.emp_no || '').toUpperCase();
    if (!empNo) return;

    const fromStr = extractISTComponents(od.fromDate).dateStr;
    const toStr = extractISTComponents(od.toDate).dateStr;
    const odDateRange = getAllDatesInRange(fromStr, toStr);

    // Touch AttendanceDaily for hour-based OD (create/ensure daily) and for half-day OD (re-save existing dailies so pre-save runs and applies half-vs-punches logic).
    if (od.odType_extended === 'hours') {
      console.log('[OD-FLOW] recalculateOnODApproval: touching dailies (hour-based)');
      for (const dateStr of odDateRange) {
        let daily = await AttendanceDaily.findOne({ employeeNumber: empNo, date: dateStr });
        if (!daily) {
          daily = new AttendanceDaily({ employeeNumber: empNo, date: dateStr, shifts: [] });
        }
        await daily.save();
      }
    } else if (od.odType_extended === 'half_day' || od.isHalfDay) {
      console.log('[OD-FLOW] recalculateOnODApproval: re-saving dailies for half-day OD (so half-vs-punches is applied)');
      for (const dateStr of odDateRange) {
        const daily = await AttendanceDaily.findOne({ employeeNumber: empNo, date: dateStr });
        if (daily) {
          await daily.save();
        } else {
          const newDaily = new AttendanceDaily({ employeeNumber: empNo, date: dateStr, shifts: [] });
          await newDaily.save();
        }
      }
    }
    // Full-day OD: no daily create/update; contribution is added in monthly summary OD-only logic.

    // Recalculate monthly summaries for affected payroll cycles (half/full-day OD contribute 0.5/1 via OD-only logic in calculateMonthlySummary)
    const { payrollCycle: startCycle } = await dateCycleService.getPeriodInfo(od.fromDate);
    const { payrollCycle: endCycle } = await dateCycleService.getPeriodInfo(od.toDate);
    let currentYear = startCycle.year;
    let currentMonth = startCycle.month;

    console.log('[OD-FLOW] recalculateOnODApproval: recalc summary for cycles', { startCycle: `${startCycle.year}-${startCycle.month}`, endCycle: `${endCycle.year}-${endCycle.month}` });
    while (currentYear < endCycle.year || (currentYear === endCycle.year && currentMonth <= endCycle.month)) {
      await calculateMonthlySummary(employee._id, employee.emp_no, currentYear, currentMonth);
      if (currentMonth === 12) {
        currentMonth = 1;
        currentYear += 1;
      } else {
        currentMonth += 1;
      }
    }
    console.log('[OD-FLOW] recalculateOnODApproval done');
  } catch (error) {
    console.error(`Error recalculating summary on OD approval for OD ${od._id}:`, error);
  }
}

/**
 * Delete monthly attendance summaries (for a given month or all).
 * Use before full recalc to ensure clean state.
 * @param {{ year?: number, monthNumber?: number }} [options] - If both provided, delete only that month; otherwise delete all.
 * @returns {Promise<{ deletedCount: number }>}
 */
async function deleteAllMonthlySummaries(options = {}) {
  const { year, monthNumber } = options;
  let query = {};
  if (year != null && monthNumber != null) {
    const monthStr = `${year}-${String(monthNumber).padStart(2, '0')}`;
    query.month = monthStr;
  }
  const result = await MonthlyAttendanceSummary.deleteMany(query);
  console.log('[summaryCalculationService] deleteAllMonthlySummaries', { query, deletedCount: result.deletedCount });
  return { deletedCount: result.deletedCount };
}

module.exports = {
  calculateMonthlySummary,
  calculateAllEmployeesSummary,
  calculateMonthlySummaryByEmpNo,
  recalculateOnAttendanceUpdate,
  recalculateOnLeaveApproval,
  recalculateOnODApproval,
  deleteAllMonthlySummaries,
};

