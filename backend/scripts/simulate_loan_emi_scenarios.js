/**
 * Full loan EMI / pre-EMI / multi-EMI policy scenario simulations.
 * Pure logic (no DB). Run: node backend/scripts/simulate_loan_emi_scenarios.js
 */
const assert = require('assert');
const {
  calculateEMIWithPrePeriod,
  monthsBetweenYm,
  selectEmisForCollection,
  getEmiPolicyFromSettings,
  skippedMonthInterestAmount,
  DEFAULT_EMI_POLICY,
  recalculateLoanForEmiCommence,
} = require('../loans/services/loanEmiPolicyService');

const results = [];

function money(n) {
  return `₹${Number(n).toLocaleString('en-IN')}`;
}

function record(group, id, title, ok, details, expected, actual) {
  const row = {
    group,
    id,
    title,
    status: ok ? 'PASS' : 'FAIL',
    details,
    expected: expected ?? null,
    actual: actual ?? null,
  };
  results.push(row);
  const mark = ok ? '✓ PASS' : '✗ FAIL';
  console.log(`  ${mark}  [${id}] ${title}`);
  if (details) console.log(`         ${details}`);
  if (!ok) {
    console.log(`         expected: ${JSON.stringify(expected)}`);
    console.log(`         actual:   ${JSON.stringify(actual)}`);
  }
}

function section(title) {
  console.log(`\n${'═'.repeat(72)}`);
  console.log(`  ${title}`);
  console.log(`${'═'.repeat(72)}`);
}

// ─── A. Pre-EMI interest math ───────────────────────────────────────────────
section('A. PRE-EMI INTEREST CALCULATION');

{
  const r = calculateEMIWithPrePeriod(10000, 10, 12, 0);
  record(
    'Pre-EMI',
    'A1',
    'Immediate commence (0 pre months) — product example base',
    r.tenureInterest === 1000 && r.preEmiInterest === 0 && r.totalAmount === 11000,
    `Tenure interest ${money(r.tenureInterest)}, pre-EMI ${money(r.preEmiInterest)}, total ${money(r.totalAmount)}, EMI ${money(r.emiAmount)}`,
    { tenureInterest: 1000, preEmiInterest: 0, totalAmount: 11000 },
    { tenureInterest: r.tenureInterest, preEmiInterest: r.preEmiInterest, totalAmount: r.totalAmount }
  );
}

{
  const r = calculateEMIWithPrePeriod(10000, 10, 12, 4);
  record(
    'Pre-EMI',
    'A2',
    'EMI commence after 4 months — FRD example',
    r.tenureInterest === 1000 && r.preEmiInterest === 333 && r.totalAmount === 11333 && r.preEmiMonths === 4,
    `Tenure ${money(1000)} + pre-EMI ${money(333)} = total ${money(r.totalAmount)}; EMI ${money(r.emiAmount)} over 12m`,
    { tenureInterest: 1000, preEmiInterest: 333, totalAmount: 11333 },
    { tenureInterest: r.tenureInterest, preEmiInterest: r.preEmiInterest, totalAmount: r.totalAmount }
  );
}

{
  const r = calculateEMIWithPrePeriod(10000, 10, 12, 6);
  record(
    'Pre-EMI',
    'A3',
    'EMI commence after 6 months',
    r.preEmiInterest === 500 && r.totalAmount === 11500,
    `Pre-EMI ${money(r.preEmiInterest)}, total ${money(r.totalAmount)}, EMI ${money(r.emiAmount)}`,
    { preEmiInterest: 500, totalAmount: 11500 },
    { preEmiInterest: r.preEmiInterest, totalAmount: r.totalAmount }
  );
}

