const mongoose = require('mongoose');

/**
 * Pay Register Summary Model
 * Stores monthly pay register data for each employee
 * Consolidates attendance, leaves, OD, OT, and shifts into editable monthly record
 */
const payRegisterSummarySchema = new mongoose.Schema(
  {
    // Employee reference
    employeeId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Employee',
      required: [true, 'Employee is required'],
      index: true,
    },

    // Employee number for quick reference
    emp_no: {
      type: String,
      required: [true, 'Employee number is required'],
      trim: true,
      uppercase: true,
      index: true,
    },

    // Department ID for quick filtering (denormalized from Employee)
    department_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Department',
      index: true,
    },

    // Month in format "YYYY-MM" (e.g., "2024-01")
    month: {
      type: String,
      required: [true, 'Month is required'],
      match: [/^\d{4}-\d{2}$/, 'Month must be in YYYY-MM format'],
      index: true,
    },

    // Month name for display (e.g., "January 2024")
    monthName: {
      type: String,
      required: [true, 'Month name is required'],
    },

    // Year for filtering
    year: {
      type: Number,
      required: [true, 'Year is required'],
      index: true,
    },

    // Month number (1-12)
    monthNumber: {
      type: Number,
      required: [true, 'Month number is required'],
      min: 1,
      max: 12,
    },

    // Total days in the month (28/29/30/31)
    totalDaysInMonth: {
      type: Number,
      required: [true, 'Total days in month is required'],
      min: 28,
      max: 31,
    },

    // DAILY RECORDS - One record per date in the month
    dailyRecords: [
      {
        date: {
          type: String, // YYYY-MM-DD format
          required: true,
        },

        // FIRST HALF OF DAY
        firstHalf: {
          status: {
            type: String,
            enum: ['present', 'absent', 'leave', 'od'],
            default: 'absent',
          },
          leaveType: {
            type: String,
            default: null, // Only set if status = 'leave'
          },
          leaveNature: {
            type: String,
            enum: ['paid', 'lop', null],
            default: null, // Only set if status = 'leave'
          },
          isOD: {
            type: Boolean,
            default: false, // Only set if status = 'od'
          },
          otHours: {
            type: Number,
            default: 0,
            min: 0,
          },
          shiftId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Shift',
            default: null,
          },
          remarks: {
            type: String,
            trim: true,
            default: null,
          },
        },

        // SECOND HALF OF DAY
        secondHalf: {
          status: {
            type: String,
            enum: ['present', 'absent', 'leave', 'od'],
            default: 'absent',
          },
          leaveType: {
            type: String,
            default: null,
          },
          leaveNature: {
            type: String,
            enum: ['paid', 'lop', null],
            default: null,
          },
          leaveNature: {
            type: String,
            enum: ['paid', 'lop', null],
            default: null,
          },
          isOD: {
            type: Boolean,
            default: false,
          },
          otHours: {
            type: Number,
            default: 0,
            min: 0,
          },
          shiftId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Shift',
            default: null,
          },
          remarks: {
            type: String,
            trim: true,
            default: null,
          },
        },

        // FULL DAY FIELDS (for quick access when not split)
        status: {
          type: String,
          enum: ['present', 'absent', 'leave', 'od', null],
          default: null, // Only set if firstHalf.status === secondHalf.status
        },
        leaveType: {
          type: String,
          default: null, // Only set if status = 'leave' and not split
        },
        leaveNature: {
          type: String,
          enum: ['paid', 'lop', 'without_pay', null],
          default: null, // Only set if status = 'leave' and not split
        },
        isOD: {
          type: Boolean,
          default: false, // Only set if status = 'od' and not split
        },
        isSplit: {
          type: Boolean,
          default: false, // true if firstHalf.status !== secondHalf.status
        },

        // SHIFT (usually same for whole day)
        shiftId: {
          type: mongoose.Schema.Types.ObjectId,
          ref: 'Shift',
          default: null,
        },
        shiftName: {
          type: String,
          default: null,
        },

        // OT (total for the day)
        otHours: {
          type: Number,
          default: 0,
          min: 0,
        },

        // REFERENCES to original records (for audit and auto-sync)
        attendanceRecordId: {
          type: mongoose.Schema.Types.ObjectId,
          ref: 'AttendanceDaily',
          default: null,
        },
        leaveIds: [
          {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Leave',
          },
        ],
        leaveSplitIds: [
          {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'LeaveSplit',
          },
        ],
        odIds: [
          {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'OD',
          },
        ],
        otIds: [
          {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'OT',
          },
        ],

        // REMARKS
        remarks: {
          type: String,
          trim: true,
          default: null,
        },
      },
    ],

    // MONTHLY TOTALS (calculated from dailyRecords)
    totals: {
      // PRESENT DAYS
      presentDays: {
        type: Number,
        default: 0,
        min: 0,
      },
      presentHalfDays: {
        type: Number,
        default: 0,
        min: 0,
      },
      totalPresentDays: {
        type: Number,
        default: 0,
        min: 0,
      },

      // ABSENT DAYS
      absentDays: {
        type: Number,
        default: 0,
        min: 0,
      },
      absentHalfDays: {
        type: Number,
        default: 0,
        min: 0,
      },
      totalAbsentDays: {
        type: Number,
        default: 0,
        min: 0,
      },

      // LEAVES
      paidLeaveDays: {
        type: Number,
        default: 0,
        min: 0,
      },
      paidLeaveHalfDays: {
        type: Number,
        default: 0,
        min: 0,
      },
      totalPaidLeaveDays: {
        type: Number,
        default: 0,
        min: 0,
      },

      unpaidLeaveDays: {
        type: Number,
        default: 0,
        min: 0,
      },
      unpaidLeaveHalfDays: {
        type: Number,
        default: 0,
        min: 0,
      },
      totalUnpaidLeaveDays: {
        type: Number,
        default: 0,
        min: 0,
      },

      lopDays: {
        type: Number,
        default: 0,
        min: 0,
      },
      lopHalfDays: {
        type: Number,
        default: 0,
        min: 0,
      },
      totalLopDays: {
        type: Number,
        default: 0,
        min: 0,
      },

      totalLeaveDays: {
        type: Number,
        default: 0,
        min: 0,
      },

      // OD DAYS
      odDays: {
        type: Number,
        default: 0,
        min: 0,
      },
      odHalfDays: {
        type: Number,
        default: 0,
        min: 0,
      },
      totalODDays: {
        type: Number,
        default: 0,
        min: 0,
      },

      // OT HOURS
      totalOTHours: {
        type: Number,
        default: 0,
        min: 0,
      },

      // PAYABLE SHIFTS
      totalPayableShifts: {
        type: Number,
        default: 0,
        min: 0,
      },
      totalWeeklyOffs: {
        type: Number,
        default: 0,
        min: 0,
      },
      totalHolidays: {
        type: Number,
        default: 0,
        min: 0,
      },
    },

    // AUTO-SYNC TRACKING
    lastAutoSyncedAt: {
      type: Date,
      default: null,
    },
    lastAutoSyncedFrom: {
      attendance: {
        type: Date,
        default: null,
      },
      leaves: {
        type: Date,
        default: null,
      },
      ods: {
        type: Date,
        default: null,
      },
      ot: {
        type: Date,
        default: null,
      },
      shifts: {
        type: Date,
        default: null,
      },
    },

    // MANUAL EDIT TRACKING
    lastEditedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    lastEditedAt: {
      type: Date,
      default: null,
    },
    editedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    editedAt: {
      type: Date,
      default: null,
    },

    // EDIT HISTORY (audit trail)
    editHistory: [
      {
        date: {
          type: String, // YYYY-MM-DD
          required: true,
        },
        field: {
          type: String,
          required: true, // e.g., "firstHalf.status", "otHours", "shiftId"
        },
        oldValue: {
          type: mongoose.Schema.Types.Mixed,
        },
        newValue: {
          type: mongoose.Schema.Types.Mixed,
        },
        editedBy: {
          type: mongoose.Schema.Types.ObjectId,
          ref: 'User',
          required: true,
        },
        editedByName: {
          type: String,
        },
        editedByRole: {
          type: String,
        },
        editedAt: {
          type: Date,
          default: Date.now,
        },
        remarks: {
          type: String,
          trim: true,
        },
      },
    ],

    // STATUS
    status: {
      type: String,
      enum: ['draft', 'in_review', 'finalized'],
      default: 'draft',
    },

    // ADDITIONAL METADATA
    notes: {
      type: String,
      trim: true,
      default: null,
    },
  },
  {
    timestamps: {
      createdAt: 'created_at',
      updatedAt: 'updated_at',
    },
  }
);

