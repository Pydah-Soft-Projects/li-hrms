const Settings = require('../../settings/model/Settings');

let payrollSettingsCache = { startDay: null, endDay: null, expiresAt: 0 };
const CACHE_TTL_MS = 30 * 1000;

function invalidatePayrollSettingsCache() {
    payrollSettingsCache = { startDay: null, endDay: null, expiresAt: 0 };
}

/**
 * Get the date range for a payroll month based on settings
 * @param {number} year - Target year (e.g., 2026)
 * @param {number} monthNumber - Target month number (1-12)
 * @returns {Promise<{startDate: string, endDate: string, totalDays: number}>}
 */
async function getPayrollDateRange(year, monthNumber) {
    const y = Number(year);
    const m = Number(monthNumber);
    if (!Number.isFinite(y) || !Number.isInteger(y) || y < 1) {
        throw new Error(`Invalid year: ${year}`);
    }
    if (!Number.isFinite(m) || !Number.isInteger(m) || m < 1 || m > 12) {
        throw new Error(`Invalid monthNumber: ${monthNumber} (must be 1-12)`);
    }
    year = y;
    monthNumber = m;

    let startDay = payrollSettingsCache.startDay;
    let endDay = payrollSettingsCache.endDay;
    if (Date.now() > payrollSettingsCache.expiresAt) {
        const [startDaySetting, endDaySetting] = await Promise.all([
            Settings.findOne({ key: 'payroll_cycle_start_day' }),
            Settings.findOne({ key: 'payroll_cycle_end_day' }),
        ]);
        startDay = startDaySetting ? parseInt(startDaySetting.value, 10) : 1;
        endDay = endDaySetting ? parseInt(endDaySetting.value, 10) : 31;
        payrollSettingsCache = { startDay, endDay, expiresAt: Date.now() + CACHE_TTL_MS };
    }

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
 * Get all dates between two date strings (inclusive), UTC
 * @param {string} startDate - YYYY-MM-DD
 * @param {string} endDate - YYYY-MM-DD
 * @returns {string[]}
 */
function getAllDatesInRange(startDate, endDate) {
    const [sy, sm, sd] = startDate.split('-').map(Number);
    const [ey, em, ed] = endDate.split('-').map(Number);
    let d = new Date(Date.UTC(sy, sm - 1, sd));
    const e = new Date(Date.UTC(ey, em - 1, ed));
    const result = [];
    while (d <= e) {
        result.push(d.toISOString().split('T')[0]);
        d.setUTCDate(d.getUTCDate() + 1);
    }
    return result;
}

module.exports = {
    getPayrollDateRange,
    getAllDatesInRange,
    invalidatePayrollSettingsCache,
};
