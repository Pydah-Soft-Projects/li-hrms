const AllowanceDeductionMaster = require('../../allowances-deductions/model/AllowanceDeductionMaster');
const cacheService = require('../../shared/services/cacheService');

/**
 * Second Salary Allowance Calculation Service
 * Handles allowance calculations specifically for 2nd Salary cycle
 */

/**
 * Get resolved allowance rule for a department
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
 * Calculate allowance amount from rule
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
 * Calculate all allowances for an employee for 2nd Salary
 */
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

function calculateTotalAllowances(allowances) {
    return allowances.reduce((sum, allowance) => sum + (allowance.amount || 0), 0);
}

module.exports = {
    getResolvedAllowanceRule,
    calculateAllowanceAmount,
    calculateAllowances,
    calculateTotalAllowances,
};
