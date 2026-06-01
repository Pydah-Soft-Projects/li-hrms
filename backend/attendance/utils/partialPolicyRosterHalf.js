/**
 * Partial-day policy when roster marks half HOL/WO — no PARTIAL_PRESENT_PLUS_LOP_V1 on the holiday/WO half.
 */

function dayHasRosterHalfNonWorking(day) {
  if (!day) return false;
  return !!(
    day.rosterFirstHalfHOL ||
    day.rosterSecondHalfHOL ||
    day.rosterFirstHalfWO ||
    day.rosterSecondHalfWO
  );
}

/** Exactly one calendar half marked HOL on roster (not both). */
function hasExactlyOneRosterHalfHol(day) {
  if (!day || day.halfHolLeaveOverridesHoliday) return false;
  const f = !!day.rosterFirstHalfHOL;
  const s = !!day.rosterSecondHalfHOL;
  return (f && !s) || (!f && s);
}

/**
 * Cap attendance half-credits on single half-holiday days (single-shift summary).
 */
function capAttendanceHalvesForSingleHalfHoliday(day, attFirst, attSecond) {
  if (!hasExactlyOneRosterHalfHol(day)) {
    return { attFirst, attSecond };
  }
  let a1 = attFirst;
  let a2 = attSecond;
  if (day.rosterFirstHalfHOL) a1 = 0;
  if (day.rosterSecondHalfHOL) a2 = 0;
  if (day.rosterFirstHalfHOL && a2 > 0.5) a2 = 0.5;
  if (day.rosterSecondHalfHOL && a1 > 0.5) a1 = 0.5;
  return { attFirst: a1, attSecond: a2 };
}

/**
 * @param {object} day - dailyStatsMap entry
 * @param {number} attFirst - 0 or 0.5
 * @param {number} attSecond - 0 or 0.5
 */
function buildRosterHalfPartialPolicyMeta(day, attFirst, attSecond) {
  const rh = !!day.rosterFirstHalfHOL;
  const rs = !!day.rosterSecondHalfHOL;
  const rwf = !!day.rosterFirstHalfWO;
  const rws = !!day.rosterSecondHalfWO;

  const resolveHalf = (isHol, isWo, attCredit) => {
    if (isHol) return 'holiday';
    if (isWo) return 'week_off';
    if (attCredit >= 0.5) return 'present';
    return 'absent';
  };

  let firstHalfStatus = resolveHalf(rh, rwf, attFirst);
  let secondHalfStatus = resolveHalf(rs, rws, attSecond);

  // Punch on the roster holiday/WO half → that half stays non-working (not present + policy LOP).
  if (rh && attFirst >= 0.5 && attSecond < 0.5) firstHalfStatus = 'holiday';
  if (rs && attSecond >= 0.5 && attFirst < 0.5) secondHalfStatus = 'holiday';
  if (rwf && attFirst >= 0.5 && attSecond < 0.5) firstHalfStatus = 'week_off';
  if (rws && attSecond >= 0.5 && attFirst < 0.5) secondHalfStatus = 'week_off';

  let coveredPortion = 0;
  if (rh || rwf) coveredPortion += 0.5;
  if (rs || rws) coveredPortion += 0.5;
  const presentPortion =
    (firstHalfStatus === 'present' ? 0.5 : 0) + (secondHalfStatus === 'present' ? 0.5 : 0);
  coveredPortion = Math.min(1, Math.round((coveredPortion + presentPortion) * 100) / 100);

  const parts = [];
  if (rh) parts.push('first half holiday');
  else if (rwf) parts.push('first half week off');
  if (rs) parts.push('second half holiday');
  else if (rws) parts.push('second half week off');

  return {
    ruleCode: 'ROSTER_HALF_NON_WORKING_V1',
    firstHalfStatus,
    secondHalfStatus,
    presentPortion: Math.round(presentPortion * 100) / 100,
    lopPortion: 0,
    coveredPortion,
    note: parts.length
      ? `Roster non-working (${parts.join(', ')}); not subject to partial LOP policy.`
      : 'Roster half non-working; not subject to partial LOP policy.',
  };
}

function payRegisterHalfFromStatus(status) {
  const s = String(status || 'absent').toLowerCase();
  if (s === 'present') {
    return { status: 'present', leaveType: null, leaveNature: null, isOD: false, otHours: 0 };
  }
  if (s === 'holiday') {
    return { status: 'holiday', leaveType: null, leaveNature: null, isOD: false, otHours: 0 };
  }
  if (s === 'week_off') {
    return { status: 'week_off', leaveType: null, leaveNature: null, isOD: false, otHours: 0 };
  }
  return { status: 'absent', leaveType: null, leaveNature: null, isOD: false, otHours: 0 };
}

function applyRosterHalfToPayRegisterSnapshot(snapshot, day, attFirst, attSecond) {
  if (!snapshot || !dayHasRosterHalfNonWorking(day)) return snapshot;
  const meta = buildRosterHalfPartialPolicyMeta(day, attFirst, attSecond);
  const firstHalf = payRegisterHalfFromStatus(meta.firstHalfStatus);
  const secondHalf = payRegisterHalfFromStatus(meta.secondHalfStatus);
  const isSplit = firstHalf.status !== secondHalf.status;
  return {
    ...snapshot,
    firstHalf,
    secondHalf,
    isSplit,
    status: isSplit ? null : firstHalf.status,
    leaveType: null,
    leaveNature: null,
    isOD: false,
  };
}

module.exports = {
  dayHasRosterHalfNonWorking,
  hasExactlyOneRosterHalfHol,
  capAttendanceHalvesForSingleHalfHoliday,
  buildRosterHalfPartialPolicyMeta,
  applyRosterHalfToPayRegisterSnapshot,
};
