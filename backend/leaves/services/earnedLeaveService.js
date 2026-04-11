/**
 * Earned Leave Service
 * Calculates earned leave based on configurable rules and Indian labor laws
 */

const Employee = require('../../employees/model/Employee');
const MonthlyAttendanceSummary = require('../../attendance/model/MonthlyAttendanceSummary');
const { calculateMonthlySummary } = require('../../attendance/services/summaryCalculationService');
const LeavePolicySettings = require('../../settings/model/LeavePolicySettings');
const DepartmentSettings = require('../../departments/model/DepartmentSettings');
const { resolveEffectiveEarnedLeave } = require('./earnedLeavePolicyResolver');
const { accumulateAttendanceRangeEl } = require('./earnedLeaveRangeAccumulation');
const leaveRegisterService = require('./leaveRegisterService');
const leaveRegisterYearLedgerService = require('./leaveRegisterYearLedgerService');
const ELHistory = require('../model/ELHistory');
const { extractISTComponents, createISTDate } = require('../../shared/utils/dateUtils');
const dateCycleService = require('./dateCycleService');

/**
 * Calculate earned leave for an employee for a specific month
 * @param {String} employeeId - Employee ID
 * @param {Number} month - Month (1-12)
 * @param {Number} year - Year
 * @param {Date} cycleStart - Optional cycle start date
 * @param {Date} cycleEnd - Optional cycle end date
 * @returns {Object} EL calculation details
 */
async function calculateEarnedLeave(employeeId, month, year, cycleStart = null, cycleEnd = null) {
    try {
        // Get employee and settings
        const employee = await Employee.findById(employeeId);
        const settings = await LeavePolicySettings.getSettings();

        if (!employee) {
            throw new Error('Employee not found');
        }

        const deptSettings = await DepartmentSettings.getByDeptAndDiv(employee.department_id, employee.division_id);
        const effectiveEL = resolveEffectiveEarnedLeave(settings.earnedLeave, deptSettings?.leaves);

        if (!effectiveEL.enabled) {
            return {
                eligible: false,
                reason: 'Earned leave is disabled for this department or globally',
                elEarned: 0,
                attendanceDays: 0,
                employeeId,
                month,
                year
            };
        }

        // Resolve cycle explicitly if not provided
        if (!cycleStart || !cycleEnd) {
            const targetDate = new Date(year, month - 1, 15);
            const cycleInfo = await dateCycleService.getPayrollCycleForDate(targetDate);
            cycleStart = cycleInfo.startDate;
            cycleEnd = cycleInfo.endDate;
        }

        // Check probation period (guarding against missing settings/DOJ)
        const probation = settings?.compliance?.probationPeriod;
        if (probation?.elApplicableAfter) {
            if (!employee.doj) {
                return {
                    eligible: false,
                    reason: 'Probation period cannot be evaluated due to missing DOJ',
                    elEarned: 0,
                    attendanceDays: 0,
                };
            }
            const doj = new Date(employee.doj);
            if (Number.isNaN(doj.getTime())) {
                return {
                    eligible: false,
                    reason: 'Probation period cannot be evaluated due to invalid DOJ',
                    elEarned: 0,
                    attendanceDays: 0,
                };
            }
            const currentDate = cycleEnd;
            const monthsInService = (currentDate.getFullYear() - doj.getFullYear()) * 12 +
                (currentDate.getMonth() - doj.getMonth());

            if (monthsInService < probation.months) {
                return {
                    eligible: false,
                    reason: 'Probation period not completed',
                    elEarned: 0,
                    attendanceDays: 0,
                    requiredDays: effectiveEL.attendanceRules?.minDaysForFirstEL
                };
            }
        }

        const earningType = effectiveEL.earningType;
        const elPolicyWrapper = { earnedLeave: effectiveEL, compliance: settings.compliance };

        // Get attendance data for the specific payroll cycle
        const attendanceData = await getAttendanceData(employeeId, month, year, employee, cycleStart, cycleEnd);

        // Calculate EL based on earning type (rules = global policy + department overrides)
        let elCalculation;
        switch (earningType) {
            case 'attendance_based':
                elCalculation = calculateAttendanceBasedEL(attendanceData, elPolicyWrapper);
                break;
            case 'fixed':
                elCalculation = calculateFixedEL(elPolicyWrapper, deptSettings);
                break;
            default:
                elCalculation = calculateAttendanceBasedEL(attendanceData, elPolicyWrapper);
        }

        return {
            eligible: true,
            employeeId,
            month,
            year,
            earningType: earningType,
            attendanceDays: elCalculation.attendanceDays,
            elEarned: elCalculation.elEarned,
            maxELForMonth: elCalculation.maxELForMonth,
            calculationBreakdown: elCalculation.breakdown,
            effectiveEarnedLeavePolicy: effectiveEL,
            settings: {
                minDaysForEL: effectiveEL.attendanceRules?.minDaysForFirstEL,
                daysPerEL: effectiveEL.attendanceRules?.daysPerEL,
                maxELPerMonth: effectiveEL.attendanceRules?.maxELPerMonth
            }
        };

    } catch (error) {
        console.error('Error calculating earned leave:', error);
        throw error;
    }
}

