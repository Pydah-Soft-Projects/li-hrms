/**
 * Payroll calculation driven by config.outputColumns.
 * Steps = output columns in order. For each step: if field → from employee / pay register or via service; if formula → from before columns + context.
 * Result is persisted as PayrollRecord and returned as payslip + row for paysheet.
 */

const PayRegisterSummary = require('../../pay-register/model/PayRegisterSummary');
const Employee = require('../../employees/model/Employee');
const PayrollConfiguration = require('../model/PayrollConfiguration');
const PayrollRecord = require('../model/PayrollRecord');
const PayrollBatch = require('../model/PayrollBatch');
const basicPayService = require('./basicPayService');
const otPayService = require('./otPayService');
const allowanceService = require('./allowanceService');
const deductionService = require('./deductionService');
const loanAdvanceService = require('./loanAdvanceService');
const statutoryDeductionService = require('./statutoryDeductionService');
const PayrollBatchService = require('./payrollBatchService');
const {
  getIncludeMissingFlag,
  mergeWithOverrides,
  getAbsentDeductionSettings,
  buildBaseComponents,
} = require('./allowanceDeductionResolverService');
const LeavePolicySettings = require('../../settings/model/LeavePolicySettings');
const { createISTDate, getPayrollDateRange } = require('../../shared/utils/dateUtils');
const outputColumnService = require('./outputColumnService');

function headerToKey(header) {
  if (!header || typeof header !== 'string') return '';
  return header.trim().toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '') || 'col';
}

// Aliases so formula variable names (e.g. extradays, month_days) match context keys from column headers.
function getContextKeysAndAliases(header) {
  const key = headerToKey(header);
  if (!key) return []; // skip empty
  const keys = [key];
  if (key === 'extra_days') keys.push('extradays');
  if (key === 'monthdays') keys.push('month_days', 'monthday');
  return keys;
}

function setValueByPath(obj, path, value) {
  if (!path || typeof path !== 'string') return;
  const parts = path.trim().split('.').filter(Boolean);
  let cur = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    const p = parts[i];
    if (cur[p] == null || typeof cur[p] !== 'object') cur[p] = {};
    cur = cur[p];
  }
  if (parts.length) cur[parts[parts.length - 1]] = value;
}

function getValueByPath(obj, path) {
  return outputColumnService.getValueByPath(obj, path);
}

/**
 * Build attendance summary and payslip.attendance from PayRegister summary; apply EL logic.
 * Month days and pay-cycle alignment: use getPayrollDateRange (pay cycle start/end from settings) so
 * totalDaysInMonth and present days respect the configured pay cycle.
 */
