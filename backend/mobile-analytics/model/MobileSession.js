const mongoose = require('mongoose');

/**
 * MobileSession — one document per mobile app open → close cycle.
 *
 * Created when the app calls POST /api/mobile-analytics/session/start
 * Updated when the app calls POST /api/mobile-analytics/session/end
 */
const mobileSessionSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      index: true,
    },
    userType: {
      type: String,
      enum: ['user', 'employee'],
      default: 'employee',
    },
    emp_no: {
      type: String,
      default: '',
    },
    userName: {
      type: String,
      default: '',
    },
    // ISO date string YYYY-MM-DD of session start — used for day-wise grouping
    date: {
      type: String,
      required: true,
      index: true,
    },
    sessionStart: {
      type: Date,
      required: true,
    },
    sessionEnd: {
      type: Date,
      default: null,
    },
    // Duration in seconds (populated when session ends)
    durationSeconds: {
      type: Number,
      default: null,
    },
    deviceId: {
      type: String,
      default: 'unknown',
    },
    appVersion: {
      type: String,
      default: '',
    },
    platform: {
      type: String,
      default: 'mobile',
    },
  },
  { timestamps: true }
);

// Compound index for fast day-wise user queries
mobileSessionSchema.index({ date: 1, userId: 1 });
mobileSessionSchema.index({ userId: 1, sessionStart: -1 });

module.exports =
  mongoose.models.MobileSession ||
  mongoose.model('MobileSession', mobileSessionSchema);
