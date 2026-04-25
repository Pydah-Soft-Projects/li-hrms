const mongoose = require('mongoose');

const PromotionTransferRequestSchema = new mongoose.Schema(
  {
    requestType: {
      type: String,
      enum: ['promotion', 'demotion', 'transfer', 'increment'],
      required: true,
    },
    employeeId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Employee',
      required: true,
    },
    emp_no: {
      type: String,
      required: true,
      trim: true,
      uppercase: true,
    },
    division_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Division',
    },
    department_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Department',
    },
    remarks: {
      type: String,
      trim: true,
      default: '',
    },
    status: {
      type: String,
      enum: ['pending', 'approved', 'rejected', 'cancelled'],
      default: 'pending',
    },
    requestedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    // Promotion: target gross salary after approval (previousGrossSalary stored for comparison)
    newGrossSalary: {
      type: Number,
      default: null,
    },
    /** For requestType increment: amount added to current gross. Also stored for audit on new increment requests. */
    incrementAmount: {
      type: Number,
      default: null,
    },
    effectivePayrollYear: {
      type: Number,
      default: null,
    },
    effectivePayrollMonth: {
      type: Number,
      min: 1,
      max: 12,
      default: null,
    },
    proposedDesignationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Designation',
      default: null,
    },
    previousGrossSalary: {
      type: Number,
      default: null,
    },
    previousDesignationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Designation',
      default: null,
    },
    // Transfer: explicit from/to org fields
    fromDivisionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Division',
      default: null,
    },
    fromDepartmentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Department',
      default: null,
    },
    fromDesignationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Designation',
      default: null,
    },
    toDivisionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Division',
      default: null,
    },
    toDepartmentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Department',
      default: null,
    },
    toDesignationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Designation',
      default: null,
    },
    workflow: {
      currentStepRole: String,
      nextApproverRole: String,
      isCompleted: { type: Boolean, default: false },
      approvalChain: [
        {
          stepOrder: Number,
          role: String,
          label: String,
          status: { type: String, enum: ['pending', 'approved', 'rejected', 'skipped'], default: 'pending' },
          actionBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
          actionByName: String,
          actionByRole: String,
          comments: String,
          updatedAt: Date,
        },
      ],
      finalAuthority: String,
      reportingManagerIds: [String],
      history: [
        {
          step: String,
          action: {
            type: String,
            enum: ['submitted', 'approved', 'rejected', 'cancelled', 'updated'],
          },
          actionBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
          actionByName: String,
          actionByRole: String,
          comments: String,
          timestamp: { type: Date, default: Date.now },
        },
      ],
    },
  },
  { timestamps: true }
);

PromotionTransferRequestSchema.index({ employeeId: 1 });
PromotionTransferRequestSchema.index({ status: 1 });
PromotionTransferRequestSchema.index({ emp_no: 1 });

module.exports =
  mongoose.models.PromotionTransferRequest ||
  mongoose.model('PromotionTransferRequest', PromotionTransferRequestSchema);
