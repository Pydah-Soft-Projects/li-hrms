const mongoose = require('mongoose');

const settingsAuditSchema = new mongoose.Schema(
  {
    settingKey: {
      type: String,
      required: true,
      trim: true,
      index: true,
    },
    category: {
      type: String,
      trim: true,
      default: 'general',
      index: true,
    },
    action: {
      type: String,
      enum: ['create', 'update', 'delete', 'reset', 'initialize'],
      default: 'update',
      index: true,
    },
    previousValue: {
      type: mongoose.Schema.Types.Mixed,
      default: null,
    },
    newValue: {
      type: mongoose.Schema.Types.Mixed,
      default: null,
    },
    performedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
      index: true,
    },
    performedByName: {
      type: String,
      trim: true,
      default: 'System',
    },
    performedByEmail: {
      type: String,
      trim: true,
      default: null,
    },
    performedByRole: {
      type: String,
      trim: true,
      default: null,
    },
    description: {
      type: String,
      trim: true,
      default: null,
    },
    details: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
    ipAddress: {
      type: String,
      trim: true,
      default: null,
    },
    userAgent: {
      type: String,
      trim: true,
      default: null,
    },
    timestamp: {
      type: Date,
      default: Date.now,
      index: true,
    },
  },
  {
    timestamps: true,
  }
);

settingsAuditSchema.index({ settingKey: 1, timestamp: -1 });
settingsAuditSchema.index({ category: 1, timestamp: -1 });
settingsAuditSchema.index({ performedBy: 1, timestamp: -1 });

module.exports = mongoose.models.SettingsAudit || mongoose.model('SettingsAudit', settingsAuditSchema);
