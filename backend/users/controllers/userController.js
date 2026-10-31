const User = require('../model/User');
const Employee = require('../../employees/model/Employee');
const { EMP_NO_SORT, EMP_NO_COLLATION } = require('../../shared/utils/employeeSort');
const EmployeeHistory = require('../../employees/model/EmployeeHistory');
const UserHistory = require('../model/UserHistory');
const Department = require('../../departments/model/Department');
const Division = require('../../departments/model/Division');
const jwt = require('jsonwebtoken');
const Setting = require('../../settings/model/Settings');
const { generatePassword, sendCredentials } = require('../../shared/services/passwordNotificationService');
const EmployeeApplication = require('../../employee-applications/model/EmployeeApplication');
const { generateLegacyToken } = require('../../authentication/services/tokenService');

// Generate JWT Token (legacy fallback — prefer session-based login tokens)
const generateToken = (userId) => generateLegacyToken(userId);

async function logUserHistory({ userId, event, reqUser, targetUser, details, comments }) {
  try {
    await UserHistory.create({
      userId,
      event,
      performedBy: reqUser?._id || null,
      performedByName: reqUser?.name || null,
      performedByRole: reqUser?.role || null,
      targetUserName: targetUser?.name || null,
      targetUserEmail: targetUser?.email || null,
      targetUserRole: targetUser?.role || null,
      targetEmployeeId: targetUser?.employeeId || null,
      details: details || {},
      comments: comments || null,
    });
  } catch (err) {
    console.error('[UserHistory] log failed:', err.message);
  }
}

