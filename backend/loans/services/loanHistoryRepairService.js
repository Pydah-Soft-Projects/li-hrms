/**
 * Repair historical / open loan & salary-advance documents for correct EMI, interest, totals,
 * payroll-anchored schedule dates, and next payment (pay period end).
 * Used by GET loan self-heal path via re-export from controller, and by maintenance scripts.
 */

const LoanSettings = require('../model/LoanSettings');
const {
  createISTDate,
  extractISTComponents,
  getPayrollDateRange,
  addCalendarMonthsToYm,
  getPayrollMonthKeyContainingDateString,
} = require('../../shared/utils/dateUtils');

const CLOSED_STATUSES = ['rejected', 'cancelled', 'completed'];

const {
  buildLoanInstallmentPlan,
  applyInstallmentPlanToLoan,
  getEffectiveInstallmentCount,
  getDueInstallmentAmount,
} = require('./loanInstallmentScheduleService');

function calculateEMI(principal, interestRate, duration) {
  const p = Number(principal) || 0;
  const d = Math.max(1, Number(duration) || 1);
  let totalInterest;
  let totalAmount;
  if (interestRate === 0 || !interestRate) {
    totalInterest = 0;
    totalAmount = p;
  } else {
    totalInterest = Math.round((p * interestRate * (d / 12)) / 100);
    totalAmount = Math.round(p + totalInterest);
  }
  const plan = buildLoanInstallmentPlan(totalAmount, d);
  return {
    emiAmount: plan.emiAmount,
    finalEmiAmount: plan.finalEmiAmount,
    installmentSchedule: plan.installmentSchedule,
    totalInstallments: plan.totalInstallments,
    regularInstallmentCount: plan.regularInstallmentCount,
    requestedDuration: plan.requestedDuration,
    totalInterest,
    totalAmount,
  };
}

function inferInterestRateFromRecorded(loan) {
  const p = Number(loan.amount);
  const d = Number(loan.duration);
  const ti = Number(loan.interestAmount ?? loan.loanConfig?.totalInterest);
  if (!p || !d || !ti || ti <= 0) return null;
  const r = (ti * 100) / (p * (d / 12));
  if (!Number.isFinite(r) || r < 0) return null;
  return Math.round(r * 1000) / 1000;
}

function loanConfigNeedsRepair(loan) {
  if (loan.requestType !== 'loan') return false;
  const emi = Number(loan.loanConfig?.emiAmount);
  const tot = Number(loan.loanConfig?.totalAmount);
  return !(emi > 0) || !(tot > 0);
}

function shouldSelfHealLoan(loan) {
  if (loan.requestType !== 'loan') return false;
  if (loanConfigNeedsRepair(loan)) return true;
  if (!loan.loanConfig?.startDate) return true;
  const ti = Number(loan.interestAmount);
  const emi = Number(loan.loanConfig?.emiAmount);
  return ti > 0 && !(emi > 0);
}

function normalizePayrollMonthKey(ym) {
  const raw = String(ym || '').trim();
  if (/^\d{4}-\d{2}$/.test(raw)) return raw;
  const full = /^full:(\d{4}-\d{2})$/.exec(raw);
  if (full) return full[1];
  return null;
}

function comparePayrollMonthKeys(a, b) {
  return String(a).localeCompare(String(b));
}

/** True when approver never locked first EMI / advance deduction month (legacy approved loans). */
function needsFirstDeductionPayPeriodSelection(loan) {
  const locked = String(loan.approvals?.final?.firstDeductionPayrollMonth || '').trim();
  if (/^\d{4}-\d{2}$/.test(locked)) return false;
  if (loan.requestType === 'salary_advance') {
    const cycle = String(loan.advanceConfig?.deductionStartCycle || '').trim();
    if (/^\d{4}-\d{2}$/.test(cycle)) return false;
  }
  return true;
}