/**
 * EL attendance input: **monthly attendance summary only** (same engine as payroll / pay register).
 * Credit-day basis = totalPayableShifts + totalWeeklyOffs + totalHolidays (capped at pay-period days).
 */
async function getAttendanceData(employeeId, month, year, employee, cycleStart, cycleEnd) {
    const empNoRaw = employee.emp_no && String(employee.emp_no).trim();
    const empNo = empNoRaw ? empNoRaw.toUpperCase() : employee.emp_no;
    const monthStr = `${year}-${String(month).padStart(2, '0')}`;

    let summary = await MonthlyAttendanceSummary.findOne({ employeeId, month: monthStr }).lean();

    if (!summary) {
        await calculateMonthlySummary(employeeId, empNo, year, month);
        summary = await MonthlyAttendanceSummary.findOne({ employeeId, month: monthStr }).lean();
    }

    if (!summary) {
        throw new Error(
            `Monthly attendance summary missing for ${monthStr} after recalculate (employee ${empNo || employeeId})`
        );
    }

    const totalDays =
        Number(summary.totalDaysInMonth) ||
        Math.round((cycleEnd.getTime() - cycleStart.getTime()) / (1000 * 60 * 60 * 24)) + 1;
    const payableShifts = Number(summary.totalPayableShifts) || 0;
    const weeklyOffs = Number(summary.totalWeeklyOffs) || 0;
    const holidays = Number(summary.totalHolidays) || 0;
    const presentDays = Number(summary.totalPresentDays) || 0;

    const creditDaysRaw = payableShifts + weeklyOffs + holidays;
    const creditDays = Math.round(creditDaysRaw * 1000) / 1000;
    const effectiveDays = Math.min(totalDays, creditDays);

    // Single "days" figure exposed on EL API = same basis used for range + ratio EL
    const attendanceDays = effectiveDays;
    const workedDays = presentDays;

    return {
        month,
        year,
        totalDays,
        presentDays,
        payableShifts,
        weeklyOffs,
        holidays,
        workedDays,
        attendanceDays,
        effectiveDays,
        monthlySummaryMonth: summary.month,
        summaryStartDate: summary.startDate,
        summaryEndDate: summary.endDate,
        creditDays,
        attendanceRecords: [],
        monthlySummaryId: summary._id,
    };
}

/**
 * Calculate EL based on attendance with cumulative ranges
 */
