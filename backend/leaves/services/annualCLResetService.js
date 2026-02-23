/**
 * Annual CL Reset Service
 * Handles annual casual leave balance reset with carry forward addition
 */

const Employee = require('../../employees/model/Employee');
const LeavePolicySettings = require('../../settings/model/LeavePolicySettings');
const Leave = require('../model/Leave');
const { extractISTComponents, createISTDate } = require('../../shared/utils/dateUtils');

/**
 * Perform annual CL reset for all employees
 * @param {Number} targetYear - Target year for reset (optional, defaults to current financial year)
 * @returns {Object} Reset operation results
 */
async function performAnnualCLReset(targetYear = null) {
    try {
        console.log('[AnnualCLReset] Starting annual CL reset process...');
        
        // Get policy settings
        const settings = await LeavePolicySettings.getSettings();
        
        if (!settings.annualCLReset.enabled) {
            return {
                success: false,
                message: 'Annual CL reset is disabled in settings',
                processed: 0,
                errors: []
            };
        }

        // Determine reset date (financial year start)
        const resetDate = getResetDate(targetYear, settings);
        const resetYear = resetDate.getFullYear();
        const resetMonth = resetDate.getMonth() + 1;
        
        console.log(`[AnnualCLReset] Reset date: ${resetDate.toISOString()}`);
        console.log(`[AnnualCLReset] Reset balance to: ${settings.annualCLReset.resetToBalance}`);

        // Get all active employees
        const employees = await Employee.find({ is_active: true })
            .select('_id emp_no employee_name department_id division_id paidLeaves compensatoryOffs doj')
            .populate('department_id', 'name')
            .populate('division_id', 'name')
            .lean();

        const results = {
            success: true,
            resetYear,
            resetDate,
            resetToBalance: settings.annualCLReset.resetToBalance,
            addCarryForward: settings.annualCLReset.addCarryForward,
            processed: 0,
            success: 0,
            errors: [],
            details: []
        };

        // Process each employee
        for (const employee of employees) {
            try {
                const resetResult = await resetEmployeeCL(employee, settings, resetDate, resetYear);
                
                if (resetResult.success) {
                    results.success++;
                    results.details.push({
                        employeeId: employee._id,
                        empNo: employee.emp_no,
                        employeeName: employee.employee_name,
                        previousBalance: resetResult.previousBalance,
                        carryForwardAdded: resetResult.carryForwardAdded,
                        newBalance: resetResult.newBalance,
                        department: employee.department_id?.name,
                        division: employee.division_id?.name
                    });
                } else {
                    results.errors.push({
                        employeeId: employee._id,
                        empNo: employee.emp_no,
                        error: resetResult.error
                    });
                }
                
                results.processed++;
                
            } catch (error) {
                results.errors.push({
                    employeeId: employee._id,
                    empNo: employee.emp_no,
                    error: error.message
                });
            }
        }

        console.log(`[AnnualCLReset] Complete: ${results.success}/${results.processed} employees processed`);
        
        return {
            ...results,
            message: `Annual CL reset completed: ${results.success} successful, ${results.errors.length} errors`
        };

    } catch (error) {
        console.error('[AnnualCLReset] Critical error:', error);
        return {
            success: false,
            error: error.message,
            message: 'Annual CL reset failed'
        };
    }
}

/**
 * Reset CL balance for a single employee
 */
async function resetEmployeeCL(employee, settings, resetDate, resetYear) {
    try {
        const currentCL = employee.paidLeaves || 0;
        
        // Calculate carry forward amount (simplified - in production, track actual CF)
        let carryForwardAmount = 0;
        if (settings.annualCLReset.addCarryForward && settings.carryForward.casualLeave.enabled) {
            // For now, use a simple calculation - in production, implement proper CF tracking
            const unusedCL = Math.max(0, currentCL - getUsedCLInYear(employee._id, resetYear - 1));
            carryForwardAmount = Math.min(unusedCL, settings.carryForward.casualLeave.maxMonths || 12);
        }

        // Calculate new balance
        const newBalance = settings.annualCLReset.resetToBalance + carryForwardAmount;

        // Update employee record
        await Employee.findByIdAndUpdate(employee._id, {
            paidLeaves: newBalance
        });

        // Log the reset operation (you might create an AnnualCLResetLog model)
        await logCLResetOperation(employee._id, {
            resetDate,
            resetYear,
            previousBalance: currentCL,
            carryForwardAdded: carryForwardAmount,
            newBalance,
            resetToBalance: settings.annualCLReset.resetToBalance,
            settings: settings.annualCLReset
        });

        return {
            success: true,
            previousBalance: currentCL,
            carryForwardAdded: carryForwardAmount,
            newBalance
        };

    } catch (error) {
        console.error(`[AnnualCLReset] Error for employee ${employee._id}:`, error);
        return {
            success: false,
            error: error.message
        };
    }
}

