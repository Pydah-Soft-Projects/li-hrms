/**
 * Regular OD duration classification (not hours / not CO).
 * Compare evidence IN→OUT duration to rostered shift (half segments or 75%/40%).
 */

const PreScheduledShift = require('../../shifts/model/PreScheduledShift');
const AttendanceDaily = require('../../attendance/model/AttendanceDaily');
const { shiftHasHalfSegments } = require('../../attendance/services/shiftPresenceResolutionService');

/** Same as attendance shift-level present threshold */
const FULL_DAY_RATIO = 0.75;
/** Same as attendance partial IN+OUT half-day hours ratio */
const HALF_DAY_RATIO = 0.4;

/**
 * Parse EXIF / ISO / Date into a Date, or null.
 * @param {unknown} value
 * @returns {Date|null}
 */
function parseEvidenceInstant(value) {
  if (value == null || value === '') return null;
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  const raw = String(value).trim();
  if (!raw) return null;
  // EXIF often: "2026:07:25 09:30:00"
  const exifLike = raw.match(
    /^(\d{4}):(\d{2}):(\d{2})[ T](\d{2}):(\d{2}):(\d{2})/
  );
  if (exifLike) {
    const [, y, mo, d, h, mi, s] = exifLike;
    const dt = new Date(
      Number(y),
      Number(mo) - 1,
      Number(d),
      Number(h),
      Number(mi),
      Number(s)
    );
    return Number.isNaN(dt.getTime()) ? null : dt;
  }
  const dt = new Date(raw);
  return Number.isNaN(dt.getTime()) ? null : dt;
}

/**
 * Prefer EXIF datetime, else submittedAt, else geo capturedAt.
 * @param {{ exifDateTime?: unknown, submittedAt?: unknown, geoLocation?: { capturedAt?: unknown } }|null|undefined} evidence
 * @returns {{ instant: Date|null, source: 'exif'|'submittedAt'|'capturedAt'|'none' }}
 */
function resolveEvidenceInstant(evidence) {
  if (!evidence) return { instant: null, source: 'none' };
  const fromExif = parseEvidenceInstant(evidence.exifDateTime);
  if (fromExif) return { instant: fromExif, source: 'exif' };
  const fromSubmitted = parseEvidenceInstant(evidence.submittedAt);
  if (fromSubmitted) return { instant: fromSubmitted, source: 'submittedAt' };
  const fromCaptured = parseEvidenceInstant(evidence.geoLocation?.capturedAt);
  if (fromCaptured) return { instant: fromCaptured, source: 'capturedAt' };
  return { instant: null, source: 'none' };
}

/**
 * @param {Date|null} start
 * @param {Date|null} end
 * @returns {number|null} minutes
 */
function durationMinutesBetween(start, end) {
  if (!start || !end) return null;
  const mins = Math.round((end.getTime() - start.getTime()) / 60000);
  return Number.isFinite(mins) ? Math.max(0, mins) : null;
}

/**
 * Shift duration in minutes from startTime/endTime strings (HH:mm).
 * @param {string} startTime
 * @param {string} endTime
 * @returns {number|null}
 */
function shiftWindowMinutes(startTime, endTime) {
  if (!startTime || !endTime) return null;
  const [sh, sm] = String(startTime).split(':').map(Number);
  const [eh, em] = String(endTime).split(':').map(Number);
  if ([sh, sm, eh, em].some((n) => Number.isNaN(n))) return null;
  let start = sh * 60 + sm;
  let end = eh * 60 + em;
  if (end <= start) end += 24 * 60;
  return end - start;
}

/**
 * Half segment minimum minutes (prefer minDuration hours, else segment duration).
 * @param {{ minDuration?: number, duration?: number, startTime?: string, endTime?: string }|null|undefined} segment
 * @returns {number|null}
 */
function halfMinMinutes(segment) {
  if (!segment) return null;
  if (segment.minDuration != null && Number(segment.minDuration) > 0) {
    return Math.round(Number(segment.minDuration) * 60);
  }
  if (segment.duration != null && Number(segment.duration) > 0) {
    return Math.round(Number(segment.duration) * 60);
  }
  return shiftWindowMinutes(segment.startTime, segment.endTime);
}

