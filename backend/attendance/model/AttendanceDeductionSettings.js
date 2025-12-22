const mongoose = require('mongoose');

/**
 * Attendance Deduction Settings Model
 * Configures global attendance deduction rules (combined late-in + early-out)
 */
const AttendanceDeductionSettingsSchema = new mongoose.Schema(
  {
    // Deduction Rules
    deductionRules: {
      // Combined count threshold (late-ins + early-outs)
      combinedCountThreshold: {
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
      // Minimum duration in minutes (only count late-ins/early-outs >= this duration)
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
AttendanceDeductionSettingsSchema.index({ isActive: 1 });

// Static method to get active settings
AttendanceDeductionSettingsSchema.statics.getActiveSettings = async function () {
  return this.findOne({ isActive: true });
};

module.exports = mongoose.models.AttendanceDeductionSettings || mongoose.model('AttendanceDeductionSettings', AttendanceDeductionSettingsSchema);

