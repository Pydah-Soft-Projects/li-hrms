/**
 * Roster half-day week-off / holiday helpers (PreScheduledShift).
 */

const NON_WORKING = new Set(['WO', 'HOL']);

function normalizeHalfStatus(v) {
  if (!v) return null;
  const s = String(v).toUpperCase();
  return NON_WORKING.has(s) ? s : null;
}

/**
 * @param {object|null} row PreScheduledShift lean doc
 */
function parseRosterHalfNonWorking(row) {
  if (!row) {
    return {
      shiftId: null,
      fullStatus: null,
      firstHalfStatus: null,
      secondHalfStatus: null,
      isFullHOL: false,
      isFullWO: false,
      firstHOL: false,
      secondHOL: false,
      firstWO: false,
      secondWO: false,
    };
  }

  const fullStatus = row.status && NON_WORKING.has(row.status) ? row.status : null;
  const firstHalfStatus = fullStatus ? fullStatus : normalizeHalfStatus(row.firstHalfStatus);
  const secondHalfStatus = fullStatus ? fullStatus : normalizeHalfStatus(row.secondHalfStatus);

  const firstHOL = firstHalfStatus === 'HOL';
  const secondHOL = secondHalfStatus === 'HOL';
  const firstWO = firstHalfStatus === 'WO';
  const secondWO = secondHalfStatus === 'WO';

  return {
    shiftId: row.shiftId || null,
    fullStatus,
    firstHalfStatus,
    secondHalfStatus,
    isFullHOL: fullStatus === 'HOL' || (firstHOL && secondHOL),
    isFullWO: fullStatus === 'WO' || (firstWO && secondWO),
    firstHOL,
    secondHOL,
    firstWO,
    secondWO,
  };
}

/**
 * policyMeta.partialDayRule for a calendar day with half HOL/WO and no punches.
 */
function buildPartialDayRuleForHalfRoster(roster) {
  const firstHalfStatus = roster.firstHOL
    ? 'holiday'
    : roster.firstWO
      ? 'week_off'
      : null;
  const secondHalfStatus = roster.secondHOL
    ? 'holiday'
    : roster.secondWO
      ? 'week_off'
      : null;

  if (!firstHalfStatus && !secondHalfStatus) return null;

  let f = firstHalfStatus;
  let s = secondHalfStatus;
  if (!f && s) f = 'absent';
  if (!s && f) s = 'absent';

  let coveredPortion = 0;
  if (roster.firstHOL) coveredPortion += 0.5;
  if (roster.secondHOL) coveredPortion += 0.5;
  if (roster.firstWO) coveredPortion += 0.5;
  if (roster.secondWO) coveredPortion += 0.5;

  const parts = [];
  if (roster.firstHOL) parts.push('first half holiday');
  else if (roster.firstWO) parts.push('first half week off');
  if (roster.secondHOL) parts.push('second half holiday');
  else if (roster.secondWO) parts.push('second half week off');

  return {
    applied: true,
    ruleCode: 'ROSTER_HALF_NON_WORKING_V1',
    firstHalfStatus: f,
    secondHalfStatus: s,
    presentPortion: 0,
    lopPortion: 0,
    coveredPortion: Math.min(1, Math.round(coveredPortion * 100) / 100),
    note: parts.length ? `Roster non-working (${parts.join(', ')})` : null,
  };
}

/**
 * AttendanceDaily fields when roster has half HOL/WO and there are no punches yet.
 */
function buildAttendanceFieldsForNoPunchHalfRoster(roster, notes) {
  const holParts = [];
  if (roster.firstHOL) holParts.push('first half');
  if (roster.secondHOL) holParts.push('second half');
  const holidayNote =
    notes || (holParts.length ? `Roster holiday (${holParts.join(', ')})` : null);

  if (roster.isFullHOL) {
    return {
      status: 'HOLIDAY',
      payableShifts: 0,
      shifts: [],
      totalWorkingHours: 0,
      totalOTHours: 0,
      rosterFirstHalfNonWorking: 'HOL',
      rosterSecondHalfNonWorking: 'HOL',
      notes: holidayNote || 'Holiday',
      policyMeta: { partialDayRule: { applied: false } },
    };
  }

  if (roster.isFullWO) {
    return {
      status: 'WEEK_OFF',
      payableShifts: 0,
      shifts: [],
      totalWorkingHours: 0,
      totalOTHours: 0,
      rosterFirstHalfNonWorking: 'WO',
      rosterSecondHalfNonWorking: 'WO',
      notes: notes || 'Week Off',
      policyMeta: { partialDayRule: { applied: false } },
    };
  }

  const partialDayRule = buildPartialDayRuleForHalfRoster(roster);
  return {
    status: 'PARTIAL',
    payableShifts: 0,
    shifts: [],
    totalWorkingHours: 0,
    totalOTHours: 0,
    rosterFirstHalfNonWorking: roster.firstHalfStatus,
    rosterSecondHalfNonWorking: roster.secondHalfStatus,
    notes: holidayNote,
    policyMeta: { partialDayRule },
  };
}

