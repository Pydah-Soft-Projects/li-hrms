/**
 * Multi-shift: apply holiday segment scope after punches/shifts are detected.
 * Works with roster row fields holidaySegmentScope + holidayHalfDayType + half HOL flags.
 */

const { parseRosterHalfNonWorking } = require('./rosterHalfNonWorking');
const { inferHalfDayTypeFromShiftSegments } = require('../../leaves/utils/holwoOdPunchResolver');

function segmentIndexToHalf(segmentIndex, totalSegments) {
    if (totalSegments <= 1) return segmentIndex === 0 ? 'first_half' : null;
    if (totalSegments === 2) {
        return segmentIndex === 0 ? 'first_half' : 'second_half';
    }
    return segmentIndex < totalSegments / 2 ? 'first_half' : 'second_half';
}

function segmentMatchesHolidayHalf(segmentIndex, totalSegments, holidayHalfDayType) {
    if (!holidayHalfDayType) return false;
    const half = segmentIndexToHalf(segmentIndex, totalSegments);
    return half === holidayHalfDayType;
}

/**
 * For ALL_SEGMENTS + half holiday: every segment whose half matches holidayHalfDayType is treated as holiday.
 * For FIRST_SEGMENT: only segment 0, if it matches the holiday half (or always for segment 0 when scope is FIRST_SEGMENT).
 */
function applyMultiShiftHolidaySegmentRules(doc, rosterRow) {
    const result = {
        applied: false,
        segmentsMarkedHoliday: 0,
    };

    if (!doc || !rosterRow || !doc.shifts || doc.shifts.length === 0) {
        return result;
    }

    const parsed = parseRosterHalfNonWorking(rosterRow);
    const scope = rosterRow.holidaySegmentScope || null;
    const holidayHalf = rosterRow.holidayHalfDayType || null;

    if (parsed.isFullHOL || parsed.isFullWO) {
        return result;
    }

    const hasHalfHol = parsed.firstHOL || parsed.secondHOL;
    if (!hasHalfHol && !scope) {
        return result;
    }

    const ordered = [...doc.shifts].sort(
        (a, b) => new Date(a.inTime || 0).getTime() - new Date(b.inTime || 0).getTime()
    );
    const total = ordered.length;
    const targetHalf =
        holidayHalf ||
        (parsed.firstHOL ? 'first_half' : parsed.secondHOL ? 'second_half' : null);

    if (!targetHalf) {
        return result;
    }

    let marked = 0;
    for (let i = 0; i < ordered.length; i += 1) {
        let shouldMark = false;
        if (scope === 'FIRST_SEGMENT') {
            shouldMark = i === 0 && segmentMatchesHolidayHalf(0, total, targetHalf);
        } else if (scope === 'ALL_SEGMENTS') {
            shouldMark = segmentMatchesHolidayHalf(i, total, targetHalf);
        } else {
            const inferred = inferHalfDayTypeFromShiftSegments(doc.shifts, doc.date);
            shouldMark = inferred === targetHalf;
        }

        if (!shouldMark) continue;

        const seg = ordered[i];
        if (seg && parsed.firstHOL || parsed.secondHOL) {
            marked += 1;
            result.applied = true;
        }
    }

    result.segmentsMarkedHoliday = marked;
    return result;
}

module.exports = {
    segmentIndexToHalf,
    segmentMatchesHolidayHalf,
    applyMultiShiftHolidaySegmentRules,
};
