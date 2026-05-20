const mongoose = require('mongoose');

const holidayHistorySchema = new mongoose.Schema(
  {
    holidayId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Holiday',
      required: true,
      index: true,
    },
    event: {
      type: String,
      required: true,
      trim: true,
      index: true,
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
      default: null,
    },
    performedByRole: {
      type: String,
      trim: true,
      default: null,
    },
    details: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
    comments: {
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
    timestamps: {
      createdAt: 'created_at',
      updatedAt: 'updated_at',
    },
  }
);

holidayHistorySchema.index({ holidayId: 1, timestamp: -1 });

module.exports = mongoose.models.HolidayHistory || mongoose.model('HolidayHistory', holidayHistorySchema);

