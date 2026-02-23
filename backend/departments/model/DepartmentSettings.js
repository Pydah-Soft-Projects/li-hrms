const mongoose = require('mongoose');

/**
 * Department Settings Model
 * Stores department-specific settings that override global defaults
 * Used for Leaves, Loans, Salary Advances, and Permissions
 */
const departmentSettingsSchema = new mongoose.Schema(
  {
    // Department reference
    department: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Department',
      required: [true, 'Department is required'],
    },

    // Division reference (Optional override for a specific division within a department)
    division: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Division',
      default: null,
    },

    // Leaves Settings
    leaves: {
      // Leave accrual rate per day (e.g., 1.5, 2.0, 2.5)
      leavesPerDay: {
        type: Number,
        default: null, // null = use global default
        min: 0,
      },
      // Total paid leaves count
      paidLeavesCount: {
        type: Number,
        default: null, // null = use global default
        min: 0,
      },
      // Daily leave limit (0 = unlimited)
      dailyLimit: {
        type: Number,
        default: null,
        min: 0,
      },
      // Monthly leave limit (0 = unlimited)
      monthlyLimit: {
        type: Number,
        default: null,
        min: 0,
      },
      // Total casual leaves allotted per year
      casualLeavePerYear: {
        type: Number,
        default: null,
        min: 0,
      },
      // Maximum casual leaves allowed to be used per month
      maxCasualLeavesPerMonth: {
        type: Number,
        default: null,
        min: 0,
      },
      // EL Earning Type Override
      elEarningType: {
        type: String,
        enum: ['attendance_based', 'fixed', null],
        default: null,
      },
      // EL Max Carry Forward Override
      elMaxCarryForward: {
        type: Number,
        default: null,
        min: 0,
      },
      // CCL Expiry Months Override
      cclExpiryMonths: {
        type: Number,
        default: null,
        min: 0,
      },
    },

    // Loans Settings
    loans: {
      // Interest rate (percentage)
      interestRate: {
        type: Number,
        default: null,
        min: 0,
        max: 100,
      },
      // Is interest applicable
      isInterestApplicable: {
        type: Boolean,
        default: null,
      },
      // Minimum tenure in months
      minTenure: {
        type: Number,
        default: null,
        min: 1,
      },
      // Maximum tenure in months
      maxTenure: {
        type: Number,
        default: null,
        min: 1,
      },
      // Minimum loan amount
      minAmount: {
        type: Number,
        default: null,
        min: 0,
      },
      // Maximum loan amount (null = unlimited)
      maxAmount: {
        type: Number,
        default: null,
        min: 0,
      },
      // Maximum loan per employee (lifetime, null = unlimited)
      maxPerEmployee: {
        type: Number,
        default: null,
        min: 0,
      },
      // Maximum active loans per employee
      maxActivePerEmployee: {
        type: Number,
        default: null,
        min: 1,
      },
      // Minimum service period (in months) to be eligible
      minServicePeriod: {
        type: Number,
        default: null,
        min: 0,
      },
    },

    // Salary Advance Settings
    salaryAdvance: {
      // Interest rate (percentage)
      interestRate: {
        type: Number,
        default: null,
        min: 0,
        max: 100,
      },
      // Is interest applicable
      isInterestApplicable: {
        type: Boolean,
        default: null,
      },
      // Minimum tenure in months
      minTenure: {
        type: Number,
        default: null,
        min: 1,
      },
      // Maximum tenure in months
      maxTenure: {
        type: Number,
        default: null,
        min: 1,
      },
      // Minimum advance amount
      minAmount: {
        type: Number,
        default: null,
        min: 0,
      },
      // Maximum advance amount (null = unlimited)
      maxAmount: {
        type: Number,
        default: null,
        min: 0,
      },
      // Maximum advance per employee (lifetime, null = unlimited)
      maxPerEmployee: {
        type: Number,
        default: null,
        min: 0,
      },
      // Maximum active advances per employee
      maxActivePerEmployee: {
        type: Number,
        default: null,
        min: 1,
      },
      // Minimum service period (in months) to be eligible
      minServicePeriod: {
        type: Number,
        default: null,
        min: 0,
      },
    },

    // Permissions Settings
    permissions: {
      // Permissions per day limit (0 = unlimited)
      perDayLimit: {
        type: Number,
        default: null,
        min: 0,
      },
      // Monthly permission limit (0 = unlimited)
      monthlyLimit: {
        type: Number,
        default: null,
        min: 0,
      },
      // Whether to deduct from salary
      deductFromSalary: {
        type: Boolean,
        default: null,
      },
      // Amount to deduct per permission
      deductionAmount: {
        type: Number,
        default: null,
        min: 0,
      },
      // Permission Deduction Rules
      deductionRules: {
        // Count threshold (e.g., 4 permissions)
        countThreshold: {
          type: Number,
          default: null,
          min: 1,
        },
        // Deduction type: half_day, full_day, custom_amount
        deductionType: {
          type: String,
          enum: ['half_day', 'full_day', 'custom_amount', null],
          default: null,
        },
        // Custom deduction amount (only if deductionType is 'custom_amount')
        deductionAmount: {
          type: Number,
          default: null,
          min: 0,
        },
        // Minimum duration in minutes (only count permissions >= this duration)
        minimumDuration: {
          type: Number,
          default: null,
          min: 0,
        },
        // Calculation mode: proportional (with partial) or floor (only full multiples)
        calculationMode: {
          type: String,
          enum: ['proportional', 'floor', null],
          default: null,
        },
      },
    },

    // Overtime (OT) Settings
    ot: {
      // Amount per hour of overtime worked (in ₹)
      otPayPerHour: {
        type: Number,
        default: null, // null = use global default
        min: 0,
      },
      // Minimum overtime hours required to be eligible for overtime pay
      minOTHours: {
        type: Number,
        default: null, // null = use global default
        min: 0,
      },
    },

    // Attendance Deduction Rules (Combined Late-in + Early-out)
    attendance: {
      deductionRules: {
        // Combined count threshold (late-ins + early-outs)
        combinedCountThreshold: {
          type: Number,
          default: null,
          min: 1,
        },
        // Deduction type: half_day, full_day, custom_amount
        deductionType: {
          type: String,
          enum: ['half_day', 'full_day', 'custom_amount', null],
          default: null,
        },
        // Custom deduction amount (only if deductionType is 'custom_amount')
        deductionAmount: {
          type: Number,
          default: null,
          min: 0,
        },
        // Minimum duration in minutes (only count late-ins/early-outs >= this duration)
        minimumDuration: {
          type: Number,
          default: null,
          min: 0,
        },
        // Calculation mode: proportional (with partial) or floor (only full multiples)
        calculationMode: {
          type: String,
          enum: ['proportional', 'floor', null],
          default: null,
        },
      },
      // Early-Out specific settings
      earlyOut: {
        isEnabled: {
          type: Boolean,
          default: false,
        },
        allowedDurationMinutes: {
          type: Number,
          default: 0,
          min: 0,
        },
        minimumDuration: {
          type: Number,
          default: 0,
          min: 0,
        },
        deductionRanges: [
          {
            minMinutes: {
              type: Number,
              required: true,
              min: 0,
            },
            maxMinutes: {
              type: Number,
              required: true,
              min: 0,
            },
            deductionType: {
              type: String,
              enum: ['quarter_day', 'half_day', 'full_day', 'custom_amount'],
              required: true,
            },
            deductionAmount: {
              type: Number,
              default: null,
              min: 0,
            },
            description: {
              type: String,
              trim: true,
              default: '',
            },
          },
        ],
      },
    },

    // Payroll Settings
    payroll: {
      // Controls whether missing allowances/deductions should be auto-included for employees with partial overrides
      includeMissingEmployeeComponents: {
        type: Boolean,
        default: null, // null => fallback to global setting
      },
      // Absent deduction enable/disable (department override)
      enableAbsentDeduction: {
        type: Boolean,
        default: null, // null => fallback to global setting
      },
      // LOP days applied per absent day (e.g., 1 = no extra, 2 = one extra LOP per absent)
      lopDaysPerAbsent: {
        type: Number,
        default: null, // null => fallback to global setting
        min: 0,
      },
    },

    // Created by
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },

    // Last updated by
    updatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
  },
  {
    timestamps: true,
  }
);

// Indexes
departmentSettingsSchema.index({ department: 1, division: 1 }, { unique: true });
departmentSettingsSchema.index({ division: 1 });

// Static method to get settings for a department and division
departmentSettingsSchema.statics.getByDeptAndDiv = async function (departmentId, divisionId = null) {
  // First try specific division override
  if (divisionId) {
    const divisionSettings = await this.findOne({ department: departmentId, division: divisionId });
    if (divisionSettings) return divisionSettings;
  }
  // Fallback to department-wide default (division: null)
  return this.findOne({ department: departmentId, division: null });
};

// Static method to get or create settings for a department/division combination
departmentSettingsSchema.statics.getOrCreateCombination = async function (departmentId, divisionId = null) {
  let settings = await this.findOne({ department: departmentId, division: divisionId || null });
  if (!settings) {
    settings = new this({ department: departmentId, division: divisionId || null });
    await settings.save();
  }
  return settings;
};

module.exports = mongoose.models.DepartmentSettings || mongoose.model('DepartmentSettings', departmentSettingsSchema);

