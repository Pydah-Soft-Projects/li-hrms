/**
 * Punch-based half-day presence from AttendanceDaily.
 * Single-shift PARTIAL:
 * - IN-only → first half
 * - OUT-only (no IN) → second half
 * - IN+OUT → shift segments (if stored), else shift midpoint, else legacy late-in/early-out + punch-gap
 */

const timeToMinsFromDate = (d) => {
  if (!d) return null;
  const dt = d instanceof Date ? d : new Date(d);
  if (Number.isNaN(dt.getTime())) return null;
  return dt.getHours() * 60 + dt.getMinutes();
};

const timeStrToMins = (t) => {
  if (!t || typeof t !== 'string') return null;
  const [h, m] = t.split(':').map(Number);
  if (Number.isNaN(h) || Number.isNaN(m)) return null;
  return h * 60 + m;
};

function dailyHasShiftLevelIn(daily) {
  const shifts = Array.isArray(daily?.shifts) ? daily.shifts : [];
  if (shifts.some((s) => s && s.inTime)) return true;
  return !!daily?.inTime;
}

function dailyHasShiftLevelOut(daily) {
  const shifts = Array.isArray(daily?.shifts) ? daily.shifts : [];
  const shiftOut = shifts.some((s) => {
    if (!s || !s.outTime) return false;
    if (!s.inTime) return true;
    return new Date(s.outTime).getTime() !== new Date(s.inTime).getTime();
  });
  if (shiftOut) return true;
  if (!daily?.outTime) return false;
  if (!daily?.inTime) return true;
  return new Date(daily.outTime).getTime() !== new Date(daily.inTime).getTime();
}

function pickPrimaryShift(daily) {
  const shifts = Array.isArray(daily?.shifts) ? daily.shifts : [];
  if (!shifts.length) return null;
  return shifts.find((s) => s && s.inTime && s.outTime) || shifts.find((s) => s && (s.inTime || s.outTime)) || shifts[0];
}

/**
 * Midpoint-based worked half (same logic as AttendanceDaily pre-save getWorkedHalfFromShifts).
 * @returns {'first_half'|'second_half'|'both'|null}
 */
function getWorkedHalfFromShiftTimes(shifts) {
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

  const inMins = timeToMinsFromDate(shift.inTime);
  if (inMins == null) return null;
  let inOffset = inMins - shiftStartMins;
  if (inOffset < 0) inOffset += 24 * 60;
  if (inOffset > durationMins) inOffset -= 24 * 60;

  let outOffset = null;
  if (shift.outTime) {
    let outMins = timeToMinsFromDate(shift.outTime);
    if (outMins == null) return null;
    if (shiftEndMins > 24 * 60 && outMins < shiftStartMins) outMins += 24 * 60;
    outOffset = outMins - shiftStartMins;
    if (outOffset < 0) outOffset += 24 * 60;
  }

  const workedBeforeMid = inOffset < midOffset;
  const workedAfterMid = outOffset == null ? false : outOffset >= midOffset;
  if (workedBeforeMid && workedAfterMid) return 'both';
  if (workedBeforeMid) return 'first_half';
  if (workedAfterMid) return 'second_half';
  return null;
}

function isFirstHalfSegmentName(name) {
  const n = String(name || '').toLowerCase();
  return n === 'firsthalf' || n === 'first_half';
}

function isSecondHalfSegmentName(name) {
  const n = String(name || '').toLowerCase();
  return n === 'secondhalf' || n === 'second_half';
}

/**
 * Derive worked half from persisted shiftSegments (shift-based detection).
 * @returns {'first_half'|'second_half'|'both'|null}
 */
