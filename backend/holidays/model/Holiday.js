const mongoose = require('mongoose');

const holidaySchema = new mongoose.Schema(
    {
        name: {
            type: String,
            required: [true, 'Holiday name is required'],
            trim: true,
        },
        date: {
            type: Date,
            required: [true, 'Holiday date is required'],
        },
        type: {
            type: String,
            enum: ['National', 'Regional', 'Optional', 'Company'],
            default: 'National',
        },

        // --- Scoping Logic ---

        // Is this part of the Master Template?
        isMaster: {
            type: Boolean,
            default: false,
        },

        // Scope: GLOBAL (Master) or GROUP (Specific)
        scope: {
            type: String,
            enum: ['GLOBAL', 'GROUP'],
            default: 'GLOBAL',
        },

        // For Master Holidays: Who does it apply to?
        applicableTo: {
            type: String,
            enum: ['ALL', 'SPECIFIC_GROUPS'], // ALL = Global Master, SPECIFIC = Partial Master
            default: 'ALL',
            // Only valid if isMaster is true
        },

        // If applicableTo is SPECIFIC_GROUPS, list them here
        targetGroupIds: [
            {
                type: mongoose.Schema.Types.ObjectId,
                ref: 'HolidayGroup',
            },
        ],

        // If scope is GROUP, which group does it belong to?
        groupId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'HolidayGroup',
            required: function () { return this.scope === 'GROUP'; },
        },

        // If this is a group override of a master holiday
        overridesMasterId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Holiday',
            default: null,
        },

        description: {
            type: String,
            trim: true,
        },
        createdBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
        },
    },
    {
        timestamps: true,
    }
);

// Indexes
holidaySchema.index({ date: 1 });
holidaySchema.index({ groupId: 1 });
holidaySchema.index({ isMaster: 1 });

module.exports = mongoose.model('Holiday', holidaySchema);
