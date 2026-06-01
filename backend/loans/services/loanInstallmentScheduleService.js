/**
 * Loan installment schedule — regular EMIs plus final adjustment / extension when totals do not divide evenly.
 *
 * Rules:
 * - (requestedDuration - 1) installments at regularEmi = round(totalAmount / requestedDuration)
 * - Remaining tail:
 *   - tail > regularEmi → add full regular EMIs until tail <= regularEmi
 *   - tail < regularEmi → one final_adjustment installment for the tail
 *   - tail === regularEmi → one regular installment
 */

function round2(n) {
  const x = Number(n);
  if (!Number.isFinite(x)) return 0;
  return Math.round(x * 100) / 100;
}

/**
 * @param {number} totalAmount - Principal + interest (recoverable total)
 * @param {number} requestedDuration - Requested EMI count from loan terms
 */
function buildLoanInstallmentPlan(totalAmount, requestedDuration) {
  const total = round2(Math.max(0, Number(totalAmount) || 0));
  const requested = Math.max(1, Math.floor(Number(requestedDuration) || 1));

  if (total <= 0) {
    return {
      emiAmount: 0,
      finalEmiAmount: 0,
      installmentSchedule: [],
      totalInstallments: 0,
      requestedDuration: requested,
      regularInstallmentCount: 0,
      totalAmount: 0,
    };
  }

  const regularEmi = Math.round(total / requested);
  const schedule = [];
  let installmentNumber = 1;
  let allocated = 0;

  const pushInstallment = (amount, type) => {
    const amt = round2(amount);
    if (amt <= 0) return;
    schedule.push({ installmentNumber: installmentNumber++, amount: amt, type });
    allocated = round2(allocated + amt);
  };

  // Planned cycles minus the closing tail installment
  for (let i = 1; i < requested; i++) {
    const amt = Math.min(regularEmi, round2(total - allocated));
    pushInstallment(amt, 'regular');
  }

  let tail = round2(total - allocated);

  // Closing installment(s) for the requested plan
  if (requested >= 1 && tail > 0.001) {
    if (tail > regularEmi + 0.001) {
      // Tail exceeds one EMI — split into full EMIs + optional final adjustment
      while (tail > regularEmi + 0.001) {
        pushInstallment(regularEmi, 'regular');
        tail = round2(total - allocated);
      }
      if (tail > 0.001) {
        pushInstallment(tail, 'final_adjustment');
      }
    } else {
      const type = tail < regularEmi - 0.001 ? 'final_adjustment' : 'regular';
      pushInstallment(tail, type);
    }
  }

  if (schedule.length === 0) {
    pushInstallment(total, 'regular');
  }

  const regularCount = schedule.filter((s) => s.type === 'regular' && s.amount === regularEmi).length;

  return {
    emiAmount: regularEmi,
    finalEmiAmount: schedule[schedule.length - 1].amount,
    installmentSchedule: schedule,
    totalInstallments: schedule.length,
    requestedDuration: requested,
    regularInstallmentCount: regularCount,
    totalAmount: total,
  };
}

/** Apply computed plan onto loan.loanConfig + loan.repayment (does not save). */
function applyInstallmentPlanToLoan(loan, plan, options = {}) {
  if (!loan || !plan) return;
  const preservePaid = options.preservePaid !== false;
  if (!loan.loanConfig) loan.loanConfig = {};
  if (!loan.repayment) loan.repayment = {};

  loan.loanConfig.emiAmount = plan.emiAmount;
  loan.loanConfig.finalEmiAmount = plan.finalEmiAmount;
  loan.loanConfig.installmentSchedule = Array.isArray(plan.installmentSchedule) ? plan.installmentSchedule : [];
  loan.loanConfig.regularInstallmentCount = plan.regularInstallmentCount ?? 0;
  loan.loanConfig.requestedDuration = plan.requestedDuration ?? loan.duration;

  loan.repayment.totalInstallments = plan.totalInstallments || loan.duration || 1;

  if (!preservePaid || !(Number(loan.repayment.totalPaid) > 0)) {
    loan.repayment.remainingBalance = plan.totalAmount;
  } else {
    loan.repayment.remainingBalance = Math.max(0, round2(plan.totalAmount - (Number(loan.repayment.totalPaid) || 0)));
  }
}

/** Effective installment count for schedule / due-date math. */
function getEffectiveInstallmentCount(loan) {
  const schedule = loan?.loanConfig?.installmentSchedule;
  if (Array.isArray(schedule) && schedule.length > 0) return schedule.length;
  const fromRepayment = Number(loan?.repayment?.totalInstallments);
  if (fromRepayment > 0) return fromRepayment;
  return Math.max(1, Number(loan?.duration) || 1);
}

/**
 * EMI due for the next payroll deduction (never exceeds remaining balance).
 */
function getDueInstallmentAmount(loan) {
  const remaining = round2(Math.max(0, Number(loan?.repayment?.remainingBalance) || 0));
  if (remaining <= 0) return 0;

  const paid = Math.max(0, Number(loan?.repayment?.installmentsPaid) || 0);
  const schedule = loan?.loanConfig?.installmentSchedule;

  if (Array.isArray(schedule) && schedule.length > 0) {
    const next = schedule.find((s) => Number(s.installmentNumber) === paid + 1);
    if (next) return Math.min(round2(next.amount), remaining);
    // Paid through schedule but balance remains — close with remaining
    return remaining;
  }

  const regularEmi = round2(Number(loan?.loanConfig?.emiAmount) || 0);
  if (regularEmi <= 0) return remaining;

  const totalInst = getEffectiveInstallmentCount(loan);
  if (paid + 1 >= totalInst || remaining < regularEmi) {
    return Math.min(regularEmi, remaining);
  }
  return Math.min(regularEmi, remaining);
}

module.exports = {
  round2,
  buildLoanInstallmentPlan,
  applyInstallmentPlanToLoan,
  getEffectiveInstallmentCount,
  getDueInstallmentAmount,
};
