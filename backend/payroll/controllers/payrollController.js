const mongoose = require('mongoose');
const { compareEmpNo, EMP_NO_SORT, EMP_NO_COLLATION } = require('../../shared/utils/employeeSort');
const PayrollRecord = require('../model/PayrollRecord');
const PayrollTransaction = require('../model/PayrollTransaction');
const SecondSalaryRecord = require('../model/SecondSalaryRecord');
const Employee = require('../../employees/model/Employee');
const { buildSecondSalaryPaysheetData, buildSecondSalaryExcelRowsNormalized } = require('../utils/secondSalaryPaysheetRows');
const {
  payrollRecordToPayslipShape,
  secondSalaryRecordToPayslipShape,
  normalizeOutputColumns,
  buildOutputColumnRows,
  buildSecondSalaryPaysheetFromOutputColumns,
  getStatutoryCodesForPaysheetExpansion,
  writeBundleBuffer,
  resolvePaysheetExportMeta,
  enrichExportRowsWithOrg,
  refreshEmployeeFieldColumnsOnRows,
  tryBuildRegularRowsFromSnapshots,
  enrichPayslipsLoanRemainingBalance,
} = require('../utils/paysheetBundleExport');
const User = require('../../users/model/User');
const Settings = require('../../settings/model/Settings');
const { isSecondSalaryGloballyEnabled } = require('../../settings/secondSalaryFeatureGate');
const Loan = require('../../loans/model/Loan');
const payrollCalculationService = require('../services/payrollCalculationService');
const payrollCalculationFromOutputColumnsService = require('../services/payrollCalculationFromOutputColumnsService');
const XLSX = require('xlsx');
const PayRegisterSummary = require('../../pay-register/model/PayRegisterSummary');
const {
  fetchAttendanceDataForEmployeeMonths,
} = require('../services/attendanceRangeDataService');
const MonthlyAttendanceSummary = require('../../attendance/model/MonthlyAttendanceSummary');
const PayrollConfiguration = require('../model/PayrollConfiguration');
const outputColumnService = require('../services/outputColumnService');
const ArrearsPayrollIntegrationService = require('../../arrears/services/arrearsPayrollIntegrationService');
const PayrollPayslipSnapshot = require('../model/PayrollPayslipSnapshot');
const DeductionPayrollIntegrationService = require('../../manual-deductions/services/deductionPayrollIntegrationService');
const paysheetAdjustmentService = require('../services/paysheetAdjustmentService');
const PaysheetAdjustmentRequest = require('../model/PaysheetAdjustmentRequest');
const payslipSectionService = require('../services/payslipSectionService');
const payslipLoanSectionService = require('../services/payslipLoanSectionService');
const payslipAccess = require('../utils/payslipAccess');

async function attachPayslipSectionsToRecord(payrollRecord) {
  const config = await PayrollConfiguration.get();
  const outputColumns = Array.isArray(config?.outputColumns) ? config.outputColumns : [];
  const empId = payrollRecord.employeeId?._id || payrollRecord.employeeId;
  let snapshotRow = null;
  if (empId && payrollRecord.month) {
    const snap = await PayrollPayslipSnapshot.findOne({
      employeeId: empId,
      month: payrollRecord.month,
      kind: 'regular',
    })
      .select('row')
      .lean();
    snapshotRow = snap?.row || null;
  }
  const payslipSections = payslipSectionService.buildPayslipSections(
    outputColumns,
    payrollRecord,
    snapshotRow
  );
  const data =
    payrollRecord && typeof payrollRecord.toObject === 'function'
      ? payrollRecord.toObject()
      : { ...payrollRecord };
  data.payslipSections = payslipSections;
  data.payslipLoans = await payslipLoanSectionService.buildPayslipLoansForRecord(payrollRecord, {
    outputColumns,
    snapshotRow,
  });
  return data;
}

async function attachPaysheetAdjustmentMeta(rows, records, month, outputColumnsForRebuild = null) {
  if (!Array.isArray(rows) || rows.length === 0) {
    const config = await PayrollConfiguration.get();
    return {
      rows: rows || [],
      paysheetModification: {
        allowPaysheetModification: !!config?.allowPaysheetModification,
        editableColumns: paysheetAdjustmentService.getEditableColumnDefs(config),
      },
    };
  }
  const config = await PayrollConfiguration.get();
  const editableColumns = paysheetAdjustmentService.getEditableColumnDefs(config);
  const enrichedRows = rows.map((row, index) => {
    const rec = Array.isArray(records) ? records[index] : null;
    const empId = rec ? String(rec.employeeId?._id || rec.employeeId || '') : '';
    const recId = rec?._id ? String(rec._id) : '';
    return {
      ...row,
      _employeeId: empId || row._employeeId || undefined,
      _payrollRecordId: recId || row._payrollRecordId || undefined,
    };
  });
  const employeeIds = enrichedRows.map((r) => r._employeeId).filter(Boolean);
  let rowsForOverlay = enrichedRows;
  const paysheetAdjustmentsForRows =
    config?.allowPaysheetModification &&
    employeeIds.length > 0 &&
    (await PaysheetAdjustmentRequest.exists({
      month,
      employeeId: { $in: employeeIds },
      status: { $in: ['pending', 'approved'] },
    }));
  if (
    paysheetAdjustmentsForRows &&
    Array.isArray(outputColumnsForRebuild) &&
    outputColumnsForRebuild.length > 0 &&
    Array.isArray(records) &&
    records.length > 0
  ) {
    rowsForOverlay = paysheetAdjustmentService.rebuildRowsFromPayrollRecords(
      enrichedRows,
      records,
      outputColumnsForRebuild
    );
  }
  const overlay = await paysheetAdjustmentService.buildAdjustmentOverlay(month, employeeIds);
  let rowsWithOverlay = paysheetAdjustmentService.applyOverlayToRows(rowsForOverlay, overlay, editableColumns);
  rowsWithOverlay = paysheetAdjustmentService.attachEditableFieldValuesToRows(
    rowsWithOverlay,
    records,
    config,
    editableColumns
  );
  return {
    rows: rowsWithOverlay,
    paysheetModification: {
      allowPaysheetModification: !!config?.allowPaysheetModification,
      editableColumns,
    },
  };
}

/**
 * Payroll Controller
 * Handles payroll calculation, retrieval, and processing
 */

/**
 * @desc    Calculate payroll for an employee
 * @route   POST /api/payroll/calculate
 * @access  Private (Super Admin, Sub Admin, HR)
 */
// Shared payslip assembler (used by calculate & getPayslip)
async function buildPayslipData(employeeId, month) {
  const payrollRecord = await PayrollRecord.findOne({
    employeeId,
    month,
  }).populate({
    path: 'employeeId',
    select:
      'employee_name emp_no department_id division_id designation_id gross_salary location bank_account_no bank_name bank_place ifsc_code salary_mode doj pf_number esi_number',
    populate: [
      { path: 'department_id', select: 'name' },
      { path: 'division_id', select: 'name' },
      { path: 'designation_id', select: 'name' },
    ],
  });

  if (!payrollRecord) {
    throw new Error('Payslip not found. Please calculate payroll first.');
  }

  // Try pay register summary for rich totals; fallback to attendance summary
  const payRegisterSummary = await PayRegisterSummary.findOne({ employeeId, month });
  const attendanceSummary = await MonthlyAttendanceSummary.findOne({ employeeId, month });

  // Extract employee data with properly populated references
  const employee = payrollRecord.employeeId;

  // Department name
  let departmentName = 'N/A';
  if (employee?.department_id) {
    if (typeof employee.department_id === 'object' && employee.department_id.name) {
      departmentName = employee.department_id.name;
    } else if (employee.department_id.toString) {
      const Department = require('../../departments/model/Department');
      const dept = await Department.findById(employee.department_id).select('name');
      if (dept) departmentName = dept.name;
    }
  }

  // Division name
  let divisionName = 'N/A';
  if (employee?.division_id) {
    if (typeof employee.division_id === 'object' && employee.division_id.name) {
      divisionName = employee.division_id.name;
    } else if (employee.division_id.toString) {
      const Division = require('../../departments/model/Division');
      const div = await Division.findById(employee.division_id).select('name');
      if (div) divisionName = div.name;
    }
  }

  // Designation name
  let designationName = 'N/A';
  if (employee?.designation_id) {
    if (typeof employee.designation_id === 'object' && employee.designation_id.name) {
      designationName = employee.designation_id.name;
    } else if (employee.designation_id.toString) {
      const Designation = require('../../departments/model/Designation');
      const desig = await Designation.findById(employee.designation_id).select('name');
      if (desig) designationName = desig.name;
    }
  }

  const perDay = payrollRecord.earnings.perDayBasicPay || 0;
  const payableShifts = payrollRecord.totalPayableShifts || 0;
  const presentDays =
    payRegisterSummary?.totals?.totalPresentDays ?? attendanceSummary?.totalPresentDays ?? null;
  const paidLeaveDays =
    payRegisterSummary?.totals?.totalPaidLeaveDays ??
    attendanceSummary?.paidLeaves ??
    attendanceSummary?.totalPaidLeaveDays ??
    null;
  const odDays =
    payRegisterSummary?.totals?.totalODDays ?? attendanceSummary?.totalODs ?? null;
  const otHours =
    payRegisterSummary?.totals?.totalOTHours ??
    attendanceSummary?.totalOTHours ??
    payrollRecord.earnings.otHours ??
    0;
  const monthDays = payrollRecord.totalDaysInMonth;
  // Incentive = extra days only (payableShifts - present - paidLeave). Do NOT use (payableShifts - presentDays)
  // or paid leave days would be counted twice: once in paidLeaveSalary and again in incentive.
  // OD is already subsumed in presentDays in pay register, so we don't subtract it here.
  const incentiveDays =
    presentDays !== null && paidLeaveDays !== null
      ? Math.max(0, payableShifts - presentDays - (paidLeaveDays || 0))
      : (payrollRecord.attendance?.extraDays || 0);

  const earnedSalary =
    presentDays !== null ? perDay * presentDays : payrollRecord.earnings.payableAmount;
  const paidLeaveSalary = paidLeaveDays !== null ? perDay * paidLeaveDays : 0;
  // Present days already include OD days; do not add OD again (no separate odSalary in gross).
  const odSalary = 0;
  const incentive = incentiveDays !== null ? perDay * incentiveDays : payrollRecord.earnings.incentive;

  const totalAllowances = payrollRecord.earnings.totalAllowances || 0;
  const otPay = payrollRecord.earnings.otPay || 0;
  const grossSalary = earnedSalary + paidLeaveSalary + odSalary + incentive + otPay + totalAllowances;

  const payslip = {
    month: payrollRecord.monthName,
    monthNumber: payrollRecord.monthNumber,
    year: payrollRecord.year,
    employee: {
      emp_no: payrollRecord.emp_no,
      name: employee?.employee_name || 'N/A',
      department: departmentName,
      division: divisionName,
      designation: designationName,
      location: employee?.location || '',
      bank_account_no: employee?.bank_account_no || '',
      bank_name: employee?.bank_name || '',
      bank_place: employee?.bank_place || '',
      ifsc_code: employee?.ifsc_code || '',
      payment_mode: employee?.salary_mode || '',
      date_of_joining: employee?.doj || '',
      pf_number: employee?.pf_number || '',
      esi_number: employee?.esi_number || '',
      leftDate: employee?.leftDate,
    },
    attendance: {
      // Use new attendance breakdown if available, fallback to old fields
      totalDaysInMonth: payrollRecord.attendance?.totalDaysInMonth || monthDays,
      monthDays: payrollRecord.attendance?.totalDaysInMonth || monthDays,
      presentDays: payrollRecord.attendance?.presentDays || presentDays,
      paidLeaveDays: payrollRecord.attendance?.paidLeaveDays || paidLeaveDays,
      odDays: payrollRecord.attendance?.odDays || odDays,
      weeklyOffs: payrollRecord.attendance?.weeklyOffs || 0,
      holidays: payrollRecord.attendance?.holidays || 0,
      absentDays: payrollRecord.attendance?.absentDays || 0,
      payableShifts: payrollRecord.attendance?.payableShifts || payableShifts,
      extraDays: payrollRecord.attendance?.extraDays || 0,
      totalPaidDays: payrollRecord.attendance?.totalPaidDays || 0,
      // Late/attendance deducting days (days deducted due to late-in/early-out)
      attendanceDeductionDays: payrollRecord.deductions?.attendanceDeductionBreakdown?.daysDeducted ?? 0,
      // Final paid days = total paid days minus attendance deduction days
      finalPaidDays: Math.max(0, (payrollRecord.attendance?.totalPaidDays ?? payrollRecord.attendance?.paidDays ?? 0) - (payrollRecord.deductions?.attendanceDeductionBreakdown?.daysDeducted ?? 0)),
      otHours: payrollRecord.attendance?.otHours || otHours,
      otDays: payrollRecord.attendance?.otDays || 0,
      earnedSalary: payrollRecord.attendance?.earnedSalary || earnedSalary,
      lopDays: payRegisterSummary?.totals?.totalLopDays || 0,
      incentiveDays: incentiveDays, // Keep for backward compatibility
      workingDays: null, // Can be derived if needed
    },
    earnings: {
      basicPay: payrollRecord.earnings.basicPay,
      perDay,
      earnedSalary,
      paidLeaveSalary,
      odSalary,
      incentive,
      otPay,
      allowances: payrollRecord.earnings.allowances,
      totalAllowances,
      allowancesCumulative: payrollRecord.earnings.allowancesCumulative ?? totalAllowances,
      grossSalary,
    },
    deductions: {
      attendanceDeduction: payrollRecord.deductions.attendanceDeduction,
      attendanceDeductionBreakdown: payrollRecord.deductions.attendanceDeductionBreakdown || {},
      permissionDeduction: payrollRecord.deductions.permissionDeduction,
      leaveDeduction: payrollRecord.deductions.leaveDeduction,
      otherDeductions: payrollRecord.deductions.otherDeductions,
      totalOtherDeductions: payrollRecord.deductions.totalOtherDeductions,
      statutoryDeductions: payrollRecord.deductions.statutoryDeductions || [],
      totalStatutoryEmployee: payrollRecord.deductions.totalStatutoryEmployee,
      statutoryCumulative: payrollRecord.deductions.statutoryCumulative,
      deductionsCumulative: payrollRecord.deductions.deductionsCumulative ?? payrollRecord.deductions.totalDeductions,
      totalDeductions: payrollRecord.deductions.totalDeductions,
    },
    loanAdvance: {
      totalEMI: payrollRecord.loanAdvance.totalEMI,
      advanceDeduction: payrollRecord.loanAdvance.advanceDeduction,
    },
    arrears: {
      arrearsAmount: payrollRecord.arrearsAmount || 0,
      arrearsSettlements: payrollRecord.arrearsSettlements || [],
    },
    manualDeductions: {
      manualDeductionsAmount: payrollRecord.manualDeductionsAmount || 0,
      deductionSettlements: payrollRecord.deductionSettlements || [],
    },
    netSalary: payrollRecord.netSalary,
    totalPayableShifts: payrollRecord.totalPayableShifts,
    // Present days already include OD; do not add OD again in paid days.
    paidDays: payrollRecord.attendance?.paidDays || (presentDays + (payRegisterSummary?.totals?.totalWeeklyOffs || 0) + (payRegisterSummary?.totals?.totalHolidays || 0) + (paidLeaveDays || 0)),
    // Late/attendance deducting days (days deducted due to late-in/early-out rules)
    attendanceDeductionDays: (payrollRecord.deductions?.attendanceDeductionBreakdown?.daysDeducted ?? 0),
    // Final paid days = paid days minus attendance deduction days (clear picture for user)
    finalPaidDays: Math.max(0, (payrollRecord.attendance?.paidDays ?? (presentDays + (payRegisterSummary?.totals?.totalWeeklyOffs || 0) + (payRegisterSummary?.totals?.totalHolidays || 0) + (paidLeaveDays || 0))) - (payrollRecord.deductions?.attendanceDeductionBreakdown?.daysDeducted ?? 0)),
    roundOff: payrollRecord.roundOff || 0,
    status: payrollRecord.status,
  };

  return { payrollRecord, payslip };
}

