const jwt = require('jsonwebtoken');
const User = require('../../users/model/User');
const Employee = require('../../employees/model/Employee');

// Protect routes - verify JWT token and load user data
exports.protect = async (req, res, next) => {
  try {
    let token;

    // Check for token in headers
    if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
      token = req.headers.authorization.split(' ')[1];
    }

    if (!token) {
      return res.status(401).json({
        success: false,
        message: 'Not authorized to access this route',
      });
    }

    try {
      // Verify token
      const decoded = jwt.verify(token, process.env.JWT_SECRET);

      // Fetch user and set on request (includes role)
      // Check User collection first
      let authUser = await User.findById(decoded.userId).select('-password');
      let authEmployee = null;

      if (authUser) {
        // If it's a user, try to find the linked employee record
        if (authUser.employeeRef) {
          authEmployee = await Employee.findById(authUser.employeeRef).select('-password');
        } else if (authUser.employeeId) {
          authEmployee = await Employee.findOne({ emp_no: authUser.employeeId }).select('-password');
        }
      } else {
        // If not found in User collection, it might be an Employee ID
        authEmployee = await Employee.findById(decoded.userId).select('-password');
        if (authEmployee) {
          // If it's an employee, see if they have a corresponding User record for roles
          authUser = await User.findOne({
            $or: [
              { employeeRef: authEmployee._id },
              { employeeId: authEmployee.emp_no }
            ]
          }).select('-password');
        }
      }

      if (!authUser && !authEmployee) {
        return res.status(401).json({
          success: false,
          message: 'User/Employee not found',
        });
      }

      // Check deactivation
      if (authUser && !authUser.isActive) {
        return res.status(401).json({
          success: false,
          message: 'User account is deactivated',
        });
      }

      if (authEmployee && authEmployee.is_active === false) {
        return res.status(401).json({
          success: false,
          message: 'Employee account is deactivated',
        });
      }

      // Set user on request with merged data
      // Preference for User record for role-based logic, but use Employee for identity
      req.user = {
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
        type: authUser ? 'user' : 'employee'
      };

      next();
    } catch (error) {
      return res.status(401).json({
        success: false,
        message: 'Invalid or expired token',
      });
    }
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
      // User is already loaded by protect middleware
      if (!req.user || !req.user.role) {
        return res.status(401).json({
          success: false,
          message: 'User not authenticated',
        });
      }

      // Check if user has required role (check primary role and roles array)
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