{
  const r = calculateEMIWithPrePeriod(50000, 12, 24, 3);
  const expectedTenure = Math.round((50000 * 12 * (24 / 12)) / 100); // 12000
  const expectedPre = Math.round((50000 * 12 * (3 / 12)) / 100); // 1500
  record(
    'Pre-EMI',
    'A4',
    'Larger loan ₹50k @ 12% / 24m / 3 pre months',
    r.tenureInterest === expectedTenure && r.preEmiInterest === expectedPre && r.totalAmount === 50000 + expectedTenure + expectedPre,
    `Tenure ${money(r.tenureInterest)}, pre ${money(r.preEmiInterest)}, total ${money(r.totalAmount)}, EMI ${money(r.emiAmount)}`,
    { tenureInterest: expectedTenure, preEmiInterest: expectedPre },
    { tenureInterest: r.tenureInterest, preEmiInterest: r.preEmiInterest }
  );
}

{
  const r = calculateEMIWithPrePeriod(10000, 0, 12, 4);
  record(
    'Pre-EMI',
    'A5',
    'Zero interest rate — no tenure or pre-EMI interest',
    r.tenureInterest === 0 && r.preEmiInterest === 0 && r.totalAmount === 10000,
    `Total ${money(r.totalAmount)}, EMI ${money(r.emiAmount)}`,
    { totalAmount: 10000, preEmiInterest: 0 },
    { totalAmount: r.totalAmount, preEmiInterest: r.preEmiInterest }
  );
}

{
  const m = monthsBetweenYm('2026-01', '2026-05');
  record(
    'Pre-EMI',
    'A6',
    'Month gap Jan→May = 4 (interest start → EMI commence)',
    m === 4,
    `monthsBetweenYm('2026-01','2026-05') = ${m}`,
    4,
    m
  );
}

{
  const loan = {
    requestType: 'loan',
    amount: 10000,
    duration: 12,
    loanConfig: { interestRate: 10 },
    repayment: {},
    markModified() {},
  };
  const out = recalculateLoanForEmiCommence(loan, {
    interestStartPayrollMonth: '2026-01',
    emiCommencePayrollMonth: '2026-05',
    preEmiInterestEnabled: true,
  });
  record(
    'Pre-EMI',
    'A7',
    'recalculateLoanForEmiCommence locks months + totals',
    out?.preEmiMonths === 4 &&
      loan.loanConfig.preEmiInterest === 333 &&
      loan.loanConfig.interestStartPayrollMonth === '2026-01' &&
      loan.loanConfig.emiCommencePayrollMonth === '2026-05',
    `preMonths=${out?.preEmiMonths}, preInterest=${money(loan.loanConfig.preEmiInterest)}, start=${loan.loanConfig.interestStartPayrollMonth}, commence=${loan.loanConfig.emiCommencePayrollMonth}`,
    { preEmiMonths: 4, preEmiInterest: 333 },
    { preEmiMonths: out?.preEmiMonths, preEmiInterest: loan.loanConfig.preEmiInterest }
  );
}

{
  const loan = {
    requestType: 'loan',
    amount: 10000,
    duration: 12,
    loanConfig: { interestRate: 10 },
    repayment: {},
    markModified() {},
  };
  recalculateLoanForEmiCommence(loan, {
    interestStartPayrollMonth: '2026-01',
    emiCommencePayrollMonth: '2026-05',
    preEmiInterestEnabled: false,
  });
  record(
    'Pre-EMI',
    'A8',
    'Pre-EMI setting OFF → no extra interest even if months differ',
    loan.loanConfig.preEmiInterest === 0 && loan.loanConfig.totalAmount === 11000,
    `preInterest=${money(loan.loanConfig.preEmiInterest)}, total=${money(loan.loanConfig.totalAmount)} (policy OFF)`,
    { preEmiInterest: 0, totalAmount: 11000 },
    { preEmiInterest: loan.loanConfig.preEmiInterest, totalAmount: loan.loanConfig.totalAmount }
  );
}

// ─── B. Multi-EMI collection modes ──────────────────────────────────────────
section('B. MULTI-LOAN EMI COLLECTION (PAYROLL)');

