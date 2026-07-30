/**
 * Keep Department.divisions ↔ Division.departments in sync.
 * Workspace department metadata scope uses Department.divisions; employees use division_id.
 * When those diverge, scoped users miss departments that still have staff.
 */

const mongoose = require('mongoose');
const Department = require('../model/Department');
const Division = require('../model/Division');
const Employee = require('../../employees/model/Employee');

function toObjectId(id) {
  if (id == null) return id;
  if (mongoose.Types.ObjectId.isValid(id)) return new mongoose.Types.ObjectId(id.toString());
  return id;
}

function mappingDivisionId(mapping) {
  if (!mapping) return null;
  return mapping.division?._id || mapping.division || null;
}

function mappingHasSpecificDepartments(mapping) {
  return Array.isArray(mapping?.departments) && mapping.departments.length > 0;
}

/**
 * Bidirectional link: Department.divisions + Division.departments.
 */
async function ensureDepartmentLinkedToDivision(departmentId, divisionId) {
  if (!departmentId || !divisionId) return false;
  const deptId = toObjectId(departmentId);
  const divId = toObjectId(divisionId);
  if (!deptId || !divId) return false;

  await Promise.all([
    Department.updateOne({ _id: deptId }, { $addToSet: { divisions: divId } }),
    Division.updateOne({ _id: divId }, { $addToSet: { departments: deptId } }),
  ]);
  return true;
}

/**
 * Division IDs where the user has division-wide access (empty mapping.departments).
 */
function getDivisionWideIds(user, selectedDivisionId = null) {
  if (!user?.divisionMapping?.length) return [];
  const scope = user.dataScope;
  if (user.role === 'super_admin' || scope === 'all') return [];

  let mappings = user.divisionMapping.filter((m) => !mappingHasSpecificDepartments(m));
  if (selectedDivisionId) {
    const sel = String(selectedDivisionId);
    mappings = mappings.filter((m) => String(mappingDivisionId(m)) === sel);
  }
  return mappings
    .map((m) => mappingDivisionId(m))
    .filter(Boolean)
    .map((id) => String(id));
}

/**
 * Distinct department_ids used by employees in the given divisions.
 */
async function getEmployeeDepartmentIdsForDivisions(divisionIds) {
  if (!divisionIds?.length) return [];
  const ids = await Employee.distinct('department_id', {
    division_id: { $in: divisionIds.map(toObjectId) },
    department_id: { $ne: null, $exists: true },
  });
  return (ids || []).filter(Boolean).map((id) => toObjectId(id));
}

/**
 * Sync master links from employee division_id + department_id pairs for division-wide scope.
 */
async function syncDepartmentDivisionLinksFromEmployees(divisionIds) {
  if (!divisionIds?.length) return 0;
  const pairs = await Employee.aggregate([
    {
      $match: {
        division_id: { $in: divisionIds.map(toObjectId) },
        department_id: { $ne: null, $exists: true },
      },
    },
    {
      $group: {
        _id: { division_id: '$division_id', department_id: '$department_id' },
      },
    },
  ]);

  if (!pairs.length) return 0;

  const deptOps = [];
  const divOps = [];
  for (const row of pairs) {
    const divId = row._id.division_id;
    const deptId = row._id.department_id;
    if (!divId || !deptId) continue;
    deptOps.push({
      updateOne: {
        filter: { _id: deptId },
        update: { $addToSet: { divisions: divId } },
      },
    });
    divOps.push({
      updateOne: {
        filter: { _id: divId },
        update: { $addToSet: { departments: deptId } },
      },
    });
  }

  if (deptOps.length) {
    await Department.bulkWrite(deptOps, { ordered: false });
  }
  if (divOps.length) {
    await Division.bulkWrite(divOps, { ordered: false });
  }
  return pairs.length;
}

/**
 * Expand a Department metadata-scope query so division-wide users also see
 * departments that have employees in their college (even if master link was missing).
 * Also heals Department↔Division links from those employee pairs.
 *
 * @returns {{ query: object, expanded: boolean }}
 */
async function expandDepartmentQueryForDivisionWideScope(query, user, selectedDivisionId = null) {
  const wideDivIds = getDivisionWideIds(user, selectedDivisionId);
  if (!wideDivIds.length) {
    return { query, expanded: false };
  }

  await syncDepartmentDivisionLinksFromEmployees(wideDivIds);

  const empDeptIds = await getEmployeeDepartmentIdsForDivisions(wideDivIds);
  if (!empDeptIds.length) {
    return { query, expanded: false };
  }

  const base = { ...(query || {}) };
  const isActive = base.isActive;
  delete base.isActive;

  const branches = [];
  if (base && Object.keys(base).length > 0) {
    branches.push(base);
  }
  branches.push({ _id: { $in: empDeptIds } });

  const expandedQuery = {
    ...(isActive !== undefined ? { isActive } : {}),
    $or: branches,
  };

  return { query: expandedQuery, expanded: true };
}

module.exports = {
  ensureDepartmentLinkedToDivision,
  getDivisionWideIds,
  getEmployeeDepartmentIdsForDivisions,
  syncDepartmentDivisionLinksFromEmployees,
  expandDepartmentQueryForDivisionWideScope,
};
