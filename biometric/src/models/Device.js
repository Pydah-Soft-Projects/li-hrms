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
    },
    lastSeenAt: {
        type: Date,
        default: Date.now
    },
    // Device metrics (Health)
    status: {
        userCount: { type: Number, default: 0 },
        fingerCount: { type: Number, default: 0 },
        attCount: { type: Number, default: 0 },
        faceCount: { type: Number, default: 0 },
        firmware: { type: String },
        platform: { type: String },
        rawStatus: { type: String }
    },
    // Universal Compatibility Profile
    capabilities: {
        hasFingerprint: { type: Boolean, default: true },
        hasFace: { type: Boolean, default: false },
        hasPalm: { type: Boolean, default: false },
        hasCard: { type: Boolean, default: true },
        fpVersion: { type: String, default: '10' }, // 9 or 10
        faceVersion: { type: String },
        maxUsers: { type: Number },
        maxFingers: { type: Number },
        maxAttLogs: { type: Number }
    },
    protocol: {
        pushVersion: { type: String },
        encoding: { type: String, default: 'UTF-8' },
        separator: { type: String, default: '\t' } // Some old ones use comma
    }
}, {
    timestamps: true
});

const Device = mongoose.model('Device', deviceSchema);

module.exports = Device;
