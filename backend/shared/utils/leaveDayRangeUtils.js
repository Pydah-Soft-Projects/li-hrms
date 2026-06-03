/**
 * Leave date-range helpers: single-day half (any half) vs multi-day boundary halves
 * (start → second half only, end → first half only, middle → full days).
 */

const { extractISTComponents, createISTDate } = require('./dateUtils');

function istDateStr(date) {
  return extractISTComponents(date).dateStr;
}

function isSameIstCalendarDay(fromDate, toDate) {
  return istDateStr(fromDate) === istDateStr(toDate || fromDate);
}

function eachDateStrInRange(fromDate, toDate) {
  const startStr = istDateStr(fromDate);
  const endStr = istDateStr(toDate || fromDate);
  const dates = [];
  let cur = createISTDate(startStr, '00:00');
  const end = createISTDate(endStr, '00:00');
  while (cur.getTime() <= end.getTime()) {
    dates.push(extractISTComponents(cur).dateStr);
    cur.setDate(cur.getDate() + 1);
  }
  return dates;
}

/**
 * Resolve boundary flags from API payload (supports legacy isHalfDay + new fields).
 * @returns {{ ok: boolean, error?: string, fromIsHalfDay: boolean, fromHalfDayType: string|null, toIsHalfDay: boolean, toHalfDayType: string|null, isHalfDay: boolean, halfDayType: string|null }}
 */
function normalizeLeaveBoundaries(input = {}) {
  const fromDate = input.fromDate;
  const toDate = input.toDate || input.fromDate;
  if (!fromDate || !toDate) {
    return { ok: false, error: 'From and to dates are required' };
  }

  const sameDay = isSameIstCalendarDay(fromDate, toDate);
  let fromIsHalfDay = Boolean(input.fromIsHalfDay);
  let toIsHalfDay = Boolean(input.toIsHalfDay);
  let fromHalfDayType = input.fromHalfDayType || null;
  let toHalfDayType = input.toHalfDayType || null;

  if (sameDay) {
    if (input.isHalfDay && !fromIsHalfDay) {
      fromIsHalfDay = true;
      fromHalfDayType = input.halfDayType || fromHalfDayType;
    }
    toIsHalfDay = false;
    toHalfDayType = null;
    if (fromIsHalfDay) {
      const half = fromHalfDayType === 'second_half' ? 'second_half' : 'first_half';
      fromHalfDayType = half;
      return {
        ok: true,
        fromIsHalfDay: true,
        fromHalfDayType: half,
        toIsHalfDay: false,
        toHalfDayType: null,
        isHalfDay: true,
        halfDayType: half,
      };
    }
    return {
      ok: true,
      fromIsHalfDay: false,
      fromHalfDayType: null,
      toIsHalfDay: false,
      toHalfDayType: null,
      isHalfDay: false,
      halfDayType: null,
    };
  }

  // Multi-day: legacy top-level isHalfDay does not apply
  if (fromIsHalfDay) {
    fromHalfDayType = 'second_half';
  } else {
    fromHalfDayType = null;
  }
  if (toIsHalfDay) {
    toHalfDayType = 'first_half';
  } else {
    toHalfDayType = null;
  }

  return {
    ok: true,
    fromIsHalfDay,
    fromHalfDayType: fromIsHalfDay ? fromHalfDayType : null,
    toIsHalfDay,
    toHalfDayType: toIsHalfDay ? toHalfDayType : null,
    isHalfDay: false,
    halfDayType: null,
  };
}

/**
 * @param {Date|string} fromDate
 * @param {Date|string} toDate
 * @param {{ fromIsHalfDay?: boolean, fromHalfDayType?: string|null, toIsHalfDay?: boolean, toHalfDayType?: string|null, isHalfDay?: boolean, halfDayType?: string|null }} bounds
 */
function calculateLeaveNumberOfDays(fromDate, toDate, bounds = {}) {
  const normalized = normalizeLeaveBoundaries({
    fromDate,
    toDate,
    ...bounds,
  });
  if (!normalized.ok) return 0;

  const dateStrs = eachDateStrInRange(fromDate, toDate);
  if (dateStrs.length === 0) return 0;
  if (dateStrs.length === 1) {
    return normalized.fromIsHalfDay ? 0.5 : 1;
  }

  let total = 0;
  const startStr = dateStrs[0];
  const endStr = dateStrs[dateStrs.length - 1];
  for (const d of dateStrs) {
    if (d === startStr) {
      total += normalized.fromIsHalfDay ? 0.5 : 1;
    } else if (d === endStr) {
      total += normalized.toIsHalfDay ? 0.5 : 1;
    } else {
      total += 1;
    }
  }
  return total;
}

