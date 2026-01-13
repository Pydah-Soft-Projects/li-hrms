/**
 * Attendance Daily Model
 * Aggregated daily view - one document per employee per date
 */

const mongoose = require('mongoose');

const attendanceDailySchema = new mongoose.Schema(
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
      default: null,
    },
    outTime: {
      type: Date,
      default: null,
    },
    totalHours: {
      type: Number,
      default: null, // Calculated: (outTime - inTime) / (1000 * 60 * 60)
    },
    status: {
      type: String,
      enum: ['PRESENT', 'ABSENT', 'PARTIAL', 'HALF_DAY'],
      default: 'ABSENT',
    },
    source: {
      type: [String],
      enum: ['mssql', 'excel', 'manual'],
      default: [],
    },
    lastSyncedAt: {
      type: Date,
      default: null,
    },
    locked: {
      type: Boolean,
      default: false, // For manual overrides
    },
    notes: {
      type: String,
      trim: true,
      default: null,
    },
    // Shift-related fields
    shiftId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Shift',
      default: null,
      index: true,
    },
    lateInMinutes: {
      type: Number,
      default: null, // Minutes late if in-time > shift start + grace period
    },
    earlyOutMinutes: {
      type: Number,
      default: null, // Minutes early if out-time < shift end
    },
    isLateIn: {
      type: Boolean,
      default: false,
    },
    isEarlyOut: {
      type: Boolean,
      default: false,
    },
    expectedHours: {
      type: Number,
      default: null, // Expected hours based on shift duration
    },
    // Overtime and extra hours
    otHours: {
      type: Number,
      default: 0, // Overtime hours (from approved OT request)
    },
    extraHours: {
      type: Number,
      default: 0, // Extra hours worked without OT request (auto-detected)
    },
    // Permission fields
    permissionHours: {
      type: Number,
      default: 0, // Total permission hours for the day
    },
    permissionCount: {
      type: Number,
      default: 0, // Number of permissions taken on this day
    },
    permissionDeduction: {
      type: Number,
      default: 0, // Total deduction amount for permissions (if deduction is enabled)
    },
    // NEW: OD (On-Duty) hours field
    odHours: {
      type: Number,
      default: 0, // Hours spent on OD (from approved hour-based OD)
    },
    // Store full OD details for display
    odDetails: {
      odStartTime: String, // HH:MM format (e.g., "10:00")
      odEndTime: String,   // HH:MM format (e.g., "14:30")
      durationHours: Number, // Duration in hours
      odType: {
        type: String,
        enum: ['full_day', 'half_day', 'hours', null],
        default: null,
      },
      odId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'OD',
        default: null,
      },
      approvedAt: Date,
      approvedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        default: null,
      },
    },
    // NEW: Early-Out Deduction Fields
    earlyOutDeduction: {
      deductionApplied: {
        type: Boolean,
        default: false,
      },
      deductionType: {
        type: String,
        enum: ['quarter_day', 'half_day', 'full_day', 'custom_amount', null],
        default: null,
      },
      deductionDays: {
        type: Number,
        default: null,
      },
      deductionAmount: {
        type: Number,
        default: null,
      },
      reason: {
        type: String,
        default: null,
      },
      rangeDescription: {
        type: String,
        default: null,
      },
    },
  },
  {
    timestamps: true,
  }
);

// Unique index: one record per employee per date
attendanceDailySchema.index({ employeeNumber: 1, date: 1 }, { unique: true });

// Index for calendar queries
attendanceDailySchema.index({ date: 1 });

// Index for employee queries
attendanceDailySchema.index({ employeeNumber: 1, date: -1 });

// Method to calculate total hours
// Handles overnight shifts where out-time is before in-time (next day scenario)
attendanceDailySchema.methods.calculateTotalHours = function () {
  if (this.inTime && this.outTime) {
    let outTimeToUse = new Date(this.outTime);
    let inTimeToUse = new Date(this.inTime);

    // If out-time is before in-time on the same date, it's likely next day (overnight shift)
    // Compare only the time portion, not the full date
    const outTimeOnly = outTimeToUse.getHours() * 60 + outTimeToUse.getMinutes();
    const inTimeOnly = inTimeToUse.getHours() * 60 + inTimeToUse.getMinutes();

    // If out-time (time only) is less than in-time (time only), assume out-time is next day
    // This handles cases like: in at 20:00, out at 04:00 (next day)
    // But also handles: in at 08:02, out at 04:57 (next day)
    if (outTimeOnly < inTimeOnly) {
      // Check if the actual dates are different
      // If same date but out-time is earlier, it's next day
      if (outTimeToUse.toDateString() === inTimeToUse.toDateString()) {
        outTimeToUse.setDate(outTimeToUse.getDate() + 1);
      }
    }

    const diffMs = outTimeToUse.getTime() - inTimeToUse.getTime();
    const diffHours = diffMs / (1000 * 60 * 60);
    this.totalHours = Math.round(diffHours * 100) / 100; // Round to 2 decimal places
    return this.totalHours;
  }
  return null;
};