/**
 * Build Excel row with normalized columns (all employees have same columns)
 * @param {Object} payslip - Payslip data
 * @param {Set} allAllowanceNames - All unique allowance names across all employees
 * @param {Set} allDeductionNames - All unique deduction names across all employees
 * @param {Number} serialNo - Serial number for S.No column
 */
function buildPayslipExcelRowsNormalized(payslip, allAllowanceNames, allDeductionNames, serialNo) {
  const row = {
    'S.No': serialNo,
    'Employee Code': payslip.employee.emp_no || '',
    'Name': payslip.employee.name || '',
    'Designation': payslip.employee.designation || '',
    'Department': payslip.employee.department || '',
    'Division': payslip.employee.division || '',
    'Date of Joining': payslip.employee.date_of_joining ? new Date(payslip.employee.date_of_joining).toLocaleDateString() : '',
    'Payment Mode': payslip.employee.payment_mode || '',
    'Bank Name': payslip.employee.bank_name || '',
    'Bank Account No': payslip.employee.bank_account_no || '',
    'BASIC': payslip.earnings.basicPay || 0,
  };

  // Create a map of employee's allowances for quick lookup
  const employeeAllowances = {};
  if (payslip.earnings && Array.isArray(payslip.earnings.allowances)) {
    payslip.earnings.allowances.forEach(allowance => {
      if (allowance && allowance.name) {
        employeeAllowances[allowance.name] = allowance.amount || 0;
      }
    });
  }

  // Add ALL allowance columns (with 0 if employee doesn't have it)
  allAllowanceNames.forEach(allowanceName => {
    row[allowanceName] = employeeAllowances[allowanceName] || 0;
  });

  row['TOTAL GROSS SALARY'] = payslip.earnings.grossSalary || 0;

  // Attendance
  row['Month Days'] = payslip.attendance?.monthDays || payslip.attendance?.totalDaysInMonth || 0;
  row['Present Days'] = payslip.attendance?.presentDays || 0;
  row['Week Offs'] = payslip.attendance?.weeklyOffs || 0;
  row['Paid Leaves'] = payslip.attendance?.paidLeaveDays || 0;
  row['OD Days'] = payslip.attendance?.odDays || 0;
  row['Absents'] = payslip.attendance?.absentDays || 0;
  row['LOP\'s'] = payslip.attendance?.lopDays || 0;
  row['Payable Shifts'] = payslip.attendance?.payableShifts || 0;
  row['Extra Days'] = payslip.attendance?.extraDays || 0;
  row['Total Paid Days'] = payslip.paidDays || 0;
  row['Attendance Deduction Days'] = payslip.attendanceDeductionDays ?? payslip.attendance?.attendanceDeductionDays ?? 0;
  row['Final Paid Days'] = Math.max((row['Total Paid Days'] - (row['Attendance Deduction Days'] || 0)), 0);

  // Net earnings
  row['Net Basic'] = payslip.attendance?.earnedSalary || payslip.earnings.earnedSalary || 0;

  // Add ALL net allowance columns (with 0 if employee doesn't have it)
  allAllowanceNames.forEach(allowanceName => {
    row[`Net ${allowanceName}`] = employeeAllowances[allowanceName] || 0;
  });

  row['Total Earnings'] = (payslip.attendance?.earnedSalary || 0) + (payslip.earnings.totalAllowances || 0);

  // Create a map of employee's deductions for quick lookup
  const employeeDeductions = {};
  if (payslip.deductions && Array.isArray(payslip.deductions.otherDeductions)) {
    payslip.deductions.otherDeductions.forEach(deduction => {
      if (deduction && deduction.name) {
        employeeDeductions[deduction.name] = deduction.amount || 0;
      }
    });
  }

  // Add ALL deduction columns (with 0 if employee doesn't have it)
  allDeductionNames.forEach(deductionName => {
    row[deductionName] = employeeDeductions[deductionName] || 0;
  });

  row['Fines'] = 0;
  row['Salary Advance'] = payslip.loanAdvance?.advanceDeduction || 0;
  row['Total Deductions'] = payslip.deductions?.totalDeductions || 0;

  // OT & Incentives
  row['OT Days'] = payslip.attendance?.otDays || 0;
  row['OT Hours'] = payslip.attendance?.otHours || 0;
  row['OT Amount'] = payslip.earnings?.otPay || 0;
  row['Incentives'] = (payslip.earnings?.incentive || 0) + (payslip.extraDaysPay || 0);
  row['Other Amount'] = 0;
  row['Total Other Earnings'] = (row['OT Amount']) + (row['Incentives']);

  // Arrears
  row['Arrears'] = payslip.arrears?.arrearsAmount || 0;

  row['Manual Deduction'] =
    payslip.manualDeductions?.manualDeductionsAmount ?? payslip.manualDeductionsAmount ?? 0;

  // Final
  row['NET SALARY'] = payslip.netSalary || 0;
  row['Round Off'] = payslip.roundOff || 0;
  row['FINAL SALARY'] = payslip.netSalary || 0;

  return row;
}

/**
 * Build Excel row for single payslip (backward compatibility)
 */
function buildPayslipExcelRows(payslip) {
  // For single payslip export, collect allowances/deductions from that payslip only
  const allAllowanceNames = new Set();
  const allDeductionNames = new Set();

  if (Array.isArray(payslip.earnings?.allowances)) {
    payslip.earnings.allowances.forEach(a => allAllowanceNames.add(a.name));
  }
  if (Array.isArray(payslip.deductions?.otherDeductions)) {
    payslip.deductions.otherDeductions.forEach(d => allDeductionNames.add(d.name));
  }

  return [buildPayslipExcelRowsNormalized(payslip, allAllowanceNames, allDeductionNames, 1)];
}

/**
 * Build payslip objects from stored payroll records (same shape as payroll Excel export).
 */
async function buildPayslipsFromStoredPayrollRecords(payrollRecords, month) {
  if (!payrollRecords || payrollRecords.length === 0) return [];
  const employeeIdList = payrollRecords.map((pr) => pr.employeeId?._id || pr.employeeId);
  const [summaries, attendanceSummaries] = await Promise.all([
    PayRegisterSummary.find({ month, employeeId: { $in: employeeIdList } }).lean(),
    MonthlyAttendanceSummary.find({ month, employeeId: { $in: employeeIdList } }).lean(),
  ]);
  const summaryMap = new Map(summaries.map((s) => [s.employeeId.toString(), s]));
  const attMap = new Map(attendanceSummaries.map((a) => [a.employeeId.toString(), a]));

  return payrollRecords.map((payrollRecord) => {
    try {
      const employee = payrollRecord.employeeId;
      const employeeIdStr = (employee?._id || employee)?.toString();
      if (!employeeIdStr) return null;

      const payRegisterSummary = summaryMap.get(employeeIdStr);
      const attendanceSummary = attMap.get(employeeIdStr);

      const departmentName = employee?.department_id?.name || 'N/A';
      const divisionName = employee?.division_id?.name || 'N/A';
      const designationName = employee?.designation_id?.name || 'N/A';

      const perDay = payrollRecord.earnings?.perDayBasicPay || 0;
      const payableShifts = payrollRecord.totalPayableShifts || 0;
      const presentDays =
        payRegisterSummary?.totals?.totalPresentDays ?? attendanceSummary?.totalPresentDays ?? null;
      const paidLeaveDays =
        payRegisterSummary?.totals?.totalPaidLeaveDays ??
        attendanceSummary?.paidLeaves ??
        attendanceSummary?.totalPaidLeaveDays ??
        null;
      const odDays =
        payRegisterSummary?.totals?.totalODDays ?? attendanceSummary?.totalODs ?? null;
      const otHours =
        payRegisterSummary?.totals?.totalOTHours ??
        attendanceSummary?.totalOTHours ??
        payrollRecord.earnings?.otHours ??
        0;
      const monthDays = payrollRecord.totalDaysInMonth;

      const incentiveDays =
        presentDays !== null && paidLeaveDays !== null
          ? Math.max(0, payableShifts - presentDays - (paidLeaveDays || 0))
          : (payrollRecord.attendance?.extraDays || 0);

      const earnedSalary =
        presentDays !== null ? perDay * presentDays : (payrollRecord.earnings?.payableAmount || 0);
      const paidLeaveSalary = paidLeaveDays !== null ? perDay * paidLeaveDays : 0;
      const odSalary = 0;
      const incentive = incentiveDays !== null ? perDay * incentiveDays : (payrollRecord.earnings?.incentive || 0);

      const totalAllowances = payrollRecord.earnings?.totalAllowances || 0;
      const otPay = payrollRecord.earnings?.otPay || 0;

      const paidDays = payrollRecord.attendance?.paidDays || (
        (presentDays || 0) +
        (payRegisterSummary?.totals?.totalWeeklyOffs || 0) +
        (payRegisterSummary?.totals?.totalHolidays || 0) +
        (paidLeaveDays || 0)
      );
      const attendanceDeductionDays = (payrollRecord.deductions?.attendanceDeductionBreakdown?.daysDeducted ?? 0);
      const finalPaidDays = Math.max(0, paidDays - attendanceDeductionDays);

      return {
        month: payrollRecord.monthName,
        monthNumber: payrollRecord.monthNumber,
        year: payrollRecord.year,
        employee: {
          emp_no: payrollRecord.emp_no,
          name: employee?.employee_name || 'N/A',
          department: departmentName,
          division: divisionName,
          designation: designationName,
          location: employee?.location || '',
          bank_account_no: employee?.bank_account_no || '',
          bank_name: employee?.bank_name || '',
          bank_place: employee?.bank_place || '',
          ifsc_code: employee?.ifsc_code || '',
          payment_mode: employee?.salary_mode || '',
          date_of_joining: employee?.doj || '',
          pf_number: employee?.pf_number || '',
          esi_number: employee?.esi_number || '',
          leftDate: employee?.leftDate,
        },
        attendance: {
          totalDaysInMonth: payrollRecord.attendance?.totalDaysInMonth || monthDays,
          presentDays: payrollRecord.attendance?.presentDays || presentDays,
          paidLeaveDays: payrollRecord.attendance?.paidLeaveDays || paidLeaveDays,
          odDays: payrollRecord.attendance?.odDays || odDays,
          weeklyOffs: payrollRecord.attendance?.weeklyOffs || 0,
          holidays: payrollRecord.attendance?.holidays || 0,
          absentDays: payrollRecord.attendance?.absentDays || 0,
          payableShifts: payrollRecord.attendance?.payableShifts || payableShifts,
          extraDays: payrollRecord.attendance?.extraDays || 0,
          totalPaidDays: payrollRecord.attendance?.totalPaidDays || 0,
          attendanceDeductionDays,
          finalPaidDays,
          otHours: payrollRecord.attendance?.otHours || otHours,
          otDays: payrollRecord.attendance?.otDays || 0,
          earnedSalary: payrollRecord.attendance?.earnedSalary || earnedSalary,
          lopDays: payRegisterSummary?.totals?.totalLopDays || 0,
          elUsedInPayroll: payrollRecord.elUsedInPayroll ?? 0,
        },
        earnings: {
          ...payrollRecord.earnings,
          earnedSalary,
          paidLeaveSalary,
          odSalary,
          incentive,
          otPay,
          totalAllowances,
          grossSalary: (earnedSalary + paidLeaveSalary + odSalary + incentive + otPay + totalAllowances),
        },
        deductions: payrollRecord.deductions || {},
        loanAdvance: payrollRecord.loanAdvance || {},
        arrears: {
          arrearsAmount: payrollRecord.arrearsAmount || 0,
          arrearsSettlements: payrollRecord.arrearsSettlements || [],
        },
        manualDeductions: { manualDeductionsAmount: payrollRecord.manualDeductionsAmount || 0 },
        manualDeductionsAmount: payrollRecord.manualDeductionsAmount || 0,
        netSalary: payrollRecord.netSalary,
        roundOff: payrollRecord.roundOff || 0,
        paidDays,
        attendanceDeductionDays,
        finalPaidDays,
        status: payrollRecord.status,
      };
    } catch (err) {
      console.error(`Error processing payslip for export (Emp: ${payrollRecord.emp_no}):`, err);
      return null;
    }
  }).filter(Boolean);
}

// OLD FUNCTION (kept for reference, not used)
function buildPayslipExcelRowsOld(payslip) {
  // Build row with dynamic allowances and deductions
  const row = {
    // Employee Information
    'S.No': '', // Will be added during loop
    'Employee Code': payslip.employee.emp_no || '',
    'Name': payslip.employee.name || '',
    'Designation': payslip.employee.designation || '',
    'Department': payslip.employee.department || '',
    'Division': '', // Add if available in future

    // Basic Salary
    'BASIC': payslip.earnings.basicPay || 0,
  };

  // ===== DYNAMIC ALLOWANCES (Gross) =====
  // Add each allowance as a separate column (e.g., "DA", "HRA", "CONV", etc.)
  if (Array.isArray(payslip.earnings.allowances)) {
    payslip.earnings.allowances.forEach(allowance => {
      const columnName = allowance.name || 'Unknown Allowance';
      row[columnName] = allowance.amount || 0;
    });
  }

  // Total Gross Salary
  row['TOTAL GROSS SALARY'] = payslip.earnings.grossSalary || 0;

  // ===== ATTENDANCE BREAKDOWN =====
  row['Month Days'] = payslip.attendance?.monthDays || payslip.attendance?.totalDaysInMonth || 0;
  row['Present Days'] = payslip.attendance?.presentDays || 0;
  row['Week Offs'] = payslip.attendance?.weeklyOffs || 0;
  row['Paid Leaves'] = payslip.attendance?.paidLeaveDays || 0;
  row['OD Days'] = payslip.attendance?.odDays || 0;
  row['Absents'] = payslip.attendance?.absentDays || 0;
  row['LOP\'s'] = 0; // Loss of Pay - can be calculated if needed
  row['Payable Shifts'] = payslip.attendance?.payableShifts || 0;
  row['Extra Days'] = payslip.attendance?.extraDays || 0;
  row['Total Paid Days'] = payslip.attendance?.totalPaidDays || 0;
  row['Attendance Deduction Days'] = payslip.attendanceDeductionDays ?? payslip.attendance?.attendanceDeductionDays ?? 0;
  row['Final Paid Days'] = payslip.finalPaidDays ?? payslip.attendance?.finalPaidDays ?? Math.max(0, (payslip.attendance?.totalPaidDays || 0) - (row['Attendance Deduction Days'] || 0));

  // ===== NET EARNINGS (Based on Attendance) =====
  row['Net Basic'] = payslip.attendance?.earnedSalary || payslip.earnings.earnedSalary || 0;

  // Add Net Allowances (same as gross allowances in most cases, but can be prorated)
  if (Array.isArray(payslip.earnings.allowances)) {
    payslip.earnings.allowances.forEach(allowance => {
      const netColumnName = `Net ${allowance.name}`;
      row[netColumnName] = allowance.amount || 0;
    });
  }

  row['Total Earnings'] = (payslip.attendance?.earnedSalary || 0) + (payslip.earnings.totalAllowances || 0);

  // ===== DYNAMIC DEDUCTIONS =====
  // Add each deduction as a separate column (e.g., "PF", "ESI", "Prof.Tax", etc.)
  if (Array.isArray(payslip.deductions?.otherDeductions)) {
    payslip.deductions.otherDeductions.forEach(deduction => {
      const columnName = deduction.name || 'Unknown Deduction';
      row[columnName] = deduction.amount || 0;
    });
  }

  // Other standard deductions
  row['Fines'] = 0; // Add if available
  row['Salary Advance'] = payslip.loanAdvance?.advanceDeduction || 0;
  row['Total Deductions'] = payslip.deductions?.totalDeductions || 0;

  // ===== OT & INCENTIVES =====
  row['OT Days'] = payslip.attendance?.otDays || 0;
  row['OT Hours'] = payslip.attendance?.otHours || 0;
  row['OT Amount'] = payslip.earnings?.otPay || 0;
  row['Incentives'] = payslip.earnings?.incentive || 0;
  row['Other Amount'] = 0; // Add if available
  row['Total Other Earnings'] = (payslip.earnings?.otPay || 0) + (payslip.earnings?.incentive || 0);

  // ===== ARREARS =====
  row['Arrears'] = payslip.arrears?.arrearsAmount || 0;

  row['Manual Deduction'] =
    payslip.manualDeductions?.manualDeductionsAmount ?? payslip.manualDeductionsAmount ?? 0;

  // ===== FINAL SALARY =====
  row['NET SALARY'] = payslip.netSalary || 0;
  row['Round Off'] = 0; // Add rounding logic if needed
  row['FINAL SALARY'] = Math.round(payslip.netSalary || 0);

  return [row];
}

