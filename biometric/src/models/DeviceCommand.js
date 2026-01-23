const mongoose = require('mongoose');

/**
 * DeviceCommand Schema
 * Used for queuing commands to ADMS (Push) devices.
 * Devices pick up these commands during their getrequest.aspx heartbeat.
 */
const deviceCommandSchema = new mongoose.Schema({
    deviceId: {
        type: String,
        required: true,
        index: true
    },
    command: {
        type: String, // e.g., "DATA QUERY ATTLOG", "REBOOT", "CLEAR LOG"
        required: true
    },
    status: {
        type: String,
        enum: ['PENDING', 'SENT', 'SUCCESS', 'FAIL'],
        default: 'PENDING',
        index: true
    },
    result: {
        type: String,
        default: ''
    },
    queuedAt: {
        type: Date,
        default: Date.now
    },
    sentAt: {
        type: Date
    },
    completedAt: {
        type: Date
    }
}, {
    timestamps: true
});

const DeviceCommand = mongoose.model('DeviceCommand', deviceCommandSchema);

module.exports = DeviceCommand;
