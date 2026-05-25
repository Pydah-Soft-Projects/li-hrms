/**
 * Build PreScheduledShift updates when applying holidays / week-offs from the holiday calendar.
 */

const Settings = require('../../settings/model/Settings');
const PreScheduledShift = require('../../shifts/model/PreScheduledShift');

const VALID_HALF = new Set(['first_half', 'second_half']);
const VALID_SEGMENT_SCOPE = new Set(['FULL_DAY', 'FIRST_SEGMENT', 'ALL_SEGMENTS']);

function normalizeRosterApplyOptions(body = {}) {
    const rosterFillMode = body.rosterFillMode === 'WEEK_OFF' ? 'WEEK_OFF' : 'HOL';
    let rosterApplyMode = body.rosterApplyMode === 'HALF_DAY' ? 'HALF_DAY' : 'FULL_DAY';
    if (body.rosterApplyMode === 'HOURS') {
        rosterApplyMode = 'FULL_DAY';
    }

    let halfDayType = null;
    if (rosterApplyMode === 'HALF_DAY') {
        const h = String(body.halfDayType || '').toLowerCase();
        if (!VALID_HALF.has(h)) {
            const err = new Error('Half-day holiday requires halfDayType: first_half or second_half');
            err.statusCode = 400;
            throw err;
        }
        halfDayType = h;
    }

    let multiShiftScope = body.multiShiftScope || 'FULL_DAY';
    if (!VALID_SEGMENT_SCOPE.has(multiShiftScope)) {
        multiShiftScope = 'FULL_DAY';
    }

    return { rosterFillMode, rosterApplyMode, halfDayType, multiShiftScope };
}

async function getAttendanceProcessingMode() {
    try {
        const doc = await Settings.findOne({ key: 'attendance_settings' }).lean();
        const mode = doc?.value?.processingMode?.mode;
        return mode === 'single_shift' ? 'single_shift' : 'multi_shift';
    } catch {
        return 'multi_shift';
    }
}

/**
 * Guess weekday shift for half-day roster (caller may inject same fn as holidayController).
 */
async function defaultGuessShift(employeeNumber, dateStr, guessFn) {
    if (typeof guessFn === 'function') {
        return guessFn(employeeNumber, dateStr);
    }
    const targetWeekday = new Date(`${dateStr}T00:00:00Z`).getUTCDay();
    const lookbackStart = new Date(`${dateStr}T00:00:00Z`);
    lookbackStart.setUTCDate(lookbackStart.getUTCDate() - 63);
    const fromStr = lookbackStart.toISOString().slice(0, 10);

    const candidates = await PreScheduledShift.find({
        employeeNumber,
        date: { $gte: fromStr, $lt: dateStr },
        shiftId: { $ne: null },
        status: { $ne: 'HOL' },
    })
        .select('date shiftId')
        .sort({ date: -1 })
        .lean();

    for (const row of candidates) {
        const wd = new Date(`${row.date}T00:00:00Z`).getUTCDay();
        if (wd === targetWeekday && row.shiftId) return row.shiftId;
    }
    return null;
}

/**
 * One roster upsert payload for bulkWrite / roster sync queue.
 */
async function buildRosterEntryForHolidayDay({
    employeeNumber,
    date,
    holidayName,
    holidayId,
    rosterFillMode,
    rosterApplyMode,
    halfDayType,
    multiShiftScope,
    guessShiftFromWeekdayPattern,
}) {
    const empNo = String(employeeNumber || '').toUpperCase();
    const nonWorking = rosterFillMode === 'WEEK_OFF' ? 'WO' : 'HOL';
    const notes =
        nonWorking === 'HOL'
            ? holidayName
                ? `Holiday: ${holidayName}`
                : 'Holiday'
            : 'Week Off';

    if (rosterApplyMode !== 'HALF_DAY') {
        return {
            employeeNumber: empNo,
            date,
            status: nonWorking,
            shiftId: null,
            firstHalfStatus: null,
            secondHalfStatus: null,
            holidaySegmentScope: null,
            holidayHalfDayType: null,
            sourceHolidayId: holidayId || null,
            holidayName,
            notes,
        };
    }

    // Optional: attach weekday pattern shift when available; half-day is valid with shiftId null (blank roster cell).
    const shiftId = await defaultGuessShift(empNo, date, guessShiftFromWeekdayPattern);

    const firstHalfStatus = halfDayType === 'first_half' ? nonWorking : null;
    const secondHalfStatus = halfDayType === 'second_half' ? nonWorking : null;
    let holidaySegmentScope = null;
    if (multiShiftScope === 'FIRST_SEGMENT') {
        holidaySegmentScope = 'FIRST_SEGMENT';
    } else if (multiShiftScope === 'ALL_SEGMENTS') {
        holidaySegmentScope = 'ALL_SEGMENTS';
    }

    return {
        employeeNumber: empNo,
        date,
        status: null,
        shiftId: shiftId || null,
        firstHalfStatus,
        secondHalfStatus,
        holidaySegmentScope,
        holidayHalfDayType: halfDayType,
        sourceHolidayId: holidayId || null,
        holidayName,
        notes,
    };
}

async function buildRosterEntriesForHoliday({
    employeeNumbers,
    dates,
    holidayName,
    holidayId,
    rosterFillMode,
    rosterApplyMode,
    halfDayType,
    multiShiftScope,
    guessShiftFromWeekdayPattern,
}) {
    const entries = [];
    for (const empNo of employeeNumbers) {
        for (const day of dates) {
            entries.push(
                await buildRosterEntryForHolidayDay({
                    employeeNumber: empNo,
                    date: day,
                    holidayName,
                    holidayId,
                    rosterFillMode,
                    rosterApplyMode,
                    halfDayType,
                    multiShiftScope,
                    guessShiftFromWeekdayPattern,
                })
            );
        }
    }
    return entries;
}

module.exports = {
    normalizeRosterApplyOptions,
    getAttendanceProcessingMode,
    buildRosterEntryForHolidayDay,
    buildRosterEntriesForHoliday,
};
