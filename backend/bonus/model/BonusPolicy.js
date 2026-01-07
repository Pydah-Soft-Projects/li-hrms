const mongoose = require('mongoose');

const bonusPolicySchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Policy name is required'],
      trim: true,
      unique: true,
    },
    description: {
      type: String,
      trim: true,
    },
    policyType: {
      type: String,
      enum: ['attendance_regular', 'payroll_based'],
      required: [true, 'Policy type is required'],
      default: 'attendance_regular',
    },
    // Which salary component to base the bonus calculation on
    salaryComponent: {
      type: String,
      enum: ['gross_salary', 'fixed_amount'], // SIMPLIFIED ENUM
      default: 'gross_salary',
      required: true,
    },
    // If salaryComponent is 'fixed_amount', this value is used as the base
    fixedBonusAmount: {
      type: Number,
      default: 0,
    },
    // If salaryComponent is 'gross_salary', multiply by this factor (e.g., 2x Gross Salary)
    grossSalaryMultiplier: {
      type: Number,
      default: 1,
    },
    // Filter criteria: Apply this policy automatically to specific groups (optional)
    filters: {
      divisions: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Division' }],
      departments: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Department' }],
      designations: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Designation' }],
      employmentTypes: [String], // e.g., 'Permanent', 'Contract'
    },
    // Dynamic Tiers
    // Logic: If attendance % is between min and max, apply bonus % of salaryComponent
    tiers: [
      {
        minPercentage: { type: Number, required: true }, // e.g., 75
        maxPercentage: { type: Number, required: true }, // e.g., 100
        bonusPercentage: { type: Number, required: true }, // e.g., 10 (means 10% of base)
      }
    ],
    isActive: {
      type: Boolean,
      default: true,
    },
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

// Helper to find matching tier
bonusPolicySchema.methods.getBonusForAttendance = function (attendancePercentage) {
  // Sort tiers by minPercentage descending to match highest range first if overlapping, 
  // but logically ranges shouldn't overlap.
  const matchedTier = this.tiers.find(
    tier => attendancePercentage >= tier.minPercentage && attendancePercentage <= tier.maxPercentage
  );
  return matchedTier || null;
};

module.exports = mongoose.models.BonusPolicy || mongoose.model('BonusPolicy', bonusPolicySchema);
