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
        minOTHours: {
            type: Number,
            default: 0,
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
                    enum: ['hod', 'hr', 'manager', 'super_admin']
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
                    enum: ['hod', 'hr', 'manager', 'super_admin']
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
