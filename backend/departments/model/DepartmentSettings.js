const mongoose = require('mongoose');

/** Optional overrides for global LeavePolicySettings.earnedLeave (per department / division). */
const departmentEarnedLeaveOverrideSchema = new mongoose.Schema(
  {
    enabled: { type: Boolean, default: null },
    earningType: {
      type: String,
      enum: ['attendance_based', 'fixed'],
    },
    useAsPaidInPayroll: { type: Boolean, default: null },
    attendanceRules: {
      minDaysForFirstEL: { type: Number, default: null, min: 1, max: 31 },
      daysPerEL: { type: Number, default: null, min: 1, max: 31 },
      maxELPerMonth: { type: Number, default: null, min: 0, max: 10 },
      maxELPerYear: { type: Number, default: null, min: 0, max: 365 },
      attendanceRanges: [
        {
          minDays: { type: Number, required: true },
          maxDays: { type: Number, required: true },
          elEarned: { type: Number, required: true },
          description: { type: String, default: '', trim: true },
        },
      ],
    },
    fixedRules: {
      elPerMonth: { type: Number, default: null, min: 0, max: 10 },
      maxELPerYear: { type: Number, default: null, min: 0, max: 365 },
    },
  },
  { _id: false }
);

/**
 * Department Settings Model
 * Stores department-specific settings that override global defaults
 * Used for Leaves, Loans, Salary Advances, and Permissions
 */
