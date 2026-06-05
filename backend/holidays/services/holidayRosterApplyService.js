const PreScheduledShift = require('../../shifts/model/PreScheduledShift');
const { buildRosterEntriesForHoliday } = require('../utils/holidayRosterApply');
const { getHolidayDateRangeStrings } = require('../utils/holidayCalendarDates');

const BATCH_SIZE = 40;

function escapeRegex(str) {
    return String(str || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

async function collectRosterRowsForHolidayCleanup(holiday, dates, resolveEmployeesForHolidayScope) {
    const fromScope = await resolveEmployeesForHolidayScope({
        scope: holiday.scope,
        groupId: holiday.groupId,
        applicableTo: holiday.applicableTo,
        targetGroupIds: holiday.targetGroupIds,
        divisionMapping: holiday.divisionMapping,
    });
    const seen = new Set(fromScope.map((n) => String(n).toUpperCase()));
    const pairs = new Map();

    const addPair = (empNo, day) => {
        const no = String(empNo || '').toUpperCase();
        if (!no || !day) return;
        seen.add(no);
        pairs.set(`${no}|${day}`, { employeeNumber: no, date: day });
    };

    for (const no of seen) {
        for (const day of dates) {
            addPair(no, day);
        }
    }

    if (holiday._id) {
        const bySource = await PreScheduledShift.find({
            sourceHolidayId: holiday._id,
            date: { $in: dates },
        })
            .select('employeeNumber date')
            .lean();
        for (const row of bySource) {
            addPair(row.employeeNumber, row.date);
        }
    }

    if (holiday.name) {
        const byNotes = await PreScheduledShift.find({
            date: { $in: dates },
            notes: { $regex: escapeRegex(holiday.name), $options: 'i' },
        })
            .select('employeeNumber date')
            .lean();
        for (const row of byNotes) {
            addPair(row.employeeNumber, row.date);
        }
    }

    return [...pairs.values()];
}

async function buildCleanupEntries(pairs, guessShiftFromWeekdayPattern) {
    const rosterEntries = [];
    for (const { employeeNumber, date } of pairs) {
        const shiftId = await guessShiftFromWeekdayPattern(employeeNumber, date);
        if (shiftId) {
            rosterEntries.push({
                employeeNumber,
                date,
                shiftId,
                firstHalfStatus: null,
                secondHalfStatus: null,
                status: null,
                holidaySegmentScope: null,
                holidayHalfDayType: null,
                sourceHolidayId: null,
                notes: null,
            });
        } else {
            rosterEntries.push({
                employeeNumber,
                date,
                status: 'WO',
                shiftId: null,
                firstHalfStatus: null,
                secondHalfStatus: null,
                holidaySegmentScope: null,
                holidayHalfDayType: null,
                sourceHolidayId: null,
                notes: 'Week Off',
            });
        }
    }
    return rosterEntries;
}

async function applyRosterEntriesBatched(entries, userId, applyFn, onProgress, phase) {
    if (!entries?.length) {
        if (onProgress) onProgress({ phase, completed: 0, total: 0 });
        return 0;
    }
    let completed = 0;
    const total = entries.length;
    for (let i = 0; i < entries.length; i += BATCH_SIZE) {
        const chunk = entries.slice(i, i + BATCH_SIZE);
        await applyFn(chunk, userId);
        completed += chunk.length;
        if (onProgress) onProgress({ phase, completed, total });
    }
    return total;
}

async function cleanupHolidayRosterBeforeReapply({
    holiday,
    dates,
    userId,
    resolveEmployeesForHolidayScope,
    guessShiftFromWeekdayPattern,
    applyRosterEntriesAndSync,
    onProgress,
}) {
    const pairs = await collectRosterRowsForHolidayCleanup(holiday, dates, resolveEmployeesForHolidayScope);
    const cleanupEntries = await buildCleanupEntries(pairs, guessShiftFromWeekdayPattern);
    await applyRosterEntriesBatched(
        cleanupEntries,
        userId,
        applyRosterEntriesAndSync,
        onProgress,
        'cleanup'
    );
    return cleanupEntries.length;
}

async function applyHolidayRosterWithProgress({
    employeeNumbers,
    dates,
    holidayName,
    holidayId,
    rosterFillMode,
    rosterApplyMode,
    halfDayType,
    multiShiftScope,
    guessShiftFromWeekdayPattern,
    userId,
    applyRosterEntriesAndSync,
    onProgress,
}) {
    const allEntries = await buildRosterEntriesForHoliday({
        employeeNumbers,
        dates,
        holidayName,
        holidayId,
        rosterFillMode,
        rosterApplyMode,
        halfDayType,
        multiShiftScope,
        guessShiftFromWeekdayPattern,
    });

    const totalEmployees = employeeNumbers.length;
    let processedEmployees = 0;

    for (let i = 0; i < employeeNumbers.length; i += 1) {
        const empNo = employeeNumbers[i];
        const empEntries = allEntries.filter((e) => e.employeeNumber === String(empNo).toUpperCase());
        if (empEntries.length > 0) {
            await applyRosterEntriesAndSync(empEntries, userId);
        }
        processedEmployees += 1;
        if (onProgress) {
            onProgress({
                phase: 'apply',
                completed: processedEmployees,
                total: totalEmployees,
            });
        }
    }

    return { entryCount: allEntries.length, employeeCount: totalEmployees };
}

function mergeDateRangesForUpdate(oldHoliday, newHoliday) {
    const oldDates = getHolidayDateRangeStrings(oldHoliday.date, oldHoliday.endDate);
    const newDates = getHolidayDateRangeStrings(newHoliday.date, newHoliday.endDate);
    return [...new Set([...oldDates, ...newDates])];
}

module.exports = {
    cleanupHolidayRosterBeforeReapply,
    applyHolidayRosterWithProgress,
    mergeDateRangesForUpdate,
    collectRosterRowsForHolidayCleanup,
};
