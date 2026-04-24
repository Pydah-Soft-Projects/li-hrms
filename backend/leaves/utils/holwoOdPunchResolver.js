/**
 * Holiday / week-off punch-based OD shape: half vs full, absent segments, first/second half.
 * No model imports — safe to require from AttendanceDaily pre-save (no cycles).
 */

const MIN_HOURS_FOR_PUNCH_CONTEXT = 2;
const FULL_DAY_HOURS_THRESHOLD = 4;

const WORKED_STATUSES = ['PRESENT', 'HALF_DAY', 'PARTIAL', 'COMPLETE'];

const segmentStatus = (s) => String(s?.status || '').toUpperCase();

/**
 * Which half of the (single) shift window was worked — from punch times vs midpoint.
 * @param {Array} shifts
 * @param {string} dateStr YYYY-MM-DD
 * @returns {'first_half'|'second_half'|null}
 */
function getWorkedHalfFromShifts(shifts, dateStr) {
  if (!shifts || shifts.length === 0) return null;
  const shift = shifts.find((s) => s.shiftStartTime && s.shiftEndTime && s.inTime);
  if (!shift) return null;
  const [startH, startM] = (shift.shiftStartTime || '').split(':').map(Number);
  const [endH, endM] = (shift.shiftEndTime || '').split(':').map(Number);
  const shiftStartMins = (startH || 0) * 60 + (startM || 0);
  let shiftEndMins = (endH || 0) * 60 + (endM || 0);
  if (shiftEndMins <= shiftStartMins) shiftEndMins += 24 * 60;
  const durationMins = shiftEndMins - shiftStartMins;
  const midOffset = durationMins / 2;

  const inDate = new Date(shift.inTime);
  const inMins = inDate.getHours() * 60 + inDate.getMinutes();
  let inOffset = inMins - shiftStartMins;
  if (inOffset < 0) inOffset += 24 * 60;
  if (inOffset > durationMins) inOffset -= 24 * 60;
  const outDate = shift.outTime ? new Date(shift.outTime) : null;
  let outOffset = null;
  if (outDate) {
    let outMins = outDate.getHours() * 60 + outDate.getMinutes();
    if (shiftEndMins > 24 * 60 && outMins < shiftStartMins) outMins += 24 * 60;
    outOffset = outMins - shiftStartMins;
    if (outOffset < 0) outOffset += 24 * 60;
  }

  const workedBeforeMid = inOffset < midOffset;
  const workedAfterMid = outOffset == null ? false : outOffset >= midOffset;
  if (workedBeforeMid && workedAfterMid) return null;
  if (workedBeforeMid) return 'first_half';
  return 'second_half';
}

/**
 * first_half / second_half for multi-segment days (e.g. PRESENT + ABSENT) or single segment with window.
 */
function inferHalfDayTypeFromShiftSegments(shifts, dateStr) {
  if (!shifts?.length) return null;
  const st = segmentStatus;
  const ordered = [...shifts].sort((a, b) => new Date(a.inTime || 0) - new Date(b.inTime || 0));
  const workedShifts = ordered.filter((s) => WORKED_STATUSES.includes(st(s)));
  if (workedShifts.length === 0) return null;
  if (workedShifts.length >= 2) {
    return getWorkedHalfFromShifts(shifts, dateStr);
  }
  if (ordered.length === 1) {
    return getWorkedHalfFromShifts(shifts, dateStr);
  }
  if (ordered.length === 2) {
    const widx = ordered.findIndex((s) => WORKED_STATUSES.includes(st(s)));
    return widx === 0 ? 'first_half' : 'second_half';
  }
  const widx = ordered.findIndex((s) => WORKED_STATUSES.includes(st(s)));
  if (widx < 0) return null;
  return widx < ordered.length / 2 ? 'first_half' : 'second_half';
}

/**
 * Core half/full suggestion from attendance (aligned with auto-OD).
 */
function resolveHolWoPunchOdShape(record) {
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
  const st = segmentStatus;
  const hasAnyAbsent = shifts.some((s) => st(s) === 'ABSENT');
  const hasWorkedSegment = shifts.some((s) => WORKED_STATUSES.includes(st(s)));

  if (shifts.length > 0) {
    if (hasAnyAbsent) {
      if (!hasWorkedSegment) {
        return {
          hasPunches: false,
          suggestedOdTypeExtended: null,
          totalWorkingHours: th,
          punchContextDetail: 'absent_segments_only',
        };
      }
      if (th < MIN_HOURS_FOR_PUNCH_CONTEXT) {
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
      return {
        hasPunches: true,
        suggestedOdTypeExtended: 'half_day',
        totalWorkingHours: th,
        punchContextDetail: 'mixed_work_with_absent_segment',
      };
    }
  }

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

function getPunchBasedOdSuggestionForRecord(record) {
  return resolveHolWoPunchOdShape(record);
}

/**
 * Auto-OD gate: do not create when only ABSENT segments; half vs full from shift rows; halfDayType when half.
 */
function getAutoOdEligibilityFromRecord(record) {
  const shape = resolveHolWoPunchOdShape(record);
  if (!shape.hasPunches || !shape.suggestedOdTypeExtended) {
    return {
      eligible: false,
      reason: shape.punchContextDetail || 'not_eligible',
      odType_extended: null,
      isHalfDay: false,
      halfDayType: null,
      totalWorkingHours: shape.totalWorkingHours,
    };
  }
  const isHalf = shape.suggestedOdTypeExtended === 'half_day';
  const halfDayType = isHalf
    ? (inferHalfDayTypeFromShiftSegments(record?.shifts, record?.date) || 'first_half')
    : null;
  return {
    eligible: true,
    reason: null,
    odType_extended: shape.suggestedOdTypeExtended,
    isHalfDay: isHalf,
    halfDayType,
    totalWorkingHours: shape.totalWorkingHours,
    punchContextDetail: shape.punchContextDetail,
  };
}

module.exports = {
  resolveHolWoPunchOdShape,
  getPunchBasedOdSuggestionForRecord,
  getAutoOdEligibilityFromRecord,
  getWorkedHalfFromShifts,
  inferHalfDayTypeFromShiftSegments,
  MIN_HOURS_FOR_PUNCH_CONTEXT,
  FULL_DAY_HOURS_THRESHOLD,
  WORKED_STATUSES,
};
