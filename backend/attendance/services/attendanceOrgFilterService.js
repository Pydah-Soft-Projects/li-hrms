/**
 * Resolve employee IDs / emp_nos matching division/department for a date or range,
 * using orgHistory when present.
 */

const Employee = require('../../employees/model/Employee');
const {
  findEmployeesMatchingOrgInRange,
  startOfUtcDay,
  endOfUtcDay,
} = require('../../employees/services/employeeTimelineService');

/**
 * @param {object} opts
 * @param {string[]} [opts.divisionIds]
 * @param {string[]} [opts.departmentIds]
 * @param {Date|string} [opts.asOf] - single day
 * @param {Date|string} [opts.rangeStart]
 * @param {Date|string} [opts.rangeEnd]
 * @param {object} [opts.extraFilter]
 * @returns {Promise<{ employees: object[], empNos: string[], employeeIds: any[] }>}
 */
async function resolveEmployeesForOrgFilter(opts = {}) {
  const asOf = opts.asOf ? startOfUtcDay(opts.asOf) : null;
  const rangeStart = opts.rangeStart
    ? startOfUtcDay(opts.rangeStart)
    : asOf || startOfUtcDay(new Date());
  const rangeEnd = opts.rangeEnd
    ? endOfUtcDay(opts.rangeEnd)
    : asOf
      ? endOfUtcDay(asOf)
      : endOfUtcDay(new Date());

  const employees = await findEmployeesMatchingOrgInRange(Employee, {
    divisionIds: opts.divisionIds || [],
    departmentIds: opts.departmentIds || [],
    rangeStart,
    rangeEnd,
    extraFilter: opts.extraFilter || { is_active: { $ne: false } },
    select: opts.select,
  });

  return {
    employees,
    empNos: employees.map((e) => String(e.emp_no).toUpperCase()),
    employeeIds: employees.map((e) => e._id),
  };
}

module.exports = {
  resolveEmployeesForOrgFilter,
};