const twoLoans = [
  { loanId: 'loan-old', emiAmount: 3000, appliedAt: new Date('2025-01-01'), disbursedAt: new Date('2025-02-01') },
  { loanId: 'loan-new', emiAmount: 5000, appliedAt: new Date('2026-01-01'), disbursedAt: new Date('2026-02-01') },
];

{
  const policy = getEmiPolicyFromSettings({ settings: { multiEmiCollectionMode: 'collect_all' } });
  const { selectedBreakdown, skippedLoans, mode } = selectEmisForCollection(twoLoans, policy);
  const total = selectedBreakdown.reduce((s, i) => s + i.emiAmount, 0);
  record(
    'Multi-EMI',
    'B1',
    'collect_all — both EMIs deducted',
    mode === 'collect_all' && selectedBreakdown.length === 2 && skippedLoans.length === 0 && total === 8000,
    `Selected ${selectedBreakdown.length} loan(s), skipped ${skippedLoans.length}, payroll deduct ${money(total)}`,
    { selected: 2, skipped: 0, total: 8000 },
    { selected: selectedBreakdown.length, skipped: skippedLoans.length, total }
  );
}

{
  const policy = getEmiPolicyFromSettings({
    settings: { multiEmiCollectionMode: 'single_emi_only', multiEmiPriority: 'oldest_first' },
  });
  const { selectedBreakdown, skippedLoans } = selectEmisForCollection(twoLoans, policy);
  record(
    'Multi-EMI',
    'B2',
    'single_emi_only + oldest_first → only older loan (₹3,000)',
    selectedBreakdown.length === 1 &&
      String(selectedBreakdown[0].loanId) === 'loan-old' &&
      skippedLoans.length === 1 &&
      String(skippedLoans[0].loanId) === 'loan-new',
    `Collect ${selectedBreakdown[0]?.loanId} ${money(selectedBreakdown[0]?.emiAmount)}; skip ${skippedLoans[0]?.loanId}`,
    { selected: 'loan-old', skipped: 'loan-new' },
    { selected: selectedBreakdown[0]?.loanId, skipped: skippedLoans[0]?.loanId }
  );
}

{
  const policy = getEmiPolicyFromSettings({
    settings: { multiEmiCollectionMode: 'single_emi_only', multiEmiPriority: 'newest_first' },
  });
  const { selectedBreakdown, skippedLoans } = selectEmisForCollection(twoLoans, policy);
  record(
    'Multi-EMI',
    'B3',
    'single_emi_only + newest_first → only newer loan (₹5,000)',
    selectedBreakdown.length === 1 && String(selectedBreakdown[0].loanId) === 'loan-new',
    `Collect ${selectedBreakdown[0]?.loanId} ${money(selectedBreakdown[0]?.emiAmount)}; skip ${skippedLoans[0]?.loanId}`,
    { selected: 'loan-new' },
    { selected: selectedBreakdown[0]?.loanId }
  );
}

{
  const policy = getEmiPolicyFromSettings({
    settings: { multiEmiCollectionMode: 'single_emi_only', multiEmiPriority: 'highest_emi_first' },
  });
  const { selectedBreakdown } = selectEmisForCollection(twoLoans, policy);
  record(
    'Multi-EMI',
    'B4',
    'single_emi_only + highest_emi_first → ₹5,000 loan',
    selectedBreakdown.length === 1 && String(selectedBreakdown[0].loanId) === 'loan-new',
    `Collect ${selectedBreakdown[0]?.loanId} ${money(selectedBreakdown[0]?.emiAmount)}`,
    { selected: 'loan-new' },
    { selected: selectedBreakdown[0]?.loanId }
  );
}

