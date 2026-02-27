/**
 * Earned Leave Service
 * Calculates earned leave based on configurable rules and Indian labor laws
 */

const Employee = require('../../employees/model/Employee');
const AttendanceDaily = require('../../attendance/model/AttendanceDaily');
const LeavePolicySettings = require('../../settings/model/LeavePolicySettings');
const DepartmentSettings = require('../../departments/model/DepartmentSettings');
const leaveRegisterService = require('./leaveRegisterService');
const LeaveRegister = require('../model/LeaveRegister');
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

        if (settings.earnedLeave?.enabled === false) {
            return {
                eligible: false,
                reason: 'Earned leave is disabled',
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
                    requiredDays: settings.earnedLeave?.attendanceRules?.minDaysForFirstEL
                };
            }
        }

        // Get department settings for overrides
        const deptSettings = await DepartmentSettings.getByDeptAndDiv(employee.department_id, employee.division_id);
        const earningType = deptSettings?.leaves?.elEarningType || settings.earnedLeave.earningType;

        // Get attendance data for the specific payroll cycle
        const attendanceData = await getAttendanceData(employeeId, month, year, settings, employee, cycleStart, cycleEnd);

        // Calculate EL based on earning type
        let elCalculation;
        switch (earningType) {
            case 'attendance_based':
                elCalculation = calculateAttendanceBasedEL(attendanceData, settings);
                break;
            case 'fixed':
                elCalculation = calculateFixedEL(settings, deptSettings);
                break;
            default:
                elCalculation = calculateAttendanceBasedEL(attendanceData, settings);
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
            settings: {
                minDaysForEL: settings.earnedLeave?.attendanceRules?.minDaysForFirstEL,
                daysPerEL: settings.earnedLeave?.attendanceRules?.daysPerEL,
                maxELPerMonth: settings.earnedLeave?.attendanceRules?.maxELPerMonth
            }
        };

    } catch (error) {
        console.error('Error calculating earned leave:', error);
        throw error;
    }
}

/**
 * Get attendance data for EL calculation based on exact cycle bounds
 */
async function getAttendanceData(employeeId, month, year, settings, employee, cycleStart, cycleEnd) {
    // Get daily attendance records strictly within cycle
    const attendanceRecords = await AttendanceDaily.find({
        employeeNumber: employee.emp_no,
        date: { $gte: cycleStart, $lte: cycleEnd }
    }).select('date status workingHours overtimeHours extraHours permissionCount isHoliday isWeeklyOff').lean();

    let attendanceDays = 0;
    let presentDays = 0;
    let payableShifts = 0;
    let weeklyOffs = 0;
    let holidays = 0;
    let workedDays = 0;

    for (const record of attendanceRecords) {
        const status = (record.status || '').toLowerCase();

        if (record.payableShifts !== undefined && record.payableShifts !== null) {
            payableShifts += Number(record.payableShifts) || 0;
        }

        // Count as present based on settings
        if (status === 'present' || status === 'half_day') {
            presentDays++;
            attendanceDays++;
        } else if (status === 'weekly_off') {
            weeklyOffs++;
            if (settings.compliance.considerWeeklyOffs) {
                attendanceDays++;
            }
        } else if (status === 'holiday') {
            holidays++;
            if (settings.compliance.considerPaidHolidays) {
                attendanceDays++;
            }
        }

        if (status === 'present' || status === 'half_day') {
            workedDays++;
        }
    }

    const totalDays = Math.round((cycleEnd.getTime() - cycleStart.getTime()) / (1000 * 60 * 60 * 24)) + 1;
    const effectiveDays = Math.min(totalDays, Math.max(presentDays, payableShifts));

    return {
        month,
        year,
        totalDays,
        presentDays,
        payableShifts,
        effectiveDays,
        weeklyOffs,
        holidays,
        workedDays,
        attendanceDays,
        attendanceRecords
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
    // effectiveDays = min(monthDays, max(presentDays, payableShifts)) for range matching
    if (rules.attendanceRanges && rules.attendanceRanges.length > 0) {
        const effectiveDays = attendanceData.effectiveDays !== undefined
            ? attendanceData.effectiveDays
            : attendanceData.attendanceDays;
        const rangeBreakdown = [];

        // Sort a shallow copy to avoid mutating shared settings
        const sortedRanges = [...rules.attendanceRanges].sort((a, b) => a.minDays - b.minDays);

        for (const range of sortedRanges) {
            if (effectiveDays >= range.minDays && effectiveDays <= range.maxDays) {
                elEarned += range.elEarned;
                rangeBreakdown.push({
                    range: `${range.minDays}-${range.maxDays} days`,
                    elEarned: range.elEarned,
                    description: range.description,
                    cumulative: true
                });
            }
        }

        elEarned = Math.min(elEarned, rules.maxELPerMonth);

        breakdown.push({
            type: 'attendance_ranges_cumulative',
            effectiveDays,
            attendanceDays: attendanceData.attendanceDays,
            payableShifts: attendanceData.payableShifts,
            totalEL: elEarned,
            maxELForMonth: rules.maxELPerMonth,
            ranges: rangeBreakdown,
            calculation: 'effectiveDays = min(monthDays, max(presentDays, payableShifts)); range match on effectiveDays'
        });

    } else {
        // Standard attendance-based calculation (fallback)
        const attendanceDays = attendanceData.attendanceDays;

        if (attendanceDays >= rules.minDaysForFirstEL) {
            // Calculate EL based on days per EL ratio
            elEarned = Math.floor(attendanceDays / rules.daysPerEL);

            // Apply monthly maximum
            elEarned = Math.min(elEarned, rules.maxELPerMonth);

            breakdown.push({
                type: 'attendance_based',
                attendanceDays,
                minDaysRequired: rules.minDaysForFirstEL,
                daysPerEL: rules.daysPerEL,
                calculatedEL: Math.floor(attendanceDays / rules.daysPerEL),
                maxELForMonth: rules.maxELPerMonth,
                finalEL: elEarned
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
                    const existing = await LeaveRegister.findOne({
                        employeeId: employee._id,
                        leaveType: 'EL',
                        transactionType: 'CREDIT',
                        month: Number(month),
                        year: Number(year),
                        autoGeneratedType: 'EARNED_LEAVE'
                    });
                    if (existing) {
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
