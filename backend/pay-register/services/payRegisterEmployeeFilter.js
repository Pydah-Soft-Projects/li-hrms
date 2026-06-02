const mongoose = require('mongoose');

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

  const employmentScopeOr = [
    { is_active: { $ne: false } },
    { is_active: false, leftDate: { $gte: rangeStart, $lte: rangeEnd } },
  ];

  const conditions = [{ $or: employmentScopeOr }];

  if (scopeFilter && typeof scopeFilter === 'object' && Object.keys(scopeFilter).length > 0) {
    conditions.push(scopeFilter);
  }

  if (departmentId) {
    conditions.push({ department_id: toOid(departmentId) });
  }
  if (divisionId) {
    conditions.push({ division_id: toOid(divisionId) });
  }
  if (employeeGroupId) {
    conditions.push({ employee_group_id: toOid(employeeGroupId) });
  }

  const searchTrim = search && String(search).trim();
  if (searchTrim) {
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

  return conditions.length === 1 ? conditions[0] : { $and: conditions };
}

module.exports = { buildPayRegisterEmployeeFilter };
