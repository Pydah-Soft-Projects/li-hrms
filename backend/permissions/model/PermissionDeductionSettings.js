const mongoose = require('mongoose');

/**
 * Permission Deduction Settings Model
 * Configures global permission deduction rules
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
  return this.findOne({ isActive: true });
};

module.exports = mongoose.model('PermissionDeductionSettings', PermissionDeductionSettingsSchema);

