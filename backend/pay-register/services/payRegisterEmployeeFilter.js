const mongoose = require('mongoose');
const { buildPayrollPeriodEmployeeQuery } = require('../../payroll/services/payrollEmployeeQueryHelper');

/**
 * Mongo filter for Pay Register list / export: pay-period employment scope, optional dept/div, optional text search (server-side).
 */
async function buildPayRegisterEmployeeFilter(
  rangeStart,
  rangeEnd,
  { departmentId, divisionId, employeeGroupId, search, scopeFilter } = {}
) {
  const toOid = (id) => {
    if (id === undefined || id === null || id === '') return null;
    const s = String(id);
    try {
      if (mongoose.Types.ObjectId.isValid(s)) return new mongoose.Types.ObjectId(s);
    } catch (e) {
      /* ignore */
    }
    return id;
  };

  const conditions = [
    buildPayrollPeriodEmployeeQuery(divisionId, departmentId, rangeStart, rangeEnd, scopeFilter),
  ];

  if (employeeGroupId) {
    conditions.push({ employee_group_id: toOid(employeeGroupId) });
  }

  await appendEmployeeSearchCondition(conditions, search);

  return conditions.length === 1 ? conditions[0] : { $and: conditions };
}

/**
 * Pay Register / Paysheet / export search: emp no, name, department, division, designation.
 */
async function appendEmployeeSearchCondition(conditions, search) {
  const searchTrim = search && String(search).trim();
  if (!searchTrim) return;

  const esc = searchTrim.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const rx = { $regex: esc, $options: 'i' };
  const Department = require('../../departments/model/Department');
  const Division = require('../../departments/model/Division');
  const Designation = require('../../departments/model/Designation');

  const [deptIds, divIds, desigIds] = await Promise.all([
    Department.find({ $or: [{ name: rx }, { code: rx }] }).distinct('_id'),
    Division.find({ $or: [{ name: rx }, { code: rx }] }).distinct('_id'),
    Designation.find({ $or: [{ name: rx }, { code: rx }] }).distinct('_id'),
  ]);

  const searchOr = [{ employee_name: rx }, { emp_no: rx }];
  if (deptIds.length) searchOr.push({ department_id: { $in: deptIds } });
  if (divIds.length) searchOr.push({ division_id: { $in: divIds } });
  if (desigIds.length) searchOr.push({ designation_id: { $in: desigIds } });
  conditions.push({ $or: searchOr });
}

/**
 * Same eligibility as Pay Register list: active with no left date, active leaving after period end,
 * OR leftDate within pay period; joined by period end; not left before period start.
 */
async function assertEmployeeInPayRegisterDisplayScope(employeeId, month) {
  const Employee = require('../../employees/model/Employee');
  const { getPayrollDateRange } = require('../../shared/utils/dateUtils');

  if (!/^\d{4}-\d{2}$/.test(month)) {
    throw new Error('Month must be in YYYY-MM format');
  }

  const emp = await Employee.findById(employeeId).select('_id division_id department_id').lean();
  if (!emp) {
    throw new Error('Employee not found');
  }

  const [year, monthNum] = month.split('-').map(Number);
  const { startDate, endDate } = await getPayrollDateRange(year, monthNum);
  const rangeStart = new Date(startDate + 'T00:00:00.000Z');
  const rangeEnd = new Date(endDate + 'T23:59:59.999Z');

  const periodQuery = buildPayrollPeriodEmployeeQuery(
    emp.division_id,
    emp.department_id,
    rangeStart,
    rangeEnd,
    null
  );

  const match = await Employee.findOne({ $and: [periodQuery, { _id: employeeId }] }).select('_id').lean();
  if (!match) {
    const err = new Error(
      'Employee is not in scope for this payroll month (must be active through the period, leaving after period end, or have left date within the pay period, with valid DOJ/left-date bounds).'
    );
    err.code = 'PAY_REGISTER_SCOPE';
    throw err;
  }
}

module.exports = {
  buildPayRegisterEmployeeFilter,
  appendEmployeeSearchCondition,
  assertEmployeeInPayRegisterDisplayScope,
};
