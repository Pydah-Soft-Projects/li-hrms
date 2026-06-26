const mongoose = require('mongoose');

const timeValidator = {
    validator: function (v) {
        if (v === null || v === undefined) return true;
        return /^([0-1][0-9]|2[0-3]):[0-5][0-9]$/.test(v);
    },
    message: 'Time must be in HH:mm format (e.g., 09:00)',
};

const divisionShiftHalfSchema = new mongoose.Schema(
    {
        startTime: {
            type: String,
            validate: timeValidator,
            default: null,
        },
        endTime: {
            type: String,
            validate: timeValidator,
            default: null,
        },
        duration: {
            type: Number,
            min: [0, 'Duration must be positive'],
            default: null,
        },
        minDuration: {
            type: Number,
            min: [0, 'Minimum duration must be positive'],
            default: null,
        },
        gracePeriod: {
            type: Number,
            min: [0, 'Grace period must be positive'],
            default: null,
        },
        payableShifts: {
            type: Number,
            min: [0, 'Payable shifts must be positive'],
            default: null,
        },
    },
    { _id: false }
);

const divisionShiftBreakSchema = new mongoose.Schema(
    {
        startTime: {
            type: String,
            validate: timeValidator,
            default: null,
        },
        endTime: {
            type: String,
            validate: timeValidator,
            default: null,
        },
    },
    { _id: false }
);

const divisionProcessingModeSchema = new mongoose.Schema(
    {
        useOrgDefault: {
            type: Boolean,
            default: true,
        },
        mode: {
            type: String,
            enum: ['multi_shift', 'single_shift'],
            default: 'multi_shift',
        },
        strictCheckInOutOnly: {
            type: Boolean,
            default: true,
        },
        continuousSplitThresholdHours: {
            type: Number,
            default: 14,
            min: 10,
            max: 24,
        },
        splitMinGapHours: {
            type: Number,
            default: 3,
            min: 0,
            max: 12,
        },
        maxShiftsPerDay: {
            type: Number,
            default: 3,
            min: 1,
            max: 3,
        },
        rosterStrictWhenPresent: {
            type: Boolean,
            default: true,
        },
        postShiftOutMarginHours: {
            type: Number,
            default: 4,
            min: 0,
            max: 8,
        },
    },
    { _id: false }
);

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
    processingMode: {
        type: divisionProcessingModeSchema,
        default: () => ({ useOrgDefault: true }),
    },
    shifts: [{
        shiftId: {
            type: mongoose.Schema.ObjectId,
            ref: 'Shift'
        },
        gender: {
            type: String,
            enum: ['Male', 'Female', 'Other', 'All'],
            default: 'All'
        },
        employee_group_id: {
            type: mongoose.Schema.ObjectId,
            ref: 'EmployeeGroup',
            default: null
        },
        // Division-specific half/break config for this shift assignment.
        // Shift master should not be treated as the source of truth for halves.
        firstHalf: {
            type: divisionShiftHalfSchema,
            default: null,
        },
        break: {
            type: divisionShiftBreakSchema,
            default: null,
        },
        secondHalf: {
            type: divisionShiftHalfSchema,
            default: null,
        },
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
