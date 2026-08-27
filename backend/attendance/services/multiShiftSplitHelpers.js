/**
 * Pure helpers for multi-shift iterative split.
 *
 * Late-join HALF credit (first half absent, second half present):
 *   considerableHours = (totalWorking − hoursOnShift1) + firstShift.duration
 * Roster gap between shift 1 end and shift 2 start → extra hours on the previous segment.
 */

const { extractISTComponents } = require('../../shared/utils/dateUtils');
const { getShiftSegmentAssignment } = require('../../shifts/services/shiftHalfSegmentService');

const NEAR_START_MAX_MINUTES = 300;

function formatDate(date) {
    return extractISTComponents(date).dateStr;
}

function timeToMinutes(timeStr) {
    if (!timeStr || typeof timeStr !== 'string') return null;
    const [hours, minutes] = timeStr.split(':').map(Number);
    if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return null;
    return hours * 60 + minutes;
}

function round2(n) {
    return Math.round(n * 100) / 100;
}

function hoursBetween(start, end) {
    if (!start || !end) return 0;
    return (end.getTime() - start.getTime()) / (3600 * 1000);
}

function addDaysYmd(dateStr, days) {
    const noon = new Date(`${dateStr}T12:00:00+05:30`);
    noon.setTime(noon.getTime() + days * 24 * 60 * 60 * 1000);
    return extractISTComponents(noon).dateStr;
}

function timeStringToDate(timeStr, refDate, isNextDay = false) {
    if (!timeStr) return null;
    let dateStr;
    if (typeof refDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(refDate)) {
        dateStr = refDate;
    } else {
        dateStr = extractISTComponents(refDate).dateStr;
    }
    if (isNextDay) {
        dateStr = addDaysYmd(dateStr, 1);
    }
    const [hours, mins] = timeStr.split(':');
    return new Date(`${dateStr}T${hours}:${mins}:00+05:30`);
}

function is24hrShift(shift) {
    return Boolean(
        shift
        && (shift.startTime === shift.endTime || (shift.duration != null && shift.duration >= 24))
    );
}

function isOvernightShift(shift) {
    if (!shift?.startTime || !shift?.endTime) return false;
    if (is24hrShift(shift)) return true;
    const start = timeToMinutes(shift.startTime);
    const end = timeToMinutes(shift.endTime);
    return start != null && end != null && end < start;
}

function getShiftStartDate(shift, dateStr) {
    return timeStringToDate(shift.startTime, dateStr, false);
}

function getShiftEndDate(shift, dateStr) {
    return timeStringToDate(shift.endTime, dateStr, isOvernightShift(shift));
}

function overlapHours(startA, endA, startB, endB) {
    if (!startA || !endA || !startB || !endB) return 0;
    const start = Math.max(startA.getTime(), startB.getTime());
    const end = Math.min(endA.getTime(), endB.getTime());
    return Math.max(0, (end - start) / (3600 * 1000));
}

function shiftHasHalfSegments(shift) {
    return Boolean(
        shift
        && shift.firstHalf?.startTime
        && shift.firstHalf?.endTime
        && shift.secondHalf?.startTime
        && shift.secondHalf?.endTime
    );
}

/**
 * Window that actually contains `inTime` (same-day or previous-day overnight).
 */
function getShiftWindowContaining(shift, dateStr, inTime) {
    const startToday = getShiftStartDate(shift, dateStr);
    const endToday = getShiftEndDate(shift, dateStr);
    if (startToday && endToday && inTime >= startToday && inTime <= endToday) {
        return { start: startToday, end: endToday };
    }
    if (isOvernightShift(shift)) {
        const prev = addDaysYmd(dateStr, -1);
        const startPrev = getShiftStartDate(shift, prev);
        const endPrev = getShiftEndDate(shift, prev);
        if (startPrev && endPrev && inTime >= startPrev && inTime <= endPrev) {
            return { start: startPrev, end: endPrev };
        }
    }
    return { start: startToday, end: endToday };
}

/**
 * Identify shift 1 for splitting.
 * Prefer the rostered window that contains IN (so a second-half join still matches).
 * Fallback: closest start within 5 hours (300 min), same as the old splitter.
 */
