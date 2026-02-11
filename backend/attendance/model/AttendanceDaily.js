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
    // ========== MULTI-SHIFT SUPPORT ==========
    // Array to store multiple shifts per day (up to 3)
    shifts: [{
      shiftNumber: {
        type: Number,
        required: true,
        min: 1,
        max: 3,
      },
      inTime: {
        type: Date,
        required: true,
      },
      outTime: {
        type: Date,
        default: null,
      },
      duration: {
        type: Number, // in minutes
        default: null,
      },
      workingHours: {
        type: Number, // actual working hours for this shift (punch + od)
        default: null,
      },
      punchHours: {
        type: Number, // working hours from actual punches
        default: 0,
      },
      odHours: {
        type: Number, // working hours added from OD gap filling
        default: 0,
      },
      otHours: {
        type: Number, // OT hours for this shift
        default: 0,
      },
      shiftId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Shift',
        default: null,
      },
      shiftName: {
        type: String,
        default: null,
      },
      shiftStartTime: {
        type: String, // HH:MM
        default: null,
      },
      shiftEndTime: {
        type: String, // HH:MM
        default: null,
      },
      lateInMinutes: {
        type: Number,
        default: null,
      },
      earlyOutMinutes: {
        type: Number,
        default: null,
      },
      isLateIn: {
        type: Boolean,
        default: false,
      },
      isEarlyOut: {
        type: Boolean,
        default: false,
      },
      status: {
        type: String,
        enum: ['complete', 'incomplete', 'PRESENT', 'ABSENT', 'PARTIAL', 'HALF_DAY'],
        default: 'incomplete',
      },
      payableShift: {
        type: Number,
        default: 0, // 0, 0.5, 1
      },
    }],
    // Aggregate fields for multi-shift
    totalShifts: {
      type: Number,
      default: 0,
      min: 0,
      max: 3,
    },
    totalWorkingHours: {
      type: Number, // Sum of all shift working hours
      default: 0,
    },
    totalOTHours: {
      type: Number, // Sum of all shift OT hours
      default: 0,
    },
    payableShifts: {
      type: Number, // Sum of payable shifts (e.g. 1.5)
      default: 0,
    },
    // ========== BACKWARD COMPATIBILITY FIELDS ==========
    // Keep existing fields for backward compatibility
    // These will represent first shift IN and last shift OUT
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
      enum: ['PRESENT', 'ABSENT', 'PARTIAL', 'HALF_DAY', 'HOLIDAY', 'WEEK_OFF'],
      default: 'ABSENT',
    },
    isEdited: {
      type: Boolean,
      default: false,
    },
    editHistory: [{
      action: {
        type: String,
        enum: ['OUT_TIME_UPDATE', 'SHIFT_CHANGE', 'OT_CONVERSION'],
        required: true,
      },
      modifiedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
      },
      modifiedAt: {
        type: Date,
        default: Date.now,
      },
      details: String,
    }],
    source: {
      type: [String],
      enum: ['mssql', 'excel', 'manual', 'biometric-realtime'],
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
    // Shift-related fields (for primary/first shift)
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
      default: 0, // Sum of extra hours from all shifts
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
attendanceDailySchema.index({ employeeNumber: 1, date: 1 }, { unique: true, background: true });

// Index for calendar and reporting queries
attendanceDailySchema.index({ date: 1, status: 1 }, { background: true });

// Index for employee history/list queries (Compound for performance)
attendanceDailySchema.index({ employeeNumber: 1, date: -1 }, { background: true });

// Index for shift-based analytics
attendanceDailySchema.index({ shiftId: 1, date: 1 }, { background: true });

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

// Pre-save hook to calculate aggregates from shifts array
attendanceDailySchema.pre('save', async function () {
  // Fetch roster status once for both shifts-based and legacy logic (HOL/WO, remarks)
  let rosterStatus = null;
  try {
    const PreScheduledShift = require('../../shifts/model/PreScheduledShift');
    const rosterEntry = await PreScheduledShift.findOne({
      employeeNumber: this.employeeNumber,
      date: this.date,
    });
    rosterStatus = rosterEntry?.status; // 'WO' or 'HOL'
  } catch (err) {
    console.error('[AttendanceDaily Model] Error fetching roster status:', err);
  }

  if (this.shifts && this.shifts.length > 0) {
    // 1. Calculate Aggregate Totals
    let totalWorking = 0;
    let totalOT = 0;
    let totalExtra = 0;
    let firstIn = null;
    let lastOut = null;

  if (this.inTime && this.outTime) {
    this.calculateTotalHours();

    this.shifts.forEach((shift, index) => {
      totalWorking += shift.workingHours || 0;
      totalOT += shift.otHours || 0;
      totalExtra += shift.extraHours || 0;

      if (!firstIn || (shift.inTime && shift.inTime < firstIn)) {
        firstIn = shift.inTime;
      }

      if (shift.outTime) {
        if (!lastOut || shift.outTime > lastOut) {
          lastOut = shift.outTime;
        }
      }
    });

    this.totalWorkingHours = Math.round(totalWorking * 100) / 100;
    this.totalOTHours = Math.round(totalOT * 100) / 100;
    this.extraHours = Math.round(totalExtra * 100) / 100;

    // Payable shifts = cumulative of each assigned shift's payableShift (multi-shift day = sum)
    const totalPayable = this.shifts.reduce((sum, s) => sum + (s.payableShift || 0), 0);
    this.payableShifts = Math.round(totalPayable * 100) / 100;

    // 2. Metrics (Backward Compatibility)
    this.inTime = firstIn;
    this.outTime = lastOut;
    this.totalHours = this.totalWorkingHours;

    // 3. Status Determination
    // Logic:
    // - PRESENT: If any shift is PRESENT (or payable >= 1)
    // - HALF_DAY: Only if exactly ONE shift and it is HALF_DAY
    // - ABSENT: Otherwise (or handled by fallback)
    const hasPresentShift = this.shifts.some(s => s.status === 'complete' || s.status === 'PRESENT' || (s.payableShift && s.payableShift >= 1));

    if (hasPresentShift) {
      this.status = 'PRESENT';
    } else if (this.shifts.length === 1 && (this.shifts[0].status === 'HALF_DAY' || this.shifts[0].payableShift === 0.5)) {
      this.status = 'HALF_DAY';
    } else {
      // If multi-shift but none present, checking aggregated payable might handle edge cases like 0.5 + 0.5
      if (this.payableShifts >= 1) {
        this.status = 'PRESENT';
      } else {
        // Fallback to whatever the individual outcomes were, but usually absent/partial
        this.status = this.shifts.length > 0 ? 'PARTIAL' : 'ABSENT';
      }
    }

    // Set primary lookup fields from first shift
    if (this.shifts.length > 0 && this.shifts[0].shiftId) {
      this.shiftId = this.shifts[0].shiftId;
      this.isLateIn = this.shifts[0].isLateIn;
      this.lateInMinutes = this.shifts[0].lateInMinutes;
    }
  }

  } else {
    // Legacy mapping for direct updates without shifts array
    if (this.inTime && this.outTime) {
      this.calculateTotalHours();
      if (this.expectedHours) {
        const effectiveHours = (this.totalHours || 0) + (this.odHours || 0);
        // Normalize duration to hours if it looks like minutes (e.g. > 20)
        // expectedHours is usually in hours for legacy, but shift duration is often in hours too. 
        // Let's assume expectedHours is in HOURS.
        const durationHours = this.expectedHours;

        if (effectiveHours >= (durationHours * 0.8)) {
          this.status = 'PRESENT';
          this.payableShifts = 1;
        } else if (effectiveHours >= (durationHours * 0.35)) {
          this.status = 'HALF_DAY';
          this.payableShifts = 0.5;
        } else {
          this.status = 'ABSENT';
          this.payableShifts = 0;
        }
      } else if (this.status !== 'HALF_DAY' && this.status !== 'ABSENT') {
        // Fallback if expectedHours is missing but we have in/out
        this.status = 'PRESENT';
        this.payableShifts = 1;
      }
    } else if (this.inTime || this.outTime) {
      this.status = 'PARTIAL';
      this.payableShifts = 0;
    } else {
      // No punches - use roster status if available, else default to ABSENT
      this.payableShifts = 0;
      if (rosterStatus === 'HOL') {
        this.status = 'HOLIDAY';
      } else if (rosterStatus === 'WO') {
        this.status = 'WEEK_OFF';
      } else {
        this.status = 'ABSENT';
      }
    }
    // Special Requirement: If worked on Holiday/Week-Off (have punches on HOL/WO day), add remark
    if ((rosterStatus === 'HOL' || rosterStatus === 'WO') && (this.inTime || this.outTime)) {
      const dayLabel = rosterStatus === 'HOL' ? 'Holiday' : 'Week Off';
      const remark = `Worked on ${dayLabel}`;
      if (!this.notes) {
        this.notes = remark;
      } else if (!this.notes.includes(remark)) {
        this.notes = `${this.notes} | ${remark}`;
      }
    }
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

