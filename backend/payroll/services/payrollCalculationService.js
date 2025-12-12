const MonthlyAttendanceSummary = require('../../attendance/model/MonthlyAttendanceSummary');
const Employee = require('../../employees/model/Employee');
const Department = require('../../departments/model/Department');
const PayrollRecord = require('../model/PayrollRecord');
const PayrollTransaction = require('../model/PayrollTransaction');

const basicPayService = require('./basicPayService');
const otPayService = require('./otPayService');
const allowanceService = require('./allowanceService');
const deductionService = require('./deductionService');
const loanAdvanceService = require('./loanAdvanceService');
const {
  getIncludeMissingFlag,
  mergeWithOverrides,
} = require('./allowanceDeductionResolverService');

// Normalize employee override payloads so missing category/amount fields don't block usage
const normalizeOverrides = (list, fallbackCategory) =>
  (list || []).map((ov) => ({
    ...ov,
    category: ov.category || fallbackCategory,
    amount: ov.amount ?? ov.overrideAmount ?? 0,
  }));

/**
 * Main Payroll Calculation Service
 * Orchestrates the complete payroll calculation process
 */

/**
 * Calculate payroll for an employee for a specific month
 * @param {String} employeeId - Employee ID
 * @param {String} month - Month in YYYY-MM format
 * @param {String} userId - User ID who triggered the calculation
 * @returns {Object} Payroll calculation result
 */