/**
 * Which half the evidence window aligns with (overlap / late-in vs early-out).
 * @param {object} shiftDoc
 * @param {Date} startInstant
 * @param {Date} endInstant
 * @returns {'first_half'|'second_half'|null}
 */
function inferHalfFromEvidenceWindow(shiftDoc, startInstant, endInstant) {
  if (!shiftDoc?.startTime || !shiftDoc?.endTime || !startInstant) return null;
  const fullMins = shiftWindowMinutes(shiftDoc.startTime, shiftDoc.endTime);
  if (!fullMins) return null;

  const [sh, sm] = String(shiftDoc.startTime).split(':').map(Number);
  const shiftStartMins = sh * 60 + sm;
  const midOffset = fullMins / 2;

  const inMins = startInstant.getHours() * 60 + startInstant.getMinutes();
  let inOffset = inMins - shiftStartMins;
  if (inOffset < 0) inOffset += 24 * 60;
  if (inOffset > fullMins) inOffset -= 24 * 60;

  // Late-in vs early-out style: if IN is in second half of window → second_half
  if (inOffset >= midOffset) return 'second_half';

  if (endInstant) {
    const outMins = endInstant.getHours() * 60 + endInstant.getMinutes();
    let outOffset = outMins - shiftStartMins;
    if (outOffset < 0) outOffset += 24 * 60;
    // Left early from first half only
    if (outOffset <= midOffset) return 'first_half';
  }
  return 'first_half';
}

/**
 * Pure classification given shift doc + duration (no DB).
 * @param {object} params
 * @returns {object}
 */
