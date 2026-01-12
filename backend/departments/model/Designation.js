const mongoose = require('mongoose');

const designationSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Designation name is required'],
      trim: true,
    },
    code: {
      type: String,
      trim: true,
      uppercase: true,
    },
    // Optional department reference (for backward compatibility)
    // New independent designations will have department: null
    // Departments track designations via their 'designations' array
    department: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Department',
      required: false,
      default: null,
    },
    description: {
      type: String,
      trim: true,
    },
    // Designation-specific deduction rules
    deductionRules: [
      {
        trigger: {
          type: String,
          enum: ['late_in', 'early_out', 'permission', 'absent'],
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
    // Paid leaves count (number only)
    paidLeaves: {
      type: Number,
      default: 0,
    },
    // Optional shift assignments for this designation (overrides department shifts)
    shifts: [{
      shiftId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Shift',
      },
      gender: {
        type: String,
        enum: ['Male', 'Female', 'Other', 'All'],
        default: 'All',
      },
    }],
    // Division-specific default shifts (across all departments in that division)
    divisionDefaults: [
      {
        division: {
          type: mongoose.Schema.Types.ObjectId,
          ref: 'Division',
          required: true,
        },
        shifts: [{
          shiftId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Shift',
          },
          gender: {
            type: String,
            enum: ['Male', 'Female', 'Other', 'All'],
            default: 'All',
          },
        }],
      },
    ],
    // Department-specific shift overrides (contextual to a division)
    departmentShifts: [
      {
        division: {
          type: mongoose.Schema.Types.ObjectId,
          ref: 'Division',
          required: false, // For backward compatibility, true for new ones
        },
        department: {
          type: mongoose.Schema.Types.ObjectId,
          ref: 'Department',
          required: true,
        },
        shifts: [{
          shiftId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Shift',
          },
          gender: {
            type: String,
            enum: ['Male', 'Female', 'Other', 'All'],
            default: 'All',
          },
        }],
      },
    ],
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
// Global unique index on name (designations are now independent entities)
designationSchema.index({ name: 1 }, { unique: true });
// Department index kept for backward compatibility queries
designationSchema.index({ department: 1 });
designationSchema.index({ isActive: 1 });

// Export model (check if already exists to avoid overwrite errors)
module.exports = mongoose.models.Designation || mongoose.model('Designation', designationSchema);

