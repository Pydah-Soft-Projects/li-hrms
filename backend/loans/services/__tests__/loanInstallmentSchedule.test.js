/**
 * Loan installment schedule unit tests.
 * Run: node backend/loans/services/__tests__/loanInstallmentSchedule.test.js
 */
const assert = require('assert');
const {
  buildLoanInstallmentPlan,
  getDueInstallmentAmount,
} = require('../loanInstallmentScheduleService');
const { calculateEMI } = require('../loanHistoryRepairService');

function sumSchedule(plan) {
  return plan.installmentSchedule.reduce((s, i) => s + i.amount, 0);
}

function run() {
  // Exact divide — 10 × 5000
  const p1 = buildLoanInstallmentPlan(50000, 10);
  assert.strictEqual(p1.emiAmount, 5000);
  assert.strictEqual(p1.totalInstallments, 10);
  assert.strictEqual(sumSchedule(p1), 50000);
  assert.strictEqual(p1.finalEmiAmount, 5000);

  // Remainder > EMI — extends with extra regular + tiny final (11th EMI = ₹3)
  const p2 = buildLoanInstallmentPlan(50003, 10);
  assert.strictEqual(p2.emiAmount, 5000);
  assert.strictEqual(sumSchedule(p2), 50003);
  assert.strictEqual(p2.finalEmiAmount, 3);
  assert.strictEqual(p2.totalInstallments, 11);
  assert.strictEqual(p2.installmentSchedule[p2.installmentSchedule.length - 1].type, 'final_adjustment');

  // Remainder < EMI on last planned cycle — single final_adjustment (49993 → 9×4999 + 5002? calc)
  const p1b = buildLoanInstallmentPlan(49993, 10);
  assert.strictEqual(sumSchedule(p1b), 49993);
  assert.ok(p1b.finalEmiAmount < p1b.emiAmount || p1b.finalEmiAmount === p1b.emiAmount);

  // Remainder > EMI — extends with extra regular + tiny final
  const p3 = buildLoanInstallmentPlan(55003, 10);
  assert.strictEqual(p3.emiAmount, 5500);
  assert.ok(p3.totalInstallments >= 11);
  assert.strictEqual(sumSchedule(p3), 55003);
  assert.strictEqual(p3.finalEmiAmount, 3);

  const emiZero = calculateEMI(50003, 0, 10);
  assert.strictEqual(emiZero.totalAmount, 50003);
  assert.strictEqual(emiZero.installmentSchedule.length, p2.totalInstallments);

  // Payroll due amount uses schedule
  const loanMid = {
    loanConfig: {
      emiAmount: 5000,
      installmentSchedule: p2.installmentSchedule,
    },
    repayment: { installmentsPaid: 9, remainingBalance: 10003, totalInstallments: p2.totalInstallments },
  };
  assert.strictEqual(getDueInstallmentAmount(loanMid), 5000);

  const loanLast = {
    loanConfig: { emiAmount: 5000, installmentSchedule: p1.installmentSchedule },
    repayment: { installmentsPaid: 9, remainingBalance: 5000, totalInstallments: 10 },
  };
  assert.strictEqual(getDueInstallmentAmount(loanLast), 5000);

  const loanTail = {
    loanConfig: { emiAmount: 5000, installmentSchedule: p2.installmentSchedule },
    repayment: { installmentsPaid: 10, remainingBalance: 3, totalInstallments: p2.totalInstallments },
  };
  assert.strictEqual(getDueInstallmentAmount(loanTail), 3);

  console.log('loanInstallmentSchedule.test.js: all assertions passed');
  console.log('  50000/10 →', p1.totalInstallments, 'installments, final', p1.finalEmiAmount);
  console.log('  50003/10 →', p2.totalInstallments, 'installments, final', p2.finalEmiAmount);
  console.log('  55003/10 →', p3.totalInstallments, 'installments, final', p3.finalEmiAmount);
}

run();
