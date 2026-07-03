/**
 * Shared query builder for payroll employee selection.
 * Used by: shared/jobs/worker.js (bulk regular + second salary), secondSalaryService.js,
 * payrollController bulk calculate, and scripts that need the same employee lists.
 *
 * When leftDateRange is provided, includes: active employees (no left date, or leaving after this period),
 * OR employees who left during this pay period.
 */

const mongoose = require('mongoose');

function toObjectIdIfValid(id) {
  if (id == null || id === '' || id === 'all') return null;
  if (id instanceof mongoose.Types.ObjectId) return id;
  const s = String(id);
  if (mongoose.Types.ObjectId.isValid(s) && String(new mongoose.Types.ObjectId(s)) === s) {
    return new mongoose.Types.ObjectId(s);
  }
  return null;
}

/**
 * Parse a single id, comma-separated string, or array of ids into a de-duplicated ObjectId[].
 * Ignores empty/'all'/invalid entries. Used for multi-select division/department filters.
 */
function toObjectIdList(raw) {
  if (raw == null || raw === '' || raw === 'all') return [];
  const parts = Array.isArray(raw) ? raw : String(raw).split(',');
  const seen = new Set();
  const out = [];
  for (const part of parts) {
    const oid = toObjectIdIfValid(part);
    if (!oid) continue;
    const key = String(oid);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(oid);
  }
  return out;
}

/**
 * Full employee match for POST /payroll/bulk-calculate (and worker replay).
 * Combines data-scope filter + division/department + payroll-month employment rule (active or left in period).
 * Uses $and so req.scopeFilter.$or is preserved (spread + overwriting $or was incorrect).
 *
 * @param {Object|null|undefined} scopeFilter - req.scopeFilter from applyScopeFilter (may be {})
 * @param {string|null|undefined} divisionId
 * @param {string|null|undefined} departmentId
 * @param {Date} rangeStart - UTC start (inclusive) of payroll period for leftDate
 * @param {Date} rangeEnd - UTC end (inclusive) of payroll period for leftDate
 * @returns {Object} MongoDB query for Employee.find()
 */
function buildPayrollBulkEmployeeQuery(scopeFilter, divisionId, departmentId, rangeStart, rangeEnd, designationId, employeeGroupId) {
  const employmentOr = {
    $or: [
      // Active (or legacy null is_active): still employed through the period
      { is_active: { $ne: false }, leftDate: null },
      // Active with a future exit: still employed for this entire pay period (left after period end)
      { is_active: { $ne: false }, leftDate: { $gt: rangeEnd } },
      // Left during this pay period (leftDate within cycle start–end)
      { leftDate: { $gte: rangeStart, $lte: rangeEnd } },
    ],
  };

  const andParts = [];

  if (scopeFilter && typeof scopeFilter === 'object' && Object.keys(scopeFilter).length > 0) {
    andParts.push(scopeFilter);
  }
  andParts.push(employmentOr);

  const divs = toObjectIdList(divisionId);
  const depts = toObjectIdList(departmentId);
  const des = toObjectIdIfValid(designationId);
  const grp = toObjectIdIfValid(employeeGroupId);
  if (divs.length) andParts.push({ division_id: divs.length === 1 ? divs[0] : { $in: divs } });
  if (depts.length) andParts.push({ department_id: depts.length === 1 ? depts[0] : { $in: depts } });
  if (des) andParts.push({ designation_id: des });
  if (grp) andParts.push({ employee_group_id: grp });

  if (andParts.length === 1) return andParts[0];
  return { $and: andParts };
}

/**
 * Employee filter for paysheet table + export-bundle + payroll Excel export.
 * Same pay-period scope and search as Pay Register (buildPayrollPeriodEmployeeQuery + dept/div/designation search).
 */
async function buildPaysheetEmployeeFilter(scopeFilter, divisionId, departmentId, rangeStart, rangeEnd, options = {}) {
  const { status, search, designationId, employeeGroupId } = options;
  const { appendEmployeeSearchCondition } = require('../../pay-register/services/payRegisterEmployeeFilter');
  const divArg = divisionId && divisionId !== 'all' ? divisionId : undefined;
  const depArg = departmentId && departmentId !== 'all' ? departmentId : undefined;
  const desF = toObjectIdIfValid(designationId && designationId !== 'all' ? designationId : null);
  const grpF = toObjectIdIfValid(employeeGroupId && employeeGroupId !== 'all' ? employeeGroupId : null);

  const scope =
    scopeFilter && typeof scopeFilter === 'object' && Object.keys(scopeFilter).length > 0 ? scopeFilter : null;

  if (status === 'inactive') {
    const parts = [];
    if (scope) parts.push(scope);
    parts.push(buildPayrollPeriodEmployeeQuery(divArg, depArg, rangeStart, rangeEnd, null));
    if (desF) parts.push({ designation_id: desF });
    if (grpF) parts.push({ employee_group_id: grpF });
    parts.push({ is_active: false });
    await appendEmployeeSearchCondition(parts, search);
    return parts.length === 1 ? parts[0] : { $and: parts };
  }

  const conditions = [buildPayrollPeriodEmployeeQuery(divArg, depArg, rangeStart, rangeEnd, scope)];
  if (desF) conditions.push({ designation_id: desF });
  if (grpF) conditions.push({ employee_group_id: grpF });
  if (status === 'active') conditions.push({ is_active: true });
  await appendEmployeeSearchCondition(conditions, search);
  return conditions.length === 1 ? conditions[0] : { $and: conditions };
}

