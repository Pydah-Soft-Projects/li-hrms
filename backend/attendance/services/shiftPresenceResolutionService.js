/**
 * Unified shift presence resolution (per shift row):
 *   1) Shift-level hours (clipped punch + OD + edge permission) ≥ 75% or shift min → PRESENT, both halves present
 *   2) Edge permissions (late-in / early-out only — applied before re-check in step 1)
 *   3) Half-segment break-aware fallback when shift-level present is not met
 */

const Shift = require('../../shifts/model/Shift');
const {
  getShiftSegmentAssignment,
  buildShiftSegmentTimeline,
  calculateSegmentLateIn,
  calculateSegmentEarlyOut,
  getEffectiveGrace,
} = require('../../shifts/services/shiftHalfSegmentService');
const { applyShiftSegmentOverride } = require('../../shared/utils/shiftSegmentOverrides');
const { createISTDate, extractISTComponents } = require('../../shared/utils/dateUtils');

/** Shift-level present when effective hours reach this fraction of expected shift duration */
const SHIFT_PRESENT_THRESHOLD = 0.75;

function timeToMinutes(timeStr) {
  if (!timeStr || typeof timeStr !== 'string') return null;
  const [h, m] = timeStr.split(':').map(Number);
  if (Number.isNaN(h) || Number.isNaN(m)) return null;
  return h * 60 + m;
}

function shiftIsOvernight(startTime, endTime) {
  const s = timeToMinutes(startTime);
  const e = timeToMinutes(endTime);
  return s != null && e != null && e <= s;
}

function getWorkedHalfFromInThumbOnlyLocal(inTime, startStr, endStr) {
  if (!inTime || !startStr || !endStr) return 'first_half';
  const startMins = timeToMinutes(startStr);
  const endMins = timeToMinutes(endStr);
  if (startMins == null || endMins == null) return 'first_half';

  const inMins = inTime.getHours() * 60 + inTime.getMinutes();

  let shiftEndMins = endMins;
  if (shiftEndMins <= startMins) shiftEndMins += 24 * 60;
  const durationMins = shiftEndMins - startMins;
  if (durationMins <= 0) return 'first_half';

  const midOffset = durationMins / 2;
  let inOffset = inMins - startMins;
  if (inOffset < 0) inOffset += 24 * 60;
  if (inOffset > durationMins) inOffset -= 24 * 60;

  return inOffset < midOffset ? 'first_half' : 'second_half';
}


/**
 * Punch hours clipped to the assigned shift window (same basis as legacy statusDuration).
 */
function computeClippedPunchHours(pShift, dateStr) {
  if (!pShift?.inTime || !pShift?.outTime) return 0;

  const punchIn = pShift.inTime instanceof Date ? pShift.inTime : new Date(pShift.inTime);
  const punchOut = pShift.outTime instanceof Date ? pShift.outTime : new Date(pShift.outTime);
  if (Number.isNaN(punchIn.getTime()) || Number.isNaN(punchOut.getTime())) return 0;

  if (!pShift.shiftStartTime) {
    return Math.max(0, (punchOut - punchIn) / 3600000);
  }

  const overnight = shiftIsOvernight(pShift.shiftStartTime, pShift.shiftEndTime);
  const shiftStart = createISTDate(dateStr, pShift.shiftStartTime);
  let shiftEnd = createISTDate(dateStr, pShift.shiftEndTime);
  if (overnight) {
    shiftEnd = new Date(shiftEnd.getTime() + 24 * 60 * 60 * 1000);
  }

  const effectiveIn = new Date(Math.max(punchIn.getTime(), shiftStart.getTime()));
  const effectiveOut = punchOut;
  return Math.max(0, (effectiveOut - effectiveIn) / 3600000);
}

/**
 * Hours used for shift-level present gate: clipped punch + OD + edge permission credit.
 */
function computeStatusDurationHours(pShift, dateStr) {
  const clipped = computeClippedPunchHours(pShift, dateStr);
  const od = Number(pShift.odHours) || 0;
  const edge = Number(pShift.edgePermissionHours) || 0;
  return Math.round((clipped + od + edge) * 100) / 100;
}

function resolveExpectedHours(pShift, shiftDoc) {
  const fromShift = Number(shiftDoc?.duration);
  if (Number.isFinite(fromShift) && fromShift > 0) return fromShift;
  const fromRow = Number(pShift?.expectedHours);
  if (Number.isFinite(fromRow) && fromRow > 0) return fromRow;
  return 8;
}

function resolveShiftMinDurationHours(shiftDoc) {
  const v = Number(shiftDoc?.minDuration);
  return Number.isFinite(v) && v > 0 ? v : null;
}

