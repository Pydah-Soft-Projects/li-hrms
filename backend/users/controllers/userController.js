const User = require('../model/User');
const Employee = require('../../employees/model/Employee');
const Workspace = require('../../workspaces/model/Workspace');
const RoleAssignment = require('../../workspaces/model/RoleAssignment');
const jwt = require('jsonwebtoken');

// Generate JWT Token
const generateToken = (userId) => {
  return jwt.sign({ userId }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRE || '7d',
  });
};

// Generate random password
const generatePassword = (length = 12) => {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789@#$%';
  let password = '';
  for (let i = 0; i < length; i++) {
    password += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return password;
};

// Get workspace code by role type
const getWorkspaceCodeByRole = (role) => {
  const roleToWorkspace = {
    super_admin: null, // Super admin doesn't need workspace assignment typically
    sub_admin: 'SUBADMIN',
    hr: 'HR',
    hod: 'HOD',
    employee: 'EMP',
  };
  return roleToWorkspace[role] || 'EMP';
};

// @desc    Register a new user
// @route   POST /api/users/register
// @access  Private (Super Admin, Sub Admin, HR)
exports.registerUser = async (req, res) => {
  try {
    const {
      email,
      password,
      name,
      role,
      roles,
      department,
      departments,
      employeeId,
      employeeRef,
      autoGeneratePassword,
      assignWorkspace,
    } = req.body;

    // Validate required fields
    if (!email || !name || !role) {
      return res.status(400).json({
        success: false,
        message: 'Email, name, and role are required',
      });
    }

    // Check if user already exists
    const existingUser = await User.findOne({ email: email.toLowerCase() });
    if (existingUser) {
      return res.status(400).json({
        success: false,
        message: 'User with this email already exists',
      });
    }

    // Generate or use provided password
    const userPassword = autoGeneratePassword ? generatePassword() : password;
    if (!userPassword) {
      return res.status(400).json({
        success: false,
        message: 'Password is required',
      });
    }

    // Validate role-specific requirements
    if (role === 'hod' && !department) {
      return res.status(400).json({
        success: false,
        message: 'HOD must be assigned to a department',
      });
    }

    // Build roles array
    const userRoles = roles && roles.length > 0 ? roles : [role];

    // Create user
    const user = await User.create({
      email: email.toLowerCase(),
      password: userPassword,
      name,
      role,
      roles: userRoles,
      department: department || null,
      departments: departments || (department ? [department] : []),
      employeeId: employeeId || null,
      employeeRef: employeeRef || null,
      createdBy: req.user?._id,
    });

    // Auto-assign to workspace if requested
    let workspaceAssignment = null;
    if (assignWorkspace !== false) {
      const workspaceCode = getWorkspaceCodeByRole(role);
      if (workspaceCode) {
        const workspace = await Workspace.findOne({ code: workspaceCode, isActive: true });
        if (workspace) {
          // Build scope config for HR (multiple departments) or HOD (single department)
          const scopeConfig = {};
          if (role === 'hr' && departments && departments.length > 0) {
            scopeConfig.departments = departments;
            scopeConfig.allDepartments = false;
          } else if (role === 'hod' && department) {
            scopeConfig.departments = [department];
            scopeConfig.allDepartments = false;
          } else if (role === 'sub_admin' || role === 'super_admin') {
            scopeConfig.allDepartments = true;
          }

          workspaceAssignment = await RoleAssignment.create({
            userId: user._id,
            workspaceId: workspace._id,
            role: 'member',
            isPrimary: true,
            scopeConfig,
            assignedBy: req.user?._id,
          });

          // Also assign to Employee Portal for HOD/HR so they can apply leaves
          if (role === 'hod' || role === 'hr') {
            const empWorkspace = await Workspace.findOne({ code: 'EMP', isActive: true });
            if (empWorkspace) {
              await RoleAssignment.create({
                userId: user._id,
                workspaceId: empWorkspace._id,
                role: 'member',
                isPrimary: false,
                scopeConfig: { departments: [], allDepartments: false },
                assignedBy: req.user?._id,
              });
            }
          }
        }
      }
    }

    // Return user without password, but include generated password if auto-generated
    const responseData = {
      user: {
        _id: user._id,
        email: user.email,
        name: user.name,
        role: user.role,
        roles: user.roles,
        department: user.department,
        departments: user.departments,
        employeeId: user.employeeId,
        employeeRef: user.employeeRef,
        isActive: user.isActive,
        createdAt: user.createdAt,
      },
      workspaceAssigned: !!workspaceAssignment,
    };

    // Include generated password in response (only shown once)
    if (autoGeneratePassword) {
      responseData.generatedPassword = userPassword;
    }

    res.status(201).json({
      success: true,
      message: 'User created successfully',
      data: responseData,
    });
  } catch (error) {
    console.error('Error creating user:', error);
    res.status(500).json({
      success: false,
      message: 'Error creating user',
      error: error.message,
    });
  }
};

// @desc    Create user from employee
// @route   POST /api/users/from-employee
// @access  Private (Super Admin, Sub Admin, HR)
exports.createUserFromEmployee = async (req, res) => {
  try {
    const {
      employeeId, // emp_no
      email,
      password,
      role,
      roles,
      departments, // For HR: multiple departments
      autoGeneratePassword,
    } = req.body;

    // Find employee
    const employee = await Employee.findOne({ emp_no: employeeId })
      .populate('department_id', 'name')
      .populate('designation_id', 'name');

    if (!employee) {
      return res.status(404).json({
        success: false,
        message: 'Employee not found',
      });
    }

    // Check if user already exists for this employee
    const existingUser = await User.findOne({
      $or: [{ employeeId: employee.emp_no }, { employeeRef: employee._id }],
    });

    if (existingUser) {
      return res.status(400).json({
        success: false,
        message: 'User already exists for this employee',
        existingUser: {
          _id: existingUser._id,
          email: existingUser.email,
          role: existingUser.role,
        },
      });
    }

    // Use employee email or provided email
    const userEmail = email || employee.email;
    if (!userEmail) {
      return res.status(400).json({
        success: false,
        message: 'Email is required. Employee has no email, please provide one.',
      });
    }

    // Check if email already in use
    const emailExists = await User.findOne({ email: userEmail.toLowerCase() });
    if (emailExists) {
      return res.status(400).json({
        success: false,
        message: 'This email is already registered to another user',
      });
    }

    // Generate or use provided password
    const userPassword = autoGeneratePassword ? generatePassword() : password;
    if (!userPassword) {
      return res.status(400).json({
        success: false,
        message: 'Password is required',
      });
    }

    // Build department assignments
    const department = employee.department_id?._id || employee.department_id;
    let userDepartments = [];

    if (role === 'hr' && departments && departments.length > 0) {
      userDepartments = departments;
    } else if (department) {
      userDepartments = [department];
    }

    // Build roles array
    const userRoles = roles && roles.length > 0 ? roles : [role];

    // Create user
    const user = await User.create({
      email: userEmail.toLowerCase(),
      password: userPassword,
      name: employee.employee_name,
      role: role || 'employee',
      roles: userRoles,
      department: department,
      departments: userDepartments,
      employeeId: employee.emp_no,
      employeeRef: employee._id,
      createdBy: req.user?._id,
    });

    // Auto-assign to workspace
    const workspaceCode = getWorkspaceCodeByRole(role || 'employee');
    let workspaceAssignment = null;

    if (workspaceCode) {
      const workspace = await Workspace.findOne({ code: workspaceCode, isActive: true });
      if (workspace) {
        const scopeConfig = {};
        if (role === 'hr') {
          scopeConfig.departments = userDepartments;
          scopeConfig.allDepartments = false;
        } else if (role === 'hod') {
          scopeConfig.departments = department ? [department] : [];
          scopeConfig.allDepartments = false;
        }

        workspaceAssignment = await RoleAssignment.create({
          userId: user._id,
          workspaceId: workspace._id,
          role: 'member',
          isPrimary: true,
          scopeConfig,
          assignedBy: req.user?._id,
        });

        // Also assign to Employee Portal for HOD/HR
        if (role === 'hod' || role === 'hr') {
          const empWorkspace = await Workspace.findOne({ code: 'EMP', isActive: true });
          if (empWorkspace) {
            await RoleAssignment.create({
              userId: user._id,
              workspaceId: empWorkspace._id,
              role: 'member',
              isPrimary: false,
              assignedBy: req.user?._id,
            });
          }
        }
      }
    }

    // Response
    const responseData = {
      user: {
        _id: user._id,
        email: user.email,
        name: user.name,
        role: user.role,
        roles: user.roles,
        department: user.department,
        departments: user.departments,
        employeeId: user.employeeId,
        employeeRef: user.employeeRef,
        isActive: user.isActive,
      },
      employee: {
        _id: employee._id,
        emp_no: employee.emp_no,
        employee_name: employee.employee_name,
        department: employee.department_id,
        designation: employee.designation_id,
      },
      workspaceAssigned: !!workspaceAssignment,
    };

    if (autoGeneratePassword) {
      responseData.generatedPassword = userPassword;
    }

    res.status(201).json({
      success: true,
      message: 'User created from employee successfully',
      data: responseData,
    });
  } catch (error) {
    console.error('Error creating user from employee:', error);
    res.status(500).json({
      success: false,
      message: 'Error creating user from employee',
      error: error.message,
    });
  }
};

// @desc    Get all users
// @route   GET /api/users
// @access  Private (Super Admin, Sub Admin, HR)
exports.getAllUsers = async (req, res) => {
  try {
    const { role, department, isActive, search, page = 1, limit = 50 } = req.query;
    const query = {};

    if (role) query.role = role;
    if (department) {
      query.$or = [{ department: department }, { departments: department }];
    }
    if (isActive !== undefined) query.isActive = isActive === 'true';
    if (search) {
      query.$or = [
        { name: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } },
        { employeeId: { $regex: search, $options: 'i' } },
      ];
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);

    const [users, total] = await Promise.all([
      User.find(query)
        .populate('department', 'name code')
        .populate('departments', 'name code')
        .populate('employeeRef', 'emp_no employee_name')
        .select('-password')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(parseInt(limit)),
      User.countDocuments(query),
    ]);

    res.status(200).json({
      success: true,
      count: users.length,
      total,
      page: parseInt(page),
      pages: Math.ceil(total / parseInt(limit)),
      data: users,
    });
  } catch (error) {
    console.error('Error fetching users:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching users',
      error: error.message,
    });
  }
};

