/**
 * Leave/OD list org filters: match snapshot fields on the request OR
 * employees whose current master org is in the selected scope.
 *
 * Transfers update Employee.division_id but leave documents keep the
 * division_id at application time — filtering only on the snapshot hides
 * transferred employees under their new division.
 */
const mongoose = require('mongoose');

function parseQueryObjectIds(value) {
  if (value == null || value === '' || value === 'all') return [];
  return String(value)
    .split(',')
    .map((id) => id.trim())
    .filter((id) => id && id !== 'all' && mongoose.Types.ObjectId.isValid(id))
    .map((id) => new mongoose.Types.ObjectId(id));
}

function idMatch(field, ids) {
  if (!ids.length) return null;
  return { [field]: ids.length > 1 ? { $in: ids } : ids[0] };
}

function ensureAnd(filter) {
  if (!filter.$and) filter.$and = [];
  return filter.$and;
}

/**
 * @param {object} filter - Mongo filter mutated in place
 * @param {{ division?: string, department?: string, designation?: string }} query
 * @param {import('mongoose').Model} Employee
 */
async function applyLeaveOdOrgFilters(filter, query, Employee) {
  const divisionIds = parseQueryObjectIds(query.division);
  const departmentIds = parseQueryObjectIds(query.department);
  const designationIds = parseQueryObjectIds(query.designation);

  if (divisionIds.length) {
    const emps = await Employee.find({ division_id: { $in: divisionIds } }).select('_id').lean();
    const empIds = emps.map((e) => e._id);
    const snap = idMatch('division_id', divisionIds);
    ensureAnd(filter).push(
      empIds.length ? { $or: [snap, { employeeId: { $in: empIds } }] } : snap
    );
  }

  if (departmentIds.length) {
    const emps = await Employee.find({ department_id: { $in: departmentIds } }).select('_id').lean();
    const empIds = emps.map((e) => e._id);
    const snapOr = {
      $or: [
        idMatch('department', departmentIds),
        idMatch('department_id', departmentIds),
      ].filter(Boolean),
    };
    ensureAnd(filter).push(
      empIds.length ? { $or: [snapOr, { employeeId: { $in: empIds } }] } : snapOr
    );
  }

  if (designationIds.length) {
    const emps = await Employee.find({ designation_id: { $in: designationIds } }).select('_id').lean();
    const empIds = emps.map((e) => e._id);
    const snap = idMatch('designation', designationIds);
    ensureAnd(filter).push(
      empIds.length ? { $or: [snap, { employeeId: { $in: empIds } }] } : snap
    );
  }

  return filter;
}

module.exports = {
  parseQueryObjectIds,
  applyLeaveOdOrgFilters,
};