// Pre-save hook to calculate total hours, status, and early-out deduction
attendanceDailySchema.pre('save', async function () {
  if (this.inTime && this.outTime) {
    this.calculateTotalHours();

    // Determine status based on total hours + OD hours vs shift duration
    // Threshold: 70% of expected hours (Working + OD)
    if (this.expectedHours) {
      const effectiveHours = (this.totalHours || 0) + (this.odHours || 0);
      const threshold = this.expectedHours * 0.7;

      if (effectiveHours < threshold) {
        this.status = 'HALF_DAY';
      } else {
        this.status = 'PRESENT';
      }
    } else {
      // Default to PRESENT if we have both punches but no expectedHours
      if (this.status !== 'HALF_DAY') {
        this.status = 'PRESENT';
      }
    }
  } else if (this.inTime || this.outTime) {
    this.status = 'PARTIAL';
  } else {
    this.status = 'ABSENT';
  }

  // Calculate early-out deduction if earlyOutMinutes exists
  if (this.earlyOutMinutes && this.earlyOutMinutes > 0) {
    try {
      const { calculateEarlyOutDeduction } = require('../services/earlyOutDeductionService');
      const deduction = await calculateEarlyOutDeduction(this.earlyOutMinutes);

      // Update early-out deduction fields
      this.earlyOutDeduction = {
        deductionApplied: deduction.deductionApplied,
        deductionType: deduction.deductionType,
        deductionDays: deduction.deductionDays,
        deductionAmount: deduction.deductionAmount,
        reason: deduction.reason,
        rangeDescription: deduction.rangeDescription || null,
      };
    } catch (error) {
      console.error('Error calculating early-out deduction:', error);
      // Don't throw - set default values
      this.earlyOutDeduction = {
        deductionApplied: false,
        deductionType: null,
        deductionDays: null,
        deductionAmount: null,
        reason: 'Error calculating deduction',
        rangeDescription: null,
      };
    }
  } else {
    // Reset deduction if no early-out
    this.earlyOutDeduction = {
      deductionApplied: false,
      deductionType: null,
      deductionDays: null,
      deductionAmount: null,
      reason: null,
      rangeDescription: null,
    };
  }
});

// Post-save hook to recalculate monthly summary and detect extra hours
attendanceDailySchema.post('save', async function () {
  try {
    const { recalculateOnAttendanceUpdate } = require('../services/summaryCalculationService');
    const { detectExtraHours } = require('../services/extraHoursService');

    // If shiftId was modified, we need to recalculate the entire month
    if (this.isModified('shiftId')) {
      const dateObj = new Date(this.date);
      const year = dateObj.getFullYear();
      const monthNumber = dateObj.getMonth() + 1;

      const Employee = require('../../employees/model/Employee');
      const employee = await Employee.findOne({ emp_no: this.employeeNumber, is_active: { $ne: false } });

      if (employee) {
        const { calculateMonthlySummary } = require('../services/summaryCalculationService');
        await calculateMonthlySummary(employee._id, employee.emp_no, year, monthNumber);
      }
    } else {
      // Regular update - just recalculate for that date's month
      await recalculateOnAttendanceUpdate(this.employeeNumber, this.date);
    }

    // Detect extra hours if outTime or shiftId was modified
    if (this.isModified('outTime') || this.isModified('shiftId')) {
      if (this.outTime && this.shiftId) {
        // Only detect if we have both outTime and shiftId
        await detectExtraHours(this.employeeNumber, this.date);
      }
    }
  } catch (error) {
    // Don't throw - this is a background operation
    console.error('Error in post-save hook:', error);
  }
});

module.exports = mongoose.models.AttendanceDaily || mongoose.model('AttendanceDaily', attendanceDailySchema);