/**
 * After loading PayrollRecords, drop rows whose leftDate is before the pay period (keep future exit dates).
 */
function filterPayrollRecordsByPayPeriodScope(records, rangeStart, rangeEnd) {
  return records.filter((r) => {
    const emp = r.employeeId;
    if (!emp) return false;
    return isEmployeeLeftDateInPayrollPeriodScope(emp.leftDate, rangeStart, rangeEnd);
  });
}

/**
 * Query for regular (bulk) payroll: same as worker.js payroll_bulk_calculate
 * @param {Object} opts - { divisionId, departmentId, leftDateRange?: { start: Date, end: Date } }
 * @returns {Object} MongoDB query for Employee.find()
 */
function getRegularPayrollEmployeeQuery(opts = {}) {
  const { divisionId, departmentId, leftDateRange } = opts;
  const query = {};

  if (leftDateRange && leftDateRange.start != null && leftDateRange.end != null) {
    // Use UTC so period boundaries are consistent (e.g. 26 Dec = 26 Dec 00:00 UTC);
    // avoids including employees who left on 25 Dec when period is 26 Dec–25 Jan (server TZ could shift 26 Dec 00:00 local into 25 Dec UTC).
    const startStr = typeof leftDateRange.start === 'string' ? leftDateRange.start : leftDateRange.start.toISOString().split('T')[0];
    const endStr = typeof leftDateRange.end === 'string' ? leftDateRange.end : leftDateRange.end.toISOString().split('T')[0];
    const start = new Date(startStr + 'T00:00:00.000Z');
    const end = new Date(endStr + 'T23:59:59.999Z');
    query.$or = [
      { is_active: { $ne: false }, leftDate: null },
      { is_active: { $ne: false }, leftDate: { $gt: end } },
      { leftDate: { $gte: start, $lte: end } },
    ];
  } else {
    query.is_active = true;
  }

  const deptIds = toObjectIdList(departmentId);
  const divIds = toObjectIdList(divisionId);
  if (deptIds.length) query.department_id = deptIds.length === 1 ? deptIds[0] : { $in: deptIds };
  if (divIds.length) query.division_id = divIds.length === 1 ? divIds[0] : { $in: divIds };
  return query;
}

/**
 * Query for second salary payroll: same employee set as regular payroll
 * (active or left in month + division/department). second_salary can be 0; calculation handles it.
 * @param {Object} opts - { divisionId, departmentId, leftDateRange?: { start: Date, end: Date } }
 * @returns {Object} MongoDB query for Employee.find()
 */
function getSecondSalaryEmployeeQuery(opts = {}) {
  return getRegularPayrollEmployeeQuery(opts);
}

/**
 * Employees in scope for a payroll month (batch validation, pay register list, bulk calculate).
 * Active with no left date, active with exit after period end, OR left during the pay period;
 * joined on/before period end; not left before period start.
 */
/**
 * JS-side check for paysheet/export: include if no left date, or left on/after pay period start
 * (still employed through the month, or left during/after the period). Excludes left before period start.
 */
function isEmployeeLeftDateInPayrollPeriodScope(leftDate, rangeStart) {
  if (leftDate == null || leftDate === '') return true;
  const left = leftDate instanceof Date ? leftDate : new Date(leftDate);
  if (Number.isNaN(left.getTime())) return true;
  return left >= rangeStart;
}

function buildPayrollPeriodEmployeeQuery(divisionId, departmentId, rangeStart, rangeEnd, scopeFilter = null) {
  const employment = buildPayrollBulkEmployeeQuery(scopeFilter, divisionId, departmentId, rangeStart, rangeEnd);
  const periodBounds = {
    $and: [
      { $or: [{ doj: null }, { doj: { $lte: rangeEnd } }] },
      { $or: [{ leftDate: null }, { leftDate: { $gte: rangeStart } }] },
    ],
  };
  return { $and: [employment, periodBounds] };
}

module.exports = {
  toObjectIdIfValid,
  toObjectIdList,
  buildPayrollBulkEmployeeQuery,
  buildPaysheetEmployeeFilter,
  getRegularPayrollEmployeeQuery,
  getSecondSalaryEmployeeQuery,
  buildPayrollPeriodEmployeeQuery,
  isEmployeeLeftDateInPayrollPeriodScope,
  filterPayrollRecordsByPayPeriodScope,
};
