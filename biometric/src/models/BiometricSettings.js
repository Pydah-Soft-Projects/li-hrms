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
    }
}, {
    timestamps: true
});

const BiometricSettings = mongoose.model('BiometricSettings', biometricSettingsSchema);

module.exports = BiometricSettings;
