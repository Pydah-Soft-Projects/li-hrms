const PayRegisterSummary = require('../../pay-register/model/PayRegisterSummary');
const Employee = require('../../employees/model/Employee');
const Department = require('../../departments/model/Department');
const SecondSalaryRecord = require('../model/SecondSalaryRecord');
const SecondSalaryBatch = require('../model/SecondSalaryBatch');

const secondSalaryBasicPayService = require('./secondSalaryBasicPayService');
const secondSalaryOTPayService = require('./secondSalaryOTPayService');
const secondSalaryAllowanceService = require('./secondSalaryAllowanceService');
const secondSalaryDeductionService = require('./secondSalaryDeductionService');
const secondSalaryLoanAdvanceService = require('./secondSalaryLoanAdvanceService');
const SecondSalaryBatchService = require('./secondSalaryBatchService');

/**
 * Normalize overrides (same logic as regular payroll)
 */
const normalizeOverrides = (list, fallbackCategory) => {
    if (!Array.isArray(list)) return [];
    return list
        .filter(ov => ov && (ov.masterId || ov.name))
        .map((ov) => {
            const override = { ...ov };
            override.category = override.category || fallbackCategory;
            if (override.amount === undefined || override.amount === null) {
                override.amount = (override.overrideAmount !== undefined && override.overrideAmount !== null)
                    ? override.overrideAmount
                    : 0;
            }
            override.amount = parseFloat(override.amount) || 0;
            return override;
        });
};

/**
 * Merge a base list of items with override entries, marking items that were overridden.
 *
 * @param {Array<Object>} baseList - Original list of items (each may contain `masterId`, `name`, `amount`).
 * @param {Array<Object>} overrides - Override entries (each should contain `masterId` or `name`, and `amount`).
 * @param {boolean} [includeMissing=true] - If true, append overrides that don't match any base item.
 * @returns {Array<Object>} A new array where matching base items have their `amount` replaced and `isEmployeeOverride` set to `true`. If `includeMissing` is true, unmatched overrides are appended with `isEmployeeOverride: true` and `source: 'employee_override'`.
 */
function mergeWithOverrides(baseList, overrides, includeMissing = true) {
    const result = [...baseList];

    overrides.forEach(ov => {
        const index = result.findIndex(b =>
            (ov.masterId && b.masterId && b.masterId.toString() === ov.masterId.toString()) ||
            (ov.name && b.name === ov.name)
        );

        if (index !== -1) {
            result[index].amount = ov.amount;
            result[index].isEmployeeOverride = true;
        } else if (includeMissing) {
            result.push({
                ...ov,
                isEmployeeOverride: true,
                source: 'employee_override'
            });
        }
    });

    return result;
}

/**
 * Main Second Salary Calculation Service
 * Replicates the robust Pay Register calculation logic for 2nd Salary
 */

/**
 * Calculate and persist an employee's second salary for a given month and associate the result with a department/division batch.
 *
 * This performs attendance validation, computes basic pay, OT, allowances, deductions, loans/advances, final net (with rounding),
 * saves or updates a SecondSalaryRecord, and ensures the record is added to a SecondSalaryBatch.
 *
 * @param {string|Object} employeeId - ID of the employee to calculate salary for.
 * @param {string} month - Month in `YYYY-MM` format for which the salary is calculated.
 * @param {string|Object} userId - ID of the user initiating the calculation (used when creating a batch).
 * @returns {{ success: true, record: Object, batchId?: Object }} An object containing success status, the saved SecondSalaryRecord document, and the batch ID if a batch exists or was created.
 * @throws {Error} If the employee is not found.
 * @throws {Error} If Pay Register data for the given month is not found.
 * @throws {Error} If the employee has no department assigned.
 * @throws {Error} Rethrows any other errors encountered during calculation or persistence.
 */