/**
 * Get used CL in previous year (simplified version)
 */
async function getUsedCLInYear(employeeId, year) {
    try {
        const financialYear = getFinancialYear(createISTDate(`${year}-04-01`));
        const fyStart = createISTDate(`${financialYear.split('-')[0]}-04-01`);
        const fyEnd = createISTDate(`${financialYear.split('-')[1]}-03-31`);
        
        const usedLeaves = await Leave.find({
            employeeId,
            leaveType: 'CL',
            status: 'approved',
            isActive: true,
            fromDate: { $gte: fyStart },
            toDate: { $lte: fyEnd }
        }).select('numberOfDays').lean();

        return usedLeaves.reduce((total, leave) => total + (leave.numberOfDays || 0), 0);

    } catch (error) {
        console.error('Error calculating used CL:', error);
        return 0;
    }
}

/**
 * Get financial year string
 */
function getFinancialYear(date) {
    const year = date.getFullYear();
    const month = date.getMonth() + 1;
    
    // Default to April-March financial year
    const fyStart = month >= 4 ? year : year - 1;
    const fyEnd = month >= 4 ? year + 1 : year;
    
    return `${fyStart}-${fyEnd}`;
}

/**
 * Get reset date based on settings
 */
function getResetDate(targetYear, settings) {
    if (targetYear) {
        return createISTDate(`${targetYear}-${String(settings.annualCLReset.resetMonth).padStart(2, '0')}-${String(settings.annualCLReset.resetDay).padStart(2, '0')}`);
    }
    
    // Default to current financial year start
    const now = new Date();
    const currentYear = now.getMonth() + 1 >= settings.annualCLReset.resetMonth ? 
        now.getFullYear() : now.getFullYear() - 1;
    
    return createISTDate(`${currentYear}-${String(settings.annualCLReset.resetMonth).padStart(2, '0')}-${String(settings.annualCLReset.resetDay).padStart(2, '0')}`);
}

/**
 * Log CL reset operation (simplified - consider creating a separate model)
 */
async function logCLResetOperation(employeeId, resetData) {
    try {
        // In production, create an AnnualCLResetLog model to track all reset operations
        console.log(`[CLResetLog] Employee ${employeeId}:`, {
            previousBalance: resetData.previousBalance,
            carryForwardAdded: resetData.carryForwardAdded,
            newBalance: resetData.newBalance,
            resetDate: resetData.resetDate,
            resetYear: resetData.resetYear
        });
        
        // For now, just log to console - implement proper logging model
        return true;
        
    } catch (error) {
        console.error('Error logging CL reset:', error);
        return false;
    }
}

/**
 * Get CL reset status for employees
 */
async function getCLResetStatus(employeeIds = null) {
    try {
        const query = { is_active: true };
        if (employeeIds && employeeIds.length > 0) {
            query._id = { $in: employeeIds };
        }
        
        const employees = await Employee.find(query)
            .select('_id emp_no employee_name paidLeaves department_id division_id')
            .populate('department_id', 'name')
            .populate('division_id', 'name')
            .lean();

        const settings = await LeavePolicySettings.getSettings();
        
        const results = employees.map(emp => ({
            employeeId: emp._id,
            empNo: emp.emp_no,
            employeeName: emp.employee_name,
            department: emp.department_id?.name,
            division: emp.division_id?.name,
            currentCL: emp.paidLeaves || 0,
            nextResetDate: getNextResetDate(settings),
            resetEnabled: settings.annualCLReset.enabled,
            resetToBalance: settings.annualCLReset.resetToBalance,
            addCarryForward: settings.annualCLReset.addCarryForward
        }));

        return {
            success: true,
            data: results,
            settings: {
                enabled: settings.annualCLReset.enabled,
                resetMonth: settings.annualCLReset.resetMonth,
                resetDay: settings.annualCLReset.resetDay,
                resetToBalance: settings.annualCLReset.resetToBalance,
                addCarryForward: settings.annualCLReset.addCarryForward
            }
        };

    } catch (error) {
        console.error('Error getting CL reset status:', error);
        return {
            success: false,
            error: error.message
        };
    }
}

/**
 * Get next reset date
 */
function getNextResetDate(settings) {
    const now = new Date();
    const currentYear = now.getMonth() + 1 >= settings.annualCLReset.resetMonth ? 
        now.getFullYear() : now.getFullYear() - 1;
    
    return createISTDate(`${currentYear}-${String(settings.annualCLReset.resetMonth).padStart(2, '0')}-${String(settings.annualCLReset.resetDay).padStart(2, '0')}`);
}

module.exports = {
    performAnnualCLReset,
    getCLResetStatus,
    getNextResetDate
};
