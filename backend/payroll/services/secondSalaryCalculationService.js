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
 * Simple merge with overrides (helper)
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
 * Compute absent days from attendance summary
 */
function computeAbsentDays(attendanceSummary) {
    const calculatedAbsentDays = attendanceSummary.totalDaysInMonth -
        (attendanceSummary.totalPresentDays + attendanceSummary.totalWeeklyOffs + attendanceSummary.totalHolidays +
            attendanceSummary.totalPaidLeaveDays + attendanceSummary.totalODDays);
    return Math.max(0, calculatedAbsentDays);
}

/**
 * Fetch and validate employee, department, paid leaves
 */
async function validateEmployee(employeeId, month) {
    const employee = await Employee.findById(employeeId).populate('department_id designation_id division_id');
    if (!employee) throw new Error('Employee not found');
    if (!employee.second_salary || employee.second_salary <= 0) {
        console.warn(`[SecondSalary] Warning: Employee ${employee.emp_no} has invalid second salary (${employee.second_salary}). Proceeding with 0.`);
    }
    const payRegisterSummary = await PayRegisterSummary.findOne({ employeeId, month });
    if (!payRegisterSummary) throw new Error('Pay Register data not found for this month. Please sync Pay Register first.');
    const departmentId = employee.department_id?._id || employee.department_id;
    const divisionId = employee.division_id?._id || employee.division_id;
    if (!departmentId) throw new Error(`Employee ${employee.emp_no} has no department assigned. Calculation aborted.`);
    const department = await Department.findById(departmentId);
    const paidLeaves = (employee.paidLeaves != null && employee.paidLeaves > 0) ? employee.paidLeaves : (department?.paidLeaves || 0);
    return { employee, payRegisterSummary, departmentId, divisionId, department, paidLeaves };
}

/**
 * Build attendance summary from pay register and adjust payable shifts with paid leaves
 */
function buildAttendanceSummary(payRegisterSummary, paidLeaves) {
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
    const totalLeaves = attendanceSummary.totalLeaveDays || 0;
    const remainingPaidLeaves = Math.max(0, paidLeaves - totalLeaves);
    console.log(`Remaining Paid Leaves: ${remainingPaidLeaves}`);
    attendanceSummary.totalPayableShifts = (attendanceSummary.totalPayableShifts || 0) + remainingPaidLeaves;
    return attendanceSummary;
}

/**
 * Calculate earnings: basic pay, OT, allowances, gross
 */
async function calculateEarnings(employee, attendanceSummary, departmentId, divisionId) {
    const basicPayResult = secondSalaryBasicPayService.calculateBasicPay(employee, attendanceSummary);
    const basicPay = basicPayResult.basicPay || 0;
    const extraDays = basicPayResult.extraDays || 0;
    const totalPaidDays = basicPayResult.totalPaidDays;
    const perDaySalary = basicPayResult.perDayBasicPay;
    const earnedSalary = basicPayResult.basePayForWork;
    const incentiveAmount = basicPayResult.incentive;

    const otPayResult = await secondSalaryOTPayService.calculateOTPay(
        attendanceSummary.totalOTHours || 0,
        departmentId.toString(),
        divisionId?.toString()
    );
    const otPay = otPayResult.otPay || 0;
    let grossAmountSalary = earnedSalary + otPay;

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
        false,
        attendanceData,
        divisionId?.toString()
    );
    const allowanceOverrides = normalizeOverrides(employee.employeeAllowances || [], 'allowance');
    const mergedAllowances = mergeWithOverrides(baseAllowances, allowanceOverrides, true);
    const totalAllowances = secondSalaryAllowanceService.calculateTotalAllowances(mergedAllowances);
    grossAmountSalary += totalAllowances;

    return {
        basicPay,
        extraDays,
        totalPaidDays,
        perDaySalary,
        earnedSalary,
        incentiveAmount,
        otPay,
        otPayResult,
        totalAllowances,
        mergedAllowances,
        grossAmountSalary,
        attendanceData,
    };
}

/**
 * Calculate deductions: attendance, other, loans/advances
 */
