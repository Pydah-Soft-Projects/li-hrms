const Settings = require('../../settings/model/Settings');

/**
 * Compute the payroll period's start date, end date, and total inclusive days for the given year and month using configured payroll_cycle_start_day and payroll_cycle_end_day settings.
 * @param {number} year - Target year (e.g., 2026).
 * @param {number} monthNumber - Target month number (1-12).
 * @returns {{startDate: string, endDate: string, totalDays: number, startDay: number, endDay: number}} Object containing ISO date strings for `startDate` and `endDate`, the inclusive `totalDays`, and the resolved `startDay` and `endDay` used to compute the range.
 */
async function getPayrollDateRange(year, monthNumber) {
    // Fetch start and end days from settings
    const startDaySetting = await Settings.findOne({ key: 'payroll_cycle_start_day' });
    const endDaySetting = await Settings.findOne({ key: 'payroll_cycle_end_day' });

    const startDay = startDaySetting ? parseInt(startDaySetting.value) : 1;
    const endDay = endDaySetting ? parseInt(endDaySetting.value) : 31;

    if (startDay === 1 && endDay >= 28) {
        // Treat as full calendar month
        const startDate = `${year}-${String(monthNumber).padStart(2, '0')}-01`;
        const lastDayInMonth = new Date(year, monthNumber, 0).getDate();
        // Use the minimum of endDay and actual last day
        const resolvedEndDay = Math.min(endDay, lastDayInMonth);
        const endDate = `${year}-${String(monthNumber).padStart(2, '0')}-${String(resolvedEndDay).padStart(2, '0')}`;

        return {
            startDate,
            endDate,
            totalDays: resolvedEndDay,
            startDay,
            endDay
        };
    }

    // Dynamic logic:
    // If Start Day <= End Day: Likely within the same calendar month
    // If Start Day > End Day: Likely spans from previous month to current month

    let startDateStr, endDateStr;

    if (startDay < endDay) {
        // Same month (e.g., 1st to 15th)
        const lastDayInMonth = new Date(year, monthNumber, 0).getDate();
        const resolvedStartDay = Math.min(startDay, lastDayInMonth);
        const resolvedEndDay = Math.min(endDay, lastDayInMonth);

        startDateStr = `${year}-${String(monthNumber).padStart(2, '0')}-${String(resolvedStartDay).padStart(2, '0')}`;
        endDateStr = `${year}-${String(monthNumber).padStart(2, '0')}-${String(resolvedEndDay).padStart(2, '0')}`;
    } else {
        // Spans months (e.g., 26th of prev to 25th of current)
        const prevMonthDate = new Date(year, monthNumber - 2, 1);
        const prevYear = prevMonthDate.getFullYear();
        const prevMonth = prevMonthDate.getMonth() + 1;
        const prevMonthLastDay = new Date(prevYear, prevMonth, 0).getDate();

        const resolvedStartDay = Math.min(startDay, prevMonthLastDay);
        startDateStr = `${prevYear}-${String(prevMonth).padStart(2, '0')}-${String(resolvedStartDay).padStart(2, '0')}`;

        const currMonthLastDay = new Date(year, monthNumber, 0).getDate();
        const resolvedEndDay = Math.min(endDay, currMonthLastDay);
        endDateStr = `${year}-${String(monthNumber).padStart(2, '0')}-${String(resolvedEndDay).padStart(2, '0')}`;
    }

    // Calculate total days
    const start = new Date(startDateStr);
    const end = new Date(endDateStr);
    const diffTime = Math.abs(end - start);
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;

    return {
        startDate: startDateStr,
        endDate: endDateStr,
        totalDays: diffDays,
        startDay,
        endDay
    };
}

/**
 * Generate all calendar dates between two ISO date strings (inclusive).
 * @param {string} startDate - Start date in `YYYY-MM-DD` format.
 * @param {string} endDate - End date in `YYYY-MM-DD` format.
 * @returns {string[]} An array of dates in `YYYY-MM-DD` format covering the inclusive range from `startDate` to `endDate`.
 */
function getAllDatesInRange(startDate, endDate) {
    const result = [];
    let d = new Date(startDate);
    const e = new Date(endDate);
    while (d <= e) {
        result.push(d.toISOString().split('T')[0]);
        d.setUTCDate(d.getUTCDate() + 1);
    }
    return result;
}

module.exports = {
    getPayrollDateRange,
    getAllDatesInRange
};