async function calculateSecondSalary(employeeId, month, userId) {
    try {
        const employee = await Employee.findById(employeeId).populate('department_id designation_id division_id');
        if (!employee) throw new Error('Employee not found');

        // User requirement: use second_salary as base
        if (!employee.second_salary || employee.second_salary <= 0) {
            console.warn(`[SecondSalary] Warning: Employee ${employee.emp_no} has invalid second salary (${employee.second_salary}). Proceeding with 0.`);
        }

        // Attendance Source: PayRegisterSummary (as requested for parity)
        const payRegisterSummary = await PayRegisterSummary.findOne({ employeeId, month });
        if (!payRegisterSummary) {
            throw new Error('Pay Register data not found for this month. Please sync Pay Register first.');
        }

        const attendanceSummary = {
            totalPayableShifts: payRegisterSummary.totals.totalPayableShifts || 0,
            totalOTHours: payRegisterSummary.totals.totalOTHours || 0,
            totalLeaveDays: payRegisterSummary.totals.totalLeaveDays || 0,
            totalODDays: payRegisterSummary.totals.totalODDays || 0,
            totalPresentDays: payRegisterSummary.totals.totalPresentDays || 0,
            totalDaysInMonth: payRegisterSummary.totalDaysInMonth,
            totalPaidLeaveDays: payRegisterSummary.totals.totalPaidLeaveDays || 0,
            totalWeeklyOffs: payRegisterSummary.totals.totalWeeklyOffs || 0,
            totalHolidays: payRegisterSummary.totals.totalHolidays || 0,
            extraDays: payRegisterSummary.totals.extraDays || 0,
            lateCount: (payRegisterSummary.totals.lateCount || 0) + (payRegisterSummary.totals.earlyOutCount || 0) || 0,
        };

        const departmentId = employee.department_id?._id || employee.department_id;
        const divisionId = employee.division_id?._id || employee.division_id;

        if (!departmentId) {
            throw new Error(`Employee ${employee.emp_no} has no department assigned. Calculation aborted.`);
        }

        const department = await Department.findById(departmentId);

        // Get paid leaves: Check employee first, then department
        let paidLeaves = 0;
        if (employee.paidLeaves !== null && employee.paidLeaves !== undefined && employee.paidLeaves > 0) {
            paidLeaves = employee.paidLeaves;
        } else {
            paidLeaves = department?.paidLeaves || 0;
        }

        // Calculate remaining paid leaves and adjust payable shifts
        const totalLeaves = attendanceSummary.totalLeaveDays || 0;
        const remainingPaidLeaves = Math.max(0, paidLeaves - totalLeaves);
        console.log(`Remaining Paid Leaves: ${remainingPaidLeaves}`);

        // Update attendanceSummary payable shifts with remaining paid leaves
        attendanceSummary.totalPayableShifts = (attendanceSummary.totalPayableShifts || 0) + remainingPaidLeaves;

        // Batch Validation
        const existingBatch = await SecondSalaryBatch.findOne({
            department: departmentId,
            division: divisionId,
            month
        });

        if (existingBatch && ['approved', 'freeze', 'complete'].includes(existingBatch.status)) {
            // Recalculation permission logic could be added here if needed
            // For now, we follow the same pattern
        }

        console.log(`\n========== SECOND SALARY CALCULATION START (${employee.emp_no}) ==========`);

        // 1. Basic Pay Calculation (using second_salary)
        const basicPayResult = secondSalaryBasicPayService.calculateBasicPay(employee, attendanceSummary);

        const basicPay = basicPayResult.basicPay || 0;
        const extraDays = basicPayResult.extraDays || 0;
        const totalPaidDays = basicPayResult.totalPaidDays;
        const perDaySalary = basicPayResult.perDayBasicPay;
        const earnedSalary = basicPayResult.basePayForWork;
        const incentiveAmount = basicPayResult.incentive;

        // 2. OT Pay Calculation
        const otPayResult = await secondSalaryOTPayService.calculateOTPay(
            attendanceSummary.totalOTHours || 0,
            departmentId.toString(),
            divisionId?.toString()
        );
        const otPay = otPayResult.otPay || 0;

        // 3. Base Gross for deductions
        let grossAmountSalary = earnedSalary + otPay;

        // 4. Allowances
        // For 2nd salary, we use the same allowance masters but potentially different bases
        const attendanceData = {
            presentDays: attendanceSummary.totalPresentDays || 0,
            paidLeaveDays: attendanceSummary.totalPaidLeaveDays || 0,
            odDays: attendanceSummary.totalODDays || 0,
            monthDays: attendanceSummary.totalDaysInMonth,
        };

        const baseAllowances = await secondSalaryAllowanceService.calculateAllowances(
            departmentId.toString(),
            basicPay,
            grossAmountSalary,
            false, // First pass
            attendanceData,
            divisionId?.toString()
        );

        // Merge with employee overrides (normalized to 2nd salary context if needed, but usually same)
        const allowanceOverrides = normalizeOverrides(employee.employeeAllowances || [], 'allowance');
        const mergedAllowances = mergeWithOverrides(baseAllowances, allowanceOverrides, true);

        const totalAllowances = secondSalaryAllowanceService.calculateTotalAllowances(mergedAllowances);
        grossAmountSalary += totalAllowances;

        // 5. Deductions
        // Attendance Deductions (Lates/Early Outs)
        const attendanceDeductionResult = await secondSalaryDeductionService.calculateAttendanceDeduction(
            employeeId,
            month,
            departmentId.toString(),
            perDaySalary,
            divisionId?.toString()
        );

        let totalDeductions = attendanceDeductionResult.attendanceDeduction || 0;

        // Other Deductions from Master
        const baseDeductions = await secondSalaryDeductionService.calculateOtherDeductions(
            departmentId.toString(),
            basicPay,
            grossAmountSalary,
            attendanceData,
            divisionId?.toString()
        );

        const deductionOverrides = normalizeOverrides(employee.employeeDeductions || [], 'deduction');
        const mergedDeductions = mergeWithOverrides(baseDeductions, deductionOverrides, true);

        const totalOtherDeductions = secondSalaryDeductionService.calculateTotalOtherDeductions(mergedDeductions);
        totalDeductions += totalOtherDeductions;

        // 6. Loans & Advances
        // We deduct them here to match "full calculation", though user might want them split.
        const loanAdvanceResult = await secondSalaryLoanAdvanceService.calculateLoanAdvance(
            employeeId,
            month,
            Math.max(0, grossAmountSalary - totalDeductions)
        );

        totalDeductions += (loanAdvanceResult.totalEMI || 0) + (loanAdvanceResult.advanceDeduction || 0);

        // 7. Final Net Salary
        const baseNet = Math.max(0, grossAmountSalary - totalDeductions);
        let netSalary = baseNet + incentiveAmount; // Add incentive (extra days pay)

        // Round off
        const exactNet = netSalary;
        const roundedNet = Math.ceil(exactNet);
        const roundOff = Number((roundedNet - exactNet).toFixed(2));

        // 8. Create/Update Record
        const [yearStr, monthStr] = month.split('-');
        const year = parseInt(yearStr);
        const monthNum = parseInt(monthStr);
        const monthNames = [
            'January', 'February', 'March', 'April', 'May', 'June',
            'July', 'August', 'September', 'October', 'November', 'December'
        ];
        const monthName = `${monthNames[monthNum - 1]} ${year}`;
        const totalDaysInMonth = attendanceSummary.totalDaysInMonth;

        let record = await SecondSalaryRecord.findOne({ employeeId, month });
        if (!record) {
            record = new SecondSalaryRecord({
                employeeId,
                emp_no: employee.emp_no,
                month,
                monthName,
                year,
                monthNumber: monthNum,
                totalDaysInMonth,
            });
        } else {
            record.monthName = monthName;
            record.totalDaysInMonth = totalDaysInMonth;
        }

        // Set fields
        record.set('totalPayableShifts', attendanceSummary.totalPayableShifts);
        record.set('netSalary', roundedNet);
        record.set('payableAmountBeforeAdvance', grossAmountSalary);
        record.set('roundOff', roundOff);
        record.set('status', 'calculated');
        record.set('division_id', divisionId);

        // Attendance Breakdown
        record.set('attendance', {
            totalDaysInMonth: attendanceSummary.totalDaysInMonth,
            presentDays: attendanceSummary.totalPresentDays,
            paidLeaveDays: attendanceSummary.totalPaidLeaveDays,
            odDays: attendanceSummary.totalODDays,
            weeklyOffs: attendanceSummary.totalWeeklyOffs,
            holidays: attendanceSummary.totalHolidays,
            absentDays: Math.max(0, attendanceSummary.totalDaysInMonth - (attendanceSummary.totalPresentDays + attendanceSummary.totalWeeklyOffs + attendanceSummary.totalHolidays + attendanceSummary.totalPaidLeaveDays + attendanceSummary.totalODDays)),
            payableShifts: attendanceSummary.totalPayableShifts,
            extraDays: extraDays,
            totalPaidDays: totalPaidDays,
            paidDays: totalPaidDays - extraDays, // Base paid days
            otHours: attendanceSummary.totalOTHours,
            otDays: otPayResult.eligibleOTHours / 8, // Roughly
            earnedSalary: earnedSalary,
        });

        // Earnings
        record.set('earnings.secondSalaryAmount', basicPay);
        record.set('earnings.basicPay', basicPay);
        record.set('earnings.perDayBasicPay', perDaySalary);
        record.set('earnings.payableAmount', earnedSalary);
        record.set('earnings.incentive', incentiveAmount);
        record.set('earnings.otPay', otPay);
        record.set('earnings.otHours', otPayResult.otHours);
        record.set('earnings.otRatePerHour', otPayResult.otPayPerHour);
        record.set('earnings.totalAllowances', totalAllowances);
        record.set('earnings.allowances', mergedAllowances);
        record.set('earnings.grossSalary', grossAmountSalary + incentiveAmount);

        // Deductions
        record.set('deductions.attendanceDeduction', attendanceDeductionResult.attendanceDeduction);
        record.set('deductions.attendanceDeductionBreakdown', attendanceDeductionResult.breakdown);
        record.set('deductions.totalOtherDeductions', totalOtherDeductions);
        record.set('deductions.otherDeductions', mergedDeductions);
        record.set('deductions.totalDeductions', totalDeductions);

        // Loans
        record.set('loanAdvance.totalEMI', loanAdvanceResult.totalEMI);
        record.set('loanAdvance.emiBreakdown', loanAdvanceResult.emiBreakdown);
        record.set('loanAdvance.advanceDeduction', loanAdvanceResult.advanceDeduction);
        record.set('loanAdvance.advanceBreakdown', loanAdvanceResult.advanceBreakdown);

        await record.save();

        // 9. Batch Management
        let batch = await SecondSalaryBatch.findOne({ department: departmentId, division: divisionId, month });
        if (!batch) {
            batch = await SecondSalaryBatchService.createBatch(departmentId, divisionId, month, userId);
        }
        if (batch) {
            await SecondSalaryBatchService.addPayrollToBatch(batch._id, record._id);
        }

        console.log(`✓ Second salary calculated and saved for ${employee.emp_no}. Net: ${roundedNet}`);
        console.log(`========== SECOND SALARY CALCULATION END ========== \n`);

        return {
            success: true,
            record,
            batchId: batch?._id
        };

    } catch (error) {
        console.error('Error in calculateSecondSalary:', error);
        throw error;
    }
}

module.exports = {
    calculateSecondSalary,
};