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
  };

  if (!this.dailyRecords || this.dailyRecords.length === 0) {
    this.totals = totals;
    return;
  }

  for (const record of this.dailyRecords) {
    // Process first half
    if (record.firstHalf.status === 'present') {
      totals.presentHalfDays++;
    } else if (record.firstHalf.status === 'absent') {
      totals.absentHalfDays++;
    } else if (record.firstHalf.status === 'leave') {
      if (record.firstHalf.leaveType === 'paid' || record.firstHalf.leaveType === 'PAID') {
        totals.paidLeaveHalfDays++;
      } else if (record.firstHalf.leaveType === 'lop' || record.firstHalf.leaveType === 'LOP') {
        totals.lopHalfDays++;
      } else {
        totals.unpaidLeaveHalfDays++;
      }
    } else if (record.firstHalf.status === 'od') {
      totals.odHalfDays++;
    }

    // Process second half
    if (record.secondHalf.status === 'present') {
      totals.presentHalfDays++;
    } else if (record.secondHalf.status === 'absent') {
      totals.absentHalfDays++;
    } else if (record.secondHalf.status === 'leave') {
      if (record.secondHalf.leaveType === 'paid' || record.secondHalf.leaveType === 'PAID') {
        totals.paidLeaveHalfDays++;
      } else if (record.secondHalf.leaveType === 'lop' || record.secondHalf.leaveType === 'LOP') {
        totals.lopHalfDays++;
      } else {
        totals.unpaidLeaveHalfDays++;
      }
    } else if (record.secondHalf.status === 'od') {
      totals.odHalfDays++;
    }

    // Count full days (when both halves are same)
    if (!record.isSplit && record.status) {
      if (record.status === 'present') {
        totals.presentDays++;
      } else if (record.status === 'absent') {
        totals.absentDays++;
      } else if (record.status === 'leave') {
        if (record.leaveType === 'paid' || record.leaveType === 'PAID') {
          totals.paidLeaveDays++;
        } else if (record.leaveType === 'lop' || record.leaveType === 'LOP') {
          totals.lopDays++;
        } else {
          totals.unpaidLeaveDays++;
        }
      } else if (record.status === 'od') {
        totals.odDays++;
      }
    }

    // Add OT hours
    totals.totalOTHours += record.otHours || 0;
  }

  // Calculate totals (full days + half days * 0.5)
  totals.totalPresentDays = totals.presentDays + totals.presentHalfDays * 0.5;
  totals.totalAbsentDays = totals.absentDays + totals.absentHalfDays * 0.5;
  totals.totalPaidLeaveDays = totals.paidLeaveDays + totals.paidLeaveHalfDays * 0.5;
  totals.totalUnpaidLeaveDays = totals.unpaidLeaveDays + totals.unpaidLeaveHalfDays * 0.5;
  totals.totalLopDays = totals.lopDays + totals.lopHalfDays * 0.5;
  totals.totalLeaveDays = totals.totalPaidLeaveDays + totals.totalUnpaidLeaveDays + totals.totalLopDays;
  totals.totalODDays = totals.odDays + totals.odHalfDays * 0.5;

  // Calculate payable shifts = present + OD + paid leaves
  totals.totalPayableShifts = totals.totalPresentDays + totals.totalODDays + totals.totalPaidLeaveDays;

  this.totals = totals;
  return totals;
};

module.exports = mongoose.model('PayRegisterSummary', payRegisterSummarySchema);

