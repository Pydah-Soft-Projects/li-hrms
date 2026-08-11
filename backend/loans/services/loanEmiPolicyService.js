/**
 * Loan EMI policy: pre-EMI interest, multi-loan payroll collection, skipped-EMI interest accrual.
 */

const LoanSettings = require('../model/LoanSettings');
const repair = require('./loanHistoryRepairService');

const DEFAULT_EMI_POLICY = {
  multiEmiCollectionMode: 'collect_all', // collect_all | single_emi_only | max_combined_cap
  maxCombinedEmiAmount: null,
  multiEmiPriority: 'oldest_first', // oldest_first | newest_first | highest_emi_first
  accrueInterestOnSkippedEmi: true,
  preEmiInterestEnabled: true,
};

function monthsBetweenYm(fromYm, toYm) {
  const a = repair.normalizePayrollMonthKey(fromYm);
  const b = repair.normalizePayrollMonthKey(toYm);
  if (!a || !b) return 0;
  const [ay, am] = a.split('-').map(Number);
  const [by, bm] = b.split('-').map(Number);
  return (by - ay) * 12 + (bm - am);
}

/**
 * Flat simple interest for N months: round(P × R × (months/12) / 100)
 */
function simpleInterestForMonths(principal, interestRate, months) {
  const p = Number(principal) || 0;
  const r = Number(interestRate) || 0;
  const m = Math.max(0, Number(months) || 0);
  if (!p || !r || !m) return 0;
  return Math.round((p * r * (m / 12)) / 100);
}

/**
 * Full EMI calc including optional pre-EMI (moratorium) interest.
 * Tenure interest = P×R×(duration/12)/100
 * Pre-EMI interest = P×R×(preEmiMonths/12)/100
 * Total = P + tenureInterest + preEmiInterest, then equal installments over `duration`.
 */
function calculateEMIWithPrePeriod(principal, interestRate, duration, preEmiMonths = 0) {
  const p = Number(principal) || 0;
  const d = Math.max(1, Number(duration) || 1);
  const pre = Math.max(0, Number(preEmiMonths) || 0);
  const rate = Number(interestRate) || 0;

  const tenureInterest = rate ? Math.round((p * rate * (d / 12)) / 100) : 0;
  const preEmiInterest = rate && pre > 0 ? simpleInterestForMonths(p, rate, pre) : 0;
  const totalInterest = tenureInterest + preEmiInterest;
  const totalAmount = Math.round(p + totalInterest);

  // Reuse schedule builder via calculateEMI with rate 0 on the inflated total
  // so installment split matches existing logic.
  const plan = repair.calculateEMI(totalAmount, 0, d);
  return {
    emiAmount: plan.emiAmount,
    finalEmiAmount: plan.finalEmiAmount,
    installmentSchedule: plan.installmentSchedule,
    totalInstallments: plan.totalInstallments,
    regularInstallmentCount: plan.regularInstallmentCount,
    requestedDuration: plan.requestedDuration,
    tenureInterest,
    preEmiInterest,
    preEmiMonths: pre,
    totalInterest,
    totalAmount,
    interestRate: rate,
    principal: p,
    duration: d,
  };
}

function getEmiPolicyFromSettings(settingsDoc) {
  const s = settingsDoc?.settings || settingsDoc || {};
  return {
    ...DEFAULT_EMI_POLICY,
    multiEmiCollectionMode: s.multiEmiCollectionMode || DEFAULT_EMI_POLICY.multiEmiCollectionMode,
    maxCombinedEmiAmount:
      s.maxCombinedEmiAmount != null && s.maxCombinedEmiAmount !== ''
        ? Number(s.maxCombinedEmiAmount)
        : null,
    multiEmiPriority: s.multiEmiPriority || DEFAULT_EMI_POLICY.multiEmiPriority,
    accrueInterestOnSkippedEmi:
      s.accrueInterestOnSkippedEmi !== undefined
        ? !!s.accrueInterestOnSkippedEmi
        : DEFAULT_EMI_POLICY.accrueInterestOnSkippedEmi,
    preEmiInterestEnabled:
      s.preEmiInterestEnabled !== undefined
        ? !!s.preEmiInterestEnabled
        : DEFAULT_EMI_POLICY.preEmiInterestEnabled,
  };
}