async function computeLoanPayrollAnchorsFromMonthKey(payrollMonthKey, durationMonths) {
  const ym = normalizePayrollMonthKey(payrollMonthKey);
  if (!ym) throw new Error('Invalid payroll month (expected YYYY-MM)');
  const dur = Math.max(1, Number(durationMonths) || 1);
  const [fy, fm] = ym.split('-').map(Number);
  const firstRange = await getPayrollDateRange(fy, fm);
  const lastYm = addCalendarMonthsToYm(ym, dur - 1);
  const [ly, lm] = lastYm.split('-').map(Number);
  const lastRange = await getPayrollDateRange(ly, lm);
  return {
    payrollMonthKey: ym,
    startDate: createISTDate(firstRange.startDate),
    endDate: createISTDate(lastRange.endDate),
    firstDueDate: createISTDate(firstRange.endDate),
  };
}

async function computeLoanPayrollAnchors(referenceDate, durationMonths) {
  const { year: y0, month: m0 } = extractISTComponents(referenceDate);
  const firstYm = addCalendarMonthsToYm(`${y0}-${String(m0).padStart(2, '0')}`, 1);
  return computeLoanPayrollAnchorsFromMonthKey(firstYm, durationMonths);
}

/**
 * Set repayment schedule from approver-selected first deduction payroll month.
 * nextPaymentDate = end of that pay period (via setNextPaymentDateFromInstallmentsPaid).
 */
function syncRemainingBalanceFromTotals(loan) {
  if (!loan.repayment) loan.repayment = {};
  const paid = Number(loan.repayment.totalPaid) || 0;
  if (paid > 0) return;
  const total =
    loan.requestType === 'loan'
      ? Number(loan.loanConfig?.totalAmount) || Number(loan.amount) || 0
      : Number(loan.amount) || 0;
  loan.repayment.remainingBalance = total;
  loan.markModified('repayment');
}

async function applyRepaymentScheduleFromPayrollMonth(loan, payrollMonthKey) {
  const ym = normalizePayrollMonthKey(payrollMonthKey);
  if (!ym) throw new Error('Invalid first deduction payroll month (expected YYYY-MM)');

  if (loan.requestType === 'loan') {
    const duration = Math.max(1, getEffectiveInstallmentCount(loan) || Number(loan.duration) || 1);
    const anchors = await computeLoanPayrollAnchorsFromMonthKey(ym, duration);
    if (!loan.loanConfig) loan.loanConfig = {};
    loan.loanConfig.startDate = anchors.startDate;
    loan.loanConfig.endDate = anchors.endDate;
    if (!loan.repayment) loan.repayment = {};
    if (!(Number(loan.repayment.totalInstallments) > 0)) {
      loan.repayment.totalInstallments = getEffectiveInstallmentCount(loan) || duration;
    }
    await setNextPaymentDateFromInstallmentsPaid(loan);
    syncRemainingBalanceFromTotals(loan);
    loan.markModified('loanConfig');
    loan.markModified('repayment');
  } else if (loan.requestType === 'salary_advance') {
    const duration = Math.max(1, Number(loan.duration) || 1);
    if (!loan.advanceConfig) loan.advanceConfig = {};
    loan.advanceConfig.deductionStartCycle = ym;
    loan.advanceConfig.deductionCycles = duration;
    const amount = Number(loan.amount) || 0;
    if (!(Number(loan.advanceConfig.deductionPerCycle) > 0) && amount > 0) {
      loan.advanceConfig.deductionPerCycle = Math.round(amount / duration);
    }
    if (!loan.repayment) loan.repayment = {};
    if (!(Number(loan.repayment.totalInstallments) > 0)) {
      loan.repayment.totalInstallments = duration;
    }
    await setNextPaymentDateFromInstallmentsPaid(loan);
    syncRemainingBalanceFromTotals(loan);
    loan.markModified('advanceConfig');
    loan.markModified('repayment');
  }

  return ym;
}

