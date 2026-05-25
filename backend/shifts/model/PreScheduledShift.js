/**
 * Pre-Scheduled Shift Model
 * Stores pre-assigned shifts for employees (daily or weekly)
 */

const mongoose = require('mongoose');

const preScheduledShiftSchema = new mongoose.Schema(
  {
    employeeNumber: {
      type: String,
      required: [true, 'Employee number is required'],
      trim: true,
      uppercase: true,
      index: true,
    },
    shiftId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Shift',
      required: false, // Optional for week offs
      index: true,
      default: null,
    },
    status: {
      type: String,
      enum: ['WO', 'HOL'], // Full-day WO/HOL (legacy); null when using shift + half flags
      default: null,
      index: true,
    },
    /** Half-day non-working when shiftId is set (shift still planned for the day). */
    firstHalfStatus: {
      type: String,
      enum: ['WO', 'HOL', null],
      default: null,
    },
    secondHalfStatus: {
      type: String,
      enum: ['WO', 'HOL', null],
      default: null,
    },
    date: {
      type: String, // YYYY-MM-DD format
      required: [true, 'Date is required'],
      index: true,
    },
    scheduledBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    notes: {
      type: String,
      trim: true,
      default: null,
    },
    // ACTUAL ATTENDANCE TRACKING (Shift Discipline)
    actualShiftId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Shift',
      default: null,
    },
    isDeviation: {
      type: Boolean,
      default: false,
    },
    attendanceDailyId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'AttendanceDaily',
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

// Unique index: one pre-scheduled shift per employee per date
// Note: This allows one entry per employee per date (either shift or week off)
preScheduledShiftSchema.index({ employeeNumber: 1, date: 1 }, { unique: true });

// Validation: shiftId and/or full-day WO/HOL, or shiftId with half WO/HOL
preScheduledShiftSchema.pre('save', async function () {
  const hasShiftId = this.shiftId != null && this.shiftId.toString().trim() !== '';
  const hasNonWorkingStatus = ['WO', 'HOL'].includes(this.status);
  const hasHalfNonWorking = ['WO', 'HOL'].includes(this.firstHalfStatus)
    || ['WO', 'HOL'].includes(this.secondHalfStatus);

  if (!hasShiftId && !hasNonWorkingStatus) {
    console.error('[Model Validation] Invalid entry:', {
      employeeNumber: this.employeeNumber,
      date: this.date,
      shiftId: this.shiftId,
      status: this.status,
    });
    throw new Error('Either shiftId or status (WO/HOL) must be provided');
  }
  if (hasHalfNonWorking && !hasShiftId && !hasNonWorkingStatus) {
    throw new Error('Half-day WO/HOL requires a planned shift (shiftId)');
  }
  if (hasNonWorkingStatus && hasShiftId) {
    this.shiftId = null;
  }
});

// Index for date range queries
preScheduledShiftSchema.index({ date: 1, employeeNumber: 1 });

module.exports = mongoose.models.PreScheduledShift || mongoose.model('PreScheduledShift', preScheduledShiftSchema);

