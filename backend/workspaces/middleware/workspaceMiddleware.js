const mongoose = require('mongoose');
const Workspace = require('../model/Workspace');
const RoleAssignment = require('../model/RoleAssignment');
const Department = require('../../departments/model/Department');

function divisionIdFromMappingEntry(mapping) {
  if (!mapping || mapping.division == null) return null;
  const d = mapping.division;
  if (typeof d === 'string' || d instanceof mongoose.Types.ObjectId) return String(d);
  if (d._id) return String(d._id);
  return null;
}

/**
 * Resolve all department ObjectIds a user may access via divisionMapping.
 * - Explicit mapping.departments → those departments only
 * - Empty / missing departments for a division → all departments linked to that division (divisions array on Department)
 */
async function departmentIdsFromDivisionMapping(divisionMapping) {
  if (!Array.isArray(divisionMapping) || divisionMapping.length === 0) return [];

  const explicitIds = new Set();
  const divisionWideMongoIds = [];

  for (const m of divisionMapping) {
    const divId = divisionIdFromMappingEntry(m);
    if (!divId || !mongoose.Types.ObjectId.isValid(divId)) continue;

    const rawDepts = m.departments;
    if (Array.isArray(rawDepts) && rawDepts.length > 0) {
      for (const d of rawDepts) {
        const id = d && typeof d === 'object' && d._id != null ? String(d._id) : String(d);
        if (id && id !== 'undefined' && mongoose.Types.ObjectId.isValid(id)) explicitIds.add(id);
      }
    } else {
      divisionWideMongoIds.push(new mongoose.Types.ObjectId(divId));
    }
  }

  if (divisionWideMongoIds.length > 0) {
    const rows = await Department.find({ divisions: { $in: divisionWideMongoIds } })
      .select('_id')
      .lean();
    for (const r of rows) {
      if (r._id) explicitIds.add(String(r._id));
    }
  }

  return [...explicitIds];
}

/**
 * Middleware to load and validate workspace context
 * Attaches workspace and permissions to req object
 */
exports.loadWorkspace = async (req, res, next) => {
  try {
    // Get workspace ID from header, query, or user's active workspace
    const workspaceId = req.headers['x-workspace-id'] || req.query.workspaceId || req.user?.activeWorkspaceId;

    if (!workspaceId) {
      // No workspace context - allow for user-level endpoints
      req.workspace = null;
      req.roleAssignment = null;
      return next();
    }

    // Check if user has access to this workspace
    const assignment = await RoleAssignment.findOne({
      userId: req.user._id,
      workspaceId,
      isActive: true,
      $or: [{ expiresAt: null }, { expiresAt: { $gt: new Date() } }],
    });

    if (!assignment) {
      return res.status(403).json({
        success: false,
        error: 'You do not have access to this workspace',
      });
    }

    // Load workspace
    const workspace = await Workspace.findById(workspaceId).populate('modules.moduleId', 'name code icon route');

    if (!workspace || !workspace.isActive) {
      return res.status(404).json({
        success: false,
        error: 'Workspace not found or inactive',
      });
    }

    // Attach to request
    req.workspace = workspace;
    req.roleAssignment = assignment;

    next();
  } catch (error) {
    console.error('Error loading workspace:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to load workspace context',
    });
  }
};

/**
 * Middleware to require a workspace context
 */
exports.requireWorkspace = (req, res, next) => {
  if (!req.workspace) {
    return res.status(400).json({
      success: false,
      error: 'Workspace context is required. Please provide X-Workspace-ID header or switch to a workspace.',
    });
  }
  next();
};

/**
 * Middleware factory to check module permission
 * Usage: checkModulePermission('LEAVE', 'canView')
 */