async function calculatePayroll(employeeId, month, userId) {
  try {
    // Step 1: Fetch required data
    const employee = await Employee.findById(employeeId).populate('department_id designation_id');
    if (!employee) {
      throw new Error('Employee not found');
    }

    // Debug: Log employee allowance/deduction data
    console.log(`\n--- Employee Data Check (${employee.emp_no}) ---`);
    console.log(`Employee gross_salary: ${employee.gross_salary}`);
    console.log(`Employee ctcSalary: ${employee.ctcSalary}`);
    console.log(`Employee calculatedSalary: ${employee.calculatedSalary}`);
    console.log(`employeeAllowances exists: ${!!employee.employeeAllowances}`);
    console.log(`employeeAllowances type: ${Array.isArray(employee.employeeAllowances) ? 'array' : typeof employee.employeeAllowances}`);
    console.log(`employeeAllowances length: ${Array.isArray(employee.employeeAllowances) ? employee.employeeAllowances.length : 'N/A'}`);
    if (Array.isArray(employee.employeeAllowances) && employee.employeeAllowances.length > 0) {
      console.log('employeeAllowances content:');
      employee.employeeAllowances.forEach((ov, idx) => {
        console.log(`  [${idx + 1}] name: ${ov.name}, masterId: ${ov.masterId ? ov.masterId.toString() : 'null'}, amount: ${ov.amount}, category: ${ov.category}`);
      });
    } else {
      console.log('  ⚠️ No employee allowances found in employee record');
    }
    console.log(`employeeDeductions exists: ${!!employee.employeeDeductions}`);
    console.log(`employeeDeductions type: ${Array.isArray(employee.employeeDeductions) ? 'array' : typeof employee.employeeDeductions}`);
    console.log(`employeeDeductions length: ${Array.isArray(employee.employeeDeductions) ? employee.employeeDeductions.length : 'N/A'}`);
    if (Array.isArray(employee.employeeDeductions) && employee.employeeDeductions.length > 0) {
      console.log('employeeDeductions content:');
      employee.employeeDeductions.forEach((ov, idx) => {
        console.log(`  [${idx + 1}] name: ${ov.name}, masterId: ${ov.masterId ? ov.masterId.toString() : 'null'}, amount: ${ov.amount}, category: ${ov.category}`);
      });
    } else {
      console.log('  ⚠️ No employee deductions found in employee record');
    }

    if (!employee.gross_salary || employee.gross_salary <= 0) {
      throw new Error('Employee gross salary is missing or invalid');
    }

    const attendanceSummary = await MonthlyAttendanceSummary.findOne({
      employeeId,
      month,
    });

    if (!attendanceSummary) {
      throw new Error(`Attendance summary not found for month ${month}`);
    }

    const departmentId = employee.department_id?._id || employee.department_id;
    if (!departmentId) {
      throw new Error('Employee department not found');
    }

    const department = await Department.findById(departmentId);
    
    // Get paid leaves: Check employee first, then department
    // If employee has paidLeaves set (not null/undefined and > 0), use it
    // Otherwise, use department paidLeaves
    let paidLeaves = 0;
    if (employee.paidLeaves !== null && employee.paidLeaves !== undefined && employee.paidLeaves > 0) {
      paidLeaves = employee.paidLeaves;
      console.log(`Using employee paid leaves: ${paidLeaves}`);
    } else {
      paidLeaves = department?.paidLeaves || 0;
      console.log(`Using department paid leaves: ${paidLeaves}`);
    }

    // Calculate remaining paid leaves and adjust payable shifts
    // Remaining paid leaves = paid leaves - leaves taken
    // If employee has remaining paid leaves, add them to payable shifts
    const totalLeaves = attendanceSummary.totalLeaves || 0;
    const remainingPaidLeaves = Math.max(0, paidLeaves - totalLeaves);
    const adjustedPayableShifts = (attendanceSummary.totalPayableShifts || 0) + remainingPaidLeaves;
    
    console.log('\n--- Paid Leaves Calculation ---');
    console.log(`Total Paid Leaves Available: ${paidLeaves}`);
    console.log(`Total Leaves Taken: ${totalLeaves}`);
    console.log(`Remaining Paid Leaves: ${remainingPaidLeaves}`);
    console.log(`Original Payable Shifts: ${attendanceSummary.totalPayableShifts}`);
    console.log(`Adjusted Payable Shifts: ${adjustedPayableShifts}`);

    // Create a modified attendance summary with adjusted payable shifts
    const modifiedAttendanceSummary = {
      ...attendanceSummary.toObject(),
      totalPayableShifts: adjustedPayableShifts,
    };

    // Step 2: Calculate Basic Pay & Incentive
    console.log('\n========== PAYROLL CALCULATION START ==========');
    console.log(`Employee: ${employee.emp_no} (${employee.employee_name})`);
    console.log(`Month: ${month}`);
    console.log(`Department: ${departmentId}`);
    console.log(`Total Payable Shifts: ${modifiedAttendanceSummary.totalPayableShifts}`);
    console.log(`Total Days in Month: ${modifiedAttendanceSummary.totalDaysInMonth}`);
    
    console.log('\n--- Step 2: Basic Pay Calculation ---');
    const basicPayResult = basicPayService.calculateBasicPay(employee, modifiedAttendanceSummary);
    console.log('Basic Pay Result:', JSON.stringify(basicPayResult, null, 2));
    
    // Ensure all basicPayResult values are numbers
    if (!basicPayResult || typeof basicPayResult.basicPay !== 'number') {
      throw new Error('Invalid basic pay calculation result');
    }

    // Step 3: Calculate OT Pay
    console.log('\n--- Step 3: OT Pay Calculation ---');
    console.log(`Total OT Hours: ${attendanceSummary.totalOTHours || 0}`);
    const otPayResult = await otPayService.calculateOTPay(
      attendanceSummary.totalOTHours || 0,
      departmentId.toString()
    );
    console.log('OT Pay Result:', JSON.stringify(otPayResult, null, 2));
    
    // Ensure all otPayResult values are numbers
    if (!otPayResult || typeof otPayResult.otPay !== 'number') {
      throw new Error('Invalid OT pay calculation result');
    }

    // Step 4: Calculate Allowances (First Pass - with Basic Pay as base)
    console.log('\n--- Step 4: Allowances Calculation (Basic Pay Base) ---');
    const allowances = await allowanceService.calculateAllowances(
      departmentId.toString(),
      basicPayResult.basicPay,
      null,
      false
    );
    console.log(`Allowances (Basic Base): ${allowances.length} items`);
    allowances.forEach((allow, idx) => {
      console.log(`  [${idx + 1}] ${allow.name}: ${allow.amount} (${allow.type}, base: ${allow.base})`);
    });

    // Step 5: Calculate Gross Salary (First Pass)
    let grossSalary =
      basicPayResult.basicPay +
      basicPayResult.incentive +
      otPayResult.otPay +
      allowanceService.calculateTotalAllowances(allowances);
    console.log(`Gross Salary (First Pass): ${grossSalary}`);

    // Step 6: Recalculate Allowances (Second Pass - if any use 'gross' base)
    console.log('\n--- Step 6: Allowances Calculation (Gross Salary Base) ---');
    const allowancesWithGrossBase = await allowanceService.calculateAllowances(
      departmentId.toString(),
      basicPayResult.basicPay,
      grossSalary,
      true
    );
    console.log(`Allowances (Gross Base): ${allowancesWithGrossBase.length} items`);
    allowancesWithGrossBase.forEach((allow, idx) => {
      console.log(`  [${idx + 1}] ${allow.name}: ${allow.amount} (${allow.type}, base: ${allow.base})`);
    });

    // Merge allowances and apply employee overrides
    const allAllowances = [...allowances, ...allowancesWithGrossBase];
    const includeMissing = await getIncludeMissingFlag(departmentId);
    
    // Accept employee overrides even if category was missing/old; normalize to 'allowance'
    const allowanceOverrides = normalizeOverrides(employee.employeeAllowances || [], 'allowance').filter(
      (a) => a.category === 'allowance'
    );
    
    console.log(`\n--- Employee Allowance Overrides: ${allowanceOverrides.length} items ---`);
    allowanceOverrides.forEach((ov, idx) => {
      console.log(`  [${idx + 1}] ${ov.name} (masterId: ${ov.masterId}, amount: ${ov.amount})`);
    });
    
    console.log(`\n--- Base Allowances (Dept/Global): ${allAllowances.length} items ---`);
    allAllowances.forEach((base, idx) => {
      console.log(`  [${idx + 1}] ${base.name} (masterId: ${base.masterId}, amount: ${base.amount})`);
    });
    
    const mergedAllowances = mergeWithOverrides(allAllowances, allowanceOverrides, includeMissing);
    
    console.log(`\n--- Merged Allowances (After Override): ${mergedAllowances.length} items (includeMissing: ${includeMissing}) ---`);
    mergedAllowances.forEach((merged, idx) => {
      console.log(`  [${idx + 1}] ${merged.name} (masterId: ${merged.masterId}, amount: ${merged.amount}, isOverride: ${merged.isEmployeeOverride || false})`);
    });
    
    const totalAllowances = allowanceService.calculateTotalAllowances(mergedAllowances);
    console.log(`Total Allowances: ${totalAllowances}`);

    // Recalculate Gross Salary (Final)
    grossSalary =
      basicPayResult.basicPay +
      basicPayResult.incentive +
      otPayResult.otPay +
      totalAllowances;
    console.log(`Gross Salary (Final): ${grossSalary}`);

    // Step 7: Calculate Deductions
    console.log('\n========== DEDUCTIONS CALCULATION START ==========');
    console.log(`Employee: ${employee.emp_no} | Month: ${month}`);
    console.log(`Per Day Basic Pay: ${basicPayResult.perDayBasicPay}`);
    console.log(`Basic Pay: ${basicPayResult.basicPay}`);
    
    // 7a. Attendance Deduction
    console.log('\n--- 7a. Attendance Deduction ---');
    const attendanceDeductionResult = await deductionService.calculateAttendanceDeduction(
      employeeId,
      month,
      departmentId.toString(),
      basicPayResult.perDayBasicPay
    );
    console.log('Attendance Deduction Result:', JSON.stringify(attendanceDeductionResult, null, 2));
    console.log(`Attendance Deduction Amount: ${attendanceDeductionResult.attendanceDeduction}`);
    if (attendanceDeductionResult.breakdown) {
      console.log('Attendance Breakdown:', {
        lateInsCount: attendanceDeductionResult.breakdown.lateInsCount,
        earlyOutsCount: attendanceDeductionResult.breakdown.earlyOutsCount,
        combinedCount: attendanceDeductionResult.breakdown.combinedCount,
        daysDeducted: attendanceDeductionResult.breakdown.daysDeducted,
        deductionType: attendanceDeductionResult.breakdown.deductionType,
        calculationMode: attendanceDeductionResult.breakdown.calculationMode,
      });
    }

    // 7b. Permission Deduction
    console.log('\n--- 7b. Permission Deduction ---');
    const permissionDeductionResult = await deductionService.calculatePermissionDeduction(
      employeeId,
      month,
      departmentId.toString(),
      basicPayResult.perDayBasicPay
    );
    console.log('Permission Deduction Result:', JSON.stringify(permissionDeductionResult, null, 2));
    console.log(`Permission Deduction Amount: ${permissionDeductionResult.permissionDeduction}`);
    if (permissionDeductionResult.breakdown) {
      console.log('Permission Breakdown:', {
        permissionCount: permissionDeductionResult.breakdown.permissionCount,
        eligiblePermissionCount: permissionDeductionResult.breakdown.eligiblePermissionCount,
        daysDeducted: permissionDeductionResult.breakdown.daysDeducted,
        deductionType: permissionDeductionResult.breakdown.deductionType,
        calculationMode: permissionDeductionResult.breakdown.calculationMode,
      });
    }

    // 7c. Leave Deduction
    console.log('\n--- 7c. Leave Deduction ---');
    console.log(`Total Leaves: ${attendanceSummary.totalLeaves || 0}`);
    console.log(`Paid Leaves: ${paidLeaves}`);
    console.log(`Total Days in Month: ${modifiedAttendanceSummary.totalDaysInMonth}`);
    const leaveDeductionResult = deductionService.calculateLeaveDeduction(
      attendanceSummary.totalLeaves || 0,
      paidLeaves,
      modifiedAttendanceSummary.totalDaysInMonth,
      basicPayResult.basicPay
    );
    console.log('Leave Deduction Result:', JSON.stringify(leaveDeductionResult, null, 2));
    console.log(`Leave Deduction Amount: ${leaveDeductionResult.leaveDeduction}`);
    if (leaveDeductionResult.breakdown) {
      console.log('Leave Breakdown:', {
        totalLeaves: leaveDeductionResult.breakdown.totalLeaves,
        paidLeaves: leaveDeductionResult.breakdown.paidLeaves,
        unpaidLeaves: leaveDeductionResult.breakdown.unpaidLeaves,
        daysDeducted: leaveDeductionResult.breakdown.daysDeducted,
      });
    }

    // 7d. Other Deductions (NEW APPROACH: Get all once, separate by type, apply correctly)
    console.log('\n--- 7d. Other Deductions Calculation ---');
    console.log('Getting all active deductions and calculating by type...');
    
    // Get ALL deductions at once - the function now handles separation internally
    // Fixed deductions are calculated immediately
    // Percentage-basic deductions use basicPay
    // Percentage-gross deductions use grossSalary
    const allOtherDeductions = await deductionService.calculateOtherDeductions(
      departmentId.toString(),
      basicPayResult.basicPay,
      grossSalary // Pass gross salary for percentage-gross deductions
    );
    
    console.log(`\nTotal Other Deductions Found: ${allOtherDeductions.length} items`);
    console.log('Breakdown by type:');
    
    // Separate and log by type
    const fixedDeds = allOtherDeductions.filter(d => d.type === 'fixed');
    const percentageBasicDeds = allOtherDeductions.filter(d => d.type === 'percentage' && d.base === 'basic');
    const percentageGrossDeds = allOtherDeductions.filter(d => d.type === 'percentage' && d.base === 'gross');
    
    console.log(`\n  Fixed Deductions: ${fixedDeds.length} items`);
    if (fixedDeds.length > 0) {
      fixedDeds.forEach((ded, idx) => {
        console.log(`    [${idx + 1}] ${ded.name}: ₹${ded.amount} (Fixed - no base needed)`);
      });
    } else {
      console.log('    (None)');
    }
    
    console.log(`\n  Percentage Deductions (Basic Base): ${percentageBasicDeds.length} items`);
    if (percentageBasicDeds.length > 0) {
      percentageBasicDeds.forEach((ded, idx) => {
        console.log(`    [${idx + 1}] ${ded.name}: ₹${ded.amount} (Percentage of Basic Pay)`);
      });
    } else {
      console.log('    (None)');
    }
    
    console.log(`\n  Percentage Deductions (Gross Base): ${percentageGrossDeds.length} items`);
    if (percentageGrossDeds.length > 0) {
      percentageGrossDeds.forEach((ded, idx) => {
        console.log(`    [${idx + 1}] ${ded.name}: ₹${ded.amount} (Percentage of Gross Salary)`);
      });
    } else {
      console.log('    (None)');
    }
    
    // Accept employee overrides even if category was missing/old; normalize to 'deduction'
    const deductionOverrides = normalizeOverrides(employee.employeeDeductions || [], 'deduction').filter(
      (d) => d.category === 'deduction'
    );
    
    console.log(`\n--- Employee Deduction Overrides: ${deductionOverrides.length} items ---`);
    deductionOverrides.forEach((ov, idx) => {
      console.log(`  [${idx + 1}] ${ov.name} (masterId: ${ov.masterId}, amount: ${ov.amount})`);
    });
    
    console.log(`\n--- Base Deductions (Dept/Global): ${allOtherDeductions.length} items ---`);
    allOtherDeductions.forEach((base, idx) => {
      console.log(`  [${idx + 1}] ${base.name} (masterId: ${base.masterId}, amount: ${base.amount})`);
    });
    
    const mergedDeductions = mergeWithOverrides(allOtherDeductions, deductionOverrides, includeMissing);
    
    console.log(`\n--- Merged Deductions (After Override): ${mergedDeductions.length} items (includeMissing: ${includeMissing}) ---`);
    mergedDeductions.forEach((merged, idx) => {
      console.log(`  [${idx + 1}] ${merged.name} (masterId: ${merged.masterId}, amount: ${merged.amount}, isOverride: ${merged.isEmployeeOverride || false})`);
    });
    
    const totalOtherDeductions = deductionService.calculateTotalOtherDeductions(mergedDeductions);
    console.log(`\n✓ Total Other Deductions: ₹${totalOtherDeductions}`);
    console.log(`  (Fixed: ₹${deductionService.calculateTotalOtherDeductions(fixedDeds)}, ` +
                `Percentage-Basic: ₹${deductionService.calculateTotalOtherDeductions(percentageBasicDeds)}, ` +
                `Percentage-Gross: ₹${deductionService.calculateTotalOtherDeductions(percentageGrossDeds)})`);

    // Total Deductions
    const totalDeductions =
      attendanceDeductionResult.attendanceDeduction +
      permissionDeductionResult.permissionDeduction +
      leaveDeductionResult.leaveDeduction +
      totalOtherDeductions;
    
    console.log('\n--- DEDUCTIONS SUMMARY ---');
    console.log(`Attendance Deduction: ${attendanceDeductionResult.attendanceDeduction}`);
    console.log(`Permission Deduction: ${permissionDeductionResult.permissionDeduction}`);
    console.log(`Leave Deduction: ${leaveDeductionResult.leaveDeduction}`);
    console.log(`Other Deductions: ${totalOtherDeductions}`);
    console.log(`TOTAL DEDUCTIONS: ${totalDeductions}`);
    console.log('========== DEDUCTIONS CALCULATION END ==========\n');

    // Step 8: Calculate Loan EMI
    console.log('\n--- Step 8: Loan EMI Calculation ---');
    const emiResult = await loanAdvanceService.calculateTotalEMI(employeeId);
    console.log('EMI Result:', JSON.stringify(emiResult, null, 2));
    console.log(`Total EMI: ${emiResult.totalEMI}`);
    if (emiResult.emiBreakdown && emiResult.emiBreakdown.length > 0) {
      console.log('EMI Breakdown:');
      emiResult.emiBreakdown.forEach((emi, idx) => {
        console.log(`  [${idx + 1}] Loan ID: ${emi.loanId}, EMI: ${emi.emiAmount}`);
      });
    }

    // Step 9: Calculate Payable Amount (Before Advance)
    const payableAmountBeforeAdvance = grossSalary - totalDeductions - emiResult.totalEMI;
    console.log(`\n--- Step 9: Payable Amount Before Advance ---`);
    console.log(`Gross Salary: ${grossSalary}`);
    console.log(`Total Deductions: ${totalDeductions}`);
    console.log(`Total EMI: ${emiResult.totalEMI}`);
    console.log(`Payable Amount Before Advance: ${payableAmountBeforeAdvance}`);

    // Step 10: Process Salary Advance
    console.log('\n--- Step 10: Salary Advance Processing ---');
    const advanceResult = await loanAdvanceService.processSalaryAdvance(
      employeeId,
      Math.max(0, payableAmountBeforeAdvance)
    );
    console.log('Advance Result:', JSON.stringify(advanceResult, null, 2));
    console.log(`Advance Deduction: ${advanceResult.advanceDeduction}`);
    if (advanceResult.advanceBreakdown && advanceResult.advanceBreakdown.length > 0) {
      console.log('Advance Breakdown:');
      advanceResult.advanceBreakdown.forEach((adv, idx) => {
        console.log(`  [${idx + 1}] Advance ID: ${adv.advanceId}, Amount: ${adv.advanceAmount}, Carried Forward: ${adv.carriedForward}`);
      });
    }

    // Step 11: Calculate Net Salary
    const netSalary = Math.max(0, payableAmountBeforeAdvance - advanceResult.advanceDeduction);
    console.log(`\n--- Step 11: Net Salary Calculation ---`);
    console.log(`Payable Amount Before Advance: ${payableAmountBeforeAdvance}`);
    console.log(`Advance Deduction: ${advanceResult.advanceDeduction}`);
    console.log(`NET SALARY: ${netSalary}`);

    // Final Summary
    console.log('\n========== PAYROLL CALCULATION SUMMARY ==========');
    console.log('EARNINGS:');
    console.log(`  Basic Pay: ${basicPayResult.basicPay}`);
    console.log(`  Per Day Basic Pay: ${basicPayResult.perDayBasicPay}`);
    console.log(`  Payable Amount: ${basicPayResult.payableAmount}`);
    console.log(`  Incentive: ${basicPayResult.incentive}`);
    console.log(`  OT Pay: ${otPayResult.otPay} (${otPayResult.otHours} hours @ ${otPayResult.otPayPerHour}/hr)`);
    console.log(`  Total Allowances: ${totalAllowances}`);
    console.log(`  GROSS SALARY: ${grossSalary}`);
    console.log('\nDEDUCTIONS:');
    console.log(`  Attendance Deduction: ${attendanceDeductionResult.attendanceDeduction}`);
    console.log(`  Permission Deduction: ${permissionDeductionResult.permissionDeduction}`);
    console.log(`  Leave Deduction: ${leaveDeductionResult.leaveDeduction}`);
    console.log(`  Other Deductions: ${totalOtherDeductions}`);
    console.log(`  TOTAL DEDUCTIONS: ${totalDeductions}`);
    console.log(`  Loan EMI: ${emiResult.totalEMI}`);
    console.log(`  Advance Deduction: ${advanceResult.advanceDeduction}`);
    console.log('\nFINAL:');
    console.log(`  Payable Before Advance: ${payableAmountBeforeAdvance}`);
    console.log(`  NET SALARY: ${netSalary}`);
    console.log('========== PAYROLL CALCULATION END ==========\n');

    // Step 12: Get settings snapshot for audit
    const otSettings = await otPayService.getResolvedOTSettings(departmentId.toString());
    const permissionRules = await deductionService.getResolvedPermissionDeductionRules(departmentId.toString());
    const attendanceRules = await deductionService.getResolvedAttendanceDeductionRules(departmentId.toString());

    // Step 13: Create or Update Payroll Record
    const [year, monthNum] = month.split('-').map(Number);
    let payrollRecord = await PayrollRecord.getOrCreate(
      employeeId,
      employee.emp_no,
      year,
      monthNum
    );

    // Update payroll record - ensure all required fields are set
    // Calculate all values first and ensure they're numbers
    const finalBasicPay = Number(basicPayResult.basicPay) || 0;
    const finalPerDayBasicPay = Number(basicPayResult.perDayBasicPay) || 0;
    const finalPayableAmount = Number(basicPayResult.payableAmount) || 0;
    const finalIncentive = Number(basicPayResult.incentive) || 0;
    const finalOTPay = Number(otPayResult.otPay) || 0;
    const finalOTHours = Number(otPayResult.otHours) || 0;
    const finalOTRatePerHour = Number(otPayResult.otPayPerHour) || 0;
    const finalTotalAllowances = Number(totalAllowances) || 0;
    const finalGrossSalary = Number(grossSalary) || 0;
    const finalAttendanceDeduction = Number(attendanceDeductionResult.attendanceDeduction) || 0;
    const finalPermissionDeduction = Number(permissionDeductionResult.permissionDeduction) || 0;
    const finalLeaveDeduction = Number(leaveDeductionResult.leaveDeduction) || 0;
    const finalTotalOtherDeductions = Number(totalOtherDeductions) || 0;
    const finalTotalDeductions = Number(totalDeductions) || 0;
    const finalTotalEMI = Number(emiResult.totalEMI) || 0;
    const finalAdvanceDeduction = Number(advanceResult.advanceDeduction) || 0;
    const finalPayableAmountBeforeAdvance = Number(payableAmountBeforeAdvance) || 0;
    const finalNetSalary = Number(netSalary) || 0;

    // FINAL SOLUTION: Use set() method with dot notation for EACH field
    // This is the ONLY reliable way Mongoose recognizes nested required fields
    // Direct property assignment doesn't work for nested schemas with required fields
    
    // Set top-level required fields using set()
    payrollRecord.set('totalPayableShifts', Number(adjustedPayableShifts) || 0);
    payrollRecord.set('netSalary', Number(finalNetSalary) || 0);
    payrollRecord.set('payableAmountBeforeAdvance', Number(finalPayableAmountBeforeAdvance) || 0);
    payrollRecord.set('status', 'calculated');
    payrollRecord.set('attendanceSummaryId', attendanceSummary._id);
    
    // Set earnings fields using set() with dot notation - REQUIRED for nested schemas
    payrollRecord.set('earnings.basicPay', Number(finalBasicPay) || 0);
    payrollRecord.set('earnings.perDayBasicPay', Number(finalPerDayBasicPay) || 0);
    payrollRecord.set('earnings.payableAmount', Number(finalPayableAmount) || 0);
    payrollRecord.set('earnings.incentive', Number(finalIncentive) || 0);
    payrollRecord.set('earnings.otPay', Number(finalOTPay) || 0);
    payrollRecord.set('earnings.otHours', Number(finalOTHours) || 0);
    payrollRecord.set('earnings.otRatePerHour', Number(finalOTRatePerHour) || 0);
    payrollRecord.set('earnings.totalAllowances', Number(finalTotalAllowances) || 0);
    payrollRecord.set('earnings.allowances', Array.isArray(mergedAllowances) ? mergedAllowances : []);
    payrollRecord.set('earnings.grossSalary', Number(finalGrossSalary) || 0);
    
    // Set deductions fields using set() with dot notation
    payrollRecord.set('deductions.attendanceDeduction', Number(finalAttendanceDeduction) || 0);
    payrollRecord.set('deductions.attendanceDeductionBreakdown', attendanceDeductionResult.breakdown || {
      lateInsCount: 0,
      earlyOutsCount: 0,
      combinedCount: 0,
      daysDeducted: 0,
      deductionType: null,
      calculationMode: null,
    });
    payrollRecord.set('deductions.permissionDeduction', Number(finalPermissionDeduction) || 0);
    payrollRecord.set('deductions.permissionDeductionBreakdown', permissionDeductionResult.breakdown || {
      permissionCount: 0,
      eligiblePermissionCount: 0,
      daysDeducted: 0,
      deductionType: null,
      calculationMode: null,
    });
    payrollRecord.set('deductions.leaveDeduction', Number(finalLeaveDeduction) || 0);
    payrollRecord.set('deductions.leaveDeductionBreakdown', leaveDeductionResult.breakdown || {
      totalLeaves: 0,
      paidLeaves: 0,
      unpaidLeaves: 0,
      daysDeducted: 0,
    });
    payrollRecord.set('deductions.totalOtherDeductions', Number(finalTotalOtherDeductions) || 0);
    payrollRecord.set('deductions.otherDeductions', Array.isArray(mergedDeductions) ? mergedDeductions : []);
    payrollRecord.set('deductions.totalDeductions', Number(finalTotalDeductions) || 0);
    
    // Set loan/advance fields using set() with dot notation
    payrollRecord.set('loanAdvance.totalEMI', Number(finalTotalEMI) || 0);
    payrollRecord.set('loanAdvance.emiBreakdown', Array.isArray(emiResult.emiBreakdown) ? emiResult.emiBreakdown : []);
    payrollRecord.set('loanAdvance.advanceDeduction', Number(finalAdvanceDeduction) || 0);
    payrollRecord.set('loanAdvance.advanceBreakdown', Array.isArray(advanceResult.advanceBreakdown) ? advanceResult.advanceBreakdown : []);
    
    // Set calculation metadata
    payrollRecord.set('calculationMetadata', {
      calculatedAt: new Date(),
      calculatedBy: userId,
      calculationVersion: '1.0',
      settingsSnapshot: {
        otSettings: otSettings || {},
        permissionDeductionRules: permissionRules || {},
        attendanceDeductionRules: attendanceRules || {},
      },
    });

    // Mark all nested paths as modified - CRITICAL for Mongoose to save them
    payrollRecord.markModified('earnings');
    payrollRecord.markModified('deductions');
    payrollRecord.markModified('loanAdvance');
    payrollRecord.markModified('calculationMetadata');

    // Verify values are set using get() method
    console.log('\n--- Step 13: Saving Payroll Record ---');
    console.log('Verifying all fields before save:');
    console.log('  Top Level:');
    console.log(`    totalPayableShifts: ${payrollRecord.get('totalPayableShifts')}`);
    console.log(`    netSalary: ${payrollRecord.get('netSalary')}`);
    console.log(`    payableAmountBeforeAdvance: ${payrollRecord.get('payableAmountBeforeAdvance')}`);
    console.log('  Earnings:');
    console.log(`    basicPay: ${payrollRecord.get('earnings.basicPay')}`);
    console.log(`    perDayBasicPay: ${payrollRecord.get('earnings.perDayBasicPay')}`);
    console.log(`    payableAmount: ${payrollRecord.get('earnings.payableAmount')}`);
    console.log(`    incentive: ${payrollRecord.get('earnings.incentive')}`);
    console.log(`    otPay: ${payrollRecord.get('earnings.otPay')}`);
    console.log(`    otHours: ${payrollRecord.get('earnings.otHours')}`);
    console.log(`    otRatePerHour: ${payrollRecord.get('earnings.otRatePerHour')}`);
    console.log(`    totalAllowances: ${payrollRecord.get('earnings.totalAllowances')}`);
    console.log(`    grossSalary: ${payrollRecord.get('earnings.grossSalary')}`);
    console.log('  Deductions:');
    console.log(`    attendanceDeduction: ${payrollRecord.get('deductions.attendanceDeduction')}`);
    console.log(`    permissionDeduction: ${payrollRecord.get('deductions.permissionDeduction')}`);
    console.log(`    leaveDeduction: ${payrollRecord.get('deductions.leaveDeduction')}`);
    console.log(`    totalOtherDeductions: ${payrollRecord.get('deductions.totalOtherDeductions')}`);
    console.log(`    totalDeductions: ${payrollRecord.get('deductions.totalDeductions')}`);
    console.log('  Loan/Advance:');
    console.log(`    totalEMI: ${payrollRecord.get('loanAdvance.totalEMI')}`);
    console.log(`    advanceDeduction: ${payrollRecord.get('loanAdvance.advanceDeduction')}`);

    // Save the document
    console.log('\nSaving payroll record to database...');
    await payrollRecord.save();
    console.log(`✓ Payroll record saved successfully! ID: ${payrollRecord._id}`);

    // Step 14: Create Transaction Logs
    await createTransactionLogs(payrollRecord._id, employeeId, employee.emp_no, month, userId, {
      basicPayResult,
      otPayResult,
      allAllowances,
      totalAllowances,
      attendanceDeductionResult,
      permissionDeductionResult,
      leaveDeductionResult,
      allOtherDeductions,
      totalOtherDeductions,
      totalDeductions,
      emiResult,
      advanceResult,
      grossSalary,
      netSalary,
    });

    return {
      success: true,
      payrollRecord,
    };
  } catch (error) {
    console.error('Error calculating payroll:', error);
    throw error;
  }
}

