const PayrollBatch = require('../../payroll/model/PayrollBatch');
const { getPayrollMonthKeyContainingToday, getPayrollDateRange, createISTDate } = require('../../shared/utils/dateUtils');

function toLabel(year, month) {
  return `${year}-${String(month).padStart(2, '0')}`;
}

/** Calendar step in payroll month space (use UTC to avoid DST issues). */
function addMonths(year, month, offset) {
  const d = new Date(Date.UTC(year, month - 1 + offset, 1));
  return { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1 };
}

function compareYm(a, b) {
  if (a === b) return 0;
  return a < b ? -1 : 1;
}

/**
 * A payroll month is "finished" for promotion/arrear when every batch for that month is `complete`.
 * If there is no batch yet, the month is not complete (work still open).
 */
async function isPayrollMonthComplete(year, month) {
  const rows = await PayrollBatch.find({ year, monthNumber: month }).select('status').lean();
  if (rows.length === 0) return false;
  return rows.every((b) => b.status === 'complete');
}

/**
 * Oldest (furthest in the past, within lookback) incomplete month relative to the current pay cycle;
 * that month is the operational "open" payroll. If the whole lookback is complete, we use
 * the current pay cycle and accrue through that month.
 *
 * @returns {Promise<{
 *   currentCycle: { year: number, month: number, startDate: Date, endDate: Date },
 *   containingKey: string,
 *   ongoingYear: number, ongoingMonth: number, ongoingLabel: string,
 *   arrearProrationEndYear: number, arrearProrationEndMonth: number, arrearProrationEndLabel: string
 * }>}
 */
async function getPromotionPayrollContext() {
  /**
   * Use the same YYYY-MM month key as PayRegister / PayrollBatch (getPayrollDateRange),
   * not dateCycleService.getPayrollCycleForDate — that labels some custom windows by the
   * *end* month (e.g. 1st–25th can map “today in April” to “May” cycle) and desyncs from batch keys.
   */
  const monthKey = await getPayrollMonthKeyContainingToday();
  const [cy, cm] = monthKey.split('-').map((n) => parseInt(n, 10));
  const containingKey = toLabel(cy, cm);
  const range = await getPayrollDateRange(cy, cm);
  const currentCycle = {
    year: cy,
    month: cm,
    startDate: createISTDate(range.startDate),
    endDate: createISTDate(range.endDate, '23:59'),
  };

  /** Oldest still-open run (any batch not `complete`); may differ from `containingKey` (e.g. prior month not closed). */
  const lookback = 24;
  let bestI = -1;

  for (let i = 0; i < lookback; i += 1) {
    const p = addMonths(cy, cm, -i);
    // eslint-disable-next-line no-await-in-loop
    const done = await isPayrollMonthComplete(p.year, p.month);
    if (!done) bestI = i;
  }

  if (bestI < 0) {
    // All lookback months (including current) are complete: accrue through the current pay cycle.
    return {
      currentCycle,
      containingKey,
      ongoingYear: cy,
      ongoingMonth: cm,
      ongoingLabel: toLabel(cy, cm),
      arrearProrationEndYear: cy,
      arrearProrationEndMonth: cm,
      arrearProrationEndLabel: toLabel(cy, cm),
    };
  }

  const ongoing = addMonths(cy, cm, -bestI);
  const arrear = addMonths(ongoing.year, ongoing.month, -1);

  return {
    currentCycle,
    containingKey,
    ongoingYear: ongoing.year,
    ongoingMonth: ongoing.month,
    ongoingLabel: toLabel(ongoing.year, ongoing.month),
    arrearProrationEndYear: arrear.year,
    arrearProrationEndMonth: arrear.month,
    arrearProrationEndLabel: toLabel(arrear.year, arrear.month),
  };
}

module.exports = {
  toLabel,
  addMonths,
  compareYm,
  isPayrollMonthComplete,
  getPromotionPayrollContext,
};
