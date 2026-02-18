const mongoose = require('mongoose');

const shiftSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Shift name is required'],
      trim: true,
      unique: true,
    },
    startTime: {
      type: String, // Format: "HH:mm" (e.g., "09:00")
      required: [true, 'Shift start time is required'],
      validate: {
        validator: function (v) {
          // Validate time format HH:mm
          return /^([0-1][0-9]|2[0-3]):[0-5][0-9]$/.test(v);
        },
        message: 'Start time must be in HH:mm format (e.g., 09:00)',
      },
    },
    endTime: {
      type: String, // Format: "HH:mm" (e.g., "18:00")
      required: [true, 'Shift end time is required'],
      validate: {
        validator: function (v) {
          // Validate time format HH:mm
          return /^([0-1][0-9]|2[0-3]):[0-5][0-9]$/.test(v);
        },
        message: 'End time must be in HH:mm format (e.g., 18:00)',
      },
    },
    duration: {
      type: Number, // Duration in hours (e.g., 9, 12, 24)
      required: [true, 'Shift duration is required'],
      min: [0, 'Duration must be positive'],
    },
    payableShifts: {
      type: Number, // Number of standard shifts (8 hours) this shift counts as
      default: 1,
      min: [0, 'Payable shifts must be positive'],
    },
    gracePeriod: {
      type: Number, // Grace period in minutes (default 15)
      default: 15,
      min: [0, 'Grace period must be positive'],
    },
    description: {
      type: String,
      trim: true,
      default: null,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    color: {
      type: String,
      default: '#3b82f6', // Default blue-500
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

// Calculate duration from start and end times
shiftSchema.methods.calculateDuration = function () {
  const [startHour, startMin] = this.startTime.split(':').map(Number);
  const [endHour, endMin] = this.endTime.split(':').map(Number);

  let startMinutes = startHour * 60 + startMin;
  let endMinutes = endHour * 60 + endMin;

  // Handle overnight shifts (end time is next day)
  if (endMinutes <= startMinutes) {
    endMinutes += 24 * 60; // Add 24 hours
  }

  const durationMinutes = endMinutes - startMinutes;
  const durationHours = durationMinutes / 60;

  return Math.round(durationHours * 100) / 100; // Round to 2 decimal places
};

// Validate duration against allowed durations before saving
shiftSchema.pre('save', async function () {
  // Calculate duration if not set
  if (!this.duration || this.isModified('startTime') || this.isModified('endTime')) {
    this.duration = this.calculateDuration();
  }

  // Validate against allowed durations from ShiftDuration model
  // Use mongoose.model to avoid circular dependency
  if (mongoose.models.ShiftDuration) {
    const ShiftDuration = mongoose.model('ShiftDuration');
    const allowedDurations = await ShiftDuration.find({ isActive: true }).select('duration');

    if (allowedDurations && allowedDurations.length > 0) {
      const durationValues = allowedDurations.map((d) => d.duration);
      const isAllowed = durationValues.some(
        (allowed) => Math.abs(allowed - this.duration) < 0.01 // Allow small floating point differences
      );

      if (!isAllowed) {
        console.warn(`Saving shift with non-standard duration: ${this.duration} hours`);
      }
    }
  }
  // If ShiftDuration model doesn't exist yet, skip validation (for initial setup)
});

module.exports = mongoose.models.Shift || mongoose.model('Shift', shiftSchema);