exports.calculatePayroll = async (req, res) => {
  try {
    const { employeeId, month } = req.body;

    if (!employeeId || !month) {
      return res.status(400).json({
        success: false,
        message: 'Employee ID and month are required',
      });
    }

    // Validate month format
    if (!/^\d{4}-\d{2}$/.test(month)) {
      return res.status(400).json({
        success: false,
        message: 'Month must be in YYYY-MM format',
      });
    }

    // Strategy: dynamic = outputColumns-driven; legacy = payregister+legacy; default = new (payregister).
    const strategy = req.query.strategy || 'new';
    const useDynamic = strategy === 'dynamic';
    const useLegacy = strategy === 'legacy';

    /** True only when regular payroll used calculatePayrollFromOutputColumns (same engine must run for 2nd salary). */
    let regularUsedDynamicOutputColumns = false;

    let result;
    if (useDynamic) {
      const config = await PayrollConfiguration.get();
      const outputColumns = Array.isArray(config?.outputColumns) ? config.outputColumns : [];
      if (outputColumns.length > 0) {
        regularUsedDynamicOutputColumns = true;
        result = await payrollCalculationFromOutputColumnsService.calculatePayrollFromOutputColumns(
          employeeId,
          month,
          req.user._id,
          { source: 'payregister', arrearsSettlements: req.body.arrears || [], deductionSettlements: req.body.deductions || [] }
        );
        result = { payrollRecord: result.payrollRecord, batchId: result.batchId, payslip: result.payslip };
      } else {
        const options = { source: 'payregister', arrearsSettlements: req.body.arrears || [], deductionSettlements: req.body.deductions || [] };
        result = await payrollCalculationService.calculatePayrollNew(employeeId, month, req.user._id, options);
      }
    } else {
      const options = {
        source: useLegacy ? 'all' : 'payregister',
        arrearsSettlements: req.body.arrears || [],
        deductionSettlements: req.body.deductions || [],
      };
      result = await payrollCalculationService.calculatePayrollNew(employeeId, month, req.user._id, options);
    }

    let secondSalaryPayRegister = null;
    try {
      const { isSuperAdmin } = require('../../employees/utils/employeeFeatureAccess');
      const secondOn = await isSecondSalaryGloballyEnabled();
      const emp = secondOn && isSuperAdmin(req.user) ? await Employee.findById(employeeId).select('second_salary') : null;
      if (emp && Number(emp.second_salary) > 0) {
        const { calculateSecondSalaryForPayRegister } = require('../services/secondSalaryCalculationService');
        const SecondSalaryBatchService = require('../services/secondSalaryBatchService');
        const sec = await calculateSecondSalaryForPayRegister(
          employeeId,
          month,
          req.user._id,
          strategy,
          null,
          {
            arrearsSettlements: req.body.arrears || [],
            deductionSettlements: req.body.deductions || [],
          },
          { regularUsedDynamicOutputColumns }
        );
        secondSalaryPayRegister = sec;
        const bid = sec?.batchId;
        if (bid) await SecondSalaryBatchService.recalculateBatchTotals(bid.toString());
      }
    } catch (e2) {
      console.error('[calculatePayroll] Second salary follow-up failed:', e2.message);
    }

    // If export is requested, return Excel immediately
    if (req.query.export === 'excel') {
      const { payslip } = await buildPayslipData(employeeId, month);
      const rows = buildPayslipExcelRows(payslip);
      const wb = XLSX.utils.book_new();
      const ws = XLSX.utils.json_to_sheet(rows);
      XLSX.utils.book_append_sheet(wb, ws, 'Payslip');
      const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

      const filename = `payslip_${payslip.employee.emp_no || employeeId}_${month}.xlsx`;
      res.setHeader(
        'Content-Type',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      );
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      return res.send(buf);
    }

    // Convert mongoose ref to object if needed to merge properties
    const responseData = result.payrollRecord
      ? (result.payrollRecord.toObject ? result.payrollRecord.toObject() : result.payrollRecord)
      : {};

    if (result.batchId) {
      responseData.batchId = result.batchId;
      responseData.payrollBatchId = result.batchId; // Also set standard field
    }

    responseData.regularPayrollEngine = regularUsedDynamicOutputColumns ? 'dynamic_output_columns' : 'payroll_new';

    if (secondSalaryPayRegister) {
      const sec = secondSalaryPayRegister;
      const secRec = sec.secondSalaryRecord;
      const secPlain = secRec && secRec.toObject ? secRec.toObject() : secRec;
      responseData.secondSalary = {
        engine: sec.engine,
        batchId: sec.batchId || null,
        secondSalaryBatchId: sec.batchId || null,
        secondSalaryRecordId: sec.secondSalaryRecordId || secPlain?._id || null,
        netSalary: sec.netSalary ?? secPlain?.netSalary,
        record: secPlain,
      };
    }

    res.status(200).json({
      success: true,
      message: 'Payroll calculated successfully',
      data: responseData,
    });
  } catch (error) {
    console.error('Error calculating payroll:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Error calculating payroll',
      error: error.message,
      code: error.code,
      batchId: error.batchId
    });
  }
};

/**
 * @desc    Export payroll payslips to Excel for the selected employees/month
 * @route   GET /api/payroll/export
 * @access  Private (Super Admin, Sub Admin, HR)
 */
exports.exportPayrollExcel = async (req, res) => {
  try {
    const { month, departmentId, divisionId, status, search, employeeIds, strategy, designationId, employee_group_id } =
      req.query;
    const desFilt = designationId && designationId !== 'all' ? String(designationId) : undefined;
    const groupFilt = employee_group_id && employee_group_id !== 'all' ? String(employee_group_id) : undefined;

    if (!month || !/^\d{4}-\d{2}$/.test(month)) {
      return res.status(400).json({
        success: false,
        message: 'Month (YYYY-MM) is required',
      });
    }

    let targetEmployeeIds = [];
    if (employeeIds) {
      targetEmployeeIds = String(employeeIds)
        .split(',')
        .map((id) => id.trim())
        .filter(Boolean);
    } else {
      const { buildPaysheetEmployeeFilter } = require('../services/payrollEmployeeQueryHelper');
      const { getPayrollDateRange } = require('../../shared/utils/dateUtils');
      const [y, m] = month.split('-').map(Number);
      const { startDate: startStr, endDate: endStr } = await getPayrollDateRange(y, m);
      const rangeStart = new Date(`${startStr}T00:00:00.000Z`);
      const rangeEnd = new Date(`${endStr}T23:59:59.999Z`);
      const scope =
        req.scopeFilter && typeof req.scopeFilter === 'object' && Object.keys(req.scopeFilter).length > 0
          ? req.scopeFilter
          : null;
      const divF = divisionId && divisionId !== 'all' ? divisionId : undefined;
      const depF = departmentId && departmentId !== 'all' ? departmentId : undefined;
      const employeeQuery = await buildPaysheetEmployeeFilter(scope, divF, depF, rangeStart, rangeEnd, {
        status: status || undefined,
        search: search || undefined,
        designationId: desFilt,
        employeeGroupId: groupFilt,
      });
      const emps = await Employee.find(employeeQuery).select('_id');
      targetEmployeeIds = emps.map((e) => e._id.toString());
    }

    const config = await PayrollConfiguration.get();
    const useDynamicExport = String(strategy || '').toLowerCase() === 'dynamic';
    const rawColumns = Array.isArray(config?.outputColumns) ? config.outputColumns : [];
    const hasOutputColumns = rawColumns.length > 0;

    // When strategy=dynamic and we have output columns, use the same data source as the paysheet:
    // Priority: 1) Fetch stored PayrollRecords first  2) Calculate only missing ones via dynamic engine
    if (useDynamicExport && hasOutputColumns) {
      if (targetEmployeeIds.length === 0) {
        return res.status(404).json({
          success: false,
          message: 'No employees in scope. Apply filters or select employees to export.',
        });
      }

      // Step 1: Try to fetch existing PayrollRecords first
      const { getPayrollDateRange } = require('../../shared/utils/dateUtils');
      const { filterPayrollRecordsByPayPeriodScope } = require('../services/payrollEmployeeQueryHelper');
      const [yExp, mExp] = month.split('-').map(Number);
      const { startDate: expStartStr, endDate: expEndStr } = await getPayrollDateRange(yExp, mExp);
      const expRangeStart = new Date(`${expStartStr}T00:00:00.000Z`);
      const expRangeEnd = new Date(`${expEndStr}T23:59:59.999Z`);

      const storedQuery = { month, employeeId: { $in: targetEmployeeIds } };
      let storedRecords = await PayrollRecord.find(storedQuery)
        .populate({
          path: 'employeeId',
          select:
            'employee_name emp_no department_id division_id designation_id gross_salary location bank_account_no bank_name bank_place ifsc_code salary_mode doj pf_number esi_number leftDate',
          populate: [
            { path: 'department_id', select: 'name' },
            { path: 'division_id', select: 'name' },
            { path: 'designation_id', select: 'name' },
          ],
        })
        .lean();
      storedRecords = filterPayrollRecordsByPayPeriodScope(storedRecords, expRangeStart, expRangeEnd);

      // Extract which employees already have stored payslips
      const storedEmpIds = new Set(storedRecords.map(r => r.employeeId._id.toString()));
      const missingEmpIds = targetEmployeeIds.filter(id => !storedEmpIds.has(id.toString()));

      // Convert stored records to payslips
      const payslips = await buildPayslipsFromStoredPayrollRecords(storedRecords, month);

      // Step 2: For missing employees, try to calculate via dynamic engine
      if (missingEmpIds.length > 0) {
        console.log(`Found ${storedRecords.length} stored payslips, calculating ${missingEmpIds.length} missing employees`);
        const userId = req.user?._id?.toString() || req.user?.id;

        for (const empId of missingEmpIds) {
          try {
            let arrearsSettlements = [];
            let deductionSettlements = [];
            try {
              const pendingArrears = await ArrearsPayrollIntegrationService.getPendingArrearsForPayroll(empId);
              if (pendingArrears && pendingArrears.length > 0) {
                arrearsSettlements = pendingArrears.map((ar) => ({ arrearId: ar.id, amount: ar.remainingAmount || 0 }));
              }
              const pendingDeductions = await DeductionPayrollIntegrationService.getPendingDeductionsForPayroll(empId);
              if (pendingDeductions && pendingDeductions.length > 0) {
                deductionSettlements = pendingDeductions.map((d) => ({ deductionId: d.id, amount: d.remainingAmount || 0 }));
              }
            } catch (fetchErr) {
              console.error(`Error fetching arrears/deductions for export (employee ${empId}):`, fetchErr.message);
            }

            const result = await payrollCalculationFromOutputColumnsService.calculatePayrollFromOutputColumns(
              empId,
              month,
              userId,
              { source: 'payregister', arrearsSettlements, deductionSettlements }
            );
            if (result?.payslip) {
              const slip = result.payslip;
              payslips.push(slip && typeof slip.toObject === 'function' ? slip.toObject() : slip);
            }
          } catch (err) {
            console.error(`Error calculating payroll for export (employee ${empId}):`, err.message);
          }
        }
      }

      if (payslips.length === 0) {
        return res.status(404).json({
          success: false,
          message: 'No payslip data available to export. Ensure pay register is filled and try again.',
        });
      }
      const allAllowanceNames = new Set();
      const allDeductionNames = new Set();
      const allStatutoryCodes = new Set();
      payslips.forEach((p) => {
        (p.earnings?.allowances || []).forEach((a) => { if (a && a.name) allAllowanceNames.add(a.name); });
        (p.deductions?.otherDeductions || []).forEach((d) => { if (d && d.name) allDeductionNames.add(d.name); });
        (p.deductions?.statutoryDeductions || []).forEach((s) => {
          if (s && (s.code || s.name)) allStatutoryCodes.add(String(s.code || s.name).trim());
        });
      });
      const outputColumns = rawColumns.map((c, i) => {
        const doc = c && typeof c.toObject === 'function' ? c.toObject() : (c && typeof c === 'object' ? { ...c } : {});
        return {
          header: doc.header != null && String(doc.header).trim() ? String(doc.header).trim() : `Column ${i}`,
          source: doc.source === 'formula' ? 'formula' : 'field',
          field: doc.field != null ? String(doc.field) : '',
          formula: doc.formula != null ? String(doc.formula) : '',
          order: typeof doc.order === 'number' ? doc.order : i,
        };
      });
      const expandedColumns = outputColumnService.expandOutputColumnsWithBreakdown(
        outputColumns,
        allAllowanceNames,
        allDeductionNames,
        allStatutoryCodes
      );
      const rows = payslips.map((payslip, index) => {
        const rowData = outputColumnService.buildRowFromOutputColumns(payslip, expandedColumns, index + 1);
        return { 'S.No': index + 1, ...rowData };
      });
      const wb = XLSX.utils.book_new();
      const ws = XLSX.utils.json_to_sheet(rows);
      XLSX.utils.book_append_sheet(wb, ws, 'Payslips');
      const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
      const filename = `payslips_${month}${departmentId ? `_dept_${departmentId}` : ''}.xlsx`;
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      return res.send(buf);
    }

    const query = { month };
    if (targetEmployeeIds.length > 0) {
      query.employeeId = { $in: targetEmployeeIds };
    }

    let payrollRecords = await PayrollRecord.find(query)
      .populate({
        path: 'employeeId',
        select:
          'employee_name emp_no department_id division_id designation_id gross_salary location bank_account_no bank_name bank_place ifsc_code salary_mode doj pf_number esi_number leftDate',
        populate: [
          { path: 'department_id', select: 'name' },
          { path: 'division_id', select: 'name' },
          { path: 'designation_id', select: 'name' },
        ],
      })
      .lean();

    const { getPayrollDateRange } = require('../../shared/utils/dateUtils');
    const { filterPayrollRecordsByPayPeriodScope } = require('../services/payrollEmployeeQueryHelper');
    const [yLeg, mLeg] = month.split('-').map(Number);
    const { startDate: legStartStr, endDate: legEndStr } = await getPayrollDateRange(yLeg, mLeg);
    const legRangeStart = new Date(`${legStartStr}T00:00:00.000Z`);
    const legRangeEnd = new Date(`${legEndStr}T23:59:59.999Z`);
    payrollRecords = filterPayrollRecordsByPayPeriodScope(payrollRecords, legRangeStart, legRangeEnd);

    if (!payrollRecords || payrollRecords.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'No payroll records found for export. Please calculate payroll first.',
      });
    }

    const payslips = await buildPayslipsFromStoredPayrollRecords(payrollRecords, month);

    if (payslips.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'No payslip data available to export. (Internal generation failure)',
      });
    }

    // Step 2: Collect ALL unique allowances, deductions, and statutory codes across all employees
    const allAllowanceNames = new Set();
    const allDeductionNames = new Set();
    const allStatutoryCodes = new Set();

    payslips.forEach(payslip => {
      if (Array.isArray(payslip.earnings?.allowances)) {
        payslip.earnings.allowances.forEach(allowance => {
          if (allowance.name) allAllowanceNames.add(allowance.name);
        });
      }
      if (Array.isArray(payslip.deductions?.otherDeductions)) {
        payslip.deductions.otherDeductions.forEach(deduction => {
          if (deduction.name) allDeductionNames.add(deduction.name);
        });
      }
      if (Array.isArray(payslip.deductions?.statutoryDeductions)) {
        payslip.deductions.statutoryDeductions.forEach(s => {
          if (s && (s.code || s.name)) allStatutoryCodes.add(String(s.code || s.name).trim());
        });
      }
    });

    console.log(`\n📊 Excel Export: Found ${allAllowanceNames.size} unique allowances, ${allDeductionNames.size} deductions, ${allStatutoryCodes.size} statutory for ${payslips.length} employees`);
    console.log(`Allowances: ${Array.from(allAllowanceNames).join(', ')}`);
    console.log(`Deductions: ${Array.from(allDeductionNames).join(', ')}`);
    console.log(`Statutory: ${Array.from(allStatutoryCodes).join(', ')}\n`);

    // Step 3: Build rows – when caller sends strategy=dynamic, export using dynamic output columns
    //         (from PayrollConfiguration.outputColumns) with breakdown columns before each cumulative.
    // config, useDynamicExport, hasOutputColumns already declared above (dynamic path returns early).
    let rows;
    if (useDynamicExport && hasOutputColumns) {
      const expandedColumns = outputColumnService.expandOutputColumnsWithBreakdown(
        config.outputColumns,
        allAllowanceNames,
        allDeductionNames,
        allStatutoryCodes
      );
      rows = payslips.map((payslip, index) =>
        outputColumnService.buildRowFromOutputColumns(payslip, expandedColumns, index + 1)
      );
    } else {
      rows = payslips.map((payslip, index) =>
        buildPayslipExcelRowsNormalized(payslip, allAllowanceNames, allDeductionNames, index + 1)
      );
    }

    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(rows);
    XLSX.utils.book_append_sheet(wb, ws, 'Payslips');
    const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

    const filename = `payslips_${month}${departmentId ? `_dept_${departmentId}` : ''}.xlsx`;
    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    );
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    return res.send(buf);
  } catch (error) {
    console.error('Error exporting payroll:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Error exporting payroll',
      error: error.message,
    });
  }
};