function findShiftForSplit(inTime, shiftsList, date) {
    if (!shiftsList?.length || !inTime) return null;
    const dateStr = typeof date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(date)
        ? date
        : formatDate(date);
    const inMs = inTime.getTime();

    let bestContaining = null;
    let bestContainingDiff = Infinity;
    let bestNear = null;
    let bestNearDiff = Infinity;

    for (const s of shiftsList) {
        if (!s?.startTime) continue;
        const window = getShiftWindowContaining(s, dateStr, inTime);
        if (window.start && window.end && inTime >= window.start && inTime <= window.end) {
            const diff = inMs - window.start.getTime();
            if (diff < bestContainingDiff) {
                bestContainingDiff = diff;
                bestContaining = s;
            }
        }

        const startOnDate = getShiftStartDate(s, dateStr);
        const startNextDay = timeStringToDate(s.startTime, dateStr, true);
        const startPrevDay = isOvernightShift(s)
            ? getShiftStartDate(s, addDaysYmd(dateStr, -1))
            : null;
        for (const startDate of [startOnDate, startNextDay, startPrevDay]) {
            if (!startDate) continue;
            const nearMin = Math.abs(inMs - startDate.getTime()) / 60000;
            if (nearMin < bestNearDiff) {
                bestNearDiff = nearMin;
                bestNear = s;
            }
        }
    }

    if (bestContaining) return bestContaining;
    return bestNearDiff <= NEAR_START_MAX_MINUTES ? bestNear : null;
}

function findNextShiftAfter(prevEnd, shiftsList, date, excludeShift = null) {
    if (!shiftsList?.length || !prevEnd) return null;
    let best = null;
    let bestDiffMs = Infinity;
    const dateStr = typeof date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(date)
        ? date
        : formatDate(date);
    const prevEndMs = prevEnd.getTime();
    const excludeId = excludeShift?._id?.toString?.();

    for (const s of shiftsList) {
        if (excludeId && s._id?.toString?.() === excludeId) continue;
        const startOnDate = timeStringToDate(s.startTime, dateStr, false);
        const startNextDay = timeStringToDate(s.startTime, dateStr, true);

        for (const startDate of [startOnDate, startNextDay]) {
            if (!startDate) continue;
            if (startDate.getTime() < prevEndMs) continue;
            const diffMs = startDate.getTime() - prevEndMs;
            if (diffMs < bestDiffMs) {
                bestDiffMs = diffMs;
                best = s;
            }
        }
    }
    return best;
}

function getShiftStartOnOrAfter(shift, prevEnd, date) {
    if (!shift?.startTime || !prevEnd) return null;
    const dateStr = typeof date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(date)
        ? date
        : formatDate(date);
    const prevEndMs = prevEnd.getTime();
    let best = null;
    let bestDiffMs = Infinity;
    for (const startDate of [
        timeStringToDate(shift.startTime, dateStr, false),
        timeStringToDate(shift.startTime, dateStr, true),
    ]) {
        if (!startDate) continue;
        if (startDate.getTime() < prevEndMs) continue;
        const diffMs = startDate.getTime() - prevEndMs;
        if (diffMs < bestDiffMs) {
            bestDiffMs = diffMs;
            best = startDate;
        }
    }
    return best;
}

function getShiftEndDateFromStart(shift, startDate) {
    if (!shift || !startDate) return null;
    return timeStringToDate(shift.endTime, formatDate(startDate), isOvernightShift(shift));
}

function addExtraHours(segment, hours) {
    if (!segment || !(hours > 0)) return;
    segment.extraHours = round2((segment.extraHours || 0) + hours);
}

/**
 * True only when first half is absent and second half is present
 * (late join, then continuous work). Early-out HALF is excluded.
 * Without configured halves: IN is after the shift midpoint and overlap is HALF (40–90%).
 */
function isLateJoinFirstHalfAbsentSecondPresent(shift, dateStr, inTime, outTime) {
    if (!shift || !inTime || !outTime) return false;

    if (shiftHasHalfSegments(shift)) {
        const assignment = getShiftSegmentAssignment(shift, dateStr, inTime, outTime, {});
        const first = (assignment.shiftSegments || []).find((s) => s.segmentName === 'firstHalf');
        const second = (assignment.shiftSegments || []).find((s) => s.segmentName === 'secondHalf');
        return Boolean(first && second && !first.present && second.present);
    }

    const start = getShiftStartDate(shift, dateStr);
    const end = getShiftEndDate(shift, dateStr);
    if (!start || !end || end <= start) return false;
    const expected = Number(shift.duration) > 0 ? Number(shift.duration) : hoursBetween(start, end);
    const inside = overlapHours(inTime, outTime, start, end);
    if (expected <= 0) return false;
    const ratio = inside / expected;
    if (ratio < 0.40 || ratio >= 0.90) return false;
    const mid = new Date(start.getTime() + (end.getTime() - start.getTime()) / 2);
    return inTime >= mid;
}

