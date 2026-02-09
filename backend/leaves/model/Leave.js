const mongoose = require('mongoose');

/**
 * Leave Model
 * Handles leave applications with dynamic workflow
 */
const LeaveSchema = new mongoose.Schema(
  {
    // Employee who applied for leave
    employeeId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Employee',
      required: [true, 'Employee is required'],
    },

    // Employee number for quick reference
    emp_no: {
      type: String,
      required: true,
    },

    // Leave type (dynamic - values come from LeaveSettings)
    leaveType: {
      type: String,
      required: [true, 'Leave type is required'],
      trim: true,
    },

    // Start date of leave
    fromDate: {
      type: Date,
      required: [true, 'Start date is required'],
    },

    // End date of leave
    toDate: {
      type: Date,
      required: [true, 'End date is required'],
    },

    // Number of days (calculated or manual)
    numberOfDays: {
      type: Number,
      required: true,
      min: [0.5, 'Minimum leave is half day'],
    },

    // Half day options
    isHalfDay: {
      type: Boolean,
      default: false,
    },

    halfDayType: {
      type: String,
      enum: ['first_half', 'second_half', null],
      default: null,
    },

    // Purpose/Reason for leave
    purpose: {
      type: String,
      required: [true, 'Purpose is required'],
      trim: true,
      maxlength: [500, 'Purpose cannot exceed 500 characters'],
    },

    // Contact number during leave
    contactNumber: {
      type: String,
      required: [true, 'Contact number during leave is required'],
      trim: true,
    },

    // Emergency contact (optional)
    emergencyContact: {
      type: String,
      trim: true,
    },

    // Address during leave (optional)
    addressDuringLeave: {
      type: String,
      trim: true,
    },

    // Current status
    status: {
      type: String,
      enum: ['draft', 'pending', 'hod_approved', 'hod_rejected', 'manager_approved', 'manager_rejected', 'hr_approved', 'hr_rejected', 'principal_approved', 'principal_rejected', 'approved', 'rejected', 'cancelled'],
      default: 'draft',
    },

    // Workflow tracking
    workflow: {
      // Current step role in workflow (e.g. 'hod', 'hr')
      currentStepRole: {
        type: String,
        default: null,
      },

      // Next approver role (redundant with currentStepRole but kept for query ease)
      nextApproverRole: {
        type: String,
        default: null,
      },

      // LEGACY FIELDS (Kept for backward compatibility)
      currentStep: {
        type: String,
        default: 'employee'
      },
      nextApprover: {
        type: String,
        default: null
      },

      // Is the entire workflow completed?
      isCompleted: {
        type: Boolean,
        default: false,
      },

      // Dynamic Approval Chain (List of steps initialized from WorkflowDefinition)
      approvalChain: [
        {
          stepOrder: Number,
          role: String,      // e.g. 'hod'
          label: String,     // e.g. 'HOD Approval'
          status: {
            type: String,
            enum: ['pending', 'approved', 'rejected', 'skipped'],
            default: 'pending'
          },
          isCurrent: {
            type: Boolean,
            default: false
          },
          actionBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User'
          },
          actionByName: String,
          actionByRole: String,
          comments: String,
          updatedAt: Date
        }
      ],

      // Workflow history (log of all actions)
      history: [
        {
          step: String,
          action: {
            type: String,
            enum: ['submitted', 'approved', 'rejected', 'returned', 'cancelled', 'revoked', 'status_changed'],
          },
          actionBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
          },
          actionByName: String,
          actionByRole: String,
          comments: String,
          timestamp: {
            type: Date,
            default: Date.now,
          },
        },
      ],
    },

    // Approvals record
    approvals: {
      hod: {
        status: {
          type: String,
          enum: ['pending', 'approved', 'rejected', null],
          default: null,
        },
        approvedBy: {
          type: mongoose.Schema.Types.ObjectId,
          ref: 'User',
        },
        approvedAt: Date,
        comments: String,
      },
      manager: {
        status: {
          type: String,
          enum: ['pending', 'approved', 'rejected', null],
          default: null,
        },
        approvedBy: {
          type: mongoose.Schema.Types.ObjectId,
          ref: 'User',
        },
        approvedAt: Date,
        comments: String,
      },
      hr: {
        status: {
          type: String,
          enum: ['pending', 'approved', 'rejected', null],
          default: null,
        },
        approvedBy: {
          type: mongoose.Schema.Types.ObjectId,
          ref: 'User',
        },
        approvedAt: Date,
        comments: String,
      },
      final: {
        status: {
          type: String,
          enum: ['pending', 'approved', 'rejected', null],
          default: null,
        },
        approvedBy: {
          type: mongoose.Schema.Types.ObjectId,
          ref: 'User',
        },
        approvedAt: Date,
        comments: String,
      },
    },

    // Division at the time of application
    division_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Division',
    },
    division_name: {
      type: String,
      trim: true,
    },

    // Department at the time of application
    department: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Department',
    },
    department_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Department',
    },
    department_name: {
      type: String,
      trim: true,
    },

    // Designation at the time of application
    designation: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Designation',
    },

    // Attachments (medical certificates, etc.)
    attachments: [
      {
        name: String,
        url: String,
        type: String,
        uploadedAt: {
          type: Date,
          default: Date.now,
        },
      },
    ],

    // Applied by (the user who submitted)
    appliedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },

    // Applied at timestamp
    appliedAt: {
      type: Date,
    },

    // Cancellation details
    cancellation: {
      cancelledBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
      },
      cancelledAt: Date,
      reason: String,
    },

    // Leave Split Fields
    // Whether this leave can be split by approvers
    allowSplitting: {
      type: Boolean,
      default: true,
    },

    // Split status (null = not split, 'pending_split' = split in progress, 'split_approved' = split completed)
    splitStatus: {
      type: String,
      enum: [null, 'pending_split', 'split_approved', 'split_rejected'],
      default: null,
    },

    // Original leave type (preserved for audit - what employee originally applied for)
    originalLeaveType: {
      type: String,
      trim: true,
      uppercase: true,
    },

    // Who performed the split
    splitBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },

    splitByName: String,
    splitByRole: String,

    // When split was performed
    splitAt: {
      type: Date,
      default: null,
    },

    // Notes about the split
    splitNotes: {
      type: String,
      trim: true,
      default: null,
    },

    // Split history for audit trail
    splitHistory: [
      {
        action: {
          type: String,
          enum: ['split_created', 'split_modified', 'split_approved', 'split_rejected'],
          required: true,
        },
        actionBy: {
          type: mongoose.Schema.Types.ObjectId,
          ref: 'User',
        },
        actionByName: String,
        actionByRole: String,
        actionAt: {
          type: Date,
          default: Date.now,
        },
        originalDays: Number, // Original number of days applied
        splits: [
          {
            date: Date,
            leaveType: String,
            isHalfDay: Boolean,
            halfDayType: String,
            status: String,
            numberOfDays: Number,
          },
        ],
        notes: String,
      },
    ],

    // Is this leave active (not deleted)
    isActive: {
      type: Boolean,
      default: true,
    },

    // Financial year reference
    financialYear: {
      type: String, // e.g., "2024-2025"
    },

    // Notes/remarks
    remarks: {
      type: String,
      trim: true,
    },

    // Change tracking history (max 2-3 changes)
    changeHistory: [
      {
        field: {
          type: String,
          required: true,
        },
        originalValue: {
          type: mongoose.Schema.Types.Mixed,
        },
        newValue: {
          type: mongoose.Schema.Types.Mixed,
        },
        modifiedBy: {
          type: mongoose.Schema.Types.ObjectId,
          ref: 'User',
        },
        modifiedByName: String,
        modifiedByRole: String,
        modifiedAt: {
          type: Date,
          default: Date.now,
        },
        reason: String, // Optional reason for change
      },
    ],
  },
  {
    timestamps: true,
  }
);