async function loadLoanEmiPolicy() {
  const doc = await LoanSettings.findOne({ type: 'loan', isActive: true }).lean();
  return getEmiPolicyFromSettings(doc);
}

/**
 * Apply EMI result (with pre-period) onto a loan document fields.
 */
function applyEmiResultToLoan(loan, emiResult) {
  if (!loan.loanConfig) loan.loanConfig = {};
  loan.loanConfig.emiAmount = emiResult.emiAmount;
  loan.loanConfig.finalEmiAmount = emiResult.finalEmiAmount ?? emiResult.emiAmount;
  loan.loanConfig.installmentSchedule = Array.isArray(emiResult.installmentSchedule)
    ? emiResult.installmentSchedule
    : [];
  loan.loanConfig.regularInstallmentCount = emiResult.regularInstallmentCount ?? 0;
  loan.loanConfig.requestedDuration = emiResult.requestedDuration ?? loan.duration;
  loan.loanConfig.totalInterest = emiResult.totalInterest;
  loan.loanConfig.totalAmount = emiResult.totalAmount;
  loan.loanConfig.preEmiInterest = emiResult.preEmiInterest || 0;
  loan.loanConfig.preEmiMonths = emiResult.preEmiMonths || 0;
  loan.loanConfig.tenureInterest = emiResult.tenureInterest ?? emiResult.totalInterest;
  if (emiResult.interestRate != null) loan.loanConfig.interestRate = emiResult.interestRate;
  loan.interestAmount = emiResult.totalInterest;
  if (!loan.repayment) loan.repayment = {};
  loan.repayment.totalInstallments = emiResult.totalInstallments ?? loan.duration;
  const paid = Number(loan.repayment.totalPaid) || 0;
  loan.repayment.remainingBalance = Math.max(0, emiResult.totalAmount - paid);
  loan.markModified?.('loanConfig');
  loan.markModified?.('repayment');
}

/**
 * Recalculate loan totals using commence month vs interest-start month.
 * @returns {{ preEmiMonths, emiResult } | null}
 */
function recalculateLoanForEmiCommence(loan, {
  interestStartPayrollMonth,
  emiCommencePayrollMonth,
  preEmiInterestEnabled = true,
} = {}) {
  if (loan.requestType !== 'loan') return null;
  const rate = Number(loan.loanConfig?.interestRate) || 0;
  const principal = Number(loan.amount) || 0;
  const duration = Math.max(1, Number(loan.duration) || 1);
  const startYm = repair.normalizePayrollMonthKey(interestStartPayrollMonth);
  const commenceYm = repair.normalizePayrollMonthKey(emiCommencePayrollMonth);
  let preMonths = 0;
  if (preEmiInterestEnabled && startYm && commenceYm) {
    preMonths = Math.max(0, monthsBetweenYm(startYm, commenceYm));
  }
  const emiResult = calculateEMIWithPrePeriod(principal, rate, duration, preMonths);
  applyEmiResultToLoan(loan, emiResult);
  if (!loan.loanConfig) loan.loanConfig = {};
  if (startYm) loan.loanConfig.interestStartPayrollMonth = startYm;
  if (commenceYm) loan.loanConfig.emiCommencePayrollMonth = commenceYm;
  return { preEmiMonths: preMonths, emiResult };
}

function sortLoansByPriority(loans, priority) {
  const list = [...loans];
  if (priority === 'newest_first') {
    list.sort((a, b) => {
      const da = new Date(b.disbursedAt || b.disbursement?.disbursedAt || b.appliedAt || 0).getTime();
      const db = new Date(a.disbursedAt || a.disbursement?.disbursedAt || a.appliedAt || 0).getTime();
      return da - db;
    });
  } else if (priority === 'highest_emi_first') {
    list.sort((a, b) => {
      const ea = Number(a._dueEmi || a.emiAmount || a.loanConfig?.emiAmount || 0);
      const eb = Number(b._dueEmi || b.emiAmount || b.loanConfig?.emiAmount || 0);
      return eb - ea;
    });
  } else {
    // oldest_first (default)
    list.sort((a, b) => {
      const da = new Date(a.disbursedAt || a.disbursement?.disbursedAt || a.appliedAt || 0).getTime();
      const db = new Date(b.disbursedAt || b.disbursement?.disbursedAt || b.appliedAt || 0).getTime();
      return da - db;
    });
  }
  return list;
}

