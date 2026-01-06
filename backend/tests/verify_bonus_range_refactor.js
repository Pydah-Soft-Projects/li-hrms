const mongoose = require('mongoose');

// Mock Data
const mockEmployee = {
  _id: new mongoose.Types.ObjectId(),
  emp_no: 'TEST002',
  gross_salary: 50000,
};

// Mock Pay Registers for 2 months (Jan, Feb)
const mockPayRegisters = [
  {
    employeeId: mockEmployee._id,
    month: '2025-01',
    totals: { totalPresentDays: 20, totalsODDays: 0, totalAbsentDays: 0, totalLeaveDays: 0 } // 20/20 working days
  },
  {
    employeeId: mockEmployee._id,
    month: '2025-02',
    totals: { totalPresentDays: 10, totalsODDays: 0, totalAbsentDays: 10, totalLeaveDays: 0 } // 10/20 working days (50% attendance)
  }
];

// Logic Extracted from Service for Testing (Simulating Service)
const calculateAggregatedAttendanceStats = (registers) => {
  let totalNumerator = 0;
  let totalDenominator = 0;

  registers.forEach(reg => {
    const t = reg.totals;
    const num = (t.totalPresentDays || 0) + (t.totalsODDays || t.totalODDays || 0);
    const den = (t.totalPresentDays || 0) + (t.totalsODDays || t.totalODDays || 0) +
      (t.totalAbsentDays || 0) + (t.totalLeaveDays || 0);

    totalNumerator += num;
    totalDenominator += den;
  });

  let percentage = 0;
  if (totalDenominator > 0) {
    percentage = (totalNumerator / totalDenominator) * 100;
  }

  return { numerator: totalNumerator, denominator: totalDenominator, percentage: Math.round(percentage * 100) / 100 };
};

const calculateBonusAlgorithm = (employee, policy, stats) => {
  let salaryValue = 0;
  if (policy.salaryComponent === 'gross_salary') {
    const multiplier = policy.grossSalaryMultiplier || 1;
    salaryValue = (employee.gross_salary || 0) * multiplier;
  } else if (policy.salaryComponent === 'fixed_amount') {
    salaryValue = policy.fixedBonusAmount || 0;
  }

  const applicableTier = policy.tiers.find(tier =>
    stats.percentage <= tier.maxPercentage && stats.percentage >= tier.minPercentage
  );

  let calculatedBonus = 0;
  if (applicableTier) {
    if (applicableTier.bonusPercentage > 0) {
      calculatedBonus = (salaryValue * applicableTier.bonusPercentage) / 100;
    }
  }
  return calculatedBonus;
};

// --- Test Case 1: Date Range Aggregation ---
// Month 1: 100% (20/20), Month 2: 50% (10/20)
// Aggregated: 30/40 = 75%
console.log('--- Test Case 1: Date Range Aggregation ---');
const stats = calculateAggregatedAttendanceStats(mockPayRegisters);
console.log(`Numerator: ${stats.numerator}, Denominator: ${stats.denominator}, Percentage: ${stats.percentage}%`);

if (stats.percentage !== 75) throw new Error(`Expected 75%, got ${stats.percentage}%`);
console.log('Aggregation Logic Passed.\n');


// --- Test Case 2: Multiplier Application ---
console.log('--- Test Case 2: Multiplier Application ---');
// Policy: Gross Salary x 2, Tier: 75% attendance -> 10% bonus
const policy = {
  salaryComponent: 'gross_salary',
  grossSalaryMultiplier: 2,
  tiers: [{ minPercentage: 70, maxPercentage: 80, bonusPercentage: 10 }]
};

// Base Salary should be 50,000 * 2 = 100,000
// Attendance 75% falls in tier -> 10% Bonus
// Expected Bonus: 100,000 * 10% = 10,000
const bonus = calculateBonusAlgorithm(mockEmployee, policy, stats);
console.log(`Base: 50k * 2 = 100k. Bonus %: 10%. Expected Bonus: 10000. Got: ${bonus}`);

if (bonus !== 10000) throw new Error(`Expected 10000, got ${bonus}`);
console.log('Multiplier Logic Passed.\n');

console.log('ALL TESTS PASSED');
