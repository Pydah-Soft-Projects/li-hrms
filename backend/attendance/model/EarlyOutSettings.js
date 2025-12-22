const mongoose = require('mongoose');

/**
 * Early-Out Settings Model
 * Configures independent early-out deduction rules (separate from combined late-in + early-out)
 */
const EarlyOutSettingsSchema = new mongoose.Schema(
  {
    // Enable/Disable Early-Out Rules
    isEnabled: {
      type: Boolean,
      default: false,
      required: true,
    },

    // Allowed Early-Out Duration (per day in minutes)
    // Early-outs within this duration won't incur any deduction
    allowedDurationMinutes: {
      type: Number,
      default: 0,
      min: 0,
      required: true,
    },

    // Minimum duration in minutes to be considered for deduction
    // Only early-outs >= this duration will be considered
    minimumDuration: {
      type: Number,
      default: 0,
      min: 0,
      required: true,
    },

    // Deduction Ranges
    // Array of ranges with deduction types
    deductionRanges: [
      {
        minMinutes: {
          type: Number,
          required: true,
          min: 0,
        },
        maxMinutes: {
          type: Number,
          required: true,
          min: 0,
        },
        deductionType: {
          type: String,
          enum: ['quarter_day', 'half_day', 'full_day', 'custom_amount'],
          required: true,
        },
        // Custom deduction amount (only if deductionType is 'custom_amount')
        deductionAmount: {
          type: Number,
          default: null,
          min: 0,
        },
        // Description for this range
        description: {
          type: String,
          trim: true,
          default: '',
        },
      },
    ],

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
EarlyOutSettingsSchema.index({ isActive: 1 });

// Static method to get active settings
EarlyOutSettingsSchema.statics.getActiveSettings = async function () {
  return this.findOne({ isActive: true });
};

// Method to validate deduction ranges
EarlyOutSettingsSchema.methods.validateRanges = function () {
  if (!this.deductionRanges || this.deductionRanges.length === 0) {
    return { valid: true };
  }

  // Sort ranges by minMinutes
  const sortedRanges = [...this.deductionRanges].sort((a, b) => a.minMinutes - b.minMinutes);

  // Check for overlaps
  for (let i = 0; i < sortedRanges.length - 1; i++) {
    if (sortedRanges[i].maxMinutes >= sortedRanges[i + 1].minMinutes) {
      return {
        valid: false,
        error: `Range overlap detected: ${sortedRanges[i].minMinutes}-${sortedRanges[i].maxMinutes} overlaps with ${sortedRanges[i + 1].minMinutes}-${sortedRanges[i + 1].maxMinutes}`,
      };
    }
  }

  // Check that custom_amount ranges have deductionAmount
  for (const range of sortedRanges) {
    if (range.deductionType === 'custom_amount' && (!range.deductionAmount || range.deductionAmount <= 0)) {
      return {
        valid: false,
        error: `Range ${range.minMinutes}-${range.maxMinutes} has deductionType 'custom_amount' but no deductionAmount specified`,
      };
    }
  }

  return { valid: true };
};

module.exports = mongoose.models.EarlyOutSettings || mongoose.model('EarlyOutSettings', EarlyOutSettingsSchema);