// @desc    Get single user with workspaces
// @route   GET /api/users/:id
// @access  Private
exports.getUser = async (req, res) => {
  try {
    const user = await User.findById(req.params.id)
      .populate('department', 'name code')
      .populate('departments', 'name code')
      .populate('employeeRef')
      .select('-password');

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found',
      });
    }

    // Get user's workspace assignments
    const workspaces = await RoleAssignment.find({
      userId: user._id,
      isActive: true,
    })
      .populate('workspaceId', 'name code type')
      .select('workspaceId role isPrimary scopeConfig');

    res.status(200).json({
      success: true,
      data: {
        user,
        workspaces: workspaces.map((w) => ({
          _id: w.workspaceId?._id,
          name: w.workspaceId?.name,
          code: w.workspaceId?.code,
          type: w.workspaceId?.type,
          role: w.role,
          isPrimary: w.isPrimary,
          scopeConfig: w.scopeConfig,
        })),
      },
    });
  } catch (error) {
    console.error('Error fetching user:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching user',
      error: error.message,
    });
  }
};

// @desc    Update user
// @route   PUT /api/users/:id
// @access  Private (Super Admin, Sub Admin, HR)
exports.updateUser = async (req, res) => {
  try {
    const { name, role, roles, department, departments, isActive, employeeId, employeeRef } = req.body;

    const user = await User.findById(req.params.id);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found',
      });
    }

    // Prevent modifying super_admin if not super_admin
    if (user.role === 'super_admin' && req.user.role !== 'super_admin') {
      return res.status(403).json({
        success: false,
        message: 'Cannot modify super admin user',
      });
    }

    // Track if role changed for workspace update
    const roleChanged = role && role !== user.role;

    // Update fields
    if (name !== undefined) user.name = name;
    if (role !== undefined) {
      user.role = role;
      user.roles = roles || [role];
    }
    if (department !== undefined) user.department = department;
    if (departments !== undefined) user.departments = departments;
    if (isActive !== undefined) user.isActive = isActive;
    if (employeeId !== undefined) user.employeeId = employeeId;
    if (employeeRef !== undefined) user.employeeRef = employeeRef;

    await user.save();

    // If role changed, update workspace assignment
    if (roleChanged) {
      // Deactivate old workspace assignments
      await RoleAssignment.updateMany({ userId: user._id }, { isActive: false });

      // Create new workspace assignment
      const workspaceCode = getWorkspaceCodeByRole(role);
      if (workspaceCode) {
        const workspace = await Workspace.findOne({ code: workspaceCode, isActive: true });
        if (workspace) {
          const scopeConfig = {};
          if (role === 'hr') {
            scopeConfig.departments = departments || user.departments;
            scopeConfig.allDepartments = false;
          } else if (role === 'hod') {
            scopeConfig.departments = department ? [department] : user.department ? [user.department] : [];
            scopeConfig.allDepartments = false;
          } else if (role === 'sub_admin') {
            scopeConfig.allDepartments = true;
          }

          await RoleAssignment.create({
            userId: user._id,
            workspaceId: workspace._id,
            role: 'member',
            isPrimary: true,
            scopeConfig,
            assignedBy: req.user?._id,
          });

          // Also assign Employee Portal for HOD/HR
          if (role === 'hod' || role === 'hr') {
            const empWorkspace = await Workspace.findOne({ code: 'EMP', isActive: true });
            if (empWorkspace) {
              await RoleAssignment.create({
                userId: user._id,
                workspaceId: empWorkspace._id,
                role: 'member',
                isPrimary: false,
                assignedBy: req.user?._id,
              });
            }
          }
        }
      }
    }

    // Fetch updated user with populated fields
    const updatedUser = await User.findById(user._id)
      .populate('department', 'name code')
      .populate('departments', 'name code')
      .select('-password');

    res.status(200).json({
      success: true,
      message: 'User updated successfully',
      data: updatedUser,
    });
  } catch (error) {
    console.error('Error updating user:', error);
    res.status(500).json({
      success: false,
      message: 'Error updating user',
      error: error.message,
    });
  }
};

