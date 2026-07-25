const mongoose = require('mongoose');

const DeviceUserSchema = new mongoose.Schema({
    userId: {
        type: String,
        required: true,
        unique: true,
        index: true
    },
    name: {
        type: String,
        default: ''
    },
    department: {
        type: String,
        default: ''
    },
    division: {
        type: String,
        default: ''
    },
    card: {
        type: String,
        default: ''
    },
    role: {
        type: Number,
        default: 0 // 0=User, 14=Admin (Common ZK default)
    },
    password: {
        type: String,
        default: ''
    },
    // Array of Fingerprint Templates
    // Typically ZK devices support 10 fingers (Index 0-9)
    fingerprints: [{
        fingerIndex: { type: Number, required: true }, // 0-9
        templateData: { type: String, required: true }, // Base64 or Raw String
        updatedAt: { type: Date, default: Date.now }
    }],
    // Face Template (some devices have 1, some newer have specialized formats)
    face: {
        templateData: { type: String },
        length: { type: Number },
        updatedAt: { type: Date }
    },
    // Metadata for sync tracking
    photo: {
        content: { type: String }, // Base64 content
        fileName: { type: String },
        size: { type: Number },
        updatedAt: { type: Date }
    },
    lastSyncedAt: { type: Date, default: Date.now },
    /** Most recent device that pushed this user (SN). */
    lastDeviceId: { type: String, index: true },
    /**
     * All device serials this user is known to exist on (active).
     * Updated on every ADMS/TCP ingest and when cloning to a target.
     */
    deviceIds: {
        type: [String],
        default: [],
        index: true
    },
    /**
     * Devices where the user was deleted from the terminal but kept in DB as inactive.
     * Re-enrollment / ingest on that device moves SN back to deviceIds.
     */
    inactiveDeviceIds: {
        type: [String],
        default: [],
        index: true
    },
    /** Last time a device-side delete was queued for this user. */
    lastDeactivatedAt: { type: Date, default: null }
}, {
    timestamps: true
});

module.exports = mongoose.model('DeviceUser', DeviceUserSchema);
