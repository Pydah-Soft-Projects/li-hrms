/**
 * Earned Leave Service
 * Calculates earned leave based on configurable rules and Indian labor laws
 */

const Employee = require('../../employees/model/Employee');
const AttendanceDaily = require('../../attendance/model/AttendanceDaily');
const LeavePolicySettings = require('../../settings/model/LeavePolicySettings');
const leaveRegisterService = require('./leaveRegisterService');
const { extractISTComponents, createISTDate } = require('../../shared/utils/dateUtils');

/**
 * Calculate earned leave for an employee for a specific month
 * @param {String} employeeId - Employee ID
 * @param {Number} month - Month (1-12)
 * @param {Number} year - Year
 * @returns {Object} EL calculation details
 */
async function calculateEarnedLeave(employeeId, month, year) {
    try {
        // Get employee and settings
        const employee = await Employee.findById(employeeId);
        const settings = await LeavePolicySettings.getSettings();
        
        if (!employee) {
            throw new Error('Employee not found');
        }

        // Check probation period
        if (settings.compliance.probationPeriod.elApplicableAfter) {
            const doj = new Date(employee.doj);
            const currentDate = createISTDate(`${year}-${String(month).padStart(2, '0')}-01`);
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

        // Get attendance data for the month
        const attendanceData = await getAttendanceData(employeeId, month, year, settings);
        
        // Calculate EL based on earning type
        let elCalculation;
        switch (settings.earnedLeave.earningType) {
            case 'attendance_based':
                elCalculation = calculateAttendanceBasedEL(attendanceData, settings);
                break;
            case 'fixed':
                elCalculation = calculateFixedEL(settings);
                break;
            default:
                elCalculation = calculateAttendanceBasedEL(attendanceData, settings);
        }

        return {
            eligible: true,
            employeeId,
            month,
            year,
            earningType: settings.earnedLeave.earningType,
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
 * Get attendance data for EL calculation
 */
async function getAttendanceData(employeeId, month, year, settings) {
    const monthStr = `${year}-${String(month).padStart(2, '0')}`;
    const firstDay = createISTDate(`${monthStr}-01`);
    const lastDay = new Date(year, month, 0); // Last day of month

    // Get daily attendance records
    const attendanceRecords = await AttendanceDaily.find({
        employeeNumber: employee.emp_no,
        date: { $gte: firstDay, $lte: lastDay }
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
        totalDays: lastDay.getDate(),
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
function calculateFixedEL(settings) {
    const rules = settings.earnedLeave.fixedRules;
    
    return {
        attendanceDays: 0,
        elEarned: rules.elPerMonth,
        maxELForMonth: rules.elPerMonth,
        breakdown: [{
            type: 'fixed',
            elPerMonth: rules.elPerMonth,
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