// @desc    Reset user password
// @route   PUT /api/users/:id/reset-password
// @access  Private (Super Admin, Sub Admin)
exports.resetPassword = async (req, res) => {
  try {
    const { newPassword, autoGenerate } = req.body;

    const user = await User.findById(req.params.id);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found',
      });
    }

    const password = autoGenerate ? generatePassword() : newPassword;
    if (!password) {
      return res.status(400).json({
        success: false,
        message: 'Password is required',
      });
    }

    user.password = password;
    await user.save();

    const response = {
      success: true,
      message: 'Password reset successfully',
    };

    if (autoGenerate) {
      response.newPassword = password;
    }

    res.status(200).json(response);
  } catch (error) {
    console.error('Error resetting password:', error);
    res.status(500).json({
      success: false,
      message: 'Error resetting password',
      error: error.message,
    });
  }
};

// @desc    Toggle user active status
// @route   PUT /api/users/:id/toggle-status
// @access  Private (Super Admin, Sub Admin)
exports.toggleUserStatus = async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found',
      });
    }

    // Prevent deactivating super_admin
    if (user.role === 'super_admin') {
      return res.status(403).json({
        success: false,
        message: 'Cannot deactivate super admin user',
      });
    }

    user.isActive = !user.isActive;
    await user.save();

    // Also deactivate workspace assignments if user deactivated
    if (!user.isActive) {
      await RoleAssignment.updateMany({ userId: user._id }, { isActive: false });
    }

    res.status(200).json({
      success: true,
      message: `User ${user.isActive ? 'activated' : 'deactivated'} successfully`,
      data: { isActive: user.isActive },
    });
  } catch (error) {
    console.error('Error toggling user status:', error);
    res.status(500).json({
      success: false,
      message: 'Error toggling user status',
      error: error.message,
    });
  }
};

