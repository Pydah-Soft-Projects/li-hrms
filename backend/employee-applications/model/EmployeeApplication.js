/**
 * Employee Application Model
 * Stores pending employee applications created by HR
 * Once approved by Superadmin, employee is created in both databases
 */

const mongoose = require('mongoose');

const employeeApplicationSchema = new mongoose.Schema(
  {
    // Application Status
    status: {
      type: String,
      enum: ['pending', 'approved', 'rejected'],
      default: 'pending',
    },

    // Employee Details (same as Employee model)
    emp_no: {
      type: String,
      required: [true, 'Employee number is required'],
      trim: true,
      uppercase: true,
    },
    employee_name: {
      type: String,
      required: [true, 'Employee name is required'],
      trim: true,
    },
    department_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Department',
      default: null,
    },
    designation_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Designation',
      default: null,
    },
    doj: {
      type: Date,
      default: null,
    },
    dob: {
      type: Date,
      default: null,
    },
    
    // Salary Fields
    proposedSalary: {
      type: Number,
      required: [true, 'Proposed salary is required'],
    },
    approvedSalary: {
      type: Number,
      default: null, // Set when superadmin approves/modifies
    },
    gross_salary: {
      type: Number,
      default: null, // Will be set to approvedSalary on approval
    },
    
    // Personal Information
    gender: {
      type: String,
      enum: ['Male', 'Female', 'Other', null],
      default: null,
    },
    marital_status: {
      type: String,
      enum: ['Single', 'Married', 'Divorced', 'Widowed', null],
      default: null,
    },
    blood_group: {
      type: String,
      enum: ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-', null],
      default: null,
    },
    qualifications: {
      type: String,
      trim: true,
      default: null,
    },
    experience: {
      type: Number,
      default: null,
    },
    address: {
      type: String,
      trim: true,
      default: null,
    },
    location: {
      type: String,
      trim: true,
      default: null,
    },
    aadhar_number: {
      type: String,
      trim: true,
      default: null,
    },
    phone_number: {
      type: String,
      trim: true,
      default: null,
    },
    alt_phone_number: {
      type: String,
      trim: true,
      default: null,
    },
    email: {
      type: String,
      trim: true,
      lowercase: true,
      default: null,
    },
    pf_number: {
      type: String,
      trim: true,
      default: null,
    },
    esi_number: {
      type: String,
      trim: true,
      default: null,
    },
    bank_account_no: {
      type: String,
      trim: true,
      default: null,
    },
    bank_name: {
      type: String,
      trim: true,
      default: null,
    },
    bank_place: {
      type: String,
      trim: true,
      default: null,
    },
    ifsc_code: {
      type: String,
      trim: true,
      uppercase: true,
      default: null,
    },
    paidLeaves: {
      type: Number,
      default: 0,
      min: 0,
    },
    // Yearly allotted leaves (combined total for all leave types with nature "without_pay" or "lop")
    allottedLeaves: {
      type: Number,
      default: 0,
      min: 0,
    },
    // Dynamic fields for configurable form fields
    dynamicFields: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },

    // Employee-level Allowance & Deduction Overrides (only store items the applicant edited)
    employeeAllowances: {
      type: [
        {
          masterId: { type: mongoose.Schema.Types.ObjectId, ref: 'AllowanceDeductionMaster' },
          code: { type: String, trim: true },
          name: { type: String, trim: true },
          category: { type: String, enum: ['allowance', 'deduction'] },
          type: { type: String, enum: ['fixed', 'percentage'] },
          amount: { type: Number, default: null }, // override amount if fixed
          percentage: { type: Number, default: null },
          percentageBase: { type: String, enum: ['basic', 'gross', null], default: null },
          minAmount: { type: Number, default: null },
          maxAmount: { type: Number, default: null },
          basedOnPresentDays: { type: Boolean, default: false },
          isOverride: { type: Boolean, default: true },
        },
      ],
      default: [],
    },
    employeeDeductions: {
      type: [
        {
          masterId: { type: mongoose.Schema.Types.ObjectId, ref: 'AllowanceDeductionMaster' },
          code: { type: String, trim: true },
          name: { type: String, trim: true },
          category: { type: String, enum: ['allowance', 'deduction'] },
          type: { type: String, enum: ['fixed', 'percentage'] },
          amount: { type: Number, default: null }, // override amount if fixed
          percentage: { type: Number, default: null },
          percentageBase: { type: String, enum: ['basic', 'gross', null], default: null },
          minAmount: { type: Number, default: null },
          maxAmount: { type: Number, default: null },
          basedOnPresentDays: { type: Boolean, default: false },
          isOverride: { type: Boolean, default: true },
        },
      ],
      default: [],
    },
    // Calculated salary fields (from allowances/deductions)
    ctcSalary: {
      type: Number,
      default: null, // Gross Salary + Total Allowances
    },
    calculatedSalary: {
      type: Number,
      default: null, // Gross Salary + Allowances - Deductions (Net Salary)
    },
    is_active: {
      type: Boolean,
      default: true,
    },

    // Application Workflow
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    approvedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    rejectedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    approvalComments: {
      type: String,
      trim: true,
      default: null,
    },
    rejectionComments: {
      type: String,
      trim: true,
      default: null,
    },
    approvedAt: {
      type: Date,
      default: null,
    },
    rejectedAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: {
      createdAt: 'created_at',
      updatedAt: 'updated_at',
    },
  }
);

// Indexes
employeeApplicationSchema.index({ status: 1 });
employeeApplicationSchema.index({ createdBy: 1 });
employeeApplicationSchema.index({ emp_no: 1 });

module.exports = mongoose.model('EmployeeApplication', employeeApplicationSchema);


