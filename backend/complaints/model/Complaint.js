const mongoose = require('mongoose');

const ComplaintSchema = new mongoose.Schema(
  {
    employeeId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Employee',
      required: [true, 'Employee is required'],
    },
    emp_no: {
      type: String,
      required: true,
    },
    employeeName: {
      type: String,
      required: true,
    },
    complaintType: {
      type: String,
      required: [true, 'Complaint type is required'],
      trim: true,
    },
    imageUrl: {
      type: String,
      default: null,
    },
    remarks: {
      type: String,
      required: [true, 'Remarks/Details are required'],
      trim: true,
      maxlength: [1000, 'Remarks cannot exceed 1000 characters'],
    },
    division_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Division',
    },
    division_name: {
      type: String,
      default: '',
    },
    department_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Department',
    },
    department_name: {
      type: String,
      default: '',
    },
    designation: {
      type: String,
      default: '',
    },
    appliedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    appliedAt: {
      type: Date,
      default: Date.now,
    },
    status: {
      type: String,
      enum: [
        'pending',
        'reporting_manager_approved',
        'reporting_manager_rejected',
        'hod_approved',
        'hod_rejected',
        'manager_approved',
        'manager_rejected',
        'hr_approved',
        'hr_rejected',
        'principal_approved',
        'principal_rejected',
        'approved',
        'rejected',
        'cancelled'
      ],
      default: 'pending',
    },
    workflow: {
      currentStepRole: {
        type: String,
        default: null,
      },
      nextApproverRole: {
        type: String,
        default: null,
      },
      approvalChain: [
        {
          stepOrder: Number,
          role: String,
          label: String,
          status: {
            type: String,
            enum: ['pending', 'approved', 'rejected'],
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
          updatedAt: Date,
          comments: String
        }
      ],
      reportingManagerIds: [String],
      finalAuthority: {
        type: String,
        default: 'hr',
      },
      history: [
        {
          step: String,
          action: String,
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
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  {
    timestamps: true,
  }
);

ComplaintSchema.index({ employeeId: 1, isActive: 1 });
ComplaintSchema.index({ emp_no: 1, isActive: 1 });
ComplaintSchema.index({ status: 1 });

module.exports = mongoose.models.Complaint || mongoose.model('Complaint', ComplaintSchema);
