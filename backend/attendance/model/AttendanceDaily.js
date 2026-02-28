/**
 * Attendance Daily Model
 * Aggregated daily view - one document per employee per date
 */

const mongoose = require('mongoose');
const { extractISTComponents } = require('../../shared/utils/dateUtils');

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
      expectedHours: {
        type: Number,
        default: null, // From shift.duration for OT/extra calculation
      },
      extraHours: {
        type: Number,
        default: 0, // workingHours - expectedHours when > 0
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
    // ========== NEW AGGREGATE FIELDS ==========
    totalLateInMinutes: {
      type: Number,
      default: 0
    },
    totalEarlyOutMinutes: {
      type: Number,
      default: 0
    },
    totalExpectedHours: {
      type: Number,
      default: 0
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
        enum: ['OUT_TIME_UPDATE', 'SHIFT_CHANGE', 'OT_CONVERSION', 'IN_TIME_UPDATE'],
        required: true,
      },
      modifiedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
      },
      modifiedByName: String,
      modifiedAt: {
        type: Date,
        default: Date.now,
      },
      details: String,
    }],
    source: {
      type: [String],
      enum: ['mssql', 'excel', 'manual', 'biometric-realtime', 'roster-sync'],
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
    // Overtime and extra hours
    otHours: {
      type: Number,
      default: 0, // Overtime hours (from approved OT request) - Keeping for backward compat / manual OT
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
// Method to calculate total hours - REMOVED (Legacy)

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
    let totalLateIn = 0;
    let totalEarlyOut = 0;
    let totalExpected = 0;

    // Calculate totals from shifts
    this.shifts.forEach((shift) => {
      totalWorking += shift.workingHours || 0;
      totalOT += shift.otHours || 0;
      totalExtra += shift.extraHours || 0;

      // Accumulate minutes
      if (shift.lateInMinutes > 0) totalLateIn += shift.lateInMinutes;
      if (shift.earlyOutMinutes > 0) totalEarlyOut += shift.earlyOutMinutes;

      // Expected hours (from shift definition if available)
      totalExpected += shift.expectedHours || 8;
    });

    this.totalWorkingHours = Math.round(totalWorking * 100) / 100;
    this.totalOTHours = Math.round(totalOT * 100) / 100;
    this.extraHours = Math.round(totalExtra * 100) / 100;
    this.totalLateInMinutes = totalLateIn;
    this.totalEarlyOutMinutes = totalEarlyOut;
    this.totalExpectedHours = totalExpected; // Placeholder or calculate if possible

    // 2. Status Determination
    // Logic:
    // - PRESENT: If any shift is 'PRESENT' OR the sum of payable units is >= 1.0
    // - HALF_DAY: If any shift is 'HALF_DAY' OR the sum of payable units is >= 0.5
    // - ABSENT/PARTIAL: Fallback
    const hasPresentShift = this.shifts.some(s => s.status === 'complete' || s.status === 'PRESENT');
    const hasHalfDayShift = this.shifts.some(s => s.status === 'HALF_DAY');
    const totalPayable = this.shifts.reduce((acc, s) => acc + (s.payableShift || 0), 0);
    this.payableShifts = totalPayable;

    if (hasPresentShift || totalPayable >= 0.95) { // 0.95 to account for floating point
      this.status = 'PRESENT';
    } else if (hasHalfDayShift || totalPayable >= 0.45) { // 0.45 to account for floating point
      this.status = 'HALF_DAY';
    } else {
      // Check if there are any punches at all to distinguish between ABSENT and PARTIAL
      const hasPunches = this.shifts.some(s => s.inTime || (s.outTime && s.outTime !== s.inTime));
      this.status = hasPunches ? 'PARTIAL' : 'ABSENT';
    }
  } else {
    // Legacy/No-Shift Logic (likely unused now but good for safety)
    if (this.totalWorkingHours > 0) {
      this.status = 'PRESENT'; // Simplified fallback
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
    // Checked via totalWorkingHours now
    if ((rosterStatus === 'HOL' || rosterStatus === 'WO') && (this.totalWorkingHours > 0)) {
      const dayLabel = rosterStatus === 'HOL' ? 'Holiday' : 'Week Off';
      const remark = `Worked on ${dayLabel}`;
      if (!this.notes) {
        this.notes = remark;
      } else if (!this.notes.includes(remark)) {
        this.notes = `${this.notes} | ${remark}`;
      }
    }
  }

  // Calculate early-out deduction if totalEarlyOutMinutes exists
  if (this.totalEarlyOutMinutes && this.totalEarlyOutMinutes > 0) {
    try {
      const { calculateEarlyOutDeduction } = require('../services/earlyOutDeductionService');
      const deduction = await calculateEarlyOutDeduction(this.totalEarlyOutMinutes);

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

// Post-save hook: run monthly summary recalculation in background so save() returns quickly.
// Summary is recalculated for the employee's payroll month whenever a daily record is saved.
attendanceDailySchema.post('save', function () {
  const employeeNumber = this.employeeNumber;
  const date = this.date;
  const shiftsModified = this.isModified('shifts');
  const shifts = this.shifts;

  setImmediate(async () => {
    try {
      const { recalculateOnAttendanceUpdate } = require('../services/summaryCalculationService');
      const { detectExtraHours } = require('../services/extraHoursService');

      if (shiftsModified) {
        const { year, month: monthNumber } = extractISTComponents(date);
        const Employee = require('../../employees/model/Employee');
        const employee = await Employee.findOne({ emp_no: employeeNumber, is_active: { $ne: false } });
        if (employee) {
          const { calculateMonthlySummary } = require('../services/summaryCalculationService');
          await calculateMonthlySummary(employee._id, employee.emp_no, year, monthNumber);
        }
        if (shifts && shifts.length > 0) {
          await detectExtraHours(employeeNumber, date);
        }
      } else {
        await recalculateOnAttendanceUpdate(employeeNumber, date);
      }
    } catch (error) {
      console.error('[AttendanceDaily] Background summary recalc failed:', error);
    }
  });
});

/**
 * Handle findOneAndUpdate to trigger summary recalculation (runs in background).
 * findOneAndUpdate bypasses 'save' hooks, so we need this hook when updates go through updateOne/findOneAndUpdate.
 */
attendanceDailySchema.post('findOneAndUpdate', async function (result) {
  try {
    const query = this.getQuery ? this.getQuery() : {};
    const update = this.getUpdate ? this.getUpdate() : {};
    const isShiftsUpdate = update.$set?.shifts || update.shifts;
    const isStatusUpdate = update.$set?.status || update.status;
    const isManualOverride = update.$set?.isEdited || update.isEdited;
    if (!isShiftsUpdate && !isStatusUpdate && !isManualOverride) return;

    const employeeNumber = (result && result.employeeNumber) || query.employeeNumber;
    const date = (result && result.date) || query.date;
    if (!employeeNumber || !date) return;

    setImmediate(async () => {
      try {
        const { recalculateOnAttendanceUpdate } = require('../services/summaryCalculationService');
        const { detectExtraHours } = require('../services/extraHoursService');
        await recalculateOnAttendanceUpdate(employeeNumber, date);
        if (isShiftsUpdate) {
          await detectExtraHours(employeeNumber, date);
        }
      } catch (err) {
        console.error('[AttendanceDaily findOneAndUpdate hook] Background summary recalc failed:', err);
      }
    });
  } catch (error) {
    console.error('Error in post-findOneAndUpdate hook:', error);
  }
});

module.exports = mongoose.models.AttendanceDaily || mongoose.model('AttendanceDaily', attendanceDailySchema);

