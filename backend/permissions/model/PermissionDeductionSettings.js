const mongoose = require('mongoose');

/**
 * Permission Deduction Settings Model
 * Configures global permission deduction rules and workflow
 */
const PermissionDeductionSettingsSchema = new mongoose.Schema(
  {
    // Deduction Rules
    deductionRules: {
      // Count threshold (e.g., 4 permissions)
      countThreshold: {
        type: Number,
        default: null,
        min: 1,
      },
      // Deduction type: half_day, full_day, custom_amount
      deductionType: {
        type: String,
        enum: ['half_day', 'full_day', 'custom_amount', null],
        default: null,
      },
      // Custom deduction amount (only if deductionType is 'custom_amount')
      deductionAmount: {
        type: Number,
        default: null,
        min: 0,
      },
      // Minimum duration in minutes (only count permissions >= this duration)
      minimumDuration: {
        type: Number,
        default: null,
        min: 0,
      },
      // Calculation mode: proportional (with partial) or floor (only full multiples)
      calculationMode: {
        type: String,
        enum: ['proportional', 'floor', null],
        default: null,
      },
    },

    // Workflow configuration
    workflow: {
      isEnabled: {
        type: Boolean,
        default: false
      },
      steps: [{
        stepOrder: Number,
        stepName: String,
        approverRole: {
          type: String,
          enum: ['hod', 'hr', 'manager', 'super_admin', 'reporting_manager']
        },
        availableActions: [String],
        approvedStatus: String,
        rejectedStatus: String,
        nextStepOnApprove: mongoose.Schema.Types.Mixed,
        isActive: Boolean
      }],
      finalAuthority: {
        role: {
          type: String,
          enum: ['hod', 'hr', 'manager', 'super_admin', 'reporting_manager']
        },
        anyHRCanApprove: {
          type: Boolean,
          default: false
        }
      }
    },

    // Is this settings configuration active
    isActive: {
      type: Boolean,
      default: true,
    },

    // Created by
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },

    // Last updated by
    updatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
  },
  {
    timestamps: true,
  }
);

// Ensure only one active settings
PermissionDeductionSettingsSchema.index({ isActive: 1 });

// Static method to get active settings
PermissionDeductionSettingsSchema.statics.getActiveSettings = async function () {
  return this.findOne({ isActive: true }).sort({ createdAt: -1 });
};

module.exports = mongoose.models.PermissionDeductionSettings || mongoose.model('PermissionDeductionSettings', PermissionDeductionSettingsSchema);
