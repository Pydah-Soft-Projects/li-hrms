const Workspace = require('../model/Workspace');
const Module = require('../model/Module');
const RoleAssignment = require('../model/RoleAssignment');
const User = require('../../users/model/User');

/**
 * Workspace Controller
 * Handles workspace CRUD and user assignments
 */

// @desc    Get all workspaces
// @route   GET /api/workspaces
// @access  Private (Super Admin)
exports.getWorkspaces = async (req, res) => {
  try {
    const { isActive, type } = req.query;
    const filter = {};

    if (isActive !== undefined) {
      filter.isActive = isActive === 'true';
    }
    if (type) {
      filter.type = type;
    }

    const workspaces = await Workspace.find(filter)
      .populate('modules.moduleId', 'name code icon route')
      .populate('createdBy', 'email')
      .sort({ type: 1, name: 1 });

    res.status(200).json({
      success: true,
      count: workspaces.length,
      data: workspaces,
    });
  } catch (error) {
    console.error('Error fetching workspaces:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch workspaces',
    });
  }
};

// @desc    Get single workspace
// @route   GET /api/workspaces/:id
// @access  Private
exports.getWorkspace = async (req, res) => {
  try {
    const workspace = await Workspace.findById(req.params.id)
      .populate('modules.moduleId', 'name code icon route category')
      .populate('createdBy', 'email');

    if (!workspace) {
      return res.status(404).json({
        success: false,
        error: 'Workspace not found',
      });
    }

    res.status(200).json({
      success: true,
      data: workspace,
    });
  } catch (error) {
    console.error('Error fetching workspace:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch workspace',
    });
  }
};

// @desc    Create workspace
// @route   POST /api/workspaces
// @access  Private (Super Admin)
exports.createWorkspace = async (req, res) => {
  try {
    const { name, code, type, description, modules, defaultModuleCode, theme, settings } = req.body;

    // Check if workspace with same code exists
    const existingWorkspace = await Workspace.findOne({ code: code.toUpperCase() });
    if (existingWorkspace) {
      return res.status(400).json({
        success: false,
        error: 'Workspace with this code already exists',
      });
    }

    // Validate modules if provided
    if (modules && modules.length > 0) {
      for (const mod of modules) {
        const moduleExists = await Module.findById(mod.moduleId);
        if (!moduleExists) {
          return res.status(400).json({
            success: false,
            error: `Module ${mod.moduleId} not found`,
          });
        }
        // Ensure moduleCode is set
        if (!mod.moduleCode) {
          mod.moduleCode = moduleExists.code;
        }
      }
    }

    const workspace = await Workspace.create({
      name,
      code: code.toUpperCase(),
      type,
      description,
      modules: modules || [],
      defaultModuleCode,
      theme,
      settings,
      createdBy: req.user._id,
    });

    // Populate for response
    await workspace.populate('modules.moduleId', 'name code icon route');

    res.status(201).json({
      success: true,
      data: workspace,
    });
  } catch (error) {
    console.error('Error creating workspace:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to create workspace',
    });
  }
};

// @desc    Update workspace
// @route   PUT /api/workspaces/:id
// @access  Private (Super Admin)
exports.updateWorkspace = async (req, res) => {
  try {
    const { name, description, modules, defaultModuleCode, theme, settings, isActive } = req.body;

    const workspace = await Workspace.findById(req.params.id);

    if (!workspace) {
      return res.status(404).json({
        success: false,
        error: 'Workspace not found',
      });
    }

    // Update fields
    if (name !== undefined) workspace.name = name;
    if (description !== undefined) workspace.description = description;
    if (defaultModuleCode !== undefined) workspace.defaultModuleCode = defaultModuleCode;
    if (theme !== undefined) workspace.theme = { ...workspace.theme, ...theme };
    if (settings !== undefined) workspace.settings = { ...workspace.settings, ...settings };
    if (isActive !== undefined) workspace.isActive = isActive;

    // Update modules if provided
    if (modules !== undefined) {
      // Validate modules
      for (const mod of modules) {
        const moduleExists = await Module.findById(mod.moduleId);
        if (!moduleExists) {
          return res.status(400).json({
            success: false,
            error: `Module ${mod.moduleId} not found`,
          });
        }
        if (!mod.moduleCode) {
          mod.moduleCode = moduleExists.code;
        }
      }
      workspace.modules = modules;
    }

    await workspace.save();

    // Populate for response
    await workspace.populate('modules.moduleId', 'name code icon route');

    res.status(200).json({
      success: true,
      data: workspace,
    });
  } catch (error) {
    console.error('Error updating workspace:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to update workspace',
    });
  }
};

