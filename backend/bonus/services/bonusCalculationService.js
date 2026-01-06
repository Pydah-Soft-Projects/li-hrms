const PayRegisterSummary = require('../../pay-register/model/PayRegisterSummary');
const Employee = require('../../employees/model/Employee');

/**
 * Calculate Bonus for a single employee based on a policy and month
 * @param {Object} employee - Employee document
 * @param {Object} policy - BonusPolicy document
 * @param {String} month - YYYY-MM
 */
/**
 * Calculate Bonus for a single employee based on a policy and date range
 * @param {Object} employee - Employee document
 * @param {Object} policy - BonusPolicy document
 * @param {String} startMonth - YYYY-MM
 * @param {String} endMonth - YYYY-MM
 */
exports.calculateBonusForEmployee = async (employee, policy, startMonth, endMonth) => {
  // 1. Get Pay Register Data for Range
  // Find all registers between start and end inclusive
  const payRegisters = await PayRegisterSummary.find({
    employeeId: employee._id,
    month: { $gte: startMonth, $lte: endMonth }
  });

  if (!payRegisters || payRegisters.length === 0) {
    // warning or skip?
    // throw new Error(`No pay registers found for employee ${employee.emp_no} between ${startMonth} and ${endMonth}`);
    return null; // Skip employee if no data
  }

  // 2. Calculate Aggregated Attendance Statistics
  const stats = calculateAggregatedAttendanceStats(payRegisters);

  // 3. Determine Salary Component Value (Base)
  let salaryValue = 0;
  if (policy.salaryComponent === 'gross_salary') {
    // Apply Multiplier if defined
    const multiplier = policy.grossSalaryMultiplier || 1;
    salaryValue = (employee.gross_salary || 0) * multiplier;
  } else if (policy.salaryComponent === 'fixed_amount') {
    salaryValue = policy.fixedBonusAmount || 0;
  }

  // 4. Find Applicable Tier
  // stats.percentage is 0-100
  const applicableTier = policy.tiers.find(tier =>
    stats.percentage <= tier.maxPercentage && stats.percentage >= tier.minPercentage
  );

  // 5. Calculate Bonus Amount
  let calculatedBonus = 0;
  if (applicableTier) {
    // Percentage Calculation
    if (applicableTier.bonusPercentage > 0) {
      calculatedBonus = (salaryValue * applicableTier.bonusPercentage) / 100;
    }
  }

  return {
    employeeId: employee._id,
    emp_no: employee.emp_no,
    month: `${startMonth} to ${endMonth}`, // Represent range
    salaryComponentValue: salaryValue,
    attendancePercentage: stats.percentage,
    attendanceDays: stats.numerator,
    totalMonthDays: stats.denominator, // Working Days
    appliedTier: applicableTier ? {
      minPercentage: applicableTier.minPercentage,
      maxPercentage: applicableTier.maxPercentage,
      bonusPercentage: applicableTier.bonusPercentage
    } : null,
    calculatedBonus: Math.round(calculatedBonus),
    finalBonus: Math.round(calculatedBonus),
    isManualOverride: false,
  };
};

/**
 * Helper: Calculate Aggregated Attendance Percentage
 */
function calculateAggregatedAttendanceStats(payRegisters) {
  let totalNumerator = 0;
  let totalDenominator = 0;

  payRegisters.forEach(reg => {
    const t = reg.totals;
    // Numerator: Present + OD
    const num = (t.totalPresentDays || 0) + (t.totalsODDays || t.totalODDays || 0);
    // Denominator: Working Days (Present + OD + Absent + Leaves)
    const den = (t.totalPresentDays || 0) + (t.totalsODDays || t.totalODDays || 0) +
      (t.totalAbsentDays || 0) + (t.totalLeaveDays || 0);

    totalNumerator += num;
    totalDenominator += den;
  });

  let percentage = 0;
  if (totalDenominator > 0) {
    percentage = (totalNumerator / totalDenominator) * 100;
  }

  return {
    numerator: totalNumerator,
    denominator: totalDenominator,
    percentage: Math.round(percentage * 100) / 100
  };
}