function getWorkedHalfFromShiftSegments(shiftRow) {
  const segments = Array.isArray(shiftRow?.shiftSegments) ? shiftRow.shiftSegments : [];
  if (!segments.length) return null;

  let firstPresent = false;
  let secondPresent = false;
  for (const seg of segments) {
    if (!seg || !seg.present) continue;
    if (isFirstHalfSegmentName(seg.segmentName)) firstPresent = true;
    if (isSecondHalfSegmentName(seg.segmentName)) secondPresent = true;
  }
  if (firstPresent && secondPresent) return 'both';
  if (firstPresent) return 'first_half';
  if (secondPresent) return 'second_half';
  return null;
}

/**
 * Legacy HALF_DAY detection: early-out vs late-in, then punch-gap vs shift bounds (UI-aligned).
 * @returns {'first_half'|'second_half'|null}
 */
function getWorkedHalfFromLegacyPenalties(daily, shift) {
  const eo = Number(daily?.totalEarlyOutMinutes) || Number(shift?.earlyOutMinutes) || 0;
  const li = Number(daily?.totalLateInMinutes) || Number(shift?.lateInMinutes) || 0;
  if (eo > li) return 'first_half';
  if (li > eo) return 'second_half';

  if (shift?.inTime && shift?.outTime && shift.shiftStartTime && shift.shiftEndTime) {
    const inMins = timeToMinsFromDate(shift.inTime);
    const outMins = timeToMinsFromDate(shift.outTime);
    const startMins = timeStrToMins(shift.shiftStartTime);
    const endMins = timeStrToMins(shift.shiftEndTime);
    if (inMins != null && outMins != null && startMins != null && endMins != null) {
      const inDiff = Math.max(0, inMins - startMins);
      const outDiff = Math.max(0, endMins - outMins);
      if (inDiff > outDiff) return 'second_half';
      if (outDiff > inDiff) return 'first_half';
    }
  }
  return null;
}

/**
 * HALF_DAY: exactly one worked half (never both). Matches attendance UI: early-out vs late-in, then punch-gap.
 * Segment/midpoint may return 'both' when punches span midpoint; that is wrong for HALF_DAY payroll status.
 * @returns {'first_half'|'second_half'}
 */
function resolveHalfDayWorkedHalfKey(daily) {
  const shift = pickPrimaryShift(daily);
  const legacy = getWorkedHalfFromLegacyPenalties(daily, shift);
  if (legacy) return legacy;

  const fromSegments = getWorkedHalfFromShiftSegments(shift);
  if (fromSegments === 'first_half' || fromSegments === 'second_half') return fromSegments;

  const shifts = Array.isArray(daily?.shifts) ? daily.shifts : [];
  const fromMid = getWorkedHalfFromShiftTimes(shifts);
  if (fromMid === 'first_half' || fromMid === 'second_half') return fromMid;

  return 'first_half';
}

/**
 * Resolve which half(s) punches fall into (sync). Order: segments → midpoint → legacy penalties.
 * @returns {'first_half'|'second_half'|'both'|null}
 */
function resolveWorkedHalfKeySync(daily) {
  const shifts = Array.isArray(daily?.shifts) ? daily.shifts : [];
  const shift = pickPrimaryShift(daily);
  if (!shift) return null;

  const fromSegments = getWorkedHalfFromShiftSegments(shift);
  if (fromSegments) return fromSegments;

  const fromMid = getWorkedHalfFromShiftTimes(shifts);
  if (fromMid) return fromMid;

  const fromLegacy = getWorkedHalfFromLegacyPenalties(daily, shift);
  if (fromLegacy) return fromLegacy;

  return null;
}

function halfCreditsFromWorkedKey(key) {
  if (key === 'first_half') return { attFirst: 0.5, attSecond: 0 };
  if (key === 'second_half') return { attFirst: 0, attSecond: 0.5 };
  if (key === 'both') return { attFirst: 0.5, attSecond: 0.5 };
  return { attFirst: 0, attSecond: 0 };
}

/**
 * Load Shift master and run getShiftSegmentAssignment when segments are not on the daily row yet.
 */
