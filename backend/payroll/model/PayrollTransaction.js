const mongoose = require('mongoose');

/**
 * Payroll Transaction Model
 * Stores individual transactions for audit trail
 */
const payrollTransactionSchema = new mongoose.Schema(
  {
    // Payroll record reference
    payrollRecordId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'PayrollRecord',
      required: [true, 'Payroll record is required'],
      index: true,
    },

    // Employee reference
    employeeId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Employee',
      required: [true, 'Employee is required'],
      index: true,
    },

    // Employee number
    emp_no: {
      type: String,
      required: true,
      index: true,
    },

    // Transaction type
    transactionType: {
      type: String,
      enum: [
        'basic_pay',
        'incentive',
        'ot_pay',
        'allowance',
        'deduction',
        'attendance_deduction',
        'permission_deduction',
        'leave_deduction',
        'loan_emi',
        'salary_advance',
        'net_salary',
      ],
      required: true,
    },

    // Transaction category
    category: {
      type: String,
      enum: ['earning', 'deduction', 'adjustment'],
      required: true,
    },

    // Description
    description: {
      type: String,
      required: true,
      trim: true,
    },

    // Amount (positive for earnings, negative for deductions)
    amount: {
      type: Number,
      required: true,
    },

    // Additional details (JSON)
    details: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },

    // Month
    month: {
      type: String,
      required: true,
      match: [/^\d{4}-\d{2}$/, 'Month must be in YYYY-MM format'],
      index: true,
    },

    // Created by
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
  },
  {
    timestamps: true,
  }
);

// Indexes
payrollTransactionSchema.index({ payrollRecordId: 1, transactionType: 1 });
payrollTransactionSchema.index({ employeeId: 1, month: 1 });
payrollTransactionSchema.index({ emp_no: 1, month: 1 });
payrollTransactionSchema.index({ category: 1 });

module.exports = mongoose.models.PayrollTransaction || mongoose.model('PayrollTransaction', payrollTransactionSchema);

