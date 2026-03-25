/**
 * Employee Leave Initialization Service
 * Handles prorated leave allocation for new employees based on their date of joining
 */

const Employee = require('../../employees/model/Employee');
const LeavePolicySettings = require('../../settings/model/LeavePolicySettings');
const dateCycleService = require('./dateCycleService');
const leaveRegisterYearService = require('./leaveRegisterYearService');
const leaveRegisterYearLedgerService = require('./leaveRegisterYearLedgerService');
const { getInitialSyncEntitlement, getCasualLeaveEntitlement } = require('./annualCLResetService');

/**
 * Calculate remaining months in financial year from a given date
 * Now respects payroll cycle start/end dates
 */
async function calculateRemainingMonthsInFY(dateOfJoining) {
    try {
        const financialYear = await dateCycleService.getFinancialYearForDate(dateOfJoining);

        // Get payroll cycle settings to respect monthly boundaries
        const payrollCycle = await dateCycleService.getPayrollCycleSettings();

        // Calculate months from DOJ to end of financial year
        const fyEnd = new Date(financialYear.endDate);
        const doj = new Date(dateOfJoining);

        // If using payroll cycles, calculate based on payroll periods
        if (payrollCycle && payrollCycle.enabled) {
            // Calculate remaining payroll periods in the financial year
            const remainingPeriods = dateCycleService.calculateRemainingPayrollPeriodsInFY(doj, fyEnd, payrollCycle);
            return {
                remainingMonths: remainingPeriods,
                totalMonthsInFY: 12, // Still 12 periods even with custom cycles
                financialYear,
                usedPayrollCycle: true
            };
        }

        // Fallback to calendar months
        const monthsRemaining = (fyEnd.getFullYear() - doj.getFullYear()) * 12 +
                               (fyEnd.getMonth() - doj.getMonth());

        const remainingMonths = Math.max(0, monthsRemaining);

        return {
            remainingMonths,
            totalMonthsInFY: 12,
            financialYear,
            usedPayrollCycle: false
        };
    } catch (error) {
        console.error('[EmployeeLeaveInit] Error calculating remaining months:', error);
        // Fallback to 12 months if calculation fails
        return {
            remainingMonths: 12,
            totalMonthsInFY: 12,
            financialYear: null,
            usedPayrollCycle: false
        };
    }
}

/**
 * Initialize prorated CL for a new employee
 */
