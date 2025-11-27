const mongoose = require('mongoose');

const shiftDurationSchema = new mongoose.Schema(
  {
    duration: {
      type: Number, // Duration in hours (e.g., 4, 6, 8, 9, 12, 24)
      required: [true, 'Duration is required'],
      unique: true,
      min: [0.5, 'Duration must be at least 0.5 hours'],
    },
    label: {
      type: String, // Optional label (e.g., "Half Day", "Full Day")
      trim: true,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  {
    timestamps: true,
  }
);

// Index for faster lookups
// Note: duration already has unique:true which creates an index
shiftDurationSchema.index({ isActive: 1 });

module.exports = mongoose.model('ShiftDuration', shiftDurationSchema);

