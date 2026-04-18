const jwt = require('jsonwebtoken');
const User = require('../../users/model/User');
const Employee = require('../../employees/model/Employee');

async function resolveAuthIdentity(decoded) {
  let authUser = await User.findById(decoded.userId).select('-password').lean();
  let authEmployee = null;

  if (authUser) {
    if (authUser.employeeRef) {
      authEmployee = await Employee.findById(authUser.employeeRef).select('-password').lean();
    } else if (authUser.employeeId) {
      authEmployee = await Employee.findOne({ emp_no: authUser.employeeId }).select('-password').lean();
    }
  } else {
    authEmployee = await Employee.findById(decoded.userId).select('-password').lean();
    if (authEmployee) {
      authUser = await User.findOne({
        $or: [{ employeeRef: authEmployee._id }, { employeeId: authEmployee.emp_no }],
      })
        .select('-password')
        .lean();
    }
  }

  if (!authUser && !authEmployee) return null;
  if (authUser && !authUser.isActive) return null;
  if (authEmployee && authEmployee.is_active === false) return null;

  return {
    _id: authUser?._id || authEmployee?._id,
    userId: authUser?._id || authEmployee?._id,
    email: authUser?.email || authEmployee?.email,
    name: authUser?.name || authEmployee?.employee_name,
    role: authUser?.role || 'employee',
    roles: authUser?.roles || (authUser?.role ? [authUser.role] : ['employee']),
    employeeId: authUser?.employeeId || authEmployee?.emp_no,
    employeeRef: authUser?.employeeRef || authEmployee?._id,
    emp_no: authEmployee?.emp_no || authUser?.employeeId,
    username: authUser?.username,
    type: authUser ? 'user' : 'employee',
  };
}

async function authenticateSocket(rawToken) {
  if (!rawToken) return null;
  const token = String(rawToken).replace(/^Bearer\s+/i, '').trim();
  if (!token) return null;
  const decoded = jwt.verify(token, process.env.JWT_SECRET);
  return resolveAuthIdentity(decoded);
}

module.exports = {
  authenticateSocket,
};

