const mongoose = require('mongoose');

const roleSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Role name is required'],
      unique: true,
      trim: true,
    },
    description: {
      type: String,
      trim: true,
    },
    activeModules: {
      type: [String],
      default: [],
      description: 'List of feature codes with access level, e.g., ["DASHBOARD:read", "ATTENDANCE:write"]',
    },
    isSystemRole: {
      type: Boolean,
      default: false,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

// Method to check if role has access to a specific module code
roleSchema.methods.hasModuleAccess = function (moduleCode, accessType = 'read') {
  if (!this.isActive) return false;
  
  const fullAccess = this.activeModules.includes(moduleCode);
  const specificAccess = this.activeModules.includes(`${moduleCode}:${accessType}`);
  const writeAccess = accessType === 'read' && this.activeModules.includes(`${moduleCode}:write`);

  return fullAccess || specificAccess || writeAccess;
};

module.exports = mongoose.models.Role || mongoose.model('Role', roleSchema);