const departmentSettingsSchema = new mongoose.Schema(
  {
    // Department reference (omit for division-wide defaults: { department: null, division: <id> })
    department: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Department',
      default: null,
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
      // Full/partial EL policy overrides (merged with global leave policy earnedLeave)
      earnedLeave: {
        type: departmentEarnedLeaveOverrideSchema,
        default: undefined,
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
        // Free allowed permissions per month (first N not counted for deduction)
        freeAllowedPerMonth: {
          type: Number,
          default: null,
          min: 0,
        },
        // Count threshold (e.g., every 3 above free = 1 unit)
        countThreshold: {
          type: Number,
          default: null,
          min: 1,
        },
        // Deduction type: half_day, full_day, custom_days, custom_amount
        deductionType: {
          type: String,
          enum: ['half_day', 'full_day', 'custom_days', 'custom_amount', null],
          default: null,
        },
        // Custom days per unit (only if deductionType is 'custom_days')
        deductionDays: {
          type: Number,
          default: null,
          min: 0,
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
      /** Nearest N minutes for OT duration (0 = inherit global; global default 15) */
      roundingMinutes: {
        type: Number,
        default: null,
        min: 0,
        max: 60,
      },
      recognitionMode: {
        type: String,
        default: null,
        trim: true,
      },
      thresholdHours: {
        type: Number,
        default: null,
        min: 0,
      },
      roundUpIfFractionMinutesGte: {
        type: Number,
        default: null,
        min: 0,
        max: 59,
      },
      otHourRanges: {
        type: [
          {
            minMinutes: { type: Number, required: true, min: 0 },
            maxMinutes: { type: Number, required: true, min: 0 },
            creditedMinutes: { type: Number, required: true, min: 0 },
            label: { type: String, default: '', trim: true },
          },
        ],
        default: undefined,
      },
      autoCreateOtRequest: {
        type: Boolean,
        default: null,
      },
      defaultWorkingHoursPerDay: {
        type: Number,
        default: null,
        min: 0.5,
        max: 24,
      },
      /** Department default x (hours per day) when employee group has no override */
      workingHoursPerDay: {
        type: Number,
        default: null,
        min: 0.5,
        max: 24,
      },
      /** Per employee-group x */
      groupWorkingHours: {
        type: [
          {
            employeeGroupId: {
              type: mongoose.Schema.Types.ObjectId,
              ref: 'EmployeeGroup',
              required: true,
            },
            hoursPerDay: {
              type: Number,
              required: true,
              min: 0.5,
              max: 24,
            },
          },
        ],
        default: undefined,
      },
      otMultiplier: {
        type: Number,
        default: null,
        min: 0,
      },
      /** null = inherit global OvertimeSettings */
      allowBackdated: {
        type: Boolean,
        default: null,
      },
      maxBackdatedDays: {
        type: Number,
        default: null,
        min: 0,
      },
      allowFutureDated: {
        type: Boolean,
        default: null,
      },
      maxAdvanceDays: {
        type: Number,
        default: null,
        min: 0,
      },
      /** Full override of global OT workflow when set; null/omit = inherit global */
      workflow: {
        type: mongoose.Schema.Types.Mixed,
        default: undefined,
      },
    },

    // Attendance Deduction Rules (Combined Late-in + Early-out)
    attendance: {
      deductionRules: {
        // Free allowed late-ins + early-outs per month (first N not counted)
        freeAllowedPerMonth: {
          type: Number,
          default: null,
          min: 0,
        },
        // Combined count threshold (every N above free = 1 unit)
        combinedCountThreshold: {
          type: Number,
          default: null,
          min: 1,
        },
        // Deduction type: half_day, full_day, custom_days, custom_amount
        deductionType: {
          type: String,
          enum: ['half_day', 'full_day', 'custom_days', 'custom_amount', null],
          default: null,
        },
        // Custom days per unit (only if deductionType is 'custom_days')
        deductionDays: {
          type: Number,
          default: null,
          min: 0,
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

departmentSettingsSchema.pre('validate', function validateDivisionWide(next) {
  if (!this.department && !this.division) {
    next(new Error('DepartmentSettings: either department or division must be set'));
  } else {
    next();
  }
});

// Indexes
departmentSettingsSchema.index({ department: 1, division: 1 }, { unique: true });
departmentSettingsSchema.index({ division: 1 });

/**
 * Merge EL overrides from department default row (division null) with a division-specific row.
 * Division wins on scalars when set. attendanceRanges: non-empty division list wins; empty array
 * means "no dept ranges — use global" in resolveEffectiveEarnedLeave; missing/undefined ranges on
 * the division row inherit the default row's ranges (Superadmin "All divisions" applies to each division).
 */
function mergeEarnedLeaveForRead(baseEarnedLeave, divisionEarnedLeave) {
  if (!baseEarnedLeave && !divisionEarnedLeave) return undefined;
  if (!divisionEarnedLeave) return baseEarnedLeave;
  if (!baseEarnedLeave) return divisionEarnedLeave;

  const b = baseEarnedLeave;
  const d = divisionEarnedLeave;
  const bAr = b.attendanceRules || {};
  const dAr = d.attendanceRules || {};

  const pickOverride = (divVal, baseVal) => {
    if (divVal !== undefined && divVal !== null) return divVal;
    if (baseVal !== undefined && baseVal !== null) return baseVal;
    return undefined;
  };

  const divRangesRaw = dAr.attendanceRanges;
  const baseRangesRaw = bAr.attendanceRanges;
  const divHasRanges = Array.isArray(divRangesRaw) && divRangesRaw.length > 0;
  const divExplicitEmpty = Array.isArray(divRangesRaw) && divRangesRaw.length === 0;
  const baseHasRanges = Array.isArray(baseRangesRaw) && baseRangesRaw.length > 0;

  let attendanceRanges;
  if (divHasRanges) attendanceRanges = [...divRangesRaw];
  else if (divExplicitEmpty) attendanceRanges = [];
  else if (baseHasRanges) attendanceRanges = [...baseRangesRaw];
  else attendanceRanges = [];

  return {
    enabled: pickOverride(d.enabled, b.enabled),
    earningType: pickOverride(d.earningType, b.earningType),
    useAsPaidInPayroll: pickOverride(d.useAsPaidInPayroll, b.useAsPaidInPayroll),
    attendanceRules: {
      minDaysForFirstEL: pickOverride(dAr.minDaysForFirstEL, bAr.minDaysForFirstEL),
      daysPerEL: pickOverride(dAr.daysPerEL, bAr.daysPerEL),
      maxELPerMonth: pickOverride(dAr.maxELPerMonth, bAr.maxELPerMonth),
      maxELPerYear: pickOverride(dAr.maxELPerYear, bAr.maxELPerYear),
      considerPresentDays: pickOverride(dAr.considerPresentDays, bAr.considerPresentDays),
      considerHolidays: pickOverride(dAr.considerHolidays, bAr.considerHolidays),
      attendanceRanges,
    },
    fixedRules: {
      ...(b.fixedRules || {}),
      ...(d.fixedRules || {}),
    },
  };
}

function toPlainEarnedLeave(el) {
  if (el == null) return undefined;
  return typeof el.toObject === 'function' ? el.toObject() : el;
}

function toPlainDoc(doc) {
  if (!doc) return null;
  return typeof doc.toObject === 'function' ? doc.toObject() : { ...doc };
}

function mergeObjectPreferSecond(base, incoming) {
  if (!incoming) return base ? { ...base } : null;
  if (!base) return { ...incoming };
  const out = { ...base };
  for (const k of Object.keys(incoming)) {
    const iv = incoming[k];
    if (iv === undefined) continue;
    const bv = out[k];
    if (iv !== null && typeof iv === 'object' && !Array.isArray(iv) && !(iv instanceof Date)) {
      out[k] = mergeObjectPreferSecond(bv && typeof bv === 'object' && !Array.isArray(bv) ? bv : {}, iv);
    } else {
      out[k] = iv;
    }
  }
  return out;
}

/**
 * Merge leaves.* with precedence: department+division row > division-wide > department default.
 * earnedLeave: merge EL(deptBase, divWide) then merge EL(result, deptDiv) — each step second wins.
 */
function mergeLeavesThreeLayers(deptBaseLeaves, divWideLeaves, deptDivLeaves) {
  if (!deptBaseLeaves && !divWideLeaves && !deptDivLeaves) return undefined;
  const b = { ...(deptBaseLeaves || {}) };
  const w = { ...(divWideLeaves || {}) };
  const d = { ...(deptDivLeaves || {}) };
  const bEl = b.earnedLeave;
  const wEl = w.earnedLeave;
  const dEl = d.earnedLeave;
  delete b.earnedLeave;
  delete w.earnedLeave;
  delete d.earnedLeave;
  const merged = mergeObjectPreferSecond(mergeObjectPreferSecond(b, w), d);
  if (bEl || wEl || dEl) {
    const step1 = mergeEarnedLeaveForRead(toPlainEarnedLeave(bEl), toPlainEarnedLeave(wEl));
    merged.earnedLeave = mergeEarnedLeaveForRead(step1, toPlainEarnedLeave(dEl));
  }
  return merged;
}

/**
 * Effective departmental settings for (department, division):
 * 1) Department default row (department, division null)
 * 2) Division-wide row (department null, division) — used where no division-specific dept override
 * 3) Department+division row (department, division) — wins over both when set
 */
function mergeSettingsThreeLayers(deptBasePlain, divWidePlain, deptDivPlain) {
  const keys = ['leaves', 'loans', 'salaryAdvance', 'permissions', 'ot', 'attendance', 'payroll'];
  const out = {};
  for (const k of keys) {
    if (k === 'leaves') {
      const ml = mergeLeavesThreeLayers(deptBasePlain?.leaves, divWidePlain?.leaves, deptDivPlain?.leaves);
      if (ml && Object.keys(ml).length) out.leaves = ml;
    } else {
      const merged = mergeObjectPreferSecond(
        mergeObjectPreferSecond(deptBasePlain?.[k] || {}, divWidePlain?.[k] || {}),
        deptDivPlain?.[k] || {}
      );
      if (merged && Object.keys(merged).length) out[k] = merged;
    }
  }
  if (deptDivPlain?.department != null) out.department = deptDivPlain.department;
  else if (deptBasePlain?.department != null) out.department = deptBasePlain.department;
  if (deptDivPlain?.division != null) out.division = deptDivPlain.division;
  else if (divWidePlain?.division != null) out.division = divWidePlain.division;
  return Object.keys(out).length ? out : null;
}

// Static method to get effective settings for a department and division (three-layer merge when division is set)
departmentSettingsSchema.statics.getByDeptAndDiv = async function (departmentId, divisionId = null) {
  const divId = divisionId || null;

  let divisionWidePlain = null;
  if (divId) {
    const dw = await this.findOne({ department: null, division: divId });
    if (dw) divisionWidePlain = toPlainDoc(dw);
  }

  if (!departmentId) {
    return divisionWidePlain || null;
  }

  const deptBaseRow = await this.findOne({ department: departmentId, division: null });
  const deptBasePlain = deptBaseRow ? toPlainDoc(deptBaseRow) : null;

  if (!divId) {
    return deptBasePlain;
  }

  const deptDivRow = await this.findOne({ department: departmentId, division: divId });
  const deptDivPlain = deptDivRow ? toPlainDoc(deptDivRow) : null;

  if (!deptBasePlain && !divisionWidePlain && !deptDivPlain) return null;

  return mergeSettingsThreeLayers(deptBasePlain, divisionWidePlain, deptDivPlain);
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

/** Division-wide row: applies to every department in that division until a department row overrides. */
departmentSettingsSchema.statics.getOrCreateDivisionWide = async function (divisionId) {
  if (!divisionId) return null;
  let settings = await this.findOne({ department: null, division: divisionId });
  if (!settings) {
    settings = new this({ department: null, division: divisionId });
    await settings.save();
  }
  return settings;
};

module.exports = mongoose.models.DepartmentSettings || mongoose.model('DepartmentSettings', departmentSettingsSchema);

