const jwt = require('jsonwebtoken');
const User = require('../../users/model/User');
const Employee = require('../../employees/model/Employee');
const sessionService = require('../../authentication/services/sessionService');

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

  let decoded;
  try {
    decoded = jwt.verify(token, process.env.JWT_SECRET);
  } catch {
    return null;
  }

  if (decoded.type && decoded.type !== 'access') return null;
  if (!decoded.sessionId) return null;

  const sessionCheck = await sessionService.validateSession(
    decoded.userId,
    decoded.sessionId,
    decoded.tokenVersion ?? 0
  );
  if (!sessionCheck.ok) return null;

  const identity = await resolveAuthIdentity(decoded);
  if (!identity) return null;

  const authUser = await User.findById(decoded.userId).select('tokenVersion').lean();
  const authEmployee = authUser
    ? null
    : await Employee.findById(decoded.userId).select('tokenVersion').lean();
  const liveVersion = authUser?.tokenVersion ?? authEmployee?.tokenVersion ?? 0;
  if (Number(decoded.tokenVersion ?? 0) !== Number(liveVersion)) return null;

  return identity;
}

module.exports = {
  authenticateSocket,
};