async function calculateDeductions(employeeId, month, perDaySalary, grossAmountSalary, departmentId, divisionId, attendanceData, employee, basicPay) {
    const attendanceDeductionResult = await secondSalaryDeductionService.calculateAttendanceDeduction(
        employeeId,
        month,
        departmentId.toString(),
        perDaySalary,
        divisionId?.toString()
    );
    let totalDeductions = attendanceDeductionResult.attendanceDeduction || 0;

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

    const loanAdvanceResult = await secondSalaryLoanAdvanceService.calculateLoanAdvance(
        employeeId,
        month,
        Math.max(0, grossAmountSalary - totalDeductions)
    );
    totalDeductions += (loanAdvanceResult.totalEMI || 0) + (loanAdvanceResult.advanceDeduction || 0);

    return {
        totalDeductions,
        attendanceDeductionResult,
        totalOtherDeductions,
        mergedDeductions,
        loanAdvanceResult,
    };
}

/**
 * Populate and persist SecondSalaryRecord
 */
async function buildAndSaveRecord(recordParams) {
    const {
        employeeId,
        emp_no,
        month,
        monthName,
        year,
        monthNum,
        totalDaysInMonth,
        attendanceSummary,
        extraDays,
        totalPaidDays,
        perDaySalary,
        earnedSalary,
        incentiveAmount,
        otPayResult,
        roundedNet,
        grossAmountSalary,
        roundOff,
        divisionId,
        attendanceDeductionResult,
        totalOtherDeductions,
        mergedDeductions,
        totalDeductions,
        loanAdvanceResult,
        basicPay,
        totalAllowances,
        mergedAllowances,
    } = recordParams;

    let record = await SecondSalaryRecord.findOne({ employeeId, month });
    if (!record) {
        record = new SecondSalaryRecord({
            employeeId,
            emp_no,
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

    record.set('totalPayableShifts', attendanceSummary.totalPayableShifts);
    record.set('netSalary', roundedNet);
    record.set('payableAmountBeforeAdvance', grossAmountSalary);
    record.set('roundOff', roundOff);
    record.set('status', 'calculated');
    record.set('division_id', divisionId);
    record.set('attendance', {
        totalDaysInMonth: attendanceSummary.totalDaysInMonth,
        presentDays: attendanceSummary.totalPresentDays,
        paidLeaveDays: attendanceSummary.totalPaidLeaveDays,
        odDays: attendanceSummary.totalODDays,
        weeklyOffs: attendanceSummary.totalWeeklyOffs,
        holidays: attendanceSummary.totalHolidays,
        absentDays: computeAbsentDays(attendanceSummary),
        payableShifts: attendanceSummary.totalPayableShifts,
        extraDays,
        totalPaidDays,
        paidDays: totalPaidDays - extraDays,
        otHours: attendanceSummary.totalOTHours,
        otDays: otPayResult.eligibleOTHours / 8,
        earnedSalary,
    });
    record.set('earnings.secondSalaryAmount', basicPay);
    record.set('earnings.basicPay', basicPay);
    record.set('earnings.perDayBasicPay', perDaySalary);
    record.set('earnings.payableAmount', earnedSalary);
    record.set('earnings.incentive', incentiveAmount);
    record.set('earnings.otPay', recordParams.otPay);
    record.set('earnings.otHours', otPayResult.otHours);
    record.set('earnings.otRatePerHour', otPayResult.otPayPerHour);
    record.set('earnings.totalAllowances', totalAllowances);
    record.set('earnings.allowances', mergedAllowances);
    record.set('earnings.grossSalary', grossAmountSalary + incentiveAmount);
    record.set('deductions.attendanceDeduction', attendanceDeductionResult.attendanceDeduction);
    record.set('deductions.attendanceDeductionBreakdown', attendanceDeductionResult.breakdown);
    record.set('deductions.totalOtherDeductions', totalOtherDeductions);
    record.set('deductions.otherDeductions', mergedDeductions);
    record.set('deductions.totalDeductions', totalDeductions);
    record.set('loanAdvance.totalEMI', loanAdvanceResult.totalEMI);
    record.set('loanAdvance.emiBreakdown', loanAdvanceResult.emiBreakdown);
    record.set('loanAdvance.advanceDeduction', loanAdvanceResult.advanceDeduction);
    record.set('loanAdvance.advanceBreakdown', loanAdvanceResult.advanceBreakdown);

    await record.save();
    return record;
}

/**
 * Create or get batch and add record to it
 */
async function manageBatch(departmentId, divisionId, month, userId, recordId) {
    let batch = await SecondSalaryBatch.findOne({ department: departmentId, division: divisionId, month });
    if (!batch) {
        batch = await SecondSalaryBatchService.createBatch(departmentId, divisionId, month, userId);
    }
    if (batch) {
        await SecondSalaryBatchService.addPayrollToBatch(batch._id, recordId);
    }
    return batch;
}

/**
 * Calculate second salary for an employee (orchestrates helpers)
 */
async function calculateSecondSalary(employeeId, month, userId) {
    try {
        const validated = await validateEmployee(employeeId, month);
        const { employee, departmentId, divisionId, paidLeaves } = validated;
        const attendanceSummary = buildAttendanceSummary(validated.payRegisterSummary, paidLeaves);

        const existingBatch = await SecondSalaryBatch.findOne({
            department: departmentId,
            division: divisionId,
            month
        });
        if (existingBatch && ['approved', 'freeze', 'complete'].includes(existingBatch.status)) {
            throw new Error(`Recalculation not allowed for batch with status: ${existingBatch.status}`);
        }

        console.log(`\n========== SECOND SALARY CALCULATION START (${employee.emp_no}) ==========`);

        const earnings = await calculateEarnings(employee, attendanceSummary, departmentId, divisionId);
        const deductions = await calculateDeductions(
            employeeId,
            month,
            earnings.perDaySalary,
            earnings.grossAmountSalary,
            departmentId,
            divisionId,
            earnings.attendanceData,
            employee,
            earnings.basicPay
        );

        const baseNet = Math.max(0, earnings.grossAmountSalary - deductions.totalDeductions);
        const netSalary = baseNet + earnings.incentiveAmount;
        const exactNet = netSalary;
        const roundedNet = Math.ceil(exactNet);
        const roundOff = Number((roundedNet - exactNet).toFixed(2));

        const [yearStr, monthStr] = month.split('-');
        const year = parseInt(yearStr);
        const monthNum = parseInt(monthStr);
        const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
        const monthName = `${monthNames[monthNum - 1]} ${year}`;

        const record = await buildAndSaveRecord({
            employeeId,
            emp_no: employee.emp_no,
            month,
            monthName,
            year,
            monthNum,
            totalDaysInMonth: attendanceSummary.totalDaysInMonth,
            attendanceSummary,
            extraDays: earnings.extraDays,
            totalPaidDays: earnings.totalPaidDays,
            perDaySalary: earnings.perDaySalary,
            earnedSalary: earnings.earnedSalary,
            incentiveAmount: earnings.incentiveAmount,
            otPayResult: earnings.otPayResult,
            otPay: earnings.otPay,
            roundedNet,
            grossAmountSalary: earnings.grossAmountSalary,
            roundOff,
            divisionId,
            attendanceDeductionResult: deductions.attendanceDeductionResult,
            totalOtherDeductions: deductions.totalOtherDeductions,
            mergedDeductions: deductions.mergedDeductions,
            totalDeductions: deductions.totalDeductions,
            loanAdvanceResult: deductions.loanAdvanceResult,
            basicPay: earnings.basicPay,
            totalAllowances: earnings.totalAllowances,
            mergedAllowances: earnings.mergedAllowances,
        });

        const batch = await manageBatch(departmentId, divisionId, month, userId, record._id);

        console.log(`[OK] Second salary calculated and saved for ${employee.emp_no}. Net: ${roundedNet}`);
        console.log(`========== SECOND SALARY CALCULATION END ========== \n`);

        return { success: true, record, batchId: batch?._id };
    } catch (error) {
        console.error('Error in calculateSecondSalary:', error);
        throw error;
    }
}

module.exports = {
    calculateSecondSalary,
};
