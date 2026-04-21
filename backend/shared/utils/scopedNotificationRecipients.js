const User = require('../../users/model/User');

const uniqueIds = (ids = []) => [...new Set(ids.map((id) => String(id)).filter(Boolean))];
const isObjectIdLike = (v) => /^[a-f0-9]{24}$/i.test(String(v || ''));

const isUserInEmployeeScope = (user, divisionId, departmentId) => {
  if (!user) return false;
  if (user.role === 'super_admin' || (Array.isArray(user.roles) && user.roles.includes('super_admin'))) return true;
  if (user.dataScope === 'all') return true;

  const empDiv = String(divisionId || '');
  const empDept = String(departmentId || '');
  const userEmpDiv = String(user.employeeRef?.division_id || '');
  const userEmpDept = String(user.employeeRef?.department_id || '');

  if ((user.dataScope === 'division' || user.dataScope === 'divisions') && empDiv && userEmpDiv && empDiv === userEmpDiv) {
    return true;
  }
  if ((user.dataScope === 'department' || user.dataScope === 'departments') && empDept && userEmpDept && empDept === userEmpDept) {
    return true;
  }

  const mappings = Array.isArray(user.divisionMapping) ? user.divisionMapping : [];
  for (const mapping of mappings) {
    const mappedDiv = String(mapping?.division?._id || mapping?.division || '');
    if (!mappedDiv || mappedDiv !== empDiv) continue;
    const mappedDepartments = Array.isArray(mapping?.departments) ? mapping.departments : [];
    if (mappedDepartments.length === 0) return true;
    if (mappedDepartments.some((d) => String(d?._id || d) === empDept)) return true;
  }

  return false;
};

const resolveSuperAdminUserIds = async () => {
  const users = await User.find({
    isActive: true,
    $or: [{ role: 'super_admin' }, { roles: 'super_admin' }],
  })
    .select('_id')
    .lean();
  return users.map((u) => String(u._id));
};

const resolveScopedUserIdsForEmployee = async ({ divisionId, departmentId, roles = [] }) => {
  const roleFilter =
    Array.isArray(roles) && roles.length > 0
      ? { $or: [{ role: { $in: roles } }, { roles: { $in: roles } }] }
      : {};
  const users = await User.find({
    isActive: true,
    ...roleFilter,
  })
    .select('_id role roles dataScope divisionMapping employeeRef')
    .populate('employeeRef', 'division_id department_id')
    .lean();

  return users.filter((u) => isUserInEmployeeScope(u, divisionId, departmentId)).map((u) => String(u._id));
};

const resolveEmployeePortalUserIds = async (employeeRecord) => {
  const employeeId = employeeRecord?._id || null;
  const empNo = employeeRecord?.emp_no || null;
  if (!employeeId && !empNo) return [];
  const users = await User.find({
    isActive: true,
    $or: [
      ...(employeeId ? [{ employeeRef: employeeId }] : []),
      ...(empNo ? [{ employeeId: empNo }] : []),
    ],
  })
    .select('_id')
    .lean();
  return uniqueIds(users.map((u) => u._id));
};

module.exports = {
  uniqueIds,
  isObjectIdLike,
  isUserInEmployeeScope,
  resolveSuperAdminUserIds,
  resolveScopedUserIdsForEmployee,
  resolveEmployeePortalUserIds,
};