/**
 * @returns {boolean} true when shift-level present threshold is met
 */
function meetsShiftLevelPresent(statusDurationHours, expectedHours, shiftMinDurationHours = null) {
  const duration = Number(statusDurationHours) || 0;
  const expected = Number(expectedHours) || 8;
  if (duration >= expected * SHIFT_PRESENT_THRESHOLD) return true;
  if (shiftMinDurationHours != null && shiftMinDurationHours > 0 && duration >= shiftMinDurationHours) {
    return true;
  }
  return false;
}

function shiftHasHalfSegments(shiftDoc) {
  return Boolean(
    shiftDoc
    && shiftDoc.firstHalf?.startTime
    && shiftDoc.firstHalf?.endTime
    && shiftDoc.secondHalf?.startTime
    && shiftDoc.secondHalf?.endTime
  );
}

/**
 * Build segment rows with both halves marked present (shift-level full day).
 */
function buildBothHalvesPresentSegments(shiftDoc, dateStr, inTime, outTime, graceOpts = {}, shiftGrace = 15) {
  const timeline = buildShiftSegmentTimeline(shiftDoc, dateStr);
  if (!timeline.firstHalf || !timeline.secondHalf) return [];

  const globalLateInGrace = graceOpts.globalLateInGrace ?? null;
  const globalEarlyOutGrace = graceOpts.globalEarlyOutGrace ?? null;

  return timeline.segments.map((segment) => {
    const lateInMinutes = inTime
      ? calculateSegmentLateIn(segment, inTime, globalLateInGrace, shiftGrace)
      : null;
    const earlyOutMinutes = outTime
      ? calculateSegmentEarlyOut(segment, outTime, globalEarlyOutGrace, shiftGrace)
      : null;

    return {
      segmentName: segment.segmentName,
      startTime: segment.startTime,
      endTime: segment.endTime,
      duration: segment.duration,
      minDuration: segment.minDuration,
      gracePeriod: segment.gracePeriod,
      effectiveGrace: getEffectiveGrace(
        segment.gracePeriod,
        globalLateInGrace ?? globalEarlyOutGrace,
        shiftGrace
      ),
      payableShifts: segment.payableShifts,
      present: true,
      lateInMinutes: lateInMinutes !== null ? Math.max(0, lateInMinutes) : null,
      earlyOutMinutes: earlyOutMinutes !== null ? Math.max(0, earlyOutMinutes) : null,
      isLateIn: lateInMinutes > 0,
      isEarlyOut: earlyOutMinutes > 0,
      overlapMinutes: inTime && outTime && segment.range
        ? Math.max(
          0,
          Math.round(
            (Math.min(outTime.getTime(), segment.range.endDate.getTime())
              - Math.max(inTime.getTime(), segment.range.startDate.getTime()))
            / 60000
          )
        )
        : 0,
    };
  });
}

function applyStatusAndPayableFromResolution(pShift, {
  status,
  payableShift,
  shiftSegments,
  segmentContinuityWarnings,
  resolutionPath,
}) {
  pShift.status = status;
  pShift.payableShift = payableShift;
  if (Array.isArray(shiftSegments)) {
    pShift.shiftSegments = shiftSegments;
  }
  if (segmentContinuityWarnings) {
    pShift.segmentContinuityWarnings = segmentContinuityWarnings;
  }
  pShift.presenceResolutionPath = resolutionPath;
  return pShift;
}

function applySegmentFallbackStatus(pShift, segmentResult, basePayable) {
  const segments = segmentResult?.shiftSegments || [];
  const segmentPayable = segments.reduce(
    (sum, seg) => sum + (seg.present ? (Number(seg.payableShifts) || 0) : 0),
    0
  );

  let status = 'ABSENT';
  let payableShift = 0;

  if (segmentPayable >= 1) {
    status = 'PRESENT';
    payableShift = segmentPayable * basePayable;
  } else if (segmentPayable === 0.5) {
    status = 'HALF_DAY';
    payableShift = segmentPayable * basePayable;
    pShift.earlyOutMinutes = null;
    pShift.isEarlyOut = false;
  } else if (segmentPayable > 0 && segmentPayable < 0.5) {
    status = 'PARTIAL';
    payableShift = segmentPayable * basePayable;
  }

  return applyStatusAndPayableFromResolution(pShift, {
    status,
    payableShift,
    shiftSegments: segments,
    segmentContinuityWarnings: segmentResult?.continuityWarnings || [],
    resolutionPath: 'half_segment',
  });
}

