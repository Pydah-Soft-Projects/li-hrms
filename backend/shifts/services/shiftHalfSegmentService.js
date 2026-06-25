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

/**
 * Calculate coverage percentage: actual work time / segment window duration
 */
const calculateSegmentCoveragePercentage = (segment, inTime, outTime) => {
  if (!segment || !segment.range) return 0;
  
  const attendanceRange = {
    startDate: new Date(inTime),
    endDate: new Date(outTime || inTime),
  };
  
  const actualOverlapMinutes = getOverlapMinutes(segment.range, attendanceRange);
  const segmentDurationMinutes = Math.round((segment.range.endDate.getTime() - segment.range.startDate.getTime()) / 60000);
  
  if (segmentDurationMinutes === 0) return 0;
  return (actualOverlapMinutes / segmentDurationMinutes) * 100;
};

/**
 * Evaluate one half: raw window overlap first, then break credit (+ optional overflow) if work spans the break.
 */
const evaluateHalfPresenceWithBreakCredit = ({
  rawMinutes,
  minMinutes,
  workedThroughBreak,
  fullBreakMinutes,
  overflowMinutes = 0,
}) => {
  if (minMinutes <= 0) {
    return { present: rawMinutes > 0, credit: rawMinutes };
  }

  if (rawMinutes >= minMinutes) return { present: true, credit: rawMinutes };

  if (!workedThroughBreak) {
    return { present: false, credit: rawMinutes };
  }

  let credit = rawMinutes + fullBreakMinutes;
  if (credit < minMinutes && overflowMinutes > 0) {
    const needed = minMinutes - credit;
    credit += Math.min(overflowMinutes, needed);
  }

  return { present: credit >= minMinutes, credit };
};

/**
 * Break-aware presence: each half is evaluated independently (raw overlap, then break credit).
 * Dominant-segment fallback runs only when neither half qualifies after those checks.
 */
const calculateSegmentPresenceIntelligent = (timeline, inTime, outTime) => {
  if (!inTime || !outTime) return { firstHalf: false, secondHalf: false };
  
  const finalOutTime = new Date(outTime);
  const firstHalf = timeline?.firstHalf;
  const secondHalf = timeline?.secondHalf;
  const breakSegment = timeline?.breakSegment;
  
  if (!firstHalf || !secondHalf) {
    return { firstHalf: false, secondHalf: false };
  }
  
  const attendanceRange = {
    startDate: new Date(inTime),
    endDate: finalOutTime,
  };
  
  const firstHalfRawMinutes = getOverlapMinutes(firstHalf.range, attendanceRange);
  const secondHalfRawMinutes = getOverlapMinutes(secondHalf.range, attendanceRange);
  
  const firstHalfWindowMinutes = Math.round((firstHalf.range.endDate.getTime() - firstHalf.range.startDate.getTime()) / 60000);
  const secondHalfWindowMinutes = Math.round((secondHalf.range.endDate.getTime() - secondHalf.range.startDate.getTime()) / 60000);
  
  const firstHalfCoveragePercent = firstHalfWindowMinutes > 0 ? (firstHalfRawMinutes / firstHalfWindowMinutes) * 100 : 0;
  const secondHalfCoveragePercent = secondHalfWindowMinutes > 0 ? (secondHalfRawMinutes / secondHalfWindowMinutes) * 100 : 0;
  
  const firstHalfIsDominant = firstHalfCoveragePercent >= secondHalfCoveragePercent;
  
  const totalWorkMinutes = Math.round((finalOutTime.getTime() - new Date(inTime).getTime()) / 60000);
  const fullBreakMinutes = breakSegment
    ? Math.round((breakSegment.range.endDate.getTime() - breakSegment.range.startDate.getTime()) / 60000)
    : 0;
  
  const workedThroughBreak = breakSegment
    && new Date(inTime) < breakSegment.range.endDate
    && finalOutTime > breakSegment.range.startDate;
  
  const firstHalfMinMinutes = (firstHalf.minDuration || 0) * 60;
  const secondHalfMinMinutes = (secondHalf.minDuration || 0) * 60;

  // Overflow into second-half window can help first half when employee skips lunch but leaves early afternoon
  let firstHalfOverflowMinutes = 0;
  if (workedThroughBreak && breakSegment?.range && secondHalf?.range && finalOutTime > breakSegment.range.endDate) {
    firstHalfOverflowMinutes = getOverlapMinutes(
      {
        startDate: new Date(Math.max(breakSegment.range.endDate.getTime(), new Date(inTime).getTime())),
        endDate: new Date(Math.min(secondHalf.range.endDate.getTime(), finalOutTime.getTime())),
      },
      attendanceRange
    );
  }

  const firstHalfEval = evaluateHalfPresenceWithBreakCredit({
    rawMinutes: firstHalfRawMinutes,
    minMinutes: firstHalfMinMinutes,
    workedThroughBreak,
    fullBreakMinutes,
    overflowMinutes: firstHalfOverflowMinutes,
  });

  const secondHalfEval = evaluateHalfPresenceWithBreakCredit({
    rawMinutes: secondHalfRawMinutes,
    minMinutes: secondHalfMinMinutes,
    workedThroughBreak,
    fullBreakMinutes,
  });

  let firstHalfPresent = firstHalfEval.present;
  let secondHalfPresent = secondHalfEval.present;
  let firstHalfCredit = firstHalfEval.credit;
  let secondHalfCredit = secondHalfEval.credit;

  // Dominant fallback: only when neither half met minimum on its own (with break credit)
  if (!firstHalfPresent && !secondHalfPresent) {
    const dominantCredit = totalWorkMinutes + (workedThroughBreak ? fullBreakMinutes : 0);
    const dominantMin = firstHalfIsDominant ? firstHalfMinMinutes : secondHalfMinMinutes;

    if (dominantCredit >= dominantMin) {
      if (firstHalfIsDominant) {
        firstHalfPresent = true;
        firstHalfCredit = dominantCredit;
      } else {
        secondHalfPresent = true;
        secondHalfCredit = dominantCredit;
      }
    }
  }
  
  return {
    firstHalf: firstHalfPresent,
    secondHalf: secondHalfPresent,
    dominantSegment: firstHalfIsDominant ? 'firstHalf' : 'secondHalf',
    firstHalfCoveragePercent,
    secondHalfCoveragePercent,
    firstHalfCredit,
    secondHalfCredit,
  };
};