async function buildAttendanceFromSummary(payRegisterSummary, employee, month) {
  let monthDays = 30;
  try {
    const [year, monthNum] = (month || '').split('-').map(Number);
    if (year && monthNum) {
      const range = await getPayrollDateRange(year, monthNum);
      if (range && typeof range.totalDays === 'number' && range.totalDays > 0) {
        monthDays = range.totalDays;
      } else if (payRegisterSummary.totalDaysInMonth) {
        monthDays = payRegisterSummary.totalDaysInMonth;
      }
    } else if (payRegisterSummary.totalDaysInMonth) {
      monthDays = payRegisterSummary.totalDaysInMonth;
    }
  } catch (e) {
    if (payRegisterSummary.totalDaysInMonth) monthDays = payRegisterSummary.totalDaysInMonth;
  }
  let payableShifts = payRegisterSummary.totals?.totalPayableShifts || 0;
  let paidLeaveDays = payRegisterSummary.totals?.totalPaidLeaveDays || 0;
  let elUsedInPayroll = 0;
  try {
    const policy = await LeavePolicySettings.getSettings();
    if (policy.earnedLeave && policy.earnedLeave.useAsPaidInPayroll !== false) {
      const elBalance = Math.max(0, Number(employee.paidLeaves) || 0);
      if (elBalance > 0) {
        elUsedInPayroll = Math.min(elBalance, monthDays);
        payableShifts += elUsedInPayroll;
        paidLeaveDays += elUsedInPayroll;
      }
    }
  } catch (e) { /* ignore */ }
  const presentDays = payRegisterSummary.totals?.totalPresentDays || 0;
  const odDays = payRegisterSummary.totals?.totalODDays || 0;
  const weeklyOffs = payRegisterSummary.totals?.totalWeeklyOffs || 0;
  const holidays = payRegisterSummary.totals?.totalHolidays || 0;
  const absentDays = Math.max(0, monthDays - presentDays - weeklyOffs - holidays - paidLeaveDays);
  const lopDays = payRegisterSummary.totals?.totalLopDays ?? payRegisterSummary.totals?.lopDays ?? 0;
  const otHours = payRegisterSummary.totals?.totalOTHours || 0;
  const otDays = payRegisterSummary.totals?.totalOTDays || 0;
  const lateCount = (payRegisterSummary.totals?.lateCount || 0) + (payRegisterSummary.totals?.earlyOutCount || 0);

  const attendanceSummary = {
    totalDaysInMonth: monthDays,
    totalPresentDays: presentDays,
    totalPaidLeaveDays: paidLeaveDays,
    totalODDays: odDays,
    totalWeeklyOffs: weeklyOffs,
    totalHolidays: holidays,
    totalPayableShifts: payableShifts,
    totalOTHours: otHours,
    totalOTDays: otDays,
    totalLeaveDays: payRegisterSummary.totals?.totalLeaveDays || 0,
    lateCount,
    earlyOutCount: payRegisterSummary.totals?.earlyOutCount || 0,
  };

  const attendance = {
    totalDaysInMonth: monthDays,
    presentDays,
    paidLeaveDays,
    odDays,
    weeklyOffs,
    holidays,
    absentDays,
    payableShifts,
    extraDays: payRegisterSummary.totals?.extraDays ?? 0,
    totalPaidDays: 0,
    otHours,
    otDays,
    earnedSalary: 0,
    lopDays,
    elUsedInPayroll,
    attendanceDeductionDays: 0,
  };

  return { attendanceSummary, attendance };
}

/**
 * Resolve a field value: from employee, from attendance (pay register), or by calling the right service.
 * Fills record with the computed block when a service is called.
 */
