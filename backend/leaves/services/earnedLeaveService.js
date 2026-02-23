/**
 * Earned Leave Service
 * Calculates earned leave based on configurable rules and Indian labor laws
 */

const Employee = require('../../employees/model/Employee');
const AttendanceDaily = require('../../attendance/model/AttendanceDaily');
const LeavePolicySettings = require('../../settings/model/LeavePolicySettings');
const DepartmentSettings = require('../../departments/model/DepartmentSettings');
const leaveRegisterService = require('./leaveRegisterService');
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

        // Check probation period
        if (settings.compliance.probationPeriod.elApplicableAfter) {
            const doj = new Date(employee.doj);
            const currentDate = cycleEnd;
            const monthsInService = (currentDate.getFullYear() - doj.getFullYear()) * 12 +
                (currentDate.getMonth() - doj.getMonth());

            if (monthsInService < settings.compliance.probationPeriod.months) {
                return {
                    eligible: false,
                    reason: 'Probation period not completed',
                    elEarned: 0,
                    attendanceDays: 0,
                    requiredDays: settings.earnedLeave.attendanceRules.minDaysForFirstEL
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
                minDaysForEL: settings.earnedLeave.attendanceRules.minDaysForFirstEL,
                daysPerEL: settings.earnedLeave.attendanceRules.daysPerEL,
                maxELPerMonth: settings.earnedLeave.attendanceRules.maxELPerMonth
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
    let weeklyOffs = 0;
    let holidays = 0;
    let workedDays = 0;

    for (const record of attendanceRecords) {
        const status = record.status?.toLowerCase();

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

        // Count worked days (present + half day)
        if (status === 'present' || status === 'half_day') {
            workedDays++;
        }
    }

    return {
        month,
        year,
        totalDays: Math.round((cycleEnd.getTime() - cycleStart.getTime()) / (1000 * 60 * 60 * 24)) + 1,
        presentDays,
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
    if (rules.attendanceRanges && rules.attendanceRanges.length > 0) {
        const attendanceDays = attendanceData.attendanceDays;
        const rangeBreakdown = [];

        // Sort ranges by minDays
        const sortedRanges = rules.attendanceRanges.sort((a, b) => a.minDays - b.minDays);

        // Cumulative calculation - each range adds EL if attendance meets that threshold
        for (const range of sortedRanges) {
            if (attendanceDays >= range.minDays && attendanceDays <= range.maxDays) {
                elEarned += range.elEarned;
                rangeBreakdown.push({
                    range: `${range.minDays}-${range.maxDays} days`,
                    elEarned: range.elEarned,
                    description: range.description,
                    cumulative: true
                });
            }
        }

        // Apply monthly maximum
        elEarned = Math.min(elEarned, rules.maxELPerMonth);

        breakdown.push({
            type: 'attendance_ranges_cumulative',
            attendanceDays,
            totalEL: elEarned,
            maxELForMonth: rules.maxELPerMonth,
            ranges: rangeBreakdown,
            calculation: 'Cumulative: Each range adds EL if attendance meets threshold'
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

        // Get all active employees
        const employees = await Employee.find({ is_active: true }).select('_id emp_no');

        const results = {
            processed: 0,
            success: 0,
            errors: [],
            details: []
        };

        for (const employee of employees) {
            try {
                const calculation = await calculateEarnedLeave(employee._id, month, year);

                if (calculation.eligible && calculation.elEarned > 0) {
                    // Add to leave register instead of updating employee model directly
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
