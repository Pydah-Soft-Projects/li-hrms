const mongoose = require('mongoose');

/**
 * RoleAssignment Model
 * Maps users to workspaces with specific roles and scope configurations
 * This is the core of the multi-workspace system
 */
const RoleAssignmentSchema = new mongoose.Schema(
  {
    // The user being assigned
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'User ID is required'],
    },

    // The workspace being assigned to
    workspaceId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Workspace',
      required: [true, 'Workspace ID is required'],
    },

    // Role within this workspace
    // 'member' - standard user with workspace permissions
    // 'manager' - can manage other members (future use)
    // 'admin' - full control within workspace
    role: {
      type: String,
      enum: ['member', 'manager', 'admin'],
      default: 'member',
    },

    // Permission overrides for specific modules
    // Allows per-user customization beyond workspace defaults
    permissionOverrides: [
      {
        moduleCode: {
          type: String,
          required: true,
        },
        permissions: {
          canView: Boolean,
          canCreate: Boolean,
          canEdit: Boolean,
          canDelete: Boolean,
          canApprove: Boolean,
          canForward: Boolean,
          canExport: Boolean,
        },
      },
    ],

    // Scope configuration for this user in this workspace
    // Used to restrict data access beyond workspace defaults
    scopeConfig: {
      // Departments this user can access (for HR/manager roles)
      departments: [
        {
          type: mongoose.Schema.Types.ObjectId,
          ref: 'Department',
        },
      ],

      // If true, can access all departments (ignores departments array)
      allDepartments: {
        type: Boolean,
        default: false,
      },

      // Designations this user can manage (future use)
      designations: [
        {
          type: mongoose.Schema.Types.ObjectId,
          ref: 'Designation',
        },
      ],

      // Custom scope filters (module-specific)
      customFilters: mongoose.Schema.Types.Mixed,
    },

    // Is this assignment active
    isActive: {
      type: Boolean,
      default: true,
    },

    // Is this the user's primary/default workspace
    isPrimary: {
      type: Boolean,
      default: false,
    },

    // Who assigned this role
    assignedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },

    // When was this assigned
    assignedAt: {
      type: Date,
      default: Date.now,
    },

    // Optional expiry for temporary assignments
    expiresAt: {
      type: Date,
    },

    // Notes about this assignment
    notes: {
      type: String,
      trim: true,
    },
  },
  {
    timestamps: true,
  }
);

// Compound index to ensure unique user-workspace pairs
RoleAssignmentSchema.index({ userId: 1, workspaceId: 1 }, { unique: true });

// Index for finding all assignments for a user
RoleAssignmentSchema.index({ userId: 1, isActive: 1 });

// Index for finding all users in a workspace
RoleAssignmentSchema.index({ workspaceId: 1, isActive: 1 });

// Index for checking expiry
RoleAssignmentSchema.index({ expiresAt: 1 }, { sparse: true });

// Virtual to check if assignment is expired
RoleAssignmentSchema.virtual('isExpired').get(function () {
  if (!this.expiresAt) return false;
  return new Date() > this.expiresAt;
});

// Method to get effective permissions for a module
// Combines workspace permissions with user overrides
RoleAssignmentSchema.methods.getEffectivePermissions = async function (moduleCode) {
  const workspace = await mongoose.model('Workspace').findById(this.workspaceId);
  if (!workspace) return null;

  const moduleConfig = workspace.getModuleConfig(moduleCode);
  if (!moduleConfig) return null;

  // Start with workspace permissions
  const permissions = { ...moduleConfig.permissions.toObject() };

  // Apply user overrides
  const override = this.permissionOverrides.find((o) => o.moduleCode === moduleCode);
  if (override) {
    Object.keys(override.permissions).forEach((key) => {
      if (override.permissions[key] !== undefined) {
        permissions[key] = override.permissions[key];
      }
    });
  }

  return permissions;
};

// Static method to get all active workspaces for a user
RoleAssignmentSchema.statics.getUserWorkspaces = async function (userId) {
  const assignments = await this.find({
    userId,
    isActive: true,
    $or: [{ expiresAt: null }, { expiresAt: { $gt: new Date() } }],
  })
    .populate({
      path: 'workspaceId',
      match: { isActive: true },
      populate: {
        path: 'modules.moduleId',
        select: 'name code icon route',
      },
    })
    .sort({ isPrimary: -1, createdAt: 1 });

  // Filter out null workspaces (inactive)
  return assignments.filter((a) => a.workspaceId !== null);
};

// Static method to check if user has access to a workspace
RoleAssignmentSchema.statics.hasAccess = async function (userId, workspaceId) {
  const assignment = await this.findOne({
    userId,
    workspaceId,
    isActive: true,
    $or: [{ expiresAt: null }, { expiresAt: { $gt: new Date() } }],
  });
  return !!assignment;
};

module.exports = mongoose.models.RoleAssignment || mongoose.model('RoleAssignment', RoleAssignmentSchema);