// @desc    Delete workspace
// @route   DELETE /api/workspaces/:id
// @access  Private (Super Admin)
exports.deleteWorkspace = async (req, res) => {
  try {
    const workspace = await Workspace.findById(req.params.id);

    if (!workspace) {
      return res.status(404).json({
        success: false,
        error: 'Workspace not found',
      });
    }

    // Don't allow deleting system workspaces
    if (workspace.isSystem) {
      return res.status(400).json({
        success: false,
        error: 'Cannot delete system workspace',
      });
    }

    // Remove all role assignments for this workspace
    await RoleAssignment.deleteMany({ workspaceId: workspace._id });

    await workspace.deleteOne();

    res.status(200).json({
      success: true,
      message: 'Workspace deleted successfully',
    });
  } catch (error) {
    console.error('Error deleting workspace:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to delete workspace',
    });
  }
};

// @desc    Add module to workspace
// @route   POST /api/workspaces/:id/modules
// @access  Private (Super Admin)
exports.addModuleToWorkspace = async (req, res) => {
  try {
    const { moduleId, permissions, dataScope, settings, sortOrder } = req.body;

    const workspace = await Workspace.findById(req.params.id);
    if (!workspace) {
      return res.status(404).json({
        success: false,
        error: 'Workspace not found',
      });
    }

    const module = await Module.findById(moduleId);
    if (!module) {
      return res.status(404).json({
        success: false,
        error: 'Module not found',
      });
    }

    // Check if module already exists in workspace (case-insensitive comparison)
    const existingModule = workspace.modules.find((m) => m.moduleCode.toUpperCase() === module.code.toUpperCase());
    if (existingModule) {
      return res.status(400).json({
        success: false,
        error: 'Module already exists in this workspace',
      });
    }

    workspace.modules.push({
      moduleId: module._id,
      moduleCode: module.code,
      permissions: permissions || module.defaultPermissions,
      dataScope: dataScope || 'own',
      settings: settings || {},
      sortOrder: sortOrder || workspace.modules.length,
      isEnabled: true,
    });

    await workspace.save();
    await workspace.populate('modules.moduleId', 'name code icon route');

    res.status(200).json({
      success: true,
      data: workspace,
    });
  } catch (error) {
    console.error('Error adding module to workspace:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to add module to workspace',
    });
  }
};

// @desc    Update module in workspace
// @route   PUT /api/workspaces/:id/modules/:moduleCode
// @access  Private (Super Admin)
exports.updateWorkspaceModule = async (req, res) => {
  try {
    const { permissions, dataScope, settings, sortOrder, isEnabled } = req.body;
    const { id, moduleCode } = req.params;

    const workspace = await Workspace.findById(id);
    if (!workspace) {
      return res.status(404).json({
        success: false,
        error: 'Workspace not found',
      });
    }

    const moduleIndex = workspace.modules.findIndex((m) => m.moduleCode === moduleCode.toUpperCase());
    if (moduleIndex === -1) {
      return res.status(404).json({
        success: false,
        error: 'Module not found in this workspace',
      });
    }

    // Update module configuration
    if (permissions !== undefined) workspace.modules[moduleIndex].permissions = permissions;
    if (dataScope !== undefined) workspace.modules[moduleIndex].dataScope = dataScope;
    if (settings !== undefined) workspace.modules[moduleIndex].settings = settings;
    if (sortOrder !== undefined) workspace.modules[moduleIndex].sortOrder = sortOrder;
    if (isEnabled !== undefined) workspace.modules[moduleIndex].isEnabled = isEnabled;

    await workspace.save();
    await workspace.populate('modules.moduleId', 'name code icon route');

    res.status(200).json({
      success: true,
      data: workspace,
    });
  } catch (error) {
    console.error('Error updating workspace module:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to update workspace module',
    });
  }
};