function classifyOdDuration({
  evidenceDurationMinutes,
  shiftDoc,
  startInstant = null,
  endInstant = null,
  skipReason = null,
}) {
  const durationMins =
    evidenceDurationMinutes == null || !Number.isFinite(Number(evidenceDurationMinutes))
      ? null
      : Math.max(0, Math.round(Number(evidenceDurationMinutes)));

  const base = {
    classification: 'authority_required',
    odType_extended: 'half_day',
    isHalfDay: true,
    halfDayType: 'first_half',
    requiresAuthorityDecision: true,
    tentative: true,
    evidenceDurationMinutes: durationMins,
    shiftDurationMinutes: null,
    halfDayMinimumMinutes: null,
    fullDayMinimumMinutes: null,
    reason: skipReason || 'below_half_day_threshold',
    employeeMessage: '',
    usedHalfSegments: false,
  };

  if (skipReason) {
    return {
      ...base,
      reason: skipReason,
      employeeMessage:
        'This OD could not be auto-classified against your shift roster (no working shift / week-off / holiday). ' +
        'A tentative half-day OD will be placed. Your approver must confirm half day or full day. ' +
        'Please discuss with your higher authority before/while submitting.',
    };
  }

  if (durationMins == null) {
    return {
      ...base,
      reason: 'missing_duration',
      employeeMessage:
        'OD photo timing could not be determined. A tentative half-day OD will be placed for higher-authority confirmation.',
    };
  }

  if (!shiftDoc || !shiftDoc.startTime || !shiftDoc.endTime) {
    return {
      ...base,
      reason: 'no_shift',
      employeeMessage:
        'No rostered working shift found for this day. A tentative half-day OD will be placed. ' +
        'Your approver must confirm half day or full day.',
    };
  }

  const shiftMins = shiftWindowMinutes(shiftDoc.startTime, shiftDoc.endTime);
  if (!shiftMins || shiftMins <= 0) {
    return {
      ...base,
      reason: 'invalid_shift',
      shiftDurationMinutes: shiftMins,
      employeeMessage:
        'Shift timing is invalid for classification. A tentative half-day OD will be placed for higher-authority confirmation.',
    };
  }

  const fullMin = Math.round(shiftMins * FULL_DAY_RATIO);
  const halfMinFallback = Math.round(shiftMins * HALF_DAY_RATIO);
  const hasHalves = shiftHasHalfSegments(shiftDoc);

  let halfMin = halfMinFallback;
  let usedHalfSegments = false;
  if (hasHalves) {
    const firstMin = halfMinMinutes(shiftDoc.firstHalf);
    const secondMin = halfMinMinutes(shiftDoc.secondHalf);
    const mins = [firstMin, secondMin].filter((n) => n != null && n > 0);
    if (mins.length) {
      halfMin = Math.min(...mins);
      usedHalfSegments = true;
    }
  }

  const resultBase = {
    ...base,
    shiftDurationMinutes: shiftMins,
    halfDayMinimumMinutes: halfMin,
    fullDayMinimumMinutes: fullMin,
    usedHalfSegments,
    tentative: false,
    requiresAuthorityDecision: false,
  };

  if (durationMins >= fullMin) {
    return {
      ...resultBase,
      classification: 'full_day',
      odType_extended: 'full_day',
      isHalfDay: false,
      halfDayType: null,
      reason: usedHalfSegments ? 'met_full_day_vs_shift' : 'met_full_day_ratio_75',
      employeeMessage: '',
    };
  }

  if (durationMins >= halfMin) {
    let halfDayType = 'first_half';
    if (hasHalves && startInstant) {
      // Prefer which half window the evidence overlaps more via IN position
      halfDayType = inferHalfFromEvidenceWindow(shiftDoc, startInstant, endInstant) || 'first_half';
      const firstMin = halfMinMinutes(shiftDoc.firstHalf) || halfMin;
      const secondMin = halfMinMinutes(shiftDoc.secondHalf) || halfMin;
      // If duration only meets one half's min, prefer that half
      if (durationMins >= firstMin && durationMins < secondMin) halfDayType = 'first_half';
      else if (durationMins >= secondMin && durationMins < firstMin) halfDayType = 'second_half';
    } else {
      halfDayType = inferHalfFromEvidenceWindow(shiftDoc, startInstant, endInstant) || 'first_half';
    }
    return {
      ...resultBase,
      classification: 'half_day',
      odType_extended: 'half_day',
      isHalfDay: true,
      halfDayType,
      reason: usedHalfSegments ? 'met_half_segment_min' : 'met_half_day_ratio_40',
      employeeMessage: '',
    };
  }

  return {
    ...resultBase,
    classification: 'shortfall',
    odType_extended: 'half_day',
    isHalfDay: true,
    halfDayType: 'first_half',
    requiresAuthorityDecision: true,
    tentative: true,
    reason: 'below_half_day_threshold',
    employeeMessage:
      `This OD duration (${formatMinutes(durationMins)}) is below the half-day minimum ` +
      `(${formatMinutes(halfMin)}) for your assigned shift. It is not auto-eligible for half day. ` +
      `You may still submit for higher-authority review — please discuss with your approver. ` +
      `A tentative half-day OD will be placed; your approver must confirm half day or full day.`,
  };
}

function formatMinutes(mins) {
  const m = Math.max(0, Math.round(Number(mins) || 0));
  const h = Math.floor(m / 60);
  const rem = m % 60;
  if (h <= 0) return `${rem} min`;
  if (rem === 0) return `${h}h`;
  return `${h}h ${rem}m`;
}

/**
 * Load rostered shift for emp/date. Returns skipReason when authority path should be forced.
 * @param {string} empNo
 * @param {string} dateStr YYYY-MM-DD
 */
async function loadRosterShiftForOdDay(empNo, dateStr) {
  const emp = String(empNo || '').trim();
  if (!emp || !dateStr) {
    return { shiftDoc: null, roster: null, skipReason: 'no_roster' };
  }
  const empNos = [...new Set([emp, emp.toUpperCase(), emp.toLowerCase()].filter(Boolean))];
  const roster = await PreScheduledShift.findOne({
    employeeNumber: { $in: empNos },
    date: dateStr,
  })
    .populate('shiftId')
    .populate('actualShiftId')
    .lean();

  if (!roster) {
    return { shiftDoc: null, roster: null, skipReason: 'no_roster' };
  }

  const status = String(roster.status || '').toUpperCase();
  if (status === 'WO' || status === 'HOL') {
    return { shiftDoc: null, roster, skipReason: status === 'WO' ? 'week_off' : 'holiday' };
  }

  const shiftDoc = roster.actualShiftId || roster.shiftId || null;
  if (!shiftDoc || !shiftDoc.startTime || !shiftDoc.endTime) {
    return { shiftDoc: null, roster, skipReason: 'no_shift' };
  }

  return { shiftDoc, roster, skipReason: null };
}