// Indexes for faster queries
LeaveSchema.index({ employeeId: 1, status: 1 });
LeaveSchema.index({ emp_no: 1 });
LeaveSchema.index({ department: 1, status: 1 });
LeaveSchema.index({ fromDate: 1, toDate: 1 });
LeaveSchema.index({ status: 1, 'workflow.nextApprover': 1 });
LeaveSchema.index({ appliedAt: -1 });

// Calculate number of days before save
LeaveSchema.pre('save', function () {
  if (this.isModified('fromDate') || this.isModified('toDate')) {
    if (this.fromDate && this.toDate) {
      const diffTime = Math.abs(this.toDate - this.fromDate);
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1; // +1 to include both days

      if (this.isHalfDay) {
        this.numberOfDays = 0.5;
      } else {
        this.numberOfDays = diffDays;
      }
    }
  }

  // Preserve original leave type on first save if not set
  if (this.isNew && !this.originalLeaveType && this.leaveType) {
    this.originalLeaveType = this.leaveType;
  }

  // No need to call next() - Mongoose handles this automatically for synchronous middleware
});

// Virtual for display name
LeaveSchema.virtual('statusDisplay').get(function () {
  const statusMap = {
    draft: 'Draft',
    pending: 'Pending',
    hod_approved: 'HOD Approved',
    hod_rejected: 'HOD Rejected',
    manager_approved: 'Manager Approved',
    manager_rejected: 'Manager Rejected',
    hr_approved: 'HR Approved',
    hr_rejected: 'HR Rejected',
    approved: 'Approved',
    rejected: 'Rejected',
    cancelled: 'Cancelled',
  };
  return statusMap[this.status] || this.status;
});

