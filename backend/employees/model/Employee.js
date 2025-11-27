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

// Ensure virtuals are included in JSON output
employeeSchema.set('toJSON', { virtuals: true });
employeeSchema.set('toObject', { virtuals: true });

module.exports = mongoose.models.Employee || mongoose.model('Employee', employeeSchema);

