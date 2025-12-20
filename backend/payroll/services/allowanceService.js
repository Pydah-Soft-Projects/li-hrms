const AllowanceDeductionMaster = require('../../allowances-deductions/model/AllowanceDeductionMaster');

/**
 * Allowance Calculation Service
 * Handles allowance calculations from AllowanceDeductionMaster
 */

/**
 * Get resolved allowance rule for a department
 * @param {Object} allowanceMaster - AllowanceDeductionMaster document
 * @param {String} departmentId - Department ID
 * @returns {Object} Resolved rule (department override or global)
 */
function getResolvedAllowanceRule(allowanceMaster, departmentId) {
  if (!allowanceMaster || !allowanceMaster.isActive) {
    return null;
  }

  // Check for department override
  if (departmentId && allowanceMaster.departmentRules && allowanceMaster.departmentRules.length > 0) {
    const deptRule = allowanceMaster.departmentRules.find(
      (rule) => rule.departmentId.toString() === departmentId.toString()
    );

    if (deptRule) {
      return {
        type: deptRule.type,
        amount: deptRule.amount,
        percentage: deptRule.percentage,
        percentageBase: deptRule.percentageBase,
        minAmount: deptRule.minAmount,
        maxAmount: deptRule.maxAmount,
        basedOnPresentDays: deptRule.basedOnPresentDays || false,
      };
    }
  }

  // Return global rule
  if (allowanceMaster.globalRule) {
    return {
      type: allowanceMaster.globalRule.type,
      amount: allowanceMaster.globalRule.amount,
      percentage: allowanceMaster.globalRule.percentage,
      percentageBase: allowanceMaster.globalRule.percentageBase,
      minAmount: allowanceMaster.globalRule.minAmount,
      maxAmount: allowanceMaster.globalRule.maxAmount,
      basedOnPresentDays: allowanceMaster.globalRule.basedOnPresentDays || false,
    };
  }

  return null;
}

/**
 * Calculate allowance amount from rule
 * @param {Object} rule - Resolved rule
 * @param {Number} basicPay - Basic pay
 * @param {Number} grossSalary - Gross salary (for percentage base = 'gross')
 * @param {Object} attendanceData - Attendance data for proration { presentDays, paidLeaveDays, odDays, monthDays }
 * @returns {Number} Allowance amount
 */
function calculateAllowanceAmount(rule, basicPay, grossSalary = null, attendanceData = null) {
  if (!rule) {
    return 0;
  }

  let amount = 0;

  if (rule.type === 'fixed') {
    amount = rule.amount || 0;

    // Prorate based on present days if enabled
    if (rule.basedOnPresentDays && attendanceData) {
      const { presentDays = 0, paidLeaveDays = 0, odDays = 0, monthDays = 30 } = attendanceData;
      const totalPaidDays = presentDays + paidLeaveDays + odDays;

      if (monthDays > 0) {
        const perDayAmount = amount / monthDays;
        amount = perDayAmount * totalPaidDays;
        console.log(`[Allowance] Prorated ${rule.name || 'allowance'}: ${rule.amount} / ${monthDays} * ${totalPaidDays} = ${amount}`);
      }
    }
  } else if (rule.type === 'percentage') {
    const base = rule.percentageBase === 'gross' && grossSalary ? grossSalary : basicPay;
    amount = (base * (rule.percentage || 0)) / 100;
  }

  // Apply min/max constraints
  if (rule.minAmount !== null && rule.minAmount !== undefined && amount < rule.minAmount) {
    amount = rule.minAmount;
  }
  if (rule.maxAmount !== null && rule.maxAmount !== undefined && amount > rule.maxAmount) {
    amount = rule.maxAmount;
  }

  return Math.round(amount * 100) / 100; // Round to 2 decimals
}

/**
 * Calculate all allowances for an employee
 * @param {String} departmentId - Department ID
 * @param {Number} basicPay - Basic pay
 * @param {Number} grossSalary - Gross salary (for second pass)
 * @param {Boolean} useGrossBase - Whether to use gross salary as base for percentage
 * @returns {Array} Array of allowance objects
 */
async function calculateAllowances(departmentId, basicPay, grossSalary = null, useGrossBase = false, attendanceData = null) {
  try {
    // Fetch all active allowances
    const allowanceMasters = await AllowanceDeductionMaster.find({
      category: 'allowance',
      isActive: true,
    });

    const allowances = [];

    for (const master of allowanceMasters) {
      const rule = getResolvedAllowanceRule(master, departmentId);

      if (!rule) {
        continue;
      }

      // Skip if percentage base is 'gross' and we're in first pass
      if (rule.type === 'percentage' && rule.percentageBase === 'gross' && !useGrossBase) {
        continue;
      }

      // Skip if percentage base is 'basic' and we're in second pass (gross base)
      if (rule.type === 'percentage' && rule.percentageBase === 'basic' && useGrossBase) {
        continue;
      }

      const amount = calculateAllowanceAmount(rule, basicPay, grossSalary, attendanceData);

      if (amount > 0) {
        allowances.push({
          masterId: master._id,
          name: master.name,
          amount,
          type: rule.type,
          base: rule.percentageBase || null,
          basedOnPresentDays: rule.basedOnPresentDays || false,
        });
      }
    }

    return allowances;
  } catch (error) {
    console.error('Error calculating allowances:', error);
    return [];
  }
}

/**
 * Calculate total allowances
 * @param {Array} allowances - Array of allowance objects
 * @returns {Number} Total allowances
 */
function calculateTotalAllowances(allowances) {
  return allowances.reduce((sum, allowance) => sum + (allowance.amount || 0), 0);
}

module.exports = {
  getResolvedAllowanceRule,
  calculateAllowanceAmount,
  calculateAllowances,
  calculateTotalAllowances,
};

