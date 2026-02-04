const User = require('../model/User');
const Employee = require('../../employees/model/Employee');
const Department = require('../../departments/model/Department');
const Division = require('../../departments/model/Division');
const jwt = require('jsonwebtoken');
const Setting = require('../../settings/model/Settings');
const { generatePassword, sendCredentials } = require('../../shared/services/passwordNotificationService');


// Generate JWT Token
const generateToken = (userId) => {
  return jwt.sign({ userId }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRE || '7d',
  });
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
      scope,
      departmentType,
      featureControl,
      dataScope,
      allowedDivisions,
      divisionMapping,
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
    const userPassword = autoGeneratePassword ? await generatePassword() : password;
    if (!userPassword) {
      return res.status(400).json({
        success: false,
        message: 'Password is required',
      });
    }

    // Validate role-specific requirements
    if (role === 'hod' && (!department || !req.body.division)) {
      return res.status(400).json({
        success: false,
        message: 'HOD must be assigned to a department AND a division',
      });
    }


    // Build roles array
    const userRoles = roles && roles.length > 0 ? roles : [role];

    // Build division mapping if division is provided (legacy HOD selection)
    let finalDivisionMapping = divisionMapping || [];
    if (role === 'hod' && req.body.division && department && finalDivisionMapping.length === 0) {
      finalDivisionMapping = [{
        division: req.body.division,
        departments: [department]
      }];
    }

    // Build allowed divisions if mapping exists but allowedDivisions is empty
    let finalAllowedDivisions = allowedDivisions || [];
    if (finalAllowedDivisions.length === 0 && finalDivisionMapping.length > 0) {
      finalAllowedDivisions = finalDivisionMapping.map(m => m.division);
    }

    // Build user object conditionally to avoid null values on unique sparse fields
    const userData = {
      email: email.toLowerCase(),
      password: userPassword,
      name,
      role,
      roles: userRoles,
      department: department || null,
      departments: departments || (department ? [department] : []),
      scope: scope || 'global',
      departmentType: departmentType || 'single',
      featureControl: featureControl ? featureControl.flatMap(fc =>
        fc.includes(':') ? [fc] : [`${fc}:read`, `${fc}:write`]
      ) : [],
      createdBy: req.user?._id,
      dataScope: dataScope || undefined, // Use model default if not provided
      allowedDivisions: finalAllowedDivisions,
      divisionMapping: finalDivisionMapping,
    };

    // Only add employeeId and employeeRef if they have values (sparse index)
    if (employeeId) userData.employeeId = employeeId;
    if (employeeRef) userData.employeeRef = employeeRef;

    // Create user
    const user = await User.create(userData);

    // Valid HOD Sync: Update Department with HOD ID for specific Division
    if (role === 'hod' && department && req.body.division) {
      const dept = await Department.findById(department);
      if (dept) {
        // Remove existing HOD for this division if any
        const existingIndex = dept.divisionHODs.findIndex(dh => dh.division.toString() === req.body.division);
        if (existingIndex > -1) {
          dept.divisionHODs.splice(existingIndex, 1);
        }
        dept.divisionHODs.push({
          division: req.body.division,
          hod: user._id
        });
        await dept.save();
      }
    }

    // Manager Sync: Update Division manager reference
    if (role === 'manager' && finalAllowedDivisions && finalAllowedDivisions.length === 1) {
      const divisionId = finalAllowedDivisions[0];
      // 1. Unset this user from being manager of any OTHER divisions (safety cleanup)
      await Division.updateMany(
        { manager: user._id },
        { $unset: { manager: "" } }
      );

      // 2. Set user as manager for the SPECIFIC division
      await Division.findByIdAndUpdate(divisionId, { manager: user._id });
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
        scope: user.scope,
        departmentType: user.departmentType,
        dataScope: user.dataScope,
        allowedDivisions: user.allowedDivisions,
        divisionMapping: user.divisionMapping,
        isActive: user.isActive,
        createdAt: user.createdAt,
      },
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
      scope,
      departmentType,
      featureControl,
      dataScope,
      allowedDivisions,
      divisionMapping,
    } = req.body;

    // Find employee (including password for inheritance)
    const employee = await Employee.findOne({ emp_no: employeeId })
      .select('+password')
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

    // Generate, inherit, or use provided password
    let userPassword = password;
    if (autoGeneratePassword) {
      userPassword = await generatePassword(employee);
    } else if (!userPassword && employee.password) {
      // INHERIT PASSWORD FROM EMPLOYEE If none provided
      console.log(`[UserController] Inheriting password from employee ${employeeId} `);
      userPassword = employee.password;
    }

    if (!userPassword) {
      return res.status(400).json({
        success: false,
        message: 'Password is required. No password provided and employee has no password.',
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
      scope: scope || 'global',
      departmentType: departmentType || (role === 'hr' ? 'multiple' : 'single'),
      featureControl: featureControl ? featureControl.flatMap(fc =>
        fc.includes(':') ? [fc] : [`${fc}:read`, `${fc}:write`]
      ) : [],
      dataScope: dataScope || undefined,
      allowedDivisions: allowedDivisions || (divisionMapping ? divisionMapping.map(m => m.division) : []),
      divisionMapping: divisionMapping || [],
      createdBy: req.user?._id,
    });

    // Valid HOD Sync: Update Department with HOD ID
    if (role === 'hod' && department) {
      await Department.findByIdAndUpdate(department, { hod: user._id });
    }

    // Valid HR Sync: Update Departments with HR ID
    if (role === 'hr' && userDepartments.length > 0) {
      await Department.updateMany(
        { _id: { $in: userDepartments } },
        { hr: user._id }
      );
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
        scope: user.scope,
        departmentType: user.departmentType,
        dataScope: user.dataScope,
        allowedDivisions: user.allowedDivisions,
        divisionMapping: user.divisionMapping,
        isActive: user.isActive,
      },
      employee: {
        _id: employee._id,
        emp_no: employee.emp_no,
        employee_name: employee.employee_name,
        department: employee.department_id,
        designation: employee.designation_id,
      },
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
        .populate('divisionMapping.division', 'name code')
        .populate('divisionMapping.departments', 'name code')
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
      .populate('divisionMapping.division', 'name code')
      .populate('divisionMapping.departments', 'name code')
      .populate('employeeRef')
      .select('-password');

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found',
      });
    }

    res.status(200).json({
      success: true,
      data: user,
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
    const {
      name,
      role,
      roles,
      department,
      departments,
      isActive,
      employeeId,
      employeeRef,
      scope,
      departmentType,
      featureControl,
      dataScope,
      allowedDivisions,
      divisionMapping
    } = req.body;

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

    // Capture old values for sync
    const oldDepartments = user.departments ? user.departments.map(d => d.toString()) : [];
    const oldDepartment = user.department ? user.department.toString() : null;

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
    if (scope !== undefined) user.scope = scope;
    if (departmentType !== undefined) user.departmentType = departmentType;
    if (featureControl !== undefined) user.featureControl = featureControl;
    if (dataScope !== undefined) user.dataScope = dataScope;
    if (allowedDivisions !== undefined) user.allowedDivisions = allowedDivisions;
    if (divisionMapping !== undefined) user.divisionMapping = divisionMapping;

    // Update Division Mapping if provided (for HOD re-assignment)
    if (req.body.division && department) {
      user.divisionMapping = [{
        division: req.body.division,
        departments: [department]
      }];
    }

    await user.save();

    // Sync: Reverse Sync (User -> Department)
    // If user removed from a department, unset them as HOD/HR there
    if (departments !== undefined) {
      const newCtxDepartments = departments.map(d => d.toString());
      const removedDepartments = oldDepartments.filter(d => !newCtxDepartments.includes(d));

      if (removedDepartments.length > 0) {
        // Unset HOD
        await Department.updateMany(
          { _id: { $in: removedDepartments }, hod: user._id },
          { $unset: { hod: "" } }
        );
        // Unset HR
        await Department.updateMany(
          { _id: { $in: removedDepartments }, hr: user._id },
          { $unset: { hr: "" } }
        );
      }
    }

    // Sync: Reverse Sync (User -> Division for Managers)
    if (role === 'manager' && allowedDivisions !== undefined && allowedDivisions.length > 0) {
      // Currently we enforce 1 division for manager in UI, but allowedDivisions is array
      const newDivisionId = allowedDivisions[0];

      // 1. Find if user was managing a different division previously (that is NOT the new one)
      // We can just unset user from ALL divisions first to be safe, or just check 'old' vs 'new'
      // Safer: Unset user from all divisions
      await Division.updateMany(
        { manager: user._id },
        { $unset: { manager: "" } }
      );

      // 2. Assign user to the new division
      await Division.findByIdAndUpdate(newDivisionId, { manager: user._id });
    } else if (role === 'manager' && allowedDivisions !== undefined && allowedDivisions.length === 0) {
      // If manager has NO divisions assigned (cleared), remove them from div model
      await Division.updateMany(
        { manager: user._id },
        { $unset: { manager: "" } }
      );
    } else if (role !== 'manager' && roleChanged) {
      // If user WAS a manager but is no longer (role changed), remove them from any division
      await Division.updateMany(
        { manager: user._id },
        { $unset: { manager: "" } }
      );
    }

    // Sync: Handle Single Department Change (mainly for HODs)
    if (department !== undefined && oldDepartment && oldDepartment !== (department || '')) {
      // If user was HOD of the old department, unset it
      await Department.findOneAndUpdate(
        { _id: oldDepartment, hod: user._id },
        { $unset: { hod: "" } }
      );
    }

    // Valid HOD Sync: Update Department with HOD ID for Specific Division
    if (user.role === 'hod' && user.department && user.divisionMapping && user.divisionMapping.length > 0) {
      // We assume single division for HOD for now based on current logic
      const divisionId = user.divisionMapping[0].division;
      if (divisionId) {
        const dept = await Department.findById(user.department);
        if (dept) {
          const existingIndex = dept.divisionHODs.findIndex(dh => dh.division.toString() === divisionId.toString());
          if (existingIndex > -1) {
            dept.divisionHODs[existingIndex].hod = user._id;
          } else {
            dept.divisionHODs.push({ division: divisionId, hod: user._id });
          }
          await dept.save();
        }
      }
    }

    // Valid HR Sync: Update Departments with HR ID
    if (user.role === 'hr' && user.departments && user.departments.length > 0) {
      await Department.updateMany(
        { _id: { $in: user.departments } },
        { hr: user._id }
      );
    }

    // Fetch updated user with populated fields
    const updatedUser = await User.findById(user._id)
      .populate('department', 'name code')
      .populate('departments', 'name code')
      .populate('divisionMapping.division', 'name code')
      .populate('divisionMapping.departments', 'name code')
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

    const password = autoGenerate ? await generatePassword() : newPassword;
    if (!password) {
      return res.status(400).json({
        success: false,
        message: 'Password is required',
      });
    }

    user.password = password;
    await user.save();

    // Send notification
    let notificationSent = false;
    try {
      // Find employee to get contact info if not in user
      const employee = await Employee.findById(user.employeeRef);
      const deliveryInfo = {
        employee_name: user.name,
        emp_no: user.employeeId || (employee ? employee.emp_no : 'User'),
        email: user.email,
        phone_number: employee ? employee.phone_number : null
      };

      const notificationResult = await sendCredentials(deliveryInfo, password, null, true);
      notificationSent = notificationResult.email || notificationResult.sms;
    } catch (notificationError) {
      console.error('[UserController] Failed to send reset notification:', notificationError.message);
    }

    const response = {
      success: true,
      message: notificationSent
        ? 'Password reset successfully and notification sent.'
        : 'Password reset successfully, but failed to send notification.',
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
