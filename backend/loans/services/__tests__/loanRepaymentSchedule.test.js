/**
 * Lightweight schedule tests (no DB). Run: node backend/loans/services/__tests__/loanRepaymentSchedule.test.js
 */
const assert = require('assert');
const {
  isRepaymentDueForPayrollMonth,
  needsFirstDeductionPayPeriodSelection,
} = require('../loanHistoryRepairService');

async function run() {
  const loan = {
    requestType: 'loan',
    repayment: {
      remainingBalance: 10000,
      installmentsPaid: 0,
      totalInstallments: 10,
    },
    approvals: { final: { firstDeductionPayrollMonth: '2026-06' } },
    loanConfig: { startDate: new Date('2026-05-25T12:00:00+05:30') },
  };

  assert.strictEqual(await isRepaymentDueForPayrollMonth(loan, '2026-05'), false);
  assert.strictEqual(await isRepaymentDueForPayrollMonth(loan, '2026-06'), true);
  assert.strictEqual(await isRepaymentDueForPayrollMonth(loan, '2026-07'), false);

  loan.repayment.installmentsPaid = 1;
  assert.strictEqual(await isRepaymentDueForPayrollMonth(loan, '2026-07'), true);
  assert.strictEqual(await isRepaymentDueForPayrollMonth(loan, '2026-06'), false);

  const advance = {
    requestType: 'salary_advance',
    repayment: { remainingBalance: 5000, installmentsPaid: 0, totalInstallments: 2 },
    advanceConfig: { deductionStartCycle: '2026-08' },
  };
  assert.strictEqual(await isRepaymentDueForPayrollMonth(advance, '2026-08'), true);
  assert.strictEqual(await isRepaymentDueForPayrollMonth(advance, '2026-07'), false);

  assert.strictEqual(
    needsFirstDeductionPayPeriodSelection({
      requestType: 'loan',
      approvals: {},
      loanConfig: { startDate: new Date() },
    }),
    true
  );
  assert.strictEqual(
    needsFirstDeductionPayPeriodSelection({
      requestType: 'loan',
      approvals: { final: { firstDeductionPayrollMonth: '2026-05' } },
    }),
    false
  );
  assert.strictEqual(
    needsFirstDeductionPayPeriodSelection({
      requestType: 'salary_advance',
      advanceConfig: { deductionStartCycle: '2026-07' },
    }),
    false
  );

  console.log('loanRepaymentSchedule.test.js: all assertions passed');
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