/** Whether this loan/advance should deduct EMI/advance in the given payroll month (YYYY-MM). */
async function isRepaymentDueForPayrollMonth(loan, payrollMonth) {
  const ym = normalizePayrollMonthKey(payrollMonth);
  if (!ym) return true;
  const remaining = Number(loan.repayment?.remainingBalance);
  if (!(remaining > 0)) return false;

  const paid = Number(loan.repayment?.installmentsPaid) || 0;
  const totalInstallments = getEffectiveInstallmentCount(loan) || Number(loan.duration) || 0;
  if (totalInstallments > 0 && paid >= totalInstallments) return false;

  const firstYm = await firstPayrollMonthKeyForRepaymentSchedule(loan);
  if (!firstYm) return false;

  const dueYm = addCalendarMonthsToYm(firstYm, paid);
  return comparePayrollMonthKeys(ym, dueYm) === 0;
}

/**
 * First payroll month key (YYYY-MM) for repayment schedule: payroll period that contains the
 * stored schedule anchor when present; otherwise disburse/applied + 1 calendar month (same as anchors).
 */
async function firstPayrollMonthKeyForRepaymentSchedule(loan) {
  const locked = String(loan.approvals?.final?.firstDeductionPayrollMonth || '').trim();
  if (/^\d{4}-\d{2}$/.test(locked)) return locked;

  if (loan.requestType === 'salary_advance' && loan.advanceConfig?.deductionStartCycle) {
    const m = String(loan.advanceConfig.deductionStartCycle).trim();
    if (/^\d{4}-\d{2}$/.test(m)) return m;
  }
  if (loan.requestType === 'loan' && loan.loanConfig?.startDate) {
    const ds = extractISTComponents(loan.loanConfig.startDate).dateStr;
    return getPayrollMonthKeyContainingDateString(ds);
  }
  const ref = loan.disbursement?.disbursedAt || loan.appliedAt || loan.createdAt || new Date();
  const { year: y0, month: m0 } = extractISTComponents(ref);
  return addCalendarMonthsToYm(`${y0}-${String(m0).padStart(2, '0')}`, 1);
}

/** Next due = pay period end for the payroll month after `installmentsPaid` cycles from schedule start. */
async function setNextPaymentDateFromInstallmentsPaid(loan) {
  if (loan.requestType !== 'loan' && loan.requestType !== 'salary_advance') return;
  if (!loan.repayment) loan.repayment = {};
  const remaining = Number(loan.repayment.remainingBalance);
  if (!(remaining > 0)) {
    loan.repayment.nextPaymentDate = null;
    return;
  }
  const paid = Number(loan.repayment.installmentsPaid) || 0;
  const firstYm = await firstPayrollMonthKeyForRepaymentSchedule(loan);
  const nextYm = addCalendarMonthsToYm(firstYm, paid);
  const [py, pm] = nextYm.split('-').map(Number);
  const pr = await getPayrollDateRange(py, pm);
  loan.repayment.nextPaymentDate = createISTDate(pr.endDate);
}

/**
 * Same behaviour as loanController.syncLoanMoneyAndPayrollSchedule (single source for self-heal + scripts).
 */
