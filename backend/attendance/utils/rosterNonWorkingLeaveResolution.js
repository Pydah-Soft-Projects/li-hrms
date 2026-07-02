/**
 * Half-aware roster week-off / holiday vs approved leave resolution (monthly summary).
 * Leave wins on covered halves; uncovered WO/HOL halves keep their credit.
 */

const { leaveDailyCreditUnit } = require('../../shared/utils/leaveDayRangeUtils');

function isPolicySandwichLeave(l) {
  return !!(l && l._sandwichLop);
}

/** Approved leave credit per half (0 or 0.5 each). */
function combineApprovedLeaveHalfCredits(leaves) {
  let first = 0;
  let second = 0;
  for (const l of leaves || []) {
    if (!l || isPolicySandwichLeave(l)) continue;
    const unit = leaveDailyCreditUnit(l);
    if (unit >= 1 - 1e-6) {
      first = 0.5;
      second = 0.5;
      continue;
    }
    const ht = String(l.halfDayType || 'first_half').trim() === 'second_half' ? 'second' : 'first';
    if (ht === 'second') second = Math.max(second, 0.5);
    else first = Math.max(first, 0.5);
  }
  return { first, second, total: Math.min(1, Math.round((first + second) * 100) / 100) };
}

/** Roster WO/HOL halves before leave override (full-day flags expand to both halves). */
function getRosterNonWorkingHalves(day) {
  let holFirst = !!day?.rosterFirstHalfHOL;
  let holSecond = !!day?.rosterSecondHalfHOL;
  let woFirst = !!day?.rosterFirstHalfWO;
  let woSecond = !!day?.rosterSecondHalfWO;
  if (day?.isHOL) {
    holFirst = true;
    holSecond = true;
  }
  if (day?.isWO) {
    woFirst = true;
    woSecond = true;
  }
  return { holFirst, holSecond, woFirst, woSecond };
}

function round2(n) {
  return Math.round(n * 100) / 100;
}

/**
 * Apply leave-over-WO/HOL rules on one dailyStatsMap day (mutates day).
 * @returns {{ holCredit: number, woCredit: number, halfHolCreditRemoved: number, hadRosterNonWorking: boolean }}
 */
function applyRosterNonWorkingLeaveResolution(day) {
  if (!day) {
    return { holCredit: 0, woCredit: 0, halfHolCreditRemoved: 0, hadRosterNonWorking: false };
  }

  const approvedLeaves = (day.leaves || []).filter((l) => l && !isPolicySandwichLeave(l));
  const { first: leaveFirst, second: leaveSecond } = combineApprovedLeaveHalfCredits(approvedLeaves);

  let { holFirst, holSecond, woFirst, woSecond } = getRosterNonWorkingHalves(day);
  const initialHolCredit = (holFirst ? 0.5 : 0) + (holSecond ? 0.5 : 0);
  const initialWoCredit = (woFirst ? 0.5 : 0) + (woSecond ? 0.5 : 0);
  const hadRosterNonWorking = initialHolCredit > 0 || initialWoCredit > 0;

  if (leaveFirst >= 0.5) {
    holFirst = false;
    woFirst = false;
  }
  if (leaveSecond >= 0.5) {
    holSecond = false;
    woSecond = false;
  }

  day.isHOL = holFirst && holSecond;
  day.isWO = woFirst && woSecond;
  day.rosterFirstHalfHOL = holFirst;
  day.rosterSecondHalfHOL = holSecond;
  day.rosterFirstHalfWO = woFirst;
  day.rosterSecondHalfWO = woSecond;

  const holCredit = round2((holFirst ? 0.5 : 0) + (holSecond ? 0.5 : 0));
  const woCredit = round2((woFirst ? 0.5 : 0) + (woSecond ? 0.5 : 0));
  const halfHolCreditRemoved = round2(Math.max(0, initialHolCredit - holCredit));

  if (initialHolCredit > 0 && holCredit === 0 && approvedLeaves.length > 0) {
    day.halfHolLeaveOverridesHoliday = true;
    day.halfHolCreditRemoved = initialHolCredit;
  } else if (halfHolCreditRemoved > 0) {
    day.halfHolLeaveOverridesHoliday = false;
    day.halfHolCreditRemoved = halfHolCreditRemoved;
  }

  day.nonWorkingLeaveResolved = {
    holCredit,
    woCredit,
    leaveFirst,
    leaveSecond,
    hadRosterNonWorking,
    leaveFullyOverridesNonWorking:
      hadRosterNonWorking && holCredit === 0 && woCredit === 0 && approvedLeaves.length > 0,
    leavePartiallyOverridesNonWorking:
      hadRosterNonWorking &&
      approvedLeaves.length > 0 &&
      holCredit + woCredit > 0 &&
      holCredit + woCredit < 1 - 1e-6,
  };

  return { holCredit, woCredit, halfHolCreditRemoved, hadRosterNonWorking };
}

function syncNonWorkingDateSets(dStr, day, weekOffDates, holidayDates) {
  if (!day || !dStr) return;
  if (day.isWO) weekOffDates.add(dStr);
  else weekOffDates.delete(dStr);
  if (day.isHOL) holidayDates.add(dStr);
  else holidayDates.delete(dStr);
}

