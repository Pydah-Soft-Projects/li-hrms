/**
 * Holiday calendar dates — always interpreted in IST (Asia/Kolkata).
 * HTML date inputs and roster keys use YYYY-MM-DD in IST.
 */
const {
    createISTDate,
    extractISTComponents,
    parseCalendarDateAsIST,
    getAllDatesInRange,
} = require('../../shared/utils/dateUtils');

function toHolidayDateString(input) {
    if (input == null || input === '') return null;
    return extractISTComponents(input).dateStr;
}

function parseHolidayCalendarDate(input) {
    return parseCalendarDateAsIST(input);
}

function getHolidayDateRangeStrings(startInput, endInput) {
    const startParsed = parseHolidayCalendarDate(startInput) || new Date(startInput);
    const startStr = toHolidayDateString(startParsed);
    if (!startStr) return [];
    let endStr = startStr;
    if (endInput != null && endInput !== '') {
        const endParsed = parseHolidayCalendarDate(endInput) || new Date(endInput);
        endStr = toHolidayDateString(endParsed) || startStr;
    }
    return getAllDatesInRange(startStr, endStr);
}

function getHolidayYearBounds(year) {
    const y = Number(year);
    return {
        start: createISTDate(`${y}-01-01`, '00:00'),
        end: createISTDate(`${y}-12-31`, '23:59'),
    };
}

function getHolidayYearMongoFilter(year) {
    const { start, end } = getHolidayYearBounds(year);
    return {
        $or: [
            { date: { $gte: start, $lte: end } },
            { endDate: { $gte: start, $lte: end } },
        ],
    };
}

module.exports = {
    toHolidayDateString,
    parseHolidayCalendarDate,
    getHolidayDateRangeStrings,
    getHolidayYearBounds,
    getHolidayYearMongoFilter,
    createISTDate,
};
