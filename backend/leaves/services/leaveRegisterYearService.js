const LeaveRegisterYear = require('../model/LeaveRegisterYear');
const LeavePolicySettings = require('../../settings/model/LeavePolicySettings');
const dateCycleService = require('./dateCycleService');
const { extractISTComponents, createISTDate } = require('../../shared/utils/dateUtils');
const { computeScheduledPoolApplyCeiling } = require('./monthlyApplicationCapService');

/** YYYY-MM-DD in Asia/Kolkata (same basis as payroll cycles). */
function istDateStr(d) {
  if (d == null) return null;
  return extractISTComponents(d).dateStr;
}

/** Inclusive calendar days from IST date A through B (A <= B). */
function istInclusiveDayCount(fromDateStr, toDateStr) {
  const a = createISTDate(fromDateStr);
  const b = createISTDate(toDateStr);
  return Math.round((b.getTime() - a.getTime()) / 86400000) + 1;
}

/**
 * 12 monthly CL credits for a tier; if monthlyClCredits missing, split casualLeave evenly.
 */
function normalizeTierMonthlyCredits(tier, defaultAnnual) {
  const annual = Number(tier?.casualLeave ?? defaultAnnual ?? 12);
  const grid = tier?.monthlyClCredits;
  if (Array.isArray(grid) && grid.length === 12) {
    return grid.map((n) => Math.max(0, Number(n) || 0));
  }
  const base = annual / 12;
  const rounded = Math.round(base * 100) / 100;
  return Array.from({ length: 12 }, () => rounded);
}

/**
 * How to treat the payroll cycle that contains DOJ (join after period start).
 * - zero: no CL for that cycle (credit starts next period).
 * - majority_full: full tier cell if more than half the cycle (inclusive) remains from DOJ to cycle end; else 0.
 * - pro_rata: legacy fractional accrual by days in cycle.
 */
function resolveJoinCycleMode(options = {}) {
  if (options.joiningCycleClRule === 'zero' || options.joiningCycleClRule === 'majority_full' || options.joiningCycleClRule === 'pro_rata') {
    return options.joiningCycleClRule;
  }
  if (options.zeroJoiningPayrollCycle === true) return 'zero';
  if (options.zeroJoiningPayrollCycle === false) return 'pro_rata';
  return 'majority_full';
}

/**
 * CL credits for one payroll cycle vs DOJ.
 * - No DOJ: full cell (treat as employed whole period).
 * - Join after cycle: 0.
 * - Join on/before cycle start: full tier cell.
 * - Join during cycle: see resolveJoinCycleMode (default majority_full).
 */
function proRataClForCycle(cycleStart, cycleEnd, doj, tierCell, options = {}) {
  const mode = resolveJoinCycleMode(options);
  const cell = Number(tierCell) || 0;
  if (cell <= 0) return 0;
  if (!doj) return cell;

  const joinStr = istDateStr(doj);
  const startStr = istDateStr(cycleStart);
  const endStr = istDateStr(cycleEnd);
  if (!joinStr || !startStr || !endStr) return cell;

  if (joinStr > endStr) return 0;
  if (joinStr <= startStr) return cell;

  if (mode === 'zero') return 0;

  const daysInCycle = istInclusiveDayCount(startStr, endStr);
  const daysFromJoinToEnd = istInclusiveDayCount(joinStr, endStr);

  if (mode === 'majority_full') {
    // Credit this period when at least half the pay cycle (inclusive) remains from DOJ through period end
    if (daysFromJoinToEnd * 2 >= daysInCycle) return cell;
    return 0;
  }

  // pro_rata
  const daysInService = daysFromJoinToEnd;
  let accrual = Math.round((daysInService / daysInCycle) * cell * 100) / 100;
  if (accrual > 0 && accrual < 0.5) accrual = 0.5;
  if (accrual > 0) accrual = Math.round(accrual * 2) / 2;
  return accrual;
}

/**
 * Up to 12 payroll cycles from FY start to FY end (chronological).
 */
async function getTwelvePayrollCyclesForFY(fyStart, fyEnd) {
  const cycles = await dateCycleService.getPayrollCyclesInRange(new Date(fyStart), new Date(fyEnd));
  let ordered = [...cycles].sort((a, b) => a.startDate.getTime() - b.startDate.getTime());
  if (ordered.length >= 12) {
    return ordered.slice(0, 12);
  }
  let cursor = ordered.length
    ? new Date(ordered[ordered.length - 1].endDate)
    : new Date(fyStart);
  cursor.setDate(cursor.getDate() + 1);
  const seen = new Set(ordered.map((c) => c.startDate.getTime()));
  let guard = 0;
  while (ordered.length < 12 && cursor <= new Date(fyEnd) && guard < 24) {
    guard++;
    const c = await dateCycleService.getPayrollCycleForDate(cursor);
    const key = c.startDate.getTime();
    if (!seen.has(key)) {
      seen.add(key);
      ordered.push(c);
    }
    const next = new Date(c.endDate);
    next.setDate(next.getDate() + 1);
    cursor = next;
  }
  return ordered.slice(0, 12);
}