function applyShiftLevelPresent(pShift, shiftDoc, dateStr, inTime, outTime, graceOpts, basePayable, resolutionPath) {
  const segments = buildBothHalvesPresentSegments(
    shiftDoc,
    dateStr,
    inTime,
    outTime,
    graceOpts,
    shiftDoc.gracePeriod ?? 15
  );

  return applyStatusAndPayableFromResolution(pShift, {
    status: 'PRESENT',
    payableShift: basePayable,
    shiftSegments: segments,
    segmentContinuityWarnings: [],
    resolutionPath,
  });
}

function applyDurationOnlyPresent(pShift, basePayable, resolutionPath) {
  pShift.shiftSegments = [];
  return applyStatusAndPayableFromResolution(pShift, {
    status: 'PRESENT',
    payableShift: basePayable,
    shiftSegments: [],
    resolutionPath,
  });
}

async function loadEffectiveShiftDoc(pShift, divisionId) {
  if (!pShift?.shiftId) return null;
  const shiftDoc = await Shift.findById(pShift.shiftId).lean();
  if (!shiftDoc) return null;
  return applyShiftSegmentOverride(shiftDoc, divisionId || null);
}

/**
 * Main resolver — mutates and returns pShift.
 */
async function resolveShiftPresence({
  pShift,
  dateStr,
  employeeNumber,
  graceOpts = {},
  shiftDoc = null,
  divisionId = null,
  applyEdgePermissions = true,
}) {
  if (!pShift?.inTime || !pShift?.outTime) {
    return pShift;
  }

  const date = dateStr || extractISTComponents(pShift.inTime).dateStr;
  const basePayable = pShift.basePayable ?? 1;
  const inTime = pShift.inTime instanceof Date ? pShift.inTime : new Date(pShift.inTime);
  const outTime = pShift.outTime instanceof Date ? pShift.outTime : new Date(pShift.outTime);

  const effectiveShiftDoc = shiftDoc || (await loadEffectiveShiftDoc(pShift, divisionId));
  const expectedHours = resolveExpectedHours(pShift, effectiveShiftDoc);
  const shiftMinDuration = resolveShiftMinDurationHours(effectiveShiftDoc);
  pShift.expectedHours = expectedHours;

  const hasHalves = shiftHasHalfSegments(effectiveShiftDoc);

  // Step 1 — shift-level (punch + OD, no edge permission yet)
  let statusDuration = computeStatusDurationHours(pShift, date);
  if (meetsShiftLevelPresent(statusDuration, expectedHours, shiftMinDuration)) {
    if (hasHalves) {
      return applyShiftLevelPresent(pShift, effectiveShiftDoc, date, inTime, outTime, graceOpts, basePayable, 'shift_level');
    }
    return applyDurationOnlyPresent(pShift, basePayable, 'shift_level');
  }

  // Step 2 — late-in / early-out edge permissions only (never for short middle-of-day hours)
  if (applyEdgePermissions && employeeNumber) {
    const { applyEdgePermissionAdjustmentsToShiftSegment } = require('../../permissions/services/permissionEdgeAttendanceService');
    await applyEdgePermissionAdjustmentsToShiftSegment({
      employeeNumber,
      date,
      pShift,
      globalGrace: graceOpts.globalLateInGrace ?? graceOpts.globalEarlyOutGrace ?? 0,
    });
    statusDuration = computeStatusDurationHours(pShift, date);
    if (meetsShiftLevelPresent(statusDuration, expectedHours, shiftMinDuration)) {
      if (hasHalves) {
        return applyShiftLevelPresent(
          pShift,
          effectiveShiftDoc,
          date,
          inTime,
          outTime,
          graceOpts,
          basePayable,
          'shift_level_with_edge_permission'
        );
      }
      return applyDurationOnlyPresent(pShift, basePayable, 'shift_level_with_edge_permission');
    }
  }

  // Step 3 — half-segment break-aware fallback
  if (hasHalves && effectiveShiftDoc) {
    const segmentResult = getShiftSegmentAssignment(effectiveShiftDoc, date, inTime, outTime, graceOpts);
    return applySegmentFallbackStatus(pShift, segmentResult, basePayable);
  }

  // No half segments on shift master — fallback to percentage/thumb check
  const PARTIAL_IN_OUT_HALF_DAY_HOURS_RATIO_MIN = 0.4;
  if (statusDuration >= expectedHours * PARTIAL_IN_OUT_HALF_DAY_HOURS_RATIO_MIN) {
    const startStr = pShift.shiftStartTime || effectiveShiftDoc?.startTime || '09:00';
    const endStr = pShift.shiftEndTime || effectiveShiftDoc?.endTime || '18:00';
    const workedHalfKey = getWorkedHalfFromInThumbOnlyLocal(inTime, startStr, endStr);

    const startMins = timeToMinutes(startStr);
    const endMins = timeToMinutes(endStr);
    let shiftEndMins = endMins;
    if (shiftEndMins <= startMins) shiftEndMins += 24 * 60;
    const durationMins = shiftEndMins - startMins;
    const midMins = (startMins + durationMins / 2) % (24 * 60);

    const formatMins = (m) => {
      const h = Math.floor(m / 60) % 24;
      const mins = Math.floor(m % 60);
      return `${String(h).padStart(2, '0')}:${String(mins).padStart(2, '0')}`;
    };

    const midTimeStr = formatMins(midMins);
    const graceVal = pShift.gracePeriod || effectiveShiftDoc?.gracePeriod || 15;

    const segments = [
      {
        segmentName: 'firstHalf',
        startTime: startStr,
        endTime: midTimeStr,
        duration: (durationMins / 2) / 60,
        minDuration: null,
        gracePeriod: graceVal,
        payableShifts: 0.5,
        present: workedHalfKey === 'first_half',
        lateInMinutes: workedHalfKey === 'first_half' ? pShift.lateInMinutes || 0 : null,
        earlyOutMinutes: workedHalfKey === 'first_half' ? pShift.earlyOutMinutes || 0 : null,
        isLateIn: workedHalfKey === 'first_half' && (pShift.lateInMinutes || 0) > 0,
        isEarlyOut: workedHalfKey === 'first_half' && (pShift.earlyOutMinutes || 0) > 0,
        overlapMinutes: workedHalfKey === 'first_half' ? Math.round(statusDuration * 60) : 0,
      },
      {
        segmentName: 'secondHalf',
        startTime: midTimeStr,
        endTime: endStr,
        duration: (durationMins / 2) / 60,
        minDuration: null,
        gracePeriod: graceVal,
        payableShifts: 0.5,
        present: workedHalfKey === 'second_half',
        lateInMinutes: workedHalfKey === 'second_half' ? pShift.lateInMinutes || 0 : null,
        earlyOutMinutes: workedHalfKey === 'second_half' ? pShift.earlyOutMinutes || 0 : null,
        isLateIn: workedHalfKey === 'second_half' && (pShift.lateInMinutes || 0) > 0,
        isEarlyOut: workedHalfKey === 'second_half' && (pShift.earlyOutMinutes || 0) > 0,
        overlapMinutes: workedHalfKey === 'second_half' ? Math.round(statusDuration * 60) : 0,
      }
    ];

    return applyStatusAndPayableFromResolution(pShift, {
      status: 'HALF_DAY',
      payableShift: 0.5 * basePayable,
      shiftSegments: segments,
      resolutionPath: 'duration_half_day_fallback',
    });
  }

  // No half segments on shift master — duration-only absent
  pShift.shiftSegments = [];
  return applyStatusAndPayableFromResolution(pShift, {
    status: 'ABSENT',
    payableShift: 0,
    shiftSegments: [],
    resolutionPath: 'duration_absent',
  });
}