async function syncLoanMoneyAndPayrollSchedule(loan, opts = {}) {
  const { fromDisburse = false } = opts;
  if (loan.requestType !== 'loan') return false;
  if (!loan.loanConfig) loan.loanConfig = {};
  const heal = shouldSelfHealLoan(loan);
  const settings = await LoanSettings.findOne({ type: 'loan', isActive: true });
  let rate = Number(loan.loanConfig.interestRate);
  if (!Number.isFinite(rate) || rate < 0) rate = 0;
  if (rate === 0) {
    const inferred = inferInterestRateFromRecorded(loan);
    if (inferred != null) rate = inferred;
    else rate = settings?.interestRate || 0;
  }
  loan.loanConfig.interestRate = rate;
  const principal = Number(loan.amount);
  const duration = Number(loan.duration);
  if (!principal || !duration) return false;
  const { emiAmount, totalInterest, totalAmount, installmentSchedule, finalEmiAmount, totalInstallments, regularInstallmentCount, requestedDuration } = calculateEMI(principal, rate, duration);
  if (heal) {
    loan.loanConfig.emiAmount = emiAmount;
    loan.loanConfig.finalEmiAmount = finalEmiAmount;
    loan.loanConfig.installmentSchedule = installmentSchedule;
    loan.loanConfig.regularInstallmentCount = regularInstallmentCount;
    loan.loanConfig.requestedDuration = requestedDuration;
    loan.loanConfig.totalInterest = totalInterest;
    loan.loanConfig.totalAmount = totalAmount;
    loan.interestAmount = totalInterest;
    loan.repayment.totalInstallments = totalInstallments;
    if (loan.repayment && !(Number(loan.repayment.totalPaid) > 0)) {
      loan.repayment.remainingBalance = totalAmount;
    } else if (loan.repayment) {
      loan.repayment.remainingBalance = Math.max(0, totalAmount - (Number(loan.repayment.totalPaid) || 0));
    }
    loan.markModified('loanConfig');
    loan.markModified('repayment');
  }
  const scheduleLockedAtFinal = Boolean(loan.approvals?.final?.firstDeductionPayrollMonth);
  const ref = loan.disbursement?.disbursedAt || loan.appliedAt || loan.createdAt || new Date();
  if ((heal || fromDisburse) && !scheduleLockedAtFinal) {
    const anchors = await computeLoanPayrollAnchors(ref, totalInstallments || duration);
    loan.loanConfig.startDate = anchors.startDate;
    loan.loanConfig.endDate = anchors.endDate;
    loan.markModified('loanConfig');
    await setNextPaymentDateFromInstallmentsPaid(loan);
    loan.markModified('repayment');
  } else if (scheduleLockedAtFinal && loan.repayment) {
    await setNextPaymentDateFromInstallmentsPaid(loan);
    loan.markModified('repayment');
  }
  if (loan.repayment && Number(loan.repayment.remainingBalance) <= 0 && !CLOSED_STATUSES.includes(loan.status)) {
    loan.status = 'completed';
    loan.repayment.remainingBalance = 0;
    loan.repayment.nextPaymentDate = null;
    loan.markModified('repayment');
  }
  return heal || fromDisburse;
}

/**
 * History script: always realign financials + schedule for non-closed loans (safe with partial payments).
 */
