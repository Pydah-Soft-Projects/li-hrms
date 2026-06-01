const mongoose = require('mongoose');

const statusHistorySchema = new mongoose.Schema(
  {
    changedAt: { type: Date, default: Date.now },
    changedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    previousStatus: String,
    newStatus: String,
    reason: String,
    comments: String,
  },
  { _id: false }
);

const paysheetAdjustmentRequestSchema = new mongoose.Schema(
  {
    employeeId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Employee',
      required: true,
      index: true,
    },
    payrollRecordId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'PayrollRecord',
      required: true,
      index: true,
    },
    payrollBatchId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'PayrollBatch',
      default: null,
      index: true,
    },
    month: { type: String, required: true, index: true },
    columnHeader: { type: String, required: true, trim: true },
    fieldPath: { type: String, required: true, trim: true },
    /** Amount shown on paysheet / used as cap for proposed value. */
    originalValue: { type: Number, required: true, min: 0 },
    /** Value on PayrollRecord at fieldPath when request was created (for stale checks on approve). */
    recordValueAtRequest: { type: Number, default: null },
    proposedValue: { type: Number, required: true, min: 0 },
    reason: { type: String, required: true, trim: true },
    status: {
      type: String,
      enum: ['pending', 'approved', 'rejected', 'cancelled'],
      default: 'pending',
      index: true,
    },
    requestedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    reviewedAt: { type: Date, default: null },
    reviewComments: { type: String, default: '' },
    appliedAt: { type: Date, default: null },
    statusHistory: [statusHistorySchema],
  },
  { timestamps: true }
);

paysheetAdjustmentRequestSchema.index(
  { payrollRecordId: 1, fieldPath: 1, status: 1 },
  { partialFilterExpression: { status: 'pending' } }
);

module.exports =
  mongoose.models.PaysheetAdjustmentRequest ||
  mongoose.model('PaysheetAdjustmentRequest', paysheetAdjustmentRequestSchema);