exports.checkModulePermission = (moduleCode, permission) => {
  return async (req, res, next) => {
    try {
      if (!req.workspace) {
        return res.status(400).json({
          success: false,
          error: 'Workspace context is required',
        });
      }

      // Get module config from workspace
      const moduleConfig = req.workspace.modules.find((m) => m.moduleCode === moduleCode && m.isEnabled);

      if (!moduleConfig) {
        return res.status(403).json({
          success: false,
          error: `Module ${moduleCode} is not available in this workspace`,
        });
      }

      // Check base permission from workspace
      let hasPermission = moduleConfig.permissions[permission] === true;

      // Check for user-level overrides
      if (req.roleAssignment?.permissionOverrides?.length > 0) {
        const override = req.roleAssignment.permissionOverrides.find((o) => o.moduleCode === moduleCode);
        if (override && override.permissions[permission] !== undefined) {
          hasPermission = override.permissions[permission];
        }
      }

      if (!hasPermission) {
        return res.status(403).json({
          success: false,
          error: `You do not have ${permission} permission for ${moduleCode} module`,
        });
      }

      // Attach module config to request for use in controllers
      req.moduleConfig = moduleConfig;
      req.moduleCode = moduleCode;

      next();
    } catch (error) {
      console.error('Error checking module permission:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to check permissions',
      });
    }
  };
};

/**
 * Middleware to apply data scope filter
 * Must be called after loadWorkspace and checkModulePermission
 */
exports.applyDataScope = async (req, res, next) => {
  try {
    if (!req.moduleConfig) {
      // No module context - skip scope filtering
      req.scopeFilter = {};
      return next();
    }

    const dataScope = req.moduleConfig.dataScope;
    const Employee = require('../../employees/model/Employee');

    switch (dataScope) {
      case 'own':
        // Only user's own data
        if (req.user.employeeRef) {
          req.scopeFilter = { employeeId: req.user.employeeRef };
        } else if (req.user.employeeId) {
          req.scopeFilter = { emp_no: req.user.employeeId };
        } else {
          req.scopeFilter = { _id: null }; // No employee linked - return nothing
        }
        break;

      case 'department': {
        let deptIds = await departmentIdsFromDivisionMapping(req.user.divisionMapping);
        deptIds = [...new Set(deptIds)];
        if (deptIds.length > 0) {
          req.scopeFilter = { $or: [{ department: { $in: deptIds } }, { department_id: { $in: deptIds } }] };
        } else if (req.user.employeeRef) {
          const employee = await Employee.findById(req.user.employeeRef).select('department_id department');
          const empDept = employee?.department_id || employee?.department;
          req.scopeFilter = empDept ? { $or: [{ department: empDept }, { department_id: empDept }] } : { _id: null };
        } else {
          req.scopeFilter = { _id: null };
        }
        break;
      }

      case 'assigned': {
        const scopeConfig = req.roleAssignment?.scopeConfig;
        if (scopeConfig?.allDepartments) {
          req.scopeFilter = {};
        } else if (scopeConfig?.departments?.length > 0) {
          req.scopeFilter = { $or: [{ department: { $in: scopeConfig.departments } }, { department_id: { $in: scopeConfig.departments } }] };
        } else {
          let deptIds = await departmentIdsFromDivisionMapping(req.user.divisionMapping);
          deptIds = [...new Set(deptIds)];
          req.scopeFilter =
            deptIds.length > 0
              ? { $or: [{ department: { $in: deptIds } }, { department_id: { $in: deptIds } }] }
              : { _id: null };
        }
        break;
      }

      case 'all':
        // No restriction
        req.scopeFilter = {};
        break;

      default:
        req.scopeFilter = {};
    }

    next();
  } catch (error) {
    console.error('Error applying data scope:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to apply data scope',
    });
  }
};

/**
 * Helper function to get effective permissions for a user in a workspace
 */
exports.getEffectivePermissions = async (userId, workspaceId, moduleCode) => {
  const assignment = await RoleAssignment.findOne({
    userId,
    workspaceId,
    isActive: true,
  });

  if (!assignment) return null;

  const workspace = await Workspace.findById(workspaceId);
  if (!workspace) return null;

  const moduleConfig = workspace.modules.find((m) => m.moduleCode === moduleCode && m.isEnabled);
  if (!moduleConfig) return null;

  // Start with workspace permissions
  const permissions = { ...moduleConfig.permissions.toObject() };

  // Apply user overrides
  const override = assignment.permissionOverrides?.find((o) => o.moduleCode === moduleCode);
  if (override) {
    Object.keys(override.permissions).forEach((key) => {
      if (override.permissions[key] !== undefined) {
        permissions[key] = override.permissions[key];
      }
    });
  }

  return {
    permissions,
    dataScope: moduleConfig.dataScope,
    settings: moduleConfig.settings,
    role: assignment.role,
    scopeConfig: assignment.scopeConfig,
  };
};

