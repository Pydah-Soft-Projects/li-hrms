const mongoose = require('mongoose');

const DivisionSchema = new mongoose.Schema({
    name: {
        type: String,
        required: [true, 'Please add a division name'],
        trim: true,
        unique: true
    },
    code: {
        type: String,
        required: [true, 'Please add a division code'],
        unique: true,
        uppercase: true,
        trim: true
    },
    description: {
        type: String,
        trim: true
    },
    manager: {
        type: mongoose.Schema.ObjectId,
        ref: 'User'
    },
    departments: [{
        type: mongoose.Schema.ObjectId,
        ref: 'Department'
    }],
    shifts: [{
        shiftId: {
            type: mongoose.Schema.ObjectId,
            ref: 'Shift'
        },
        gender: {
            type: String,
            enum: ['Male', 'Female', 'Other', 'All'],
            default: 'All'
        }
    }],
    isActive: {
        type: Boolean,
        default: true
    },
    created_at: {
        type: Date,
        default: Date.now
    },
    updated_at: {
        type: Date,
        default: Date.now
    }
}, {
    toJSON: { virtuals: true },
    toObject: { virtuals: true }
});

// Update updated_at on save
DivisionSchema.pre('save', async function () {
    this.updated_at = Date.now();
});

module.exports = mongoose.model('Division', DivisionSchema);