/**
 * Build payslip-shaped object from a PayrollRecord (with populated employeeId) for outputColumnService.
 * Same shape as export bundle (paysheetBundleExport.payrollRecordToPayslipShape) so paysheet and bundle stay aligned.
 */
function recordToPayslip(record) {
  return payrollRecordToPayslipShape(record);
}

/** Hidden row metadata for exports (deductions PDF, bundle) when column headers vary. */
function attachPaysheetRowEmployeeMeta(row, record) {
  if (!row || !record) return row;
  const emp = record.employeeId || {};
  const empNo = String(record.emp_no || emp.emp_no || '').trim();
  const division =
    (emp.division_id && typeof emp.division_id === 'object' ? emp.division_id.name : null) ||
    record.division_id?.name ||
    '';
  const department =
    (emp.department_id && typeof emp.department_id === 'object' ? emp.department_id.name : null) ||
    '';
  const group =
    emp.employee_group_id && typeof emp.employee_group_id === 'object' ? emp.employee_group_id.name : '';

  if (empNo) row._exportEmpNo = empNo;
  if (division) row._exportDivision = String(division).trim();
  if (department) row._exportDepartment = String(department).trim();
  if (group) row._employeeGroup = String(group).trim();
  return row;
}

/**
 * @desc    Default paysheet month (YYYY-MM): previous payroll period vs the cycle containing today (IST + payroll cycle settings).
 * @route   GET /api/payroll/paysheet/default-month
 * @access  Private
 */
exports.getPaysheetDefaultMonth = async (req, res) => {
  try {
    const { getDefaultPaysheetMonthKey } = require('../../shared/utils/dateUtils');
    const { month, containingMonth } = await getDefaultPaysheetMonthKey();
    return res.status(200).json({
      success: true,
      data: { month, containingMonth },
    });
  } catch (error) {
    console.error('[getPaysheetDefaultMonth]', error);
    return res.status(500).json({
      success: false,
      message: error.message || 'Failed to resolve default paysheet month',
    });
  }
};

/**
 * @desc    Get paysheet data (headers + rows) for table display – uses same output columns as Excel export.
 *          source=existing: return existing PayrollRecords for the month (no calculation). Filters applied on data.
 *          No source or source=calculate: run dynamic/legacy calculation for scope and return fresh data.
 * @route   GET /api/payroll/paysheet
 * @query   month (YYYY-MM), departmentId?, divisionId?, designationId?, employee_group_id?, status?, search?, employeeIds?, source? (existing | calculate), secondSalary? (1|true)
 * @access  Private
 */
exports.getPaysheetData = async (req, res) => {
  try {
    const { month, departmentId, divisionId, status, search, employeeIds, source, designationId, employee_group_id } = req.query;
    const secondSalary = ['1', 'true', 'yes'].includes(String(req.query.secondSalary || '').toLowerCase());
    const desFilt = designationId && designationId !== 'all' ? String(designationId) : undefined;
    const groupFilt = employee_group_id && employee_group_id !== 'all' ? String(employee_group_id) : undefined;

    if (!month || !/^\d{4}-\d{2}$/.test(month)) {
      return res.status(400).json({
        success: false,
        message: 'Month (YYYY-MM) is required',
      });
    }

    if (secondSalary && !(await isSecondSalaryGloballyEnabled())) {
      return res.status(403).json({
        success: false,
        message: 'Second salary is disabled in Payroll settings.',
        code: 'SECOND_SALARY_DISABLED',
      });
    }

    if (secondSalary) {
      let targetEmployeeIds = [];
      if (employeeIds) {
        targetEmployeeIds = String(employeeIds)
          .split(',')
          .map((id) => id.trim())
          .filter(Boolean);
      } else {
        const { buildPaysheetEmployeeFilter } = require('../services/payrollEmployeeQueryHelper');
        const { getPayrollDateRange } = require('../../shared/utils/dateUtils');
        const [y, m] = month.split('-').map(Number);
        const { startDate: startStr, endDate: endStr } = await getPayrollDateRange(y, m);
        const rangeStart = new Date(`${startStr}T00:00:00.000Z`);
        const rangeEnd = new Date(`${endStr}T23:59:59.999Z`);
        const scope =
          req.scopeFilter && typeof req.scopeFilter === 'object' && Object.keys(req.scopeFilter).length > 0
            ? req.scopeFilter
            : null;
        const divF = divisionId && divisionId !== 'all' ? divisionId : undefined;
        const depF = departmentId && departmentId !== 'all' ? departmentId : undefined;
        const employeeQuery = await buildPaysheetEmployeeFilter(scope, divF, depF, rangeStart, rangeEnd, {
          status: status || undefined,
          search: search || undefined,
          designationId: desFilt,
          employeeGroupId: groupFilt,
        });
        const emps = await Employee.find(employeeQuery).select('_id emp_no').lean();
        emps.sort((a, b) => compareEmpNo(a.emp_no, b.emp_no));
        targetEmployeeIds = emps.map((e) => e._id.toString());
      }

      if (targetEmployeeIds.length === 0) {
        return res.status(200).json({
          success: true,
          data: { headers: [], rows: [] },
          message: 'No employees in scope for this view.',
          source: 'existing',
          secondSalary: true,
        });
      }

      const idList = targetEmployeeIds
        .map((id) => {
          try {
            return new mongoose.Types.ObjectId(id);
          } catch {
            return null;
          }
        })
        .filter(Boolean);

      const records = await SecondSalaryRecord.find({
        month,
        employeeId: { $in: idList },
      })
        .populate({
          path: 'employeeId',
          select:
            'employee_name first_name last_name emp_no department_id division_id designation_id employee_group_id gross_salary second_salary salaries location bank_account_no bank_name bank_place ifsc_code salary_mode doj pf_number esi_number leftDate applyPF applyESI applyProfessionTax',
          populate: [
            { path: 'department_id', select: 'name' },
            { path: 'division_id', select: 'name' },
            { path: 'designation_id', select: 'name' },
            { path: 'employee_group_id', select: 'name' },
          ],
        })
        .populate('division_id', 'name')
        .sort(EMP_NO_SORT)
        .collation(EMP_NO_COLLATION)
        .lean();

      const { getPayrollDateRange } = require('../../shared/utils/dateUtils');
      const [yearNum, monthNum] = month.split('-').map(Number);
      const { startDate: rangeStartStr, endDate: rangeEndStr } = await getPayrollDateRange(yearNum, monthNum);
      const payrollRangeStart = new Date(`${rangeStartStr}T00:00:00.000Z`);
      const payrollRangeEnd = new Date(`${rangeEndStr}T23:59:59.999Z`);

      const { filterPayrollRecordsByPayPeriodScope } = require('../services/payrollEmployeeQueryHelper');
      const filtered = filterPayrollRecordsByPayPeriodScope(records, payrollRangeStart, payrollRangeEnd);

      const config2 = await PayrollConfiguration.get();
      const outputCols2nd = normalizeOutputColumns(config2?.outputColumns);

      // Prefer frozen snapshots for historical stability (if available for all rows)
      if (filtered.length > 0) {
        try {
          const empIds = filtered.map((r) => (r.employeeId?._id || r.employeeId)?.toString()).filter(Boolean);
          const snaps = await PayrollPayslipSnapshot.find({ month, kind: 'second_salary', employeeId: { $in: empIds } }).lean();
          const snapMap = new Map(snaps.map((s) => [String(s.employeeId), s]));
          const allPresent = empIds.length > 0 && empIds.every((id) => snapMap.has(String(id)));
          if (allPresent) {
            const sample = snapMap.get(String(empIds[0]));
            const hdrs = Array.isArray(sample?.headers) ? sample.headers : [];
            const payslipsSnap = filtered.map((r) => secondSalaryRecordToPayslipShape(r));
            let rowsSnap = filtered.map((r, index) => {
              const id = String(r.employeeId?._id || r.employeeId);
              const row = { 'S.No': index + 1, ...(snapMap.get(id)?.row || {}) };
              return attachPaysheetRowEmployeeMeta(row, r);
            });
            rowsSnap = refreshEmployeeFieldColumnsOnRows(rowsSnap, payslipsSnap, outputCols2nd);
            return res.status(200).json({
              success: true,
              data: { headers: ['S.No', ...hdrs], rows: rowsSnap },
              source: 'existing',
              secondSalary: true,
              snapshot: true,
            });
          }
        } catch (e) {
          console.warn('[getPaysheetData] snapshot read (2nd salary) failed:', e.message);
        }
      }
      const statutoryCodesForSheet = await getStatutoryCodesForPaysheetExpansion();

      let headers;
      let rows;
      if (outputCols2nd.length > 0 && filtered.length > 0) {
        const built = buildSecondSalaryPaysheetFromOutputColumns(filtered, outputCols2nd, statutoryCodesForSheet);
        if (built.rows.length > 0) {
          headers = built.headers;
          rows = built.rows;
        }
      }
      if (!rows) {
        const built = buildSecondSalaryPaysheetData(filtered);
        headers = built.headers;
        rows = built.rows;
      }

      if (rows.length === 0) {
        return res.status(200).json({
          success: true,
          data: { headers: [], rows: [] },
          message:
            'No 2nd salary records for this month. Run a cycle from 2nd Salary Payments, then refresh.',
          source: 'existing',
          secondSalary: true,
        });
      }
      return res.status(200).json({
        success: true,
        data: { headers, rows },
        source: 'existing',
        secondSalary: true,
      });
    }

    const config = await PayrollConfiguration.get();
    const rawColumns = Array.isArray(config?.outputColumns) ? config.outputColumns : [];
    const outputColumns = rawColumns.map((c, i) => {
      const doc = c && typeof c.toObject === 'function' ? c.toObject() : (c && typeof c === 'object' ? { ...c } : {});
      return {
        header: doc.header != null && String(doc.header).trim() ? String(doc.header).trim() : `Column ${i}`,
        source: doc.source === 'formula' ? 'formula' : 'field',
        field: doc.field != null ? String(doc.field) : '',
        formula: doc.formula != null ? String(doc.formula) : '',
        order: typeof doc.order === 'number' ? doc.order : i,
      };
    });

    const useExisting = String(source || '').toLowerCase() === 'existing';

    if (useExisting && outputColumns.length > 0) {
      // Return existing PayrollRecords only – no calculation. Filters applied on records.
      // Respect resignation: same as pay register – active, left in period, or leaving after period end.
      const { getPayrollDateRange } = require('../../shared/utils/dateUtils');
      const [yearNum, monthNum] = month.split('-').map(Number);
      const { startDate: rangeStartStr, endDate: rangeEndStr } = await getPayrollDateRange(yearNum, monthNum);
      const payrollRangeStart = new Date(rangeStartStr + 'T00:00:00.000Z');
      const payrollRangeEnd = new Date(rangeEndStr + 'T23:59:59.999Z');

      const { buildPaysheetEmployeeFilter } = require('../services/payrollEmployeeQueryHelper');
      const scope =
        req.scopeFilter && typeof req.scopeFilter === 'object' && Object.keys(req.scopeFilter).length > 0
          ? req.scopeFilter
          : null;
      const divF = divisionId && divisionId !== 'all' ? divisionId : undefined;
      const depF = departmentId && departmentId !== 'all' ? departmentId : undefined;
      const empMatch = await buildPaysheetEmployeeFilter(scope, divF, depF, payrollRangeStart, payrollRangeEnd, {
        status: status || undefined,
        search: search || undefined,
        designationId: desFilt,
        employeeGroupId: groupFilt,
      });
      const inScopeEmps = await Employee.find(empMatch).select('_id').lean();
      const inScopeIds = inScopeEmps.map((e) => e._id);

      if (inScopeIds.length === 0) {
        return res.status(200).json({
          success: true,
          data: { headers: ['S.No', ...outputColumns.map((c) => c.header || 'Column')], rows: [] },
          message: 'No employees match filters for this month.',
          source: 'existing',
        });
      }

      const records = await PayrollRecord.find({ month, employeeId: { $in: inScopeIds } })
        .populate({
          path: 'employeeId',
          select:
            'employee_name first_name last_name emp_no department_id division_id designation_id employee_group_id location bank_account_no bank_name bank_place ifsc_code salary_mode doj pf_number esi_number leftDate salaries',
          populate: [
            { path: 'department_id', select: 'name' },
            { path: 'division_id', select: 'name' },
            { path: 'designation_id', select: 'name' },
            { path: 'employee_group_id', select: 'name' },
          ],
        })
        .sort(EMP_NO_SORT)
        .collation(EMP_NO_COLLATION)
        .lean();

      const { filterPayrollRecordsByPayPeriodScope } = require('../services/payrollEmployeeQueryHelper');
      let filtered = filterPayrollRecordsByPayPeriodScope(records, payrollRangeStart, payrollRangeEnd);

      // Prefer frozen snapshots for historical stability (if available for all rows)
      if (filtered.length > 0) {
        try {
          const orderedEmpIds = filtered.map((r) => (r.employeeId?._id || r.employeeId)?.toString()).filter(Boolean);
          const paysheetAdjustmentsActive = await PaysheetAdjustmentRequest.exists({
            month,
            status: { $in: ['pending', 'approved'] },
          });
          const snaps = await PayrollPayslipSnapshot.find({ month, kind: 'regular', employeeId: { $in: orderedEmpIds } }).lean();
          const snapMap = new Map(snaps.map((s) => [String(s.employeeId), s]));
          const allPresent = orderedEmpIds.length > 0 && orderedEmpIds.every((id) => snapMap.has(String(id)));
          if (allPresent && !paysheetAdjustmentsActive) {
            const sample = snapMap.get(String(orderedEmpIds[0]));
            const hdrs = Array.isArray(sample?.headers) ? sample.headers : [];
            const payslipsSnap = filtered.map((r) => recordToPayslip(r));
            let rowsSnap = filtered.map((r, index) => {
              const id = String(r.employeeId?._id || r.employeeId);
              const row = { 'S.No': index + 1, ...(snapMap.get(id)?.row || {}) };
              return attachPaysheetRowEmployeeMeta(row, r);
            });
            rowsSnap = refreshEmployeeFieldColumnsOnRows(rowsSnap, payslipsSnap, outputColumns);
            const snapAdj = await attachPaysheetAdjustmentMeta(rowsSnap, filtered, month);
            return res.status(200).json({
              success: true,
              data: {
                headers: ['S.No', ...hdrs],
                rows: snapAdj.rows,
                paysheetModification: snapAdj.paysheetModification,
              },
              message: rowsSnap.length === 0 ? 'No existing payroll records for this month. Use "Load paysheet" to calculate.' : undefined,
              source: 'existing',
              snapshot: true,
            });
          }
        } catch (e) {
          console.warn('[getPaysheetData] snapshot read (regular) failed:', e.message);
        }
      }

      const payslips = filtered.map((r) => recordToPayslip(r));
      if (payslips.length === 0) {
        return res.status(200).json({
          success: true,
          data: { headers: ['S.No', ...outputColumns.map((c) => c.header || 'Column')], rows: [] },
          message: 'No existing payroll records for this month. Use "Load paysheet" to calculate.',
        });
      }

      await enrichPayslipsLoanRemainingBalance(payslips, filtered);

      const allAllowanceNames = new Set();
      const allDeductionNames = new Set();
      const allStatutoryCodes = new Set();
      payslips.forEach((p) => {
        (p.earnings?.allowances || []).forEach((a) => { if (a && a.name) allAllowanceNames.add(a.name); });
        (p.deductions?.otherDeductions || []).forEach((d) => { if (d && d.name) allDeductionNames.add(d.name); });
        (p.deductions?.statutoryDeductions || []).forEach((s) => {
          if (s && (s.code || s.name)) allStatutoryCodes.add(String(s.code || s.name).trim());
        });
      });
      const expandedColumns = outputColumnService.expandOutputColumnsWithBreakdown(
        outputColumns,
        allAllowanceNames,
        allDeductionNames,
        allStatutoryCodes
      );
      let rows = payslips.map((payslip, index) => {
        const rowData = outputColumnService.buildRowFromOutputColumns(payslip, expandedColumns, index + 1);
        const row = { 'S.No': index + 1, ...rowData };
        attachPaysheetRowEmployeeMeta(row, filtered[index]);
        if (payslip.employee?.leftDate) row._leftDate = payslip.employee.leftDate;
        return row;
      });
      const adjMeta = await attachPaysheetAdjustmentMeta(rows, filtered, month, expandedColumns);
      rows = adjMeta.rows;
      const displayKeys = rows.length > 0
        ? Object.keys(rows[0]).filter((k) => !k.startsWith('_'))
        : [];
      const headers = rows.length > 0
        ? ['S.No', ...displayKeys.filter((k) => k !== 'S.No')]
        : ['S.No', ...expandedColumns.map((c) => c.header || 'Column')];

      return res.status(200).json({
        success: true,
        data: { headers, rows, paysheetModification: adjMeta.paysheetModification },
        source: 'existing',
      });
    }

    // Calculate path: resolve employee list and run calculation
    let targetEmployeeIds = [];
    if (employeeIds) {
      targetEmployeeIds = String(employeeIds)
        .split(',')
        .map((id) => id.trim())
        .filter(Boolean);
    } else {
      const { buildPaysheetEmployeeFilter } = require('../services/payrollEmployeeQueryHelper');
      const { getPayrollDateRange } = require('../../shared/utils/dateUtils');
      const [y, m] = month.split('-').map(Number);
      const { startDate: startStr, endDate: endStr } = await getPayrollDateRange(y, m);
      const rangeStart = new Date(startStr + 'T00:00:00.000Z');
      const rangeEnd = new Date(endStr + 'T23:59:59.999Z');
      const scope =
        req.scopeFilter && typeof req.scopeFilter === 'object' && Object.keys(req.scopeFilter).length > 0
          ? req.scopeFilter
          : null;
      const divF = divisionId && divisionId !== 'all' ? divisionId : undefined;
      const depF = departmentId && departmentId !== 'all' ? departmentId : undefined;
      const employeeQuery = await buildPaysheetEmployeeFilter(scope, divF, depF, rangeStart, rangeEnd, {
        status: status || undefined,
        search: search || undefined,
        designationId: desFilt,
        employeeGroupId: groupFilt,
      });
      const emps = await Employee.find(employeeQuery).select('_id emp_no').lean();
      emps.sort((a, b) => compareEmpNo(a.emp_no, b.emp_no));
      targetEmployeeIds = emps.map((e) => e._id.toString());
    }

    if (targetEmployeeIds.length === 0) {
      return res.status(200).json({
        success: true,
        data: { headers: [], rows: [] },
        message: 'No employees in scope. Apply filters or select employees.',
      });
    }

    const userId = req.user?._id?.toString() || req.user?.id;
    let rows = [];
    let headers = [];

    if (outputColumns.length > 0) {
      const payslips = [];
      for (let index = 0; index < targetEmployeeIds.length; index++) {
        const empId = targetEmployeeIds[index];
        try {
          const result = await payrollCalculationFromOutputColumnsService.calculatePayrollFromOutputColumns(
            empId,
            month,
            userId,
            { source: 'payregister', arrearsSettlements: [] }
          );
          if (result?.payslip) {
            const slip = result.payslip;
            payslips.push(slip && typeof slip.toObject === 'function' ? slip.toObject() : slip);
          }
        } catch (err) {
          console.error(`Error calculating payroll for paysheet (employee ${empId}):`, err.message);
        }
      }
      if (payslips.length > 0) {
        const allAllowanceNames = new Set();
        const allDeductionNames = new Set();
        const allStatutoryCodes = new Set();
        payslips.forEach((p) => {
          (p.earnings?.allowances || []).forEach((a) => { if (a && a.name) allAllowanceNames.add(a.name); });
          (p.deductions?.otherDeductions || []).forEach((d) => { if (d && d.name) allDeductionNames.add(d.name); });
          (p.deductions?.statutoryDeductions || []).forEach((s) => {
            if (s && (s.code || s.name)) allStatutoryCodes.add(String(s.code || s.name).trim());
          });
        });
        const expandedColumns = outputColumnService.expandOutputColumnsWithBreakdown(
          outputColumns,
          allAllowanceNames,
          allDeductionNames,
          allStatutoryCodes
        );
        rows = payslips.map((payslip, index) => {
          const rowData = outputColumnService.buildRowFromOutputColumns(payslip, expandedColumns, index + 1);
          const row = { 'S.No': index + 1, ...rowData };
          if (payslip.employee?.leftDate) row._leftDate = payslip.employee.leftDate;
          return row;
        });
        headers = rows.length > 0
          ? ['S.No', ...Object.keys(rows[0]).filter((k) => k !== 'S.No')]
          : ['S.No', ...expandedColumns.map((c) => c.header || 'Column')];
      }
    } else {
      const payslips = [];
      for (const empId of targetEmployeeIds) {
        try {
          const result = await payrollCalculationService.calculatePayrollNew(
            empId, month, userId, { source: 'payregister', arrearsSettlements: [] }
          );
          if (result?.payslip) payslips.push(result.payslip);
        } catch (err) {
          console.error(`Error calculating payroll for paysheet (employee ${empId}):`, err.message);
        }
      }
      if (payslips.length > 0) {
        const allAllowanceNames = new Set();
        const allDeductionNames = new Set();
        payslips.forEach((p) => {
          (p.earnings?.allowances || []).forEach((a) => { if (a.name) allAllowanceNames.add(a.name); });
          (p.deductions?.otherDeductions || []).forEach((d) => { if (d.name) allDeductionNames.add(d.name); });
        });
        rows = payslips.map((p, i) => buildPayslipExcelRowsNormalized(p, allAllowanceNames, allDeductionNames, i + 1));
        headers = rows.length > 0 ? Object.keys(rows[0]) : [];
      }
    }

    if (rows.length === 0) {
      return res.status(200).json({
        success: true,
        data: { headers: [], rows: [] },
        message: 'No payslip data available after calculation.',
      });
    }

    return res.status(200).json({
      success: true,
      data: { headers, rows },
    });
  } catch (error) {
    console.error('Error getting paysheet data:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Error loading paysheet',
      error: error.message,
    });
  }
};

