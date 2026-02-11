/**
 * CCL (Compensatory Casual Leave) Request Model
 * For employees who worked on a holiday or weekly off day
 * Single day only; workflow same as Leave/OD
 */

const mongoose = require('mongoose');

const cclRequestSchema = new mongoose.Schema(
  {
    // Employee who worked on holiday/week-off
    employeeId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Employee',
      required: [true, 'Employee is required'],
    },

    emp_no: {
      type: String,
      required: true,
      trim: true,
      uppercase: true,
    },

    // Single date worked (YYYY-MM-DD)
    date: {
      type: String,
      required: [true, 'Date is required'],
      index: true,
    },

    // Full or half day
    isHalfDay: {
      type: Boolean,
      required: true,
      default: false,
    },

    // If half day: first_half or second_half (optional)
    halfDayType: {
      type: String,
      enum: ['first_half', 'second_half', null],
      default: null,
    },

    // Attendance data (from punch/thumb records if available)
    inTime: {
      type: Date,
      default: null,
    },
    outTime: {
      type: Date,
      default: null,
    },
    totalHours: {
      type: Number,
      default: null,
      min: 0,
    },

    // Note when no punch records detected
    attendanceNote: {
      type: String,
      trim: true,
      default: null,
    },

    // Who assigned/asked the employee to work (assignor)
    assignedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'Assigned by is required'],
    },

    // Reason / what they did on that day (required)
    purpose: {
      type: String,
      required: [true, 'Purpose/reason is required'],
      trim: true,
      maxlength: [500, 'Purpose cannot exceed 500 characters'],
    },

    // Status
    status: {
      type: String,
      enum: ['draft', 'pending', 'reporting_manager_approved', 'reporting_manager_rejected', 'hod_approved', 'hod_rejected', 'manager_approved', 'manager_rejected', 'hr_approved', 'hr_rejected', 'approved', 'rejected', 'cancelled'],
      default: 'draft',
      index: true,
    },

    // Workflow (same as Leave/OD)
    workflow: {
      currentStepRole: { type: String, default: null },
      nextApproverRole: { type: String, default: null },
      currentStep: { type: String, default: 'employee' },
      nextApprover: { type: String, default: null },
      reportingManagerIds: [String],
      isCompleted: { type: Boolean, default: false },
      approvalChain: [
        {
          stepOrder: Number,
          role: String,
          label: String,
          status: { type: String, enum: ['pending', 'approved', 'rejected', 'skipped'], default: 'pending' },
          isCurrent: { type: Boolean, default: false },
          actionBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
          actionByName: String,
          actionByRole: String,
          comments: String,
          updatedAt: Date,
        },
      ],
      history: [
        {
          step: String,
          action: { type: String, enum: ['submitted', 'approved', 'rejected', 'returned', 'cancelled', 'revoked', 'status_changed'] },
          actionBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
          actionByName: String,
          actionByRole: String,
          comments: String,
          timestamp: { type: Date, default: Date.now },
        },
      ],
    },

    // Division/Department at time of application
    division_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Division',
    },
    division_name: { type: String, trim: true },
    department_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Department',
    },
    department_name: { type: String, trim: true },

    // Applied by (who submitted)
    appliedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },

    appliedAt: {
      type: Date,
      default: Date.now,
    },

    isActive: {
      type: Boolean,
      default: true,
    },

    remarks: {
      type: String,
      trim: true,
    },
  },
  { timestamps: true }
);

cclRequestSchema.index({ employeeId: 1, date: 1 });
cclRequestSchema.index({ date: 1 });
cclRequestSchema.index({ status: 1, date: -1 });

module.exports = mongoose.models.CCLRequest || mongoose.model('CCLRequest', cclRequestSchema);