function computeConsiderableSplitHours({
    firstShift,
    date,
    inTime,
    outTime,
    totalWorkingHours,
}) {
    const dateStr = typeof date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(date)
        ? date
        : formatDate(date);
    const raw = Number(totalWorkingHours) || 0;
    const result = {
        considerableHours: raw,
        usedLateJoinCredit: false,
        hoursOnShift1: 0,
        overflowHours: raw,
    };

    if (!firstShift || !inTime || !outTime) return result;

    const window = getShiftWindowContaining(firstShift, dateStr, inTime);
    result.hoursOnShift1 = round2(overlapHours(inTime, outTime, window.start, window.end));
    result.overflowHours = round2(Math.max(0, raw - result.hoursOnShift1));

    if (!isLateJoinFirstHalfAbsentSecondPresent(firstShift, dateStr, inTime, outTime)) {
        return result;
    }

    const firstDuration = Number(firstShift.duration) > 0
        ? Number(firstShift.duration)
        : round2(hoursBetween(window.start, window.end));
    result.considerableHours = round2(result.overflowHours + firstDuration);
    result.usedLateJoinCredit = true;
    return result;
}

function shouldAttemptIterativeSplit({
    considerableHours,
    splitThresholdHours,
    outTime,
    firstEndDate,
    splitMinGapHours,
}) {
    if (!outTime || !firstEndDate) return false;
    if (!(considerableHours >= splitThresholdHours)) return false;
    if (!(outTime > firstEndDate)) return false;
    const leftoverHours = hoursBetween(firstEndDate, outTime);
    return leftoverHours > splitMinGapHours;
}

/**
 * Cut shift 1 at scheduled end, then fill later rostered shifts.
 * Hours between shift N end and shift N+1 start are extra on shift N.
 * Leftover after a shift start that is < half of that shift stays extra on the previous segment.
 */
function buildIterativeSplitSegments({
    firstShift,
    firstEndDate,
    currentInTimestamp,
    remainderOut,
    shiftsList,
    date,
    maxShifts,
    splitMinGapHours,
}) {
    const splitSegments = [];
    splitSegments.push({
        assignedShift: firstShift,
        inTime: currentInTimestamp,
        outTime: firstEndDate.toISOString(),
        extraHours: 0,
    });

    let prevEnd = firstEndDate;
    let prevShift = firstShift;
    let segmentIdx = 1;

    while (segmentIdx < maxShifts) {
        const nextShift = findNextShiftAfter(prevEnd, shiftsList, date, prevShift);
        if (!nextShift) {
            addExtraHours(splitSegments[splitSegments.length - 1], hoursBetween(prevEnd, remainderOut));
            break;
        }

        const nextStart = getShiftStartOnOrAfter(nextShift, prevEnd, date);
        if (!nextStart) {
            addExtraHours(splitSegments[splitSegments.length - 1], hoursBetween(prevEnd, remainderOut));
            break;
        }

        const gapEnd = new Date(Math.min(remainderOut.getTime(), nextStart.getTime()));
        addExtraHours(splitSegments[splitSegments.length - 1], hoursBetween(prevEnd, gapEnd));

        if (remainderOut.getTime() <= nextStart.getTime()) break;

        const spanHours = hoursBetween(nextStart, remainderOut);
        const halfDayHours = (Number(nextShift.duration) > 0 ? Number(nextShift.duration) : 8) / 2;
        if (spanHours < halfDayHours) {
            addExtraHours(splitSegments[splitSegments.length - 1], spanHours);
            break;
        }

        const nextEndDate = getShiftEndDateFromStart(nextShift, nextStart);
        const nextGapHours = nextEndDate ? hoursBetween(nextEndDate, remainderOut) : 0;
        const cutAtNextEnd = Boolean(
            nextEndDate
            && remainderOut > nextEndDate
            && nextGapHours > splitMinGapHours
        );

        splitSegments.push({
            assignedShift: nextShift,
            inTime: nextStart.toISOString(),
            outTime: cutAtNextEnd ? nextEndDate.toISOString() : remainderOut.toISOString(),
            extraHours: 0,
        });

        if (!cutAtNextEnd) break;
        prevEnd = nextEndDate;
        prevShift = nextShift;
        segmentIdx += 1;
    }

    return splitSegments;
}

module.exports = {
    formatDate,
    timeStringToDate,
    timeToMinutes,
    hoursBetween,
    overlapHours,
    isOvernightShift,
    getShiftStartDate,
    getShiftEndDate,
    getShiftWindowContaining,
    findShiftForSplit,
    findNextShiftAfter,
    getShiftStartOnOrAfter,
    getShiftEndDateFromStart,
    shiftHasHalfSegments,
    isLateJoinFirstHalfAbsentSecondPresent,
    computeConsiderableSplitHours,
    shouldAttemptIterativeSplit,
    buildIterativeSplitSegments,
    NEAR_START_MAX_MINUTES,
};
