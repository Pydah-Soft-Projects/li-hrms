const mongoose = require('mongoose');

/**
 * Allowance Deduction Master Model
 * Stores global allowance/deduction definitions with department-specific overrides
 */
const allowanceDeductionMasterSchema = new mongoose.Schema(
  {
    // Basic Information
    name: {
      type: String,
      required: [true, 'Name is required'],
      unique: true,
      trim: true,
    },
    category: {
      type: String,
      enum: ['allowance', 'deduction'],
      required: [true, 'Category is required'],
    },
    description: {
      type: String,
      trim: true,
      default: null,
    },
    isActive: {
      type: Boolean,
      default: true,
    },

    // Global Default Rule (applied when no department override exists)
    globalRule: {
      type: {
        type: String,
        enum: ['fixed', 'percentage'],
        required: [true, 'Type is required'],
      },
      // If type = 'fixed'
      amount: {
        type: Number,
        default: null,
        min: 0,
      },
      // If type = 'percentage'
      percentage: {
        type: Number,
        default: null,
        min: 0,
        max: 100,
      },
      // If type = 'percentage', this is required
      percentageBase: {
        type: String,
        enum: ['basic', 'gross'],
        default: null,
      },
      // Optional constraints
      minAmount: {
        type: Number,
        default: null,
        min: 0,
      },
      maxAmount: {
        type: Number,
        default: null,
        min: 0,
      },
      // Prorate based on present days (only for fixed type)
      basedOnPresentDays: {
        type: Boolean,
        default: false,
      },
    },

    // Department-Specific Overrides (can be division-department specific)
    departmentRules: [
      {
        // Optional: If specified, this rule applies only to this division-department combination
        // If not specified, this rule applies to all divisions within the department
        divisionId: {
          type: mongoose.Schema.Types.ObjectId,
          ref: 'Division',
          default: null,
        },
        departmentId: {
          type: mongoose.Schema.Types.ObjectId,
          ref: 'Department',
          required: true,
        },
        type: {
          type: String,
          enum: ['fixed', 'percentage'],
          required: true,
        },
        // If type = 'fixed'
        amount: {
          type: Number,
          default: null,
          min: 0,
        },
        // If type = 'percentage'
        percentage: {
          type: Number,
          default: null,
          min: 0,
          max: 100,
        },
        // If type = 'percentage', this is required
        percentageBase: {
          type: String,
          enum: ['basic', 'gross'],
          default: null,
        },
        // Optional constraints
        minAmount: {
          type: Number,
          default: null,
          min: 0,
        },
        maxAmount: {
          type: Number,
          default: null,
          min: 0,
        },
        // Prorate based on present days (only for fixed type)
        basedOnPresentDays: {
          type: Boolean,
          default: false,
        },
      },
    ],

    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
    updatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
  },
  {
    timestamps: true,
  }
);

// Validation: Global Rule
allowanceDeductionMasterSchema.pre('validate', async function () {
  // Skip validation if globalRule is not set (will be validated in controller)
  if (!this.globalRule || !this.globalRule.type) {
    return;
  }

  const globalRule = this.globalRule;

  if (globalRule.type === 'fixed') {
    if (globalRule.amount === null || globalRule.amount === undefined) {
      throw new Error('Amount is required when type is fixed');
    }
    if (globalRule.percentage !== null && globalRule.percentage !== undefined) {
      throw new Error('Percentage should be null when type is fixed');
    }
    if (globalRule.percentageBase !== null && globalRule.percentageBase !== undefined) {
      throw new Error('Percentage base should be null when type is fixed');
    }
  } else if (globalRule.type === 'percentage') {
    if (globalRule.percentage === null || globalRule.percentage === undefined) {
      throw new Error('Percentage is required when type is percentage');
    }
    if (!globalRule.percentageBase) {
      throw new Error('Percentage base is required when type is percentage');
    }
    if (globalRule.amount !== null && globalRule.amount !== undefined) {
      throw new Error('Amount should be null when type is percentage');
    }
  }

  // Validate min/max
  if (globalRule.minAmount !== null && globalRule.maxAmount !== null) {
    if (globalRule.minAmount > globalRule.maxAmount) {
      throw new Error('Min amount cannot be greater than max amount');
    }
  }
});