function computeHalfNonWorkingCredits(day) {
  if (!day) return { hol: 0, wo: 0 };
  let hol = 0;
  let wo = 0;
  if (day.isHOL) hol = 1;
  else {
    if (day.rosterFirstHalfHOL) hol += 0.5;
    if (day.rosterSecondHalfHOL) hol += 0.5;
    if (day.halfHolidaySandwichCreditDelta) {
      hol = round2(hol + Number(day.halfHolidaySandwichCreditDelta) || 0);
    }
  }
  if (day.isWO) wo = 1;
  else {
    if (day.rosterFirstHalfWO) wo += 0.5;
    if (day.rosterSecondHalfWO) wo += 0.5;
  }
  return { hol: round2(Math.max(0, hol)), wo: round2(Math.max(0, wo)) };
}

function buildContributingNonWorkingEntries(allDates, dailyStatsMap, isOutsideEmploymentBound) {
  const weeklyOffs = [];
  const holidays = [];
  for (const dStr of allDates) {
    if (isOutsideEmploymentBound(dStr)) continue;
    const day = dailyStatsMap.get(dStr);
    if (!day) continue;
    const { hol, wo } = computeHalfNonWorkingCredits(day);
    if (wo > 0) {
      weeklyOffs.push({ date: dStr, value: wo, label: wo >= 1 ? 'WO' : 'WO-½' });
    }
    if (hol > 0) {
      holidays.push({ date: dStr, value: hol, label: hol >= 1 ? 'HOL' : 'HOL-½' });
    }
  }
  return { weeklyOffs, holidays };
}

/**
 * AttendanceDaily status / roster fields after resolution (no sandwich).
 */
function buildAttendanceDailyWriteBackForResolvedDay(day, originalNonWorking, approvedLeaves) {
  if (!day) return null;
  const meta = day.nonWorkingLeaveResolved;
  const { hol, wo } = computeHalfNonWorkingCredits(day);
  const hasLeave = (approvedLeaves || []).length > 0;
  const orig = originalNonWorking;

  if (meta?.leaveFullyOverridesNonWorking && hasLeave) {
    return {
      status: 'LEAVE',
      payableShifts: 0,
      rosterFirstHalfNonWorking: null,
      rosterSecondHalfNonWorking: null,
    };
  }

  if (meta?.leavePartiallyOverridesNonWorking && hasLeave) {
    const firstNw = day.rosterFirstHalfHOL ? 'HOL' : day.rosterFirstHalfWO ? 'WO' : null;
    const secondNw = day.rosterSecondHalfHOL ? 'HOL' : day.rosterSecondHalfWO ? 'WO' : null;
    const leaveHalf =
      meta.leaveFirst >= 0.5 && meta.leaveSecond < 0.5
        ? 'first_half'
        : meta.leaveSecond >= 0.5 && meta.leaveFirst < 0.5
          ? 'second_half'
          : null;
    return {
      status: 'PARTIAL',
      payableShifts: 0,
      rosterFirstHalfNonWorking: firstNw,
      rosterSecondHalfNonWorking: secondNw,
      partialDayRule: {
        applied: true,
        ruleCode: 'ROSTER_NW_LEAVE_SPLIT_V1',
        firstHalfStatus: leaveHalf === 'first_half' ? 'leave' : firstNw ? (firstNw === 'HOL' ? 'holiday' : 'week_off') : 'leave',
        secondHalfStatus: leaveHalf === 'second_half' ? 'leave' : secondNw ? (secondNw === 'HOL' ? 'holiday' : 'week_off') : 'leave',
        presentPortion: 0,
        lopPortion: 0,
        coveredPortion: round2(hol + wo),
        note: 'Roster non-working split with approved leave on other half.',
      },
    };
  }

  if (orig === 'WO' && wo >= 1) {
    return {
      status: 'WEEK_OFF',
      payableShifts: 0,
      rosterFirstHalfNonWorking: 'WO',
      rosterSecondHalfNonWorking: 'WO',
    };
  }
  if (orig === 'HOL' && hol >= 1) {
    return {
      status: 'HOLIDAY',
      payableShifts: 0,
      rosterFirstHalfNonWorking: 'HOL',
      rosterSecondHalfNonWorking: 'HOL',
    };
  }
  if (hol > 0 || wo > 0) {
    const firstNw = day.rosterFirstHalfHOL ? 'HOL' : day.rosterFirstHalfWO ? 'WO' : null;
    const secondNw = day.rosterSecondHalfHOL ? 'HOL' : day.rosterSecondHalfWO ? 'WO' : null;
    if (hol + wo < 1) {
      return {
        status: 'PARTIAL',
        payableShifts: 0,
        rosterFirstHalfNonWorking: firstNw,
        rosterSecondHalfNonWorking: secondNw,
      };
    }
  }

  return null;
}

module.exports = {
  isPolicySandwichLeave,
  combineApprovedLeaveHalfCredits,
  getRosterNonWorkingHalves,
  applyRosterNonWorkingLeaveResolution,
  syncNonWorkingDateSets,
  computeHalfNonWorkingCredits,
  buildContributingNonWorkingEntries,
  buildAttendanceDailyWriteBackForResolvedDay,
};
