const mongoose = require('mongoose');

const loginAuditSchema = new mongoose.Schema(
  {
    identifier: {
      type: String,
      default: '',
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      default: null,
    },
    userType: {
      type: String,
      enum: ['user', 'employee', null],
      default: null,
    },
    success: {
      type: Boolean,
      required: true,
    },
    reason: {
      type: String,
      default: '',
    },
    ip: {
      type: String,
      default: '',
    },
    userAgent: {
      type: String,
      default: '',
    },
    deviceId: {
      type: String,
      default: '',
    },
  },
  { timestamps: true }
);

loginAuditSchema.index({ createdAt: -1 });
loginAuditSchema.index({ userId: 1, createdAt: -1 });

module.exports = mongoose.models.LoginAudit || mongoose.model('LoginAudit', loginAuditSchema);
