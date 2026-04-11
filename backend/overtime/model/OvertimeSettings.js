const mongoose = require('mongoose');

/**
 * Overtime Settings Model
 * Configures OT rates, thresholds, and workflow
 */
const OvertimeSettingsSchema = new mongoose.Schema(
    {
        // OT Configuration
        payPerHour: {
            type: Number,
            default: 0,
            min: 0,
        },
        multiplier: {
            type: Number,
            default: 1.5,
            min: 1,
        },
        minOTHours: {
            type: Number,
            default: 0,
            min: 0,
        },
        roundingMinutes: {
            type: Number,
            default: 15,
            min: 0,
        },

        /** none | threshold_full — below threshold → 0; at/above → full raw hours */
        recognitionMode: {
            type: String,
            enum: ['none', 'threshold_full'],
            default: 'none',
        },
        /** When recognitionMode is threshold_full, minimum decimal hours before OT counts */
        thresholdHours: {
            type: Number,
            default: null,
            min: 0,
        },
        /**
         * Whole-hour rounding: if fractional minutes (of the hour) >= this value, round up to next hour; else floor.
         * null/undefined = disabled. Example: 45 → 1h45m → 2h; 1h30m → 1h.
         */
        roundUpIfFractionMinutesGte: {
            type: Number,
            default: null,
            min: 0,
            max: 59,
        },
        /** Slab mapping: raw OT range (minutes) -> credited OT (minutes) */
        otHourRanges: {
            type: [
                {
                    minMinutes: { type: Number, required: true, min: 0 },
                    maxMinutes: { type: Number, required: true, min: 0 },
                    creditedMinutes: { type: Number, required: true, min: 0 },
                    label: { type: String, default: '', trim: true },
                },
            ],
            default: [],
        },
        /** When true, extra-hours detection can create a pending OT request automatically */
        autoCreateOtRequest: {
            type: Boolean,
            default: false,
        },
        /** Fallback working hours per day (x) when department/group not set */
        defaultWorkingHoursPerDay: {
            type: Number,
            default: 8,
            min: 0.5,
            max: 24,
        },
        // Application date window
        allowBackdated: {
            type: Boolean,
            default: false,
        },
        maxBackdatedDays: {
            type: Number,
            default: 0,
            min: 0,
        },
        allowFutureDated: {
            type: Boolean,
            default: true,
        },
        maxAdvanceDays: {
            type: Number,
            default: 365,
            min: 0,
        },

        // Workflow configuration
        workflow: {
            isEnabled: {
                type: Boolean,
                default: false
            },
            steps: [{
                stepOrder: Number,
                stepName: String,
                approverRole: {
                    type: String,
                    enum: ['hod', 'hr', 'manager', 'super_admin', 'reporting_manager', 'admin']
                },
                availableActions: [String],
                approvedStatus: String,
                rejectedStatus: String,
                nextStepOnApprove: mongoose.Schema.Types.Mixed,
                isActive: Boolean
            }],
            finalAuthority: {
                role: {
                    type: String,
                    enum: ['hod', 'hr', 'manager', 'super_admin', 'reporting_manager', 'admin']
                },
                anyHRCanApprove: {
                    type: Boolean,
                    default: false
                }
            }
        },

        // Is this settings configuration active
        isActive: {
            type: Boolean,
            default: true,
        },

        // Created by
        createdBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
        },

        // Last updated by
        updatedBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
        },
    },
    {
        timestamps: true,
    }
);

// Ensure only one active settings
OvertimeSettingsSchema.index({ isActive: 1 });

// Static method to get active settings
OvertimeSettingsSchema.statics.getActiveSettings = async function () {
    return this.findOne({ isActive: true }).sort({ createdAt: -1 });
};

module.exports = mongoose.models.OvertimeSettings || mongoose.model('OvertimeSettings', OvertimeSettingsSchema);
