/**
 * EL used in payroll (EL-as-paid days for the cycle).
 *
 * Explicit overrides:
 *   1. options.elUsedInPayroll (including 0 = force no EL for this run)
 *   2. payRegisterSummary.totals.elUsedInPayroll when the field exists (including 0 = force no EL)
 *   3. prior PayrollRecord / SecondSalaryRecord: only values **> 0** lock the amount. Stored **0** is treated
 *      as “no EL applied yet” so recalculation after EL is credited still uses the current balance fallback.
 *
 * If nothing above applies, fall back to the legacy rule (same as before paid-leave auto-add):
 *   EL enabled + useAsPaidInPayroll → min(employee EL balance, month days).
 *   Balance is employee.paidLeaves (same field the leave register / profile uses for EL).
 */

const PayrollRecord = require('../model/PayrollRecord');
const SecondSalaryRecord = require('../model/SecondSalaryRecord');
const { resolveEffectiveEarnedLeaveForDepartment } = require('../../leaves/services/earnedLeavePolicyResolver');

/**
 * Explicit EL-used only (no policy fallback). Returns null when nothing is configured
 * so callers can apply leave-balance fallback.
 * @returns {number|null}
 */
function getExplicitElUsedRawFromSources({ payRegisterSummary, priorPayrollRecord, priorSecondSalaryRecord, options }) {
  if (options && options.elUsedInPayroll !== undefined && options.elUsedInPayroll !== null && options.elUsedInPayroll !== '') {
    const n = Number(options.elUsedInPayroll);
    if (Number.isFinite(n) && n >= 0) return n;
  }
  const totals = payRegisterSummary?.totals;
  if (totals && Object.prototype.hasOwnProperty.call(totals, 'elUsedInPayroll') && totals.elUsedInPayroll !== null && totals.elUsedInPayroll !== '') {
    const fromPr = Number(totals.elUsedInPayroll);
    if (Number.isFinite(fromPr) && fromPr >= 0) return fromPr;
  }
  if (priorPayrollRecord) {
    const has =
      priorPayrollRecord.elUsedInPayroll !== undefined &&
      priorPayrollRecord.elUsedInPayroll !== null &&
      priorPayrollRecord.elUsedInPayroll !== '';
    const hasAtt =
      priorPayrollRecord.attendance &&
      priorPayrollRecord.attendance.elUsedInPayroll !== undefined &&
      priorPayrollRecord.attendance.elUsedInPayroll !== null &&
      priorPayrollRecord.attendance.elUsedInPayroll !== '';
    if (has || hasAtt) {
      const p = Number(priorPayrollRecord.elUsedInPayroll ?? priorPayrollRecord.attendance?.elUsedInPayroll);
      // Do not lock on 0: first payroll run often saves 0 before EL is credited; recalc must use fresh balance.
      if (Number.isFinite(p) && p > 0) return p;
    }
  }
  if (priorSecondSalaryRecord?.attendance) {
    const sRaw = priorSecondSalaryRecord.attendance.elUsedInPayroll;
    if (sRaw !== undefined && sRaw !== null && sRaw !== '') {
      const s = Number(sRaw);
      if (Number.isFinite(s) && s > 0) return s;
    }
  }
  return null;
}

/**
 * When no explicit EL-used is stored, use policy + employee EL balance (legacy payroll behaviour).
 */
async function getPolicyFallbackElUsedRaw(employee, departmentId, divisionId, monthDays) {
  try {
    const effectiveEL = await resolveEffectiveEarnedLeaveForDepartment(departmentId, divisionId);
    if (!effectiveEL.enabled || effectiveEL.useAsPaidInPayroll === false) return 0;
    const elBalance = Math.max(0, Number(employee.paidLeaves) || 0);
    if (elBalance <= 0) return 0;
    const capDays = Math.max(1, Number(monthDays) || 30);
    return Math.min(elBalance, capDays);
  } catch {
    return 0;
  }
}

/**
 * Raw EL days for payroll: explicit chain first, then legacy balance cap.
 */
async function resolveElUsedRawForPayroll({
  payRegisterSummary,
  priorPayrollRecord,
  priorSecondSalaryRecord,
  options,
  employee,
  departmentId,
  divisionId,
  monthDays,
}) {
  const explicit = getExplicitElUsedRawFromSources({
    payRegisterSummary,
    priorPayrollRecord,
    priorSecondSalaryRecord,
    options,
  });
  if (explicit !== null) return explicit;
  return getPolicyFallbackElUsedRaw(employee, departmentId, divisionId, monthDays);
}

async function loadPriorPayrollRecordLean(employeeId, month) {
  if (!employeeId || !month) return null;
  return PayrollRecord.findOne({ employeeId, month })
    .select('elUsedInPayroll attendance.elUsedInPayroll')
    .lean();
}

async function loadPriorSecondSalaryRecordLean(employeeId, month) {
  if (!employeeId || !month) return null;
  return SecondSalaryRecord.findOne({ employeeId, month })
    .select('elUsedInPayroll attendance.elUsedInPayroll')
    .lean();
}

async function capElUsedForPolicy(departmentId, divisionId, employee, rawDays, monthDays) {
  const n = Math.max(0, Number(rawDays) || 0);
  if (n <= 0) return 0;
  try {
    const effectiveEL = await resolveEffectiveEarnedLeaveForDepartment(departmentId, divisionId);
    if (!effectiveEL.enabled || effectiveEL.useAsPaidInPayroll === false) return 0;
    const elBalance = Math.max(0, Number(employee.paidLeaves) || 0);
    const capDays = Math.max(1, Number(monthDays) || 30);
    return Math.min(n, elBalance, capDays);
  } catch {
    return 0;
  }
}

/**
 * EL-as-paid is returned only as `elUsedInPayroll` for a separate paysheet column.
 * Paid leave and payable shifts stay pay-register only; basic pay adds `elUsedInPayroll` separately.
 *
 * @returns {{ elUsedInPayroll: number, paidLeaveDays: number, payableShifts: number }}
 */
async function applyExplicitElToPaidLeaveAndPayable({
  basePaidLeaveDays,
  basePayableShifts,
  explicitRaw,
  employee,
  departmentId,
  divisionId,
  monthDays,
}) {
  const elUsedInPayroll = await capElUsedForPolicy(departmentId, divisionId, employee, explicitRaw, monthDays);
  const basePaid = Number(basePaidLeaveDays) || 0;
  const basePayable = Number(basePayableShifts) || 0;
  return {
    elUsedInPayroll,
    paidLeaveDays: basePaid,
    payableShifts: basePayable,
  };
}

module.exports = {
  getExplicitElUsedRawFromSources,
  resolveElUsedRawForPayroll,
  getPolicyFallbackElUsedRaw,
  loadPriorPayrollRecordLean,
  loadPriorSecondSalaryRecordLean,
  capElUsedForPolicy,
  applyExplicitElToPaidLeaveAndPayable,
};