/**
 * @desc    Export workbook: Regular sheet, 2nd salary sheet, Comparison (config columns + Regular/2nd sub-rows + Δ Net).
 * @route   GET /api/payroll/paysheet/export-bundle
 * @query   month, departmentId?, divisionId?, designationId?, employee_group_id?, status?, search?, employeeIds?
 * @access  Private
 */
exports.exportPaysheetBundleExcel = async (req, res) => {
  try {
    const { month, departmentId, divisionId, status, search, employeeIds, designationId, employee_group_id, format: exportFormat } = req.query;
    const bundleFormat = String(exportFormat || 'combined').toLowerCase() === 'by_department' ? 'by_department' : 'combined';
    const desFilt = designationId && designationId !== 'all' ? String(designationId) : undefined;
    const groupFilt = employee_group_id && employee_group_id !== 'all' ? String(employee_group_id) : undefined;

    if (!month || !/^\d{4}-\d{2}$/.test(month)) {
      return res.status(400).json({
        success: false,
        message: 'Month (YYYY-MM) is required',
      });
    }

    let targetEmployeeIds = [];
    if (employeeIds) {
      targetEmployeeIds = String(employeeIds)
        .split(',')
        .map((id) => id.trim())
        .filter(Boolean);
    } else {
      const { buildPaysheetEmployeeFilter } = require('../services/payrollEmployeeQueryHelper');
      const { getPayrollDateRange } = require('../../shared/utils/dateUtils');
      const [y, m] = month.split('-').map(Number);
      const { startDate: startStr, endDate: endStr } = await getPayrollDateRange(y, m);
      const rangeStart = new Date(`${startStr}T00:00:00.000Z`);
      const rangeEnd = new Date(`${endStr}T23:59:59.999Z`);
      const scope =
        req.scopeFilter && typeof req.scopeFilter === 'object' && Object.keys(req.scopeFilter).length > 0
          ? req.scopeFilter
          : null;
      const divF = divisionId && divisionId !== 'all' ? divisionId : undefined;
      const depF = departmentId && departmentId !== 'all' ? departmentId : undefined;
      const employeeQuery = await buildPaysheetEmployeeFilter(scope, divF, depF, rangeStart, rangeEnd, {
        status: status || undefined,
        search: search || undefined,
        designationId: desFilt,
        employeeGroupId: groupFilt,
      });
      const emps = await Employee.find(employeeQuery).select('_id emp_no').lean();
      emps.sort((a, b) => compareEmpNo(a.emp_no, b.emp_no));
      targetEmployeeIds = emps.map((e) => e._id.toString());
    }

    if (targetEmployeeIds.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'No employees in scope for the selected filters.',
      });
    }

    let payrollRecords = await PayrollRecord.find({ month, employeeId: { $in: targetEmployeeIds } })
      .populate({
        path: 'employeeId',
        select:
          'employee_name emp_no first_name last_name department_id division_id designation_id gross_salary salaries location bank_account_no bank_name bank_place ifsc_code salary_mode doj pf_number esi_number leftDate',
        populate: [
          { path: 'department_id', select: 'name' },
          { path: 'division_id', select: 'name' },
          { path: 'designation_id', select: 'name' },
        ],
      })
      .sort(EMP_NO_SORT)
      .collation(EMP_NO_COLLATION)
      .lean();

    const { getPayrollDateRange } = require('../../shared/utils/dateUtils');
    const [yearNum, monthNum] = month.split('-').map(Number);
    const { startDate: rangeStartStr, endDate: rangeEndStr } = await getPayrollDateRange(yearNum, monthNum);
    const payrollRangeStart = new Date(`${rangeStartStr}T00:00:00.000Z`);
    const payrollRangeEnd = new Date(`${rangeEndStr}T23:59:59.999Z`);

    const { filterPayrollRecordsByPayPeriodScope } = require('../services/payrollEmployeeQueryHelper');
    payrollRecords = filterPayrollRecordsByPayPeriodScope(payrollRecords, payrollRangeStart, payrollRangeEnd);

    const orderIndex = new Map(targetEmployeeIds.map((id, i) => [id, i]));
    payrollRecords.sort((a, b) => {
      const aId = (a.employeeId?._id || a.employeeId).toString();
      const bId = (b.employeeId?._id || b.employeeId).toString();
      return (orderIndex.get(aId) ?? 999999) - (orderIndex.get(bId) ?? 999999);
    });

    if (!payrollRecords.length) {
      return res.status(404).json({
        success: false,
        message: 'No payroll records in scope. Calculate payroll for this month first.',
      });
    }

    const prEmpIds = payrollRecords.map((pr) => (pr.employeeId?._id || pr.employeeId).toString());
    const secondRecords = await SecondSalaryRecord.find({ month, employeeId: { $in: prEmpIds } })
      .populate({
        path: 'employeeId',
        select:
          'employee_name emp_no department_id division_id designation_id salaries location bank_account_no bank_name bank_place ifsc_code salary_mode doj leftDate',
        populate: [
          { path: 'department_id', select: 'name' },
          { path: 'division_id', select: 'name' },
          { path: 'designation_id', select: 'name' },
        ],
      })
      .populate('division_id', 'name')
      .lean();
    const secondByEmp = new Map(secondRecords.map((sr) => [(sr.employeeId?._id || sr.employeeId).toString(), sr]));

    const config = await PayrollConfiguration.get();
    const outputColumnsNormalized = normalizeOutputColumns(config?.outputColumns);
    const statutoryCodesForBundle = await getStatutoryCodesForPaysheetExpansion();

    let regularRows;
    let secondRows;
    let netsReg = [];
    let netsSec = [];

    const IDENTITY_COPY_KEYS = new Set([
      'S.No', 'Employee Code', 'Name', 'Designation', 'Department', 'Division',
      'Date of Joining', 'Payment Mode', 'Bank Name', 'Bank Account No',
    ]);

    if (outputColumnsNormalized.length > 0) {
      const payslipsReg = payrollRecords.map((r) => payrollRecordToPayslipShape(r));
      const payslipsSec = payrollRecords.map((pr) => {
        const id = (pr.employeeId?._id || pr.employeeId).toString();
        const sr = secondByEmp.get(id);
        return sr ? secondSalaryRecordToPayslipShape(sr) : null;
      });
      regularRows = await tryBuildRegularRowsFromSnapshots(
        payrollRecords,
        month,
        outputColumnsNormalized
      );
      await enrichPayslipsLoanRemainingBalance(payslipsReg, payrollRecords);
      const built = buildOutputColumnRows(payslipsReg, payslipsSec, outputColumnsNormalized, statutoryCodesForBundle);
      if (!regularRows) regularRows = built.regularRows;
      secondRows = built.secondRows;
      netsReg = payslipsReg.map((p) => Number(p.netSalary) || 0);
      netsSec = payslipsSec.map((p) => (p ? Number(p.netSalary) || 0 : 0));
    } else {
      const payslips = await buildPayslipsFromStoredPayrollRecords(payrollRecords, month);
      if (!payslips.length) {
        return res.status(404).json({
          success: false,
          message: 'Could not build payslip data for bundle export.',
        });
      }
      const allAllowanceNames = new Set();
      const allDeductionNames = new Set();
      payslips.forEach((p) => {
        (p.earnings?.allowances || []).forEach((a) => { if (a?.name) allAllowanceNames.add(a.name); });
        (p.deductions?.otherDeductions || []).forEach((d) => { if (d?.name) allDeductionNames.add(d.name); });
      });
      payrollRecords.forEach((pr) => {
        const id = (pr.employeeId?._id || pr.employeeId).toString();
        const sr = secondByEmp.get(id);
        if (!sr) return;
        (sr.earnings?.allowances || []).forEach((a) => { if (a?.name) allAllowanceNames.add(a.name); });
        (sr.deductions?.otherDeductions || []).forEach((d) => { if (d?.name) allDeductionNames.add(d.name); });
      });

      regularRows = payslips.map((p, i) =>
        buildPayslipExcelRowsNormalized(p, allAllowanceNames, allDeductionNames, i + 1)
      );
      secondRows = payrollRecords.map((pr, i) => {
        const id = (pr.employeeId?._id || pr.employeeId).toString();
        const sr = secondByEmp.get(id);
        const regRow = regularRows[i];
        if (sr) {
          return buildSecondSalaryExcelRowsNormalized(sr, allAllowanceNames, allDeductionNames, i + 1);
        }
        const empty = {};
        for (const k of Object.keys(regRow)) {
          if (k === 'S.No') empty[k] = i + 1;
          else if (IDENTITY_COPY_KEYS.has(k)) empty[k] = regRow[k];
          else empty[k] = typeof regRow[k] === 'number' ? 0 : '';
        }
        return empty;
      });
      netsReg = payslips.map((p) => Number(p.netSalary) || 0);
      netsSec = payrollRecords.map((pr) => {
        const id = (pr.employeeId?._id || pr.employeeId).toString();
        const sr = secondByEmp.get(id);
        return sr ? Number(sr.netSalary) || 0 : 0;
      });
    }

    const enriched = enrichExportRowsWithOrg(payrollRecords, regularRows, secondRows);
    regularRows = enriched.regularRows;
    secondRows = enriched.secondRows;

    const scope =
      req.scopeFilter && typeof req.scopeFilter === 'object' && Object.keys(req.scopeFilter).length > 0
        ? req.scopeFilter
        : null;
    const exportMeta = await resolvePaysheetExportMeta({
      month,
      divisionId: divisionId && divisionId !== 'all' ? String(divisionId) : undefined,
      departmentId: departmentId && departmentId !== 'all' ? String(departmentId) : undefined,
      designationId: desFilt,
      employeeGroupId: groupFilt,
      status: status || undefined,
      search: search || undefined,
      scopeFilter: scope,
      regularRows,
    });
    const secondSalaryEnabled = await isSecondSalaryGloballyEnabled();
    const buf = writeBundleBuffer(regularRows, secondRows, (reg, sec, i) => netsSec[i] - netsReg[i], {
      format: bundleFormat,
      exportMeta,
      secondSalaryEnabled,
    });
    const formatSuffix = bundleFormat === 'by_department' ? '_by_dept' : '';
    const filename = `paysheet_bundle_${month}${formatSuffix}${departmentId && departmentId !== 'all' ? `_dept_${departmentId}` : ''}.xlsx`;
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    return res.send(buf);
  } catch (error) {
    console.error('Error exporting paysheet bundle:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Error exporting paysheet bundle',
      error: error.message,
    });
  }
};