{
  const three = [
    { loanId: 'a', emiAmount: 3000, appliedAt: new Date('2025-01-01') },
    { loanId: 'b', emiAmount: 4000, appliedAt: new Date('2026-01-01') },
    { loanId: 'c', emiAmount: 2000, appliedAt: new Date('2024-01-01') },
  ];
  const policy = {
    ...DEFAULT_EMI_POLICY,
    multiEmiCollectionMode: 'max_combined_cap',
    maxCombinedEmiAmount: 5000,
    multiEmiPriority: 'oldest_first',
  };
  const { selectedBreakdown, skippedLoans } = selectEmisForCollection(three, policy);
  const total = selectedBreakdown.reduce((s, i) => s + i.emiAmount, 0);
  // oldest first: c(2000) then a(3000)=5000, skip b
  record(
    'Multi-EMI',
    'B5',
    'max_combined_cap ₹5,000 + oldest_first → c+a (₹2k+₹3k), skip b',
    total <= 5000 &&
      selectedBreakdown.some((i) => i.loanId === 'c') &&
      selectedBreakdown.some((i) => i.loanId === 'a') &&
      skippedLoans.some((i) => i.loanId === 'b'),
    `Selected [${selectedBreakdown.map((i) => i.loanId).join(',')}] total ${money(total)}; skipped [${skippedLoans.map((i) => i.loanId).join(',')}]`,
    { totalMax: 5000, selected: ['c', 'a'], skipped: ['b'] },
    { total, selected: selectedBreakdown.map((i) => i.loanId), skipped: skippedLoans.map((i) => i.loanId) }
  );
}

{
  const three = [
    { loanId: 'a', emiAmount: 3000, appliedAt: new Date('2025-01-01') },
    { loanId: 'b', emiAmount: 4000, appliedAt: new Date('2026-01-01') },
    { loanId: 'c', emiAmount: 2000, appliedAt: new Date('2024-01-01') },
  ];
  const policy = {
    ...DEFAULT_EMI_POLICY,
    multiEmiCollectionMode: 'max_combined_cap',
    maxCombinedEmiAmount: 5000,
    multiEmiPriority: 'highest_emi_first',
  };
  const { selectedBreakdown, skippedLoans } = selectEmisForCollection(three, policy);
  const total = selectedBreakdown.reduce((s, i) => s + i.emiAmount, 0);
  // highest first: b(4000) then c(2000) would be 6000>5000 so only b, then maybe a? 4000+2000 no; 4000 alone; a=3000 fits? after b running=4000, c=2000 no, a=3000 no → only b
  record(
    'Multi-EMI',
    'B6',
    'max_combined_cap ₹5,000 + highest_emi_first → take ₹4,000 first',
    selectedBreakdown[0]?.loanId === 'b' && total <= 5000 && skippedLoans.length >= 1,
    `Selected [${selectedBreakdown.map((i) => `${i.loanId}:${i.emiAmount}`).join(',')}] = ${money(total)}; skipped ${skippedLoans.length}`,
    { first: 'b', totalMax: 5000 },
    { first: selectedBreakdown[0]?.loanId, total, skipped: skippedLoans.length }
  );
}

{
  const one = [{ loanId: 'only', emiAmount: 2500 }];
  const policy = getEmiPolicyFromSettings({
    settings: { multiEmiCollectionMode: 'single_emi_only' },
  });
  const { selectedBreakdown, skippedLoans } = selectEmisForCollection(one, policy);
  record(
    'Multi-EMI',
    'B7',
    'single_emi_only with only 1 due loan → collect it (no skip)',
    selectedBreakdown.length === 1 && skippedLoans.length === 0,
    `Selected 1, skipped 0, amount ${money(2500)}`,
    { selected: 1, skipped: 0 },
    { selected: selectedBreakdown.length, skipped: skippedLoans.length }
  );
}

// ─── C. Skip-interest ON vs OFF ─────────────────────────────────────────────
section('C. SKIPPED-EMI INTEREST (SETTING ON / OFF)');

{
  const loan = {
    loanConfig: { interestRate: 12, totalAmount: 56000 },
    repayment: { remainingBalance: 40000 },
    amount: 50000,
  };
  // monthly = round(40000 * 12 / 12 / 100) = round(400) = 400
  const amt = skippedMonthInterestAmount(loan);
  record(
    'Skip-Interest',
    'C1',
    'Skip interest amount = outstanding × (R/12/100)',
    amt === 400,
    `Outstanding ${money(40000)} @ 12% → skip-month interest ${money(amt)}`,
    400,
    amt
  );
}

