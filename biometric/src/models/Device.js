const mongoose = require('mongoose');

const deviceSchema = new mongoose.Schema({
    deviceId: {
        type: String,
        required: true,
        unique: true,
        index: true
    },
    name: {
        type: String,
        required: true
    },
    ip: {
        type: String,
        required: true
    },
    port: {
        type: Number,
        default: 4370
    },
    enabled: {
        type: Boolean,
        default: true
    },
    location: {
        type: String,
        default: ''
    },
    lastSyncAt: {
        type: Date,
        default: null
    },
    lastSyncStatus: {
        type: String,
        enum: ['success', 'failed', 'pending', null],
        default: null
    },
    lastLogTimestamp: {
        type: Date,
        default: null
    }
}, {
    timestamps: true
});

const Device = mongoose.model('Device', deviceSchema);

module.exports = Device;
