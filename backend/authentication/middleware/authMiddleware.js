const jwt = require('jsonwebtoken');
const User = require('../../users/model/User');
const Employee = require('../../employees/model/Employee');
const sessionService = require('../services/sessionService');

async function loadAuthIdentity(userId) {
  let authUser = await User.findById(userId).select('-password');
  let authEmployee = null;

  if (authUser) {
    if (authUser.employeeRef) {
      authEmployee = await Employee.findById(authUser.employeeRef).select('-password');
    } else if (authUser.employeeId) {
      authEmployee = await Employee.findOne({ emp_no: authUser.employeeId }).select('-password');
    }
  } else {
    authEmployee = await Employee.findById(userId).select('-password');
    if (authEmployee) {
      authUser = await User.findOne({
        $or: [
          { employeeRef: authEmployee._id },
          { employeeId: authEmployee.emp_no },
        ],
      }).select('-password');
    }
  }

  if (!authUser && !authEmployee) {
    return { error: { status: 401, message: 'User/Employee not found' } };
  }

  if (authUser && !authUser.isActive) {
    return { error: { status: 401, message: 'User account is deactivated' } };
  }

  if (authEmployee && authEmployee.is_active === false) {
    return { error: { status: 401, message: 'Employee account is deactivated' } };
  }

  if (authEmployee && authEmployee.leftDate) {
    const startOfToday = new Date();
    startOfToday.setUTCHours(0, 0, 0, 0);
    if (new Date(authEmployee.leftDate) < startOfToday) {
      return {
        error: {
          status: 401,
          message: 'Your last working date has passed. Account is deactivated.',
        },
      };
    }
  }

  const tokenVersion = authUser?.tokenVersion ?? authEmployee?.tokenVersion ?? 0;

  return {
    authUser,
    authEmployee,
    tokenVersion,
    reqUser: {
      _id: authUser?._id || authEmployee?._id,
      userId: authUser?._id || authEmployee?._id,
      email: authUser?.email || authEmployee?.email,
      name: authUser?.name || authEmployee?.employee_name,
      role: authUser?.role || 'employee',
      roles: authUser?.roles || (authUser?.role ? [authUser.role] : ['employee']),
      employeeId: authUser?.employeeId || authEmployee?.emp_no,
      employeeRef: authUser?.employeeRef || authEmployee?._id,
      activeWorkspaceId: authUser?.activeWorkspaceId,
      dataScope: authUser?.dataScope || (authEmployee ? 'own' : 'all'),
      divisionMapping: authUser?.divisionMapping || [],
      type: authUser ? 'user' : 'employee',
      sessionId: null,
    },
  };
}

function sendAuthError(res, status, message, code) {
  return res.status(status).json({
    success: false,
    message,
    ...(code ? { code } : {}),
  });
}

// Protect routes - verify JWT token, session, and load user data
exports.protect = async (req, res, next) => {
  try {
    let token;

    if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
      token = req.headers.authorization.split(' ')[1];
    }

    if (!token) {
      return sendAuthError(res, 401, 'Not authorized to access this route');
    }

    let decoded;
    try {
      decoded = jwt.verify(token, process.env.JWT_SECRET);
    } catch (error) {
      if (error.name === 'TokenExpiredError') {
        return sendAuthError(res, 401, 'Access token expired', 'TOKEN_EXPIRED');
      }
      return sendAuthError(res, 401, 'Invalid or expired token');
    }

    if (decoded.type && decoded.type !== 'access') {
      return sendAuthError(res, 401, 'Invalid token type');
    }

    if (!decoded.sessionId) {
      return sendAuthError(res, 401, 'Session expired. Please login again.', 'SESSION_EXPIRED');
    }

    const sessionCheck = await sessionService.validateSession(
      decoded.userId,
      decoded.sessionId,
      decoded.tokenVersion ?? 0
    );
    if (!sessionCheck.ok) {
      return sendAuthError(res, 401, sessionCheck.message, sessionCheck.code);
    }

    const identity = await loadAuthIdentity(decoded.userId);
    if (identity.error) {
      return sendAuthError(res, identity.error.status, identity.error.message);
    }

    const liveTokenVersion = identity.tokenVersion;
    if (Number(decoded.tokenVersion ?? 0) !== Number(liveTokenVersion)) {
      return sendAuthError(
        res,
        401,
        'Your credentials were changed. Please login again.',
        'TOKEN_VERSION_MISMATCH'
      );
    }

    identity.reqUser.sessionId = decoded.sessionId;
    req.user = identity.reqUser;

    const skipTouch = req.method === 'POST' && String(req.path || '').endsWith('/logout');
    if (!skipTouch) {
      sessionService.touchSession(decoded.userId, decoded.sessionId).catch(() => {});
    }

    next();
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error in authentication',
      error: error.message,
    });
  }
};

// Role-based authorization
exports.authorize = (...roles) => {
  return (req, res, next) => {
    try {
      if (!req.user || !req.user.role) {
        return res.status(401).json({
          success: false,
          message: 'User not authenticated',
        });
      }

      const hasRole = roles.includes(req.user.role) ||
        (req.user.roles && req.user.roles.some((role) => roles.includes(role)));

      if (!hasRole) {
        return res.status(403).json({
          success: false,
          message: `User role '${req.user.role}' is not authorized to access this route`,
        });
      }

      next();
    } catch (error) {
      res.status(500).json({
        success: false,
        message: 'Error in authorization',
        error: error.message,
      });
    }
  };
};

module.exports.loadAuthIdentity = loadAuthIdentity;
