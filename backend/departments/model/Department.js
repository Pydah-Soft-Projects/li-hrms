const mongoose = require('mongoose');

const departmentSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Department name is required'],
      unique: true,
      trim: true,
    },
    code: {
      type: String,
      unique: true,
      sparse: true,
      trim: true,
      uppercase: true,
    },
    description: {
      type: String,
      trim: true,
    },
    hod: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    hr: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    // Attendance Configuration
    attendanceConfig: {
      lateInLimit: {
        type: Number,
        default: 0, // Number of late-ins allowed before deduction
      },
      earlyOutLimit: {
        type: Number,
        default: 0, // Number of early-outs allowed before deduction
      },
      lateInGraceTime: {
        type: Number,
        default: 15, // Grace time in minutes
      },
      earlyOutGraceTime: {
        type: Number,
        default: 15, // Grace time in minutes
      },
    },
    // Permission Policy Configuration
    permissionPolicy: {
      dailyLimit: {
        type: Number,
        default: 0, // Daily permission limit (0 = unlimited)
      },
      monthlyLimit: {
        type: Number,
        default: 0, // Monthly permission limit (0 = unlimited)
      },
      deductFromSalary: {
        type: Boolean,
        default: false, // Whether to deduct from salary
      },
      deductionAmount: {
        type: Number,
        default: 0, // Amount to deduct per permission
      },
    },
    // Auto-Deduction Rules
    autoDeductionRules: [
      {
        trigger: {
          type: String,
          enum: ['late_in', 'early_out', 'permission'],
          required: true,
        },
        count: {
          type: Number,
          required: true, // e.g., 3 late-ins
        },
        action: {
          type: String,
          enum: ['half_day', 'full_day', 'deduct_amount'],
          required: true,
        },
        amount: {
          type: Number,
          default: 0, // Amount if action is 'deduct_amount'
        },
      },
    ],
    // Shift assignments for this department
    shifts: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Shift',
      },
    ],
    // Designations linked to this department
    // Automatically populated when employees are assigned designations
    designations: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Designation',
      },
    ],
    // Paid leaves count (number only)
    paidLeaves: {
      type: Number,
      default: 0,
    },
    // Leave limits per day (for deduction rules)
    leaveLimits: {
      dailyLimit: {
        type: Number,
        default: 0, // 0 = unlimited
      },
      monthlyLimit: {
        type: Number,
        default: 0, // 0 = unlimited
      },
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

// Indexes
// Note: name and code already have unique:true which creates indexes
departmentSchema.index({ hod: 1 });
departmentSchema.index({ hr: 1 });
departmentSchema.index({ isActive: 1 });
departmentSchema.index({ designations: 1 });

module.exports = mongoose.models.Department || mongoose.model('Department', departmentSchema);