/**
 * Which roster half is holiday/week-off for pay register.
 */
function isRosterHalfNonWorking(day, halfKey, type) {
  if (!day) return false;
  if (type === 'HOL' && day.isHOL) return true;
  if (type === 'WO' && day.isWO) return true;
  if (halfKey === 'first') {
    return type === 'HOL' ? !!day.rosterFirstHalfHOL : !!day.rosterFirstHalfWO;
  }
  return type === 'HOL' ? !!day.rosterSecondHalfHOL : !!day.rosterSecondHalfWO;
}

/**
 * Apply roster half HOL/WO to AttendanceDaily after punch-based status is computed.
 * @param {object} doc mongoose AttendanceDaily document
 * @param {object|null} rosterRow PreScheduledShift
 * @param {function} getWorkedHalfFromShifts (shifts, dateStr) => 'first_half'|'second_half'|null
 * @returns {{ workedOnHolidayHalf: boolean, workedOnWorkingHalfWithOtherHalfHoliday: boolean }}
 */
function getWorkedSegmentIndex(shifts) {
  if (!shifts?.length) return -1;
  const ordered = [...shifts].sort(
    (a, b) => new Date(a.inTime || 0).getTime() - new Date(b.inTime || 0).getTime()
  );
  const WORKED = new Set(['PRESENT', 'HALF_DAY', 'PARTIAL', 'COMPLETE']);
  for (let i = 0; i < ordered.length; i += 1) {
    const st = String(ordered[i]?.status || '').toUpperCase();
    if (WORKED.has(st) || ordered[i]?.inTime) {
      return i;
    }
  }
  return -1;
}