function monthLabel(cycle) {
  const m = cycle.month;
  const y = cycle.year;
  try {
    return `${new Date(0, m - 1).toLocaleString('en', { month: 'short' })} ${y}`;
  } catch {
    return `M${m}/${y}`;
  }
}

/**
 * Build 12 month slots with CL credits from policy grid (period 1 = first payroll cycle in FY order).
 * @param {object} [slotOptions]
 * @param {'zero'|'majority_full'|'pro_rata'} [slotOptions.joiningCycleClRule] — join-in-cycle behaviour; default majority_full.
 * @param {boolean} [slotOptions.zeroJoiningPayrollCycle] — legacy: true = zero, false = pro_rata.
 */
async function buildYearMonthSlots(resetDate, monthlyGrid, doj, slotOptions = {}) {
  let policy = {};
  try {
    policy = await LeavePolicySettings.getSettings();
  } catch {
    policy = {};
  }
  const fy = await dateCycleService.getFinancialYearForDate(resetDate);
  const cycles = await getTwelvePayrollCyclesForFY(fy.startDate, fy.endDate);
  const months = [];
  for (let i = 0; i < 12; i++) {
    const cycle = cycles[i];
    const tierCell = monthlyGrid[i] ?? 0;
    if (!cycle) {
      months.push({
        payrollMonthIndex: i + 1,
        label: `Period ${i + 1}`,
        payPeriodStart: fy.startDate,
        payPeriodEnd: fy.endDate,
        payrollCycleMonth: i + 1,
        payrollCycleYear: fy.year,
        clCredits: 0,
        elCredits: 0,
        compensatoryOffs: 0,
        lockedCredits: 0
      });
      continue;
    }
    const clCredits = proRataClForCycle(
      cycle.startDate,
      cycle.endDate,
      doj,
      tierCell,
      slotOptions
    );
    const ceiling = computeScheduledPoolApplyCeiling(
      { clCredits, elCredits: 0, compensatoryOffs: 0 },
      policy
    );
    months.push({
      payrollMonthIndex: i + 1,
      label: monthLabel(cycle),
      payPeriodStart: cycle.startDate,
      payPeriodEnd: cycle.endDate,
      payrollCycleMonth: cycle.month,
      payrollCycleYear: cycle.year,
      clCredits,
      elCredits: 0,
      compensatoryOffs: 0,
      lockedCredits: 0,
      monthlyApplyCeiling: ceiling != null ? Math.max(0, ceiling) : 0,
      monthlyApplyConsumed: 0,
      monthlyApplyLocked: 0,
      monthlyApplyApproved: 0,
    });
  }
  return { fy, months };
}

/**
 * Sum of scheduled CL credits for the year (after join pro-rata).
 */
function sumScheduledCl(months) {
  return months.reduce((s, m) => s + (Number(m.clCredits) || 0), 0);
}

/**
 * True when the payroll cycle is fully over before the given effective calendar day (IST).
 * On the cycle end date (e.g. 25th) we do NOT count that period yet — credit is earned after close.
 * Compares IST YYYY-MM-DD of payPeriodEnd vs effectiveDate.
 */
function isPayrollPeriodClosedBeforeAsOf(payPeriodEnd, effectiveDate) {
  if (!payPeriodEnd || !effectiveDate) return false;
  const endStr = istDateStr(payPeriodEnd);
  const effStr = extractISTComponents(effectiveDate).dateStr;
  return endStr < effStr;
}

/** Period finished on or before effective calendar day (IST). Used to zero past months on initial sync (incl. cycle ending on effective day). */
function isPayrollPeriodEndedOnOrBeforeAsOf(payPeriodEnd, effectiveDate) {
  if (!payPeriodEnd || !effectiveDate) return false;
  const endStr = istDateStr(payPeriodEnd);
  const effStr = extractISTComponents(effectiveDate).dateStr;
  return endStr <= effStr;
}

/**
 * Sum scheduled clCredits for payroll periods that have fully ended before effectiveDate (IST).
 * Used for initial sync / preview YTD (excludes the cycle that ends on effectiveDate, e.g. 26–25 March period on Mar 25).
 */
