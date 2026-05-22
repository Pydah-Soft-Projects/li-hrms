/**
 * Build employee filters for roster queries (aligned with GET /api/employees list).
 */

const Employee = require('../../employees/model/Employee');
const { EMP_NO_SORT, EMP_NO_COLLATION } = require('../../shared/utils/employeeSort');

function buildRosterEmployeeFilters(query = {}) {
  const {
    departmentId,
    department_id,
    divisionId,
    division_id,
    designationId,
    designation_id,
    employeeGroupId,
    employee_group_id,
    search,
    startDate,
    endDate,
  } = query;

  const filters = {};

  const dept = departmentId || department_id;
  const div = divisionId || division_id;
  const desig = designationId || designation_id;
  const group = employeeGroupId || employee_group_id;

  if (dept) filters.department_id = dept;
  if (div) filters.division_id = div;
  if (desig) filters.designation_id = desig;
  if (group) filters.employee_group_id = group;

  if (search) {
    const searchRegex = new RegExp(String(search), 'i');
    filters.$or = [
      { emp_no: searchRegex },
      { employee_name: searchRegex },
      { phone_number: searchRegex },
      { email: searchRegex },
    ];
  }

  if (startDate && endDate) {
    const rangeStart = new Date(startDate);
    const rangeEnd = new Date(endDate);
    if (!Number.isNaN(rangeStart.getTime()) && !Number.isNaN(rangeEnd.getTime())) {
      rangeStart.setUTCHours(0, 0, 0, 0);
      rangeEnd.setUTCHours(23, 59, 59, 999);
      filters.$and = filters.$and || [];
      filters.$and.push({ $or: [{ doj: null }, { doj: { $lte: rangeEnd } }] });
      filters.$and.push({ $or: [{ leftDate: null }, { leftDate: { $gte: rangeStart } }] });
    }
  } else {
    const startOfToday = new Date();
    startOfToday.setUTCHours(0, 0, 0, 0);
    filters.$and = filters.$and || [];
    filters.$and.push({ $or: [{ leftDate: null }, { leftDate: { $gte: startOfToday } }] });
  }

  return filters;
}

/**
 * Resolve employee numbers for roster scope.
 * @param {object} query - request query
 * @param {{ page?: number, limit?: number }} options
 * @returns {Promise<string[]>}
 */
async function resolveRosterEmployeeNumbers(query = {}) {
  const { employeeNumber, employeeNumbers } = query;

  if (employeeNumbers) {
    return String(employeeNumbers)
      .split(',')
      .map((n) => String(n || '').trim().toUpperCase())
      .filter(Boolean);
  }

  if (employeeNumber) {
    return [String(employeeNumber || '').toUpperCase()];
  }

  const filters = buildRosterEmployeeFilters(query);
  const page = query.page != null ? parseInt(query.page, 10) : null;
  const limit = query.limit != null ? parseInt(query.limit, 10) : null;

  let cursor = Employee.find(filters).select('emp_no').sort(EMP_NO_SORT).collation(EMP_NO_COLLATION);

  if (page && limit && page > 0 && limit > 0) {
    const skip = (page - 1) * limit;
    cursor = cursor.skip(skip).limit(limit);
  }

  const emps = await cursor.lean();
  return emps.map((e) => String(e.emp_no || '').toUpperCase()).filter(Boolean);
}

module.exports = {
  buildRosterEmployeeFilters,
  resolveRosterEmployeeNumbers,
};