async function formatDivisionMappingSummary(mappings) {
  if (!Array.isArray(mappings) || mappings.length === 0) return [];
  const result = [];
  for (const m of mappings) {
    if (!m) continue;
    const divId = m.division?._id || m.division;
    let divName = m.division?.name || m.division?.code;
    if (!divName && divId) {
      try {
        const dDoc = await Division.findById(divId).select('name code').lean();
        divName = dDoc?.name || dDoc?.code || String(divId);
      } catch (e) {
        divName = String(divId);
      }
    }
    const deptIds = m.departments || [];
    const deptNames = [];
    for (const d of deptIds) {
      if (!d) continue;
      let dName = d?.name || d?.code;
      const dId = d?._id || d;
      if (!dName && dId) {
        try {
          const dpDoc = await Department.findById(dId).select('name code').lean();
          dName = dpDoc?.name || dpDoc?.code || String(dId);
        } catch (e) {
          dName = String(dId);
        }
      }
      if (dName) deptNames.push(dName);
    }
    result.push({
      divisionId: String(divId || ''),
      divisionName: divName || 'Unknown Division',
      departments: deptNames,
    });
  }
  return result;
}

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
      employeeId,
      employeeRef,
      autoGeneratePassword,
      assignWorkspace,
      scope,
      featureControl,
      dataScope,
      divisionMapping,
      phone_number,
      customRoles,
      managedHolidayGroupIds,
      holidayDivisionMapping,
    } = req.body;
    const { department, division } = req.body;

    // Only super_admin can create another super_admin
    if (role === 'super_admin' && req.user.role !== 'super_admin') {
      return res.status(403).json({
        success: false,
        message: 'Only a super admin can create another super admin',
      });
    }

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
    if (!autoGeneratePassword && String(userPassword).length < 4) {
      return res.status(400).json({
        success: false,
        message: 'Password must be at least 4 characters',
      });
    }

    // Validate role-specific requirements: HOD must have at least one division and one department (via divisionMapping or division+department)
    if (role === 'hod') {
      const hasMapping = divisionMapping && Array.isArray(divisionMapping) && divisionMapping.length > 0;
      const hasDeptsInMapping = hasMapping && divisionMapping.some(m => (m.departments || []).length > 0);
      if (!hasDeptsInMapping && !(division && department)) {
        return res.status(400).json({
          success: false,
          message: 'HOD must be assigned to at least one division and one department (via divisionMapping or division+department)',
        });
      }
    }

    const userRoles = roles && roles.length > 0 ? roles : [role];

    let finalDivisionMapping = Array.isArray(divisionMapping) ? divisionMapping : [];

    // Fallback logic if divisionMapping is missing but division/department are provided
    if (finalDivisionMapping.length === 0 && division && department) {
      finalDivisionMapping = [{ division, departments: [department] }];
    }

    const userData = {
      email: email.toLowerCase(),
      password: userPassword,
      name,
      role,
      roles: userRoles,
      scope: scope || 'global',
      featureControl: featureControl ? featureControl.flatMap(fc =>
        fc.includes(':') ? [fc] : [`${fc}:read`, `${fc}:write`]
      ) : [],
      createdBy: req.user?._id,
      dataScope: dataScope || undefined,
      divisionMapping: finalDivisionMapping,
      phone_number: phone_number || null,
      customRoles: customRoles || [],
      managedHolidayGroupIds: Array.isArray(managedHolidayGroupIds) ? managedHolidayGroupIds : [],
      holidayDivisionMapping: Array.isArray(holidayDivisionMapping) ? holidayDivisionMapping : [],
    };

    // Only add employeeId and employeeRef if they have values (sparse index)
    if (employeeId) userData.employeeId = employeeId;
    if (employeeRef) userData.employeeRef = employeeRef;

    // Create user
    const user = await User.create(userData);

    await logUserHistory({
      userId: user._id,
      event: 'user_created',
      reqUser: req.user,
      targetUser: user,
      details: {
        role: user.role,
        roles: user.roles,
        scope: user.scope,
        dataScope: user.dataScope,
        managedHolidayGroupIds: user.managedHolidayGroupIds || [],
      },
      comments: `User created with role ${user.role}`,
    });

    // HOD Sync: Update every department in divisionMapping with this user as HOD for the respective division
    if (role === 'hod' && finalDivisionMapping.length > 0) {
      for (const mapping of finalDivisionMapping) {
        const divId = mapping.division?._id || mapping.division;
        const deptIds = mapping.departments || [];
        if (!divId) continue;
        const divStr = divId.toString();
        for (const deptId of deptIds) {
          const id = deptId?._id || deptId;
          const dept = await Department.findById(id);
          if (dept) {
            const idx = dept.divisionHODs.findIndex(dh => (dh.division?.toString() || dh.division) === divStr);
            if (idx > -1) dept.divisionHODs[idx].hod = user._id;
            else dept.divisionHODs.push({ division: divId, hod: user._id });
            await dept.save();
          }
        }
      }
    }

    // Manager Sync: Update Division manager reference
    const managerDivisionId = finalDivisionMapping.length === 1 ? (finalDivisionMapping[0].division?._id || finalDivisionMapping[0].division) : null;
    if (role === 'manager' && managerDivisionId) {
      const divisionId = managerDivisionId;
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
        employeeId: user.employeeId,
        employeeRef: user.employeeRef,
        scope: user.scope,
        dataScope: user.dataScope,
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
      employeeId: empNo,
      email,
      password,
      role,
      roles,
      autoGeneratePassword,
      scope,
      featureControl,
      dataScope,
      divisionMapping,
      phone_number,
      customRoles,
      managedHolidayGroupIds,
      holidayDivisionMapping,
    } = req.body;
    const { departments, department, division } = req.body;

    // Only super_admin can create another super_admin from employee
    if (role === 'super_admin' && req.user.role !== 'super_admin') {
      return res.status(403).json({
        success: false,
        message: 'Only a super admin can create a super admin account from an employee',
      });
    }

    // Find employee (including password for inheritance)
    const employee = await Employee.findOne({ emp_no: empNo })
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
    if (!autoGeneratePassword && password && String(password).length < 4) {
      return res.status(400).json({
        success: false,
        message: 'Password must be at least 4 characters',
      });
    }

    const empDeptId = employee.department_id?._id || employee.department_id;
    let finalDivisionMapping = Array.isArray(divisionMapping) ? divisionMapping : [];

    // Priority 1: Use divisionMapping if provided from frontend
    // Priority 2: Use division + department if provided from frontend
    // Priority 3: Auto-generate from employee's department (fallback for simple registration)
    if (finalDivisionMapping.length === 0) {
      if (division && department) {
        finalDivisionMapping = [{ division, departments: [department] }];
      } else if (departments?.length > 0 || empDeptId) {
        // Fallback: Auto-generate from departments (only if nothing specific was sent)
        const deptIds = (role === 'hr' && departments?.length > 0) ? departments : (empDeptId ? [empDeptId] : []);
        if (deptIds.length > 0) {
          const depts = await Department.find({ _id: { $in: deptIds } }).select('divisions').lean();
          const mapByDiv = new Map();
          for (const d of depts) {
            const divs = d.divisions || [];
            for (const div of divs) {
              const divId = (div?._id || div).toString();
              if (!mapByDiv.has(divId)) mapByDiv.set(divId, new Set());
              mapByDiv.get(divId).add(d._id.toString());
            }
          }
          finalDivisionMapping = Array.from(mapByDiv.entries()).map(([divId, deptSet]) => ({
            division: divId,
            departments: Array.from(deptSet),
          }));
        }
      }
    }

    const userRoles = roles && roles.length > 0 ? roles : [role];

    const user = await User.create({
      email: userEmail.toLowerCase(),
      password: userPassword,
      name: employee.employee_name,
      role: role || 'employee',
      roles: userRoles,
      employeeId: employee.emp_no,
      employeeRef: employee._id,
      scope: scope || 'global',
      featureControl: featureControl ? featureControl.flatMap(fc =>
        fc.includes(':') ? [fc] : [`${fc}:read`, `${fc}:write`]
      ) : [],
      dataScope: dataScope || undefined,
      divisionMapping: finalDivisionMapping,
      createdBy: req.user?._id,
      phone_number: phone_number || employee.phone_number || null,
      customRoles: customRoles || [],
      managedHolidayGroupIds: Array.isArray(managedHolidayGroupIds) ? managedHolidayGroupIds : [],
      holidayDivisionMapping: Array.isArray(holidayDivisionMapping) ? holidayDivisionMapping : [],
    });

    // Update the employee password if it was newly generated or provided
    if (autoGeneratePassword || password) {
      employee.password = userPassword;
      employee.plain_password = userPassword;
      await employee.save();
      console.log(`[UserController] Syncing newly generated/provided password to employee ${employee.emp_no}`);
    }

    await logUserHistory({
      userId: user._id,
      event: 'user_created_from_employee',
      reqUser: req.user,
      targetUser: user,
      details: {
        employeeId: user.employeeId,
        employeeRef: user.employeeRef,
        role: user.role,
        roles: user.roles,
        managedHolidayGroupIds: user.managedHolidayGroupIds || [],
      },
      comments: `User created from employee ${employee.emp_no} with role ${user.role}`,
    });

    // Employee history: user created / promoted (from employee to role)
    try {
      await EmployeeHistory.create({
        emp_no: employee.emp_no,
        event: 'user_promoted',
        performedBy: req.user._id,
        performedByName: req.user.name,
        performedByRole: req.user.role,
        details: {
          userId: user._id,
          newRole: user.role,
          newRoles: user.roles,
        },
        comments: `User account created from employee and promoted to role: ${user.role}`,
      });
    } catch (err) {
      console.error('Failed to log user promotion history:', err.message);
    }

    const deptIdsFromMapping = finalDivisionMapping.flatMap(m => m.departments || []);
    if (role === 'hod' && finalDivisionMapping.length > 0) {
      for (const mapping of finalDivisionMapping) {
        const divId = mapping.division?._id || mapping.division;
        const deptIds = mapping.departments || [];
        if (!divId) continue;
        const divStr = divId.toString();
        for (const deptId of deptIds) {
          const id = deptId?._id || deptId;
          const dept = await Department.findById(id);
          if (dept) {
            const idx = dept.divisionHODs.findIndex(dh => (dh.division?.toString() || dh.division) === divStr);
            if (idx > -1) dept.divisionHODs[idx].hod = user._id;
            else dept.divisionHODs.push({ division: divId, hod: user._id });
            await dept.save();
          }
        }
      }
    }
    if (role === 'hr' && deptIdsFromMapping.length > 0) {
      await Department.updateMany(
        { _id: { $in: deptIdsFromMapping } },
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
        employeeId: user.employeeId,
        employeeRef: user.employeeRef,
        scope: user.scope,
        dataScope: user.dataScope,
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
    const { role, department, division, isActive, search, page = 1, limit = 50 } = req.query;
    const query = req.metadataScopeFilter ? { ...req.metadataScopeFilter } : {};

    if (role) query.role = role;

    if (department) {
      if (division) {
        // Strict intersection for specific department search within a division
        query.divisionMapping = {
          $elemMatch: {
            division: division,
            departments: department
          }
        };
      } else {
        query['divisionMapping.departments'] = department;
      }
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
      isActive,
      employeeId,
      employeeRef,
      scope,
      featureControl,
      dataScope,
      divisionMapping,
      phone_number,
      customRoles,
      managedHolidayGroupIds,
      holidayDivisionMapping,
    } = req.body;
    const { department, division } = req.body;

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

    // Only super_admin can promote someone else to super_admin
    if (role === 'super_admin' && req.user.role !== 'super_admin') {
      return res.status(403).json({
        success: false,
        message: 'Only a super admin can promote a user to super admin role',
      });
    }

    // Track original values for history
    const originalRole = user.role;
    const originalRoles = Array.isArray(user.roles) ? [...user.roles] : [];
    const originalIsActive = user.isActive;
    const originalDataScope = user.dataScope;
    const originalScope = user.scope;
    const originalFeatureControl = Array.isArray(user.featureControl) ? [...user.featureControl] : [];
    const originalName = user.name || '';
    const originalPhone = user.phone_number || '';
    const originalEmployeeId = user.employeeId || '';
    const originalDivisionMapping = JSON.parse(JSON.stringify(user.divisionMapping || []));

    // Track if role changed for workspace update
    const roleChanged = role && role !== user.role;

    const oldMapping = user.divisionMapping || [];
    const oldDeptIds = new Set();
    oldMapping.forEach(m => {
      (m.departments || []).forEach(d => oldDeptIds.add((d?._id || d).toString()));
    });

    if (name !== undefined) user.name = name;
    if (phone_number !== undefined) user.phone_number = phone_number;
    if (role !== undefined) {
      user.role = role;
      user.roles = roles || [role];
    }
    if (isActive !== undefined) user.isActive = isActive;
    if (employeeId !== undefined) user.employeeId = employeeId;
    if (employeeRef !== undefined) user.employeeRef = employeeRef;
    if (scope !== undefined) user.scope = scope;
    if (featureControl !== undefined) {
      user.featureControl = Array.isArray(featureControl) ? featureControl.flatMap(fc =>
        fc.includes(':') ? [fc] : [`${fc}:read`, `${fc}:write`]
      ) : [];
    }
    if (dataScope !== undefined) user.dataScope = dataScope;
    if (divisionMapping !== undefined) {
      user.divisionMapping = divisionMapping;
    } else if (division && department) {
      user.divisionMapping = [{ division, departments: [department] }];
    }
    if (customRoles !== undefined) user.customRoles = customRoles;
    if (managedHolidayGroupIds !== undefined) {
      user.managedHolidayGroupIds = Array.isArray(managedHolidayGroupIds) ? managedHolidayGroupIds : [];
    }
    if (holidayDivisionMapping !== undefined) {
      user.holidayDivisionMapping = Array.isArray(holidayDivisionMapping) ? holidayDivisionMapping : [];
    }

    await user.save();

    // Compute diffs for audit trail
    const diffs = {};
    let isAccessChange = false;

    if (role !== undefined && role !== originalRole) {
      diffs.role = { from: originalRole, to: role };
      isAccessChange = true;
    }
    if (isActive !== undefined && isActive !== originalIsActive) {
      diffs.isActive = { from: originalIsActive, to: isActive };
      isAccessChange = true;
    }
    if (dataScope !== undefined && dataScope !== originalDataScope) {
      diffs.dataScope = { from: originalDataScope, to: dataScope };
      isAccessChange = true;
    }
    if (scope !== undefined && scope !== originalScope) {
      diffs.scope = { from: originalScope, to: scope };
      isAccessChange = true;
    }
    if (featureControl !== undefined) {
      const origSet = new Set(originalFeatureControl);
      const newFC = user.featureControl || [];
      const newSet = new Set(newFC);
      const added = [...newSet].filter(fc => !origSet.has(fc));
      const removed = [...origSet].filter(fc => !newSet.has(fc));
      if (added.length > 0 || removed.length > 0) {
        diffs.featureControl = { added, removed };
        isAccessChange = true;
      }
    }
    const newSummary = await formatDivisionMappingSummary(user.divisionMapping || []);
    if (divisionMapping !== undefined || (division && department)) {
      const oldSummary = await formatDivisionMappingSummary(originalDivisionMapping);
      const oldKey = JSON.stringify(oldSummary);
      const newKey = JSON.stringify(newSummary);
      if (oldKey !== newKey) {
        diffs.divisionMapping = {
          from: oldSummary,
          to: newSummary,
        };
        isAccessChange = true;
      }
    }
    if (name !== undefined && name.trim() !== originalName.trim()) {
      diffs.name = { from: originalName, to: name };
    }
    if (phone_number !== undefined && (phone_number || '').trim() !== originalPhone.trim()) {
      diffs.phone_number = { from: originalPhone || '—', to: phone_number || '—' };
    }
    if (employeeId !== undefined && (employeeId || '').trim() !== originalEmployeeId.trim()) {
      diffs.employeeId = { from: originalEmployeeId || '—', to: employeeId || '—' };
    }

    const commentParts = [];
    if (diffs.name) {
      commentParts.push(`Name changed: "${diffs.name.from}" → "${diffs.name.to}"`);
    }
    if (diffs.phone_number) {
      commentParts.push(`Phone changed: "${diffs.phone_number.from}" → "${diffs.phone_number.to}"`);
    }
    if (diffs.employeeId) {
      commentParts.push(`Emp ID changed: "${diffs.employeeId.from}" → "${diffs.employeeId.to}"`);
    }
    if (diffs.role) {
      commentParts.push(`Role changed: ${diffs.role.from} → ${diffs.role.to}`);
    }
    if (diffs.isActive !== undefined) {
      commentParts.push(diffs.isActive.to ? 'Account activated' : 'Account deactivated');
    }
    if (diffs.divisionMapping) {
      const fromStr = (diffs.divisionMapping.from || []).map(m => `${m.divisionName} (${(m.departments || []).join(', ') || 'All'})`).join('; ') || 'None';
      const toStr = (diffs.divisionMapping.to || []).map(m => `${m.divisionName} (${(m.departments || []).join(', ') || 'All'})`).join('; ') || 'None';
      commentParts.push(`Division/Dept: [${fromStr}] → [${toStr}]`);
    }
    if (diffs.featureControl) {
      const addCount = diffs.featureControl.added?.length || 0;
      const remCount = diffs.featureControl.removed?.length || 0;
      commentParts.push(`Permissions: (+${addCount}, -${remCount})`);
    }
    if (diffs.dataScope) {
      commentParts.push(`Data Scope: ${diffs.dataScope.from} → ${diffs.dataScope.to}`);
    }

    const hasAnyFieldChange = Object.keys(diffs).length > 0;
    const auditComment = hasAnyFieldChange 
      ? commentParts.join(' • ') 
      : 'Profile re-saved • All field values and permissions unchanged';

    await logUserHistory({
      userId: user._id,
      event: isAccessChange ? 'access_updated' : (hasAnyFieldChange ? 'user_updated' : 'user_saved'),
      reqUser: req.user,
      targetUser: user,
      details: {
        diffs,
        hasFieldChanges: hasAnyFieldChange,
        hasAccessChanges: isAccessChange,
        noChanges: !hasAnyFieldChange,
        accessSnapshot: {
          dataScope: user.dataScope || 'all',
          divisionMapping: newSummary,
          featureControl: user.featureControl || [],
          role: user.role,
          isActive: user.isActive !== false,
        },
        changed: {
          name: name !== undefined,
          phone_number: phone_number !== undefined,
          role: role !== undefined,
          isActive: isActive !== undefined,
          scope: scope !== undefined,
          dataScope: dataScope !== undefined,
          divisionMapping: divisionMapping !== undefined || (!!division && !!department),
          featureControl: featureControl !== undefined,
          customRoles: customRoles !== undefined,
          managedHolidayGroupIds: managedHolidayGroupIds !== undefined,
        },
        managedHolidayGroupIds: user.managedHolidayGroupIds || [],
      },
      comments: auditComment,
    });

    const newDeptIds = new Set();
    (user.divisionMapping || []).forEach(m => {
      (m.departments || []).forEach(d => newDeptIds.add((d?._id || d).toString()));
    });
    const removedDeptIds = [...oldDeptIds].filter(d => !newDeptIds.has(d));

    if (removedDeptIds.length > 0) {
      await Department.updateMany(
        { _id: { $in: removedDeptIds }, hod: user._id },
        { $unset: { hod: "" } }
      );
      await Department.updateMany(
        { _id: { $in: removedDeptIds }, hr: user._id },
        { $unset: { hr: "" } }
      );
      // Remove this user from divisionHODs in departments no longer in mapping
      await Department.updateMany(
        { _id: { $in: removedDeptIds } },
        { $pull: { divisionHODs: { hod: user._id } } }
      );
    }

    const managerDivId = user.divisionMapping?.[0]?.division?._id || user.divisionMapping?.[0]?.division;
    if (role === 'manager' && managerDivId) {
      await Division.updateMany({ manager: user._id }, { $unset: { manager: "" } });
      await Division.findByIdAndUpdate(managerDivId, { manager: user._id });
    } else if (role === 'manager' || roleChanged) {
      await Division.updateMany({ manager: user._id }, { $unset: { manager: "" } });
    }

    // HOD: sync all (division, department) in divisionMapping to each department's divisionHODs
    if (user.role === 'hod' && user.divisionMapping?.length > 0) {
      for (const mapping of user.divisionMapping) {
        const divId = mapping.division?._id || mapping.division;
        const deptIds = mapping.departments || [];
        if (!divId) continue;
        const divStr = divId.toString();
        for (const deptId of deptIds) {
          const id = deptId?._id || deptId;
          const dept = await Department.findById(id);
          if (dept) {
            const idx = dept.divisionHODs.findIndex(dh => (dh.division?.toString() || dh.division) === divStr);
            if (idx > -1) dept.divisionHODs[idx].hod = user._id;
            else dept.divisionHODs.push({ division: divId, hod: user._id });
            await dept.save();
          }
        }
      }
    }

    if (user.role === 'hr' && newDeptIds.size > 0) {
      await Department.updateMany(
        { _id: { $in: Array.from(newDeptIds) } },
        { hr: user._id }
      );
    }

    // Fetch updated user with populated fields
    const updatedUser = await User.findById(user._id)
      .populate('divisionMapping.division', 'name code')
      .populate('divisionMapping.departments', 'name code')
      .select('-password');

    // Employee history: role / status changes
    try {
      // Resolve employee number if linked
      let empNoForHistory = user.employeeId;
      if (!empNoForHistory && user.employeeRef) {
        const empDoc = await Employee.findById(user.employeeRef).select('emp_no');
        empNoForHistory = empDoc?.emp_no;
      }

      if (empNoForHistory) {
        // Role change (promotion/demotion)
        if (role !== undefined && originalRole !== role) {
          const isPromotion = originalRole === 'employee' && role !== 'employee';
          const event = isPromotion ? 'user_promoted' : 'user_demoted';
          const comments = isPromotion
            ? `Promoted from ${originalRole || 'employee'} to ${role}`
            : `Role changed from ${originalRole || 'employee'} to ${role}`;

          await EmployeeHistory.create({
            emp_no: empNoForHistory,
            event,
            performedBy: req.user._id,
            performedByName: req.user.name,
            performedByRole: req.user.role,
            details: {
              userId: user._id,
              previousRole: originalRole,
              previousRoles: originalRoles,
              newRole: user.role,
              newRoles: user.roles,
            },
            comments,
          });
        }

        // Activation / deactivation via updateUser
        if (isActive !== undefined && originalIsActive !== isActive) {
          await EmployeeHistory.create({
            emp_no: empNoForHistory,
            event: isActive ? 'user_activated' : 'user_deactivated',
            performedBy: req.user._id,
            performedByName: req.user.name,
            performedByRole: req.user.role,
            details: {
              userId: user._id,
            },
            comments: isActive
              ? 'User account activated (access restored)'
              : 'User account temporarily deactivated',
          });
        }
      }
    } catch (err) {
      console.error('Failed to log user update history:', err.message);
    }

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
    if (!autoGenerate && String(password).length < 4) {
      return res.status(400).json({
        success: false,
        message: 'Password must be at least 4 characters',
      });
    }

    user.password = password;
    await user.save();

    // Update password in the Employee collection if linked
    if (user.employeeRef || user.employeeId) {
      try {
        const employee = await Employee.findOne({
          $or: [
            ...(user.employeeRef ? [{ _id: user.employeeRef }] : []),
            ...(user.employeeId ? [{ emp_no: user.employeeId }] : [])
          ]
        });
        if (employee) {
          employee.password = password;
          employee.plain_password = password;
          await employee.save();
          console.log(`[UserController] Syncing reset password to employee ${employee.emp_no}`);
        }
      } catch (empUpdateErr) {
        console.error('[UserController] Failed to update password in Employee collection:', empUpdateErr.message);
      }
    }

    // Send notification
    let notificationSent = false;
    try {
      // Find employee to get contact info if not in user
      const employee = await Employee.findById(user.employeeRef);
      const deliveryInfo = {
        employee_name: user.name,
        emp_no: user.employeeId || (employee ? employee.emp_no : 'User'),
        email: user.email,
        phone_number: user.phone_number || (employee ? employee.phone_number : null)
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

    // Employee history: user password reset
    try {
      // Resolve employee number if linked
      let empNoForHistory = user.employeeId;
      if (!empNoForHistory && user.employeeRef) {
        const empDoc = await Employee.findById(user.employeeRef).select('emp_no');
        empNoForHistory = empDoc?.emp_no;
      }

      if (empNoForHistory) {
        await EmployeeHistory.create({
          emp_no: empNoForHistory,
          event: 'password_reset',
          performedBy: req.user._id,
          performedByName: req.user.name,
          performedByRole: req.user.role,
          details: {
            userId: user._id,
            autoGenerate: !!autoGenerate,
          },
          comments: 'User password reset by administrator',
        });
      }
    } catch (err) {
      console.error('Failed to log user password reset history:', err.message);
    }

    await logUserHistory({
      userId: user._id,
      event: 'password_reset',
      reqUser: req.user,
      targetUser: user,
      details: { autoGenerate: !!autoGenerate },
      comments: 'User password reset by administrator',
    });

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

    const originalIsActive = user.isActive;

    user.isActive = !user.isActive;
    await user.save();

    // Employee history: toggle active status (temporary deactivation / activation)
    try {
      let empNoForHistory = user.employeeId;
      if (!empNoForHistory && user.employeeRef) {
        const empDoc = await Employee.findById(user.employeeRef).select('emp_no');
        empNoForHistory = empDoc?.emp_no;
      }

      if (empNoForHistory && originalIsActive !== user.isActive) {
        await EmployeeHistory.create({
          emp_no: empNoForHistory,
          event: user.isActive ? 'user_activated' : 'user_deactivated',
          performedBy: req.user._id,
          performedByName: req.user.name,
          performedByRole: req.user.role,
          details: {
            userId: user._id,
          },
          comments: user.isActive
            ? 'User account activated (access restored)'
            : 'User account temporarily deactivated',
        });
      }
    } catch (err) {
      console.error('Failed to log user toggle-status history:', err.message);
    }

    await logUserHistory({
      userId: user._id,
      event: user.isActive ? 'user_activated' : 'user_deactivated',
      reqUser: req.user,
      targetUser: user,
      details: {
        previousState: originalIsActive,
        newState: user.isActive,
      },
      comments: user.isActive
        ? 'User account activated (access restored)'
        : 'User account deactivated (access revoked)',
    });

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

    // If this user is linked to an employee, reject any active application for that employee
    const empNo = user.employeeId;
    if (empNo) {
      const application = await EmployeeApplication.findOne({
        emp_no: empNo,
        status: { $in: ['pending', 'verified', 'approved'] },
      });
      if (application) {
        application.status = 'rejected';
        application.rejectedBy = req.user?._id || null;
        application.rejectedAt = new Date();
        application.rejectionComments = 'User account deleted by administrator.';
        await application.save();
        console.log(`[deleteUser] Rejected application ${application._id} for employee ${empNo} (user deleted)`);
      }
    }

    await logUserHistory({
      userId: user._id,
      event: 'user_deleted',
      reqUser: req.user,
      targetUser: user,
      details: { role: user.role, email: user.email, employeeId: user.employeeId },
      comments: `User account deleted (${user.name || user.email})`,
    });

    await user.deleteOne();

    // Employee history: user deleted (treated as demoted / access removed)
    try {
      if (empNo) {
        await EmployeeHistory.create({
          emp_no: empNo,
          event: 'user_deleted',
          performedBy: req.user._id,
          performedByName: req.user.name,
          performedByRole: req.user.role,
          details: {
            userId: user._id,
            previousRole: user.role,
            previousRoles: user.roles,
          },
          comments: 'User account deleted; access removed (demoted back to employee record only)',
        });
      }
    } catch (err) {
      console.error('Failed to log user deletion history:', err.message);
    }

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
      .sort(EMP_NO_SORT)
      .collation(EMP_NO_COLLATION);

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
// When profilePhoto is provided: if user has employeeRef, store on Employee; else store on User.
exports.updateProfile = async (req, res) => {
  try {
    const userId = req.user.userId;
    const { name, phone, profilePhoto, email } = req.body;

    const updateData = {};
    if (name) updateData.name = name;
    if (phone !== undefined) updateData.phone = phone;

    const userDoc = await User.findById(userId).select('-password');
    if (userDoc) {
      // Email update is restricted to super_admin role only
      if (email !== undefined && email !== null && String(email).trim()) {
        if (userDoc.role !== 'super_admin') {
          return res.status(403).json({
            success: false,
            message: 'Only Super Admins can update their email address',
          });
        }
        const newEmail = String(email).trim().toLowerCase();
        // Validate email format
        const emailRegex = /^\S+@\S+\.\S+$/;
        if (!emailRegex.test(newEmail)) {
          return res.status(400).json({
            success: false,
            message: 'Please provide a valid email address',
          });
        }
        // Check uniqueness (exclude current user)
        const existingUser = await User.findOne({ email: newEmail, _id: { $ne: userId } });
        if (existingUser) {
          return res.status(400).json({
            success: false,
            message: 'This email address is already in use by another account',
          });
        }
        updateData.email = newEmail;
      }

      if (profilePhoto !== undefined) {
        const photoUrl = profilePhoto && String(profilePhoto).trim() ? String(profilePhoto).trim() : null;
        if (userDoc.employeeRef) {
          await Employee.findByIdAndUpdate(userDoc.employeeRef, { profilePhoto: photoUrl });
        } else {
          updateData.profilePhoto = photoUrl;
        }
      }
      const user = await User.findByIdAndUpdate(
        userId,
        updateData,
        { new: true, runValidators: true }
      ).select('-password');
      return res.status(200).json({
        success: true,
        message: 'Profile updated successfully',
        data: user,
      });
    }

    const employeeDoc = await Employee.findById(userId).select('-password');
    if (employeeDoc) {
      if (name) await Employee.findByIdAndUpdate(userId, { employee_name: name });
      if (profilePhoto !== undefined) {
        const photoUrl = profilePhoto && String(profilePhoto).trim() ? String(profilePhoto).trim() : null;
        await Employee.findByIdAndUpdate(userId, { profilePhoto: photoUrl });
      }
      const employee = await Employee.findById(userId).select('-password');
      return res.status(200).json({
        success: true,
        message: 'Profile updated successfully',
        data: { ...employee.toObject(), name: employee.employee_name },
      });
    }

    return res.status(404).json({
      success: false,
      message: 'User not found',
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

// @desc    Get user activity log (admin)
// @route   GET /api/users/:id/activity
// @access  Private (Super Admin)
exports.getUserActivity = async (req, res) => {
  try {
    const userId = req.params.id;
    const limit = Math.min(Number(req.query.limit) || 50, 200);
    const rows = await UserHistory.find({ userId })
      .populate({
        path: 'userId',
        select: 'name email role employeeId isActive dataScope divisionMapping featureControl',
        populate: [
          { path: 'divisionMapping.division', select: 'name code' },
          { path: 'divisionMapping.departments', select: 'name code' },
        ],
      })
      .populate('performedBy', 'name email role')
      .sort({ timestamp: -1 })
      .limit(limit)
      .lean();

    const normalizedRows = rows.map((r) => {
      const target = r.userId && typeof r.userId === 'object' ? r.userId : null;
      const targetAccessProfile = r.details?.accessSnapshot || (target ? {
        dataScope: target.dataScope || 'all',
        divisionMapping: (target.divisionMapping || []).map(m => ({
          divisionName: m.division?.name || m.division?.code || String(m.division || 'Unknown'),
          departments: (m.departments || []).map(d => d?.name || d?.code || String(d || '')).filter(Boolean)
        })),
        featureControl: target.featureControl || [],
        role: target.role,
        isActive: target.isActive !== false,
      } : null);

      return {
        ...r,
        targetUserName: r.targetUserName || target?.name || '—',
        targetUserEmail: r.targetUserEmail || target?.email || '—',
        targetUserRole: r.targetUserRole || target?.role || '—',
        targetEmployeeId: r.targetEmployeeId || target?.employeeId || '—',
        targetAccessProfile,
      };
    });

    res.status(200).json({ success: true, data: normalizedRows });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error fetching user activity',
      error: error.message,
    });
  }
};

// @desc    Get all user audit / access change history logs
// @route   GET /api/users/audits
// @access  Private (Super Admin only)
exports.getAllUserAudits = async (req, res) => {
  try {
    if (req.user?.role !== 'super_admin') {
      return res.status(403).json({
        success: false,
        message: 'Access denied. User audits are restricted to Super Admin only.',
      });
    }

    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(Math.max(1, parseInt(req.query.limit, 10) || 25), 100);
    const skip = (page - 1) * limit;

    const { search, event, userId, performedBy, startDate, endDate } = req.query;

    const query = {};

    if (userId) {
      query.userId = userId;
    }

    if (performedBy) {
      query.performedBy = performedBy;
    }

    if (event && event !== 'all') {
      if (event === 'access_changes') {
        query.event = { $in: ['access_updated', 'user_promoted', 'user_demoted', 'user_activated', 'user_deactivated'] };
      } else {
        query.event = event;
      }
    }

    if (startDate || endDate) {
      query.timestamp = {};
      if (startDate) query.timestamp.$gte = new Date(startDate);
      if (endDate) {
        const end = new Date(endDate);
        end.setHours(23, 59, 59, 999);
        query.timestamp.$lte = end;
      }
    }

    if (search && search.trim()) {
      const s = search.trim();
      const escaped = s.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, '\\$&');
      const regex = new RegExp(escaped, 'i');
      query.$or = [
        { performedByName: regex },
        { performedByRole: regex },
        { targetUserName: regex },
        { targetUserEmail: regex },
        { targetEmployeeId: regex },
        { comments: regex },
        { event: regex },
      ];
    }

    const [total, rows, totalAccessChanges, totalEventsToday] = await Promise.all([
      UserHistory.countDocuments(query),
      UserHistory.find(query)
        .populate({
          path: 'userId',
          select: 'name email role employeeId isActive dataScope divisionMapping featureControl',
          populate: [
            { path: 'divisionMapping.division', select: 'name code' },
            { path: 'divisionMapping.departments', select: 'name code' },
          ],
        })
        .populate('performedBy', 'name email role')
        .sort({ timestamp: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      UserHistory.countDocuments({
        event: { $in: ['access_updated', 'user_updated', 'user_saved', 'user_activated', 'user_deactivated'] }
      }),
      UserHistory.countDocuments({
        timestamp: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) }
      })
    ]);

    // Normalize rows to provide reliable target user details and active access profile
    const normalizedRows = rows.map((r) => {
      const target = r.userId && typeof r.userId === 'object' ? r.userId : null;
      const targetAccessProfile = r.details?.accessSnapshot || (target ? {
        dataScope: target.dataScope || 'all',
        divisionMapping: (target.divisionMapping || []).map(m => ({
          divisionName: m.division?.name || m.division?.code || String(m.division || 'Unknown'),
          departments: (m.departments || []).map(d => d?.name || d?.code || String(d || '')).filter(Boolean)
        })),
        featureControl: target.featureControl || [],
        role: target.role,
        isActive: target.isActive !== false,
      } : null);

      return {
        ...r,
        targetUserName: r.targetUserName || target?.name || '—',
        targetUserEmail: r.targetUserEmail || target?.email || '—',
        targetUserRole: r.targetUserRole || target?.role || '—',
        targetEmployeeId: r.targetEmployeeId || target?.employeeId || '—',
        targetAccessProfile,
      };
    });

    res.status(200).json({
      success: true,
      data: normalizedRows,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit) || 1,
      },
      stats: {
        totalAudits: total,
        totalAccessChanges,
        eventsToday: totalEventsToday,
      },
    });
  } catch (error) {
    console.error('Error fetching user audits:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching user audit history',
      error: error.message,
    });
  }
};

// Export generateToken for use in authController
exports.generateToken = generateToken;
