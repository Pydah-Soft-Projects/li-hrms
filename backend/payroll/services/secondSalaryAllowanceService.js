const AllowanceDeductionMaster = require('../../allowances-deductions/model/AllowanceDeductionMaster');
const cacheService = require('../../shared/services/cacheService');

/**
 * Second Salary Allowance Calculation Service
 * Handles allowance calculations specifically for 2nd Salary cycle
 */

/**
 * Resolve the applicable allowance rule for a department and optional division from an allowance master.
 *
 * Searches department+division rules first, then department-only rules, then the master global rule.
 *
 * @param {Object} allowanceMaster - Allowance master record (must include `isActive`, optional `departmentRules`, optional `globalRule`).
 * @param {(string|number|Object)} departmentId - Department identifier to match against department rules.
 * @param {(string|number|Object)=} divisionId - Optional division identifier to match division-specific department rules.
 * @returns {{type:string, amount?:number, percentage?:number, percentageBase?:string, minAmount?:number, maxAmount?:number, basedOnPresentDays:boolean}|null}
 *          An object describing the resolved rule with fields: `type`, `amount`, `percentage`, `percentageBase`, `minAmount`, `maxAmount`, and `basedOnPresentDays` (defaults to `false`), or `null` if no applicable rule is found or the master is inactive.
 */
function getResolvedAllowanceRule(allowanceMaster, departmentId, divisionId = null) {
    if (!allowanceMaster || !allowanceMaster.isActive) {
        return null;
    }

    // Same priority as regular payroll
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

    if (departmentId && allowanceMaster.departmentRules && allowanceMaster.departmentRules.length > 0) {
        const deptOnlyRule = allowanceMaster.departmentRules.find(
            (rule) =>
                !rule.divisionId &&
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
 * Compute the allowance amount defined by a resolved allowance rule.
 *
 * @param {Object} rule - Resolved allowance rule. Expected fields:
 *   - type: 'fixed' or 'percentage'
 *   - amount: fixed amount (for 'fixed')
 *   - percentage: percentage value (for 'percentage')
 *   - percentageBase: 'basic' or 'gross' (for 'percentage')
 *   - minAmount, maxAmount: numeric bounds to apply after calculation
 *   - basedOnPresentDays: boolean indicating pro‑ration for fixed amounts
 * @param {number} basicPay - Base value used for percentage calculations (for second salary this should be the second_salary value).
 * @param {number|null} grossSalary - Gross salary used when percentageBase === 'gross'.
 * @param {Object|null} attendanceData - Attendance info used when pro‑rating fixed amounts. Shape: { presentDays, paidLeaveDays, odDays, monthDays } where monthDays defaults to 30.
 * @returns {number} The calculated allowance amount rounded to two decimals.
 */
function calculateAllowanceAmount(rule, basicPay, grossSalary = null, attendanceData = null) {
    if (!rule) {
        return 0;
    }

    let amount = 0;

    if (rule.type === 'fixed') {
        amount = rule.amount || 0;

        if (rule.basedOnPresentDays && attendanceData) {
            const { presentDays = 0, paidLeaveDays = 0, odDays = 0, monthDays = 30 } = attendanceData;
            const totalPaidDays = presentDays + paidLeaveDays + odDays;

            if (monthDays > 0) {
                const perDayAmount = amount / monthDays;
                amount = perDayAmount * totalPaidDays;
            }
        }
    } else if (rule.type === 'percentage') {
        // For 2nd salary, basicPay being passed in will be the employee.second_salary
        const base = rule.percentageBase === 'gross' && grossSalary ? grossSalary : basicPay;
        amount = (base * (rule.percentage || 0)) / 100;
    }

    if (rule.minAmount !== null && rule.minAmount !== undefined && amount < rule.minAmount) {
        amount = rule.minAmount;
    }
    if (rule.maxAmount !== null && rule.maxAmount !== undefined && amount > rule.maxAmount) {
        amount = rule.maxAmount;
    }

    return Math.round(amount * 100) / 100;
}

/**
 * Compute all applicable second-salary allowances for an employee in a department or division.
 * @param {string|number} departmentId - Department identifier used to resolve department-level rules.
 * @param {number} basicPay - Basic pay used as the default percentage base.
 * @param {number|null} grossSalary - Gross salary used when a rule's percentage base is `gross`; may be null.
 * @param {boolean} useGrossBase - When true, prefer gross-based percentage rules; when false, prefer basic-based percentage rules.
 * @param {Object|null} attendanceData - Optional attendance object used to prorate fixed allowances. Expected shape: { presentDays, paidLeaveDays, odDays, monthDays }.
 * @param {string|number|null} divisionId - Optional division identifier used to resolve division-specific rules.
 * @returns {Array<Object>} An array of allowance objects. Each object contains: masterId, name, amount, type, base (alias for percentageBase), percentage, percentageBase, minAmount, maxAmount, basedOnPresentDays.
async function calculateAllowances(departmentId, basicPay, grossSalary = null, useGrossBase = false, attendanceData = null, divisionId = null) {
    try {
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
            // Future: Could filter for master.includeInSecondSalary if such field is added
            const rule = getResolvedAllowanceRule(master, departmentId, divisionId);

            if (!rule) {
                continue;
            }

            if (rule.type === 'percentage' && rule.percentageBase === 'gross' && !useGrossBase) {
                continue;
            }

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
        console.error('Error calculating second salary allowances:', error);
        return [];
    }
}

/**
 * Compute the sum of amounts from an array of allowance objects.
 * @param {Array<Object>} allowances - Array of allowance objects; each may have a numeric `amount` property.
 * @returns {number} The numeric total of all `amount` values (treats missing or falsy amounts as 0).
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