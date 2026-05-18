const mongoose = require('mongoose');

const biometricSettingsSchema = new mongoose.Schema({
    key: {
        type: String,
        required: true,
        unique: true,
        default: 'global'
    },
    operationMode: {
        type: String,
        enum: ['OPERATION', 'DEVICE'],
        default: 'OPERATION'
    },
    /** Clone new users to other devices in the same machine category */
    autoCloneNewUsers: {
        type: Boolean,
        default: null
    },
    /** Push canonical DeviceUser back to terminal when USERINFO drifts */
    syncStoredDeviceUserToTerminal: {
        type: Boolean,
        default: null
    },
    deviceHeartbeatStaleMs: {
        type: Number,
        default: null
    },
    /** TCP cron sync interval; 0 = disabled (ADMS-only) */
    syncIntervalMinutes: {
        type: Number,
        default: null
    },
    timezoneOffset: {
        type: String,
        default: null
    },
    admsFreshBackupHardCapMs: {
        type: Number,
        default: null
    },
    admsFreshBackupQuietPeriodMs: {
        type: Number,
        default: null
    },
    admsFreshBackupFirstBatchWaitMs: {
        type: Number,
        default: null
    },
    admsFreshBackupApiHardCapMs: {
        type: Number,
        default: null
    }
}, {
    timestamps: true
});

const BiometricSettings = mongoose.model('BiometricSettings', biometricSettingsSchema);

module.exports = BiometricSettings;