/**
 * Daily segments for splits, pay register, reconciliation.
 * @returns {Array<{ dateStr: string, date: Date, isHalfDay: boolean, halfDayType: string|null, numberOfDays: number }>}
 */
function expandLeaveToDailySegments(leaveOrBounds) {
  const fromDate = leaveOrBounds.fromDate;
  const toDate = leaveOrBounds.toDate || leaveOrBounds.fromDate;
  const normalized = normalizeLeaveBoundaries({
    fromDate,
    toDate,
    isHalfDay: leaveOrBounds.isHalfDay,
    halfDayType: leaveOrBounds.halfDayType,
    fromIsHalfDay: leaveOrBounds.fromIsHalfDay,
    fromHalfDayType: leaveOrBounds.fromHalfDayType,
    toIsHalfDay: leaveOrBounds.toIsHalfDay,
    toHalfDayType: leaveOrBounds.toHalfDayType,
  });
  if (!normalized.ok) return [];

  const dateStrs = eachDateStrInRange(fromDate, toDate);
  const startStr = dateStrs[0];
  const endStr = dateStrs[dateStrs.length - 1];

  return dateStrs.map((dateStr) => {
    let isHalfDay = false;
    let halfDayType = null;
    let numberOfDays = 1;

    if (dateStrs.length === 1) {
      if (normalized.fromIsHalfDay) {
        isHalfDay = true;
        halfDayType = normalized.fromHalfDayType;
        numberOfDays = 0.5;
      }
    } else if (dateStr === startStr) {
      if (normalized.fromIsHalfDay) {
        isHalfDay = true;
        halfDayType = 'second_half';
        numberOfDays = 0.5;
      }
    } else if (dateStr === endStr) {
      if (normalized.toIsHalfDay) {
        isHalfDay = true;
        halfDayType = 'first_half';
        numberOfDays = 0.5;
      }
    }

    return {
      dateStr,
      date: createISTDate(dateStr, '00:00'),
      isHalfDay,
      halfDayType,
      numberOfDays,
    };
  });
}

/** Leave credit mask for one calendar day (l1 = first half, l2 = second half). */
function leaveHalfMaskForDate(leave, dateStr) {
  const segments = expandLeaveToDailySegments(leave);
  const seg = segments.find((s) => s.dateStr === dateStr);
  if (!seg) return { l1: 0, l2: 0 };
  if (seg.isHalfDay) {
    if (seg.halfDayType === 'second_half') return { l1: 0, l2: 0.5 };
    return { l1: 0.5, l2: 0 };
  }
  return { l1: 0.5, l2: 0.5 };
}

/** Per-day coverage for conflict checks on a specific date. */
function getLeaveCoverageOnDate(leave, dateStr) {
  const segments = expandLeaveToDailySegments(leave);
  const seg = segments.find((s) => s.dateStr === dateStr);
  if (!seg) return null;
  return {
    isHalfDay: seg.isHalfDay,
    halfDayType: seg.halfDayType,
    isFullDay: !seg.isHalfDay,
  };
}

/**
 * Per-calendar-day leave payload for attendance daily grid and detail dialog.
 * Uses boundary-aware segments (multi-day start/end halves, single-day half).
 */
function buildAttendanceLeaveInfoForDate(leave, dateStr, extra = {}) {
  const segments = expandLeaveToDailySegments(leave);
  const seg = segments.find((s) => s.dateStr === dateStr);
  if (!seg) return null;

  const normalized = normalizeLeaveBoundaries({
    fromDate: leave.fromDate,
    toDate: leave.toDate || leave.fromDate,
    isHalfDay: leave.isHalfDay,
    halfDayType: leave.halfDayType,
    fromIsHalfDay: leave.fromIsHalfDay,
    fromHalfDayType: leave.fromHalfDayType,
    toIsHalfDay: leave.toIsHalfDay,
    toHalfDayType: leave.toHalfDayType,
  });
  if (!normalized.ok) return null;

  const leaveDays = eachDateStrInRange(leave.fromDate, leave.toDate || leave.fromDate);
  const dayInLeave = leaveDays.indexOf(dateStr) + 1;

  return {
    leaveId: leave._id,
    leaveType: leave.leaveType,
    leaveNature: leave.leaveNature,
    purpose: leave.purpose,
    fromDate: leave.fromDate,
    toDate: leave.toDate,
    numberOfDays: leave.numberOfDays,
    fromIsHalfDay: normalized.fromIsHalfDay,
    fromHalfDayType: normalized.fromHalfDayType,
    toIsHalfDay: normalized.toIsHalfDay,
    toHalfDayType: normalized.toHalfDayType,
    isHalfDay: seg.isHalfDay,
    halfDayType: seg.halfDayType,
    segmentDaysOnDate: seg.numberOfDays,
    dayInLeave: dayInLeave > 0 ? dayInLeave : null,
    appliedAt: leave.appliedAt || leave.createdAt,
    ...extra,
  };
}

