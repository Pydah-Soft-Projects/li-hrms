const mongoose = require('mongoose');

const timeValidator = {
  validator: function (v) {
    return /^([0-1][0-9]|2[0-3]):[0-5][0-9]$/.test(v);
  },
  message: 'Time must be in HH:mm format (e.g., 09:00)',
};

const shiftHalfSchema = new mongoose.Schema(
  {
    startTime: {
      type: String,
      validate: timeValidator,
    },
    endTime: {
      type: String,
      validate: timeValidator,
    },
    duration: {
      type: Number,
      min: [0, 'Duration must be positive'],
    },
    minDuration: {
      type: Number,
      min: [0, 'Minimum duration must be positive'],
    },
    gracePeriod: {
      type: Number,
      default: 15,
      min: [0, 'Grace period must be positive'],
    },
    payableShifts: {
      type: Number,
      default: 0,
      min: [0, 'Payable shifts must be positive'],
    },
  },
  { _id: false }
);

const shiftBreakSchema = new mongoose.Schema(
  {
    startTime: {
      type: String,
      validate: timeValidator,
    },
    endTime: {
      type: String,
      validate: timeValidator,
    },
  },
  { _id: false }
);

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
      validate: timeValidator,
    },
    endTime: {
      type: String, // Format: "HH:mm" (e.g., "18:00")
      required: [true, 'Shift end time is required'],
      validate: timeValidator,
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
    firstHalf: {
      type: shiftHalfSchema,
      default: null,
    },
    break: {
      type: shiftBreakSchema,
      default: null,
    },
    secondHalf: {
      type: shiftHalfSchema,
      default: null,
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

function calculateDurationFromTimes(startTime, endTime) {
  if (!startTime || !endTime) return null;
  const [startHour, startMin] = startTime.split(':').map(Number);
  const [endHour, endMin] = endTime.split(':').map(Number);
  let startMinutes = startHour * 60 + startMin;
  let endMinutes = endHour * 60 + endMin;
  if (endMinutes <= startMinutes) {
    endMinutes += 24 * 60;
  }
  const durationMinutes = endMinutes - startMinutes;
  return Math.round((durationMinutes / 60) * 100) / 100;
}

shiftSchema.methods.calculateDuration = function () {
  return calculateDurationFromTimes(this.startTime, this.endTime);
};

shiftSchema.pre('save', async function () {
  if (!this.duration || this.isModified('startTime') || this.isModified('endTime')) {
    const calculated = this.calculateDuration();
    if (calculated !== null) {
      this.duration = calculated;
    }
  }

  const normalizeHalf = (half) => {
    if (!half) return null;
    if (half.startTime && half.endTime && !half.duration) {
      half.duration = calculateDurationFromTimes(half.startTime, half.endTime);
    }
    return half;
  };

  this.firstHalf = normalizeHalf(this.firstHalf);
  this.secondHalf = normalizeHalf(this.secondHalf);

  if (mongoose.models.ShiftDuration) {
    const ShiftDuration = mongoose.model('ShiftDuration');
    const allowedDurations = await ShiftDuration.find({ isActive: true }).select('duration');

    if (allowedDurations && allowedDurations.length > 0) {
      const durationValues = allowedDurations.map((d) => d.duration);
      const isAllowed = durationValues.some(
        (allowed) => Math.abs(allowed - this.duration) < 0.01
      );

      if (!isAllowed) {
        console.warn(`Saving shift with non-standard duration: ${this.duration} hours`);
      }
    }
  }
});

module.exports = mongoose.models.Shift || mongoose.model('Shift', shiftSchema);

