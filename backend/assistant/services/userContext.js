function buildUserContext(reqUser) {
  const role = reqUser?.role || reqUser?.roles?.[0] || 'employee';
  const name =
    reqUser?.name ||
    reqUser?.employeeName ||
    [reqUser?.firstName, reqUser?.lastName].filter(Boolean).join(' ') ||
    'User';
  return {
    role,
    name,
    employeeId: reqUser?.employeeId || reqUser?.emp_no,
    department: reqUser?.department,
    division: reqUser?.division,
  };
}

module.exports = { buildUserContext };
