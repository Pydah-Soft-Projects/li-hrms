const mongoose = require('mongoose');

/**
 * Loan Settings Model
 * Configures loan/advance types, workflow, limits, and approval chain
 */
const LoanSettingsSchema = new mongoose.Schema(
  {
    // Settings type - loan or salary_advance
    type: {
      type: String,
      enum: ['loan', 'salary_advance'],
      required: true,
    },

    // General settings
    settings: {
      // Maximum loan/advance amount
      maxAmount: {
        type: Number,
        default: null, // null = unlimited
      },
      // Minimum loan/advance amount
      minAmount: {
        type: Number,
        default: 1000,
      },
      // Maximum duration in months/cycles
      maxDuration: {
        type: Number,
        default: 60, // 5 years for loans
      },
      // Minimum duration in months/cycles
      minDuration: {
        type: Number,
        default: 1,
      },
      // Interest rate (for loans only, in percentage)
      interestRate: {
        type: Number,
        default: 0,
      },
      // Is interest applicable
      isInterestApplicable: {
        type: Boolean,
        default: false,
      },
      // Maximum loan/advance per employee (lifetime)
      maxPerEmployee: {
        type: Number,
        default: null, // null = unlimited
      },
      // Maximum active loans/advances per employee
      maxActivePerEmployee: {
        type: Number,
        default: 1,
      },
      // Eligibility by department
      eligibleDepartments: [
        {
          type: mongoose.Schema.Types.ObjectId,
          ref: 'Department',
        },
      ],
      // Eligibility by designation
      eligibleDesignations: [
        {
          type: mongoose.Schema.Types.ObjectId,
          ref: 'Designation',
        },
      ],
      // Minimum service period (in months) to be eligible
      minServicePeriod: {
        type: Number,
        default: 0,
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
      // Workspace-level permissions for loan/advance applications
      // Format: { workspaceId: { canApplyForSelf: boolean, canApplyForOthers: boolean } }
      workspacePermissions: {
        type: mongoose.Schema.Types.Mixed,
        default: {},
      },
    },

    // Workflow configuration
    workflow: {
      // Is workflow enabled
      isEnabled: {
        type: Boolean,
        default: true,
      },

      // Use dynamic workflow (allows custom step configuration)
      useDynamicWorkflow: {
        type: Boolean,
        default: false,
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
            enum: ['hod', 'hr', 'admin', 'final_authority', 'custom', 'specific_user'],
            required: true,
          },
          // Custom approver (if approverRole is 'custom' or 'specific_user')
          customApproverUserId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
          },
          // Multiple specific users who can approve at this step (for dynamic workflow)
          approverUserIds: [
            {
              type: mongoose.Schema.Types.ObjectId,
              ref: 'User',
            },
          ],
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
            // Skip if amount is less than
            maxAmount: Number,
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
LoanSettingsSchema.index({ type: 1, isActive: 1 });

// Static method to get active settings for a type
LoanSettingsSchema.statics.getActiveSettings = async function (type) {
  return this.findOne({ type, isActive: true });
};

// Static method to get workflow for a type
LoanSettingsSchema.statics.getWorkflow = async function (type) {
  const settings = await this.findOne({ type, isActive: true });
  return settings?.workflow || null;
};

// Static method to get next approver based on current step
LoanSettingsSchema.statics.getNextApprover = async function (type, currentStep) {
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

module.exports = mongoose.model('LoanSettings', LoanSettingsSchema);