async function tryShiftSegmentHalfCreditsFromMaster(shiftRow, dateStr) {
  if (!shiftRow?.shiftId || !shiftRow?.inTime || !dateStr) return null;
  try {
    const Shift = require('../../shifts/model/Shift');
    const { getShiftSegmentAssignment } = require('../../shifts/services/shiftHalfSegmentService');
    const { resolveGraceFromSettings } = require('../services/shiftSegmentAttendanceService');
    const shiftId = shiftRow.shiftId?._id || shiftRow.shiftId;
    const shiftDoc = await Shift.findById(shiftId)
      .select('startTime endTime firstHalf secondHalf break gracePeriod payableShifts')
      .lean();
    if (!shiftDoc?.firstHalf && !shiftDoc?.secondHalf) return null;

    const graceOpts = await resolveGraceFromSettings();
    const inTime = new Date(shiftRow.inTime);
    const outTime = shiftRow.outTime ? new Date(shiftRow.outTime) : null;
    const seg = getShiftSegmentAssignment(shiftDoc, dateStr, inTime, outTime, graceOpts);
    return getWorkedHalfFromShiftSegments({ shiftSegments: seg.shiftSegments || [] });
  } catch {
    return null;
  }
}

/**
 * Single-shift PARTIAL / incomplete punch half credits.
 * @returns {{ attFirst: number, attSecond: number }}
 */
function partialSingleShiftHalfCredits(daily) {
  const hasIn = dailyHasShiftLevelIn(daily);
  const hasOut = dailyHasShiftLevelOut(daily);
  if (hasIn && !hasOut) return { attFirst: 0.5, attSecond: 0 };
  if (hasOut && !hasIn) return { attFirst: 0, attSecond: 0.5 };
  if (!hasIn && !hasOut) return { attFirst: 0, attSecond: 0 };

  const key = resolveWorkedHalfKeySync(daily);
  const credits = halfCreditsFromWorkedKey(key);
  if (credits.attFirst + credits.attSecond >= 0.5 - 1e-6) return credits;
  return { attFirst: 0, attSecond: 0 };
}

/**
 * Async variant: falls back to Shift master segment assignment when sync detection yields no half.
 */
async function partialSingleShiftHalfCreditsAsync(daily, dateStr) {
  const sync = partialSingleShiftHalfCredits(daily);
  const hasIn = dailyHasShiftLevelIn(daily);
  const hasOut = dailyHasShiftLevelOut(daily);
  if (!hasIn || !hasOut || sync.attFirst + sync.attSecond >= 0.5 - 1e-6) {
    return sync;
  }
  const shift = pickPrimaryShift(daily);
  const key = await tryShiftSegmentHalfCreditsFromMaster(shift, dateStr);
  if (key) return halfCreditsFromWorkedKey(key);
  return sync;
}

/**
 * Raw attendance half credits (aligned with summaryCalculationService before OD "dayPresent" net).
 * @param {object} daily - AttendanceDaily lean doc
 * @param {Array} ods - approved OD lean docs for that calendar day
 * @param {{ processingMode?: 'single_shift'|'multi_shift', dateStr?: string }} [options]
 * @returns {Promise<{ attFirst: number, attSecond: number }>|{ attFirst: number, attSecond: number }}
 */