/**
 * @desc    Get payroll record by ID
 * @route   GET /api/payroll/record/:id
 * @access  Private
 */
exports.getPayrollRecordById = async (req, res) => {
  try {
    const { id } = req.params;
    console.log(`[GET /payroll/record/${id}] Fetching payroll record...`);

    const payrollRecord = await PayrollRecord.findById(id)
      .populate({
        path: 'employeeId',
        select: 'employee_name emp_no department_id designation_id location bank_account_no pf_number esi_number uan_number pan_number',
        populate: [
          { path: 'department_id', select: 'name' },
          { path: 'designation_id', select: 'name' }
        ]
      })
      .populate('attendanceSummaryId')
      .populate('calculationMetadata.calculatedBy', 'name email')
      .populate('approvedBy', 'name email')
      .populate('processedBy', 'name email');

    if (!payrollRecord) {
      console.warn(`[GET /payroll/record/${id}] Payroll record NOT FOUND in database`);
      return res.status(404).json({
        success: false,
        message: 'Payroll record not found',
      });
    }

    const actor = await payslipAccess.loadPayslipActor(req);
    try {
      await payslipAccess.assertCanViewPayrollRecord(actor, payrollRecord, req);
    } catch (accessErr) {
      return res.status(accessErr.statusCode || 403).json({
        success: false,
        message: accessErr.message || 'Access denied',
      });
    }

    const data = await attachPayslipSectionsToRecord(payrollRecord);

    res.status(200).json({
      success: true,
      data,
    });
  } catch (error) {
    console.error('Error fetching payroll record by ID:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Error fetching payroll record',
      error: error.message,
    });
  }
};

/**
 * @desc    Get payroll record for an employee
 * @route   GET /api/payroll/:employeeId/:month
 * @access  Private
 */
exports.getPayrollRecord = async (req, res) => {
  try {
    const { employeeId, month } = req.params;

    if (!/^\d{4}-\d{2}$/.test(month)) {
      return res.status(400).json({
        success: false,
        message: 'Month must be in YYYY-MM format',
      });
    }

    const payrollRecord = await PayrollRecord.findOne({
      employeeId,
      month,
    })
      .populate({
        path: 'employeeId',
        select: 'employee_name emp_no department_id designation_id location bank_account_no pf_number esi_number',
        populate: [
          { path: 'department_id', select: 'name' },
          { path: 'designation_id', select: 'name' }
        ]
      })
      .populate('attendanceSummaryId')
      .populate('calculationMetadata.calculatedBy', 'name email')
      .populate('approvedBy', 'name email')
      .populate('processedBy', 'name email');

    if (!payrollRecord) {
      return res.status(404).json({
        success: false,
        message: 'Payroll record not found',
      });
    }

    const data = await attachPayslipSectionsToRecord(payrollRecord);

    res.status(200).json({
      success: true,
      data,
    });
  } catch (error) {
    console.error('Error fetching payroll record:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching payroll record',
      error: error.message,
    });
  }
};

/**
 * @desc    Get payroll records for multiple employees
 * @route   GET /api/payroll
 * @access  Private
 */
exports.getPayrollRecords = async (req, res) => {
  try {
    const { month, employeeId, departmentId, status, page, limit } = req.query;
    const actor = await payslipAccess.loadPayslipActor(req);
    const isAdmin = payslipAccess.isPayslipAdmin(actor);
    const isScoped = payslipAccess.hasPayslipScoped(actor);
    const isSelfOnly = payslipAccess.isSelfOnlyPayslipViewer(actor);

    const query = isSelfOnly ? {} : { ...req.scopeFilter };

    console.log('[getPayrollRecords] Params:', { month, employeeId, departmentId, status, page, limit });
    console.log('[getPayrollRecords] User Role:', req.user.role);
    console.log('[getPayrollRecords] Scope:', JSON.stringify(req.scopeFilter));

    if (month) {
      if (!/^\d{4}-\d{2}$/.test(month)) {
        return res.status(400).json({
          success: false,
          message: 'Month must be in YYYY-MM format',
        });
      }
      query.month = month;
    } else if (!isAdmin && !isScoped) {
      // Self-view: month optional — list all released payslips within history window
    } else if (!isAdmin && isScoped && !month) {
      return res.status(400).json({
        success: false,
        message: 'Month is required for scoped payslip view',
      });
    }

    if (employeeId) {
      query.employeeId = employeeId;
    } else if (isSelfOnly) {
      const ownEmployeeId = await payslipAccess.resolveOwnEmployeeObjectId(req, actor);
      if (!ownEmployeeId) {
        return res.status(403).json({ success: false, message: 'Access denied: No employee profile found' });
      }
      query.employeeId = ownEmployeeId;
    } else if (!isAdmin) {
      const viewableIds = await payslipAccess.getViewableEmployeeIds(actor, req);
      if (!viewableIds || viewableIds.length === 0) {
        return res.status(200).json({
          success: true,
          count: 0,
          total: 0,
          hasMore: false,
          page: 1,
          data: [],
        });
      }
      query.employeeId = { $in: viewableIds };
    }

    if (!isAdmin && !isScoped && employeeId && query.employeeId) {
      const ownEmployeeId = (await payslipAccess.resolveOwnEmployeeObjectId(req, actor))?.toString?.();
      const requestedId = (typeof query.employeeId === 'object' && query.employeeId.$in)
        ? null
        : query.employeeId?.toString?.();
      if (requestedId && ownEmployeeId && requestedId !== ownEmployeeId) {
        return res.status(403).json({ success: false, message: 'Access denied: You can only view your own records' });
      }
    }

    if (status) {
      query.status = status;
    }

    if (isSelfOnly) {
      await payslipAccess.applySelfViewPayrollFilters(query);
    }

    // If departmentId or divisionId is provided, filter by employees in that scope
    if (departmentId || req.query.divisionId) {
      const empQuery = { ...req.scopeFilter };
      if (departmentId) empQuery.department_id = departmentId;
      if (req.query.divisionId) empQuery.division_id = req.query.divisionId;

      const employees = await Employee.find(empQuery).select('_id');
      const employeeIds = employees.map((emp) => emp._id);

      if (employeeIds.length === 0) {
        return res.status(200).json({
          success: true,
          count: 0,
          total: 0,
          hasMore: false,
          page: 1,
          data: [],
        });
      }

      if (query.employeeId) {
        const validIds = new Set(employeeIds.map((id) => id.toString()));
        if (Array.isArray(query.employeeId.$in)) {
          query.employeeId.$in = query.employeeId.$in.filter((id) => validIds.has(id.toString()));
          if (query.employeeId.$in.length === 0) {
            return res.status(200).json({
              success: true,
              count: 0,
              total: 0,
              hasMore: false,
              page: 1,
              data: [],
            });
          }
        } else if (query.employeeId && !validIds.has(query.employeeId.toString())) {
          return res.status(200).json({ success: true, count: 0, total: 0, hasMore: false, page: 1, data: [] });
        }
      } else {
        query.employeeId = { $in: employeeIds };
      }
    }

    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const pageLimit = isSelfOnly
      ? Math.min(Math.max(parseInt(limit, 10) || 6, 1), 50)
      : Math.min(Math.max(parseInt(limit, 10) || 1000, 1), 1000);
    const skip = isSelfOnly ? (pageNum - 1) * pageLimit : 0;

    const totalCount = await PayrollRecord.countDocuments(query);

    let payrollQuery = PayrollRecord.find(query)
      .populate({
        path: 'employeeId',
        select: 'employee_name emp_no department_id designation_id location bank_account_no pf_number esi_number',
        populate: [
          { path: 'department_id', select: 'name' },
          { path: 'designation_id', select: 'name' },
        ],
      })
      .populate({
        path: 'payrollBatchId',
        select: 'status batchNumber month',
      })
      .sort({ month: -1, emp_no: 1 })
      .collation(EMP_NO_COLLATION);

    if (isSelfOnly) {
      payrollQuery = payrollQuery.skip(skip).limit(pageLimit);
    } else {
      payrollQuery = payrollQuery.limit(pageLimit);
    }

    const payrollRecords = await payrollQuery;

    console.log(`[getPayrollRecords] Final Query executed:`, JSON.stringify(query));
    console.log(`[getPayrollRecords] Found ${payrollRecords.length} records (total ${totalCount}).`);

    const payrollConfig = await PayrollConfiguration.get();
    const outputColumns = Array.isArray(payrollConfig?.outputColumns)
      ? payrollConfig.outputColumns
      : [];
    const data = await payslipLoanSectionService.attachPayslipLoansToRecords(
      payrollRecords,
      outputColumns
    );

    res.status(200).json({
      success: true,
      count: data.length,
      total: totalCount,
      hasMore: isSelfOnly ? skip + data.length < totalCount : false,
      page: isSelfOnly ? pageNum : 1,
      data,
    });
  } catch (error) {
    console.error('Error fetching payroll records:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching payroll records',
      error: error.message,
    });
  }
};

/**
 * @desc    Get payroll transactions for a payroll record
 * @route   GET /api/payroll/:payrollRecordId/transactions
 * @access  Private
 */
exports.getPayrollTransactions = async (req, res) => {
  try {
    const { payrollRecordId } = req.params;

    const transactions = await PayrollTransaction.find({
      payrollRecordId,
    }).sort({ createdAt: 1 });

    res.status(200).json({
      success: true,
      count: transactions.length,
      data: transactions,
    });
  } catch (error) {
    console.error('Error fetching payroll transactions:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching payroll transactions',
      error: error.message,
    });
  }
};

/**
 * @desc    Approve payroll record
 * @route   PUT /api/payroll/:payrollRecordId/approve
 * @access  Private (Super Admin, Sub Admin, HR)
 */
exports.approvePayroll = async (req, res) => {
  try {
    const { payrollRecordId } = req.params;
    const { comments } = req.body;

    const payrollRecord = await PayrollRecord.findById(payrollRecordId);

    if (!payrollRecord) {
      return res.status(404).json({
        success: false,
        message: 'Payroll record not found',
      });
    }

    if (payrollRecord.status === 'processed') {
      return res.status(400).json({
        success: false,
        message: 'Cannot approve already processed payroll',
      });
    }

    payrollRecord.status = 'approved';
    payrollRecord.approvedBy = req.user._id;
    payrollRecord.approvedAt = new Date();
    payrollRecord.approvedComments = comments || null;

    await payrollRecord.save();

    res.status(200).json({
      success: true,
      message: 'Payroll approved successfully',
      data: payrollRecord,
    });
  } catch (error) {
    console.error('Error approving payroll:', error);
    res.status(500).json({
      success: false,
      message: 'Error approving payroll',
      error: error.message,
    });
  }
};

/**
 * @desc    Process payroll (update loan/advance records)
 * @route   PUT /api/payroll/:payrollRecordId/process
 * @access  Private (Super Admin, Sub Admin, HR)
 */
exports.processPayroll = async (req, res) => {
  try {
    const { payrollRecordId } = req.params;

    const result = await payrollCalculationService.processPayroll(
      payrollRecordId,
      req.user._id
    );

    res.status(200).json({
      success: true,
      message: 'Payroll processed successfully',
      data: result.payrollRecord,
    });
  } catch (error) {
    console.error('Error processing payroll:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Error processing payroll',
      error: error.message,
    });
  }
};