// @desc    Delete user
// @route   DELETE /api/users/:id
// @access  Private (Super Admin, Sub Admin)
exports.deleteUser = async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found',
      });
    }

    // Prevent deleting super_admin
    if (user.role === 'super_admin') {
      return res.status(403).json({
        success: false,
        message: 'Cannot delete super admin user',
      });
    }

    // Delete workspace assignments
    await RoleAssignment.deleteMany({ userId: user._id });

    await user.deleteOne();

    res.status(200).json({
      success: true,
      message: 'User deleted successfully',
    });
  } catch (error) {
    console.error('Error deleting user:', error);
    res.status(500).json({
      success: false,
      message: 'Error deleting user',
      error: error.message,
    });
  }
};

// @desc    Get employees without user accounts
// @route   GET /api/users/employees-without-account
// @access  Private (Super Admin, Sub Admin, HR)
exports.getEmployeesWithoutAccount = async (req, res) => {
  try {
    // Get all employee IDs that have user accounts
    const usersWithEmployees = await User.find({
      $or: [{ employeeId: { $ne: null } }, { employeeRef: { $ne: null } }],
    }).select('employeeId employeeRef');

    const linkedEmpNos = usersWithEmployees.map((u) => u.employeeId).filter(Boolean);
    const linkedEmpRefs = usersWithEmployees.map((u) => u.employeeRef).filter(Boolean);

    // Find employees without accounts
    const employees = await Employee.find({
      emp_no: { $nin: linkedEmpNos },
      _id: { $nin: linkedEmpRefs },
      is_active: true,
    })
      .populate('department_id', 'name code')
      .populate('designation_id', 'name')
      .select('emp_no employee_name email phone_number department_id designation_id')
      .sort({ employee_name: 1 });

    res.status(200).json({
      success: true,
      count: employees.length,
      data: employees,
    });
  } catch (error) {
    console.error('Error fetching employees without accounts:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching employees',
      error: error.message,
    });
  }
};

