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
        endDate: {
            type: Date,
            default: null,
        },
        type: {
            type: String,
            enum: ['National', 'Regional', 'Optional', 'Company', 'Academic', 'Observance', 'Seasonal'],
            default: 'National',
        },

        // --- Scoping Logic ---

        // Is this part of the Master Template?
        isMaster: {
            type: Boolean,
            default: false,
        },

        // Scope: GLOBAL (Master), GROUP (holiday group), MAPPING (direct employee scope)
        scope: {
            type: String,
            enum: ['GLOBAL', 'GROUP', 'MAPPING'],
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

        // If scope is MAPPING — direct employee targeting (division/dept/employee group)
        divisionMapping: [
            {
                division: {
                    type: mongoose.Schema.Types.ObjectId,
                    ref: 'Division',
                    required: true,
                },
                departments: [
                    {
                        type: mongoose.Schema.Types.ObjectId,
                        ref: 'Department',
                    },
                ],
                employeeGroups: [
                    {
                        type: mongoose.Schema.Types.ObjectId,
                        ref: 'EmployeeGroup',
                    },
                ],
            },
        ],

        // If this is a group override of a master holiday
        overridesMasterId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Holiday',
            default: null,
        },

        // --- Propagation Logic (Copy-on-Write) ---

        // Reference to the original Global Holiday (if this is a copy)
        sourceHolidayId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Holiday',
            default: null,
        },

        // Is this copy still synced with the Global parent?
        // True = Updates to Global will propagate to this copy.
        // False = Link broken (User manually edited this copy).
        isSynced: {
            type: Boolean,
            default: true,
        },

        description: {
            type: String,
            trim: true,
        },
        isActive: {
            type: Boolean,
            default: true,
            index: true,
        },
        deactivatedAt: {
            type: Date,
            default: null,
        },
        deactivatedBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
            default: null,
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
holidaySchema.index({ isActive: 1 });

module.exports = mongoose.model('Holiday', holidaySchema);