async function initializeEmployeeCL(employeeId) {
    try {
        console.log(`[EmployeeLeaveInit] Initializing prorated CL for employee ${employeeId}`);

        // Get employee details
        const employee = await Employee.findById(employeeId)
            .select('_id emp_no employee_name department_id division_id doj designation department compensatoryOffs is_active')
            .populate('department_id', 'name')
            .populate('division_id', 'name');

        if (!employee) {
            throw new Error('Employee not found');
        }

        if (!employee.doj) {
            console.log(`[EmployeeLeaveInit] No DOJ found for employee ${employee.emp_no}, skipping CL initialization`);
            return { success: false, message: 'No date of joining found' };
        }

        // Get leave policy settings
        const settings = await LeavePolicySettings.getSettings();

        if (!settings.annualCLReset.enabled) {
            console.log(`[EmployeeLeaveInit] Annual CL reset disabled, skipping prorated CL initialization`);
            return { success: false, message: 'Annual CL reset is disabled' };
        }

        // Same FY grid + payroll-cycle rules as initial CL sync / LeaveRegisterYear (default: full cell if > half pay period remains after join)
        const { entitlement, proration, months, financialYear } = await getInitialSyncEntitlement(
            settings,
            employee.doj,
            employee.doj
        );

        if (financialYear && (await leaveRegisterYearService.hasEmployeeOnboardingYear(employee._id, financialYear))) {
            console.log(`[EmployeeLeaveInit] Employee ${employee.emp_no} already has onboarding FY row (${financialYear}), skipping`);
            return { success: true, message: 'CL already initialized', proratedCL: 0 };
        }

        if (!entitlement || entitlement <= 0) {
            console.log(`[EmployeeLeaveInit] Zero CL entitlement for ${employee.emp_no} (${proration?.reason || 'policy'})`);
            return {
                success: true,
                message: 'No CL entitlement for this join date in FY',
                proratedCL: 0,
                proration,
                financialYear,
            };
        }

        const fullAnnualEntitlement = getCasualLeaveEntitlement(settings, employee.doj, employee.doj);

        console.log(
            `[EmployeeLeaveInit] Employee ${employee.emp_no}: Grid annual=${fullAnnualEntitlement}, opening CL=${entitlement}, FY=${financialYear || '—'}, proration=${proration?.reason}`
        );

        const yearlyGridSum = Array.isArray(months) ? leaveRegisterYearService.sumScheduledCl(months) : 0;
        const monthsPayload = Array.isArray(months) ? months.map((m) => ({ ...m, transactions: [...(m.transactions || [])] })) : [];
        const doj = new Date(employee.doj);
        const joinSlot =
            monthsPayload.find(
                (m) => doj >= new Date(m.payPeriodStart) && doj <= new Date(m.payPeriodEnd)
            ) || monthsPayload[0];
        if (joinSlot) {
            joinSlot.transactions.push({
                at: doj,
                leaveType: 'CL',
                transactionType: 'ADJUSTMENT',
                days: entitlement,
                openingBalance: 0,
                closingBalance: entitlement,
                startDate: doj,
                endDate: doj,
                reason: `New employee CL: ${entitlement} day(s) from policy payroll-month grid (joining payroll cycle has no credit; ${proration?.reason || 'policy'})`,
                status: 'APPROVED',
                autoGenerated: true,
                autoGeneratedType: 'NEW_EMPLOYEE_PRORATED_CL',
            });
        }

        const cco = Number(employee.compensatoryOffs);
        await leaveRegisterYearService.upsertLeaveRegisterYear({
            employeeId: employee._id,
            empNo: employee.emp_no,
            employeeName: employee.employee_name || '',
            resetDate: employee.doj,
            casualBalance: entitlement,
            compensatoryOffBalance: Number.isFinite(cco) ? cco : 0,
            months: monthsPayload,
            yearlyPolicyClScheduledTotal: yearlyGridSum,
            yearlyTransactions: [
                {
                    transactionKind: 'ADJUSTMENT',
                    leaveType: 'CL',
                    days: entitlement,
                    reason: `New employee CL pool (${financialYear || '—'}): sum of scheduled payroll credits (${proration?.reason || 'policy'})`,
                    meta: { autoGeneratedType: 'NEW_EMPLOYEE_PRORATED_CL' },
                },
            ],
            source: 'EMPLOYEE_ONBOARDING',
        });

        await leaveRegisterYearLedgerService.recalculateRegisterBalances(employee._id, 'CL', null);

        console.log(`[EmployeeLeaveInit] Successfully initialized ${entitlement} CL for employee ${employee.emp_no}`);

        return {
            success: true,
            message: `CL initialized: ${entitlement} day(s) from monthly policy grid`,
            proratedCL: entitlement,
            fullAnnualEntitlement,
            proration,
            financialYear,
            payrollMonthSlots: months,
        };

    } catch (error) {
        console.error(`[EmployeeLeaveInit] Error initializing CL for employee ${employeeId}:`, error);
        return {
            success: false,
            message: error.message,
            error: error.message
        };
    }
}

/**
 * Initialize leave balances for a new employee (called after employee creation)
 */
async function initializeEmployeeLeaves(employeeId) {
    try {
        console.log(`[EmployeeLeaveInit] Starting leave initialization for new employee ${employeeId}`);

        const results = {
            success: true,
            clInitialization: null,
            message: ''
        };

        // Initialize prorated CL
        const clResult = await initializeEmployeeCL(employeeId);
        results.clInitialization = clResult;

        if (!clResult.success) {
            results.success = false;
            results.message = `CL initialization failed: ${clResult.message}`;
        } else {
            results.message = clResult.message;
        }

        console.log(`[EmployeeLeaveInit] Completed leave initialization for employee ${employeeId}:`, results);

        return results;

    } catch (error) {
        console.error(`[EmployeeLeaveInit] Error in initializeEmployeeLeaves for ${employeeId}:`, error);
        return {
            success: false,
            message: error.message,
            error: error.message
        };
    }
}

module.exports = {
    initializeEmployeeLeaves,
    initializeEmployeeCL,
    calculateRemainingMonthsInFY,
    getCasualLeaveEntitlement
};