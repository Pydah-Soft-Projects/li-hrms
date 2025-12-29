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
    lastSyncedAt: { type: Date, default: Date.now }
}, {
    timestamps: true
});

module.exports = mongoose.model('DeviceUser', DeviceUserSchema);