function calculateAttendanceBasedEL(attendanceData, settings) {
    const rules = settings.earnedLeave.attendanceRules;
    let elEarned = 0;
    const breakdown = [];

    // Use attendance ranges if configured (cumulative logic)
    // effectiveDays = min(periodDays, payableShifts + weeklyOffs + holidays) from monthly summary
    if (rules.attendanceRanges && rules.attendanceRanges.length > 0) {
        const effectiveDays = attendanceData.effectiveDays !== undefined
            ? attendanceData.effectiveDays
            : attendanceData.attendanceDays;

        const { elEarned: stacked, rangeBreakdown } = accumulateAttendanceRangeEl(
            rules.attendanceRanges,
            effectiveDays,
            rules.maxELPerMonth
        );
        elEarned = stacked;

        breakdown.push({
            type: 'attendance_ranges_cumulative',
            effectiveDays,
            attendanceDays: attendanceData.attendanceDays,
            payableShifts: attendanceData.payableShifts,
            weeklyOffs: attendanceData.weeklyOffs,
            holidays: attendanceData.holidays,
            presentDays: attendanceData.presentDays,
            creditDays: attendanceData.creditDays,
            summaryMonth: attendanceData.monthlySummaryMonth,
            totalEL: elEarned,
            maxELForMonth: rules.maxELPerMonth,
            ranges: rangeBreakdown,
            calculation:
                'creditDays = totalPayableShifts+totalWeeklyOffs+totalHolidays (monthly summary); effectiveDays=min(periodDays,creditDays); EL=sum(range.elEarned for each range with effectiveDays>=minDays), then cap maxELPerMonth',
        });

    } else {
        // Standard attendance-based calculation (fallback) — same monthly-summary credit days as ranges
        const daysBasis =
            attendanceData.effectiveDays !== undefined && attendanceData.effectiveDays !== null
                ? attendanceData.effectiveDays
                : attendanceData.attendanceDays;

        if (daysBasis >= rules.minDaysForFirstEL) {
            elEarned = Math.floor(daysBasis / rules.daysPerEL);
            elEarned = Math.min(elEarned, rules.maxELPerMonth);

            breakdown.push({
                type: 'attendance_based',
                attendanceDays: daysBasis,
                effectiveDays: attendanceData.effectiveDays,
                payableShifts: attendanceData.payableShifts,
                weeklyOffs: attendanceData.weeklyOffs,
                holidays: attendanceData.holidays,
                presentDays: attendanceData.presentDays,
                creditDays: attendanceData.creditDays,
                minDaysRequired: rules.minDaysForFirstEL,
                daysPerEL: rules.daysPerEL,
                calculatedEL: Math.floor(daysBasis / rules.daysPerEL),
                maxELForMonth: rules.maxELPerMonth,
                finalEL: elEarned,
            });
        }
    }

    return {
        attendanceDays: attendanceData.attendanceDays,
        effectiveDays: attendanceData.effectiveDays,
        elEarned,
        maxELForMonth: rules.maxELPerMonth,
        breakdown
    };
}

/**
 * Calculate fixed EL (not based on attendance)
 */
function calculateFixedEL(settings, deptSettings = null) {
    const rules = settings.earnedLeave.fixedRules;
    const elPerMonth = deptSettings?.leaves?.paidLeavesCount !== undefined && deptSettings?.leaves?.paidLeavesCount !== null
        ? (deptSettings.leaves.paidLeavesCount / 12)
        : rules.elPerMonth;

    return {
        attendanceDays: 0,
        elEarned: elPerMonth,
        maxELForMonth: elPerMonth,
        breakdown: [{
            type: 'fixed',
            elPerMonth: elPerMonth,
            maxELPerYear: rules.maxELPerYear
        }]
    };
}

/**
 * Update earned leave for all employees (cron job)
 */
