const mongoose = require('mongoose');

/**
 * Workspace Model
 * Defines isolated environments with specific modules and permissions
 * Users are assigned to workspaces via RoleAssignment
 */
const WorkspaceSchema = new mongoose.Schema(
  {
    // Workspace display name
    name: {
      type: String,
      required: [true, 'Workspace name is required'],
      trim: true,
    },

    // Unique code for the workspace
    code: {
      type: String,
      required: [true, 'Workspace code is required'],
      unique: true,
      uppercase: true,
      trim: true,
    },

    // Workspace type - determines default behavior
    type: {
      type: String,
      enum: ['employee', 'department', 'hr', 'subadmin', 'superadmin', 'custom'],
      required: true,
    },

    // Description
    description: {
      type: String,
      trim: true,
    },

    // Modules assigned to this workspace with their permissions
    modules: [
      {
        moduleId: {
          type: mongoose.Schema.Types.ObjectId,
          ref: 'Module',
          required: true,
        },
        moduleCode: {
          type: String,
          required: true,
        },

        // Permissions for this module in this workspace
        permissions: {
          canView: { type: Boolean, default: false },
          canCreate: { type: Boolean, default: false },
          canEdit: { type: Boolean, default: false },
          canDelete: { type: Boolean, default: false },
          canApprove: { type: Boolean, default: false },
          canForward: { type: Boolean, default: false },
          canExport: { type: Boolean, default: false },
        },

        // Data scope for this module
        // 'own' - only user's own data
        // 'department' - user's department data
        // 'assigned' - assigned departments (set in RoleAssignment)
        // 'all' - all data
        dataScope: {
          type: String,
          enum: ['own', 'department', 'assigned', 'all'],
          default: 'own',
        },

        // Module-specific settings for this workspace
        settings: {
          // Statuses where editing is allowed
          editableStatuses: [String],
          // Visible columns in list views
          visibleColumns: [String],
          // Allowed actions
          allowedActions: [String],
          // Workflow actions per status (e.g., { pending: ['approve', 'reject'] })
          workflowActions: mongoose.Schema.Types.Mixed,
          // Custom filters
          customFilters: mongoose.Schema.Types.Mixed,
          // Any other module-specific settings
          custom: mongoose.Schema.Types.Mixed,
        },

        // Is this module enabled in this workspace
        isEnabled: {
          type: Boolean,
          default: true,
        },

        // Sort order within workspace
        sortOrder: {
          type: Number,
          default: 0,
        },
      },
    ],

    // Default module to show on workspace load
    defaultModuleCode: {
      type: String,
    },

    // UI customization
    theme: {
      primaryColor: {
        type: String,
        default: '#3b82f6', // blue-500
      },
      icon: {
        type: String,
        default: 'workspace',
      },
      layout: {
        type: String,
        enum: ['default', 'compact', 'wide'],
        default: 'default',
      },
    },

    // Workspace-level settings
    settings: {
      // Allow users to see other users in same workspace
      showTeamMembers: { type: Boolean, default: false },
      // Enable notifications for this workspace
      enableNotifications: { type: Boolean, default: true },
      // Any other workspace settings
      custom: mongoose.Schema.Types.Mixed,
    },

    // Is this workspace active
    isActive: {
      type: Boolean,
      default: true,
    },

    // Is this a system workspace (cannot be deleted)
    isSystem: {
      type: Boolean,
      default: false,
    },

    // Who created this workspace
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
  },
  {
    timestamps: true,
  }
);

// Indexes
// Note: code already has unique:true which creates an index
WorkspaceSchema.index({ type: 1 });
WorkspaceSchema.index({ isActive: 1 });

// Virtual to get active modules only
WorkspaceSchema.virtual('activeModules').get(function () {
  return this.modules.filter((m) => m.isEnabled);
});

// Method to check if workspace has a specific module
WorkspaceSchema.methods.hasModule = function (moduleCode) {
  return this.modules.some((m) => m.moduleCode === moduleCode && m.isEnabled);
};

// Method to get module config
WorkspaceSchema.methods.getModuleConfig = function (moduleCode) {
  return this.modules.find((m) => m.moduleCode === moduleCode && m.isEnabled);
};

// Method to check permission for a module
WorkspaceSchema.methods.hasPermission = function (moduleCode, permission) {
  const moduleConfig = this.getModuleConfig(moduleCode);
  if (!moduleConfig) return false;
  return moduleConfig.permissions[permission] === true;
};

module.exports = mongoose.model('Workspace', WorkspaceSchema);