/**
 * Whether two leave/OD coverages conflict on one calendar day.
 */
function checkDayHalfCoverageConflict(reqA, reqB) {
  const aFull = !reqA.isHalfDay;
  const bFull = !reqB.isHalfDay;
  if (aFull || bFull) return true;
  const aHalf = reqA.halfDayType || 'first_half';
  const bHalf = reqB.halfDayType || 'first_half';
  return aHalf === bHalf;
}

/**
 * Date + boundary fields for a sub-range when a multi-day leave is split.
 * Start/end half flags apply only on the original request's from/to dates.
 * @param {'narrow_second'|'narrow_first'|null} modeOverride - single-day narrow after attendance conflict
 */
function buildLeaveDocumentFieldsForSpan(leave, spanFromStr, spanToStr, modeOverride = null) {
  const fromDate = createISTDate(spanFromStr, '00:00');
  const toDate = createISTDate(spanToStr, '23:59');

  if (modeOverride === 'narrow_second' || modeOverride === 'narrow_first') {
    const half = modeOverride === 'narrow_second' ? 'second_half' : 'first_half';
    return {
      fromDate,
      toDate,
      fromIsHalfDay: true,
      fromHalfDayType: half,
      toIsHalfDay: false,
      toHalfDayType: null,
      isHalfDay: true,
      halfDayType: half,
      numberOfDays: 0.5,
    };
  }

  const origFrom = istDateStr(leave.fromDate);
  const origTo = istDateStr(leave.toDate || leave.fromDate);
  const fromIsHalfDay = spanFromStr === origFrom ? Boolean(leave.fromIsHalfDay) : false;
  const toIsHalfDay = spanToStr === origTo ? Boolean(leave.toIsHalfDay) : false;
  const norm = normalizeLeaveBoundaries({
    fromDate,
    toDate,
    isHalfDay: leave.isHalfDay,
    halfDayType: leave.halfDayType,
    fromIsHalfDay,
    fromHalfDayType: fromIsHalfDay ? leave.fromHalfDayType : null,
    toIsHalfDay,
    toHalfDayType: toIsHalfDay ? leave.toHalfDayType : null,
  });
  const numberOfDays = calculateLeaveNumberOfDays(fromDate, toDate, norm);
  return {
    fromDate,
    toDate,
    fromIsHalfDay: norm.fromIsHalfDay,
    fromHalfDayType: norm.fromHalfDayType,
    toIsHalfDay: norm.toIsHalfDay,
    toHalfDayType: norm.toHalfDayType,
    isHalfDay: norm.isHalfDay,
    halfDayType: norm.halfDayType,
    numberOfDays,
  };
}

/** Credit for one calendar day (0.5 or 1) from a per-day or legacy leave entry. */
function leaveDailyCreditUnit(leaveEntry) {
  if (!leaveEntry) return 0;
  if (typeof leaveEntry.segmentDaysOnDate === 'number' && leaveEntry.segmentDaysOnDate > 0) {
    return leaveEntry.segmentDaysOnDate;
  }
  if (leaveEntry.isHalfDay) return 0.5;
  const nd = Number(leaveEntry.numberOfDays);
  if (Number.isFinite(nd) && nd > 0 && nd < 1) return nd;
  return 1;
}

module.exports = {
  istDateStr,
  isSameIstCalendarDay,
  eachDateStrInRange,
  normalizeLeaveBoundaries,
  calculateLeaveNumberOfDays,
  expandLeaveToDailySegments,
  leaveHalfMaskForDate,
  getLeaveCoverageOnDate,
  buildAttendanceLeaveInfoForDate,
  buildLeaveDocumentFieldsForSpan,
  leaveDailyCreditUnit,
  checkDayHalfCoverageConflict,
};