// Method to check if leave can be edited
LeaveSchema.methods.canEdit = function () {
  return ['draft', 'pending'].includes(this.status);
};

// Method to check if leave can be cancelled
LeaveSchema.methods.canCancel = function () {
  return ['draft', 'pending', 'hod_approved'].includes(this.status);
};

// Static method to get pending approvals for a role
LeaveSchema.statics.getPendingForRole = async function (role, departmentIds = []) {
  const query = {
    isActive: true,
    'workflow.nextApprover': role,
  };

  if (departmentIds.length > 0) {
    query.department = { $in: departmentIds };
  }

  return this.find(query)
    .populate('employeeId', 'employee_name emp_no')
    .populate('department', 'name')
    .populate('designation', 'name')
    .sort({ appliedAt: -1 });
};

// Post-save hook to update monthly attendance summary and leave records when leave status changes
LeaveSchema.post('save', async function () {
  try {
    // Update monthly attendance summary when leave is approved
    if (this.status === 'approved' && this.isModified('status')) {
      const { recalculateOnLeaveApproval } = require('../../attendance/services/summaryCalculationService');
      await recalculateOnLeaveApproval(this);
    }

    // Update monthly leave record for any status change (approved, rejected, cancelled)
    if (this.isModified('status')) {
      const { updateMonthlyRecordOnLeaveAction } = require('../services/leaveBalanceService');
      let action = null;

      if (this.status === 'approved' || this.status === 'hod_approved' || this.status === 'hr_approved') {
        action = 'approved';
      } else if (this.status === 'rejected' || this.status === 'hod_rejected' || this.status === 'hr_rejected') {
        action = 'rejected';
      } else if (this.status === 'cancelled') {
        action = 'cancelled';
      }

      if (action) {
        await updateMonthlyRecordOnLeaveAction(this, action);
      }
    }

    // Auto-sync pay register when leave is approved/rejected/cancelled
    if (this.isModified('status') && (this.status === 'approved' || this.status === 'hr_approved' || this.status === 'hod_approved' || this.status === 'rejected' || this.status === 'cancelled')) {
      const { syncPayRegisterFromLeave } = require('../../pay-register/services/autoSyncService');
      await syncPayRegisterFromLeave(this);
    }
  } catch (error) {
    // Don't throw - this is a background operation
    console.error('Error updating monthly summary/leave record on leave status change:', error);
  }
});

module.exports = mongoose.models.Leave || mongoose.model('Leave', LeaveSchema);

