const { createISTDate } = require('../../shared/utils/dateUtils');

const parseTimeToMinutes = (timeStr) => {
  if (!timeStr || typeof timeStr !== 'string') return null;
  const [hour, minute] = timeStr.split(':').map(Number);
  if (Number.isNaN(hour) || Number.isNaN(minute)) return null;
  return hour * 60 + minute;
};

const timeRangeForSegment = (dateStr, startTime, endTime) => {
  const startDate = createISTDate(dateStr, startTime);
  const endDate = createISTDate(dateStr, endTime);
  const startMinutes = parseTimeToMinutes(startTime);
  const endMinutes = parseTimeToMinutes(endTime);

  if (startMinutes === null || endMinutes === null) {
    return null;
  }

  // Handle overnight segments: if end time is earlier than start time, it spans midnight
  if (endMinutes <= startMinutes) {
    endDate.setDate(endDate.getDate() + 1);
  }

  return { startDate, endDate };
};

const getOverlapMinutes = (rangeA, rangeB) => {
  if (!rangeA || !rangeB || !rangeA.startDate || !rangeA.endDate || !rangeB.startDate || !rangeB.endDate) return 0;
  const start = Math.max(rangeA.startDate.getTime(), rangeB.startDate.getTime());
  const end = Math.min(rangeA.endDate.getTime(), rangeB.endDate.getTime());
  if (end <= start) return 0;
  return Math.round((end - start) / 60000);
};

/**
 * Align segment range with parent shift range for overnight shifts.
 * Example: shift 21:00-09:00 and segment 03:00-09:00 should be anchored on next day.
 */
const alignSegmentRangeToShift = (segmentRange, shiftRange) => {
  if (!segmentRange || !shiftRange || !segmentRange.startDate || !segmentRange.endDate || !shiftRange.startDate) {
    return segmentRange;
  }

  // If the whole segment is before shift start, move it to next day.
  if (segmentRange.endDate.getTime() <= shiftRange.startDate.getTime()) {
    const oneDayMs = 24 * 60 * 60 * 1000;
    return {
      startDate: new Date(segmentRange.startDate.getTime() + oneDayMs),
      endDate: new Date(segmentRange.endDate.getTime() + oneDayMs),
    };
  }

  return segmentRange;
};

/**
 * Check if a punch time falls within any segment of an overnight shift
 * Used for enhanced shift matching when employees work only part of overnight shifts
 * @param {Date} punchTime - Employee's punch time
 * @param {Object} shift - Shift object with firstHalf/secondHalf
 * @param {String} dateStr - Attendance date (YYYY-MM-DD)
 * @returns {Object|null} - Segment info if punch matches a segment, null otherwise
 */
const findMatchingSegmentForPunch = (punchTime, shift, dateStr) => {
  if (!shift || (!shift.firstHalf && !shift.secondHalf)) return null;

  const shiftRange = timeRangeForSegment(dateStr, shift.startTime, shift.endTime);
  const punchRange = {
    startDate: new Date(punchTime.getTime() - 1000), // 1 second before
    endDate: new Date(punchTime.getTime() + 1000),   // 1 second after
  };

  // Check first half
  if (shift.firstHalf && shift.firstHalf.startTime && shift.firstHalf.endTime) {
    const rawFirstHalfRange = timeRangeForSegment(dateStr, shift.firstHalf.startTime, shift.firstHalf.endTime);
    const firstHalfRange = alignSegmentRangeToShift(rawFirstHalfRange, shiftRange);
    if (firstHalfRange && getOverlapMinutes(punchRange, firstHalfRange) > 0) {
      return {
        segmentName: 'firstHalf',
        segment: shift.firstHalf,
        range: firstHalfRange,
      };
    }
  }

  // Check second half (may span midnight)
  if (shift.secondHalf && shift.secondHalf.startTime && shift.secondHalf.endTime) {
    const rawSecondHalfRange = timeRangeForSegment(dateStr, shift.secondHalf.startTime, shift.secondHalf.endTime);
    const secondHalfRange = alignSegmentRangeToShift(rawSecondHalfRange, shiftRange);
    if (secondHalfRange && getOverlapMinutes(punchRange, secondHalfRange) > 0) {
      return {
        segmentName: 'secondHalf',
        segment: shift.secondHalf,
        range: secondHalfRange,
      };
    }
  }

  return null;
};

const normalizeSegment = (segment, name, dateStr, shiftRange = null) => {
  if (!segment || !segment.startTime || !segment.endTime) return null;

  const rawRange = timeRangeForSegment(dateStr, segment.startTime, segment.endTime);
  const range = alignSegmentRangeToShift(rawRange, shiftRange);
  if (!range) return null;

  return {
    segmentName: name,
    startTime: segment.startTime,
    endTime: segment.endTime,
    duration: typeof segment.duration === 'number' ? segment.duration : Math.round((range.endDate.getTime() - range.startDate.getTime()) / 60000) / 60,
    minDuration: typeof segment.minDuration === 'number' ? segment.minDuration : null,
    gracePeriod: typeof segment.gracePeriod === 'number' ? segment.gracePeriod : null,
    payableShifts: typeof segment.payableShifts === 'number' ? segment.payableShifts : 0,
    range,
  };
};

const getEffectiveGrace = (segmentGrace, globalGrace, shiftGrace) => {
  if (typeof segmentGrace === 'number' && segmentGrace > 0) {
    return segmentGrace;
  }
  if (typeof globalGrace === 'number') {
    return globalGrace;
  }
  return typeof shiftGrace === 'number' ? shiftGrace : 15;
};

