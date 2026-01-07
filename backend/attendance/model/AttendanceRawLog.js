/**
 * Attendance Raw Log Model
 * Stores individual punch records from biometric devices or Excel uploads
 */

const mongoose = require('mongoose');

const attendanceRawLogSchema = new mongoose.Schema(
  {
    employeeNumber: {
      type: String,
      required: [true, 'Employee number is required'],
      trim: true,
      uppercase: true,
      index: true,
    },
    timestamp: {
      type: Date,
      required: [true, 'Timestamp is required'],
      index: true,
    },
    type: {
      type: String,
      enum: ['IN', 'OUT', null],
      default: null,
    },
    subType: {
      type: String, // e.g., 'CHECK-IN', 'BREAK-OUT'
      default: null,
    },
    source: {
      type: String,
      enum: ['mssql', 'excel', 'manual', 'biometric-realtime', 'excel-legacy'],
      required: [true, 'Source is required'],
    },
    rawData: {
      type: mongoose.Schema.Types.Mixed,
      default: null, // Store original data from source
    },
    date: {
      type: String, // YYYY-MM-DD format for easy querying
      required: true,
      index: true,
    },
  },
  {
    timestamps: true,
  }
);

// Unique index: prevent duplicate logs (same employee, timestamp, source)
attendanceRawLogSchema.index({ employeeNumber: 1, timestamp: 1, source: 1 }, { unique: true });

// Index for date queries
attendanceRawLogSchema.index({ employeeNumber: 1, date: 1 });

module.exports = mongoose.models.AttendanceRawLog || mongoose.model('AttendanceRawLog', attendanceRawLogSchema);

