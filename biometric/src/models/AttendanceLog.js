const mongoose = require('mongoose');

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
    }
}, {
    timestamps: true
});

// Compound index to prevent duplicate logs (User ID + Timestamp MUST be unique)
attendanceLogSchema.index({ employeeId: 1, timestamp: 1 }, { unique: true });

// Index for efficient querying by date range
attendanceLogSchema.index({ employeeId: 1, timestamp: -1 });

const AttendanceLog = mongoose.model('AttendanceLog', attendanceLogSchema);

module.exports = AttendanceLog;
