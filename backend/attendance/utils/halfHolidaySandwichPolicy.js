/**
 * Half-roster-holiday sandwich policy (single-shift monthly summary).
 * Full-day WO/HOL sandwich is handled separately in summaryCalculationService.
 */

const { hasExactlyOneRosterHalfHol, capAttendanceHalvesForSingleHalfHoliday } = require('./partialPolicyRosterHalf');

function getSingleHalfHoliday(day) {
  if (!day || day.isHOL) return null;
  if (!hasExactlyOneRosterHalfHol(day)) return null;
  const holidayHalf = day.rosterFirstHalfHOL ? 'first_half' : 'second_half';
  const workingHalf = holidayHalf === 'first_half' ? 'second_half' : 'first_half';
  return { holidayHalf, workingHalf, credit: 0.5 };
}

function leaveHalfType(leaveEntry) {
  if (!leaveEntry) return 'full';
  if (leaveEntry._sandwichLop) return 'sandwich';
  const nd = Number(leaveEntry.numberOfDays);
  const isHalf =
    !!leaveEntry.isHalfDay || (Number.isFinite(nd) && nd > 0 && nd < 1 - 1e-6);
  if (!isHalf) return 'full';
  return String(leaveEntry.halfDayType || '').trim() === 'second_half'
    ? 'second_half'
    : 'first_half';
}

function isSpanOrFullDayLeaveEntry(l) {
  if (!l || l._sandwichLop) return false;
  return leaveHalfType(l) === 'full';
}

function dayHasSpanOrFullLeave(day) {
  return (day.leaves || []).some(isSpanOrFullDayLeaveEntry);
}

/**
 * Half roster holiday + span/full-day leave on same date (any leave type):
 * same as full HOL + leave — leave applies, half holiday credit does not.
 */
function applyHalfHolidayLeaveOverride(day) {
  const hadHalfHol =
    !!day &&
    !day.isHOL &&
    ((day.rosterFirstHalfHOL && !day.rosterSecondHalfHOL) ||
      (!day.rosterFirstHalfHOL && day.rosterSecondHalfHOL));
  if (!hadHalfHol || !dayHasSpanOrFullLeave(day)) return false;

  day.halfHolLeaveOverridesHoliday = true;
  day.halfHolCreditRemoved = day.rosterFirstHalfHOL && !day.rosterSecondHalfHOL ? 0.5 : 0.5;
  day.rosterFirstHalfHOL = false;
  day.rosterSecondHalfHOL = false;
  return true;
}

function partitionLeavesForHalfHoliday(day, holidayHalf, workingHalf) {
  const onHolidayHalf = [];
  const onWorkingHalf = [];
  const fullDay = [];
  for (const l of day.leaves || []) {
    if (!l || l._sandwichLop) continue;
    const h = leaveHalfType(l);
    if (h === 'full') fullDay.push(l);
    else if (h === holidayHalf) onHolidayHalf.push(l);
    else if (h === workingHalf) onWorkingHalf.push(l);
  }
  return { onHolidayHalf, onWorkingHalf, fullDay };
}

function isFullDayOd(od) {
  if (!od || String(od.odType_extended || '') === 'hours') return false;
  if (od.isHalfDay || String(od.odType_extended || '') === 'half_day') return false;
  const nd = Number(od.numberOfDays);
  return !(Number.isFinite(nd) && nd > 0 && nd < 1 - 1e-6);
}

function workingHalfHasOd(day, workingHalf) {
  for (const od of day.ods || []) {
    if (isFullDayOd(od)) return true;
    const ht =
      String(od.halfDayType || '').trim() === 'second_half' ? 'second_half' : 'first_half';
    if (ht === workingHalf) return true;
  }
  return false;
}

/**
 * Single-shift half credits for sandwich (mirrors summary day loop; no full-day PRESENT on both halves).
 */
