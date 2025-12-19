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
      enum: ['WO'], // 'WO' for Week Off, null is allowed by default
      default: null,
      index: true,
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

// Validation: Either shiftId or status must be present
// Using async pre('save') hook without next callback
preScheduledShiftSchema.pre('save', async function () {
  // Allow if shiftId exists (regular shift) OR status is 'WO' (week off)
  const hasShiftId = this.shiftId != null && this.shiftId.toString().trim() !== '';
  const hasWeekOffStatus = this.status === 'WO';

  if (!hasShiftId && !hasWeekOffStatus) {
    console.error('[Model Validation] Invalid entry:', {
      employeeNumber: this.employeeNumber,
      date: this.date,
      shiftId: this.shiftId,
      status: this.status,
    });
    throw new Error('Either shiftId or status (WO) must be provided');
  }
});

// Index for date range queries
preScheduledShiftSchema.index({ date: 1, employeeNumber: 1 });

module.exports = mongoose.model('PreScheduledShift', preScheduledShiftSchema);