/**
 * After async auto-permission refresh: if shift is now present at shift level, sync both halves.
 */
async function syncBothHalvesIfShiftLevelPresent(pShift, dateStr, graceOpts = {}, divisionId = null) {
  if (!pShift?.shiftId || pShift.status !== 'PRESENT') return pShift;

  const effectiveShiftDoc = await loadEffectiveShiftDoc(pShift, divisionId);
  if (!shiftHasHalfSegments(effectiveShiftDoc)) return pShift;

  const date = dateStr || extractISTComponents(pShift.inTime).dateStr;
  const inTime = pShift.inTime instanceof Date ? pShift.inTime : new Date(pShift.inTime);
  const outTime = pShift.outTime ? (pShift.outTime instanceof Date ? pShift.outTime : new Date(pShift.outTime)) : null;
  if (!outTime) return pShift;

  const segments = buildBothHalvesPresentSegments(
    effectiveShiftDoc,
    date,
    inTime,
    outTime,
    graceOpts,
    effectiveShiftDoc.gracePeriod ?? 15
  );
  pShift.shiftSegments = segments;
  pShift.presenceResolutionPath = pShift.presenceResolutionPath || 'shift_level_with_edge_permission';
  return pShift;
}

module.exports = {
  SHIFT_PRESENT_THRESHOLD,
  computeClippedPunchHours,
  computeStatusDurationHours,
  meetsShiftLevelPresent,
  resolveExpectedHours,
  shiftHasHalfSegments,
  buildBothHalvesPresentSegments,
  resolveShiftPresence,
  syncBothHalvesIfShiftLevelPresent,
  loadEffectiveShiftDoc,
};
