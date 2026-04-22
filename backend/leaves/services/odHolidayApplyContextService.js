/**
 * Holiday / week-off OD apply context: roster check + optional punch-based half/full (aligned with auto-OD heuristics).
 * When there are no qualifying punches, callers should use legacy free-form apply behaviour.
 */

const PreScheduledShift = require('../../shifts/model/PreScheduledShift');
const AttendanceDaily = require('../../attendance/model/AttendanceDaily');

/** Same minimum worked hours as legacy auto-OD in AttendanceDaily (before it was paused). */
const MIN_HOURS_FOR_PUNCH_CONTEXT = 2;
/** If worked hours are at or above this, treat as full-day eligibility (tunable). */
const FULL_DAY_HOURS_THRESHOLD = 4;

async function isHolidayOrWeekOff(employeeNumber, dateStr) {
  const empNo = String(employeeNumber).trim().toUpperCase();
  const ps = await PreScheduledShift.findOne({
    employeeNumber: empNo,
    date: dateStr,
    status: { $in: ['WO', 'HOL'] },
  });
  return !!ps;
}

/**
 * Derive half vs full from attendance (thumb punches / shift segments) for a HOL/WO day.
 * @param {import('mongoose').LeanDocument|null} record - AttendanceDaily for that date
 * @returns {{ hasPunches: boolean, suggestedOdTypeExtended: 'half_day'|'full_day'|null, totalWorkingHours: number|null, punchContextDetail: string }}
 */
function getPunchBasedOdSuggestionForRecord(record) {
  if (!record) {
    return {
      hasPunches: false,
      suggestedOdTypeExtended: null,
      totalWorkingHours: null,
      punchContextDetail: 'no_attendance_daily',
    };
  }

  const th = Number(record.totalWorkingHours) || 0;
  const shifts = record.shifts || [];
  const st = (s) => String(s.status || '').toUpperCase();
  const hasWorkedSegment = shifts.some((s) =>
    ['PRESENT', 'HALF_DAY', 'PARTIAL', 'COMPLETE'].includes(st(s))
  );

  if (th < MIN_HOURS_FOR_PUNCH_CONTEXT || !hasWorkedSegment) {
    return {
      hasPunches: false,
      suggestedOdTypeExtended: null,
      totalWorkingHours: th,
      punchContextDetail: 'insufficient_punches',
    };
  }

  if (shifts.some((s) => st(s) === 'HALF_DAY')) {
    return {
      hasPunches: true,
      suggestedOdTypeExtended: 'half_day',
      totalWorkingHours: th,
      punchContextDetail: 'shift_segment_half_day',
    };
  }

  if (th >= FULL_DAY_HOURS_THRESHOLD) {
    return {
      hasPunches: true,
      suggestedOdTypeExtended: 'full_day',
      totalWorkingHours: th,
      punchContextDetail: 'hours_gte_full_threshold',
    };
  }

  return {
    hasPunches: true,
    suggestedOdTypeExtended: 'half_day',
    totalWorkingHours: th,
    punchContextDetail: 'hours_between_min_and_full_threshold',
  };
}

/**
 * Full context for GET /od/check-holiday: roster HOL/WO + optional punch-based suggestion.
 */
async function getHolidayWeekOffOdApplyContext(empNo, dateStr) {
  const upper = String(empNo).trim().toUpperCase();
  const isHolWo = await isHolidayOrWeekOff(upper, dateStr);
  if (!isHolWo) {
    return {
      isHolidayOrWeekOff: false,
      hasPunches: false,
      suggestedOdTypeExtended: null,
      totalWorkingHours: null,
      punchContextDetail: null,
    };
  }

  const record = await AttendanceDaily.findOne({
    employeeNumber: upper,
    date: dateStr,
  }).lean();

  const s = getPunchBasedOdSuggestionForRecord(record);
  return {
    isHolidayOrWeekOff: true,
    hasPunches: s.hasPunches,
    suggestedOdTypeExtended: s.suggestedOdTypeExtended,
    totalWorkingHours: s.totalWorkingHours,
    punchContextDetail: s.punchContextDetail,
  };
}

module.exports = {
  isHolidayOrWeekOff,
  getPunchBasedOdSuggestionForRecord,
  getHolidayWeekOffOdApplyContext,
  MIN_HOURS_FOR_PUNCH_CONTEXT,
  FULL_DAY_HOURS_THRESHOLD,
};
