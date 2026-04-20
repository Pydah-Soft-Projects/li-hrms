const Role = require('../model/Role');
const User = require('../model/User');

// @desc    Get all dynamic roles
// @route   GET /api/users/roles
// @access  Private (Super Admin, Sub Admin, HR, Manager)
exports.getAllRoles = async (req, res) => {
  try {
    const roles = await Role.find({ isActive: true }).sort({ name: 1 });
    res.status(200).json({
      success: true,
      count: roles.length,
      data: roles,
    });
  } catch (error) {
    console.error('Error fetching roles:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching roles',
      error: error.message,
    });
  }
};

// @desc    Get single role
// @route   GET /api/users/roles/:id
// @access  Private
exports.getRoleById = async (req, res) => {
  try {
    const role = await Role.findById(req.params.id);
    if (!role) {
      return res.status(404).json({
        success: false,
        message: 'Role not found',
      });
    }
    res.status(200).json({
      success: true,
      data: role,
    });
  } catch (error) {
    console.error('Error fetching role:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching role',
      error: error.message,
    });
  }
};

// @desc    Create new dynamic role
// @route   POST /api/users/roles
// @access  Private (Super Admin, Sub Admin)
exports.createRole = async (req, res) => {
  try {
    const { name, description, activeModules } = req.body;

    // Check if role name exists
    const existingRole = await Role.findOne({ name: name.trim() });
    if (existingRole) {
      return res.status(400).json({
        success: false,
        message: `Role with name "${name}" already exists`,
      });
    }

    const role = await Role.create({
      name: name.trim(),
      description,
      activeModules: activeModules || [],
      createdBy: req.user?._id,
    });

    res.status(201).json({
      success: true,
      message: 'Role created successfully',
      data: role,
    });
  } catch (error) {
    console.error('Error creating role:', error);
    res.status(500).json({
      success: false,
      message: 'Error creating role',
      error: error.message,
    });
  }
};

// @desc    Update dynamic role
// @route   PUT /api/users/roles/:id
// @access  Private (Super Admin, Sub Admin)
exports.updateRole = async (req, res) => {
  try {
    const { name, description, activeModules, isActive } = req.body;

    let role = await Role.findById(req.params.id);
    if (!role) {
      return res.status(404).json({
        success: false,
        message: 'Role not found',
      });
    }

    // Role cannot be updated if it is a system role (for future protection)
    if (role.isSystemRole && (name || isActive === false)) {
        return res.status(403).json({
            success: false,
            message: 'System roles cannot be renamed or deactivated'
        });
    }

    const updateData = {};
    if (name !== undefined) updateData.name = name.trim();
    if (description !== undefined) updateData.description = description;
    if (activeModules !== undefined) updateData.activeModules = activeModules;
    if (isActive !== undefined) updateData.isActive = isActive;

    role = await Role.findByIdAndUpdate(req.params.id, updateData, {
      new: true,
      runValidators: true,
    });

    res.status(200).json({
      success: true,
      message: 'Role updated successfully',
      data: role,
    });
  } catch (error) {
    console.error('Error updating role:', error);
    res.status(500).json({
      success: false,
      message: 'Error updating role',
      error: error.message,
    });
  }
};

// @desc    Delete dynamic role
// @route   DELETE /api/users/roles/:id
// @access  Private (Super Admin)
exports.deleteRole = async (req, res) => {
  try {
    const role = await Role.findById(req.params.id);
    if (!role) {
      return res.status(404).json({
        success: false,
        message: 'Role not found',
      });
    }

    if (role.isSystemRole) {
      return res.status(403).json({
        success: false,
        message: 'System roles cannot be deleted',
      });
    }

    // Check if role is assigned to any users
    const usersWithRole = await User.countDocuments({ customRoles: role._id });
    if (usersWithRole > 0) {
        return res.status(400).json({
            success: false,
            message: `Cannot delete role. It is assigned to ${usersWithRole} users.`
        });
    }

    await Role.findByIdAndDelete(req.params.id);

    res.status(200).json({
      success: true,
      message: 'Role deleted successfully',
    });
  } catch (error) {
    console.error('Error deleting role:', error);
  }
};

// @desc    Get users assigned to a dynamic role
// @route   GET /api/users/roles/:id/users
// @access  Private (Super Admin, Sub Admin)
exports.getRoleAssignedUsers = async (req, res) => {
  try {
    const users = await User.find({ customRoles: req.params.id })
      .select('name email employeeId isActive')
      .lean();

    res.status(200).json({
      success: true,
      count: users.length,
      data: users,
    });
  } catch (error) {
    console.error('Error fetching role assigned users:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching assigned users',
      error: error.message,
    });
  }
};