/**
 * Create transaction logs for audit trail
 * @param {ObjectId} payrollRecordId - Payroll record ID
 * @param {String} employeeId - Employee ID
 * @param {String} emp_no - Employee number
 * @param {String} month - Month
 * @param {String} userId - User ID
 * @param {Object} calculationResults - All calculation results
 */
async function createTransactionLogs(payrollRecordId, employeeId, emp_no, month, userId, calculationResults) {
  const transactions = [];

  // Basic Pay
  transactions.push({
    payrollRecordId,
    employeeId,
    emp_no,
    transactionType: 'basic_pay',
    category: 'earning',
    description: `Basic Pay for ${month}`,
    amount: calculationResults.basicPayResult.basicPay,
    details: {
      perDayBasicPay: calculationResults.basicPayResult.perDayBasicPay,
      totalDaysInMonth: calculationResults.basicPayResult.totalDaysInMonth,
    },
    month,
    createdBy: userId,
  });

  // Incentive
  if (calculationResults.basicPayResult.incentive !== 0) {
    transactions.push({
      payrollRecordId,
      employeeId,
      emp_no,
      transactionType: 'incentive',
      category: 'earning',
      description: `Incentive (${calculationResults.basicPayResult.totalPayableShifts} payable shifts)`,
      amount: calculationResults.basicPayResult.incentive,
      details: {
        payableShifts: calculationResults.basicPayResult.totalPayableShifts,
        payableAmount: calculationResults.basicPayResult.payableAmount,
      },
      month,
      createdBy: userId,
    });
  }

  // OT Pay
  if (calculationResults.otPayResult.otPay > 0) {
    transactions.push({
      payrollRecordId,
      employeeId,
      emp_no,
      transactionType: 'ot_pay',
      category: 'earning',
      description: `Overtime Pay (${calculationResults.otPayResult.otHours} hours @ ₹${calculationResults.otPayResult.otPayPerHour}/hr)`,
      amount: calculationResults.otPayResult.otPay,
      details: {
        otHours: calculationResults.otPayResult.otHours,
        otRatePerHour: calculationResults.otPayResult.otPayPerHour,
      },
      month,
      createdBy: userId,
    });
  }

  // Allowances
  for (const allowance of calculationResults.allAllowances) {
    transactions.push({
      payrollRecordId,
      employeeId,
      emp_no,
      transactionType: 'allowance',
      category: 'earning',
      description: `Allowance: ${allowance.name}`,
      amount: allowance.amount,
      details: {
        type: allowance.type,
        base: allowance.base,
      },
      month,
      createdBy: userId,
    });
  }

  // Attendance Deduction
  if (calculationResults.attendanceDeductionResult.attendanceDeduction > 0) {
    transactions.push({
      payrollRecordId,
      employeeId,
      emp_no,
      transactionType: 'attendance_deduction',
      category: 'deduction',
      description: `Attendance Deduction (${calculationResults.attendanceDeductionResult.breakdown.combinedCount} combined count)`,
      amount: -calculationResults.attendanceDeductionResult.attendanceDeduction,
      details: calculationResults.attendanceDeductionResult.breakdown,
      month,
      createdBy: userId,
    });
  }

  // Permission Deduction
  if (calculationResults.permissionDeductionResult.permissionDeduction > 0) {
    transactions.push({
      payrollRecordId,
      employeeId,
      emp_no,
      transactionType: 'permission_deduction',
      category: 'deduction',
      description: `Permission Deduction (${calculationResults.permissionDeductionResult.breakdown.eligiblePermissionCount} eligible permissions)`,
      amount: -calculationResults.permissionDeductionResult.permissionDeduction,
      details: calculationResults.permissionDeductionResult.breakdown,
      month,
      createdBy: userId,
    });
  }

  // Leave Deduction
  if (calculationResults.leaveDeductionResult.leaveDeduction > 0) {
    transactions.push({
      payrollRecordId,
      employeeId,
      emp_no,
      transactionType: 'leave_deduction',
      category: 'deduction',
      description: `Leave Deduction (${calculationResults.leaveDeductionResult.breakdown.unpaidLeaves} unpaid leaves)`,
      amount: -calculationResults.leaveDeductionResult.leaveDeduction,
      details: calculationResults.leaveDeductionResult.breakdown,
      month,
      createdBy: userId,
    });
  }

  // Other Deductions
  for (const deduction of calculationResults.allOtherDeductions) {
    transactions.push({
      payrollRecordId,
      employeeId,
      emp_no,
      transactionType: 'deduction',
      category: 'deduction',
      description: `Deduction: ${deduction.name}`,
      amount: -deduction.amount,
      details: {
        type: deduction.type,
        base: deduction.base,
      },
      month,
      createdBy: userId,
    });
  }

  // Loan EMI
  if (calculationResults.emiResult.totalEMI > 0) {
    for (const emi of calculationResults.emiResult.emiBreakdown) {
      transactions.push({
        payrollRecordId,
        employeeId,
        emp_no,
        transactionType: 'loan_emi',
        category: 'adjustment',
        description: `Loan EMI Deduction`,
        amount: -emi.emiAmount,
        details: {
          loanId: emi.loanId,
        },
        month,
        createdBy: userId,
      });
    }
  }

  // Salary Advance
  if (calculationResults.advanceResult.advanceDeduction > 0) {
    for (const advance of calculationResults.advanceResult.advanceBreakdown) {
      transactions.push({
        payrollRecordId,
        employeeId,
        emp_no,
        transactionType: 'salary_advance',
        category: 'adjustment',
        description: `Salary Advance Deduction`,
        amount: -advance.advanceAmount,
        details: {
          advanceId: advance.advanceId,
          carriedForward: advance.carriedForward,
        },
        month,
        createdBy: userId,
      });
    }
  }

  // Net Salary
  transactions.push({
    payrollRecordId,
    employeeId,
    emp_no,
    transactionType: 'net_salary',
    category: 'earning',
    description: `Net Salary for ${month}`,
    amount: calculationResults.netSalary,
    details: {
      grossSalary: calculationResults.grossSalary,
      totalDeductions: calculationResults.totalDeductions,
      totalEMI: calculationResults.emiResult.totalEMI,
      advanceDeduction: calculationResults.advanceResult.advanceDeduction,
    },
    month,
    createdBy: userId,
  });

  // Bulk insert transactions
  if (transactions.length > 0) {
    await PayrollTransaction.insertMany(transactions);
  }
}

