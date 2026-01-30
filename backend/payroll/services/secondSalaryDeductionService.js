const AttendanceDaily = require('../../attendance/model/AttendanceDaily');
const Permission = require('../../permissions/model/Permission');
const DepartmentSettings = require('../../departments/model/DepartmentSettings');
const PermissionDeductionSettings = require('../../permissions/model/PermissionDeductionSettings');
const AttendanceDeductionSettings = require('../../attendance/model/AttendanceDeductionSettings');
const AllowanceDeductionMaster = require('../../allowances-deductions/model/AllowanceDeductionMaster');
const cacheService = require('../../shared/services/cacheService');

/**
 * Second Salary Deduction Calculation Service
 * Handles all types of deductions specifically for the 2nd salary cycle
 */

/**
 * Resolve permission deduction rule values for a department or division.
 *
 * @param {string|number} departmentId - Department identifier to resolve department-specific rules.
 * @param {string|number|null} [divisionId=null] - Optional division identifier to resolve division-specific rules.
 * @returns {{countThreshold: number|null, deductionType: string|null, deductionAmount: number|null, minimumDuration: number|null, calculationMode: string|null}} Resolved permission deduction fields where each value is taken from department/division settings if present, otherwise from global permission deduction settings, or `null` if not defined.
 */
async function getResolvedPermissionDeductionRules(departmentId, divisionId = null) {
    try {
        const cacheKey = `settings:deduction:permission:second-salary:dept:${departmentId}:div:${divisionId || 'none'}`;
        let resolved = await cacheService.get(cacheKey);
        if (resolved) return resolved;

        const deptSettings = await DepartmentSettings.getByDeptAndDiv(departmentId, divisionId);
        const globalSettings = await PermissionDeductionSettings.getActiveSettings();

        resolved = {
            countThreshold: deptSettings?.permissions?.deductionRules?.countThreshold ?? globalSettings?.deductionRules?.countThreshold ?? null,
            deductionType: deptSettings?.permissions?.deductionRules?.deductionType ?? globalSettings?.deductionRules?.deductionType ?? null,
            deductionAmount: deptSettings?.permissions?.deductionRules?.deductionAmount ?? globalSettings?.deductionRules?.deductionAmount ?? null,
            minimumDuration: deptSettings?.permissions?.deductionRules?.minimumDuration ?? globalSettings?.deductionRules?.minimumDuration ?? null,
            calculationMode: deptSettings?.permissions?.deductionRules?.calculationMode ?? globalSettings?.deductionRules?.calculationMode ?? null,
        };

        await cacheService.set(cacheKey, resolved, 300);
        return resolved;
    } catch (error) {
        console.error('Error getting resolved permission deduction rules for second salary:', error);
        return {
            countThreshold: null,
            deductionType: null,
            deductionAmount: null,
            minimumDuration: null,
            calculationMode: null,
        };
    }
}

/**
 * Resolve attendance deduction rules for a department (and optional division) for the second salary cycle.
 *
 * Retrieves department-specific rules when present, falls back to global active attendance deduction settings,
 * and caches the resolved rule object for a short period.
 *
 * @param {string|number} departmentId - Department identifier to resolve rules for.
 * @param {string|number|null} [divisionId=null] - Optional division identifier to resolve division-scoped rules.
 * @returns {Object} An object containing the resolved rule fields (any field may be `null` when not configured):
 *  - {number|null} combinedCountThreshold
 *  - {string|null} deductionType
 *  - {number|null} deductionAmount
 *  - {number|null} minimumDuration
 *  - {string|null} calculationMode
 */
async function getResolvedAttendanceDeductionRules(departmentId, divisionId = null) {
    try {
        const cacheKey = `settings:deduction:attendance:second-salary:dept:${departmentId}:div:${divisionId || 'none'}`;
        let resolved = await cacheService.get(cacheKey);
        if (resolved) return resolved;

        const deptSettings = await DepartmentSettings.getByDeptAndDiv(departmentId, divisionId);
        const globalSettings = await AttendanceDeductionSettings.getActiveSettings();

        resolved = {
            combinedCountThreshold: deptSettings?.attendance?.deductionRules?.combinedCountThreshold ?? globalSettings?.deductionRules?.combinedCountThreshold ?? null,
            deductionType: deptSettings?.attendance?.deductionRules?.deductionType ?? globalSettings?.deductionRules?.deductionType ?? null,
            deductionAmount: deptSettings?.attendance?.deductionRules?.deductionAmount ?? globalSettings?.deductionRules?.deductionAmount ?? null,
            minimumDuration: deptSettings?.attendance?.deductionRules?.minimumDuration ?? globalSettings?.deductionRules?.minimumDuration ?? null,
            calculationMode: deptSettings?.attendance?.deductionRules?.calculationMode ?? globalSettings?.deductionRules?.calculationMode ?? null,
        };

        await cacheService.set(cacheKey, resolved, 300);
        return resolved;
    } catch (error) {
        console.error('Error getting resolved attendance deduction rules for second salary:', error);
        return {
            combinedCountThreshold: null,
            deductionType: null,
            deductionAmount: null,
            minimumDuration: null,
            calculationMode: null,
        };
    }
}

