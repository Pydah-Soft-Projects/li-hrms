/**
 * Confused Shift Model
 * Stores attendance records that couldn't be automatically assigned a shift
 * Requires manual review by HOD/HR
 */

const mongoose = require('mongoose');

const confusedShiftSchema = new mongoose.Schema(
  {
    employeeNumber: {
      type: String,
      required: [true, 'Employee number is required'],
      trim: true,
      uppercase: true,
      index: true,
    },
    date: {
      type: String, // YYYY-MM-DD format
      required: [true, 'Date is required'],
      index: true,
    },
    inTime: {
      type: Date,
      required: true,
    },
    outTime: {
      type: Date,
      default: null,
    },
    possibleShifts: [
      {
        shiftId: {
          type: mongoose.Schema.Types.ObjectId,
          ref: 'Shift',
        },
        shiftName: String,
        startTime: String,
        endTime: String,
        matchReason: String, // Why this shift was considered
      },
    ],
    status: {
      type: String,
      enum: ['pending', 'resolved', 'dismissed'],
      default: 'pending',
    },
    assignedShiftId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Shift',
      default: null,
    },
    requiresManualSelection: {
      type: Boolean,
      default: false, // True if HOD must manually select shift
    },
    selectedShiftId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Shift',
      default: null, // Shift selected by HOD when requiresManualSelection is true
    },
    reviewedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    reviewedAt: {
      type: Date,
      default: null,
    },
    reviewComments: {
      type: String,
      trim: true,
      default: null,
    },
    attendanceRecordId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'AttendanceDaily',
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

// Unique index: one confused shift per employee per date
confusedShiftSchema.index({ employeeNumber: 1, date: 1 }, { unique: true });

// Index for status queries
confusedShiftSchema.index({ status: 1, date: -1 });

module.exports = mongoose.models.ConfusedShift || mongoose.model('ConfusedShift', confusedShiftSchema);

