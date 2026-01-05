const mongoose = require('mongoose');

const bonusRecordSchema = new mongoose.Schema(
  {
    batchId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'BonusBatch',
      required: true,
    },
    employeeId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Employee',
      required: true,
    },
    emp_no: {
      type: String,
      required: true,
    },
    month: {
      type: String, // YYYY-MM
      required: true,
    },

    // Calculation Bases
    salaryComponentValue: {
      type: Number,
      default: 0, // value of gross/basic used
    },
    attendancePercentage: {
      type: Number,
      default: 0,
    },
    attendanceDays: {
      type: Number, // Present/Payable Days
      default: 0,
    },
    totalMonthDays: {
      type: Number,
      default: 0,
    },

    // Applied Role/Tier
    appliedTier: {
      minPercentage: Number,
      maxPercentage: Number,
      bonusPercentage: Number,
    },

    // Result
    calculatedBonus: {
      type: Number,
      required: true,
      default: 0,
    },
    finalBonus: {
      type: Number, // Allows manual override before freeze
      required: true,
      default: 0,
    },

    isManualOverride: {
      type: Boolean,
      default: false,
    },
    remarks: String,
  },
  {
    timestamps: true,
  }
);

bonusRecordSchema.index({ batchId: 1, employeeId: 1 }, { unique: true });
bonusRecordSchema.index({ employeeId: 1, month: 1 });

module.exports = mongoose.models.BonusRecord || mongoose.model('BonusRecord', bonusRecordSchema);