/**
 * Query AttendanceDaily for employee date to extract IN/OUT punch instants and total worked minutes.
 * @param {string} empNo
 * @param {string} dateStr YYYY-MM-DD
 */
async function getAttendancePunchesForDate(empNo, dateStr) {
  const emp = String(empNo || '').trim();
  if (!emp || !dateStr) return null;
  const empNos = [...new Set([emp, emp.toUpperCase(), emp.toLowerCase()].filter(Boolean))];
  const record = await AttendanceDaily.findOne({
    employeeNumber: { $in: empNos },
    date: dateStr,
  }).lean();
  if (!record) return null;

  let firstIn = record.inTime ? parseEvidenceInstant(record.inTime) : null;
  let lastOut = record.outTime ? parseEvidenceInstant(record.outTime) : null;

  if (Array.isArray(record.shifts) && record.shifts.length > 0) {
    const workedShifts = record.shifts.filter((s) => s.inTime || s.outTime);
    if (workedShifts.length > 0) {
      const sorted = [...workedShifts].sort(
        (a, b) => new Date(a.inTime || a.outTime || 0) - new Date(b.inTime || b.outTime || 0)
      );
      const inShift = sorted.find((s) => s.inTime);
      const outShift = [...sorted].reverse().find((s) => s.outTime);
      if (inShift?.inTime) firstIn = parseEvidenceInstant(inShift.inTime);
      if (outShift?.outTime) lastOut = parseEvidenceInstant(outShift.outTime);
    }
  }

  const th = Number(record.totalWorkingHours) || 0;
  if (!firstIn && !lastOut && th <= 0) return null;

  let durationMins = null;
  if (firstIn && lastOut) {
    durationMins = Math.max(0, Math.round((lastOut.getTime() - firstIn.getTime()) / 60000));
  } else if (th > 0) {
    durationMins = Math.round(th * 60);
  }

  return {
    record,
    firstIn,
    lastOut,
    totalWorkingHours: th,
    durationMins,
  };
}

/**
 * Classify regular OD from start/end evidence + emp/date.
 * Hours OD should not call this.
 */