/**
 * Compute days to deduct according to the deduction type and calculation mode.
 *
 * @param {number} multiplier - Number of complete threshold units met.
 * @param {number} remainder - Remaining units beyond complete thresholds.
 * @param {number} threshold - Units required to form one threshold unit.
 * @param {string} deductionType - Deduction mode: `'half_day'`, `'full_day'`, or `'custom_amount'`.
 * @param {number|null} customAmount - Custom monetary amount applied per threshold when `deductionType` is `'custom_amount'`.
 * @param {number} perDayBasicPay - Employee's per-day basic pay used to convert custom amounts to days.
 * @param {string} calculationMode - Calculation mode; when `'proportional'` allows fractional deduction from `remainder`.
 * @returns {number} The calculated days to deduct, rounded to two decimal places.
 */
function calculateDaysToDeduct(multiplier, remainder, threshold, deductionType, customAmount, perDayBasicPay, calculationMode) {
    let days = 0;

    if (deductionType === 'half_day') {
        days = multiplier * 0.5;
        if (calculationMode === 'proportional' && remainder > 0 && threshold > 0) {
            days += (remainder / threshold) * 0.5;
        }
    } else if (deductionType === 'full_day') {
        days = multiplier * 1;
        if (calculationMode === 'proportional' && remainder > 0 && threshold > 0) {
            days += (remainder / threshold) * 1;
        }
    } else if (deductionType === 'custom_amount' && customAmount && perDayBasicPay > 0) {
        const amountPerThreshold = customAmount;
        days = (multiplier * amountPerThreshold) / perDayBasicPay;
        if (calculationMode === 'proportional' && remainder > 0 && threshold > 0) {
            days += ((remainder / threshold) * amountPerThreshold) / perDayBasicPay;
        }
    }

    return Math.round(days * 100) / 100;
}

/**
 * Compute the attendance-based second-salary deduction for an employee for a given month.
 *
 * @param {string|ObjectId} employeeId - Employee identifier.
 * @param {string} month - Month identifier in `YYYY-MM` format used to query pay register summary.
 * @param {string|ObjectId} departmentId - Department identifier used to resolve department-specific rules.
 * @param {number} perDayBasicPay - Employee's basic pay per day used to convert deducted days into an amount.
 * @param {string|ObjectId|null} [divisionId=null] - Optional division identifier used when resolving division-specific rules.
 * @returns {{attendanceDeduction: number, breakdown: {lateInsCount: number, earlyOutsCount: number, combinedCount: number, daysDeducted: number, deductionType: string|null, calculationMode: string|null}}}
 *   - attendanceDeduction: Deduction amount rounded to two decimals.
 *   - breakdown: Object describing how the deduction was derived:
 *     - lateInsCount: Count of late-ins from pay register (0 if unavailable).
 *     - earlyOutsCount: Count of early-outs from pay register (0 if unavailable).
 *     - combinedCount: Sum of late-ins and early-outs.
 *     - daysDeducted: Number of days (can be fractional) used to compute the deduction.
 *     - deductionType: Applied deduction type (e.g., 'half_day', 'full_day', 'custom_amount') or null if rules missing.
 *     - calculationMode: Applied calculation mode (e.g., 'proportional') or null if rules missing.
 */