async function repairOpenLoanForHistory(loan) {
  if (loan.requestType !== 'loan') return { changed: false, reason: 'not_loan' };
  if (CLOSED_STATUSES.includes(loan.status)) return { changed: false, reason: 'closed' };
  if (loan.isActive === false) return { changed: false, reason: 'inactive' };

  if (!loan.loanConfig) loan.loanConfig = {};
  const settings = await LoanSettings.findOne({ type: 'loan', isActive: true });
  let rate = Number(loan.loanConfig.interestRate);
  if (!Number.isFinite(rate) || rate < 0) rate = 0;
  if (rate === 0) {
    const inferred = inferInterestRateFromRecorded(loan);
    if (inferred != null) rate = inferred;
    else rate = settings?.interestRate || 0;
  }
  loan.loanConfig.interestRate = rate;
  const principal = Number(loan.amount);
  const duration = Number(loan.duration);
  if (!principal || !duration) return { changed: false, reason: 'bad_amount_duration' };

  const emiResult = calculateEMI(principal, rate, duration);
  let changed = false;

  if (
    Number(loan.loanConfig.emiAmount) !== emiResult.emiAmount
    || Number(loan.loanConfig.totalInterest) !== emiResult.totalInterest
    || Number(loan.loanConfig.totalAmount) !== emiResult.totalAmount
    || Number(loan.interestAmount) !== emiResult.totalInterest
    || Number(loan.loanConfig.finalEmiAmount) !== emiResult.finalEmiAmount
    || Number(loan.repayment?.totalInstallments) !== emiResult.totalInstallments
  ) {
    loan.loanConfig.emiAmount = emiResult.emiAmount;
    loan.loanConfig.finalEmiAmount = emiResult.finalEmiAmount;
    loan.loanConfig.installmentSchedule = emiResult.installmentSchedule;
    loan.loanConfig.regularInstallmentCount = emiResult.regularInstallmentCount;
    loan.loanConfig.requestedDuration = emiResult.requestedDuration;
    loan.loanConfig.totalInterest = emiResult.totalInterest;
    loan.loanConfig.totalAmount = emiResult.totalAmount;
    loan.interestAmount = emiResult.totalInterest;
    loan.repayment.totalInstallments = emiResult.totalInstallments;
    changed = true;
  }

  if (loan.repayment) {
    const totalPaid = Number(loan.repayment.totalPaid) || 0;
    const rb = Math.max(0, emiResult.totalAmount - totalPaid);
    if (Number(loan.repayment.remainingBalance) !== rb) {
      loan.repayment.remainingBalance = rb;
      changed = true;
    }
    if (rb <= 0 && loan.status !== 'completed') {
      loan.status = 'completed';
      loan.repayment.remainingBalance = 0;
      loan.repayment.nextPaymentDate = null;
      changed = true;
    }
  }

  const ref = loan.disbursement?.disbursedAt || loan.appliedAt || loan.createdAt || new Date();
  const anchors = await computeLoanPayrollAnchors(ref, duration);
  const sd = anchors.startDate?.getTime?.() ?? new Date(anchors.startDate).getTime();
  const ed = anchors.endDate?.getTime?.() ?? new Date(anchors.endDate).getTime();
  const curSd = loan.loanConfig.startDate ? new Date(loan.loanConfig.startDate).getTime() : 0;
  const curEd = loan.loanConfig.endDate ? new Date(loan.loanConfig.endDate).getTime() : 0;
  if (sd !== curSd || ed !== curEd) {
    loan.loanConfig.startDate = anchors.startDate;
    loan.loanConfig.endDate = anchors.endDate;
    changed = true;
  }

  if (loan.status !== 'completed') {
    const prevNext = loan.repayment?.nextPaymentDate ? new Date(loan.repayment.nextPaymentDate).getTime() : null;
    await setNextPaymentDateFromInstallmentsPaid(loan);
    const nextNext = loan.repayment?.nextPaymentDate ? new Date(loan.repayment.nextPaymentDate).getTime() : null;
    if (prevNext !== nextNext) changed = true;
  }

  if (changed) {
    loan.markModified('loanConfig');
    loan.markModified('repayment');
  }
  return { changed, emp_no: loan.emp_no, _id: loan._id };
}