/**
 * Process payroll (update loan/advance records)
 * @param {String} payrollRecordId - Payroll record ID
 * @param {String} userId - User ID
 */
async function processPayroll(payrollRecordId, userId) {
  try {
    const payrollRecord = await PayrollRecord.findById(payrollRecordId);
    if (!payrollRecord) {
      throw new Error('Payroll record not found');
    }

    if (payrollRecord.status !== 'calculated' && payrollRecord.status !== 'approved') {
      throw new Error('Payroll must be calculated or approved before processing');
    }

    // Update loan records
    if (payrollRecord.loanAdvance.emiBreakdown && payrollRecord.loanAdvance.emiBreakdown.length > 0) {
      await loanAdvanceService.updateLoanRecordsAfterEMI(
        payrollRecord.loanAdvance.emiBreakdown,
        payrollRecord.month,
        userId
      );
    }

    // Update advance records
    if (payrollRecord.loanAdvance.advanceBreakdown && payrollRecord.loanAdvance.advanceBreakdown.length > 0) {
      await loanAdvanceService.updateAdvanceRecordsAfterDeduction(
        payrollRecord.loanAdvance.advanceBreakdown,
        payrollRecord.month,
        userId
      );
    }

    // Update payroll record status
    payrollRecord.status = 'processed';
    payrollRecord.processedBy = userId;
    payrollRecord.processedAt = new Date();
    await payrollRecord.save();

    return { success: true, payrollRecord };
  } catch (error) {
    console.error('Error processing payroll:', error);
    throw error;
  }
}

module.exports = {
  calculatePayroll,
  processPayroll,
};