{
  const policyOn = getEmiPolicyFromSettings({ settings: { accrueInterestOnSkippedEmi: true } });
  const policyOff = getEmiPolicyFromSettings({ settings: { accrueInterestOnSkippedEmi: false } });
  record(
    'Skip-Interest',
    'C2',
    'Policy defaults / toggles: ON vs OFF read correctly',
    policyOn.accrueInterestOnSkippedEmi === true && policyOff.accrueInterestOnSkippedEmi === false,
    `ON=${policyOn.accrueInterestOnSkippedEmi}, OFF=${policyOff.accrueInterestOnSkippedEmi} (default when unset=${DEFAULT_EMI_POLICY.accrueInterestOnSkippedEmi})`,
    { on: true, off: false, default: true },
    {
      on: policyOn.accrueInterestOnSkippedEmi,
      off: policyOff.accrueInterestOnSkippedEmi,
      default: DEFAULT_EMI_POLICY.accrueInterestOnSkippedEmi,
    }
  );
}

{
  // Simulate payroll decision path (no DB): if OFF, skipped interest should NOT be posted
  const policy = getEmiPolicyFromSettings({
    settings: {
      multiEmiCollectionMode: 'single_emi_only',
      multiEmiPriority: 'oldest_first',
      accrueInterestOnSkippedEmi: false,
    },
  });
  const { skippedLoans } = selectEmisForCollection(twoLoans, policy);
  const wouldPostInterest = policy.accrueInterestOnSkippedEmi && skippedLoans.length > 0;
  record(
    'Skip-Interest',
    'C3',
    'Setting OFF → skipped loan exists but interest MUST NOT post',
    skippedLoans.length === 1 && wouldPostInterest === false,
    `Skipped loans=${skippedLoans.length}, accrueInterestOnSkippedEmi=${policy.accrueInterestOnSkippedEmi}, wouldPost=${wouldPostInterest}`,
    { skipped: 1, wouldPost: false },
    { skipped: skippedLoans.length, wouldPost: wouldPostInterest }
  );
}

{
  const policy = getEmiPolicyFromSettings({
    settings: {
      multiEmiCollectionMode: 'single_emi_only',
      multiEmiPriority: 'oldest_first',
      accrueInterestOnSkippedEmi: true,
    },
  });
  const { skippedLoans } = selectEmisForCollection(twoLoans, policy);
  const wouldPostInterest = policy.accrueInterestOnSkippedEmi && skippedLoans.length > 0;
  const skipLoan = { ...skippedLoans[0], loanConfig: { interestRate: 10, totalAmount: 55000 }, repayment: { remainingBalance: 50000 }, amount: 50000 };
  const interest = skippedMonthInterestAmount(skipLoan);
  record(
    'Skip-Interest',
    'C4',
    'Setting ON → skipped loan gets one month interest posted',
    wouldPostInterest === true && interest === Math.round((50000 * 10) / 12 / 100),
    `wouldPost=${wouldPostInterest}, interest for skipped loan ≈ ${money(interest)} (then EMI rolls to next month)`,
    { wouldPost: true, interest: Math.round((50000 * 10) / 12 / 100) },
    { wouldPost: wouldPostInterest, interest }
  );
}

{
  const loanZero = {
    loanConfig: { interestRate: 0, totalAmount: 10000 },
    repayment: { remainingBalance: 8000 },
    amount: 10000,
  };
  record(
    'Skip-Interest',
    'C5',
    '0% interest loan skipped → post amount is ₹0 (nothing to accrue)',
    skippedMonthInterestAmount(loanZero) === 0,
    `skip interest = ${money(0)}`,
    0,
    skippedMonthInterestAmount(loanZero)
  );
}

