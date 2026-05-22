const dateCycleService = require('./dateCycleService');
const {
  extractISTComponents,
  formatPayrollPeriodRangeEnIn,
  parseCalendarDateAsIST,
} = require('../../shared/utils/dateUtils');

function payrollCycleKey(cycle) {
  const start = extractISTComponents(cycle?.startDate).dateStr;
  const end = extractISTComponents(cycle?.endDate).dateStr;
  return `${start}|${end}`;
}

/**
 * Ensure a leave application's from/to dates fall in exactly one payroll period (IST).
 * Payroll cycles come from settings (startDay/endDay); spanning periods need separate applications.
 */
async function assertSinglePayrollPeriodForLeaveRange(fromDate, toDate) {
  const from = parseCalendarDateAsIST(fromDate);
  const to = parseCalendarDateAsIST(toDate || fromDate);
  if (!from) {
    return { ok: false, code: 'INVALID_FROM_DATE', error: 'From date is required.' };
  }
  if (!to) {
    return { ok: false, code: 'INVALID_TO_DATE', error: 'To date is required.' };
  }

  const fromYmd = extractISTComponents(from).dateStr;
  const toYmd = extractISTComponents(to).dateStr;
  if (toYmd < fromYmd) {
    return { ok: false, code: 'INVALID_DATE_RANGE', error: 'To date cannot be before from date.' };
  }

  const fromCycle = await dateCycleService.getPayrollCycleForDate(from);
  const toCycle = await dateCycleService.getPayrollCycleForDate(to);

  if (payrollCycleKey(fromCycle) === payrollCycleKey(toCycle)) {
    const startYmd = extractISTComponents(fromCycle.startDate).dateStr;
    const endYmd = extractISTComponents(fromCycle.endDate).dateStr;
    return {
      ok: true,
      payrollCycle: {
        month: fromCycle.month,
        year: fromCycle.year,
        start: startYmd,
        end: endYmd,
        label: formatPayrollPeriodRangeEnIn(startYmd, endYmd),
      },
    };
  }

  const p1Start = extractISTComponents(fromCycle.startDate).dateStr;
  const p1End = extractISTComponents(fromCycle.endDate).dateStr;
  const p2Start = extractISTComponents(toCycle.startDate).dateStr;
  const p2End = extractISTComponents(toCycle.endDate).dateStr;

  return {
    ok: false,
    code: 'LEAVE_SPANS_MULTIPLE_PAYROLL_PERIODS',
    error:
      `Leave cannot span multiple payroll periods (dates are evaluated in IST). ` +
      `${fromYmd} is in ${formatPayrollPeriodRangeEnIn(p1Start, p1End)}; ` +
      `${toYmd} is in ${formatPayrollPeriodRangeEnIn(p2Start, p2End)}. ` +
      `Submit separate leave applications—one per payroll period (e.g. apply only for ${fromYmd}, then apply again for dates in the next period).`,
    periods: [
      { start: p1Start, end: p1End, label: formatPayrollPeriodRangeEnIn(p1Start, p1End) },
      { start: p2Start, end: p2End, label: formatPayrollPeriodRangeEnIn(p2Start, p2End) },
    ],
  };
}

/**
 * Resolve payroll period bounds for a calendar date (IST), using configured cycle start/end days.
 */
async function getPayrollPeriodBoundsForLeaveDate(dateInput) {
  const anchor = parseCalendarDateAsIST(dateInput);
  if (!anchor) {
    return { ok: false, code: 'INVALID_DATE', error: 'Valid date is required (YYYY-MM-DD).' };
  }
  const cycle = await dateCycleService.getPayrollCycleForDate(anchor);
  const startYmd = extractISTComponents(cycle.startDate).dateStr;
  const endYmd = extractISTComponents(cycle.endDate).dateStr;
  const ymd = extractISTComponents(anchor).dateStr;
  return {
    ok: true,
    date: ymd,
    timezone: 'Asia/Kolkata',
    payrollCycle: {
      month: cycle.month,
      year: cycle.year,
      start: startYmd,
      end: endYmd,
      label: formatPayrollPeriodRangeEnIn(startYmd, endYmd),
      isCustomCycle: !!cycle.isCustomCycle,
    },
  };
}

module.exports = {
  assertSinglePayrollPeriodForLeaveRange,
  getPayrollPeriodBoundsForLeaveDate,
};