const calculateSegmentLateIn = (segment, inTime, globalGrace, shiftGrace) => {
  if (!segment || !inTime) return null;
  const segmentStart = segment.range.startDate.getTime();
  const punchTime = new Date(inTime).getTime();
  if (punchTime <= segmentStart) return 0;

  const diffMinutes = Math.floor((punchTime - segmentStart) / 60000);
  const effectiveGrace = getEffectiveGrace(segment.gracePeriod, globalGrace, shiftGrace);
  return diffMinutes <= effectiveGrace ? 0 : Math.round((diffMinutes - effectiveGrace) * 100) / 100;
};

const calculateSegmentEarlyOut = (segment, outTime, globalGrace, shiftGrace) => {
  if (!segment || !outTime) return null;
  const segmentEnd = segment.range.endDate.getTime();
  const punchTime = new Date(outTime).getTime();
  if (punchTime >= segmentEnd) return 0;

  const diffMinutes = Math.floor((segmentEnd - punchTime) / 60000);
  const effectiveGrace = getEffectiveGrace(segment.gracePeriod, globalGrace, shiftGrace);
  return diffMinutes <= effectiveGrace ? 0 : Math.round((diffMinutes - effectiveGrace) * 100) / 100;
};

const buildShiftSegmentTimeline = (shift, dateStr) => {
  const shiftRange = timeRangeForSegment(dateStr, shift.startTime, shift.endTime);
  const segments = [];
  const continuityWarnings = [];

  const firstHalf = normalizeSegment(shift.firstHalf, 'firstHalf', dateStr, shiftRange);
  const breakSegment = normalizeSegment(shift.break, 'break', dateStr, shiftRange);
  const secondHalf = normalizeSegment(shift.secondHalf, 'secondHalf', dateStr, shiftRange);

  if (firstHalf) segments.push(firstHalf);
  if (secondHalf) segments.push(secondHalf);

  if (firstHalf && breakSegment && firstHalf.endTime !== breakSegment.startTime) {
    continuityWarnings.push('First half end does not match break start');
  }
  if (secondHalf && breakSegment && breakSegment.endTime !== secondHalf.startTime) {
    continuityWarnings.push('Break end does not match second half start');
  }
  if (firstHalf && shift.startTime && firstHalf.startTime !== shift.startTime) {
    continuityWarnings.push('First half start does not match shift start');
  }
  if (secondHalf && shift.endTime && secondHalf.endTime !== shift.endTime) {
    continuityWarnings.push('Second half end does not match shift end');
  }

  return {
    shiftRange,
    firstHalf,
    breakSegment,
    secondHalf,
    segments,
    continuityWarnings,
  };
};

const hasOverlap = (segment, inTime, outTime) => {
  if (!segment || !segment.range) return false;
  const attendanceRange = {
    startDate: new Date(inTime),
    endDate: outTime ? new Date(outTime) : new Date(inTime),
  };
  return getOverlapMinutes(segment.range, attendanceRange) > 0;
};

const getShiftSegmentAssignment = (shift, dateStr, inTime, outTime, options = {}) => {
  const { globalLateInGrace = null, globalEarlyOutGrace = null } = options;
  const timeline = buildShiftSegmentTimeline(shift, dateStr);

  if (!timeline.segments || timeline.segments.length === 0) {
    return {
      shiftSegments: [],
      continuityWarnings: timeline.continuityWarnings,
      totalPayableShifts: typeof shift.payableShifts === 'number' ? shift.payableShifts : 0,
    };
  }

  const segmentDetails = timeline.segments.map((segment) => {
    const present = inTime && outTime
      ? hasOverlap(segment, inTime, outTime)
      : (inTime && segment.range ? getOverlapMinutes(segment.range, { startDate: new Date(inTime), endDate: new Date(inTime) }) > 0 : false);

    const lateInMinutes = present ? calculateSegmentLateIn(segment, inTime, globalLateInGrace, shift.gracePeriod) : null;
    const earlyOutMinutes = present ? calculateSegmentEarlyOut(segment, outTime, globalEarlyOutGrace, shift.gracePeriod) : null;

    return {
      segmentName: segment.segmentName,
      startTime: segment.startTime,
      endTime: segment.endTime,
      duration: segment.duration,
      minDuration: segment.minDuration,
      gracePeriod: segment.gracePeriod,
      effectiveGrace: getEffectiveGrace(segment.gracePeriod, globalLateInGrace ?? globalEarlyOutGrace, shift.gracePeriod),
      payableShifts: segment.payableShifts,
      present,
      lateInMinutes: lateInMinutes !== null ? Math.max(0, lateInMinutes) : null,
      earlyOutMinutes: earlyOutMinutes !== null ? Math.max(0, earlyOutMinutes) : null,
      isLateIn: lateInMinutes > 0,
      isEarlyOut: earlyOutMinutes > 0,
      overlapMinutes: inTime && outTime && segment.range ? getOverlapMinutes(segment.range, { startDate: new Date(inTime), endDate: new Date(outTime) }) : 0,
    };
  });

  const totalPayableShifts = segmentDetails.reduce((sum, segment) => {
    return sum + ((segment.present ? Number(segment.payableShifts) : 0) || 0);
  }, 0);

  return {
    shiftSegments: segmentDetails,
    continuityWarnings: timeline.continuityWarnings,
    totalPayableShifts: totalPayableShifts > 0 ? Math.round(totalPayableShifts * 100) / 100 : (typeof shift.payableShifts === 'number' ? shift.payableShifts : 0),
  };
};

module.exports = {
  buildShiftSegmentTimeline,
  getShiftSegmentAssignment,
  calculateSegmentLateIn,
  calculateSegmentEarlyOut,
  getEffectiveGrace,
  findMatchingSegmentForPunch,
};