// Unique index: one pay register per employee per month
payRegisterSummarySchema.index({ employeeId: 1, month: 1 }, { unique: true });
payRegisterSummarySchema.index({ emp_no: 1, month: 1 }, { unique: true });

// Indexes for efficient queries
payRegisterSummarySchema.index({ year: 1, monthNumber: 1 });
payRegisterSummarySchema.index({ employeeId: 1, year: 1 });
payRegisterSummarySchema.index({ status: 1 });

// Index for date queries in dailyRecords
payRegisterSummarySchema.index({ 'dailyRecords.date': 1 });

// Static method to get or create pay register
payRegisterSummarySchema.statics.getOrCreate = async function (employeeId, emp_no, year, monthNumber) {
  const monthStr = `${year}-${String(monthNumber).padStart(2, '0')}`;
  const monthNames = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ];
  const monthName = `${monthNames[monthNumber - 1]} ${year}`;

  // Get total days in month
  const totalDaysInMonth = new Date(year, monthNumber, 0).getDate();

  let payRegister = await this.findOne({ employeeId, month: monthStr });

  if (!payRegister) {
    payRegister = await this.create({
      employeeId,
      emp_no,
      month: monthStr,
      monthName,
      year,
      monthNumber,
      totalDaysInMonth,
      status: 'draft',
    });
  } else {
    // Update month name and total days in case month/year changed
    payRegister.monthName = monthName;
    payRegister.totalDaysInMonth = totalDaysInMonth;
    await payRegister.save();
  }

  return payRegister;
};