async function classifyRegularOdFromEvidence({
  empNo,
  dateStr,
  startEvidence,
  endEvidence,
}) {
  const { shiftDoc, roster, skipReason } = await loadRosterShiftForOdDay(empNo, dateStr);
  const isCoEligible = roster?.status === 'WO' || roster?.status === 'HOL' || skipReason === 'week_off' || skipReason === 'holiday';

  let startRes = resolveEvidenceInstant(startEvidence);
  let endRes = resolveEvidenceInstant(endEvidence);

  // Check for AttendanceDaily biometric/system punches
  const attPunches = await getAttendancePunchesForDate(empNo, dateStr);

  if (!startRes.instant && attPunches?.firstIn) {
    startRes = { instant: attPunches.firstIn, source: 'attendance_punch' };
  }
  if (!endRes.instant && attPunches?.lastOut) {
    endRes = { instant: attPunches.lastOut, source: 'attendance_punch' };
  }

  let durationMins = durationMinutesBetween(startRes.instant, endRes.instant);
  if (isCoEligible && attPunches?.durationMins > 0) {
    durationMins = attPunches.durationMins;
  } else if ((durationMins == null || durationMins <= 0) && attPunches?.durationMins > 0) {
    durationMins = attPunches.durationMins;
  }

  // If attendance punches exist and duration is known, classify using attendance punches
  if (attPunches && durationMins != null && durationMins > 0) {
    const shiftMins = shiftDoc?.startTime && shiftDoc?.endTime ? shiftWindowMinutes(shiftDoc.startTime, shiftDoc.endTime) : null;
    const fullMin = shiftMins ? Math.round(shiftMins * FULL_DAY_RATIO) : 4 * 60; // 4 hours fallback
    const halfMin = shiftMins ? Math.round(shiftMins * HALF_DAY_RATIO) : 2 * 60; // 2 hours fallback

    if (durationMins >= fullMin) {
      return {
        classification: 'full_day',
        odType_extended: 'full_day',
        isHalfDay: false,
        halfDayType: null,
        requiresAuthorityDecision: false,
        tentative: false,
        evidenceDurationMinutes: durationMins,
        shiftDurationMinutes: shiftMins,
        halfDayMinimumMinutes: halfMin,
        fullDayMinimumMinutes: fullMin,
        reason: 'classified_from_attendance_punches',
        employeeMessage: `OD auto-classified as Full Day based on attendance punches (${formatMinutes(durationMins)} worked).`,
        usedHalfSegments: false,
        startInstant: startRes.instant,
        endInstant: endRes.instant,
        startTimeSource: startRes.source,
        endTimeSource: endRes.source,
        rosterStatus: roster?.status || null,
      };
    } else if (durationMins >= halfMin) {
      let halfDayType = 'first_half';
      if (startRes.instant && shiftDoc) {
        halfDayType = inferHalfFromEvidenceWindow(shiftDoc, startRes.instant, endRes.instant) || 'first_half';
      } else if (attPunches?.record?.shifts) {
        const { inferHalfDayTypeFromShiftSegments } = require('../utils/holwoOdPunchResolver');
        halfDayType = inferHalfDayTypeFromShiftSegments(attPunches.record.shifts, dateStr) || 'first_half';
      }
      return {
        classification: 'half_day',
        odType_extended: 'half_day',
        isHalfDay: true,
        halfDayType,
        requiresAuthorityDecision: false,
        tentative: false,
        evidenceDurationMinutes: durationMins,
        shiftDurationMinutes: shiftMins,
        halfDayMinimumMinutes: halfMin,
        fullDayMinimumMinutes: fullMin,
        reason: 'classified_from_attendance_punches',
        employeeMessage: `OD auto-classified as Half Day based on attendance punches (${formatMinutes(durationMins)} worked).`,
        usedHalfSegments: false,
        startInstant: startRes.instant,
        endInstant: endRes.instant,
        startTimeSource: startRes.source,
        endTimeSource: endRes.source,
        rosterStatus: roster?.status || null,
      };
    }
  }

  const classification = classifyOdDuration({
    evidenceDurationMinutes: durationMins,
    shiftDoc,
    startInstant: startRes.instant,
    endInstant: endRes.instant,
    skipReason,
  });

  return {
    ...classification,
    startInstant: startRes.instant,
    endInstant: endRes.instant,
    startTimeSource: startRes.source,
    endTimeSource: endRes.source,
    rosterStatus: roster?.status || null,
  };
}

/**
 * Constrain authority half/full choice using attendance on the other half.
 * @param {{ attFirst: boolean, attSecond: boolean }} attendanceFlags
 * @param {'full_day'|'half_day'} decision
 * @param {'first_half'|'second_half'|null} halfDayType
 * @param {{ acknowledgeAttendanceOverlap?: boolean }} opts
 */
