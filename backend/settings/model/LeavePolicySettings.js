/**
 * Leave Policy Settings Model
 * Configures earned leave rules, carry forward policies, and financial year settings
 */

const mongoose = require('mongoose');

const leavePolicySettingsSchema = new mongoose.Schema({
    // Financial Year Configuration
    financialYear: {
        startMonth: {
            type: Number,
            default: 4, // April (1-12)
            min: 1,
            max: 12,
            description: 'Financial year start month (1=Jan, 4=Apr, etc.)'
        },
        startDay: {
            type: Number,
            default: 1,
            min: 1,
            max: 31,
            description: 'Financial year start day'
        },
        useCalendarYear: {
            type: Boolean,
            default: false,
            description: 'Use calendar year (Jan-Dec) instead of custom financial year'
        }
    },

    // Earned Leave (EL) Configuration
    earnedLeave: {
        enabled: {
            type: Boolean,
            default: true,
            description: 'Enable earned leave (EL) earning; when false, no EL is accrued'
        },
        // Earning Rules
        earningType: {
            type: String,
            enum: ['attendance_based', 'fixed'],
            default: 'attendance_based',
            description: 'How EL is earned - based on attendance, fixed amount'
        },
        
        // Attendance-Based Earning
        attendanceRules: {
            minDaysForFirstEL: {
                type: Number,
                default: 20,
                min: 1,
                max: 31,
                description: 'Minimum days attendance required to earn first EL'
            },
            daysPerEL: {
                type: Number,
                default: 20,
                min: 1,
                max: 31,
                description: 'Number of attendance days required for 1 EL'
            },
            maxELPerMonth: {
                type: Number,
                default: 2,
                min: 0,
                max: 10,
                description: 'Maximum EL that can be earned in a month'
            },
            maxELPerYear: {
                type: Number,
                default: 12,
                min: 0,
                max: 365,
                description: 'Maximum EL that can be earned in a financial year'
            },
            considerPresentDays: {
                type: Boolean,
                default: true,
                description: 'Count present days in attendance calculation'
            },
            considerHolidays: {
                type: Boolean,
                default: true,
                description: 'Count holidays/weekly offs as present for EL calculation'
            },
            // Attendance Ranges (Cumulative Logic) – same path the frontend uses
            attendanceRanges: [{
                minDays: { type: Number, required: true },
                maxDays: { type: Number, required: true },
                elEarned: { type: Number, required: true },
                description: { type: String, default: '' }
            }]
        },

        // Fixed Earning
        fixedRules: {
            elPerMonth: {
                type: Number,
                default: 1,
                min: 0,
                max: 10,
                description: 'Fixed EL earned per month'
            },
            maxELPerYear: {
                type: Number,
                default: 12,
                min: 0,
                max: 365,
                description: 'Maximum EL per year (for fixed earning)'
            }
        }
    },

    // Carry Forward Policies
    carryForward: {
        casualLeave: {
            enabled: {
                type: Boolean,
                default: true,
                description: 'Enable carry forward for Casual Leave'
            },
            maxMonths: {
                type: Number,
                default: 12,
                min: 0,
                max: 24,
                description: 'Maximum months CL can be carried forward (0=no limit)'
            },
            expiryMonths: {
                type: Number,
                default: 12,
                min: 0,
                max: 60,
                description: 'CL expires after these many months (0=no expiry)'
            },
            carryForwardToNextYear: {
                type: Boolean,
                default: true,
                description: 'Carry forward unused CL to next financial year'
            }
        },
        earnedLeave: {
            enabled: {
                type: Boolean,
                default: true,
                description: 'Enable carry forward for Earned Leave'
            },
            maxMonths: {
                type: Number,
                default: 24,
                min: 0,
                max: 60,
                description: 'Maximum months EL can be carried forward'
            },
            expiryMonths: {
                type: Number,
                default: 60,
                min: 0,
                max: 120,
                description: 'EL expires after these many months (0=no expiry)'
            },
            carryForwardToNextYear: {
                type: Boolean,
                default: true,
                description: 'Carry forward unused EL to next financial year'
            }
        },
        compensatoryOff: {
            enabled: {
                type: Boolean,
                default: true,
                description: 'Enable carry forward for Compensatory Off'
            },
            maxMonths: {
                type: Number,
                default: 6,
                min: 0,
                max: 24,
                description: 'Maximum months CO can be carried forward'
            },
            expiryMonths: {
                type: Number,
                default: 6,
                min: 0,
                max: 24,
                description: 'CO expires after these many months (0=no expiry)'
            },
            carryForwardToNextYear: {
                type: Boolean,
                default: false,
                description: 'Carry forward unused CO to next financial year'
            }
        }
    },

    // Leave Encashment Rules
    encashment: {
        casualLeave: {
            enabled: {
                type: Boolean,
                default: false,
                description: 'Allow CL encashment'
            },
            minDaysForEncashment: {
                type: Number,
                default: 5,
                min: 1,
                description: 'Minimum CL days required for encashment'
            },
            maxEncashmentPerYear: {
                type: Number,
                default: 0,
                min: 0,
                description: 'Maximum CL days that can be encashed per year (0=no limit)'
            }
        },
        earnedLeave: {
            enabled: {
                type: Boolean,
                default: true,
                description: 'Allow EL encashment'
            },
            minDaysForEncashment: {
                type: Number,
                default: 10,
                min: 1,
                description: 'Minimum EL days required for encashment'
            },
            maxEncashmentPerYear: {
                type: Number,
                default: 15,
                min: 0,
                description: 'Maximum EL days that can be encashed per year (0=no limit)'
            }
        }
    },

    // Compliance Settings (Indian Labor Laws)
    compliance: {
        applicableAct: {
            type: String,
            enum: ['shops_act', 'factories_act', 'it_act', 'custom'],
            default: 'shops_act',
            description: 'Applicable labor law for EL calculations'
        },
        considerWeeklyOffs: {
            type: Boolean,
            default: true,
            description: 'Count weekly offs as working days for EL calculation'
        },
        considerPaidHolidays: {
            type: Boolean,
            default: true,
            description: 'Count paid holidays as working days for EL calculation'
        },
        probationPeriod: {
            months: {
                type: Number,
                default: 6,
                min: 0,
                max: 24,
                description: 'Probation period in months'
            },
            elApplicableAfter: {
                type: Boolean,
                default: true,
                description: 'EL applicable only after probation completion'
            }
        }
    },

    // Auto-Update Settings
    autoUpdate: {
        enabled: {
            type: Boolean,
            default: true,
            description: 'Enable automatic EL updates based on attendance'
        },
        updateFrequency: {
            type: String,
            enum: ['daily', 'weekly', 'monthly'],
            default: 'monthly',
            description: 'When to update EL balances'
        },
        updateDay: {
            type: Number,
            default: 1,
            min: 1,
            max: 31,
            description: 'Day of month to run updates (for monthly frequency)'
        }
    },

    // Annual CL Reset Settings
    annualCLReset: {
        enabled: {
            type: Boolean,
            default: true,
            description: 'Enable annual CL balance reset at financial year start'
        },
        resetToBalance: {
            type: Number,
            default: 12,
            min: 0,
            max: 365,
            description: 'CL balance to reset to at financial year start'
        },
        addCarryForward: {
            type: Boolean,
            default: true,
            description: 'Add unused CL carry forward to reset balance'
        },
        resetMonth: {
            type: Number,
            default: 4, // April
            min: 1,
            max: 12,
            description: 'Month when CL reset occurs (1=Jan, 4=Apr)'
        },
        resetDay: {
            type: Number,
            default: 1,
            min: 1,
            max: 31,
            description: 'Day when CL reset occurs'
        }
    }
}, {
    timestamps: true,
    collection: 'leave_policy_settings'
});

// Static methods
leavePolicySettingsSchema.statics.getSettings = async function() {
    let settings = await this.findOne({});
    if (!settings) {
        // Create default settings if none exist
        settings = await this.create({});
    }
    return settings;
};

leavePolicySettingsSchema.statics.updateSettings = async function(updateData) {
    return this.findOneAndUpdate(
        {},
        { $set: updateData },
        { new: true, upsert: true }
    );
};

module.exports = mongoose.model('LeavePolicySettings', leavePolicySettingsSchema);
