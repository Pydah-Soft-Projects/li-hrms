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

    // Department-Specific Overrides
    departmentRules: [
      {
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
allowanceDeductionMasterSchema.pre('validate', function (next) {
  // Ensure next is a function
  if (typeof next !== 'function') {
    return;
  }

  // Skip validation if globalRule is not set (will be validated in controller)
  if (!this.globalRule || !this.globalRule.type) {
    return next();
  }

  const globalRule = this.globalRule;

  if (globalRule.type === 'fixed') {
    if (globalRule.amount === null || globalRule.amount === undefined) {
      return next(new Error('Amount is required when type is fixed'));
    }
    if (globalRule.percentage !== null && globalRule.percentage !== undefined) {
      return next(new Error('Percentage should be null when type is fixed'));
    }
    if (globalRule.percentageBase !== null && globalRule.percentageBase !== undefined) {
      return next(new Error('Percentage base should be null when type is fixed'));
    }
  } else if (globalRule.type === 'percentage') {
    if (globalRule.percentage === null || globalRule.percentage === undefined) {
      return next(new Error('Percentage is required when type is percentage'));
    }
    if (!globalRule.percentageBase) {
      return next(new Error('Percentage base is required when type is percentage'));
    }
    if (globalRule.amount !== null && globalRule.amount !== undefined) {
      return next(new Error('Amount should be null when type is percentage'));
    }
  }

  // Validate min/max
  if (globalRule.minAmount !== null && globalRule.maxAmount !== null) {
    if (globalRule.minAmount > globalRule.maxAmount) {
      return next(new Error('Min amount cannot be greater than max amount'));
    }
  }

  return next();
});

// Validation: Department Rules
allowanceDeductionMasterSchema.pre('validate', function (next) {
  // Ensure next is a function
  if (typeof next !== 'function') {
    return;
  }

  // Skip if no department rules
  if (!this.departmentRules || this.departmentRules.length === 0) {
    return next();
  }

  // Check for duplicate department IDs
  const departmentIds = this.departmentRules.map((rule) => rule.departmentId.toString());
  const uniqueIds = [...new Set(departmentIds)];
  if (departmentIds.length !== uniqueIds.length) {
    return next(new Error('Duplicate department IDs found in department rules'));
  }

  // Validate each department rule
  for (const rule of this.departmentRules) {
    if (rule.type === 'fixed') {
      if (rule.amount === null || rule.amount === undefined) {
        return next(new Error(`Amount is required for department rule when type is fixed`));
      }
      if (rule.percentage !== null && rule.percentage !== undefined) {
        return next(new Error(`Percentage should be null for department rule when type is fixed`));
      }
      if (rule.percentageBase !== null && rule.percentageBase !== undefined) {
        return next(new Error(`Percentage base should be null for department rule when type is fixed`));
      }
    } else if (rule.type === 'percentage') {
      if (rule.percentage === null || rule.percentage === undefined) {
        return next(new Error(`Percentage is required for department rule when type is percentage`));
      }
      if (!rule.percentageBase) {
        return next(new Error(`Percentage base is required for department rule when type is percentage`));
      }
      if (rule.amount !== null && rule.amount !== undefined) {
        return next(new Error(`Amount should be null for department rule when type is percentage`));
      }
    }

    // Validate min/max
    if (rule.minAmount !== null && rule.maxAmount !== null) {
      if (rule.minAmount > rule.maxAmount) {
        return next(new Error(`Min amount cannot be greater than max amount for department rule`));
      }
    }
  }

  return next();
});

// Indexes
allowanceDeductionMasterSchema.index({ name: 1 }, { unique: true });
allowanceDeductionMasterSchema.index({ category: 1 });
allowanceDeductionMasterSchema.index({ isActive: 1 });
allowanceDeductionMasterSchema.index({ 'departmentRules.departmentId': 1 });

// Static method to get resolved rule for a department
allowanceDeductionMasterSchema.statics.getResolvedRule = async function (masterId, departmentId) {
  const master = await this.findById(masterId);
  if (!master) {
    return null;
  }

  // Check for department override
  const deptRule = master.departmentRules.find(
    (rule) => rule.departmentId.toString() === departmentId.toString()
  );

  // Return department rule if exists, else global rule
  return deptRule || master.globalRule;
};

module.exports = mongoose.model('AllowanceDeductionMaster', allowanceDeductionMasterSchema);

