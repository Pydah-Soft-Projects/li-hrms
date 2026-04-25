/**
 * Effective-dated gross salary for payroll / pay register.
 * Future-approved promotion/increment/demotion rows append `grossSalaryRevisions` without changing
 * `gross_salary` until the effective payroll month; payroll for month M uses the latest revision with effective <= M.
 */

const { getPromotionPayrollContext } = require('../../promotions-transfers/services/promotionPayrollCycleContextService');

function payrollYmSortKey(year, month) {
  return Number(year) * 100 + Number(month);
}

/**
 * @param {object} employee — lean or plain with gross_salary and optional grossSalaryRevisions
 * @param {number} payrollYear
 * @param {number} payrollMonth 1–12
 * @returns {number}
 */
function resolveGrossSalaryForPayrollMonth(employee, payrollYear, payrollMonth) {
  if (!payrollYear || !payrollMonth || payrollMonth < 1 || payrollMonth > 12) {
    return Number(employee?.gross_salary) || 0;
  }
  const target = payrollYmSortKey(payrollYear, payrollMonth);
  let bestKey = -1;
  let bestGross = Number(employee?.gross_salary);
  if (!Number.isFinite(bestGross)) bestGross = 0;

  const revs = Array.isArray(employee?.grossSalaryRevisions) ? employee.grossSalaryRevisions : [];
  for (const r of revs) {
    const y = Number(r.effectivePayrollYear);
    const m = Number(r.effectivePayrollMonth);
    if (!y || !m || m < 1 || m > 12) continue;
    const k = payrollYmSortKey(y, m);
    if (k <= target && k > bestKey) {
      bestKey = k;
      bestGross = Number(r.grossSalary) || 0;
    }
  }
  return bestGross;
}

/**
 * True when the promotion effective payroll month is strictly after the current pay cycle month
 * (same notion as promotions UI “ongoing” month from payroll settings).
 *
 * @param {number} effectiveYear
 * @param {number} effectiveMonth 1–12
 * @param {{ divisionId?: unknown; departmentId?: unknown } | null} [employeeScope]
 */
async function isPromotionSalaryEffectiveInFuture(effectiveYear, effectiveMonth, employeeScope) {
  const eff = payrollYmSortKey(effectiveYear, effectiveMonth);
  const ctx = await getPromotionPayrollContext(employeeScope || null);
  const cur = payrollYmSortKey(ctx.currentCycle.year, ctx.currentCycle.month);
  return eff > cur;
}

/**
 * After payroll is calculated for (year, month), align master `gross_salary` with resolved amount
 * so profile / lists show the rate that has “gone live” for that month and beyond.
 *
 * @param {import('mongoose').Types.ObjectId|string} employeeId
 * @param {number} payrollYear
 * @param {number} payrollMonth
 */
async function foldEmployeeMasterGrossAfterPayrollIfNeeded(employeeId, payrollYear, payrollMonth) {
  if (!employeeId) return;
  const Employee = require('../model/Employee');
  const emp = await Employee.findById(employeeId).select('gross_salary grossSalaryRevisions').lean();
  if (!emp) return;
  const resolved = resolveGrossSalaryForPayrollMonth(emp, payrollYear, payrollMonth);
  const cur = Number(emp.gross_salary);
  if (Number.isFinite(resolved) && resolved !== cur) {
    await Employee.updateOne({ _id: employeeId }, { $set: { gross_salary: resolved } });
  }
}

module.exports = {
  payrollYmSortKey,
  resolveGrossSalaryForPayrollMonth,
  isPromotionSalaryEffectiveInFuture,
  foldEmployeeMasterGrossAfterPayrollIfNeeded,
};
