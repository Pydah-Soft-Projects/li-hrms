/**
 * Permission Model
 * Stores permission requests for employees to go outside during shift hours
 */

const mongoose = require('mongoose');
const crypto = require('crypto');

const permissionSchema = new mongoose.Schema(
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

    // Date of permission (YYYY-MM-DD)
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

    // Permission time range
    permissionStartTime: {
      type: Date,
      required: [true, 'Permission start time is required'],
    },

    permissionEndTime: {
      type: Date,
      required: [true, 'Permission end time is required'],
    },

    // Calculated permission hours
    permissionHours: {
      type: Number,
      required: true,
      min: 0,
    },

    // Purpose/reason for permission
    purpose: {
      type: String,
      required: [true, 'Purpose is required'],
      trim: true,
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

    // QR Code for outpass
    qrCode: {
      type: String,
      unique: true,
      sparse: true,
      default: null,
    },

    // Outpass URL (public URL accessible via QR)
    outpassUrl: {
      type: String,
      default: null,
    },

    // QR code expiry (default: end of permission day)
    qrExpiry: {
      type: Date,
      default: null,
    },

    // Comments/notes
    comments: {
      type: String,
      trim: true,
      default: null,
    },

    // Deduction amount (if permission deduction is enabled)
    deductionAmount: {
      type: Number,
      default: 0,
      min: 0,
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
  },
  {
    timestamps: true,
  }
);

// Indexes
permissionSchema.index({ employeeId: 1, date: 1 });
permissionSchema.index({ employeeNumber: 1, date: 1 });
permissionSchema.index({ status: 1, date: -1 });
permissionSchema.index({ date: 1 });
permissionSchema.index({ qrCode: 1 });

// Method to calculate permission hours
permissionSchema.methods.calculatePermissionHours = function () {
  if (this.permissionStartTime && this.permissionEndTime) {
    const diffMs = this.permissionEndTime.getTime() - this.permissionStartTime.getTime();
    const diffHours = diffMs / (1000 * 60 * 60);
    this.permissionHours = Math.round(diffHours * 100) / 100; // Round to 2 decimal places
    return this.permissionHours;
  }
  return 0;
};

// Method to generate QR code
permissionSchema.methods.generateQRCode = function () {
  // Generate unique QR code using crypto
  const randomBytes = crypto.randomBytes(16);
  this.qrCode = randomBytes.toString('hex');

  // Set outpass URL (will be set by controller based on app URL)
  // Format: /api/permissions/outpass/{qrCode}

  // Set expiry to end of permission day
  const permissionDate = new Date(this.date);
  permissionDate.setHours(23, 59, 59, 999);
  this.qrExpiry = permissionDate;

  return this.qrCode;
};

// Pre-save hook to calculate permission hours
permissionSchema.pre('save', function () {
  if (this.permissionStartTime && this.permissionEndTime && !this.permissionHours) {
    this.calculatePermissionHours();
  }
});

module.exports = mongoose.models.Permission || mongoose.model('Permission', permissionSchema);

