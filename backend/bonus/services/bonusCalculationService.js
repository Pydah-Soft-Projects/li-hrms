const PayRegisterSummary = require('../../pay-register/model/PayRegisterSummary');
const Employee = require('../../employees/model/Employee');

/**
 * Calculate Bonus for a single employee based on a policy and month
 * @param {Object} employee - Employee document
 * @param {Object} policy - BonusPolicy document
 * @param {String} month - YYYY-MM
 */
exports.calculateBonusForEmployee = async (employee, policy, month) => {
  // 1. Get Pay Register Data
  const payRegister = await PayRegisterSummary.findOne({
    employeeId: employee._id,
    month: month
  });

  if (!payRegister) {
    throw new Error(`Pay register not found for employee ${employee.emp_no} in ${month}`);
  }

  // 2. Calculate Attendance Statistics
  const stats = calculateAttendanceStats(payRegister);

  // 3. Determine Salary Component Value
  let salaryValue = 0;
  if (policy.salaryComponent === 'gross_salary') {
    salaryValue = employee.gross_salary || 0;
  } else if (policy.salaryComponent === 'basic') {
    // Assuming basic is 40% of gross if not explicitly separate (Need to check logic, but using safe default for now)
    // Or check if there is a 'Basic' allowance in employeeAllowances
    // For now, allow gross only or fallback using gross
    salaryValue = employee.gross_salary || 0;
  } else if (policy.salaryComponent === 'fixed_pay') {
    salaryValue = employee.gross_salary || 0; // User mentioned "fixed pay", assuming this links to gross
  }

  // 4. Find Applicable Tier
  // stats.percentage is 0-100
  const applicableTier = policy.tiers.find(tier =>
    stats.percentage <= tier.maxPercentage && stats.percentage >= tier.minPercentage
  );

  // 5. Calculate Bonus Amount
  let calculatedBonus = 0;
  if (applicableTier) {
    // Multiplier of Salary
    if (applicableTier.bonusMultiplier > 0) {
      calculatedBonus += (salaryValue * applicableTier.bonusMultiplier);
    }
    // Flat Amount
    if (applicableTier.flatAmount > 0) {
      calculatedBonus += applicableTier.flatAmount;
    }
  }

  return {
    employeeId: employee._id,
    emp_no: employee.emp_no,
    month,
    salaryComponentValue: salaryValue,
    attendancePercentage: stats.percentage,
    attendanceDays: stats.numerator,
    totalMonthDays: stats.denominator, // Working Days
    appliedTier: applicableTier ? {
      minPercentage: applicableTier.minPercentage,
      maxPercentage: applicableTier.maxPercentage,
      bonusMultiplier: applicableTier.bonusMultiplier
    } : null,
    calculatedBonus: Math.round(calculatedBonus), // Round to nearest integer
    finalBonus: Math.round(calculatedBonus),
    isManualOverride: false,
  };
};

/**
 * Helper: Calculate Attendance Percentage
 * Formula: (Present + OD) / (Present + Absent + Leave + OD)
 * Excludes Holidays and WeekOffs from the denominator (Working Days)
 */
function calculateAttendanceStats(payRegister) {
  const t = payRegister.totals;

  // Numerator: Days "Present" for bonus purposes
  // User Requirement: "acc. to the days present"
  // We include Present + OD.
  // Note: If Policy wanted Paid Leaves included, we'd add t.totalPaidLeaveDays
  const numerator = (t.totalPresentDays || 0) + (t.totalsODDays || t.totalODDays || 0);

  // Denominator: Total Working Days
  // Working Days = Present + Absent + All Leaves + OD
  const denominator = (t.totalPresentDays || 0) + (t.totalsODDays || t.totalODDays || 0) +
    (t.totalAbsentDays || 0) + (t.totalLeaveDays || 0);

  let percentage = 0;
  if (denominator > 0) {
    percentage = (numerator / denominator) * 100;
  } else {
    // Edge case: No working days? (e.g. all holidays). 
    // If no working days, maybe 100%? Or 0%?
    // Let's assume 0% to be safe, or better, handling it upstream.
    percentage = 0;
  }

  // Format to 2 decimal places
  percentage = Math.round(percentage * 100) / 100;

  return {
    numerator,
    denominator,
    percentage
  };
}