async function resolveFieldValue(fieldPath, employee, employeeId, month, payRegisterSummary, record, attendanceSummary, departmentId, divisionId) {
  const path = (fieldPath || '').trim();
  if (!path) return 0;

  // employee.* display fields (name, designation, emp_no, etc.) — return as-is, never coerce to number
  if (path.startsWith('employee.')) {
    const key = path.slice('employee.'.length);
    const emp = record.employee || {};
    let v = emp[key];
    if (v === undefined || v === null) v = key === 'name' ? (employee?.employee_name ?? '') : (employee?.[key] ?? '');
    return v;
  }

  // Already in record (from a previous step)? Coerce only numeric paths.
  const existing = getValueByPath(record, path);
  if (existing !== '' && existing !== undefined && existing !== null) {
    if (typeof existing === 'number' && !Number.isNaN(existing)) return existing;
    const num = Number(existing);
    if (!Number.isNaN(num)) return num;
    return 0;
  }

  // attendance.* from our built attendance
  if (path.startsWith('attendance.')) {
    const val = getValueByPath(record, path);
    return typeof val === 'number' ? val : Number(val) || 0;
  }

  // earnings.basicPay, perDayBasicPay, etc. → basicPayService
  if (path.startsWith('earnings.basicPay') || path.startsWith('earnings.perDayBasicPay') || path === 'earnings.payableAmount' || path === 'earnings.incentive') {
    const basicPayResult = basicPayService.calculateBasicPay(employee, attendanceSummary);
    const basicPay = basicPayResult.basicPay || 0;
    const perDaySalary = basicPayResult.perDayBasicPay || 0;
    const earnedSalary = basicPayResult.basePayForWork || 0;
    const incentiveAmount = basicPayResult.incentive || 0;
    const extraDays = basicPayResult.incentiveDays || 0;
    const totalPaidDays = (basicPayResult.physicalUnits || 0) + extraDays;
    if (!record.earnings) record.earnings = {};
    record.earnings.basicPay = basicPay;
    record.earnings.perDayBasicPay = perDaySalary;
    record.earnings.payableAmount = earnedSalary;
    record.earnings.earnedSalary = earnedSalary;
    record.earnings.incentive = incentiveAmount;
    if (!record.attendance) record.attendance = {};
    record.attendance.extraDays = extraDays;
    record.attendance.totalPaidDays = totalPaidDays;
    record.attendance.earnedSalary = earnedSalary;
    if (path === 'earnings.basicPay') return basicPay;
    if (path === 'earnings.perDayBasicPay') return perDaySalary;
    if (path === 'earnings.payableAmount' || path === 'earnings.earnedSalary') return earnedSalary;
    if (path === 'earnings.incentive') return incentiveAmount;
    return basicPay;
  }

  // earnings.otPay, otHours, otRatePerHour
  if (path.startsWith('earnings.ot')) {
    const departmentIdStr = (employee?.department_id?._id || employee?.department_id)?.toString() || departmentId?.toString();
    const otPayResult = await otPayService.calculateOTPay(attendanceSummary.totalOTHours || 0, departmentIdStr);
    if (!record.earnings) record.earnings = {};
    record.earnings.otPay = otPayResult.otPay || 0;
    record.earnings.otHours = attendanceSummary.totalOTHours || 0;
    record.earnings.otRatePerHour = otPayResult.otPayPerHour || 0;
    if (path === 'earnings.otPay') return record.earnings.otPay;
    if (path === 'earnings.otHours') return record.earnings.otHours;
    if (path === 'earnings.otRatePerHour') return record.earnings.otRatePerHour;
    return record.earnings.otPay || 0;
  }

  // earnings.allowances, totalAllowances, allowancesCumulative
  if (path.startsWith('earnings.allowances') || path === 'earnings.totalAllowances' || path === 'earnings.allowancesCumulative') {
    const basicPay = Number(record.earnings?.basicPay) || 0;
    const earnedSalary = Number(record.earnings?.payableAmount ?? record.earnings?.earnedSalary) || 0;
    const otPay = Number(record.earnings?.otPay) || 0;
    let grossSoFar = earnedSalary + otPay;
    const attendanceData = {
      presentDays: record.attendance?.presentDays ?? 0,
      paidLeaveDays: record.attendance?.paidLeaveDays ?? 0,
      odDays: record.attendance?.odDays ?? 0,
      monthDays: record.attendance?.totalDaysInMonth ?? 30,
    };
    const includeMissing = await getIncludeMissingFlag(departmentId, divisionId);
    const { allowances: baseAllowances } = await buildBaseComponents(departmentId, basicPay, attendanceData, employee?.division_id);
    const normalized = (employee?.employeeAllowances || []).filter((o) => o && (o.masterId || o.name)).map((o) => ({ ...o, category: 'allowance' }));
    const resolvedAllowances = mergeWithOverrides(baseAllowances, normalized, includeMissing);
    let totalAllowances = 0;
    const allowanceBreakdown = (resolvedAllowances || [])
      .filter((a) => a && a.name)
      .map((a) => {
        const baseAmount = (a.base || '').toLowerCase() === 'gross' ? grossSoFar : earnedSalary;
        const amount = allowanceService.calculateAllowanceAmount(a, baseAmount, grossSoFar, attendanceData);
        totalAllowances += amount;
        return { name: a.name, amount, type: a.type || 'fixed', base: (a.base || '').toLowerCase() === 'gross' ? 'gross' : 'basic' };
      });
    grossSoFar += totalAllowances;
    if (!record.earnings) record.earnings = {};
    record.earnings.allowances = allowanceBreakdown;
    record.earnings.totalAllowances = totalAllowances;
    record.earnings.allowancesCumulative = totalAllowances;
    record.earnings.grossSalary = grossSoFar;
    if (path === 'earnings.totalAllowances' || path === 'earnings.allowancesCumulative') return totalAllowances;
    if (path === 'earnings.grossSalary') return grossSoFar;
    return totalAllowances;
  }

  // deductions.attendanceDeduction
  if (path.startsWith('deductions.attendanceDeduction')) {
    const perDaySalary = Number(record.earnings?.perDayBasicPay) || 0;
    const attendanceDeductionResult = await deductionService.calculateAttendanceDeduction(
      employeeId, month, departmentId, perDaySalary, employee?.division_id
    );
    const amt = attendanceDeductionResult.attendanceDeduction || 0;
    if (!record.deductions) record.deductions = {};
    record.deductions.attendanceDeduction = amt;
    record.deductions.attendanceDeductionBreakdown = attendanceDeductionResult.breakdown || {};
    record.attendance.attendanceDeductionDays = attendanceDeductionResult.breakdown?.daysDeducted ?? 0;
    return amt;
  }

  // deductions.otherDeductions, totalOtherDeductions
  if (path.startsWith('deductions.other') || path === 'deductions.totalOtherDeductions') {
    const earnedSalary = Number(record.earnings?.payableAmount ?? record.earnings?.earnedSalary) || 0;
    const grossSalary = Number(record.earnings?.grossSalary) || 0;
    const attendanceData = {
      presentDays: record.attendance?.presentDays ?? 0,
      paidLeaveDays: record.attendance?.paidLeaveDays ?? 0,
      odDays: record.attendance?.odDays ?? 0,
      monthDays: record.attendance?.totalDaysInMonth ?? 30,
    };
    const includeMissing = await getIncludeMissingFlag(departmentId, divisionId);
    const { deductions: baseDeductions } = await buildBaseComponents(departmentId, record.earnings?.basicPay || 0, attendanceData, employee?.division_id);
    const normalized = (employee?.employeeDeductions || []).filter((o) => o && (o.masterId || o.name)).map((o) => ({ ...o, category: 'deduction' }));
    const resolvedDeductions = mergeWithOverrides(baseDeductions, normalized, includeMissing);
    let totalOther = 0;
    const otherBreakdown = (resolvedDeductions || [])
      .filter((d) => d && d.name)
      .map((d) => {
        const baseAmount = (d.base || '').toLowerCase() === 'gross' ? grossSalary : earnedSalary;
        const amount = deductionService.calculateDeductionAmount(d, baseAmount, grossSalary, attendanceData);
        totalOther += amount;
        return { name: d.name, amount, type: d.type || 'fixed', base: (d.base || '').toLowerCase() === 'gross' ? 'gross' : 'basic' };
      });
    const attendanceDed = Number(record.deductions?.attendanceDeduction) || 0;
    if (!record.deductions) record.deductions = {};
    record.deductions.otherDeductions = otherBreakdown;
    record.deductions.totalOtherDeductions = totalOther;
    return path === 'deductions.totalOtherDeductions' ? totalOther : totalOther;
  }

  // deductions.statutoryDeductions, statutoryCumulative
  if (path.startsWith('deductions.statutory')) {
    const basicPay = Number(record.earnings?.basicPay) || 0;
    const grossSalary = Number(record.earnings?.grossSalary) || 0;
    const earnedSalary = Number(record.earnings?.payableAmount ?? record.earnings?.earnedSalary) || 0;
    const statutoryResult = await statutoryDeductionService.calculateStatutoryDeductions({
      basicPay, grossSalary, earnedSalary, dearnessAllowance: 0,
    });
    const totalStatutory = statutoryResult.totalEmployeeShare || 0;
    if (!record.deductions) record.deductions = {};
    record.deductions.statutoryDeductions = (statutoryResult.breakdown || []).map((s) => ({
      name: s.name, code: s.code, employeeAmount: s.employeeAmount, employerAmount: s.employerAmount,
    }));
    record.deductions.statutoryCumulative = totalStatutory;
    record.deductions.totalStatutoryEmployee = totalStatutory;
    return totalStatutory;
  }

  // loanAdvance.totalEMI, advanceDeduction, remainingBalance (cumulative loans remaining after EMI)
  if (path.startsWith('loanAdvance.')) {
    const loanAdvanceResult = await loanAdvanceService.calculateLoanAdvance(employeeId, month);
    if (!record.loanAdvance) record.loanAdvance = {};
    record.loanAdvance.totalEMI = loanAdvanceResult.totalEMI || 0;
    record.loanAdvance.advanceDeduction = loanAdvanceResult.advanceDeduction || 0;
    record.loanAdvance.remainingBalance = loanAdvanceResult.remainingBalance ?? 0;
    if (path === 'loanAdvance.totalEMI') return record.loanAdvance.totalEMI;
    if (path === 'loanAdvance.advanceDeduction') return record.loanAdvance.advanceDeduction;
    if (path === 'loanAdvance.remainingBalance') return record.loanAdvance.remainingBalance;
    return record.loanAdvance.totalEMI || 0;
  }

  // arrears.arrearsAmount — from arrears service (pending approved/partially_settled with remainingAmount > 0)
  if (path.startsWith('arrears.')) {
    try {
      const pendingArrears = await ArrearsPayrollIntegrationService.getPendingArrearsForPayroll(employeeId);
      const arrearsAmount = (pendingArrears || []).reduce((sum, ar) => sum + (ar.remainingAmount || 0), 0);
      if (!record.arrears) record.arrears = { arrearsAmount: 0, arrearsSettlements: [] };
      record.arrears.arrearsAmount = Math.round(arrearsAmount * 100) / 100;
      if (path === 'arrears.arrearsAmount') return record.arrears.arrearsAmount;
      return record.arrears.arrearsAmount;
    } catch (e) {
      if (!record.arrears) record.arrears = { arrearsAmount: 0, arrearsSettlements: [] };
      record.arrears.arrearsAmount = 0;
      return 0;
    }
  }

  // deductions.deductionsCumulative, totalDeductions (sum of all)
  if (path === 'deductions.deductionsCumulative' || path === 'deductions.totalDeductions') {
    const att = Number(record.deductions?.attendanceDeduction) || 0;
    const other = Number(record.deductions?.totalOtherDeductions) || 0;
    const statutory = Number(record.deductions?.statutoryCumulative) || 0;
    const loanEMI = Number(record.loanAdvance?.totalEMI) || 0;
    const advance = Number(record.loanAdvance?.advanceDeduction) || 0;
    const total = att + other + statutory + loanEMI + advance;
    if (!record.deductions) record.deductions = {};
    record.deductions.deductionsCumulative = total;
    record.deductions.totalDeductions = total;
    return total;
  }

  // netSalary, roundOff (derive at end if needed)
  if (path === 'netSalary' || path === 'roundOff') {
    const gross = Number(record.earnings?.grossSalary) || 0;
    let totalDed = Number(record.deductions?.totalDeductions) || 0;
    if (totalDed === 0) {
      totalDed =
        (Number(record.deductions?.attendanceDeduction) || 0)
        + (Number(record.deductions?.totalOtherDeductions) || 0)
        + (Number(record.deductions?.statutoryCumulative) || 0)
        + (Number(record.loanAdvance?.totalEMI) || 0)
        + (Number(record.loanAdvance?.advanceDeduction) || 0);
      if (!record.deductions) record.deductions = {};
      record.deductions.totalDeductions = totalDed;
      record.deductions.deductionsCumulative = totalDed;
    }
    const exactNet = Math.max(0, gross - totalDed);
    const roundedNet = Math.ceil(exactNet);
    const roundOffAmt = Number((roundedNet - exactNet).toFixed(2));
    record.netSalary = roundedNet;
    record.roundOff = roundOffAmt;
    return path === 'netSalary' ? roundedNet : roundOffAmt;
  }

  return getValueByPath(record, path) ?? 0;
}

