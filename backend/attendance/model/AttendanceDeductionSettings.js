const mongoose = require('mongoose');

/**
 * Attendance Deduction Settings Model
 * Configures global attendance deduction rules (combined late-in + early-out)
 */
const AttendanceDeductionSettingsSchema = new mongoose.Schema(
  {
    // Deduction Rules
    deductionRules: {
      // Evaluation mode: 'combined' (aggregate late+early) or 'separate' (independent late and early rules)
      evaluationMode: {
        type: String,
        enum: ['combined', 'separate', null],
        default: 'combined',
      },
      // Free allowed late-ins + early-outs per month (combined mode)
      freeAllowedPerMonth: {
        type: Number,
        default: null,
        min: 0,
      },
      // Combined count threshold (combined mode)
      combinedCountThreshold: {
        type: Number,
        default: null,
        min: 1,
      },
      // Free allowed late-ins per month (separate mode)
      freeLateInsPerMonth: {
        type: Number,
        default: null,
        min: 0,
      },
      // Late count threshold (separate mode, every N late-ins above free = 1 unit)
      lateCountThreshold: {
        type: Number,
        default: null,
        min: 1,
      },
      // Free allowed early-outs per month (separate mode)
      freeEarlyOutsPerMonth: {
        type: Number,
        default: null,
        min: 0,
      },
      // Early count threshold (separate mode, every N early-outs above free = 1 unit)
      earlyCountThreshold: {
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

