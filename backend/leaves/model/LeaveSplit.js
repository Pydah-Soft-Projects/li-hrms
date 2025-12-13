const mongoose = require('mongoose');

/**
 * Leave Split Model
 * Stores individual day/half-day splits when an approver splits a leave application
 * Each split represents one day or half-day with its final approved leave type
 */
const leaveSplitSchema = new mongoose.Schema(
  {
    // Reference to the original leave application
    leaveId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Leave',
      required: [true, 'Leave ID is required'],
      index: true,
    },

    // Employee reference (denormalized for quick queries)
    employeeId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Employee',
      required: [true, 'Employee ID is required'],
      index: true,
    },

    // Employee number (denormalized)
    emp_no: {
      type: String,
      required: [true, 'Employee number is required'],
      index: true,
    },

    // Specific date for this split (YYYY-MM-DD format)
    date: {
      type: Date,
      required: [true, 'Date is required'],
      index: true,
    },

    // Final approved leave type for this day/half-day
    leaveType: {
      type: String,
      required: [true, 'Leave type is required'],
      uppercase: true,
    },

    // Leave nature (paid/lop/without_pay) - derived from leave type settings
    leaveNature: {
      type: String,
      enum: ['paid', 'lop', 'without_pay'],
      required: [true, 'Leave nature is required'],
    },

    // Is this a half-day split?
    isHalfDay: {
      type: Boolean,
      default: false,
    },

    // Half-day type (if isHalfDay is true)
    halfDayType: {
      type: String,
      enum: ['first_half', 'second_half', null],
      default: null,
    },

    // Status of this split
    status: {
      type: String,
      enum: ['approved', 'rejected'],
      required: [true, 'Status is required'],
      default: 'approved',
    },

    // Original leave type that employee applied for (for audit)
    originalLeaveType: {
      type: String,
      required: [true, 'Original leave type is required'],
      uppercase: true,
    },

    // Number of days (0.5 for half-day, 1 for full day)
    numberOfDays: {
      type: Number,
      required: [true, 'Number of days is required'],
      min: 0,
      max: 1,
      default: 1,
    },

    // Who created/approved this split
    splitBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'Split approver is required'],
    },

    splitByName: String,
    splitByRole: String,

    // When split was created
    splitAt: {
      type: Date,
      default: Date.now,
    },

    // Optional notes for this split
    notes: {
      type: String,
      trim: true,
      default: null,
    },

    // Financial year for balance tracking
    financialYear: {
      type: String,
      required: [true, 'Financial year is required'],
      index: true,
    },

    // Month for MonthlyLeaveRecord tracking (YYYY-MM format)
    month: {
      type: String,
      required: [true, 'Month is required'],
      match: [/^\d{4}-\d{2}$/, 'Month must be in YYYY-MM format'],
      index: true,
    },
  },
  {
    timestamps: {
      createdAt: 'created_at',
      updatedAt: 'updated_at',
    },
  }
);

// Compound indexes for efficient queries
leaveSplitSchema.index({ leaveId: 1, date: 1, isHalfDay: 1, halfDayType: 1 }, { unique: true });
leaveSplitSchema.index({ employeeId: 1, date: 1 });
leaveSplitSchema.index({ employeeId: 1, financialYear: 1 });
leaveSplitSchema.index({ employeeId: 1, month: 1 });
leaveSplitSchema.index({ status: 1, date: 1 });

// Virtual to get display text
leaveSplitSchema.virtual('displayText').get(function () {
  const dateStr = this.date.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' });
  if (this.isHalfDay) {
    const half = this.halfDayType === 'first_half' ? 'First Half' : 'Second Half';
    return `${dateStr} - ${half} (${this.leaveType})`;
  }
  return `${dateStr} - ${this.leaveType}`;
});

// Ensure virtuals are included in JSON output
leaveSplitSchema.set('toJSON', { virtuals: true });
leaveSplitSchema.set('toObject', { virtuals: true });

module.exports = mongoose.model('LeaveSplit', leaveSplitSchema);