/**
 * Select which due EMIs to collect this payroll month based on policy.
 * Returns { selectedBreakdown, skippedLoans, policy }
 */
function selectEmisForCollection(dueItems, policy) {
  const mode = policy.multiEmiCollectionMode || 'collect_all';
  const items = Array.isArray(dueItems) ? dueItems : [];

  if (mode === 'collect_all' || items.length <= 1) {
    return {
      selectedBreakdown: items,
      skippedLoans: [],
      policy,
      mode,
    };
  }

  if (mode === 'single_emi_only') {
    const sorted = sortLoansByPriority(
      items.map((i) => ({ ...i, _dueEmi: i.emiAmount })),
      policy.multiEmiPriority
    );
    const first = sorted[0];
    const selected = items.filter((i) => String(i.loanId) === String(first.loanId));
    const skipped = items.filter((i) => String(i.loanId) !== String(first.loanId));
    return { selectedBreakdown: selected, skippedLoans: skipped, policy, mode };
  }

  if (mode === 'max_combined_cap') {
    const cap = Number(policy.maxCombinedEmiAmount);
    if (!(cap > 0)) {
      return { selectedBreakdown: items, skippedLoans: [], policy, mode };
    }
    const sorted = sortLoansByPriority(
      items.map((i) => ({ ...i, _dueEmi: i.emiAmount })),
      policy.multiEmiPriority
    );
    const selected = [];
    const skipped = [];
    let running = 0;
    for (const item of sorted) {
      const amt = Number(item.emiAmount) || 0;
      if (running + amt <= cap + 0.001) {
        selected.push(item);
        running += amt;
      } else if (selected.length === 0 && amt > 0) {
        // Always take at least one EMI even if over cap (capped later by payable)
        selected.push({ ...item, emiAmount: Math.min(amt, cap) });
        running = Math.min(amt, cap);
      } else {
        skipped.push(item);
      }
    }
    return { selectedBreakdown: selected, skippedLoans: skipped, policy, mode };
  }

  return { selectedBreakdown: items, skippedLoans: [], policy, mode };
}

/**
 * One month of skipped-EMI interest on outstanding principal approximation.
 * Uses remaining balance × monthly rate (R/12/100).
 */
function skippedMonthInterestAmount(loan) {
  const rate = Number(loan.loanConfig?.interestRate) || 0;
  if (!rate) return 0;
  const outstanding =
    Number(loan.repayment?.remainingBalance) ||
    Number(loan.loanConfig?.totalAmount) ||
    Number(loan.amount) ||
    0;
  if (!(outstanding > 0)) return 0;
  return Math.round((outstanding * rate) / 12 / 100);
}