function applyRosterHalfNonWorkingToAttendanceDaily(doc, rosterRow, getWorkedHalfFromShifts) {
  const roster = parseRosterHalfNonWorking(rosterRow);
  doc.rosterFirstHalfNonWorking = roster.firstHalfStatus;
  doc.rosterSecondHalfNonWorking = roster.secondHalfStatus;

  const result = {
    workedOnHolidayHalf: false,
    workedOnWorkingHalfWithOtherHalfHoliday: false,
  };

  if (rosterRow?.holidaySegmentScope === 'FIRST_SEGMENT' && doc.shifts?.length > 1) {
    const workedIdx = getWorkedSegmentIndex(doc.shifts);
    if (workedIdx > 0) {
      return result;
    }
  }

  if (roster.isFullHOL || roster.isFullWO) {
    const label = roster.isFullHOL ? 'Holiday' : 'Week Off';
    doc.status = roster.isFullHOL ? 'HOLIDAY' : 'WEEK_OFF';
    doc.payableShifts = 0;
    if (doc.totalWorkingHours > 0) {
      const remark = `Worked on ${label}`;
      if (!doc.notes) doc.notes = remark;
      else if (!doc.notes.includes(remark)) doc.notes = `${doc.notes} | ${remark}`;
    }
    if (roster.isFullHOL && doc.totalWorkingHours > 0) {
      result.workedOnHolidayHalf = true;
    }
    return result;
  }

  const hasHalfHol = roster.firstHOL || roster.secondHOL;
  const hasHalfWo = roster.firstWO || roster.secondWO;
  if (!hasHalfHol && !hasHalfWo) {
    return result;
  }

  const noShifts = !doc.shifts || doc.shifts.length === 0;
  const noWork = !doc.totalWorkingHours || doc.totalWorkingHours === 0;

  const workedHalf =
    doc.shifts && doc.shifts.length > 0 && typeof getWorkedHalfFromShifts === 'function'
      ? getWorkedHalfFromShifts(doc.shifts, doc.date)
      : null;

  if (noShifts && noWork) {
    const fields = buildAttendanceFieldsForNoPunchHalfRoster(roster, doc.notes);
    Object.assign(doc, fields);
    if (!doc.policyMeta) doc.policyMeta = fields.policyMeta;
    else if (fields.policyMeta?.partialDayRule) {
      doc.policyMeta = { ...doc.policyMeta, partialDayRule: fields.policyMeta.partialDayRule };
    }
    return result;
  }

  const holidayHalfWorked =
    workedHalf === 'first_half'
      ? roster.firstHOL
      : workedHalf === 'second_half'
        ? roster.secondHOL
        : false;

  const workingHalfWithOtherHoliday =
    workedHalf === 'first_half'
      ? roster.secondHOL
      : workedHalf === 'second_half'
        ? roster.firstHOL
        : hasHalfHol && !workedHalf;

  if (holidayHalfWorked && doc.totalWorkingHours > 0) {
    result.workedOnHolidayHalf = true;
    doc.status = 'HOLIDAY';
    doc.payableShifts = 0;
    const halfLabel = workedHalf === 'first_half' ? 'first half' : 'second half';
    const remark = `Worked on holiday (${halfLabel})`;
    if (!doc.notes) doc.notes = remark;
    else if (!doc.notes.includes(remark)) doc.notes = `${doc.notes} | ${remark}`;
    return result;
  }

  if (workingHalfWithOtherHoliday && workedHalf) {
    result.workedOnWorkingHalfWithOtherHalfHoliday = true;
    doc.status = 'HALF_DAY';
    const pay = Number(doc.payableShifts) || 0;
    // Worked the non-holiday half: always 0.5 payable (holiday credit is on the other half in summary).
    doc.payableShifts = pay > 0
      ? Math.round(Math.min(pay, 0.5) * 100) / 100
      : 0.5;
    const otherLabel = roster.firstHOL && !roster.secondHOL ? 'second half' : 'first half';
    const remark = `Roster holiday (${otherLabel}); worked ${workedHalf === 'first_half' ? 'first half' : 'second half'}`;
    if (!doc.notes) doc.notes = remark;
    else if (!doc.notes.includes('Roster holiday')) doc.notes = `${doc.notes} | ${remark}`;
  }

  // Full-day-looking punches on a single half-holiday roster day → cap to working half only (single-shift).
  if (
    hasHalfHol &&
    !roster.isFullHOL &&
    !workedHalf &&
    doc.totalWorkingHours > 0 &&
    (Number(doc.payableShifts) > 0.5 + 1e-6 ||
      String(doc.status || '').toUpperCase() === 'PRESENT')
  ) {
    const workingHalfKey = roster.firstHOL && !roster.secondHOL ? 'second_half' : 'first_half';
    const holidayLabel = roster.firstHOL ? 'first half' : 'second half';
    result.workedOnWorkingHalfWithOtherHalfHoliday = true;
    doc.status = 'HALF_DAY';
    doc.payableShifts = Math.round(Math.min(Number(doc.payableShifts) || 1, 0.5) * 100) / 100;
    const remark = `Roster half holiday (${holidayLabel}); full-day punch capped to working ${workingHalfKey.replace('_', ' ')} (0.5 payable)`;
    if (!doc.notes) doc.notes = remark;
    else if (!doc.notes.includes('full-day punch capped')) doc.notes = `${doc.notes} | ${remark}`;
  }

  if (hasHalfWo && !hasHalfHol) {
    // Half week-off: mirror holiday logic with WEEK_OFF on non-worked half in summary via roster flags
    if (workedHalf) {
      doc.status = 'HALF_DAY';
      const pay = Number(doc.payableShifts) || 0;
      doc.payableShifts = Math.round(Math.min(pay, 0.5) * 100) / 100;
    }
  }

  return result;
}

module.exports = {
  parseRosterHalfNonWorking,
  buildPartialDayRuleForHalfRoster,
  buildAttendanceFieldsForNoPunchHalfRoster,
  isRosterHalfNonWorking,
  applyRosterHalfNonWorkingToAttendanceDaily,
};
