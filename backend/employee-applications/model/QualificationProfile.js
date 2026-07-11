/**
 * Scoped qualification configuration (division / department / designation combinations).
 * Falls back through resolution chain, then global EmployeeApplicationFormSettings.
 */

const mongoose = require('mongoose');
const { SCOPE_TYPES, buildScopeKey, inferLegacyScopeType } = require('../services/qualificationProfileScope');

const qualificationFieldSchema = new mongoose.Schema(
  {
    id: { type: String, required: true, trim: true },
    label: { type: String, required: true, trim: true },
    type: {
      type: String,
      enum: ['text', 'textarea', 'number', 'date', 'time', 'email', 'tel', 'select', 'multiselect', 'radio', 'boolean', 'scale', 'rating', 'radio_grid', 'checkbox_grid'],
      required: true,
    },
    isRequired: { type: Boolean, default: false },
    isEnabled: { type: Boolean, default: true },
    placeholder: { type: String, default: '' },
    validation: {
      minLength: Number,
      maxLength: Number,
      min: Number,
      max: Number,
      step: Number,
      minLabel: String,
      maxLabel: String,
      minSelections: Number,
      maxSelections: Number,
    },
    options: [{ label: String, value: String }],
    gridRows: { type: [String], default: undefined },
    order: { type: Number, default: 0 },
  },
  { _id: false }
);

const qualificationProfileSchema = new mongoose.Schema(
  {
    scopeType: {
      type: String,
      enum: SCOPE_TYPES,
      required: true,
    },
    scopeKey: {
      type: String,
      required: true,
      trim: true,
    },
    division_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Division',
      default: null,
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
    isEnabled: { type: Boolean, default: true },
    enableCertificateUpload: { type: Boolean, default: false },
    fields: { type: [qualificationFieldSchema], default: [] },
    defaultRows: { type: [mongoose.Schema.Types.Mixed], default: [] },
    isActive: { type: Boolean, default: true },
    updatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
  },
  { timestamps: true }
);

qualificationProfileSchema.index(
  { scopeKey: 1 },
  { unique: true, partialFilterExpression: { isActive: true } }
);
qualificationProfileSchema.index({ scopeType: 1, isActive: 1 });
qualificationProfileSchema.index({ division_id: 1, isActive: 1 });
qualificationProfileSchema.index({ department_id: 1, isActive: 1 });
qualificationProfileSchema.index({ designation_id: 1, isActive: 1 });

qualificationProfileSchema.pre('validate', function ensureScopeKey() {
  const scopeType = this.scopeType || inferLegacyScopeType(this);
  if (scopeType && !this.scopeType) this.scopeType = scopeType;
  if (this.scopeType && !this.scopeKey) {
    this.scopeKey = buildScopeKey(this.scopeType, {
      division_id: this.division_id,
      department_id: this.department_id,
      designation_id: this.designation_id,
    });
  }
});

module.exports =
  mongoose.models.QualificationProfile ||
  mongoose.model('QualificationProfile', qualificationProfileSchema);