function getAttendanceHalfCreditsForHalfHoliday(day) {
  let attFirst = 0;
  let attSecond = 0;
  const att = day.attendance;
  if (!att || day.isWO || day.isHOL) {
    return { attFirst, attSecond };
  }

  const status = String(att.status || '').toUpperCase();
  if (status === 'PARTIAL' || status === 'HALF_DAY') {
    const { computeRawAttendanceHalfCreditsSync } = require('./attendanceHalfPresence');
    const credits = computeRawAttendanceHalfCreditsSync(att, day.ods || [], {
      processingMode: 'single_shift',
    });
    attFirst = credits.attFirst;
    attSecond = credits.attSecond;
  } else if (status === 'OD' && (day.ods || []).length > 0) {
    const halfOd = (day.ods || []).find(
      (o) =>
        o.isHalfDay &&
        o.odType_extended === 'half_day' &&
        (o.halfDayType === 'first_half' || o.halfDayType === 'second_half')
    );
    if (halfOd) {
      const {
        dailyHasShiftLevelIn,
        dailyHasShiftLevelOut,
      } = require('./attendanceHalfPresence');
      const hasIn = dailyHasShiftLevelIn(att);
      const hasOut = dailyHasShiftLevelOut(att);
      if (halfOd.halfDayType === 'second_half' && hasIn) attFirst = 0.5;
      else if (halfOd.halfDayType === 'first_half' && hasOut) attSecond = 0.5;
    }
  }
  // PRESENT / COMPLETE: do not assign 0.5+0.5 here — half-holiday cap applies only when halves resolved from punches.

  const capped = capAttendanceHalvesForSingleHalfHoliday(day, attFirst, attSecond);
  return { attFirst: capped.attFirst, attSecond: capped.attSecond };
}

function halfHasAttendanceCredit(day, halfType) {
  const { attFirst, attSecond } = getAttendanceHalfCreditsForHalfHoliday(day);
  const credit = halfType === 'first_half' ? attFirst : attSecond;
  return credit >= 0.5 - 1e-6;
}

/** Keep 0.5 HOL when sandwiched if OD or punch on working half, or punch on holiday half only. */
function shouldKeepHalfHolidayWhenSandwiched(day, ctx) {
  if (workingHalfHasOd(day, ctx.workingHalf)) return true;
  if (halfHasAttendanceCredit(day, ctx.workingHalf)) return true;
  if (halfHasAttendanceCredit(day, ctx.holidayHalf)) return true;
  return false;
}

/**
 * Leaves that should count toward summary after half-holiday policy (drops leave on HOL half).
 */
function filterLeavesForHalfHolidaySummary(day, holidayHalf) {
  const out = [];
  for (const l of day.leaves || []) {
    if (!l) continue;
    if (l._sandwichLop) {
      out.push(l);
      continue;
    }
    const h = leaveHalfType(l);
    if (h === holidayHalf) continue;
    out.push(l);
  }
  return out;
}

/**
 * @returns {{ creditDelta: number, meta: object|null, pushSandwichLop: boolean, ignoreLeavesOnHolidayHalf: boolean }}
 */
function evaluateHalfHolidaySandwichDay(day, prevKind, nextKind) {
  const ctx = getSingleHalfHoliday(day);
  if (!ctx) return { creditDelta: 0, meta: null, pushSandwichLop: false, ignoreLeavesOnHolidayHalf: false };

  // Leave-filled day (span/full leave): no half-holiday sandwich — day is treated as leave only.
  if (day.halfHolLeaveOverridesHoliday) {
    return { creditDelta: 0, meta: null, pushSandwichLop: false, ignoreLeavesOnHolidayHalf: false };
  }

  const { onHolidayHalf, onWorkingHalf, fullDay } = partitionLeavesForHalfHoliday(
    day,
    ctx.holidayHalf,
    ctx.workingHalf
  );

  if (fullDay.length > 0) {
    return { creditDelta: 0, meta: null, pushSandwichLop: false, ignoreLeavesOnHolidayHalf: false };
  }

  if (onHolidayHalf.length > 0) {
    return {
      creditDelta: 0,
      meta: {
        ruleCode: 'HALF_HOL_LEAVE_ON_HOLIDAY_HALF_V1',
        effect: 'keep_holiday_reject_leave_half',
        holidayHalf: ctx.holidayHalf,
        note:
          'Leave on roster holiday half ignored; half holiday credit retained (reconcile rejects leave).',
      },
      pushSandwichLop: false,
      ignoreLeavesOnHolidayHalf: true,
    };
  }

  // Same as full WO/HOL sandwich: both neighbours must be full leave (one side leave + other OD/leave → keep holiday).
  const sandwiched = prevKind === 'LEAVE' && nextKind === 'LEAVE';
  if (!sandwiched) {
    return { creditDelta: 0, meta: null, pushSandwichLop: false, ignoreLeavesOnHolidayHalf: false };
  }

  // Explicit half-day leave on working half: keep holiday on HOL half; leave shows on working half.
  if (onWorkingHalf.length > 0) {
    return {
      creditDelta: 0,
      meta: {
        ruleCode: 'HALF_HOL_LEAVE_ON_WORKING_HALF_V1',
        effect: 'keep_half_holiday',
        holidayHalf: ctx.holidayHalf,
        previousNeighborKind: prevKind,
        nextNeighborKind: nextKind,
        note: 'Half holiday kept; approved leave on working half only.',
      },
      pushSandwichLop: false,
      ignoreLeavesOnHolidayHalf: false,
    };
  }

  if (shouldKeepHalfHolidayWhenSandwiched(day, ctx)) {
    return {
      creditDelta: 0,
      meta: {
        ruleCode: 'HALF_HOL_SANDWICH_KEEP_V1',
        effect: 'keep_half_holiday',
        holidayHalf: ctx.holidayHalf,
        previousNeighborKind: prevKind,
        nextNeighborKind: nextKind,
        note: 'Sandwiched half holiday kept: OD or punch on roster half (per-half credit).',
      },
      pushSandwichLop: false,
      ignoreLeavesOnHolidayHalf: false,
    };
  }

  return {
    creditDelta: -ctx.credit,
    meta: {
      ruleCode: 'HALF_HOL_SANDWICH_STRIP_AND_LOP_V1',
      effect: 'strip_half_holiday_add_half_lop',
      holidayHalf: ctx.holidayHalf,
      previousNeighborKind: prevKind,
      nextNeighborKind: nextKind,
      note: 'Half holiday sandwiched between full leave days; LOP on holiday half.',
    },
    pushSandwichLop: true,
    ignoreLeavesOnHolidayHalf: false,
  };
}