async function repairOpenSalaryAdvanceForHistory(loan) {
  if (loan.requestType !== 'salary_advance') return { changed: false, reason: 'not_advance' };
  if (CLOSED_STATUSES.includes(loan.status)) return { changed: false, reason: 'closed' };
  if (loan.isActive === false) return { changed: false, reason: 'inactive' };

  if (!loan.advanceConfig) loan.advanceConfig = {};
  if (!loan.repayment) loan.repayment = {};

  const amount = Number(loan.amount);
  const duration = Math.max(1, Number(loan.duration) || 1);
  let changed = false;

  const perCycle = Math.round(amount / duration);
  if (!(Number(loan.advanceConfig.deductionPerCycle) > 0) || loan.advanceConfig.deductionCycles !== duration) {
    loan.advanceConfig.deductionPerCycle = perCycle;
    loan.advanceConfig.deductionCycles = duration;
    changed = true;
  }

  const totalPaid = Number(loan.repayment.totalPaid) || 0;
  const rb = Math.max(0, amount - totalPaid);
  if (Number(loan.repayment.remainingBalance) !== rb) {
    loan.repayment.remainingBalance = rb;
    changed = true;
  }
  if (rb <= 0 && loan.status !== 'completed') {
    loan.status = 'completed';
    loan.repayment.remainingBalance = 0;
    loan.repayment.nextPaymentDate = null;
    changed = true;
  }

  if (loan.status !== 'completed' && rb > 0) {
    if (!loan.advanceConfig.deductionStartCycle) {
      loan.advanceConfig.deductionStartCycle = await firstPayrollMonthKeyForRepaymentSchedule(loan);
      changed = true;
    }
    const prevNext = loan.repayment?.nextPaymentDate ? new Date(loan.repayment.nextPaymentDate).getTime() : null;
    await setNextPaymentDateFromInstallmentsPaid(loan);
    const nextNext = loan.repayment?.nextPaymentDate ? new Date(loan.repayment.nextPaymentDate).getTime() : null;
    if (prevNext !== nextNext) changed = true;
  } else if (loan.repayment?.nextPaymentDate) {
    loan.repayment.nextPaymentDate = null;
    changed = true;
  }

  if (changed) loan.markModified('advanceConfig');
  if (changed) loan.markModified('repayment');
  return { changed, emp_no: loan.emp_no, _id: loan._id };
}

/**
 * @param {object} options
 * @param {boolean} [options.loans=true]
 * @param {boolean} [options.advances=true]
 * @param {boolean} [options.dryRun=false]
 */
async function repairAllOpenLoansAndAdvances(options = {}) {
  const Loan = require('../model/Loan');
  const { loans = true, advances = true, dryRun = false } = options;
  const summary = { loansChecked: 0, loansUpdated: 0, advancesChecked: 0, advancesUpdated: 0, errors: [] };

  if (loans) {
    const cursor = Loan.find({
      requestType: 'loan',
      status: { $nin: CLOSED_STATUSES },
      isActive: { $ne: false },
    }).cursor();

    for await (const loan of cursor) {
      summary.loansChecked += 1;
      try {
        const r = await repairOpenLoanForHistory(loan);
        if (r.changed) {
          summary.loansUpdated += 1;
          if (!dryRun) await loan.save();
        }
      } catch (e) {
        summary.errors.push({ id: loan._id.toString(), type: 'loan', message: e.message });
      }
    }
  }

  if (advances) {
    const cursor = Loan.find({
      requestType: 'salary_advance',
      status: { $nin: CLOSED_STATUSES },
      isActive: { $ne: false },
    }).cursor();

    for await (const loan of cursor) {
      summary.advancesChecked += 1;
      try {
        const r = await repairOpenSalaryAdvanceForHistory(loan);
        if (r.changed) {
          summary.advancesUpdated += 1;
          if (!dryRun) await loan.save();
        }
      } catch (e) {
        summary.errors.push({ id: loan._id.toString(), type: 'salary_advance', message: e.message });
      }
    }
  }

  return summary;
}

module.exports = {
  calculateEMI,
  buildLoanInstallmentPlan,
  applyInstallmentPlanToLoan,
  getEffectiveInstallmentCount,
  getDueInstallmentAmount,
  inferInterestRateFromRecorded,
  loanConfigNeedsRepair,
  shouldSelfHealLoan,
  normalizePayrollMonthKey,
  comparePayrollMonthKeys,
  computeLoanPayrollAnchors,
  computeLoanPayrollAnchorsFromMonthKey,
  applyRepaymentScheduleFromPayrollMonth,
  needsFirstDeductionPayPeriodSelection,
  isRepaymentDueForPayrollMonth,
  firstPayrollMonthKeyForRepaymentSchedule,
  setNextPaymentDateFromInstallmentsPaid,
  syncLoanMoneyAndPayrollSchedule,
  repairOpenLoanForHistory,
  repairOpenSalaryAdvanceForHistory,
  repairAllOpenLoansAndAdvances,
  CLOSED_STATUSES,
};
