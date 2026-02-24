const mongoose = require('mongoose');

/**
 * Permission Deduction Settings Model
 * Configures global permission deduction rules and workflow
 */
const PermissionDeductionSettingsSchema = new mongoose.Schema(
  {
    // Deduction Rules
    deductionRules: {
      // Free allowed permissions per month (first N are not counted for deduction)
      freeAllowedPerMonth: {
        type: Number,
        default: null,
        min: 0,
      },
      // Count threshold (e.g., every 3 permissions above free = 1 unit deduction)
      countThreshold: {
        type: Number,
        default: null,
        min: 1,
      },
      // Deduction type: half_day, full_day, custom_days, custom_amount
      deductionType: {
        type: String,
        enum: ['half_day', 'full_day', 'custom_days', 'custom_amount', null],
        default: null,
      },
      // Custom number of days per unit (only if deductionType is 'custom_days', e.g. 1.5, 2, 3.25)
      deductionDays: {
        type: Number,
        default: null,
        min: 0,
      },
      // Custom deduction amount in ₹ (only if deductionType is 'custom_amount')
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
          enum: ['hod', 'hr', 'manager', 'super_admin', 'reporting_manager', 'admin']
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
          enum: ['hod', 'hr', 'manager', 'super_admin', 'reporting_manager', 'admin']
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
