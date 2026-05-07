const mongoose = require('mongoose');

const shiftDurationRangeSchema = new mongoose.Schema(
  {
    minShiftHours: {
      type: Number,
      required: true,
      min: 0,
    },
    maxShiftHours: {
      type: Number,
      required: true,
      min: 0,
    },
    allowedMinutes: {
      type: Number,
      required: true,
      min: 0,
    },
    minimumMinutes: {
      type: Number,
      default: 1,
      min: 0,
    },
    description: {
      type: String,
      trim: true,
      default: '',
    },
  },
  { _id: true }
);

const ruleSetSchema = new mongoose.Schema(
  {
    shiftDurationRanges: {
      type: [shiftDurationRangeSchema],
      default: [],
    },
  },
  { _id: false }
);

const autoEdgePermissionSettingsSchema = new mongoose.Schema(
  {
    isEnabled: {
      type: Boolean,
      default: false,
      required: true,
    },
    applyFor: {
      type: String,
      enum: ['late_in', 'early_out', 'both'],
      default: 'both',
      required: true,
    },
    useSameRulesForBoth: {
      type: Boolean,
      default: true,
      required: true,
    },
    lateInRules: {
      type: ruleSetSchema,
      default: () => ({ shiftDurationRanges: [] }),
    },
    earlyOutRules: {
      type: ruleSetSchema,
      default: () => ({ shiftDurationRanges: [] }),
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
    updatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
  },
  {
    timestamps: true,
  }
);

autoEdgePermissionSettingsSchema.index({ isActive: 1 });

function validateRangeSet(ranges, label) {
  const safeRanges = Array.isArray(ranges) ? ranges : [];
  const sorted = [...safeRanges].sort(
    (a, b) => Number(a.minShiftHours) - Number(b.minShiftHours)
  );

  for (const range of sorted) {
    const min = Number(range.minShiftHours);
    const max = Number(range.maxShiftHours);
    const minutes = Number(range.allowedMinutes);
    const minimumMinutes = range.minimumMinutes == null ? 1 : Number(range.minimumMinutes);

    if (!Number.isFinite(min) || !Number.isFinite(max) || !Number.isFinite(minutes) || !Number.isFinite(minimumMinutes)) {
      return { valid: false, error: `${label}: range values must be valid numbers` };
    }
    if (min < 0 || max < 0 || minutes < 0 || minimumMinutes < 0) {
      return { valid: false, error: `${label}: range values cannot be negative` };
    }
    if (minimumMinutes > minutes) {
      return { valid: false, error: `${label}: minimum minutes cannot be greater than allowed minutes` };
    }
    if (max <= min) {
      return { valid: false, error: `${label}: max shift hours must be greater than min shift hours` };
    }
  }

  for (let i = 0; i < sorted.length - 1; i += 1) {
    const currentMax = Number(sorted[i].maxShiftHours);
    const nextMin = Number(sorted[i + 1].minShiftHours);
    if (currentMax > nextMin) {
      return {
        valid: false,
        error: `${label}: shift duration ranges cannot overlap`,
      };
    }
  }

  return { valid: true };
}

autoEdgePermissionSettingsSchema.methods.validateRuleRanges = function () {
  const lateValidation = validateRangeSet(
    this.lateInRules?.shiftDurationRanges,
    'Late-in rules'
  );
  if (!lateValidation.valid) return lateValidation;

  const earlyValidation = validateRangeSet(
    this.earlyOutRules?.shiftDurationRanges,
    'Early-out rules'
  );
  if (!earlyValidation.valid) return earlyValidation;

  return { valid: true };
};

autoEdgePermissionSettingsSchema.statics.getActiveSettings = async function () {
  return this.findOne({ isActive: true }).sort({ createdAt: -1 });
};

module.exports =
  mongoose.models.AutoEdgePermissionSettings ||
  mongoose.model('AutoEdgePermissionSettings', autoEdgePermissionSettingsSchema);