async function updateEarnedLeaveForAllEmployees(month = null, year = null) {
    try {
        const settings = await LeavePolicySettings.getSettings();

        if (!settings.autoUpdate.enabled) {
            console.log('Auto EL update is disabled');
            return { success: false, message: 'Auto update disabled' };
        }

        // Default to current month if not provided
        if (!month || !year) {
            const now = new Date();
            month = now.getMonth() + 1;
            year = now.getFullYear();
        }

        const results = {
            processed: 0,
            success: 0,
            errors: [],
            details: []
        };
        // Stream active employees to avoid loading all into memory
        const cursor = Employee.find({ is_active: true }).select('_id emp_no').cursor();
        for await (const employee of cursor) {
            try {
                const calculation = await calculateEarnedLeave(employee._id, month, year);

                if (calculation.eligible && calculation.elEarned > 0) {
                    const cycleDate = new Date(year, month - 1, 15);
                    const fy = await dateCycleService.getFinancialYearForDate(cycleDate);
                    const periodInfo = await dateCycleService.getPeriodInfo(cycleDate);
                    const hasCredit = await leaveRegisterYearLedgerService.hasEarnedLeaveCreditInMonth(
                        employee._id,
                        fy.name,
                        periodInfo.payrollCycle.month,
                        periodInfo.payrollCycle.year
                    );
                    if (hasCredit) {
                        results.processed++;
                        continue;
                    }
                    await leaveRegisterService.addEarnedLeaveCredit(
                        employee._id,
                        calculation.elEarned,
                        month,
                        year,
                        calculation.breakdown
                    );

                    // Record EL history for audit (idempotent via LeaveRegisterYear guard above)
                    try {
                        await ELHistory.create({
                            employeeId: employee._id,
                            empNo: employee.emp_no,
                            month: Number(month),
                            year: Number(year),
                            days: calculation.elEarned,
                            type: 'CREDIT',
                            source: 'AUTO_ACCRUAL',
                            autoGeneratedType: 'EARNED_LEAVE',
                            reason: 'Monthly earned leave accrual',
                            breakdown: calculation.breakdown,
                        });
                    } catch (e) {
                        console.error('Failed to write ELHistory for auto accrual:', e);
                    }

                    results.details.push({
                        employeeId: employee._id,
                        empNo: employee.emp_no,
                        elEarned: calculation.elEarned,
                        attendanceDays: calculation.attendanceDays,
                        leaveRegisterId: 'created'
                    });

                    results.success++;
                }

                results.processed++;
            } catch (error) {
                results.errors.push({
                    employeeId: employee._id,
                    error: error.message
                });
            }
        }

        console.log(`EL Update Complete: ${results.success}/${results.processed} employees updated`);

        return {
            success: true,
            month,
            year,
            ...results
        };

    } catch (error) {
        console.error('Error in bulk EL update:', error);
        return {
            success: false,
            error: error.message
        };
    }
}

/**
 * Get EL balance for employee (including carry forward)
 */
async function getELBalance(employeeId, asOfDate = null) {
    try {
        const employee = await Employee.findById(employeeId);
        const settings = await LeavePolicySettings.getSettings();

        if (!employee) {
            throw new Error('Employee not found');
        }

        const targetDate = asOfDate || new Date();
        const currentMonth = targetDate.getMonth() + 1;
        const currentYear = targetDate.getFullYear();

        // Get current EL balance
        const currentEL = employee.paidLeaves || 0;

        // Calculate carry forward expiry
        const carryForwardExpiry = calculateCarryForwardExpiry(employee, settings, targetDate);

        return {
            currentBalance: currentEL,
            carryForwardBalance: carryForwardExpiry.balance,
            expiredAmount: carryForwardExpiry.expired,
            availableBalance: currentEL + carryForwardExpiry.balance,
            settings: {
                expiryMonths: settings.carryForward.earnedLeave.expiryMonths,
                maxMonths: settings.carryForward.earnedLeave.maxMonths
            }
        };

    } catch (error) {
        console.error('Error calculating EL balance:', error);
        throw error;
    }
}

/**
 * Calculate carry forward expiry
 */
function calculateCarryForwardExpiry(employee, settings, asOfDate) {
    // This is a simplified version - in production, you'd track actual carry forward amounts
    // with their original dates and calculate expiry based on those dates

    const expiryMonths = settings.carryForward.earnedLeave.expiryMonths;

    if (expiryMonths === 0) {
        return { balance: 0, expired: 0 }; // No expiry
    }

    // For now, return placeholder - implement actual carry forward tracking
    return {
        balance: 0,
        expired: 0,
        note: 'Implement actual carry forward tracking with dates'
    };
}

module.exports = {
    calculateEarnedLeave,
    updateEarnedLeaveForAllEmployees,
    getELBalance
};
