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
      // Salary-based limits (for salary advances)
      salaryBasedLimits: {
        enabled: {
          type: Boolean,
          default: false,
        },
        // Max advance as percentage of basic salary
        advancePercentage: {
          type: Number,
          default: 50,
          min: 0,
          max: 100,
        },
        // Consider attendance in calculation
        considerAttendance: {
          type: Boolean,
          default: true,
        },
      },

      // Multi-loan payroll EMI collection (loans only)
      // collect_all = deduct every due EMI; single_emi_only = one EMI/month; max_combined_cap = sum until cap
      multiEmiCollectionMode: {
        type: String,
        enum: ['collect_all', 'single_emi_only', 'max_combined_cap'],
        default: 'collect_all',
      },
      maxCombinedEmiAmount: {
        type: Number,
        default: null,
      },
      multiEmiPriority: {
        type: String,
        enum: ['oldest_first', 'newest_first', 'highest_emi_first'],
        default: 'oldest_first',
      },
      // When an EMI is due but skipped due to single/cap mode, post monthly interest
      accrueInterestOnSkippedEmi: {
        type: Boolean,
        default: true,
      },
      // Charge interest for months between interest-start and EMI commence
      preEmiInterestEnabled: {
        type: Boolean,
        default: true,
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

      // When true, higher authorities (admin/super_admin/hr) can approve even if it's at an earlier step
      allowHigherAuthorityToApproveLowerLevels: {
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
            enum: ['hod', 'hr', 'manager', 'admin', 'super_admin', 'reporting_manager', 'final_authority', 'custom', 'specific_user'],
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
          // Stage capabilities — configurable gates per approval step
          requireGuarantors: {
            type: Boolean,
            default: false,
          },
          verifyAttendance: {
            type: Boolean,
            default: false,
          },
          verifyComplaints: {
            type: Boolean,
            default: false,
          },
          verifyExistingLoans: {
            type: Boolean,
            default: false,
          },
          canEditSanctionedAmount: {
            type: Boolean,
            default: false,
          },
          canSetInstallments: {
            type: Boolean,
            default: false,
          },
          canSetRepaymentStartMonth: {
            type: Boolean,
            default: false,
          },
          canControlInterest: {
            type: Boolean,
            default: false,
          },
          requireSanctionDocument: {
            type: Boolean,
            default: false,
          },
          canVerifyBankDetails: {
            type: Boolean,
            default: false,
          },
          canPrepareRtgs: {
            type: Boolean,
            default: false,
          },
          canAuthorizeDisbursement: {
            type: Boolean,
            default: false,
          },
        },
      ],

      // Final authority configuration
      finalAuthority: {
        // Who has final approval authority
        role: {
          type: String,
          enum: ['hr', 'manager', 'admin', 'super_admin', 'reporting_manager', 'specific_user'],
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

    // Guarantor collection and validation rules (loans only)
    guarantorRules: {
      collectionTiming: {
        type: String,
        enum: ['on_application', 'on_workflow_stage'],
        default: 'on_workflow_stage',
      },
      guarantorStageStepOrder: {
        type: Number,
        default: null,
      },
      minGuarantors: {
        type: Number,
        default: 2,
        min: 0,
      },
      maxGuarantors: {
        type: Number,
        default: 4,
        min: 1,
      },
      maxGuaranteePercentOfSalary: {
        type: Number,
        default: 60,
        min: 0,
        max: 100,
      },
      includeOwnEmi: {
        type: Boolean,
        default: true,
      },
      includeGuaranteedEmi: {
        type: Boolean,
        default: true,
      },
      minServicePeriodMonths: {
        type: Number,
        default: 0,
        min: 0,
      },
      minSalary: {
        type: Number,
        default: 0,
        min: 0,
      },
      sameDivisionOnly: {
        type: Boolean,
        default: true,
      },
      sameDepartmentOnly: {
        type: Boolean,
        default: false,
      },
      activeEmployeeOnly: {
        type: Boolean,
        default: true,
      },
      countPendingGuarantees: {
        type: Boolean,
        default: false,
      },
      eligibleDepartments: [
        {
          type: mongoose.Schema.Types.ObjectId,
          ref: 'Department',
        },
      ],
      eligibleDesignations: [
        {
          type: mongoose.Schema.Types.ObjectId,
          ref: 'Designation',
        },
      ],
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

module.exports = mongoose.models.LoanSettings || mongoose.model('LoanSettings', LoanSettingsSchema);