function addMonthsYm(ym, n) {
  const key = repair.normalizePayrollMonthKey(ym);
  if (!key) return null;
  const [y, m] = key.split('-').map(Number);
  const d = new Date(y, m - 1 + (Number(n) || 0), 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function remainingInstallmentsEstimate(loan) {
  const paid = Number(loan.repayment?.installmentsPaid) || 0;
  const total =
    Number(loan.repayment?.totalInstallments) ||
    Number(loan.loanConfig?.requestedDuration) ||
    Number(loan.duration) ||
    0;
  if (total > paid) return total - paid;
  const emi = Number(loan.loanConfig?.emiAmount) || 0;
  const rem = Number(loan.repayment?.remainingBalance) || 0;
  if (emi > 0 && rem > 0) return Math.max(1, Math.ceil(rem / emi));
  return 0;
}

function moneyLabel(n) {
  return `₹${Math.round(Number(n) || 0).toLocaleString('en-IN')}`;
}

/**
 * Suggest EMI commence month for a new loan based on multi-EMI / max-cap policy
 * and existing active loans. Also returns pre-EMI breakdown for the application UI.
 */
async function buildEmiApplicationPreview({
  employeeId,
  amount,
  duration,
  interestRate,
  interestStartPayrollMonth,
  policy: policyOverride,
  excludeLoanId,
} = {}) {
  const policy = policyOverride || (await loadLoanEmiPolicy());
  const startYm =
    repair.normalizePayrollMonthKey(interestStartPayrollMonth) ||
    (() => {
      const d = new Date();
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    })();

  const principal = Number(amount) || 0;
  const tenure = Math.max(1, Number(duration) || 1);
  const rate = Number(interestRate) || 0;
  const basePlan = calculateEMIWithPrePeriod(principal, rate, tenure, 0);
  const newEmi = Number(basePlan.emiAmount) || 0;

  const Loan = require('../model/Loan');
  // Only loans that are already running after disbursement compete for multi-EMI slots.
  // Pending / approved (not yet disbursed) are ignored.
  const activeLoans = employeeId
    ? await Loan.find({
        employeeId,
        requestType: 'loan',
        status: { $in: ['disbursed', 'active'] },
        'repayment.remainingBalance': { $gt: 0 },
        ...(excludeLoanId ? { _id: { $ne: excludeLoanId } } : {}),
      })
        .lean()
    : [];

  const existingMonthlyEmi = activeLoans.reduce(
    (s, l) => s + (Number(l.loanConfig?.emiAmount) || 0),
    0
  );
  const mode = policy.multiEmiCollectionMode || 'collect_all';
  const priority = policy.multiEmiPriority || 'oldest_first';
  const cap = Number(policy.maxCombinedEmiAmount);
  const preEmiEnabled = policy.preEmiInterestEnabled !== false;

  let commenceYm = startYm;
  let delayMonths = 0;
  let reason = '';
  let reasonCode = 'immediate';

  if (!employeeId || activeLoans.length === 0 || mode === 'collect_all') {
    commenceYm = startYm;
    delayMonths = 0;
    reasonCode = activeLoans.length === 0 ? 'no_other_loans' : 'collect_all';
    reason =
      activeLoans.length === 0
        ? `No other disbursed/active loans. EMI can commence from ${startYm} (same as interest start).`
        : `Policy is “collect all due EMIs”. Combined collection is allowed, so EMI can commence from ${startYm}.`;
  } else if (mode === 'single_emi_only') {
    if (priority === 'newest_first') {
      commenceYm = startYm;
      delayMonths = 0;
      reasonCode = 'single_newest_priority';
      reason = `Single-EMI policy (newest first): this new loan would be collected first from ${startYm}. Existing loan EMIs may be deferred. Skip-interest is ${
        policy.accrueInterestOnSkippedEmi ? 'ON' : 'OFF'
      }.`;
    } else if (priority === 'highest_emi_first') {
      const higher = activeLoans.filter((l) => (Number(l.loanConfig?.emiAmount) || 0) > newEmi);
      if (higher.length === 0) {
        commenceYm = startYm;
        delayMonths = 0;
        reasonCode = 'single_highest_wins';
        reason = `Single-EMI policy (highest EMI first): this EMI (${moneyLabel(
          newEmi
        )}) is the highest among active loans, so it can commence from ${startYm}.`;
      } else {
        delayMonths = Math.max(...higher.map(remainingInstallmentsEstimate), 0);
        commenceYm = addMonthsYm(startYm, delayMonths);
        reasonCode = 'single_highest_wait';
        reason = `Single-EMI policy (highest EMI first): ${higher.length} existing loan(s) have a higher EMI. EMI commence is set to ${commenceYm} (${delayMonths} month(s) after interest start) so this EMI is not skipped every payroll.`;
      }
    } else {
      // oldest_first — existing loans always take priority over a brand-new loan
      delayMonths = Math.max(...activeLoans.map(remainingInstallmentsEstimate), 0);
      commenceYm = addMonthsYm(startYm, delayMonths);
      reasonCode = 'single_oldest_wait';
      reason = `Single-EMI policy (oldest loan first): you already have ${activeLoans.length} disbursed/active loan(s) totaling ≈${moneyLabel(
        existingMonthlyEmi
      )}/month. New EMI commence is set to ${commenceYm} (${delayMonths} month(s) later) so payroll is not forced to skip this EMI every month while older loans are due.`;
    }
  } else if (mode === 'max_combined_cap') {
    if (!(cap > 0)) {
      commenceYm = startYm;
      delayMonths = 0;
      reasonCode = 'cap_unset';
      reason = `Max combined EMI mode is on but no cap amount is configured. EMI can commence from ${startYm}.`;
    } else if (existingMonthlyEmi + newEmi <= cap + 0.001) {
      commenceYm = startYm;
      delayMonths = 0;
      reasonCode = 'cap_fits';
      reason = `Max combined EMI cap is ${moneyLabel(cap)}. Current EMIs ≈${moneyLabel(
        existingMonthlyEmi
      )} + new ≈${moneyLabel(newEmi)} fits under the cap, so EMI can commence from ${startYm}.`;
    } else if (newEmi > cap) {
      commenceYm = startYm;
      delayMonths = 0;
      reasonCode = 'cap_emi_exceeds_alone';
      reason = `This EMI (≈${moneyLabel(
        newEmi
      )}) alone is above the max combined cap (${moneyLabel(
        cap
      )}). Commence defaults to ${startYm}; payroll may still take it as the sole EMI when selected.`;
    } else {
      const loansState = activeLoans.map((l) => ({
        rem: remainingInstallmentsEstimate(l),
        emi: Number(l.loanConfig?.emiAmount) || 0,
      }));
      delayMonths = 0;
      while (delayMonths < 120) {
        const dueExisting = loansState
          .filter((l) => l.rem > delayMonths)
          .reduce((s, l) => s + l.emi, 0);
        if (dueExisting + newEmi <= cap + 0.001) break;
        delayMonths += 1;
      }
      commenceYm = addMonthsYm(startYm, delayMonths);
      reasonCode = 'cap_wait';
      reason = `Max combined EMI cap is ${moneyLabel(cap)}. Current EMIs ≈${moneyLabel(
        existingMonthlyEmi
      )} + new ≈${moneyLabel(
        newEmi
      )} would exceed the cap. EMI commence is set to ${commenceYm} (${delayMonths} month(s) later) when enough room opens under the cap.`;
    }
  } else {
    commenceYm = startYm;
    reasonCode = 'default';
    reason = `EMI can commence from ${startYm}.`;
  }

  const preMonths = preEmiEnabled ? Math.max(0, monthsBetweenYm(startYm, commenceYm)) : 0;
  const plan = calculateEMIWithPrePeriod(principal, rate, tenure, preMonths);

  return {
    policy: {
      multiEmiCollectionMode: mode,
      multiEmiPriority: priority,
      maxCombinedEmiAmount: cap > 0 ? cap : null,
      preEmiInterestEnabled: preEmiEnabled,
      accrueInterestOnSkippedEmi: policy.accrueInterestOnSkippedEmi !== false,
    },
    interestStartPayrollMonth: startYm,
    emiCommencePayrollMonth: commenceYm,
    commenceDelayMonths: delayMonths,
    reasonCode,
    reason,
    existingActiveLoans: activeLoans.length,
    existingMonthlyEmi: Math.round(existingMonthlyEmi),
    activeLoans: activeLoans.map(al => ({
      _id: al._id,
      reason: al.reason || '',
      amount: al.amount,
      duration: al.duration,
      emi: al.loanConfig?.emiAmount || 0,
      totalAmount: al.loanConfig?.totalAmount || (al.amount + (al.loanConfig?.totalInterest || al.interestAmount || 0)),
      interest: al.loanConfig?.totalInterest || al.interestAmount || 0,
      paidMonths: al.repayment?.installmentsPaid || 0,
      paidAmount: al.repayment?.totalPaid || 0,
      unpaidAmount: al.repayment?.remainingBalance != null ? al.repayment.remainingBalance : (al.loanConfig?.totalAmount || al.amount),
      totalMonths: al.repayment?.totalInstallments || al.duration || 0,
    })),
    tentativeEmiWithoutPre: Math.round(newEmi),
    preEmiMonths: preMonths,
    tenureInterest: plan.tenureInterest,
    preEmiInterest: plan.preEmiInterest,
    totalInterest: plan.totalInterest,
    totalAmount: plan.totalAmount,
    emiAmount: plan.emiAmount,
    finalEmiAmount: plan.finalEmiAmount,
    installmentSchedule: plan.installmentSchedule,
    totalInstallments: plan.totalInstallments,
    regularInstallmentCount: plan.regularInstallmentCount,
    requestedDuration: plan.requestedDuration,
    interestRate: rate,
    principal,
    duration: tenure,
  };
}

module.exports = {
  DEFAULT_EMI_POLICY,
  getEmiPolicyFromSettings,
  loadLoanEmiPolicy,
  monthsBetweenYm,
  addMonthsYm,
  simpleInterestForMonths,
  calculateEMIWithPrePeriod,
  applyEmiResultToLoan,
  recalculateLoanForEmiCommence,
  selectEmisForCollection,
  sortLoansByPriority,
  skippedMonthInterestAmount,
  remainingInstallmentsEstimate,
  buildEmiApplicationPreview,
};
