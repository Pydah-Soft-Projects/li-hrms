const mongoose = require('mongoose');

/**
 * AdmsRawLog Schema
 * Specifically for storing every raw packet received via ADMS (Push)
 * for debugging and audit purposes.
 */
const admsRawLogSchema = new mongoose.Schema({
    serialNumber: {
        type: String,
        required: true,
        index: true
    },
    table: {
        type: String,
        index: true
    },
    query: {
        type: Object
    },
    body: {
        type: mongoose.Schema.Types.Mixed, // Accept both String and Object
        default: ''
    },
    method: {
        type: String
    },
    ipAddress: {
        type: String,
        index: true
    },
    receivedAt: {
        type: Date,
        default: Date.now,
        index: true
    }
}, {
    timestamps: true
});

const AdmsRawLog = mongoose.model('AdmsRawLog', admsRawLogSchema);

module.exports = AdmsRawLog;