// @desc    Remove module from workspace
// @route   DELETE /api/workspaces/:id/modules/:moduleCode
// @access  Private (Super Admin)
exports.removeModuleFromWorkspace = async (req, res) => {
  try {
    const { id, moduleCode } = req.params;

    const workspace = await Workspace.findById(id);
    if (!workspace) {
      return res.status(404).json({
        success: false,
        error: 'Workspace not found',
      });
    }

    // Case-insensitive comparison
    const normalizedModuleCode = moduleCode.toUpperCase();
    const moduleIndex = workspace.modules.findIndex((m) => m.moduleCode.toUpperCase() === normalizedModuleCode);
    if (moduleIndex === -1) {
      return res.status(404).json({
        success: false,
        error: 'Module not found in this workspace',
      });
    }

    workspace.modules.splice(moduleIndex, 1);
    await workspace.save();

    res.status(200).json({
      success: true,
      message: 'Module removed from workspace',
      data: workspace,
    });
  } catch (error) {
    console.error('Error removing module from workspace:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to remove module from workspace',
    });
  }
};

// @desc    Get users in workspace
// @route   GET /api/workspaces/:id/users
// @access  Private (Super Admin)
exports.getWorkspaceUsers = async (req, res) => {
  try {
    const assignments = await RoleAssignment.find({
      workspaceId: req.params.id,
      isActive: true,
    })
      .populate({
        path: 'userId',
        select: 'email isActive employeeId',
        populate: {
          path: 'employeeId',
          select: 'first_name last_name emp_no department designation',
          populate: [
            { path: 'department', select: 'name' },
            { path: 'designation', select: 'name' },
          ],
        },
      })
      .populate('assignedBy', 'email');

    res.status(200).json({
      success: true,
      count: assignments.length,
      data: assignments,
    });
  } catch (error) {
    console.error('Error fetching workspace users:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch workspace users',
    });
  }
};

// @desc    Assign user to workspace
// @route   POST /api/workspaces/:id/assign
// @access  Private (Super Admin)
exports.assignUserToWorkspace = async (req, res) => {
  try {
    const { userId, role, permissionOverrides, scopeConfig, isPrimary } = req.body;
    const workspaceId = req.params.id;

    // Validate workspace exists
    const workspace = await Workspace.findById(workspaceId);
    if (!workspace) {
      return res.status(404).json({
        success: false,
        error: 'Workspace not found',
      });
    }

    // Validate user exists
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'User not found',
      });
    }

    // Check if assignment already exists
    let assignment = await RoleAssignment.findOne({ userId, workspaceId });

    if (assignment) {
      // Update existing assignment
      assignment.role = role || assignment.role;
      assignment.isActive = true;
      if (permissionOverrides !== undefined) assignment.permissionOverrides = permissionOverrides;
      if (scopeConfig !== undefined) assignment.scopeConfig = scopeConfig;
      if (isPrimary !== undefined) assignment.isPrimary = isPrimary;
      assignment.assignedBy = req.user._id;
      assignment.assignedAt = new Date();
    } else {
      // Create new assignment
      assignment = new RoleAssignment({
        userId,
        workspaceId,
        role: role || 'member',
        permissionOverrides,
        scopeConfig,
        isPrimary: isPrimary || false,
        assignedBy: req.user._id,
      });
    }

    // If this is marked as primary, unset other primaries for this user
    if (isPrimary) {
      await RoleAssignment.updateMany({ userId, _id: { $ne: assignment._id } }, { isPrimary: false });
    }

    await assignment.save();

    // Populate for response
    await assignment.populate([
      {
        path: 'userId',
        select: 'email employeeId',
        populate: { path: 'employeeId', select: 'first_name last_name emp_no' },
      },
      { path: 'workspaceId', select: 'name code type' },
    ]);

    res.status(200).json({
      success: true,
      data: assignment,
    });
  } catch (error) {
    console.error('Error assigning user to workspace:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to assign user to workspace',
    });
  }
};