async function computeRawAttendanceHalfCredits(daily, ods, options = {}) {
  let attFirst = 0;
  let attSecond = 0;
  if (!daily) return { attFirst, attSecond };

  const st = String(daily.status || '').toUpperCase();
  if (st === 'HOLIDAY' || st === 'WEEK_OFF') {
    return { attFirst, attSecond };
  }

  const dayOds = Array.isArray(ods) ? ods : [];
  if (st === 'PRESENT') {
    attFirst = 0.5;
    attSecond = 0.5;
  } else if (st === 'HALF_DAY') {
    const credits = halfCreditsFromWorkedKey(resolveHalfDayWorkedHalfKey(daily));
    attFirst = credits.attFirst;
    attSecond = credits.attSecond;
  } else if (st === 'PARTIAL' && options.processingMode === 'single_shift') {
    const dateStr = options.dateStr || daily.date || null;
    const partial =
      dateStr && dailyHasShiftLevelIn(daily) && dailyHasShiftLevelOut(daily)
        ? await partialSingleShiftHalfCreditsAsync(daily, dateStr)
        : partialSingleShiftHalfCredits(daily);
    attFirst = partial.attFirst;
    attSecond = partial.attSecond;
  } else if (st === 'OD' && dayOds.length > 0) {
    const halfOd = dayOds.find(
      (o) =>
        o &&
        o.isHalfDay &&
        o.odType_extended === 'half_day' &&
        (o.halfDayType === 'first_half' || o.halfDayType === 'second_half')
    );
    if (halfOd) {
      const hasIn = dailyHasShiftLevelIn(daily);
      const hasOut = dailyHasShiftLevelOut(daily);
      if (halfOd.halfDayType === 'second_half' && hasIn) attFirst = 0.5;
      else if (halfOd.halfDayType === 'first_half' && hasOut) attSecond = 0.5;
    }
  }

  return { attFirst, attSecond };
}

/**
 * Sync entry for monthly summary (no Shift DB load).
 */
function computeRawAttendanceHalfCreditsSync(daily, ods, options = {}) {
  let attFirst = 0;
  let attSecond = 0;
  if (!daily) return { attFirst, attSecond };

  const st = String(daily.status || '').toUpperCase();
  if (st === 'HOLIDAY' || st === 'WEEK_OFF') return { attFirst, attSecond };

  const dayOds = Array.isArray(ods) ? ods : [];
  if (st === 'PRESENT') {
    return { attFirst: 0.5, attSecond: 0.5 };
  }
  if (st === 'HALF_DAY') {
    return halfCreditsFromWorkedKey(resolveHalfDayWorkedHalfKey(daily));
  }
  if (st === 'PARTIAL' && options.processingMode === 'single_shift') {
    return partialSingleShiftHalfCredits(daily);
  }
  if (st === 'OD' && dayOds.length > 0) {
    const halfOd = dayOds.find(
      (o) =>
        o &&
        o.isHalfDay &&
        o.odType_extended === 'half_day' &&
        (o.halfDayType === 'first_half' || o.halfDayType === 'second_half')
    );
    if (halfOd) {
      const hasIn = dailyHasShiftLevelIn(daily);
      const hasOut = dailyHasShiftLevelOut(daily);
      if (halfOd.halfDayType === 'second_half' && hasIn) attFirst = 0.5;
      else if (halfOd.halfDayType === 'first_half' && hasOut) attSecond = 0.5;
    }
  }
  return { attFirst, attSecond };
}

/**
 * Boolean half flags for apply-time guards (leave/OD UI).
 */
function attendanceHalfPresenceFlags(daily, processingMode) {
  if (!daily) return { attFirst: false, attSecond: false };
  const { attFirst, attSecond } = computeRawAttendanceHalfCreditsSync(daily, [], { processingMode });
  return {
    attFirst: attFirst >= 0.5 - 1e-6,
    attSecond: attSecond >= 0.5 - 1e-6,
  };
}

module.exports = {
  dailyHasShiftLevelIn,
  dailyHasShiftLevelOut,
  pickPrimaryShift,
  getWorkedHalfFromShiftTimes,
  getWorkedHalfFromShiftSegments,
  getWorkedHalfFromLegacyPenalties,
  resolveHalfDayWorkedHalfKey,
  resolveWorkedHalfKeySync,
  partialSingleShiftHalfCredits,
  partialSingleShiftHalfCreditsAsync,
  computeRawAttendanceHalfCredits,
  computeRawAttendanceHalfCreditsSync,
  attendanceHalfPresenceFlags,
};