async function calculateAttendanceDeduction(employeeId, month, departmentId, perDayBasicPay, divisionId = null) {
    try {
        const PayRegisterSummary = require('../../pay-register/model/PayRegisterSummary');
        let payRegister = await PayRegisterSummary.findOne({ employeeId, month }).lean();
        let lateInsCount = 0;
        let earlyOutsCount = 0;

        if (payRegister && payRegister.totals) {
            lateInsCount = payRegister.totals.lateCount || 0;
            earlyOutsCount = payRegister.totals.earlyOutCount || 0;
        }

        const rules = await getResolvedAttendanceDeductionRules(departmentId, divisionId);

        if (!rules.combinedCountThreshold || !rules.deductionType || !rules.calculationMode) {
            return {
                attendanceDeduction: 0,
                breakdown: {
                    lateInsCount,
                    earlyOutsCount,
                    combinedCount: lateInsCount + earlyOutsCount,
                    daysDeducted: 0,
                    deductionType: null,
                    calculationMode: null,
                },
            };
        }

        const combinedCount = lateInsCount + earlyOutsCount;
        let daysDeducted = 0;

        if (combinedCount >= rules.combinedCountThreshold) {
            const multiplier = Math.floor(combinedCount / rules.combinedCountThreshold);
            const remainder = combinedCount % rules.combinedCountThreshold;

            daysDeducted = calculateDaysToDeduct(
                multiplier,
                remainder,
                rules.combinedCountThreshold,
                rules.deductionType,
                rules.deductionAmount,
                perDayBasicPay,
                rules.calculationMode
            );
        }

        const attendanceDeduction = daysDeducted * perDayBasicPay;

        return {
            attendanceDeduction: Math.round(attendanceDeduction * 100) / 100,
            breakdown: {
                lateInsCount,
                earlyOutsCount,
                combinedCount,
                daysDeducted,
                deductionType: rules.deductionType,
                calculationMode: rules.calculationMode,
            },
        };
    } catch (error) {
        console.error('Error calculating second salary attendance deduction:', error);
        return {
            attendanceDeduction: 0,
            breakdown: {
                lateInsCount: 0,
                earlyOutsCount: 0,
                combinedCount: 0,
                daysDeducted: 0,
                deductionType: null,
                calculationMode: null,
            },
        };
    }
}

/**
 * Compute the permission-based deduction applied to an employee's second salary for a given month.
 *
 * @param {string|import('mongoose').Types.ObjectId} employeeId - Employee identifier.
 * @param {string} month - Month in `YYYY-MM` format to evaluate permissions for.
 * @param {string|import('mongoose').Types.ObjectId} departmentId - Department identifier used to resolve deduction rules.
 * @param {number} perDayBasicPay - Employee's basic pay per day used to convert deducted days into monetary amount.
 * @param {string|import('mongoose').Types.ObjectId|null} [divisionId=null] - Optional division identifier used to resolve division-specific rules.
 * @returns {{permissionDeduction: number, breakdown: {permissionCount: number, eligiblePermissionCount: number, daysDeducted: number, deductionType: string|null, calculationMode: string|null}}}
 *   permissionDeduction: Total deduction amount rounded to two decimals.
 *   breakdown.permissionCount: Total approved permissions found in the month.
 *   breakdown.eligiblePermissionCount: Number of permissions meeting the minimum duration threshold.
 *   breakdown.daysDeducted: Number of days equivalent deducted based on resolved rules.
 *   breakdown.deductionType: Resolved deduction type (`half_day`, `full_day`, `custom_amount`) or `null` if not applicable.
 *   breakdown.calculationMode: Resolved calculation mode (e.g., `proportional`, `exact`) or `null` if not applicable.
 */
async function calculatePermissionDeduction(employeeId, month, departmentId, perDayBasicPay, divisionId = null) {
    try {
        const rules = await getResolvedPermissionDeductionRules(departmentId, divisionId);

        if (!rules.countThreshold || !rules.deductionType || !rules.calculationMode) {
            return {
                permissionDeduction: 0,
                breakdown: {
                    permissionCount: 0,
                    eligiblePermissionCount: 0,
                    daysDeducted: 0,
                    deductionType: null,
                    calculationMode: null,
                },
            };
        }

        const [year, monthNum] = month.split('-').map(Number);
        const startDate = new Date(year, monthNum - 1, 1);
        const endDate = new Date(year, monthNum, 0, 23, 59, 59, 999);

        const permissions = await Permission.find({
            employeeId,
            date: {
                $gte: startDate,
                $lte: endDate,
            },
            status: 'approved',
        }).select('duration');

        const minimumDuration = rules.minimumDuration || 0;
        const eligiblePermissions = permissions.filter(
            (perm) => perm.duration !== null && perm.duration !== undefined && perm.duration >= minimumDuration
        );

        const eligiblePermissionCount = eligiblePermissions.length;
        const totalPermissionCount = permissions.length;
        let daysDeducted = 0;

        if (eligiblePermissionCount >= rules.countThreshold) {
            const multiplier = Math.floor(eligiblePermissionCount / rules.countThreshold);
            const remainder = eligiblePermissionCount % rules.countThreshold;

            daysDeducted = calculateDaysToDeduct(
                multiplier,
                remainder,
                rules.countThreshold,
                rules.deductionType,
                rules.deductionAmount,
                perDayBasicPay,
                rules.calculationMode
            );
        }

        const permissionDeduction = daysDeducted * perDayBasicPay;

        return {
            permissionDeduction: Math.round(permissionDeduction * 100) / 100,
            breakdown: {
                permissionCount: totalPermissionCount,
                eligiblePermissionCount,
                daysDeducted,
                deductionType: rules.deductionType,
                calculationMode: rules.calculationMode,
            },
        };
    } catch (error) {
        console.error('Error calculating second salary permission deduction:', error);
        return {
            permissionDeduction: 0,
            breakdown: {
                permissionCount: 0,
                eligiblePermissionCount: 0,
                daysDeducted: 0,
                deductionType: null,
                calculationMode: null,
            },
        };
    }
}

