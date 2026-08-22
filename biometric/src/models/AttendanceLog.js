const mongoose = require('mongoose');

const HRMS_SYNC_STATUSES = ['pending', 'syncing', 'synced', 'failed'];

const attendanceLogSchema = new mongoose.Schema({
    employeeId: {
        type: String,
        required: true,
        index: true
    },
    timestamp: {
        type: Date,
        required: true,
        index: true
    },
    logType: {
        type: String,
        enum: ['CHECK-IN', 'CHECK-OUT', 'BREAK-IN', 'BREAK-OUT', 'OVERTIME-IN', 'OVERTIME-OUT'],
        required: true
    },
    rawType: {
        type: Number
    },
    rawData: {
        type: Object // Store the entire raw record from device
    },
    deviceId: {
        type: String,
        required: true
    },
    deviceName: {
        type: String,
        required: true
    },
    syncedAt: {
        type: Date,
        default: Date.now
    },
    // HRMS outbox. Existing rows without this field are treated as already delivered
    // (catch-up never replays full history on deploy). New punches set pending on insert.
    hrmsSyncStatus: {
        type: String,
        enum: HRMS_SYNC_STATUSES
    },
    hrmsSyncedAt: {
        type: Date
    },
    hrmsSyncAttempts: {
        type: Number,
        default: 0
    },
    hrmsLastError: {
        type: String
    },
    hrmsNextRetryAt: {
        type: Date
    }
}, {
    timestamps: true
});

// Compound index to prevent duplicate logs (User ID + Timestamp MUST be unique)
attendanceLogSchema.index({ employeeId: 1, timestamp: 1 }, { unique: true });

// Index for efficient querying by date range
attendanceLogSchema.index({ employeeId: 1, timestamp: -1 });

// Catch-up worker: pending/syncing by arrival time
attendanceLogSchema.index({ hrmsSyncStatus: 1, createdAt: 1 });
attendanceLogSchema.index({ hrmsSyncStatus: 1, hrmsNextRetryAt: 1, createdAt: 1 });

const AttendanceLog = mongoose.model('AttendanceLog', attendanceLogSchema);

module.exports = AttendanceLog;
module.exports.HRMS_SYNC_STATUSES = HRMS_SYNC_STATUSES;
