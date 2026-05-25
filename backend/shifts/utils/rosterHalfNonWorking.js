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
function applyRosterHalfNonWorkingToAttendanceDaily(doc, rosterRow, getWorkedHalfFromShifts) {
  const roster = parseRosterHalfNonWorking(rosterRow);
  doc.rosterFirstHalfNonWorking = roster.firstHalfStatus;
  doc.rosterSecondHalfNonWorking = roster.secondHalfStatus;

  const result = {
    workedOnHolidayHalf: false,
    workedOnWorkingHalfWithOtherHalfHoliday: false,
  };

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

  const workedHalf =
    doc.shifts && doc.shifts.length > 0 && typeof getWorkedHalfFromShifts === 'function'
      ? getWorkedHalfFromShifts(doc.shifts, doc.date)
      : null;

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
  isRosterHalfNonWorking,
  applyRosterHalfNonWorkingToAttendanceDaily,
};