/**
 * @desc    Get payslip for an employee
 * @route   GET /api/payroll/payslip/:employeeId/:month
 * @access  Private
 */
exports.getPayslip = async (req, res) => {
  try {
    const { employeeId, month } = req.params;

    if (!/^\d{4}-\d{2}$/.test(month)) {
      return res.status(400).json({
        success: false,
        message: 'Month must be in YYYY-MM format',
      });
    }

    const actor = await payslipAccess.loadPayslipActor(req);
    const payrollRecord = await PayrollRecord.findOne({ employeeId, month });
    if (!payrollRecord) {
      return res.status(404).json({ success: false, message: 'Payslip not found' });
    }

    try {
      await payslipAccess.assertCanViewPayrollRecord(actor, payrollRecord, req);
    } catch (accessErr) {
      return res.status(accessErr.statusCode || 403).json({
        success: false,
        message: accessErr.message || 'Access denied',
      });
    }

    const { payslip } = await buildPayslipData(employeeId, month);

    res.status(200).json({
      success: true,
      data: payslip,
    });
  } catch (error) {
    console.error('Error fetching payslip:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching payslip',
      error: error.message,
    });
  }
};

/**
 * @desc    Get payslip data for download (tracks download count)
 * @route   GET /api/payroll/download/:employeeId/:month
 * @access  Private
 */
exports.downloadPayslip = async (req, res) => {
  try {
    const { employeeId, month } = req.params;

    const actor = await payslipAccess.loadPayslipActor(req);
    const payrollRecord = await PayrollRecord.findOne({ employeeId, month });
    if (!payrollRecord) {
      return res.status(404).json({ success: false, message: 'Payroll record not found' });
    }

    try {
      await payslipAccess.assertCanViewPayrollRecord(actor, payrollRecord, req);
    } catch (accessErr) {
      return res.status(accessErr.statusCode || 403).json({
        success: false,
        message: accessErr.message || 'Access denied',
      });
    }

    const isAdmin = payslipAccess.isPayslipAdmin(actor);

    // Check download limits for non-admins
    if (!isAdmin) {
      const downloadLimitSetting = await Settings.findOne({ key: 'payslip_download_limit' });
      const limit = downloadLimitSetting ? parseInt(downloadLimitSetting.value) : 0;

      if (limit > 0 && (payrollRecord.downloadCount || 0) >= limit) {
        return res.status(403).json({
          success: false,
          message: `Download limit reached (${limit}). Please contact HR for assistance.`
        });
      }

      // Increment download count
      payrollRecord.downloadCount = (payrollRecord.downloadCount || 0) + 1;
      await payrollRecord.save();
    }

    const { payslip } = await buildPayslipData(employeeId, month);

    res.status(200).json({
      success: true,
      message: 'Download tracked successfully',
      data: payslip,
      downloadCount: payrollRecord.downloadCount,
    });
  } catch (error) {
    console.error('Error tracking payslip download:', error);
    res.status(500).json({
      success: false,
      message: 'Error tracking download',
      error: error.message,
    });
  }
};

/**
 * @desc    Release payslips for a specific month/department
 * @route   PUT /api/payroll/release
 * @access  Private (Super Admin, Sub Admin, HR)
 */
exports.releasePayslips = async (req, res) => {
  try {
    const actor = await payslipAccess.loadPayslipActor(req);
    try {
      payslipAccess.assertCanReleasePayslips(actor);
    } catch (accessErr) {
      return res.status(accessErr.statusCode || 403).json({
        success: false,
        message: accessErr.message || 'Access denied',
      });
    }

    const { month, departmentId, divisionId, recordIds } = req.body;

    if (!month || !/^\d{4}-\d{2}$/.test(month)) {
      return res.status(400).json({
        success: false,
        message: 'Month (YYYY-MM) is required',
      });
    }

    const scopeQuery = { month };

    if (!payslipAccess.isPayslipAdmin(actor)) {
      const viewableIds = await payslipAccess.getViewableEmployeeIds(actor, req);
      if (!viewableIds || viewableIds.length === 0) {
        return res.status(200).json({
          success: true,
          message: 'No payslips in your scope for this period',
          modifiedCount: 0,
          count: 0,
          stats: { total: 0, alreadyReleased: 0, pendingRelease: 0, notEligible: 0, newlyReleased: 0 },
        });
      }
      scopeQuery.employeeId = { $in: viewableIds };
    }

    if (Array.isArray(recordIds) && recordIds.length > 0) {
      scopeQuery._id = { $in: recordIds };
    }

    if (departmentId || divisionId) {
      const empQuery = { ...(req.scopeFilter || {}) };
      if (departmentId) empQuery.department_id = departmentId;
      if (divisionId) empQuery.division_id = divisionId;

      const employees = await Employee.find(empQuery).select('_id');
      const filterEmpIds = employees.map((emp) => emp._id);
      if (filterEmpIds.length === 0) {
        return res.status(200).json({
          success: true,
          message: 'No payslips match the selected department/division filters',
          modifiedCount: 0,
          count: 0,
          stats: { total: 0, alreadyReleased: 0, pendingRelease: 0, notEligible: 0, newlyReleased: 0 },
        });
      }

      if (scopeQuery.employeeId?.$in) {
        const allowed = new Set(filterEmpIds.map((id) => id.toString()));
        scopeQuery.employeeId.$in = scopeQuery.employeeId.$in.filter((id) => allowed.has(id.toString()));
        if (scopeQuery.employeeId.$in.length === 0) {
          return res.status(200).json({
            success: true,
            message: 'No payslips match the selected department/division filters',
            modifiedCount: 0,
            count: 0,
            stats: { total: 0, alreadyReleased: 0, pendingRelease: 0, notEligible: 0, newlyReleased: 0 },
          });
        }
      } else {
        scopeQuery.employeeId = { $in: filterEmpIds };
      }
    }

    const matchedRecords = await PayrollRecord.find(scopeQuery)
      .select('status isReleased payrollBatchId')
      .populate({ path: 'payrollBatchId', select: 'status batchNumber' })
      .lean();
    const stats = payslipAccess.summarizePayrollReleaseRecords(matchedRecords);

    if (stats.pendingRelease === 0) {
      return res.status(200).json({
        success: true,
        message: payslipAccess.formatReleaseStatsMessage(stats, 0),
        modifiedCount: 0,
        count: 0,
        stats: { ...stats, newlyReleased: 0 },
      });
    }

    const releasableIds = matchedRecords
      .filter((record) => payslipAccess.canReleasePayrollRecord(record))
      .map((record) => record._id);

    const updateResult = await PayrollRecord.updateMany(
      { _id: { $in: releasableIds }, isReleased: { $ne: true } },
      { $set: { isReleased: true } }
    );

    const newlyReleased = updateResult.modifiedCount || 0;

    res.status(200).json({
      success: true,
      message: payslipAccess.formatReleaseStatsMessage(stats, newlyReleased),
      modifiedCount: newlyReleased,
      count: newlyReleased,
      stats: { ...stats, newlyReleased },
    });
  } catch (error) {
    console.error('Error releasing payslips:', error);
    res.status(500).json({
      success: false,
      message: 'Error releasing payslips',
      error: error.message,
    });
  }
};

/**
 * @desc    Recalculate payroll for an employee
 * @route   POST /api/payroll/recalculate
 * @access  Private (Super Admin, Sub Admin, HR)
 */
exports.recalculatePayroll = async (req, res) => {
  try {
    const { employeeId, month } = req.body;

    if (!employeeId || !month) {
      return res.status(400).json({
        success: false,
        message: 'Employee ID and month are required',
      });
    }

    // Check if payroll record exists
    const existingRecord = await PayrollRecord.findOne({ employeeId, month });

    if (existingRecord && existingRecord.status === 'processed') {
      return res.status(400).json({
        success: false,
        message: 'Cannot recalculate processed payroll',
      });
    }

    // Calculate payroll
    const result = await payrollCalculationService.calculatePayroll(
      employeeId,
      month,
      req.user._id
    );

    res.status(200).json({
      success: true,
      message: 'Payroll recalculated successfully',
      data: result.payrollRecord,
    });
  } catch (error) {
    console.error('Error recalculating payroll:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Error recalculating payroll',
      error: error.message,
    });
  }
};

/**
 * @desc    Get payroll transactions with analytics for a month
 * @route   GET /api/payroll/transactions/analytics
 * @access  Private
 */
exports.getPayrollTransactionsWithAnalytics = async (req, res) => {
  try {
    const { month, employeeId, departmentId } = req.query;

    if (!month) {
      return res.status(400).json({
        success: false,
        message: 'Month is required (YYYY-MM format)',
      });
    }

    if (!/^\d{4}-\d{2}$/.test(month)) {
      return res.status(400).json({
        success: false,
        message: 'Month must be in YYYY-MM format',
      });
    }

    // Build query for payroll records
    const payrollQuery = { month };
    if (employeeId) {
      payrollQuery.employeeId = employeeId;
    }
    if (departmentId) {
      const employees = await Employee.find({ department_id: departmentId }).select('_id');
      const employeeIds = employees.map((emp) => emp._id);
      if (employeeIds.length === 0) {
        return res.status(200).json({
          success: true,
          transactions: [],
          analytics: {
            totalEarnings: 0,
            totalDeductions: 0,
            totalNetSalary: 0,
            salaryAdvanceRecovered: 0,
            loanRecovered: 0,
            totalRemainingLoans: 0,
            totalRemainingSalaryAdvances: 0,
          },
        });
      }
      payrollQuery.employeeId = { $in: employeeIds };
    }

    // Get all payroll records for the month
    const payrollRecords = await PayrollRecord.find(payrollQuery)
      .populate({
        path: 'employeeId',
        select: 'employee_name emp_no department_id designation_id pf_number esi_number',
        populate: [
          { path: 'department_id', select: 'name' },
          { path: 'designation_id', select: 'name' }
        ]
      })
      .select('_id employeeId emp_no month');

    const payrollRecordIds = payrollRecords.map((record) => record._id);

    // Get all transactions for these payroll records
    const transactions = await PayrollTransaction.find({
      payrollRecordId: { $in: payrollRecordIds },
    })
      .populate('employeeId', 'employee_name emp_no')
      .populate('payrollRecordId', 'month')
      .sort({ createdAt: 1 });

    // Calculate analytics
    let totalEarnings = 0;
    let totalDeductions = 0;
    let totalNetSalary = 0;
    let salaryAdvanceRecovered = 0;
    let loanRecovered = 0;

    // Process transactions
    transactions.forEach((transaction) => {
      if (transaction.category === 'earning') {
        totalEarnings += Math.abs(transaction.amount);
      } else if (transaction.category === 'deduction') {
        totalDeductions += Math.abs(transaction.amount);
      }

      if (transaction.transactionType === 'salary_advance') {
        salaryAdvanceRecovered += Math.abs(transaction.amount);
      } else if (transaction.transactionType === 'loan_emi') {
        loanRecovered += Math.abs(transaction.amount);
      } else if (transaction.transactionType === 'net_salary') {
        totalNetSalary += Math.abs(transaction.amount);
      }
    });

    // Calculate total remaining loans and salary advances
    // Get all active loans and salary advances
    const activeLoans = await Loan.find({
      requestType: 'loan',
      status: { $in: ['active', 'disbursed'] },
      isActive: true,
    }).select('repayment.remainingBalance amount');

    const activeSalaryAdvances = await Loan.find({
      requestType: 'salary_advance',
      status: { $in: ['active', 'disbursed'] },
      isActive: true,
    }).select('repayment.remainingBalance amount');

    const totalRemainingLoans = activeLoans.reduce(
      (sum, loan) => sum + (loan.repayment?.remainingBalance || loan.amount || 0),
      0
    );

    const totalRemainingSalaryAdvances = activeSalaryAdvances.reduce(
      (sum, advance) => sum + (advance.repayment?.remainingBalance || advance.amount || 0),
      0
    );

    // Format transactions for response
    const formattedTransactions = transactions.map((transaction) => ({
      _id: transaction._id,
      employeeName: transaction.employeeId?.employee_name || 'N/A',
      emp_no: transaction.emp_no,
      transactionType: transaction.transactionType,
      category: transaction.category,
      description: transaction.description,
      amount: transaction.amount,
      month: transaction.month,
      createdAt: transaction.createdAt,
      details: transaction.details,
    }));

    res.status(200).json({
      success: true,
      month,
      transactions: formattedTransactions,
      analytics: {
        totalEarnings: Math.round(totalEarnings * 100) / 100,
        totalDeductions: Math.round(totalDeductions * 100) / 100,
        totalNetSalary: Math.round(totalNetSalary * 100) / 100,
        salaryAdvanceRecovered: Math.round(salaryAdvanceRecovered * 100) / 100,
        loanRecovered: Math.round(loanRecovered * 100) / 100,
        totalRemainingLoans: Math.round(totalRemainingLoans * 100) / 100,
        totalRemainingSalaryAdvances: Math.round(totalRemainingSalaryAdvances * 100) / 100,
        totalRecords: payrollRecords.length,
        totalTransactions: transactions.length,
      },
    });
  } catch (error) {
    console.error('Error fetching payroll transactions with analytics:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching payroll transactions with analytics',
      error: error.message,
    });
  }
};

/**
 * @desc    Get deductions analytics with breakdown by employee, department, division, and month
 * @route   GET /api/payroll/deductions/analytics
 * @access  Private (Super Admin, Sub Admin, HR, Manager)
 */
