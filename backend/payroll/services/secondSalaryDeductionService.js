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
 * Get resolved permission deduction rules
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
 * Get resolved attendance deduction rules
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
 * Calculate days to deduct based on deduction type
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
 * Calculate attendance deduction (late-ins + early-outs) for Second Salary
 */
async function calculateAttendanceDeduction(employeeId, month, departmentId, perDayBasicPay, divisionId = null) {
    try {
        const PayRegisterSummary = require('../../pay-register/model/PayRegisterSummary');
        let payRegister = await PayRegisterSummary.findOne({ employeeId, month }).lean();
        let lateInsCount = 0;
        let earlyOutsCount = 0;
        let source = 'attendance_logs';

        // Priority 1: Check Pay Register Summary
        if (payRegister && payRegister.totals) {
            const prLates = payRegister.totals.lateCount || 0;
            const prEarly = payRegister.totals.earlyOutCount || 0;

            if (prLates > 0 || prEarly > 0) {
                lateInsCount = prLates;
                earlyOutsCount = prEarly;
                source = 'pay_register_summary';
            }
        }

        // Priority 2: Fallback to Raw Attendance Logs (Matching regular payroll)
        if (lateInsCount === 0 && earlyOutsCount === 0) {
            const rulesTemp = await getResolvedAttendanceDeductionRules(departmentId, divisionId);
            const minimumDuration = rulesTemp.minimumDuration || 0;
            const [year, monthNum] = month.split('-').map(Number);
            const startDate = new Date(year, monthNum - 1, 1);
            const endDate = new Date(year, monthNum, 0, 23, 59, 59, 999);

            const attendanceRecords = await AttendanceDaily.find({
                employeeId,
                date: {
                    $gte: startDate,
                    $lte: endDate,
                },
            }).select('lateInMinutes earlyOutMinutes');

            for (const record of attendanceRecords) {
                if (record.lateInMinutes !== null && record.lateInMinutes !== undefined && record.lateInMinutes >= minimumDuration) {
                    lateInsCount++;
                }
                if (record.earlyOutMinutes !== null && record.earlyOutMinutes !== undefined && record.earlyOutMinutes >= minimumDuration) {
                    earlyOutsCount++;
                }
            }
        }

        console.log(`[SecondSalaryDeduction] Employee ${employeeId} - Lates: ${lateInsCount}, Early: ${earlyOutsCount} (Source: ${source})`);

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
 * Calculate permission deduction for Second Salary
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
 * Calculate leave deduction for Second Salary
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
 * Get resolved deduction rule for a department
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
 * Calculate deduction amount from rule
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
 * Calculate other deductions for Second Salary
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

        // Separate deductions by type (Matching regular payroll logic)
        const fixedDeductions = [];
        const percentageBasicDeductions = [];
        const percentageGrossDeductions = [];

        for (const master of deductionMasters) {
            const rule = getResolvedDeductionRule(master, departmentId, divisionId);
            if (!rule) continue;

            if (rule.type === 'fixed') {
                const amount = calculateDeductionAmount(rule, basicPay, grossSalary, attendanceData);
                if (amount >= 0) {
                    fixedDeductions.push({
                        masterId: master._id,
                        name: master.name,
                        amount,
                        type: 'fixed',
                        base: null,
                        percentage: rule.percentage,
                        percentageBase: rule.percentageBase,
                        minAmount: rule.minAmount,
                        maxAmount: rule.maxAmount,
                        basedOnPresentDays: rule.basedOnPresentDays || false,
                    });
                }
            } else if (rule.type === 'percentage') {
                if (rule.percentageBase === 'basic') {
                    percentageBasicDeductions.push({ master, rule });
                } else if (rule.percentageBase === 'gross') {
                    percentageGrossDeductions.push({ master, rule });
                }
            }
        }

        // Calculate percentage deductions based on 'basic'
        const percentageBasicResults = [];
        for (const item of percentageBasicDeductions) {
            const amount = calculateDeductionAmount(item.rule, basicPay, null, attendanceData);
            if (amount >= 0) {
                percentageBasicResults.push({
                    masterId: item.master._id,
                    name: item.master.name,
                    amount,
                    type: 'percentage',
                    base: 'basic',
                    percentage: item.rule.percentage,
                    percentageBase: item.rule.percentageBase,
                    minAmount: item.rule.minAmount,
                    maxAmount: item.rule.maxAmount,
                    basedOnPresentDays: item.rule.basedOnPresentDays || false,
                });
            }
        }

        // Calculate percentage deductions based on 'gross'
        const percentageGrossResults = [];
        if (grossSalary !== null && grossSalary !== undefined) {
            for (const item of percentageGrossDeductions) {
                const amount = calculateDeductionAmount(item.rule, basicPay, grossSalary, attendanceData);
                if (amount >= 0) {
                    percentageGrossResults.push({
                        masterId: item.master._id,
                        name: item.master.name,
                        amount,
                        type: 'percentage',
                        base: 'gross',
                        percentage: item.rule.percentage,
                        percentageBase: item.rule.percentageBase,
                        minAmount: item.rule.minAmount,
                        maxAmount: item.rule.maxAmount,
                        basedOnPresentDays: item.rule.basedOnPresentDays || false,
                    });
                }
            }
        }

        // Combine all results
        return [...fixedDeductions, ...percentageBasicResults, ...percentageGrossResults];
    } catch (error) {
        console.error('Error calculating second salary other deductions:', error);
        return [];
    }
}

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