function sumScheduledClThroughDate(months, effectiveDate) {
  if (!effectiveDate || !Array.isArray(months)) return 0;
  let s = 0;
  for (const m of months) {
    if (!m.payPeriodEnd) continue;
    if (!isPayrollPeriodClosedBeforeAsOf(m.payPeriodEnd, effectiveDate)) continue;
    s += Number(m.clCredits) || 0;
  }
  return Math.round(s * 2) / 2;
}

/**
 * Append one CL CREDIT per slot equal to clCredits (policy schedule). Call after clCredits finalised (incl. carry on slot 0).
 * Transaction dates use payPeriodEnd so balances “as of” a calendar day exclude the cycle that ends that day (IST).
 * @param {object} [opts]
 * @param {Date} [opts.throughDate] — if set, only post CREDIT for periods with payPeriodEnd (IST) strictly before throughDate’s calendar day.
 */
function appendMonthlyClScheduledCreditTransactions(monthsPayload, opts = {}) {
  if (!Array.isArray(monthsPayload)) return;
  const through = opts.throughDate != null ? opts.throughDate : null;
  for (const m of monthsPayload) {
    if (through != null && m.payPeriodEnd) {
      if (!isPayrollPeriodClosedBeforeAsOf(m.payPeriodEnd, through)) continue;
    }
    const d = Number(m.clCredits) || 0;
    if (d <= 0) continue;
    if (!m.transactions) m.transactions = [];
    const creditAt = m.payPeriodEnd ? new Date(m.payPeriodEnd) : m.payPeriodStart ? new Date(m.payPeriodStart) : new Date();
    m.transactions.push({
      at: creditAt,
      leaveType: 'CL',
      transactionType: 'CREDIT',
      days: d,
      openingBalance: 0,
      closingBalance: 0,
      startDate: creditAt,
      endDate: creditAt,
      reason: `Scheduled CL — ${m.label || `period ${m.payrollMonthIndex}`}: ${d} day(s) (policy month ${m.payrollMonthIndex})`,
      status: 'APPROVED',
      autoGenerated: true,
      autoGeneratedType: 'MONTHLY_CL_SCHEDULE',
    });
  }
}

async function upsertLeaveRegisterYear({
  employeeId,
  empNo,
  employeeName,
  resetDate,
  casualBalance,
  compensatoryOffBalance,
  months,
  yearlyTransactions,
  yearlyPolicyClScheduledTotal,
  source = 'ANNUAL_RESET'
}) {
  const fy = await dateCycleService.getFinancialYearForDate(resetDate);
  const setDoc = {
    empNo,
    employeeName: employeeName || '',
    financialYear: fy.name,
    financialYearStart: fy.startDate,
    financialYearEnd: fy.endDate,
    casualBalance,
    compensatoryOffBalance,
    months,
    yearlyTransactions,
    resetAt: resetDate,
    source
  };
  if (yearlyPolicyClScheduledTotal != null && Number.isFinite(Number(yearlyPolicyClScheduledTotal))) {
    setDoc.yearlyPolicyClScheduledTotal = Math.round(Number(yearlyPolicyClScheduledTotal) * 100) / 100;
  }
  return LeaveRegisterYear.findOneAndUpdate(
    { employeeId, financialYear: fy.name },
    {
      $set: setDoc
    },
    { upsert: true, new: true }
  );
}

async function findByEmployeeAndFY(employeeId, financialYearName) {
  return LeaveRegisterYear.findOne({ employeeId, financialYear: financialYearName }).lean();
}

/** True if this FY row was already created by new-hire CL onboarding (idempotent init). */
async function hasEmployeeOnboardingYear(employeeId, financialYearName) {
  if (!employeeId || !financialYearName) return false;
  const doc = await LeaveRegisterYear.findOne({
    employeeId,
    financialYear: String(financialYearName).trim(),
    source: 'EMPLOYEE_ONBOARDING',
  })
    .select('_id')
    .lean();
  return !!doc;
}

module.exports = {
  normalizeTierMonthlyCredits,
  proRataClForCycle,
  resolveJoinCycleMode,
  buildYearMonthSlots,
  sumScheduledCl,
  isPayrollPeriodClosedBeforeAsOf,
  isPayrollPeriodEndedOnOrBeforeAsOf,
  sumScheduledClThroughDate,
  appendMonthlyClScheduledCreditTransactions,
  upsertLeaveRegisterYear,
  findByEmployeeAndFY,
  hasEmployeeOnboardingYear,
  getTwelvePayrollCyclesForFY,
};
