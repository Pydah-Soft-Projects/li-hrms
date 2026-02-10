/**
 * Shared query builder for payroll employee selection.
 * Used by: shared/jobs/worker.js (bulk regular + second salary), secondSalaryService.js,
 * and scripts that need the same employee lists (e.g. payroll_division_employee_report.js).
 *
 * When leftDateRange is provided, includes: active employees OR employees who left in that month.
 */

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
      { is_active: true, leftDate: null },
      { leftDate: { $gte: start, $lte: end } },
    ];
  } else {
    query.is_active = true;
  }

  if (departmentId && departmentId !== 'all') query.department_id = departmentId;
  if (divisionId && divisionId !== 'all') query.division_id = divisionId;
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

module.exports = {
  getRegularPayrollEmployeeQuery,
  getSecondSalaryEmployeeQuery,
};
