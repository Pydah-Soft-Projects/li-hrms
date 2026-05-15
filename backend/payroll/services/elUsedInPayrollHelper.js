/**
 * EL used in payroll (EL-as-paid days for the cycle).
 *
 * Explicit overrides:
 *   1. options.elUsedInPayroll (including 0 = force no EL for this run)
 *   2. Prior PayrollRecord when status is **processed** — EL days are locked for audit (including 0).
 *   3. payRegisterSummary.totals.elUsedInPayroll when set, **except** when it only mirrors the last
 *      non-processed payroll run (same positive value as PayrollRecord) so dynamic recalc picks up
 *      fresh leave balance after EL / leave register changes.
 *   4. SecondSalaryRecord when status is **processed** — same lock semantics for second salary.
 *
 * If nothing above applies, fall back to the legacy rule:
 *   EL enabled + useAsPaidInPayroll → min(employee EL balance, month days).
 *   Balance is employee.paidLeaves (leave register / profile).
 */

const PayrollRecord = require('../model/PayrollRecord');
const SecondSalaryRecord = require('../model/SecondSalaryRecord');
const { resolveEffectiveEarnedLeaveForDepartment } = require('../../leaves/services/earnedLeavePolicyResolver');

function isProcessedStatus(status) {
  return String(status || '').toLowerCase() === 'processed';
}

/**
 * Prior payroll EL figure when the field is explicitly stored (including 0).
 * @returns {number|null}
 */
function getPriorPayrollElUsedIfExplicit(priorPayrollRecord) {
  if (!priorPayrollRecord) return null;
  const has =
    priorPayrollRecord.elUsedInPayroll !== undefined &&
    priorPayrollRecord.elUsedInPayroll !== null &&
    priorPayrollRecord.elUsedInPayroll !== '';
  const hasAtt =
    priorPayrollRecord.attendance &&
    priorPayrollRecord.attendance.elUsedInPayroll !== undefined &&
    priorPayrollRecord.attendance.elUsedInPayroll !== null &&
    priorPayrollRecord.attendance.elUsedInPayroll !== '';
  if (!has && !hasAtt) return null;
  const p = Number(priorPayrollRecord.elUsedInPayroll ?? priorPayrollRecord.attendance?.elUsedInPayroll);
  if (!Number.isFinite(p) || p < 0) return null;
  return p;
}

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

  const priorProcessed = priorPayrollRecord && isProcessedStatus(priorPayrollRecord.status);
  if (priorProcessed) {
    const locked = getPriorPayrollElUsedIfExplicit(priorPayrollRecord);
    if (locked !== null) return locked;
  }

  const totals = payRegisterSummary?.totals;
  if (totals && Object.prototype.hasOwnProperty.call(totals, 'elUsedInPayroll') && totals.elUsedInPayroll !== null && totals.elUsedInPayroll !== '') {
    const fromPr = Number(totals.elUsedInPayroll);
    if (Number.isFinite(fromPr) && fromPr >= 0) {
      const priorEl = getPriorPayrollElUsedIfExplicit(priorPayrollRecord);
      const staleMirror =
        priorPayrollRecord &&
        !priorProcessed &&
        fromPr > 0 &&
        priorEl !== null &&
        Number(priorEl) === fromPr;
      if (!staleMirror) return fromPr;
    }
  }

  if (priorSecondSalaryRecord && isProcessedStatus(priorSecondSalaryRecord.status) && priorSecondSalaryRecord.attendance) {
    const sRaw = priorSecondSalaryRecord.attendance.elUsedInPayroll;
    if (sRaw !== undefined && sRaw !== null && sRaw !== '') {
      const s = Number(sRaw);
      if (Number.isFinite(s) && s >= 0) return s;
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
    .select('status elUsedInPayroll attendance.elUsedInPayroll')
    .lean();
}

async function loadPriorSecondSalaryRecordLean(employeeId, month) {
  if (!employeeId || !month) return null;
  return SecondSalaryRecord.findOne({ employeeId, month })
    .select('status elUsedInPayroll attendance.elUsedInPayroll')
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
