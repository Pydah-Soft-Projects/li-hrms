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
        /** When true, extra-hours detection can create a pending OT request automatically */
        autoCreateOtRequest: {
            type: Boolean,
            default: false,
        },
        /** flat_per_hour (legacy) | formula — (z/y)/x * hours * multiplier */
        payCalculationMode: {
            type: String,
            enum: ['flat_per_hour', 'formula'],
            default: 'flat_per_hour',
        },
        /** Salary component z for formula mode */
        otSalaryBasis: {
            type: String,
            enum: ['gross', 'basic'],
            default: 'gross',
        },
        /** calendar = use payroll month length; fixed = use fixedDaysPerMonth */
        daysPerMonthMode: {
            type: String,
            enum: ['calendar', 'fixed'],
            default: 'calendar',
        },
        fixedDaysPerMonth: {
            type: Number,
            default: 30,
            min: 1,
            max: 31,
        },
        /** Fallback working hours per day (x) when department/group not set */
        defaultWorkingHoursPerDay: {
            type: Number,
            default: 8,
            min: 0.5,
            max: 24,
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
