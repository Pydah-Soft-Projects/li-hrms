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

  if (endMinutes <= startMinutes) {
    endDate.setDate(endDate.getDate() + 1);
  }

  return { startDate, endDate };
};

const getOverlapMinutes = (rangeA, rangeB) => {
  if (!rangeA || !rangeB) return 0;
  const start = Math.max(rangeA.startDate.getTime(), rangeB.startDate.getTime());
  const end = Math.min(rangeA.endDate.getTime(), rangeB.endDate.getTime());
  if (end <= start) return 0;
  return Math.round((end - start) / 60000);
};

const normalizeSegment = (segment, name, dateStr) => {
  if (!segment || !segment.startTime || !segment.endTime) return null;

  const range = timeRangeForSegment(dateStr, segment.startTime, segment.endTime);
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

  const firstHalf = normalizeSegment(shift.firstHalf, 'firstHalf', dateStr);
  const breakSegment = normalizeSegment(shift.break, 'break', dateStr);
  const secondHalf = normalizeSegment(shift.secondHalf, 'secondHalf', dateStr);

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
      : (inTime ? getOverlapMinutes(segment.range, { startDate: new Date(inTime), endDate: new Date(inTime) }) > 0 : false);

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
      overlapMinutes: inTime && outTime ? getOverlapMinutes(segment.range, { startDate: new Date(inTime), endDate: new Date(outTime) }) : 0,
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
};