// Validation: Department Rules
allowanceDeductionMasterSchema.pre('validate', async function () {
  // Skip if no department rules
  if (!this.departmentRules || this.departmentRules.length === 0) {
    return;
  }

  // Check for duplicate division-department combinations
  const combinations = this.departmentRules.map((rule) => {
    const divId = rule.divisionId ? rule.divisionId.toString() : 'null';
    const deptId = rule.departmentId.toString();
    return `${divId}:${deptId}`;
  });
  const uniqueCombinations = [...new Set(combinations)];
  if (combinations.length !== uniqueCombinations.length) {
    throw new Error('Duplicate division-department combinations found in department rules');
  }

  // Validate each department rule
  for (const rule of this.departmentRules) {
    if (rule.type === 'fixed') {
      if (rule.amount === null || rule.amount === undefined) {
        throw new Error(`Amount is required for department rule when type is fixed`);
      }
      if (rule.percentage !== null && rule.percentage !== undefined) {
        throw new Error(`Percentage should be null for department rule when type is fixed`);
      }
      if (rule.percentageBase !== null && rule.percentageBase !== undefined) {
        throw new Error(`Percentage base should be null for department rule when type is fixed`);
      }
    } else if (rule.type === 'percentage') {
      if (rule.percentage === null || rule.percentage === undefined) {
        throw new Error(`Percentage is required for department rule when type is percentage`);
      }
      if (!rule.percentageBase) {
        throw new Error(`Percentage base is required for department rule when type is percentage`);
      }
      if (rule.amount !== null && rule.amount !== undefined) {
        throw new Error(`Amount should be null for department rule when type is percentage`);
      }
    }

    // Validate min/max
    if (rule.minAmount !== null && rule.maxAmount !== null) {
      if (rule.minAmount > rule.maxAmount) {
        throw new Error(`Min amount cannot be greater than max amount for department rule`);
      }
    }
  }
});

// Indexes
allowanceDeductionMasterSchema.index({ name: 1 }, { unique: true });
allowanceDeductionMasterSchema.index({ category: 1 });
allowanceDeductionMasterSchema.index({ isActive: 1 });
allowanceDeductionMasterSchema.index({ 'departmentRules.departmentId': 1 });
allowanceDeductionMasterSchema.index({ 'departmentRules.divisionId': 1, 'departmentRules.departmentId': 1 });

// Static method to get resolved rule for a department (with optional division support)
allowanceDeductionMasterSchema.statics.getResolvedRule = async function (masterId, departmentId, divisionId = null) {
  const master = await this.findById(masterId);
  if (!master) {
    return null;
  }

  // Priority 1: Check for division-department specific rule
  if (divisionId && master.departmentRules && master.departmentRules.length > 0) {
    const divDeptRule = master.departmentRules.find(
      (rule) =>
        rule.divisionId &&
        rule.divisionId.toString() === divisionId.toString() &&
        rule.departmentId.toString() === departmentId.toString()
    );
    if (divDeptRule) {
      return divDeptRule;
    }
  }

  // Priority 2: Check for department-only rule (backward compatible)
  if (departmentId && master.departmentRules && master.departmentRules.length > 0) {
    const deptOnlyRule = master.departmentRules.find(
      (rule) =>
        !rule.divisionId && // No division specified
        rule.departmentId.toString() === departmentId.toString()
    );
    if (deptOnlyRule) {
      return deptOnlyRule;
    }
  }

  // Priority 3: Return global rule
  return master.globalRule;
};

module.exports = mongoose.models.AllowanceDeductionMaster || mongoose.model('AllowanceDeductionMaster', allowanceDeductionMasterSchema);