function resolveAuthorityOdDecision(attendanceFlags, decision, halfDayType, opts = {}) {
  const attFirst = !!attendanceFlags?.attFirst;
  const attSecond = !!attendanceFlags?.attSecond;
  const errors = [];
  const warnings = [];
  let resolvedHalf = halfDayType === 'second_half' ? 'second_half' : halfDayType === 'first_half' ? 'first_half' : null;
  let resolvedDecision = decision === 'full_day' ? 'full_day' : 'half_day';

  if (attFirst && attSecond) {
    errors.push(
      'Attendance is present on both halves. Cannot grant OD without clearing the attendance conflict.'
    );
    return { ok: false, errors, warnings, odType_extended: null, isHalfDay: null, halfDayType: null };
  }

  if (resolvedDecision === 'full_day') {
    if ((attFirst || attSecond) && !opts.acknowledgeAttendanceOverlap) {
      errors.push(
        attFirst
          ? 'Attendance is present on the first half. Confirm you still want full-day OD (acknowledge overlap), or choose second half only.'
          : 'Attendance is present on the second half. Confirm you still want full-day OD (acknowledge overlap), or choose first half only.'
      );
      return {
        ok: false,
        errors,
        warnings,
        suggestedHalfDayType: attFirst ? 'second_half' : 'first_half',
        odType_extended: null,
        isHalfDay: null,
        halfDayType: null,
      };
    }
    if (attFirst || attSecond) {
      warnings.push(
        'Full-day OD approved while attendance exists on one half — overlap acknowledged by approver.'
      );
    }
    return {
      ok: true,
      errors,
      warnings,
      odType_extended: 'full_day',
      isHalfDay: false,
      halfDayType: null,
    };
  }

  // half_day
  if (attFirst && attSecond) {
    errors.push('Attendance present on both halves.');
    return { ok: false, errors, warnings, odType_extended: null, isHalfDay: null, halfDayType: null };
  }
  if (attFirst) {
    if (resolvedHalf === 'first_half') {
      errors.push('Attendance is present on the first half. Only second-half OD is allowed.');
      return {
        ok: false,
        errors,
        warnings,
        suggestedHalfDayType: 'second_half',
        odType_extended: null,
        isHalfDay: null,
        halfDayType: null,
      };
    }
    resolvedHalf = 'second_half';
    warnings.push('Attendance on first half — OD locked to second half.');
  } else if (attSecond) {
    if (resolvedHalf === 'second_half') {
      errors.push('Attendance is present on the second half. Only first-half OD is allowed.');
      return {
        ok: false,
        errors,
        warnings,
        suggestedHalfDayType: 'first_half',
        odType_extended: null,
        isHalfDay: null,
        halfDayType: null,
      };
    }
    resolvedHalf = 'first_half';
    warnings.push('Attendance on second half — OD locked to first half.');
  }

  if (!resolvedHalf) {
    errors.push('Select first half or second half for half-day OD.');
    return { ok: false, errors, warnings, odType_extended: null, isHalfDay: null, halfDayType: null };
  }

  return {
    ok: true,
    errors,
    warnings,
    odType_extended: 'half_day',
    isHalfDay: true,
    halfDayType: resolvedHalf,
  };
}

/**
 * Apply classification result onto an OD mongoose doc / plain object (mutates).
 */
function applyClassificationToOd(od, classification) {
  if (!od || !classification) return od;
  od.odType_extended = classification.odType_extended;
  od.isHalfDay = !!classification.isHalfDay;
  od.halfDayType = classification.isHalfDay ? classification.halfDayType : null;
  if (classification.isHalfDay) od.numberOfDays = 0.5;
  else if (od.fromDate && od.toDate) {
    const diffTime = Math.abs(new Date(od.toDate) - new Date(od.fromDate));
    od.numberOfDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;
  } else {
    od.numberOfDays = 1;
  }
  if (classification.evidenceDurationMinutes != null) {
    od.evidenceDurationMinutes = classification.evidenceDurationMinutes;
  }
  od.durationClassification = {
    status: classification.classification,
    reason: classification.reason,
    requiresAuthorityDecision: !!classification.requiresAuthorityDecision,
    tentative: !!classification.tentative,
    evidenceDurationMinutes: classification.evidenceDurationMinutes,
    shiftDurationMinutes: classification.shiftDurationMinutes,
    halfDayMinimumMinutes: classification.halfDayMinimumMinutes,
    fullDayMinimumMinutes: classification.fullDayMinimumMinutes,
    usedHalfSegments: !!classification.usedHalfSegments,
    startTimeSource: classification.startTimeSource || null,
    endTimeSource: classification.endTimeSource || null,
    employeeMessage: classification.employeeMessage || '',
    classifiedAt: new Date(),
    systemOdType: classification.odType_extended,
    systemHalfDayType: classification.halfDayType,
  };
  return od;
}

module.exports = {
  FULL_DAY_RATIO,
  HALF_DAY_RATIO,
  parseEvidenceInstant,
  resolveEvidenceInstant,
  durationMinutesBetween,
  shiftWindowMinutes,
  halfMinMinutes,
  inferHalfFromEvidenceWindow,
  classifyOdDuration,
  loadRosterShiftForOdDay,
  getAttendancePunchesForDate,
  classifyRegularOdFromEvidence,
  resolveAuthorityOdDecision,
  applyClassificationToOd,
  formatMinutes,
};
