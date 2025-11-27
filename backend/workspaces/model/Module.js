const mongoose = require('mongoose');

/**
 * Module Model
 * Master list of all available modules in the system
 * Modules are assigned to workspaces with specific permissions
 */
const ModuleSchema = new mongoose.Schema(
  {
    // Module name (display)
    name: {
      type: String,
      required: [true, 'Module name is required'],
      trim: true,
    },

    // Unique code for the module
    code: {
      type: String,
      required: [true, 'Module code is required'],
      unique: true,
      uppercase: true,
      trim: true,
    },

    // Description
    description: {
      type: String,
      trim: true,
    },

    // Icon name (for frontend)
    icon: {
      type: String,
      default: 'default',
    },

    // Base route path
    route: {
      type: String,
      required: true,
    },

    // All possible permissions for this module
    availablePermissions: [
      {
        key: {
          type: String,
          required: true,
        },
        label: {
          type: String,
          required: true,
        },
        description: String,
      },
    ],

    // All possible data scopes for this module
    availableScopes: [
      {
        key: {
          type: String,
          required: true,
        },
        label: {
          type: String,
          required: true,
        },
        description: String,
      },
    ],

    // Default permissions when adding to a workspace
    defaultPermissions: {
      canView: { type: Boolean, default: true },
      canCreate: { type: Boolean, default: false },
      canEdit: { type: Boolean, default: false },
      canDelete: { type: Boolean, default: false },
      canApprove: { type: Boolean, default: false },
      canForward: { type: Boolean, default: false },
      canExport: { type: Boolean, default: false },
    },

    // Module category for grouping
    category: {
      type: String,
      enum: ['core', 'hr', 'admin', 'reports', 'settings'],
      default: 'core',
    },

    // Sort order for display
    sortOrder: {
      type: Number,
      default: 0,
    },

    // Is this module active
    isActive: {
      type: Boolean,
      default: true,
    },

    // Is this a system module (cannot be deleted)
    isSystem: {
      type: Boolean,
      default: false,
    },
  },
  {
    timestamps: true,
  }
);

// Index for faster lookups
// Note: code already has unique:true which creates an index
ModuleSchema.index({ isActive: 1, sortOrder: 1 });

module.exports = mongoose.model('Module', ModuleSchema);

