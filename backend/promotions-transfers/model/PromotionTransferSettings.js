const mongoose = require('mongoose');

/**
 * Approval workflow for promotion & transfer requests (aligned with resignation workflow shape).
 */
const PromotionTransferSettingsSchema = new mongoose.Schema(
  {
    workflow: {
      isEnabled: {
        type: Boolean,
        default: true,
      },
      steps: [
        {
          stepOrder: Number,
          stepName: String,
          approverRole: {
            type: String,
            enum: ['hod', 'hr', 'manager', 'super_admin', 'reporting_manager'],
          },
        },
      ],
      finalAuthority: {
        role: {
          type: String,
          enum: ['hr', 'super_admin', 'manager', 'reporting_manager'],
          default: 'hr',
        },
        anyHRCanApprove: {
          type: Boolean,
          default: true,
        },
      },
      allowHigherAuthorityToApproveLowerLevels: {
        type: Boolean,
        default: false,
      },
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true }
);

PromotionTransferSettingsSchema.index({ isActive: 1 });

PromotionTransferSettingsSchema.statics.getActiveSettings = async function () {
  return this.findOne({ isActive: true });
};

module.exports =
  mongoose.models.PromotionTransferSettings ||
  mongoose.model('PromotionTransferSettings', PromotionTransferSettingsSchema);