/**
 * Calculate presence considering break skip:
 * If employee works through break (no break taken), count continuous work
 * Continuous work credit: include work before break + break time + work after break
 * @param {Object} segment - Current segment (firstHalf or secondHalf)
 * @param {Date} inTime - Employee check-in time
 * @param {Date} outTime - Employee check-out time
 * @param {Object} timeline - Timeline with firstHalf, breakSegment, secondHalf info
 * @param {Number} minDuration - Minimum hours needed (in decimal format, e.g. 4 for 4 hours)
 * @returns {Boolean} - Whether employee is present in this segment
 */
const calculateSegmentPresenceWithBreakHandling = (segment, inTime, outTime, timeline, minDuration) => {
  if (!segment || !segment.range) return false;
  if (!inTime) return false;

  const finalOutTime = outTime || inTime;
  const breakSegment = timeline?.breakSegment;
  const attendanceRange = {
    startDate: new Date(inTime),
    endDate: new Date(finalOutTime),
  };

  // Get the overlap within the segment window
  let overlapMinutes = getOverlapMinutes(segment.range, attendanceRange);

  // If first half and employee worked past first half end into break area:
  if (segment.segmentName === 'firstHalf' && breakSegment && breakSegment.range) {
    const firstHalfEnd = segment.range.endDate;
    const breakStart = breakSegment.range.startDate;
    const breakEnd = breakSegment.range.endDate;
    const secondHalf = timeline?.secondHalf;

    // If employee OUT time is after first half ends (worked through break):
    if (finalOutTime > firstHalfEnd && finalOutTime > breakStart) {
      // ADD: Full break duration (employee worked through it)
      if (breakStart && breakEnd) {
        const breakInWork = getOverlapMinutes(
          attendanceRange,
          breakSegment.range
        );
        if (breakInWork > 0) {
          // Break was not taken - add full break duration
          const fullBreakMinutes = Math.round((breakEnd.getTime() - breakStart.getTime()) / 60000);
          overlapMinutes += fullBreakMinutes;
        }
      }

      // ADD: Overflow work from second half to help first half meet minimum
      // (If employee stays through break into second half)
      if (secondHalf && secondHalf.range && finalOutTime > breakEnd) {
        const workInSecondHalf = getOverlapMinutes(
          {
            startDate: new Date(Math.max(breakEnd.getTime(), new Date(inTime).getTime())),
            endDate: new Date(Math.min(secondHalf.range.endDate.getTime(), new Date(finalOutTime).getTime()))
          },
          attendanceRange
        );
        if (workInSecondHalf > 0) {
          // Add overflow from second half only if first half still needs it
          const firstHalfMinutes = getOverlapMinutes(
            segment.range,
            attendanceRange
          );
          const minDurationMinutes = minDuration * 60;
          
          // Only add enough overflow to potentially reach minimum
          if (firstHalfMinutes + fullBreakMinutes < minDurationMinutes) {
            const neededFromSecond = minDurationMinutes - (firstHalfMinutes + fullBreakMinutes);
            const overflowToAdd = Math.min(workInSecondHalf, neededFromSecond);
            overlapMinutes += overflowToAdd;
          }
        }
      }
    }
  }

  // If second half and employee worked before break ends (skip break - continuous work):
  if (segment.segmentName === 'secondHalf' && breakSegment && breakSegment.range) {
    const firstHalf = timeline?.firstHalf;
    const secondHalfStart = segment.range.startDate;
    const breakStart = breakSegment.range.startDate;
    const breakEnd = breakSegment.range.endDate;

    // If employee IN time is BEFORE second half starts (i.e., in first half area):
    // This means they worked through/across the break continuously
    if (inTime < secondHalfStart) {
      // ADD: Work time in first half that wasn't counted there
      // (Employee worked from their IN time until break starts)
      if (firstHalf && firstHalf.range && inTime < firstHalf.range.endDate) {
        const workInFirstHalf = getOverlapMinutes(
          {
            startDate: new Date(inTime),
            endDate: new Date(Math.min(firstHalf.range.endDate.getTime(), new Date(finalOutTime).getTime()))
          },
          attendanceRange
        );
        if (workInFirstHalf > 0) {
          overlapMinutes += workInFirstHalf;
        }
      }

      // ADD: Full break duration (employee didn't take break, worked through it)
      if (breakStart && breakEnd) {
        const breakInWork = getOverlapMinutes(
          attendanceRange,
          breakSegment.range
        );
        if (breakInWork > 0) {
          // Break was not taken - add full break duration
          const fullBreakMinutes = Math.round((breakEnd.getTime() - breakStart.getTime()) / 60000);
          overlapMinutes += fullBreakMinutes;
        }
      }
    }
  }

  // Convert minDuration (in hours) to minutes for comparison
  const minDurationMinutes = minDuration * 60;

  // Check if overlap meets minimum duration requirement
  return overlapMinutes >= minDurationMinutes;
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

  // Calculate intelligent presence using dominant segment logic
  const intelligentPresence = inTime && outTime 
    ? calculateSegmentPresenceIntelligent(timeline, inTime, outTime)
    : { firstHalf: false, secondHalf: false };

  const segmentDetails = timeline.segments.map((segment) => {
    // Each half is evaluated independently; both can be present when raw overlap qualifies
    const present = segment.segmentName === 'firstHalf' 
      ? intelligentPresence.firstHalf 
      : intelligentPresence.secondHalf;

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

  const hasConfiguredHalves = timeline.segments && timeline.segments.length > 0;

  return {
    shiftSegments: segmentDetails,
    continuityWarnings: timeline.continuityWarnings,
    totalPayableShifts: totalPayableShifts > 0
      ? Math.round(totalPayableShifts * 100) / 100
      : (hasConfiguredHalves ? 0 : (typeof shift.payableShifts === 'number' ? shift.payableShifts : 0)),
  };
};

module.exports = {
  buildShiftSegmentTimeline,
  getShiftSegmentAssignment,
  calculateSegmentLateIn,
  calculateSegmentEarlyOut,
  getEffectiveGrace,
  findMatchingSegmentForPunch,
  calculateSegmentPresenceWithBreakHandling,
};
