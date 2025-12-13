/**
 * MongoDB Employee Model
 * Mirrors the MSSQL employees table for dual database storage
 */

const mongoose = require('mongoose');

const employeeSchema = new mongoose.Schema(
  {
    emp_no: {
      type: String,
      required: [true, 'Employee number is required'],
      unique: true,
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
    gross_salary: {
      type: Number,
      default: null,
    },
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
      type: mongoose.Schema.Types.Mixed,
      default: null,
      // Supports both old string format and new array of objects format
      // Old format: "B.Tech, MBA" (string)
      // New format: [{ degree: "B.Tech", qualified_year: 2020 }, { degree: "MBA", qualified_year: 2022 }] (array)
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
    // Used for tracking and carry forward
    allottedLeaves: {
      type: Number,
      default: 0,
      min: 0,
    },

    // Employee-level Allowance & Deduction Overrides (only store items the employee edited)
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
    // Dynamic fields for configurable form fields
    dynamicFields: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
    is_active: {
      type: Boolean,
      default: true,
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
// Note: emp_no already has unique:true which creates an index
employeeSchema.index({ employee_name: 1 });
employeeSchema.index({ department_id: 1 });
employeeSchema.index({ designation_id: 1 });
employeeSchema.index({ is_active: 1 });
employeeSchema.index({ phone_number: 1 });
employeeSchema.index({ email: 1 });

// Virtual for department population
employeeSchema.virtual('department', {
  ref: 'Department',
  localField: 'department_id',
  foreignField: '_id',
  justOne: true,
});

// Virtual for designation population
employeeSchema.virtual('designation', {
  ref: 'Designation',
  localField: 'designation_id',
  foreignField: '_id',
  justOne: true,
});

// Virtual getter for unified qualifications (backward compatibility)
// Returns dynamicFields.qualifications if exists, otherwise falls back to old qualifications string
employeeSchema.virtual('getQualifications').get(function () {
  // Priority 1: Check dynamicFields.qualifications (new format - array of objects)
  if (this.dynamicFields?.qualifications && Array.isArray(this.dynamicFields.qualifications) && this.dynamicFields.qualifications.length > 0) {
    return this.dynamicFields.qualifications;
  }
  // Priority 2: Check root level qualifications (new format - array of objects)
  if (this.qualifications && Array.isArray(this.qualifications) && this.qualifications.length > 0) {
    return this.qualifications;
  }
  // Priority 3: Fallback to old string format at root level
  if (this.qualifications && typeof this.qualifications === 'string') {
    // Convert old string format to array format for backward compatibility
    return [{ degree: this.qualifications }];
  }
  // Return empty array if no qualifications found
  return [];
});

// Virtual getter for all data (permanent + dynamicFields merged)
// This provides a unified view of employee data
employeeSchema.virtual('allData').get(function () {
  const permanentFields = this.toObject({ virtuals: false });
  const { dynamicFields, _id, __v, ...permanentData } = permanentFields;
  
  // Merge dynamicFields into root level for easy access
  return {
    ...permanentData,
    ...(dynamicFields || {}),
    // Keep dynamicFields separate for reference
    dynamicFields: dynamicFields || {},
  };
});

// Method to get unified data (includes dynamicFields merged)
employeeSchema.methods.getUnifiedData = function () {
  const permanentFields = this.toObject({ virtuals: false });
  const { dynamicFields, _id, __v, ...permanentData } = permanentFields;
  
  return {
    ...permanentData,
    ...(dynamicFields || {}),
    dynamicFields: dynamicFields || {},
  };
};

// Method to get only permanent fields (for MSSQL sync)
employeeSchema.methods.getPermanentFields = function () {
  const allFields = this.toObject({ virtuals: false });
  const { dynamicFields, _id, __v, ...permanentFields } = allFields;
  return permanentFields;
};

// Ensure virtuals are included in JSON output
employeeSchema.set('toJSON', { virtuals: true });
employeeSchema.set('toObject', { virtuals: true });

module.exports = mongoose.models.Employee || mongoose.model('Employee', employeeSchema);

