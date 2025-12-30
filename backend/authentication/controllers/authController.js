const User = require('../../users/model/User');
const Employee = require('../../employees/model/Employee');
const { generateToken } = require('../../users/controllers/userController');
const RoleAssignment = require('../../workspaces/model/RoleAssignment');

// @desc    Login user
// @route   POST /api/auth/login
// @access  Public
exports.login = async (req, res) => {
  try {
    const { identifier: bodyIdentifier, email, password } = req.body;
    const identifier = bodyIdentifier || email; // support both identifier and email keys

    console.log(`[AuthLogin] Attempting login for identifier: ${identifier}`);

    // Validate input
    if (!identifier || !password) {
      console.warn(`[AuthLogin] Missing identifier or password`);
      return res.status(400).json({
        success: false,
        message: 'Please provide email/username/emp_no and password',
      });
    }

    let user = null;
    let userType = null;

    // 1. CHECK USER COLLECTION FIRST (Requirement: Hierarchy check validation in users first)
    console.log(`[AuthLogin] Checking User collection for ${identifier}...`);
    // Search by email, name (username), or employeeId (emp_no)
    user = await User.findOne({
      $or: [
        { email: identifier.toLowerCase() },
        { name: identifier },
        { employeeId: identifier.toUpperCase() }
      ],
    }).select('+password');

    if (user) {
      userType = 'user';
      console.log(`[AuthLogin] Found matched record in User collection.`);
    }

    // 2. CHECK EMPLOYEE COLLECTION AS FALLBACK
    if (!user) {
      console.log(`[AuthLogin] Checking Employee collection for ${identifier}...`);
      // Search by emp_no or email
      user = await Employee.findOne({
        $or: [
          { emp_no: identifier.toUpperCase() },
          { email: identifier.toLowerCase() }
        ],
      }).select('+password');

      if (user) {
        userType = 'employee';
        console.log(`[AuthLogin] Found matched record in Employee collection.`);
      }
    }

    if (!user) {
      console.warn(`[AuthLogin] Identifier ${identifier} not found in any collection`);
      return res.status(401).json({
        success: false,
        message: 'Invalid credentials',
      });
    }

    console.log(`[AuthLogin] Found ${userType} for identifier ${identifier}: ID ${user._id}`);

    // Check if user/employee is active
    const isActive = userType === 'user' ? user.isActive : user.is_active;
    if (!isActive) {
      console.warn(`[AuthLogin] Found ${userType} is inactive: ${identifier}`);
      return res.status(401).json({
        success: false,
        message: 'Account is deactivated. Please contact administrator',
      });
    }

    // Check password
    console.log(`[AuthLogin] Verifying password for ${userType} ${identifier}...`);
    const isPasswordValid = await user.comparePassword(password);
    if (!isPasswordValid) {
      console.warn(`[AuthLogin] Password mismatch for ${userType} ${identifier}. Provided length: ${password?.length}, Stored hash present: ${!!user.password}`);
      return res.status(401).json({
        success: false,
        message: 'Invalid credentials',
      });
    }

    console.log(`[AuthLogin] Login successful for ${userType} ${identifier}`);

    // Update last login
    user.lastLogin = new Date();
    await user.save();

    // Generate token
    const token = generateToken(user._id);

    // Get user's workspaces
    let workspaces = [];
    let activeWorkspace = null;

    if (userType === 'user') {
      try {
        const assignments = await RoleAssignment.getUserWorkspaces(user._id);
        workspaces = assignments.map((assignment) => ({
          _id: assignment.workspaceId._id,
          name: assignment.workspaceId.name,
          code: assignment.workspaceId.code,
          type: assignment.workspaceId.type,
          description: assignment.workspaceId.description,
          theme: assignment.workspaceId.theme,
          modules: assignment.workspaceId.modules?.filter((m) => m.isEnabled) || [],
          defaultModuleCode: assignment.workspaceId.defaultModuleCode,
          role: assignment.role,
          isPrimary: assignment.isPrimary,
        }));

        // Determine active workspace
        activeWorkspace = user.activeWorkspaceId
          ? workspaces.find((w) => w._id.toString() === user.activeWorkspaceId.toString())
          : workspaces.find((w) => w.isPrimary) || workspaces[0];
      } catch (wsError) {
        console.log('Workspaces not configured yet:', wsError.message);
      }
    } else {
      // For employees, we can assign a default "Employee Portal" workspace if it exists
      try {
        const Workspace = require('../../workspaces/model/Workspace');
        const empWorkspace = await Workspace.findOne({ code: 'EMP' });
        if (empWorkspace) {
          activeWorkspace = {
            _id: empWorkspace._id,
            name: empWorkspace.name,
            code: empWorkspace.code,
            type: empWorkspace.type,
            role: 'employee',
          };
          workspaces = [activeWorkspace];
        }
      } catch (wsError) {
        console.log('Error fetching employee workspace:', wsError.message);
      }
    }

    res.status(200).json({
      success: true,
      message: 'Login successful',
      data: {
        token,
        user: {
          id: user._id,
          email: user.email,
          name: userType === 'user' ? user.name : user.employee_name,
          role: userType === 'user' ? user.role : 'employee',
          roles: userType === 'user' ? user.roles : ['employee'],
          department: userType === 'user' ? user.department : user.department_id,
          emp_no: userType === 'employee' ? user.emp_no : user.employeeId,
          type: userType,
          featureControl: userType === 'user' ? user.featureControl : undefined,
        },
        workspaces,
        activeWorkspace,
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error during login',
      error: error.message,
    });
  }
};

// @desc    Get current user
// @route   GET /api/auth/me
// @access  Private
exports.getMe = async (req, res) => {
  try {
    let user = await User.findById(req.user.userId)
      .populate('department', 'name')
      .populate('activeWorkspaceId', 'name code type')
      .select('-password');

    let userType = 'user';

    if (!user) {
      user = await Employee.findById(req.user.userId)
        .populate('department_id', 'name code')
        .populate('designation_id', 'name code');
      userType = 'employee';
    }

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'Account not found',
      });
    }

    // Get user's workspaces
    let workspaces = [];
    let activeWorkspace = null;

    if (userType === 'user') {
      try {
        const RoleAssignment = require('../../workspaces/model/RoleAssignment');
        const assignments = await RoleAssignment.getUserWorkspaces(user._id);
        workspaces = assignments.map((assignment) => ({
          _id: assignment.workspaceId._id,
          name: assignment.workspaceId.name,
          code: assignment.workspaceId.code,
          type: assignment.workspaceId.type,
          description: assignment.workspaceId.description,
          theme: assignment.workspaceId.theme,
          modules: assignment.workspaceId.modules?.filter((m) => m.isEnabled) || [],
          defaultModuleCode: assignment.workspaceId.defaultModuleCode,
          role: assignment.role,
          isPrimary: assignment.isPrimary,
        }));

        // Determine active workspace
        activeWorkspace = user.activeWorkspaceId
          ? workspaces.find((w) => w._id.toString() === user.activeWorkspaceId.toString())
          : workspaces.find((w) => w.isPrimary) || workspaces[0];
      } catch (wsError) {
        console.log('Workspaces not configured yet:', wsError.message);
      }
    } else {
      // For employees, assign default "Employee Portal" workspace
      try {
        const Workspace = require('../../workspaces/model/Workspace');
        const empWorkspace = await Workspace.findOne({ code: 'EMP' });
        if (empWorkspace) {
          activeWorkspace = {
            _id: empWorkspace._id,
            name: empWorkspace.name,
            code: empWorkspace.code,
            type: empWorkspace.type,
            role: 'employee',
          };
          workspaces = [activeWorkspace];
        }
      } catch (wsError) {
        console.log('Error fetching employee workspace:', wsError.message);
      }
    }

    res.status(200).json({
      success: true,
      data: {
        user: {
          id: user._id,
          email: user.email,
          name: userType === 'user' ? user.name : user.employee_name,
          role: userType === 'user' ? user.role : 'employee',
          roles: userType === 'user' ? user.roles : ['employee'],
          department: userType === 'user' ? user.department : user.department_id,
          emp_no: userType === 'employee' ? user.emp_no : user.employeeId,
          type: userType,
          featureControl: userType === 'user' ? user.featureControl : undefined,
          isActive: user.isActive
        },
        workspaces,
        activeWorkspace,
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error fetching user data',
      error: error.message,
    });
  }
};

// @desc    Change password
// @route   PUT /api/auth/change-password
// @access  Private
exports.changePassword = async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
      return res.status(400).json({
        success: false,
        message: 'Please provide current and new password',
      });
    }

    let user = await User.findById(req.user.userId).select('+password');
    let userType = 'user';

    if (!user) {
      user = await Employee.findById(req.user.userId).select('+password');
      userType = 'employee';
    }

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'Account not found',
      });
    }

    // Verify current password
    const isPasswordValid = await user.comparePassword(currentPassword);
    if (!isPasswordValid) {
      return res.status(401).json({
        success: false,
        message: 'Current password is incorrect',
      });
    }

    // Update password
    user.password = newPassword;
    await user.save();

    res.status(200).json({
      success: true,
      message: 'Password changed successfully',
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error changing password',
      error: error.message,
    });
  }
};

