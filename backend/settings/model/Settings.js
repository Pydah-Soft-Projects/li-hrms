const mongoose = require('mongoose');

const settingsSchema = new mongoose.Schema(
  {
    key: {
      type: String,
      required: [true, 'Setting key is required'],
      unique: true,
      trim: true,
    },
    value: {
      type: mongoose.Schema.Types.Mixed,
      required: [true, 'Setting value is required'],
    },
    description: {
      type: String,
      trim: true,
    },
    category: {
      type: String,
      enum: ['shift', 'attendance', 'payroll', 'general', 'employee', 'overtime', 'permissions', 'attendance_deductions', 'communications', 'feature_control', 'ot', 'loan', 'permission'],
      default: 'general',
    },
  },
  {
    timestamps: true,
  }
);

// Statics
settingsSchema.statics.getSettingsByCategory = async function (category) {
  const settings = await this.find({ category });
  const config = {};
  settings.forEach((s) => {
    config[s.key] = s.value;
  });
  return config;
};

// Index for faster lookups
// Note: key already has unique:true which creates an index
settingsSchema.index({ category: 1 });

module.exports = mongoose.models.Settings || mongoose.model('Settings', settingsSchema);

