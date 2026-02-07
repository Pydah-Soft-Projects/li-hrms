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
    const start = new Date(leftDateRange.start);
    start.setHours(0, 0, 0, 0);
    const end = new Date(leftDateRange.end);
    end.setHours(23, 59, 59, 999);
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
