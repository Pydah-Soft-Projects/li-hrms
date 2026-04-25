/**
 * Recompute policy attendance deduction days on PayRegisterSummary using the same engine as
 * MonthlyAttendanceSummary / payroll deductionService (live calc, ignoring stored MAS & PR snapshots).
 */

const Employee = require('../../employees/model/Employee');
const deductionService = require('../../payroll/services/deductionService');
const { getAbsentDeductionSettings } = require('../../payroll/services/allowanceDeductionResolverService');
const { resolveGrossSalaryForPayrollMonth } = require('../../employees/services/employeeGrossSalaryResolver');

function normalizeBreakdown(b) {
  if (!b || typeof b !== 'object') {
    return {
      lateInsCount: 0,
      earlyOutsCount: 0,
      combinedCount: 0,
      freeAllowedPerMonth: 0,
      effectiveCount: 0,
      daysDeducted: 0,
      lateEarlyDaysDeducted: 0,
      absentExtraDays: 0,
      absentDays: 0,
      lopDaysPerAbsent: null,
      deductionType: null,
      calculationMode: null,
    };
  }
  const z = (n) => (Number.isFinite(Number(n)) ? Number(n) : 0);
  return {
    lateInsCount: z(b.lateInsCount),
    earlyOutsCount: z(b.earlyOutsCount),
    combinedCount: z(b.combinedCount),
    freeAllowedPerMonth: z(b.freeAllowedPerMonth),
    effectiveCount: z(b.effectiveCount),
    daysDeducted: z(b.daysDeducted),
    lateEarlyDaysDeducted: z(b.lateEarlyDaysDeducted),
    absentExtraDays: z(b.absentExtraDays),
    absentDays: z(b.absentDays),
    lopDaysPerAbsent: b.lopDaysPerAbsent != null ? Number(b.lopDaysPerAbsent) : null,
    deductionType: b.deductionType != null ? String(b.deductionType) : null,
    calculationMode: b.calculationMode != null ? String(b.calculationMode) : null,
  };
}

/**
 * Mutates pay register document: sets totalAttendanceDeductionDays, attendanceDeductionBreakdown,
 * attendanceDeductionCalculatedAt. Safe to call with mongoose doc or hydrated object with totals set.
 *
 * @param {import('mongoose').Document|Object} payRegister
 * @returns {Promise<void>}
 */
async function recalculatePayRegisterAttendanceDeduction(payRegister) {
  if (!payRegister || !payRegister.month) return;

  const rawEmpId = payRegister.employeeId;
  const employeeId = rawEmpId && rawEmpId._id ? rawEmpId._id : rawEmpId;
  if (!employeeId) return;

  const employee = await Employee.findById(employeeId)
    .select(
      'gross_salary grossSalaryRevisions department_id division_id applyAttendanceDeduction deductLateIn deductEarlyOut deductAbsent emp_no'
    )
    .lean();

  if (!employee || !employee.department_id) {
    payRegister.totalAttendanceDeductionDays = 0;
    payRegister.attendanceDeductionBreakdown = normalizeBreakdown(null);
    payRegister.attendanceDeductionCalculatedAt = new Date();
    if (typeof payRegister.markModified === 'function') {
      payRegister.markModified('attendanceDeductionBreakdown');
    }
    return;
  }

  const monthStr = payRegister.month;
  const totalDaysInMonth =
    Number(payRegister.totalDaysInMonth) > 0
      ? Number(payRegister.totalDaysInMonth)
      : 30;
  const [prY, prM] = String(monthStr || '')
    .split('-')
    .map((n) => parseInt(n, 10));
  const gross = resolveGrossSalaryForPayrollMonth(employee, prY, prM);
  const perDayBasicPay =
    totalDaysInMonth > 0 ? Math.round((gross / totalDaysInMonth) * 100) / 100 : 0;

  const absentSettings = await getAbsentDeductionSettings(
    String(employee.department_id),
    employee.division_id ? String(employee.division_id) : null
  );

  const totals = payRegister.totals || {};
  const absentDays = Number(totals.totalAbsentDays) || 0;

  let startStr = payRegister.startDate;
  let endStr = payRegister.endDate;
  if (!startStr || !endStr) {
    const [y, m] = monthStr.split('-').map(Number);
    const { getPayrollDateRange } = require('../../shared/utils/dateUtils');
    const range = await getPayrollDateRange(y, m);
    startStr = range.startDate;
    endStr = range.endDate;
  }

  const attDed = await deductionService.calculateAttendanceDeduction(
    employeeId,
    monthStr,
    String(employee.department_id),
    perDayBasicPay,
    employee.division_id ? String(employee.division_id) : null,
    {
      employee,
      absentDays,
      enableAbsentDeduction: absentSettings.enableAbsentDeduction,
      lopDaysPerAbsent: absentSettings.lopDaysPerAbsent,
      ignoreMonthlySummary: true,
      ignorePayRegisterSummary: true,
      periodStartDateStr: startStr,
      periodEndDateStr: endStr,
      usePayRegisterLateEarlyCounts: true,
      payRegisterLateInsCount: Number(totals.lateCount) || 0,
      payRegisterEarlyOutsCount: Number(totals.earlyOutCount) || 0,
    }
  );

  const br = normalizeBreakdown(attDed.breakdown);
  const days = Math.round((Number(br.daysDeducted) || 0) * 100) / 100;

  payRegister.totalAttendanceDeductionDays = days;
  payRegister.attendanceDeductionBreakdown = br;
  payRegister.attendanceDeductionCalculatedAt = new Date();
  if (typeof payRegister.markModified === 'function') {
    payRegister.markModified('attendanceDeductionBreakdown');
  }
}

module.exports = {
  recalculatePayRegisterAttendanceDeduction,
  normalizeBreakdown,
};