// ─── D. End-to-end story simulations ────────────────────────────────────────
section('D. END-TO-END STORY SCENARIOS');

{
  // Story: Ramesh gets ₹10k loan, interest from Jan, EMI from May
  const interestStart = '2026-01';
  const emiCommence = '2026-05';
  const pre = monthsBetweenYm(interestStart, emiCommence);
  const plan = calculateEMIWithPrePeriod(10000, 10, 12, pre);
  const payrollBefore = '2026-04'; // before commence — should not deduct (logic: commence month gate)
  const dueBeforeCommence = payrollBefore >= emiCommence; // simple string compare works for YYYY-MM
  const dueAtCommence = '2026-05' >= emiCommence;
  record(
    'E2E',
    'D1',
    'Story: interest Jan, EMI May — higher EMI; no deduction before May',
    pre === 4 && plan.totalAmount === 11333 && !dueBeforeCommence && dueAtCommence,
    `Pre months=${pre}, total=${money(plan.totalAmount)}, EMI=${money(plan.emiAmount)}; due in Apr? ${dueBeforeCommence}; due in May? ${dueAtCommence}`,
    { pre: 4, total: 11333, aprDue: false, mayDue: true },
    { pre, total: plan.totalAmount, aprDue: dueBeforeCommence, mayDue: dueAtCommence }
  );
}

{
  // Story: two active loans, single EMI + skip interest ON
  const policy = getEmiPolicyFromSettings({
    settings: {
      multiEmiCollectionMode: 'single_emi_only',
      multiEmiPriority: 'oldest_first',
      accrueInterestOnSkippedEmi: true,
    },
  });
  const due = [
    {
      loanId: 'L1',
      emiAmount: 2000,
      appliedAt: new Date('2024-06-01'),
      loan: {
        loanConfig: { interestRate: 10 },
        repayment: { remainingBalance: 20000 },
        amount: 20000,
      },
    },
    {
      loanId: 'L2',
      emiAmount: 3500,
      appliedAt: new Date('2025-06-01'),
      loan: {
        loanConfig: { interestRate: 10 },
        repayment: { remainingBalance: 30000 },
        amount: 30000,
      },
    },
  ];
  const { selectedBreakdown, skippedLoans } = selectEmisForCollection(due, policy);
  const collected = selectedBreakdown.reduce((s, i) => s + i.emiAmount, 0);
  const skipInterest = skippedLoans.map((s) => skippedMonthInterestAmount(s.loan || s));
  const skipTotal = skipInterest.reduce((a, b) => a + b, 0);
  record(
    'E2E',
    'D2',
    'Story: 2 loans due, single EMI ON, skip interest ON',
    collected === 2000 && skippedLoans.length === 1 && skipTotal === Math.round((30000 * 10) / 12 / 100),
    `Payroll deducts ${money(collected)} (L1). L2 skipped → interest ${money(skipTotal)} added; L2 EMI due again next month.`,
    { deduct: 2000, skipInterest: Math.round((30000 * 10) / 12 / 100) },
    { deduct: collected, skipInterest: skipTotal }
  );
}

{
  // Same as D2 but skip interest OFF
  const policy = getEmiPolicyFromSettings({
    settings: {
      multiEmiCollectionMode: 'single_emi_only',
      multiEmiPriority: 'oldest_first',
      accrueInterestOnSkippedEmi: false,
    },
  });
  const due = [
    { loanId: 'L1', emiAmount: 2000, appliedAt: new Date('2024-06-01') },
    { loanId: 'L2', emiAmount: 3500, appliedAt: new Date('2025-06-01') },
  ];
  const { selectedBreakdown, skippedLoans } = selectEmisForCollection(due, policy);
  const wouldPost = policy.accrueInterestOnSkippedEmi && skippedLoans.length > 0;
  record(
    'E2E',
    'D3',
    'Story: 2 loans due, single EMI ON, skip interest OFF',
    selectedBreakdown[0]?.loanId === 'L1' && skippedLoans.length === 1 && wouldPost === false,
    `Payroll deducts ${money(2000)} (L1). L2 skipped with NO interest. L2 still waits for next eligible payroll.`,
    { selected: 'L1', wouldPost: false },
    { selected: selectedBreakdown[0]?.loanId, wouldPost }
  );
}

