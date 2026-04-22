const mongoose = require('mongoose');

/**
 * Per-division overrides for approval workflows only.
 * Keys omitted or null inherit from global settings (LeaveSettings, LoanSettings, etc.).
 * Department-level documents do not carry workflow — division + global only.
 */
const divisionWorkflowSettingsSchema = new mongoose.Schema(
  {
    division: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Division',
      required: true,
    },
    /**
     * Optional workflow objects keyed by module. Same shape as the corresponding global `workflow` field.
     * Set a key to null in PUT body to clear override (inherit global).
     */
    workflows: {
      leave: { type: mongoose.Schema.Types.Mixed, default: undefined },
      od: { type: mongoose.Schema.Types.Mixed, default: undefined },
      ccl: { type: mongoose.Schema.Types.Mixed, default: undefined },
      loan: { type: mongoose.Schema.Types.Mixed, default: undefined },
      salary_advance: { type: mongoose.Schema.Types.Mixed, default: undefined },
      permission: { type: mongoose.Schema.Types.Mixed, default: undefined },
      ot: { type: mongoose.Schema.Types.Mixed, default: undefined },
      /** Same shape as `PromotionTransferSettings.workflow` (global HR settings). */
      promotions_transfers: { type: mongoose.Schema.Types.Mixed, default: undefined },
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
  { timestamps: true }
);

divisionWorkflowSettingsSchema.index({ division: 1 }, { unique: true });

module.exports =
  mongoose.models.DivisionWorkflowSettings ||
  mongoose.model('DivisionWorkflowSettings', divisionWorkflowSettingsSchema);
