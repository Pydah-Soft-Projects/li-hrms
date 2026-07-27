const assert = require('assert');
const {
  calculateEMIWithPrePeriod,
  monthsBetweenYm,
  selectEmisForCollection,
  getEmiPolicyFromSettings,
  DEFAULT_EMI_POLICY,
  simpleInterestForMonths,
} = require('../loanEmiPolicyService');

// Example from product discussion: 10000 @ 10% for 12 months, EMI starts after 4 months
{
  const r = calculateEMIWithPrePeriod(10000, 10, 12, 4);
  assert.strictEqual(r.tenureInterest, 1000);
  assert.strictEqual(r.preEmiInterest, 333); // round(10000*10*(4/12)/100) = 333.33 → 333
  assert.strictEqual(r.totalInterest, 1333);
  assert.strictEqual(r.totalAmount, 11333);
  assert.ok(r.emiAmount > 0);
  assert.strictEqual(r.preEmiMonths, 4);
}

{
  assert.strictEqual(monthsBetweenYm('2026-01', '2026-05'), 4);
  assert.strictEqual(monthsBetweenYm('2026-05', '2026-05'), 0);
  assert.strictEqual(simpleInterestForMonths(10000, 10, 0), 0);
}

{
  const policy = getEmiPolicyFromSettings({
    settings: { multiEmiCollectionMode: 'single_emi_only', multiEmiPriority: 'oldest_first' },
  });
  assert.strictEqual(policy.multiEmiCollectionMode, 'single_emi_only');

  const items = [
    { loanId: 'a', emiAmount: 3000, appliedAt: new Date('2025-01-01') },
    { loanId: 'b', emiAmount: 5000, appliedAt: new Date('2026-01-01') },
  ];
  const { selectedBreakdown, skippedLoans, mode } = selectEmisForCollection(items, policy);
  assert.strictEqual(mode, 'single_emi_only');
  assert.strictEqual(selectedBreakdown.length, 1);
  assert.strictEqual(String(selectedBreakdown[0].loanId), 'a');
  assert.strictEqual(skippedLoans.length, 1);
  assert.strictEqual(String(skippedLoans[0].loanId), 'b');
}

{
  const policy = {
    ...DEFAULT_EMI_POLICY,
    multiEmiCollectionMode: 'max_combined_cap',
    maxCombinedEmiAmount: 5000,
    multiEmiPriority: 'highest_emi_first',
  };
  const items = [
    { loanId: 'a', emiAmount: 3000, appliedAt: new Date('2025-01-01') },
    { loanId: 'b', emiAmount: 4000, appliedAt: new Date('2026-01-01') },
    { loanId: 'c', emiAmount: 2000, appliedAt: new Date('2024-01-01') },
  ];
  const { selectedBreakdown, skippedLoans } = selectEmisForCollection(items, policy);
  const selectedTotal = selectedBreakdown.reduce((s, i) => s + i.emiAmount, 0);
  assert.ok(selectedTotal <= 5000 + 0.01);
  assert.ok(selectedBreakdown.length >= 1);
  assert.ok(skippedLoans.length >= 1);
}

{
  const all = selectEmisForCollection(
    [
      { loanId: 'a', emiAmount: 1000 },
      { loanId: 'b', emiAmount: 2000 },
    ],
    DEFAULT_EMI_POLICY
  );
  assert.strictEqual(all.selectedBreakdown.length, 2);
  assert.strictEqual(all.skippedLoans.length, 0);
}

console.log('loanEmiPolicyService.test.js: all assertions passed');