// @desc    Remove user from workspace
// @route   DELETE /api/workspaces/:id/users/:userId
// @access  Private (Super Admin)
exports.removeUserFromWorkspace = async (req, res) => {
  try {
    const { id: workspaceId, userId } = req.params;

    const assignment = await RoleAssignment.findOne({ userId, workspaceId });

    if (!assignment) {
      return res.status(404).json({
        success: false,
        error: 'User not assigned to this workspace',
      });
    }

    // Soft delete - just mark as inactive
    assignment.isActive = false;
    await assignment.save();

    res.status(200).json({
      success: true,
      message: 'User removed from workspace',
    });
  } catch (error) {
    console.error('Error removing user from workspace:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to remove user from workspace',
    });
  }
};

// ==========================================
// USER-FACING ENDPOINTS
// ==========================================

// @desc    Get current user's workspaces
// @route   GET /api/workspaces/my-workspaces
// @access  Private
exports.getMyWorkspaces = async (req, res) => {
  try {
    const assignments = await RoleAssignment.getUserWorkspaces(req.user._id);

    const workspaces = assignments.map((assignment) => ({
      _id: assignment.workspaceId._id,
      name: assignment.workspaceId.name,
      code: assignment.workspaceId.code,
      type: assignment.workspaceId.type,
      description: assignment.workspaceId.description,
      theme: assignment.workspaceId.theme,
      modules: assignment.workspaceId.modules.filter((m) => m.isEnabled),
      defaultModuleCode: assignment.workspaceId.defaultModuleCode,
      role: assignment.role,
      isPrimary: assignment.isPrimary,
      scopeConfig: assignment.scopeConfig,
    }));

    // Get active workspace
    const activeWorkspace = req.user.activeWorkspaceId
      ? workspaces.find((w) => w._id.toString() === req.user.activeWorkspaceId.toString())
      : workspaces.find((w) => w.isPrimary) || workspaces[0];

    res.status(200).json({
      success: true,
      count: workspaces.length,
      activeWorkspace,
      workspaces,
    });
  } catch (error) {
    console.error('Error fetching user workspaces:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch workspaces',
    });
  }
};

// @desc    Switch active workspace
// @route   POST /api/workspaces/switch
// @access  Private
exports.switchWorkspace = async (req, res) => {
  try {
    const { workspaceId } = req.body;

    // Check if user has access to this workspace
    const hasAccess = await RoleAssignment.hasAccess(req.user._id, workspaceId);
    if (!hasAccess) {
      return res.status(403).json({
        success: false,
        error: 'You do not have access to this workspace',
      });
    }

    // Get workspace with populated modules
    const workspace = await Workspace.findById(workspaceId).populate('modules.moduleId', 'name code icon route');

    if (!workspace || !workspace.isActive) {
      return res.status(404).json({
        success: false,
        error: 'Workspace not found or inactive',
      });
    }

    // Update user's active workspace
    await User.findByIdAndUpdate(req.user._id, { activeWorkspaceId: workspaceId });

    // Get assignment for role info
    const assignment = await RoleAssignment.findOne({
      userId: req.user._id,
      workspaceId,
      isActive: true,
    });

    res.status(200).json({
      success: true,
      message: 'Workspace switched successfully',
      workspace: {
        _id: workspace._id,
        name: workspace.name,
        code: workspace.code,
        type: workspace.type,
        description: workspace.description,
        theme: workspace.theme,
        modules: workspace.modules.filter((m) => m.isEnabled),
        defaultModuleCode: workspace.defaultModuleCode,
        role: assignment?.role,
        scopeConfig: assignment?.scopeConfig,
      },
    });
  } catch (error) {
    console.error('Error switching workspace:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to switch workspace',
    });
  }
};