/**
 * Calculate payroll for one employee using config.outputColumns as steps.
 * Persists PayrollRecord and returns { payrollRecord, payslip, row }.
 */
async function calculatePayrollFromOutputColumns(employeeId, month, userId, options = {}) {
  const employee = await Employee.findById(employeeId).populate('department_id designation_id division_id');
  if (!employee) throw new Error('Employee not found');

  const payRegisterSummary = await PayRegisterSummary.findOne({ employeeId, month });
  if (!payRegisterSummary) throw new Error('Pay register not found for this month');

  const config = await PayrollConfiguration.get();
  const outputColumns = Array.isArray(config?.outputColumns) ? config.outputColumns : [];
  const sorted = [...outputColumns].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));

  const departmentId = (employee.department_id?._id || employee.department_id)?.toString();
  const divisionId = (employee.division_id?._id || employee.division_id)?.toString();

  const { attendanceSummary, attendance } = await buildAttendanceFromSummary(payRegisterSummary, employee, month);

  const record = {
    month: createISTDate(`${month}-01`).toLocaleString('en-IN', { month: 'long', year: 'numeric', timeZone: 'Asia/Kolkata' }),
    monthNumber: Number(month.split('-')[1]),
    year: Number(month.split('-')[0]),
    employee: {
      emp_no: employee.emp_no || '',
      name: employee.employee_name || 'N/A',
      department: employee.department_id?.name || 'N/A',
      division: employee.division_id?.name || 'N/A',
      designation: employee.designation_id?.name || 'N/A',
      location: employee.location || '',
      bank_account_no: employee.bank_account_no || '',
      bank_name: employee.bank_name || '',
      payment_mode: employee.salary_mode || '',
      date_of_joining: employee.doj || '',
      pf_number: employee.pf_number || '',
      esi_number: employee.esi_number || '',
    },
    attendance,
    earnings: {},
    deductions: {},
    loanAdvance: {},
    arrears: { arrearsAmount: 0, arrearsSettlements: [] },
    netSalary: 0,
    roundOff: 0,
    status: 'calculated',
  };

  const context = { ...outputColumnService.getContextFromPayslip(record) };
  const row = {};

  for (const col of sorted) {
    const header = col.header || 'Column';
    let val;
    if (col.source === 'formula') {
      // Formula column: use formula only; ignore field (ensures robustness even if field is set by mistake).
      val = (col.formula && outputColumnService.safeEvalFormula(col.formula, context)) ?? 0;
    } else {
      // Field column: resolve value from employee/attendance/earnings/deductions/etc. via col.field.
      val = await resolveFieldValue(
        col.field || '', employee, employeeId, month, payRegisterSummary,
        record, attendanceSummary, departmentId, divisionId
      );
    }
    row[header] = val;
    const numForContext = typeof val === 'number' && !Number.isNaN(val) ? val : (Number(val) || 0);
    for (const k of getContextKeysAndAliases(header)) context[k] = numForContext;
    // Only field columns write to record; formula columns do not use field.
    if (col.source === 'field' && col.field) setValueByPath(record, col.field, val);
  }

  // Ensure net and roundOff
  const gross = Number(record.earnings?.grossSalary) || 0;
  const totalDed = Number(record.deductions?.totalDeductions) || 0;
  if (record.netSalary === 0 && totalDed > 0) {
    const exactNet = Math.max(0, gross - totalDed);
    record.netSalary = Math.ceil(exactNet);
    record.roundOff = Number((record.netSalary - exactNet).toFixed(2));
  } else if (record.netSalary === 0) {
    record.netSalary = Math.ceil(gross);
    record.roundOff = 0;
  }

  // Persist PayrollRecord (same shape as previous calculation)
  let payrollRecord = await PayrollRecord.findOne({ employeeId, month });
  const monthDays = record.attendance?.totalDaysInMonth || 30;
  const payableShifts = (record.attendance?.payableShifts ?? payRegisterSummary.totals?.totalPayableShifts) || 0;
  const elUsedInPayroll = record.attendance?.elUsedInPayroll ?? 0;

  if (!payrollRecord) {
    payrollRecord = new PayrollRecord({
      employeeId,
      emp_no: employee.emp_no,
      month,
      monthName: record.month,
      year: record.year,
      monthNumber: record.monthNumber,
      totalDaysInMonth: monthDays,
    });
  }

  payrollRecord.set('totalPayableShifts', payableShifts);
  payrollRecord.set('elUsedInPayroll', elUsedInPayroll);
  payrollRecord.set('division_id', employee.division_id);
  payrollRecord.set('status', 'calculated');
  payrollRecord.set('netSalary', Number(record.netSalary) || 0);
  payrollRecord.set('roundOff', Number(record.roundOff) || 0);
  payrollRecord.set('attendance', record.attendance || {});
  payrollRecord.set('earnings', record.earnings || {});
  payrollRecord.set('deductions', record.deductions || {});
  payrollRecord.set('loanAdvance', record.loanAdvance || {});
  payrollRecord.markModified('attendance');
  payrollRecord.markModified('earnings');
  payrollRecord.markModified('deductions');
  payrollRecord.markModified('loanAdvance');
  await payrollRecord.save();

  let batchId = null;
  try {
    if (employee.department_id) {
      let batch = await PayrollBatch.findOne({
        department: employee.department_id,
        division: employee.division_id,
        month,
      });
      if (!batch) {
        batch = await PayrollBatchService.createBatch(employee.department_id, employee.division_id, month, userId);
      }
      if (batch) {
        await PayrollBatchService.addPayrollToBatch(batch._id, payrollRecord._id);
        batchId = batch._id;
      }
    }
  } catch (e) {
    console.error('[PayrollFromOutputColumns] Batch update error:', e.message);
  }

  return {
    success: true,
    payrollRecord,
    batchId,
    payslip: record,
    row,
  };
}

module.exports = {
  calculatePayrollFromOutputColumns,
  buildAttendanceFromSummary,
  resolveFieldValue,
};