// Instance method to recalculate totals
payRegisterSummarySchema.methods.recalculateTotals = function () {
  const totals = {
    presentDays: 0,
    presentHalfDays: 0,
    totalPresentDays: 0,
    absentDays: 0,
    absentHalfDays: 0,
    totalAbsentDays: 0,
    paidLeaveDays: 0,
    paidLeaveHalfDays: 0,
    totalPaidLeaveDays: 0,
    unpaidLeaveDays: 0,
    unpaidLeaveHalfDays: 0,
    totalUnpaidLeaveDays: 0,
    lopDays: 0,
    lopHalfDays: 0,
    totalLopDays: 0,
    totalLeaveDays: 0,
    odDays: 0,
    odHalfDays: 0,
    totalODDays: 0,
    totalOTHours: 0,
    totalPayableShifts: 0,
    totalWeeklyOffs: 0,
    totalHolidays: 0,
  };

  if (!this.dailyRecords || this.dailyRecords.length === 0) {
    this.totals = totals;
    return;
  }

  for (const record of this.dailyRecords) {
    // Track Holidays and Weekly Offs (can be fractional if split)
    if (record.isSplit) {
      if (record.firstHalf?.status === 'holiday') totals.totalHolidays += 0.5;
      if (record.firstHalf?.status === 'week_off') totals.totalWeeklyOffs += 0.5;
      if (record.secondHalf?.status === 'holiday') totals.totalHolidays += 0.5;
      if (record.secondHalf?.status === 'week_off') totals.totalWeeklyOffs += 0.5;
    } else {
      if (record.status === 'holiday') totals.totalHolidays += 1;
      if (record.status === 'week_off') totals.totalWeeklyOffs += 1;
    }

    const isHoliday = record.status === 'holiday' || record.firstHalf?.status === 'holiday' || record.secondHalf?.status === 'holiday';
    const isWeekOff = record.status === 'week_off' || record.firstHalf?.status === 'week_off' || record.secondHalf?.status === 'week_off';

    if (isHoliday || isWeekOff) {
      // Still count OT hours for holidays/week_off if any
      totals.totalOTHours += record.otHours || 0;
      continue; // Skip counting this record in attendance categories
    }

    // Determine if actually split by checking if halves have different statuses
    // Don't rely on isSplit flag as it might be incorrect
    const firstHalfStatus = record.firstHalf?.status;
    const secondHalfStatus = record.secondHalf?.status;
    // Consider split if: both halves exist and have different statuses, OR if record.isSplit is explicitly true
    const isActuallySplit = (firstHalfStatus && secondHalfStatus && firstHalfStatus !== secondHalfStatus) ||
      (record.isSplit === true && firstHalfStatus && secondHalfStatus);

    // If record is actually split, count halves separately
    if (isActuallySplit) {
      // Process first half - only count if status is explicitly set and valid
      if (record.firstHalf && record.firstHalf.status &&
        ['present', 'absent', 'leave', 'od'].includes(record.firstHalf.status)) {
        if (record.firstHalf.status === 'present') {
          totals.presentHalfDays++;
        } else if (record.firstHalf.status === 'absent') {
          totals.absentHalfDays++;
        } else if (record.firstHalf.status === 'leave') {
          const leaveNature = record.firstHalf.leaveNature || (record.firstHalf.leaveType || '').toLowerCase();
          if (leaveNature === 'paid') {
            totals.paidLeaveHalfDays++;
          } else {
            // Treat any non-paid leave as LOP
            totals.lopHalfDays++;
          }
        } else if (record.firstHalf.status === 'od') {
          totals.odHalfDays++;
        }
      }

      // Process second half - only count if status is explicitly set and valid
      if (record.secondHalf && record.secondHalf.status &&
        ['present', 'absent', 'leave', 'od'].includes(record.secondHalf.status)) {
        if (record.secondHalf.status === 'present') {
          totals.presentHalfDays++;
        } else if (record.secondHalf.status === 'absent') {
          totals.absentHalfDays++;
        } else if (record.secondHalf.status === 'leave') {
          const leaveNature = record.secondHalf.leaveNature || (record.secondHalf.leaveType || '').toLowerCase();
          if (leaveNature === 'paid') {
            totals.paidLeaveHalfDays++;
          } else {
            // Treat any non-paid leave as LOP
            totals.lopHalfDays++;
          }
        } else if (record.secondHalf.status === 'od') {
          totals.odHalfDays++;
        }
      }
    } else {
      // If not split, count as full day only (don't count halves separately)
      // Use the record.status if available, otherwise use firstHalf.status (they should be the same)
      const statusToCount = record.status || firstHalfStatus || secondHalfStatus;

      // Only count if status is explicitly set and valid (not null, not holiday, not week_off)
      if (statusToCount && ['present', 'absent', 'leave', 'od'].includes(statusToCount)) {
        if (statusToCount === 'present') {
          totals.presentDays++;
        } else if (statusToCount === 'absent') {
          totals.absentDays++;
        } else if (statusToCount === 'leave') {
          const leaveNature = record.leaveNature || record.firstHalf?.leaveNature || (record.leaveType || record.firstHalf?.leaveType || '').toLowerCase();
          if (leaveNature === 'paid') {
            totals.paidLeaveDays++;
          } else {
            // Treat any non-paid leave as LOP
            totals.lopDays++;
          }
        } else if (statusToCount === 'od') {
          totals.odDays++;
        }
      }
    }

    // Add OT hours
    totals.totalOTHours += record.otHours || 0;
  }

  // Calculate totals (full days + half days * 0.5)
  totals.totalPresentDays = totals.presentDays + totals.presentHalfDays * 0.5;
  totals.totalAbsentDays = totals.absentDays + totals.absentHalfDays * 0.5;
  totals.totalPaidLeaveDays = totals.paidLeaveDays + totals.paidLeaveHalfDays * 0.5;
  totals.totalUnpaidLeaveDays = 0; // No separate unpaid bucket; all non-paid leaves are LOP
  totals.totalLopDays = totals.lopDays + totals.lopHalfDays * 0.5;
  totals.totalLeaveDays = totals.totalPaidLeaveDays + totals.totalLopDays;
  totals.totalODDays = totals.odDays + totals.odHalfDays * 0.5;

  // Calculate payable shifts = present + OD + paid leaves
  totals.totalPayableShifts = totals.totalPresentDays + totals.totalODDays + totals.totalPaidLeaveDays;
  // This is where we will also use the shift-based payable units if implemented here
  // But for now, let's keep it consistent with the service fix I just did

  this.totals = totals;
  return totals;
};

module.exports = mongoose.models.PayRegisterSummary || mongoose.model('PayRegisterSummary', payRegisterSummarySchema);

