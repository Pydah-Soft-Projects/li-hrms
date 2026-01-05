/**
 * Overtime (OT) Model
 * Stores overtime requests and approved overtime records
 */

const mongoose = require('mongoose');

const otSchema = new mongoose.Schema(
  {
    // Employee reference
    employeeId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Employee',
      required: [true, 'Employee is required'],
      index: true,
    },

    employeeNumber: {
      type: String,
      required: [true, 'Employee number is required'],
      trim: true,
      uppercase: true,
      index: true,
    },

    // Date of overtime (YYYY-MM-DD)
    date: {
      type: String,
      required: [true, 'Date is required'],
      index: true,
    },

    // Attendance record reference
    attendanceRecordId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'AttendanceDaily',
      default: null,
    },

    // Shift information
    shiftId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Shift',
      required: [true, 'Shift is required'],
    },

    // Employee's in-time for that day
    employeeInTime: {
      type: Date,
      required: true,
    },

    // Shift's normal end time (this becomes OT In Time)
    shiftEndTime: {
      type: String, // HH:mm format
      required: true,
    },

    // OT In Time (same as shift end time)
    otInTime: {
      type: Date,
      required: true,
    },

    // OT Out Time (entered by HOD)
    otOutTime: {
      type: Date,
      required: true,
    },

    // Calculated OT hours
    otHours: {
      type: Number,
      required: true,
      min: 0,
    },

    // Status: pending, approved, rejected
    status: {
      type: String,
      enum: ['pending', 'manager_approved', 'manager_rejected', 'approved', 'rejected'],
      default: 'pending',
      index: true,
    },

    // Request details
    requestedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },

    requestedAt: {
      type: Date,
      default: Date.now,
    },

    // Approval details
    approvedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },

    approvedAt: {
      type: Date,
      default: null,
    },

    // Rejection details
    rejectedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },

    rejectedAt: {
      type: Date,
      default: null,
    },

    rejectionReason: {
      type: String,
      trim: true,
      default: null,
    },

    // Comments/notes
    comments: {
      type: String,
      trim: true,
      default: null,
    },

    // ConfusedShift handling
    confusedShiftId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'ConfusedShift',
      default: null,
    },

    manuallySelectedShiftId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Shift',
      default: null, // Shift manually selected by HOD if ConfusedShift exists
    },

    // Conversion from Attendance Extra Hours
    convertedFromAttendance: {
      type: Boolean,
      default: false,
    },
    convertedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    convertedAt: {
      type: Date,
      default: null,
    },
    source: {
      type: String,
      enum: ['manual_request', 'attendance_conversion', 'auto_detected'],
      default: 'manual_request',
    },

    isActive: {
      type: Boolean,
      default: true,
    },

    // Geo Location Data
    geoLocation: {
      latitude: { type: Number },
      longitude: { type: Number },
      address: { type: String },
      capturedAt: { type: Date }
    },

    // Photo Evidence
    photoEvidence: {
      url: { type: String },
      key: { type: String },
      exifLocation: {
        latitude: { type: Number },
        longitude: { type: Number }
      }
    },

    // Dynamic Workflow Structure
    workflow: {
      currentStepRole: { type: String, default: 'hod' },
      nextApproverRole: { type: String, default: 'hod' },
      nextApprover: { type: String, default: 'hod' }, // Can be Role or Specific User ID
      isCompleted: { type: Boolean, default: false },
      finalAuthority: { type: String }, // Role that is the final stop
      approvalChain: [
        {
          stepOrder: Number,
          role: String,
          label: String,
          status: { type: String, enum: ['pending', 'approved', 'rejected', 'skipped', 'forwarded'], default: 'pending' },
          isCurrent: { type: Boolean, default: false },
          actionBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
          actionAt: Date,
          comments: String
        }
      ],
      history: [
        {
          step: String,
          action: String,
          actionBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
          actionByName: String,
          actionByRole: String,
          comments: String,
          timestamp: Date,
        }
      ]
    },
  },
  {
    timestamps: true,
  }
);

// Indexes
otSchema.index({ employeeId: 1, date: 1 });
otSchema.index({ employeeNumber: 1, date: 1 });
otSchema.index({ status: 1, date: -1 });
otSchema.index({ date: 1 });
otSchema.index({ attendanceRecordId: 1 });
otSchema.index({ convertedFromAttendance: 1 });
otSchema.index({ source: 1 });

// Method to calculate OT hours
otSchema.methods.calculateOTHours = function () {
  if (this.otInTime && this.otOutTime) {
    const diffMs = this.otOutTime.getTime() - this.otInTime.getTime();
    const diffHours = diffMs / (1000 * 60 * 60);
    this.otHours = Math.round(diffHours * 100) / 100; // Round to 2 decimal places
    return this.otHours;
  }
  return 0;
};

// Pre-save hook to calculate OT hours
otSchema.pre('save', function () {
  if (this.otInTime && this.otOutTime && !this.otHours) {
    this.calculateOTHours();
  }
});

// Post-save hook to auto-sync pay register when OT is approved
otSchema.post('save', async function () {
  try {
    // Auto-sync pay register when OT is approved/rejected
    if (this.isModified('status') && (this.status === 'approved' || this.status === 'rejected')) {
      const { syncPayRegisterFromOT } = require('../../pay-register/services/autoSyncService');
      await syncPayRegisterFromOT(this);
    }
  } catch (error) {
    // Don't throw - this is a background operation
    console.error('Error syncing pay register from OT:', error);
  }
});

module.exports = mongoose.models.OT || mongoose.model('OT', otSchema);

