const mongoose = require('mongoose');

const bonusBatchSchema = new mongoose.Schema(
  {
    batchName: {
      type: String,
      required: true,
      unique: true,
    },
    startMonth: {
      type: String, // YYYY-MM
      required: true,
    },
    endMonth: {
      type: String, // YYYY-MM
      required: true,
    },
    // Year will typically refer to the start year, or we can keep it for sorting
    year: {
      type: Number,
      required: true,
    },
    // Scope of the batch
    division: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Division',
    },
    department: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Department',
    },
    policy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'BonusPolicy',
      required: true,
    },

    // Status Flow: Pending -> Approved -> Frozen
    status: {
      type: String,
      enum: ['pending', 'approved', 'frozen'],
      default: 'pending',
    },

    // Aggregates
    totalEmployees: {
      type: Number,
      default: 0,
    },
    totalBonusAmount: {
      type: Number,
      default: 0,
    },

    // Recalculation Request
    recalculationRequest: {
      isRequested: { type: Boolean, default: false },
      requestedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
      requestedAt: { type: Date },
      reason: { type: String },
      status: { type: String, enum: ['pending', 'approved', 'rejected'], default: 'pending' },
    },

    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    approvedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    frozenBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  {
    timestamps: true,
  }
);

bonusBatchSchema.index({ month: 1, division: 1, department: 1, policy: 1 });

module.exports = mongoose.models.BonusBatch || mongoose.model('BonusBatch', bonusBatchSchema);