// @desc    Get user statistics
// @route   GET /api/users/stats
// @access  Private (Super Admin, Sub Admin)
exports.getUserStats = async (req, res) => {
  try {
    const [totalUsers, activeUsers, roleStats] = await Promise.all([
      User.countDocuments(),
      User.countDocuments({ isActive: true }),
      User.aggregate([
        { $group: { _id: '$role', count: { $sum: 1 } } },
        { $sort: { count: -1 } },
      ]),
    ]);

    const roleStatsMap = {};
    roleStats.forEach((r) => {
      roleStatsMap[r._id] = r.count;
    });

    res.status(200).json({
      success: true,
      data: {
        totalUsers,
        activeUsers,
        inactiveUsers: totalUsers - activeUsers,
        byRole: roleStatsMap,
      },
    });
  } catch (error) {
    console.error('Error fetching user stats:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching user statistics',
      error: error.message,
    });
  }
};

// @desc    Update user's own profile
// @route   PUT /api/users/profile
// @access  Private
exports.updateProfile = async (req, res) => {
  try {
    const userId = req.user.userId;
    const { name, phone } = req.body;

    const updateData = {};
    if (name) updateData.name = name;
    if (phone !== undefined) updateData.phone = phone;

    const user = await User.findByIdAndUpdate(
      userId,
      updateData,
      { new: true, runValidators: true }
    ).select('-password');

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found',
      });
    }

    res.status(200).json({
      success: true,
      message: 'Profile updated successfully',
      data: user,
    });
  } catch (error) {
    console.error('Error updating profile:', error);
    res.status(500).json({
      success: false,
      message: 'Error updating profile',
      error: error.message,
    });
  }
};

// Export generateToken for use in authController
exports.generateToken = generateToken;