exports.getDeductionsAnalytics = async (req, res) => {
  try {
    const {
      startMonth,
      endMonth,
      employeeId,
      departmentId,
      divisionId,
      groupBy = 'employee' // employee, department, division, month
    } = req.query;

    // Validate required parameters
    if (!startMonth || !endMonth) {
      return res.status(400).json({
        success: false,
        message: 'Start month and end month are required (YYYY-MM format)',
      });
    }

    if (!/^\d{4}-\d{2}$/.test(startMonth) || !/^\d{4}-\d{2}$/.test(endMonth)) {
      return res.status(400).json({
        success: false,
        message: 'Months must be in YYYY-MM format',
      });
    }

    // Build employee filter query
    let employeeQuery = {};
    if (employeeId) {
      employeeQuery._id = employeeId;
    }
    if (departmentId) {
      employeeQuery.department_id = departmentId;
    }
    if (divisionId) {
      employeeQuery.division_id = divisionId;
    }

    // Get employees matching the filter
    const employees = await Employee.find(employeeQuery)
      .select('_id employee_name emp_no department_id division_id designation_id employee_group_id')
      .populate('department_id', 'name')
      .populate('division_id', 'name')
      .populate('designation_id', 'name')
      .populate('employee_group_id', 'name')
      .lean();

    if (employees.length === 0) {
      return res.status(200).json({
        success: true,
        data: [],
        summary: {
          totalDeductions: 0,
          totalEmployees: 0,
          monthsAnalyzed: 0,
          deductionTypes: {},
        },
      });
    }

    const employeeIds = employees.map(emp => emp._id);

    // Generate list of months in range
    const months = [];
    let currentMonth = new Date(startMonth + '-01');
    const endMonthDate = new Date(endMonth + '-01');
    while (currentMonth <= endMonthDate) {
      months.push(currentMonth.toISOString().slice(0, 7));
      currentMonth.setMonth(currentMonth.getMonth() + 1);
    }

    // Get all payroll records for these employees and months (regular salary)
    const payrollRecords = await PayrollRecord.find({
      employeeId: { $in: employeeIds },
      month: { $in: months },
    })
      .populate({
        path: 'employeeId',
        select: 'employee_name emp_no department_id division_id designation_id employee_group_id',
        populate: [
          { path: 'department_id', select: 'name' },
          { path: 'division_id', select: 'name' },
          { path: 'designation_id', select: 'name' },
          { path: 'employee_group_id', select: 'name' }
        ]
      })
      .select('_id employeeId month')
      .lean();

    const payrollRecordIds = payrollRecords.map(record => record._id);

    // Get all 2nd salary records for these employees and months
    const secondSalaryRecords = await SecondSalaryRecord.find({
      employeeId: { $in: employeeIds },
      month: { $in: months },
    })
      .populate({
        path: 'employeeId',
        select: 'employee_name emp_no department_id division_id designation_id employee_group_id',
        populate: [
          { path: 'department_id', select: 'name' },
          { path: 'division_id', select: 'name' },
          { path: 'designation_id', select: 'name' },
          { path: 'employee_group_id', select: 'name' }
        ]
      })
      .select('_id employeeId month')
      .lean();

    const secondSalaryRecordIds = secondSalaryRecords.map(record => record._id);

    // Get all deduction transactions from regular payroll
    const regularDeductionTransactions = await PayrollTransaction.find({
      payrollRecordId: { $in: payrollRecordIds },
      category: 'deduction',
    })
      .populate({
        path: 'employeeId',
        select: 'employee_name emp_no department_id division_id designation_id employee_group_id',
        populate: [
          { path: 'department_id', select: 'name' },
          { path: 'division_id', select: 'name' },
          { path: 'designation_id', select: 'name' },
          { path: 'employee_group_id', select: 'name' }
        ]
      })
      .populate('payrollRecordId', 'month')
      .sort({ createdAt: -1 })
      .lean();

    // Get all deduction transactions from 2nd salary
    const secondSalaryDeductionTransactions = await PayrollTransaction.find({
      secondSalaryRecordId: { $in: secondSalaryRecordIds },
      category: 'deduction',
    })
      .populate({
        path: 'employeeId',
        select: 'employee_name emp_no department_id division_id designation_id employee_group_id',
        populate: [
          { path: 'department_id', select: 'name' },
          { path: 'division_id', select: 'name' },
          { path: 'designation_id', select: 'name' },
          { path: 'employee_group_id', select: 'name' }
        ]
      })
      .populate('secondSalaryRecordId', 'month')
      .sort({ createdAt: -1 })
      .lean();

    // Combine all deduction transactions
    const deductionTransactions = [...regularDeductionTransactions, ...secondSalaryDeductionTransactions];

    // Build analytics based on groupBy parameter
    let analyticsData = [];
    const deductionTypesSummary = {};
    let totalDeductions = 0;

    if (groupBy === 'employee') {
      // Group by employee
      const employeeMap = new Map();

      deductionTransactions.forEach(txn => {
        const empId = String(txn.employeeId?._id || txn.employeeId);
        if (!employeeMap.has(empId)) {
          employeeMap.set(empId, {
            employeeId: empId,
            employeeName: txn.employeeId?.employee_name || 'N/A',
            empNo: txn.emp_no || txn.employeeId?.emp_no || 'N/A',
            department: txn.employeeId?.department_id?.name || 'N/A',
            departmentId: txn.employeeId?.department_id?._id ? String(txn.employeeId.department_id._id) : null,
            division: txn.employeeId?.division_id?.name || 'N/A',
            divisionId: txn.employeeId?.division_id?._id ? String(txn.employeeId.division_id._id) : null,
            designation: txn.employeeId?.designation_id?.name || 'N/A',
            employeeGroup: txn.employeeId?.employee_group_id?.name || 'N/A',
            employeeGroupId: txn.employeeId?.employee_group_id?._id ? String(txn.employeeId.employee_group_id._id) : null,
            totalDeductions: 0,
            deductionsByType: {},
            deductionsByMonth: {},
            transactionCount: 0,
          });
        }

        const empData = employeeMap.get(empId);
        const amount = Math.abs(txn.amount);
        empData.totalDeductions += amount;
        empData.transactionCount++;

        // By type
        if (!empData.deductionsByType[txn.transactionType]) {
          empData.deductionsByType[txn.transactionType] = 0;
        }
        empData.deductionsByType[txn.transactionType] += amount;

        // By month - handle both regular and 2nd salary records
        const month = txn.month || txn.payrollRecordId?.month || txn.secondSalaryRecordId?.month;
        if (month) {
          if (!empData.deductionsByMonth[month]) {
            empData.deductionsByMonth[month] = 0;
          }
          empData.deductionsByMonth[month] += amount;
        }

        // Global summary
        if (!deductionTypesSummary[txn.transactionType]) {
          deductionTypesSummary[txn.transactionType] = 0;
        }
        deductionTypesSummary[txn.transactionType] += amount;
        totalDeductions += amount;
      });

      analyticsData = Array.from(employeeMap.values());

    } else if (groupBy === 'department') {
      // Group by department
      const deptMap = new Map();

      deductionTransactions.forEach(txn => {
        const deptId = String(txn.employeeId?.department_id?._id || txn.employeeId?.department_id || 'unassigned');
        const deptName = txn.employeeId?.department_id?.name || 'Unassigned';

        if (!deptMap.has(deptId)) {
          deptMap.set(deptId, {
            departmentId: deptId,
            departmentName: deptName,
            division: txn.employeeId?.division_id?.name || 'N/A',
            divisionId: txn.employeeId?.division_id?._id ? String(txn.employeeId.division_id._id) : null,
            totalDeductions: 0,
            deductionsByType: {},
            deductionsByMonth: {},
            employeeCount: new Set(),
            transactionCount: 0,
          });
        }

        const deptData = deptMap.get(deptId);
        const amount = Math.abs(txn.amount);
        deptData.totalDeductions += amount;
        deptData.transactionCount++;
        deptData.employeeCount.add(String(txn.employeeId?._id || txn.employeeId));

        // By type
        if (!deptData.deductionsByType[txn.transactionType]) {
          deptData.deductionsByType[txn.transactionType] = 0;
        }
        deptData.deductionsByType[txn.transactionType] += amount;

        // By month - handle both regular and 2nd salary records
        const month = txn.month || txn.payrollRecordId?.month || txn.secondSalaryRecordId?.month;
        if (month) {
          if (!deptData.deductionsByMonth[month]) {
            deptData.deductionsByMonth[month] = 0;
          }
          deptData.deductionsByMonth[month] += amount;
        }

        // Global summary
        if (!deductionTypesSummary[txn.transactionType]) {
          deductionTypesSummary[txn.transactionType] = 0;
        }
        deductionTypesSummary[txn.transactionType] += amount;
        totalDeductions += amount;
      });

      analyticsData = Array.from(deptMap.values()).map(dept => ({
        ...dept,
        employeeCount: dept.employeeCount.size,
      }));

    } else if (groupBy === 'division') {
      // Group by division
      const divMap = new Map();

      deductionTransactions.forEach(txn => {
        const divId = String(txn.employeeId?.division_id?._id || txn.employeeId?.division_id || 'unassigned');
        const divName = txn.employeeId?.division_id?.name || 'Unassigned';

        if (!divMap.has(divId)) {
          divMap.set(divId, {
            divisionId: divId,
            divisionName: divName,
            totalDeductions: 0,
            deductionsByType: {},
            deductionsByMonth: {},
            employeeCount: new Set(),
            departmentCount: new Set(),
            transactionCount: 0,
          });
        }

        const divData = divMap.get(divId);
        const amount = Math.abs(txn.amount);
        divData.totalDeductions += amount;
        divData.transactionCount++;
        divData.employeeCount.add(String(txn.employeeId?._id || txn.employeeId));
        if (txn.employeeId?.department_id?._id) {
          divData.departmentCount.add(String(txn.employeeId.department_id._id));
        }

        // By type
        if (!divData.deductionsByType[txn.transactionType]) {
          divData.deductionsByType[txn.transactionType] = 0;
        }
        divData.deductionsByType[txn.transactionType] += amount;

        // By month - handle both regular and 2nd salary records
        const month = txn.month || txn.payrollRecordId?.month || txn.secondSalaryRecordId?.month;
        if (month) {
          if (!divData.deductionsByMonth[month]) {
            divData.deductionsByMonth[month] = 0;
          }
          divData.deductionsByMonth[month] += amount;
        }

        // Global summary
        if (!deductionTypesSummary[txn.transactionType]) {
          deductionTypesSummary[txn.transactionType] = 0;
        }
        deductionTypesSummary[txn.transactionType] += amount;
        totalDeductions += amount;
      });

      analyticsData = Array.from(divMap.values()).map(div => ({
        ...div,
        employeeCount: div.employeeCount.size,
        departmentCount: div.departmentCount.size,
      }));

    } else if (groupBy === 'month') {
      // Group by month
      const monthMap = new Map();

      deductionTransactions.forEach(txn => {
        const month = txn.month || txn.payrollRecordId?.month || txn.secondSalaryRecordId?.month || 'unknown';

        if (!monthMap.has(month)) {
          monthMap.set(month, {
            month,
            totalDeductions: 0,
            deductionsByType: {},
            employeeCount: new Set(),
            transactionCount: 0,
          });
        }

        const monthData = monthMap.get(month);
        const amount = Math.abs(txn.amount);
        monthData.totalDeductions += amount;
        monthData.transactionCount++;
        monthData.employeeCount.add(String(txn.employeeId?._id || txn.employeeId));

        // By type
        if (!monthData.deductionsByType[txn.transactionType]) {
          monthData.deductionsByType[txn.transactionType] = 0;
        }
        monthData.deductionsByType[txn.transactionType] += amount;

        // Global summary
        if (!deductionTypesSummary[txn.transactionType]) {
          deductionTypesSummary[txn.transactionType] = 0;
        }
        deductionTypesSummary[txn.transactionType] += amount;
        totalDeductions += amount;
      });

      analyticsData = Array.from(monthMap.values())
        .map(m => ({
          ...m,
          employeeCount: m.employeeCount.size,
        }))
        .sort((a, b) => a.month.localeCompare(b.month));
    }

    // Round all monetary values
    analyticsData = analyticsData.map(item => {
      const rounded = { ...item };
      rounded.totalDeductions = Math.round(rounded.totalDeductions * 100) / 100;
      if (rounded.deductionsByType) {
        Object.keys(rounded.deductionsByType).forEach(key => {
          rounded.deductionsByType[key] = Math.round(rounded.deductionsByType[key] * 100) / 100;
        });
      }
      if (rounded.deductionsByMonth) {
        Object.keys(rounded.deductionsByMonth).forEach(key => {
          rounded.deductionsByMonth[key] = Math.round(rounded.deductionsByMonth[key] * 100) / 100;
        });
      }
      return rounded;
    });

    // Round summary values
    Object.keys(deductionTypesSummary).forEach(key => {
      deductionTypesSummary[key] = Math.round(deductionTypesSummary[key] * 100) / 100;
    });

    res.status(200).json({
      success: true,
      data: analyticsData,
      summary: {
        totalDeductions: Math.round(totalDeductions * 100) / 100,
        totalEmployees: employees.length,
        monthsAnalyzed: months.length,
        deductionTypes: deductionTypesSummary,
        groupBy,
        startMonth,
        endMonth,
      },
    });
  } catch (error) {
    console.error('Error fetching deductions analytics:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching deductions analytics',
      error: error.message,
    });
  }
};

/**
 * @desc    Bulk calculate payroll for employees matching filters
 * @route   POST /api/payroll/bulk-calculate
 * @access  Private (Super Admin, Sub Admin, HR)
 */
exports.calculatePayrollBulk = async (req, res) => {
  try {
    const { month, divisionId, departmentId, strategy, arrears, deductions, search, employeeGroupId } = req.body;

    if (!month || !/^\d{4}-\d{2}$/.test(month)) {
      return res.status(400).json({
        success: false,
        message: 'Month (YYYY-MM) is required',
      });
    }

    // Include active employees + employees who left in this payroll month
    const { getPayrollDateRange } = require('../../shared/utils/dateUtils');
    const [year, monthNum] = month.split('-').map(Number);
    const { startDate, endDate } = await getPayrollDateRange(year, monthNum);
    // Use UTC boundaries so "26 Dec–25 Jan" excludes 25 Dec left (avoids TZ shifting 26 Dec 00:00 local into 25 Dec UTC).
    const leftStart = new Date(startDate + 'T00:00:00.000Z');
    const leftEnd = new Date(endDate + 'T23:59:59.999Z');

    const { buildPayRegisterEmployeeFilter } = require('../../pay-register/services/payRegisterEmployeeFilter');
    const { EJSON } = require('bson');

    const divF = divisionId && divisionId !== 'all' ? divisionId : undefined;
    const depF = departmentId && departmentId !== 'all' ? departmentId : undefined;
    const groupF = employeeGroupId && employeeGroupId !== 'all' ? employeeGroupId : undefined;
    const searchTrim = search && String(search).trim() ? String(search).trim() : undefined;

    const scopeFilter =
      req.scopeFilter && typeof req.scopeFilter === 'object' && Object.keys(req.scopeFilter).length > 0
        ? req.scopeFilter
        : null;

    const query = await buildPayRegisterEmployeeFilter(leftStart, leftEnd, {
      departmentId: depF,
      divisionId: divF,
      employeeGroupId: groupF,
      search: searchTrim,
      scopeFilter,
    });

    console.log('[Bulk Payroll] Req.scopeFilter keys:', req.scopeFilter ? Object.keys(req.scopeFilter).length : 0);
    console.log('[Bulk Payroll] Filters - Division:', divF, 'Department:', depF, 'Month:', month, 'Search:', searchTrim || '(none)', 'Group:', groupF || '(none)');

    const employees = await Employee.find(query).select('_id');

    console.log('[Bulk Payroll] Found employees:', employees.length);

    if (!employees || employees.length === 0) {
      return res.status(200).json({
        success: false,
        message: 'No employees found matching the filters (active or left in this payroll month)',
      });
    }

    const scopeFilterForJob = scopeFilter != null ? EJSON.serialize(scopeFilter) : null;
    const { payrollQueue } = require('../../shared/jobs/queueManager');
    const job = await payrollQueue.add('payroll_bulk_calculate', {
      action: 'payroll_bulk_calculate',
      month,
      divisionId: divF,
      departmentId: depF,
      employeeGroupId: groupF,
      search: searchTrim,
      strategy,
      userId: req.user._id,
      scopeFilter: scopeFilterForJob,
      arrears: Array.isArray(arrears) ? arrears : [],
      deductions: Array.isArray(deductions) ? deductions : [],
    });

    res.status(202).json({
      success: true,
      status: 'queued',
      message: 'Bulk payroll calculation queued',
      jobId: job.id,
      data: {
        totalEmployees: employees.length
      }
    });

  } catch (error) {
    console.error('Error in bulk payroll calculation:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Internal server error during bulk calculation',
    });
  }
};

/**
 * @desc    Get attendance data for a range of months for an employee (for incremental arrears proration).
 * Uses Pay Register Summary (attendance source) first; falls back to PayrollRecord if no pay register for that month.
 * @route   GET /api/payroll/attendance-range
 * @access  Private
 */
exports.getAttendanceDataRange = async (req, res) => {
  try {
    const { employeeId, startMonth, endMonth } = req.query;

    if (!employeeId || !startMonth || !endMonth) {
      return res.status(400).json({
        success: false,
        message: 'Employee ID, start month, and end month are required'
      });
    }

    const data = await fetchAttendanceDataForEmployeeMonths(employeeId, startMonth, endMonth);

    res.status(200).json({
      success: true,
      data
    });
  } catch (error) {
    console.error('Error fetching attendance data range:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching attendance data range',
      error: error.message
    });
  }
};
