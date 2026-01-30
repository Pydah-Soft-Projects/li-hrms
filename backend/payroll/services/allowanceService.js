const AllowanceDeductionMaster = require('../../allowances-deductions/model/AllowanceDeductionMaster');
const cacheService = require('../../shared/services/cacheService');

/**
 * Allowance Calculation Service
 * Handles allowance calculations from AllowanceDeductionMaster
 */

/**
 * Get resolved allowance rule for a department (with optional division support)
 * @param {Object} allowanceMaster - AllowanceDeductionMaster document
 * @param {String} departmentId - Department ID
 * @param {String} divisionId - Optional Division ID
 * @returns {Object} Resolved rule (division-department override, department-only override, or global)
 */
function getResolvedAllowanceRule(allowanceMaster, departmentId, divisionId = null) {
  if (!allowanceMaster || !allowanceMaster.isActive) {
    return null;
  }

  // Priority 1: Check for division-department specific rule
  if (divisionId && departmentId && allowanceMaster.departmentRules && allowanceMaster.departmentRules.length > 0) {
    const divDeptRule = allowanceMaster.departmentRules.find(
      (rule) =>
        rule.divisionId &&
        rule.divisionId.toString() === divisionId.toString() &&
        rule.departmentId.toString() === departmentId.toString()
    );

    if (divDeptRule) {
      return {
        type: divDeptRule.type,
        amount: divDeptRule.amount,
        percentage: divDeptRule.percentage,
        percentageBase: divDeptRule.percentageBase,
        minAmount: divDeptRule.minAmount,
        maxAmount: divDeptRule.maxAmount,
        basedOnPresentDays: divDeptRule.basedOnPresentDays || false,
      };
    }
  }

  // Priority 2: Check for department-only rule (backward compatible)
  if (departmentId && allowanceMaster.departmentRules && allowanceMaster.departmentRules.length > 0) {
    const deptOnlyRule = allowanceMaster.departmentRules.find(
      (rule) =>
        !rule.divisionId && // No division specified
        rule.departmentId.toString() === departmentId.toString()
    );

    if (deptOnlyRule) {
      return {
        type: deptOnlyRule.type,
        amount: deptOnlyRule.amount,
        percentage: deptOnlyRule.percentage,
        percentageBase: deptOnlyRule.percentageBase,
        minAmount: deptOnlyRule.minAmount,
        maxAmount: deptOnlyRule.maxAmount,
        basedOnPresentDays: deptOnlyRule.basedOnPresentDays || false,
      };
    }
  }

  // Priority 3: Return global rule
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
 * Calculate applicable allowances for a department and return detailed allowance entries.
 * 
 * @param {String} departmentId - Department identifier to resolve department-specific rules.
 * @param {Number} basicPay - Employee basic pay used as the default calculation base.
 * @param {Number|null} grossSalary - Employee gross salary; used when a rule's percentage base is `gross`.
 * @param {Boolean} useGrossBase - When `true`, includes allowances whose percentage base is `gross`; when `false`, includes those based on `basic`.
 * @param {Object|null} attendanceData - Attendance values used for proration when a rule is based on present days. Expected shape: `{ presentDays: Number, paidLeaveDays: Number, odDays: Number, monthDays: Number }`.
 * @param {String|null} divisionId - Optional division identifier to resolve division-specific rules.
 * @return {Array<Object>} Array of allowance objects. Each object contains:
 * - `masterId` (String): allowance master document id
 * - `name` (String): allowance name
 * - `amount` (Number): calculated allowance amount (rounded to 2 decimals)
 * - `type` (String): `'fixed'` or `'percentage'`
 * - `base` (String|null): the base used for percentage calculations (`'gross'` or `'basic'`) or `null` for fixed amounts
 * - `percentage` (Number|undefined): percentage value when `type` is `'percentage'`
 * - `percentageBase` (String|undefined): same as `base` (preserved for clarity)
 * - `minAmount` (Number|undefined): minimum clamped amount if defined
 * - `maxAmount` (Number|undefined): maximum clamped amount if defined
 * - `basedOnPresentDays` (Boolean): whether the amount was prorated based on present days
 */
async function calculateAllowances(departmentId, basicPay, grossSalary = null, useGrossBase = false, attendanceData = null, divisionId = null) {
  try {
    // Fetch all active allowances with caching
    const cacheKey = `settings:allowance:masters:all`;
    let allowanceMasters = await cacheService.get(cacheKey);

    if (!allowanceMasters) {
      allowanceMasters = await AllowanceDeductionMaster.find({
        category: 'allowance',
        isActive: true,
      }).lean();
      await cacheService.set(cacheKey, allowanceMasters, 600);
    }

    const allowances = [];

    for (const master of allowanceMasters) {
      const rule = getResolvedAllowanceRule(master, departmentId, divisionId);

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

      if (amount >= 0) {
        allowances.push({
          masterId: master._id,
          name: master.name,
          amount,
          type: rule.type,
          base: rule.percentageBase || null,
          percentage: rule.percentage,
          percentageBase: rule.percentageBase,
          minAmount: rule.minAmount,
          maxAmount: rule.maxAmount,
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
