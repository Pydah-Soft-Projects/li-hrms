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

/** Batch is fully processed for "this pay month is closed" when complete or frozen. */
const SETTLED_BATCH_STATUSES = new Set(['complete', 'freeze']);

/**
 * A payroll month is "settled" for ongoing/backlog when, for the relevant scope:
 * - there is no batch (nothing to wait on for that scope), or
 * - that batch is `complete` or `freeze` (not `pending` or `approved`).
 *
 * @param {object} [employeeScope] - If set, only the batch for this division+department counts
 *   (one batch per dept per month). If omitted, **all** batches for that calendar month must be settled.
 */
async function isPayrollMonthSettled(year, month, employeeScope) {
  const q = { year, monthNumber: month };
  if (employeeScope?.divisionId && employeeScope?.departmentId) {
    q.division = employeeScope.divisionId;
    q.department = employeeScope.departmentId;
  }
  const rows = await PayrollBatch.find(q).select('status').lean();
  if (rows.length === 0) return true;
  return rows.every((b) => SETTLED_BATCH_STATUSES.has(b.status));
}

/** @deprecated use isPayrollMonthSettled — kept for callers expecting the old name */
async function isPayrollMonthComplete(year, month, employeeScope) {
  return isPayrollMonthSettled(year, month, employeeScope);
}

/**
 * Promotion payroll “ongoing” is decided **only** from the month **immediately before** the
 * current pay run (`containingKey`). We do not walk further back (no multi-month lookback).
 *
 * - If that previous month is **not** settled (any batch `pending` or `approved`) → that
 *   month is the operational ongoing run.
 * - If it **is** settled (no batches, or all `complete`/`freeze`) → the **current** pay
 *   cycle is ongoing. Older months are ignored: once the previous month is done, we only
 *   look forward from there.
 *
 * @returns {Promise<{
 *   currentCycle: { year: number, month: number, startDate: Date, endDate: Date },
 *   containingKey: string,
 *   ongoingYear: number, ongoingMonth: number, ongoingLabel: string,
 *   arrearProrationEndYear: number, arrearProrationEndMonth: number, arrearProrationEndLabel: string
 * }>}
 * @param {{ divisionId: import('mongoose').Types.ObjectId, departmentId: import('mongoose').Types.ObjectId } | null | undefined} [employeeScope]
 *   When provided, "ongoing" follows **that employee's** department batch only, not all company batches.
 */
async function getPromotionPayrollContext(employeeScope) {
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

  /** Only the pay month one step before the current run is evaluated for backlog. */
  const previousPayMonth = addMonths(cy, cm, -1);
  const previousSettled = await isPayrollMonthSettled(previousPayMonth.year, previousPayMonth.month, employeeScope);

  if (!previousSettled) {
    const arrear = addMonths(previousPayMonth.year, previousPayMonth.month, -1);
    return {
      currentCycle,
      containingKey,
      ongoingYear: previousPayMonth.year,
      ongoingMonth: previousPayMonth.month,
      ongoingLabel: toLabel(previousPayMonth.year, previousPayMonth.month),
      arrearProrationEndYear: arrear.year,
      arrearProrationEndMonth: arrear.month,
      arrearProrationEndLabel: toLabel(arrear.year, arrear.month),
    };
  }

  // Previous month is all complete|freeze (or has no batches): current pay cycle is ongoing.
  return {
    currentCycle,
    containingKey,
    ongoingYear: cy,
    ongoingMonth: cm,
    ongoingLabel: toLabel(cy, cm),
    arrearProrationEndYear: previousPayMonth.year,
    arrearProrationEndMonth: previousPayMonth.month,
    arrearProrationEndLabel: toLabel(previousPayMonth.year, previousPayMonth.month),
  };
}

module.exports = {
  toLabel,
  addMonths,
  compareYm,
  isPayrollMonthSettled,
  isPayrollMonthComplete,
  getPromotionPayrollContext,
};
