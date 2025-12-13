const mongoose = require('mongoose');

/**
 * Monthly Leave Record Model
 * Tracks all leaves taken by an employee in a specific month
 * Stores leave IDs and summary analytics for reporting and balance calculations
 */
const monthlyLeaveRecordSchema = new mongoose.Schema(
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
      index: true,
    },

    // Month in format "YYYY-MM" (e.g., "2024-01")
    month: {
      type: String,
      required: [true, 'Month is required'],
      match: [/^\d{4}-\d{2}$/, 'Month must be in YYYY-MM format'],
      index: true,
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

    // Financial year (e.g., "2024-2025")
    financialYear: {
      type: String,
      required: [true, 'Financial year is required'],
      index: true,
    },

    // Array of Leave IDs that fall in this month
    leaveIds: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Leave',
      },
    ],

    // Summary Analytics
    summary: {
      // Total leaves taken (all types combined)
      totalLeaves: {
        type: Number,
        default: 0,
        min: 0,
      },
      // Total paid leaves taken
      paidLeaves: {
        type: Number,
        default: 0,
        min: 0,
      },
      // Total without pay leaves taken
      withoutPayLeaves: {
        type: Number,
        default: 0,
        min: 0,
      },
      // Total LOP (Loss of Pay) leaves taken
      lopLeaves: {
        type: Number,
        default: 0,
        min: 0,
      },
      // Breakdown by leave type
      leaveTypesBreakdown: [
        {
          leaveType: {
            type: String,
            required: true,
          },
          leaveTypeName: String, // For display
          days: {
            type: Number,
            default: 0,
            min: 0,
          },
          nature: {
            type: String,
            enum: ['paid', 'lop', 'without_pay'],
          },
          leaveIds: [
            {
              type: mongoose.Schema.Types.ObjectId,
              ref: 'Leave',
            },
          ],
        },
      ],
      // Breakdown by leave nature
      leaveNaturesBreakdown: [
        {
          nature: {
            type: String,
            enum: ['paid', 'lop', 'without_pay'],
            required: true,
          },
          days: {
            type: Number,
            default: 0,
            min: 0,
          },
          leaveIds: [
            {
              type: mongoose.Schema.Types.ObjectId,
              ref: 'Leave',
            },
          ],
        },
      ],
    },
  },
  {
    timestamps: {
      createdAt: 'created_at',
      updatedAt: 'updated_at',
    },
  }
);

// Compound index for unique monthly record per employee
monthlyLeaveRecordSchema.index({ employeeId: 1, month: 1 }, { unique: true });

// Indexes for efficient queries
monthlyLeaveRecordSchema.index({ emp_no: 1, month: 1 });
monthlyLeaveRecordSchema.index({ employeeId: 1, financialYear: 1 });
monthlyLeaveRecordSchema.index({ year: 1, monthNumber: 1 });

module.exports = mongoose.model('MonthlyLeaveRecord', monthlyLeaveRecordSchema);


