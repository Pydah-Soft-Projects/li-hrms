const mongoose = require('mongoose');

const assetAssignmentSchema = new mongoose.Schema(
  {
    asset: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Asset',
      required: [true, 'Asset is required'],
      index: true,
    },
    employee: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Employee',
      required: [true, 'Employee is required'],
      index: true,
    },
    division_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Division',
      default: null,
      index: true,
    },
    department_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Department',
      default: null,
      index: true,
    },
    assignedAt: {
      type: Date,
      required: [true, 'Assigned date is required'],
      default: Date.now,
    },
    assignmentPhotoUrl: {
      type: String,
      trim: true,
      default: null,
    },
    assignmentSignatureUrl: {
      type: String,
      trim: true,
      default: null,
    },
    expectedReturnDate: {
      type: Date,
      default: null,
    },
    assignmentNotes: {
      type: String,
      trim: true,
      default: '',
    },
    returnedAt: {
      type: Date,
      default: null,
    },
    returnPhotoUrl: {
      type: String,
      trim: true,
      default: null,
    },
    returnSignatureUrl: {
      type: String,
      trim: true,
      default: null,
    },
    returnNotes: {
      type: String,
      trim: true,
      default: '',
    },
    status: {
      type: String,
      enum: ['assigned', 'returned'],
      default: 'assigned',
      index: true,
    },
    issuedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    returnedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

assetAssignmentSchema.index({ asset: 1, status: 1 });
assetAssignmentSchema.index({ employee: 1, status: 1 });
assetAssignmentSchema.index({ assignedAt: -1 });

module.exports = mongoose.models.AssetAssignment || mongoose.model('AssetAssignment', assetAssignmentSchema);