/**
 * Compute leave-based deduction for the second salary line.
 * @param {number} totalLeaves - Total leave days taken in the month.
 * @param {number} paidLeaves - Number of leave days that are paid (may be 0 or null).
 * @param {number} totalDaysInMonth - Total days in the month used to prorate pay.
 * @param {number} basicPay - Employee's monthly basic pay.
 * @returns {{leaveDeduction: number, breakdown: {totalLeaves: number, paidLeaves: number, unpaidLeaves: number, daysDeducted: number}}}
 *   leaveDeduction: The deduction amount rounded to two decimals.
 *   breakdown.totalLeaves: Normalized total leaves value (0 if falsy).
 *   breakdown.paidLeaves: Normalized paid leaves value (0 if falsy).
 *   breakdown.unpaidLeaves: Number of unpaid leave days (>= 0).
 *   breakdown.daysDeducted: Days used to compute the deduction (equal to unpaidLeaves).
 */
function calculateLeaveDeduction(totalLeaves, paidLeaves, totalDaysInMonth, basicPay) {
    const unpaidLeaves = Math.max(0, totalLeaves - (paidLeaves || 0));
    const daysDeducted = unpaidLeaves;
    const leaveDeduction = totalDaysInMonth > 0 ? (daysDeducted / totalDaysInMonth) * basicPay : 0;

    return {
        leaveDeduction: Math.round(leaveDeduction * 100) / 100,
        breakdown: {
            totalLeaves: totalLeaves || 0,
            paidLeaves: paidLeaves || 0,
            unpaidLeaves,
            daysDeducted,
        },
    };
}

/**
 * Resolve the applicable deduction rule for a department (and optionally a division) from a deduction master record.
 *
 * Searches for a division-and-department rule first, then a department-only rule, and falls back to the master global rule.
 * Inactive or missing masters return `null`.
 *
 * @param {Object} deductionMaster - Master deduction record containing `isActive`, optional `departmentRules` array and optional `globalRule`.
 * @param {(string|Object)} departmentId - Department identifier to match against department rules.
 * @param {(string|Object|null)} [divisionId=null] - Optional division identifier to match against division-level rules.
 * @returns {Object|null} Resolved rule object with keys `type`, `amount`, `percentage`, `percentageBase`, `minAmount`, `maxAmount`, and `basedOnPresentDays`, or `null` if no applicable rule exists.
 */