/**
 * Apply half-holiday sandwich across all dates in period.
 * @returns {{ creditAdjustment: number, metaByDate: Map<string, object> }}
 */
function applyHalfHolidaySandwichPolicy({
  allDates,
  dailyStatsMap,
  processingModeIsSingleShift,
  classifySandwichNeighbor,
}) {
  const metaByDate = new Map();
  let creditAdjustment = 0;

  if (!processingModeIsSingleShift) {
    return { creditAdjustment: 0, metaByDate };
  }

  for (let i = 0; i < allDates.length; i += 1) {
    const dStr = allDates[i];
    const day = dailyStatsMap.get(dStr);
    if (!day || !hasExactlyOneRosterHalfHol(day)) continue;

    const prevDate = i > 0 ? allDates[i - 1] : null;
    const nextDate = i + 1 < allDates.length ? allDates[i + 1] : null;
    const prevKind = classifySandwichNeighbor(prevDate);
    const nextKind = classifySandwichNeighbor(nextDate);

    const evalResult = evaluateHalfHolidaySandwichDay(day, prevKind, nextKind);
    if (evalResult.ignoreLeavesOnHolidayHalf) {
      const ctx = getSingleHalfHoliday(day);
      if (ctx) {
        day.leaves = filterLeavesForHalfHolidaySummary(day, ctx.holidayHalf);
      }
    }

    if (!evalResult.meta && !evalResult.pushSandwichLop) continue;

    if (evalResult.creditDelta) {
      creditAdjustment += evalResult.creditDelta;
      day.halfHolidaySandwichCreditDelta = (day.halfHolidaySandwichCreditDelta || 0) + evalResult.creditDelta;
    }

    if (evalResult.pushSandwichLop) {
      const hasHalfSandwich = (day.leaves || []).some((l) => l && l._sandwichLop && l._sandwichHalfHol);
      if (!hasHalfSandwich) {
        day.leaves.push({
          isHalfDay: true,
          halfDayType: getSingleHalfHoliday(day).holidayHalf,
          numberOfDays: 0.5,
          leaveType: 'LOP (sandwich)',
          leaveNature: 'lop',
          _sandwichLop: true,
          _sandwichHalfHol: true,
        });
      }
    }

    if (evalResult.meta) {
      metaByDate.set(dStr, evalResult.meta);
      day.halfHolidaySandwichMeta = evalResult.meta;
    }
  }

  return { creditAdjustment, metaByDate };
}

module.exports = {
  getSingleHalfHoliday,
  leaveHalfType,
  isSpanOrFullDayLeaveEntry,
  dayHasSpanOrFullLeave,
  applyHalfHolidayLeaveOverride,
  partitionLeavesForHalfHoliday,
  filterLeavesForHalfHolidaySummary,
  evaluateHalfHolidaySandwichDay,
  applyHalfHolidaySandwichPolicy,
  workingHalfHasOd,
  getAttendanceHalfCreditsForHalfHoliday,
  halfHasAttendanceCredit,
  shouldKeepHalfHolidayWhenSandwiched,
};