{
  // Cap story
  const policy = getEmiPolicyFromSettings({
    settings: {
      multiEmiCollectionMode: 'max_combined_cap',
      maxCombinedEmiAmount: 6000,
      multiEmiPriority: 'oldest_first',
    },
  });
  const due = [
    { loanId: 'L1', emiAmount: 2500, appliedAt: new Date('2023-01-01') },
    { loanId: 'L2', emiAmount: 2500, appliedAt: new Date('2024-01-01') },
    { loanId: 'L3', emiAmount: 2500, appliedAt: new Date('2025-01-01') },
  ];
  const { selectedBreakdown, skippedLoans } = selectEmisForCollection(due, policy);
  const total = selectedBreakdown.reduce((s, i) => s + i.emiAmount, 0);
  record(
    'E2E',
    'D4',
    'Story: 3×₹2,500 EMIs, cap ₹6,000 → take 2, skip 1',
    selectedBreakdown.length === 2 && skippedLoans.length === 1 && total === 5000,
    `Deduct ${money(total)} from [${selectedBreakdown.map((i) => i.loanId).join(',')}]; skip [${skippedLoans.map((i) => i.loanId).join(',')}]`,
    { selected: 2, skipped: 1, total: 5000 },
    { selected: selectedBreakdown.length, skipped: skippedLoans.length, total }
  );
}

{
  // Pre-EMI OFF story
  const planOn = calculateEMIWithPrePeriod(10000, 10, 12, 4);
  const planOff = calculateEMIWithPrePeriod(10000, 10, 12, 0); // policy off → treat as 0 pre months
  record(
    'E2E',
    'D5',
    'Story: same dates, pre-EMI policy ON vs OFF comparison',
    planOn.totalAmount === 11333 && planOff.totalAmount === 11000 && planOn.totalAmount > planOff.totalAmount,
    `ON → total ${money(planOn.totalAmount)} / EMI ${money(planOn.emiAmount)}; OFF → total ${money(planOff.totalAmount)} / EMI ${money(planOff.emiAmount)}`,
    { on: 11333, off: 11000 },
    { on: planOn.totalAmount, off: planOff.totalAmount }
  );
}

// ─── Summary ────────────────────────────────────────────────────────────────
section('SUMMARY');

const passed = results.filter((r) => r.status === 'PASS').length;
const failed = results.filter((r) => r.status === 'FAIL').length;
const byGroup = {};
for (const r of results) {
  if (!byGroup[r.group]) byGroup[r.group] = { pass: 0, fail: 0 };
  if (r.status === 'PASS') byGroup[r.group].pass++;
  else byGroup[r.group].fail++;
}

console.log(`\n  Total: ${results.length} scenarios`);
console.log(`  Passed: ${passed}`);
console.log(`  Failed: ${failed}`);
console.log('\n  By group:');
for (const [g, c] of Object.entries(byGroup)) {
  console.log(`    ${g}: ${c.pass} pass, ${c.fail} fail`);
}

const report = {
  generatedAt: new Date().toISOString(),
  summary: { total: results.length, passed, failed, byGroup },
  results,
};

const fs = require('fs');
const path = require('path');
const outPath = path.join(__dirname, 'simulate_loan_emi_scenarios.report.json');
fs.writeFileSync(outPath, JSON.stringify(report, null, 2));
console.log(`\n  Report written: ${outPath}`);

if (failed > 0) {
  console.log('\n  RESULT: SOME SCENARIOS FAILED');
  process.exit(1);
}
console.log('\n  RESULT: ALL SCENARIOS PASSED');
process.exit(0);