function getResolvedDeductionRule(deductionMaster, departmentId, divisionId = null) {
    if (!deductionMaster || !deductionMaster.isActive) {
        return null;
    }

    if (divisionId && departmentId && deductionMaster.departmentRules && deductionMaster.departmentRules.length > 0) {
        const divDeptRule = deductionMaster.departmentRules.find(
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

    if (departmentId && deductionMaster.departmentRules && deductionMaster.departmentRules.length > 0) {
        const deptOnlyRule = deductionMaster.departmentRules.find(
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

    if (deductionMaster.globalRule) {
        return {
            type: deductionMaster.globalRule.type,
            amount: deductionMaster.globalRule.amount,
            percentage: deductionMaster.globalRule.percentage,
            percentageBase: deductionMaster.globalRule.percentageBase,
            minAmount: deductionMaster.globalRule.minAmount,
            maxAmount: deductionMaster.globalRule.maxAmount,
            basedOnPresentDays: deductionMaster.globalRule.basedOnPresentDays || false,
        };
    }

    return null;
}

/**
 * Compute the monetary deduction defined by a resolved deduction rule.
 *
 * The function supports `fixed` rules (optionally pro-rated by present/paid/OD days when `basedOnPresentDays` is true)
 * and `percentage` rules (applied against `basicPay` or `gross` based on `percentageBase`). The result is clamped
 * to the rule's `minAmount`/`maxAmount` when provided.
 *
 * @param {Object|null} rule - Resolved deduction rule or `null`. Expected properties:
 *   - {string} type - `'fixed'` or `'percentage'`.
 *   - {number} [amount] - Fixed amount for `fixed` rules.
 *   - {boolean} [basedOnPresentDays] - If true for `fixed` rules, prorate by paid/present days.
 *   - {number} [percentage] - Percentage value for `percentage` rules.
 *   - {string} [percentageBase] - `'gross'` to apply percentage on `grossSalary`, otherwise `basicPay`.
 *   - {number|null} [minAmount] - Minimum allowed deduction.
 *   - {number|null} [maxAmount] - Maximum allowed deduction.
 * @param {number} basicPay - Employee's basic pay used as the default base for percentage calculations.
 * @param {number|null} [grossSalary=null] - Gross salary used when `percentageBase` is `'gross'`.
 * @param {Object|null} [attendanceData=null] - Attendance details used when prorating fixed amounts:
 *   - {number} [presentDays=0]
 *   - {number} [paidLeaveDays=0]
 *   - {number} [odDays=0]
 *   - {number} [monthDays=30]
 * @returns {number} Deduction amount rounded to two decimal places.
 */
function calculateDeductionAmount(rule, basicPay, grossSalary = null, attendanceData = null) {
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
 * Compute applicable "other" deductions for the second salary line by resolving master deduction rules
 * for the given department/division and calculating amounts per resolved rule.
 *
 * @param {string|Object} departmentId - Identifier of the department to resolve department-level rules.
 * @param {number} basicPay - Employee basic pay used as the default base for percentage or per-day calculations.
 * @param {number|null} [grossSalary=null] - Optional gross salary used when a rule's percentage base is 'gross'.
 * @param {Object|null} [attendanceData=null] - Optional attendance context used when a rule is based on present days.
 *        Expected to include values such as monthDays and totalPaidDays when applicable.
 * @param {string|Object|null} [divisionId=null] - Optional division identifier to resolve division-level rules.
 * @returns {Array<Object>} Array of deduction entries. Each entry contains:
 *          - masterId: Identifier of the deduction master.
 *          - name: Human-readable name of the deduction.
 *          - amount: Calculated deduction amount (number).
 *          - type: Rule type ('fixed' or 'percentage').
 *          - base: Deprecated/alias field for percentage base or null.
 *          - percentage: Percentage value when type is 'percentage'.
 *          - percentageBase: The base used for percentage calculations ('basic' or 'gross') or null.
 *          - minAmount: Minimum bound applied to the calculated amount, or null.
 *          - maxAmount: Maximum bound applied to the calculated amount, or null.
 *          - basedOnPresentDays: Boolean indicating whether the amount was scaled by present days.
 */
async function calculateOtherDeductions(departmentId, basicPay, grossSalary = null, attendanceData = null, divisionId = null) {
    try {
        const cacheKey = `settings:deduction:masters:all`;
        let deductionMasters = await cacheService.get(cacheKey);

        if (!deductionMasters) {
            deductionMasters = await AllowanceDeductionMaster.find({
                category: 'deduction',
                isActive: true,
            }).lean();
            await cacheService.set(cacheKey, deductionMasters, 600);
        }

        const results = [];

        for (const master of deductionMasters) {
            const rule = getResolvedDeductionRule(master, departmentId, divisionId);

            if (!rule) continue;

            const amount = calculateDeductionAmount(rule, basicPay, grossSalary, attendanceData);

            if (amount > 0) {
                results.push({
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

        return results;
    } catch (error) {
        console.error('Error calculating second salary other deductions:', error);
        return [];
    }
}

/**
 * Sum the `amount` fields of a list of deduction objects.
 * @param {Array<{amount?: number}>} deductions - Array of deduction objects; each object's `amount` may be missing or a number.
 * @returns {number} The numeric total of all deduction amounts (treats missing amounts as 0).
 */
function calculateTotalOtherDeductions(deductions) {
    return deductions.reduce((sum, deduction) => sum + (deduction.amount || 0), 0);
}

module.exports = {
    getResolvedPermissionDeductionRules,
    getResolvedAttendanceDeductionRules,
    calculateDaysToDeduct,
    calculateAttendanceDeduction,
    calculatePermissionDeduction,
    calculateLeaveDeduction,
    calculateOtherDeductions,
    getResolvedDeductionRule,
    calculateDeductionAmount,
    calculateTotalOtherDeductions,
};