const mongoose = require('mongoose');

/**
 * Leave Settings Model
 * Configures leave types, workflow, and approval chain
 */
const LeaveSettingsSchema = new mongoose.Schema(
  {
    // Settings type - leave or od
    type: {
      type: String,
      enum: ['leave', 'od'],
      required: true,
    },

    // Leave/OD Types configuration
    types: [
      {
        code: {
          type: String,
          required: true,
          uppercase: true,
        },
        name: {
          type: String,
          required: true,
        },
        description: String,
        // Maximum days per year (null = unlimited)
        maxDaysPerYear: {
          type: Number,
          default: null,
        },
        // Can be carried forward
        carryForward: {
          type: Boolean,
          default: false,
        },
        // Maximum carry forward days
        maxCarryForward: {
          type: Number,
          default: 0,
        },
        // Requires attachment (e.g., medical certificate for sick leave)
        requiresAttachment: {
          type: Boolean,
          default: false,
        },
        // Minimum notice days before leave
        minNoticeDays: {
          type: Number,
          default: 0,
        },
        // Is paid leave
        isPaid: {
          type: Boolean,
          default: true,
        },
        // Is active
        isActive: {
          type: Boolean,
          default: true,
        },
        // Color for UI
        color: {
          type: String,
          default: '#3b82f6',
        },
        // Sort order
        sortOrder: {
          type: Number,
          default: 0,
        },
      },
    ],

    // Status configuration
    statuses: [
      {
        code: {
          type: String,
          required: true,
          lowercase: true,
        },
        name: {
          type: String,
          required: true,
        },
        description: String,
        // Color for UI
        color: {
          type: String,
          default: '#6b7280',
        },
        // Is this a final status (approved/rejected/cancelled)
        isFinal: {
          type: Boolean,
          default: false,
        },
        // Is this a positive final status
        isApproved: {
          type: Boolean,
          default: false,
        },
        // Can employee edit when in this status
        canEmployeeEdit: {
          type: Boolean,
          default: false,
        },
        // Can employee cancel when in this status
        canEmployeeCancel: {
          type: Boolean,
          default: false,
        },
        // Sort order
        sortOrder: {
          type: Number,
          default: 0,
        },
      },
    ],

    // Workflow configuration
    workflow: {
      // Is workflow enabled
      isEnabled: {
        type: Boolean,
        default: true,
      },

      // Default approval flow
      // Each step defines who approves and what happens next
      steps: [
        {
          stepOrder: {
            type: Number,
            required: true,
          },
          stepName: {
            type: String,
            required: true,
          },
          // Who approves at this step
          approverRole: {
            type: String,
            enum: ['hod', 'hr', 'admin', 'final_authority', 'custom'],
            required: true,
          },
          // Custom approver (if approverRole is 'custom')
          customApproverUserId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
          },
          // Actions available at this step
          availableActions: [
            {
              type: String,
              enum: ['approve', 'reject', 'forward', 'return', 'request_info'],
            },
          ],
          // Status to set when approved at this step
          approvedStatus: {
            type: String,
          },
          // Status to set when rejected at this step
          rejectedStatus: {
            type: String,
          },
          // Next step on approval (null means final approval at this step)
          nextStepOnApprove: {
            type: Number,
            default: null,
          },
          // Can skip this step under certain conditions
          canSkip: {
            type: Boolean,
            default: false,
          },
          // Skip conditions
          skipConditions: {
            // Skip if employee is of certain designation
            designations: [
              {
                type: mongoose.Schema.Types.ObjectId,
                ref: 'Designation',
              },
            ],
            // Skip if leave days are less than
            maxDays: Number,
          },
          // Is this step active
          isActive: {
            type: Boolean,
            default: true,
          },
        },
      ],

      // Final authority configuration
      finalAuthority: {
        // Who has final approval authority
        role: {
          type: String,
          enum: ['hr', 'admin', 'specific_user'],
          default: 'hr',
        },
        // If role is 'specific_user'
        userId: {
          type: mongoose.Schema.Types.ObjectId,
          ref: 'User',
        },
        // Can any HR give final approval or only specific ones
        anyHRCanApprove: {
          type: Boolean,
          default: false,
        },
        // Specific HR users who can give final approval
        authorizedHRUsers: [
          {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
          },
        ],
      },
    },

    // General settings
    settings: {
      // Allow backdated leave applications
      allowBackdated: {
        type: Boolean,
        default: false,
      },
      // Maximum days for backdated
      maxBackdatedDays: {
        type: Number,
        default: 7,
      },
      // Allow future dated leave
      allowFutureDated: {
        type: Boolean,
        default: true,
      },
      // Maximum days in advance
      maxAdvanceDays: {
        type: Number,
        default: 90,
      },
      // Minimum gap between consecutive leaves
      minGapBetweenLeaves: {
        type: Number,
        default: 0,
      },
      // Weekend counted as leave days
      countWeekends: {
        type: Boolean,
        default: false,
      },
      // Holidays counted as leave days
      countHolidays: {
        type: Boolean,
        default: false,
      },
      // Auto cancel if not approved within days
      autoCancelDays: {
        type: Number,
        default: null,
      },
      // Send email notifications
      sendEmailNotifications: {
        type: Boolean,
        default: true,
      },
      // Notify employee on status change
      notifyOnStatusChange: {
        type: Boolean,
        default: true,
      },
      // Notify approver when new application comes
      notifyApproverOnNew: {
        type: Boolean,
        default: true,
      },
      // Workspace-level permissions for leave/OD applications
      // Format: { workspaceId: { canApplyForSelf: boolean, canApplyForOthers: boolean } }
      workspacePermissions: {
        type: mongoose.Schema.Types.Mixed,
        default: {},
      },
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

// Ensure only one active settings per type
LeaveSettingsSchema.index({ type: 1, isActive: 1 });

// Static method to get active settings for a type
LeaveSettingsSchema.statics.getActiveSettings = async function (type) {
  return this.findOne({ type, isActive: true });
};

// Static method to get workflow for a type
LeaveSettingsSchema.statics.getWorkflow = async function (type) {
  const settings = await this.findOne({ type, isActive: true });
  return settings?.workflow || null;
};

// Static method to get next approver based on current step
LeaveSettingsSchema.statics.getNextApprover = async function (type, currentStep) {
  const settings = await this.findOne({ type, isActive: true });
  if (!settings?.workflow?.steps) return null;

  const currentStepConfig = settings.workflow.steps.find(
    (s) => s.stepOrder === currentStep && s.isActive
  );

  if (!currentStepConfig) return null;

  if (currentStepConfig.nextStepOnApprove === null) {
    // This is the final step
    return { isFinal: true, finalAuthority: settings.workflow.finalAuthority };
  }

  const nextStep = settings.workflow.steps.find(
    (s) => s.stepOrder === currentStepConfig.nextStepOnApprove && s.isActive
  );

  return nextStep || null;
};

module.exports = mongoose.model('LeaveSettings', LeaveSettingsSchema);

