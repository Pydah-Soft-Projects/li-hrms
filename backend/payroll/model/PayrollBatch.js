const mongoose = require('mongoose');

// Status History Schema
const statusHistorySchema = new mongoose.Schema({
    status: {
        type: String,
        enum: ['pending', 'approved', 'freeze', 'complete'],
        required: true
    },
    changedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    changedAt: {
        type: Date,
        default: Date.now
    },
    reason: String
}, { _id: false });

// Recalculation Permission Schema
const recalculationPermissionSchema = new mongoose.Schema({
    granted: {
        type: Boolean,
        default: false
    },
    grantedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    },
    grantedAt: Date,
    expiresAt: Date,
    reason: String,
    requestedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    },
    requestedAt: Date
}, { _id: false });

// Recalculation Change Schema
const recalculationChangeSchema = new mongoose.Schema({
    employeeId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Employee'
    },
    field: String,
    oldValue: mongoose.Schema.Types.Mixed,
    newValue: mongoose.Schema.Types.Mixed
}, { _id: false });

// Recalculation History Schema
const recalculationHistorySchema = new mongoose.Schema({
    recalculatedAt: {
        type: Date,
        default: Date.now
    },
    recalculatedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    reason: String,
    previousSnapshot: {
        totalGrossSalary: Number,
        totalDeductions: Number,
        totalNetSalary: Number,
        totalArrears: Number,
        employeeCount: Number,
        employeePayrolls: [mongoose.Schema.Types.Mixed] // Snapshot of changed payrolls
    },
    changes: [recalculationChangeSchema]
}, { timestamps: true });

// Validation Status Schema
const validationStatusSchema = new mongoose.Schema({
    allEmployeesCalculated: {
        type: Boolean,
        default: false
    },
    missingEmployees: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Employee'
    }],
    lastValidatedAt: Date
}, { _id: false });

// Main PayrollBatch Schema
const payrollBatchSchema = new mongoose.Schema({
    batchNumber: {
        type: String,
        required: true,
        unique: true,
        index: true
    },
    department: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Department',
        required: true,
        index: true
    },
    month: {
        type: String, // YYYY-MM
        required: true,
        index: true
    },
    year: {
        type: Number,
        required: true
    },
    monthNumber: {
        type: Number,
        required: true,
        min: 1,
        max: 12
    },

    // Employee Payrolls
    employeePayrolls: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'PayrollRecord'
    }],
    totalEmployees: {
        type: Number,
        default: 0
    },

    // Financial Summary
    totalGrossSalary: {
        type: Number,
        default: 0
    },
    totalDeductions: {
        type: Number,
        default: 0
    },
    totalNetSalary: {
        type: Number,
        default: 0
    },
    totalArrears: {
        type: Number,
        default: 0
    },

    // Status Management
    status: {
        type: String,
        enum: ['pending', 'approved', 'freeze', 'complete'],
        default: 'pending',
        index: true
    },
    statusHistory: [statusHistorySchema],

    // Recalculation Permission
    recalculationPermission: recalculationPermissionSchema,

    // Recalculation History
    recalculationHistory: [recalculationHistorySchema],

    // Validation
    validationStatus: validationStatusSchema,

    // Audit Trail
    createdBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    approvedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    },
    approvedAt: Date,
    freezedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    },
    freezedAt: Date,
    completedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    },
    completedAt: Date
}, {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true }
});

// Indexes for performance
payrollBatchSchema.index({ department: 1, month: 1 });
payrollBatchSchema.index({ status: 1, month: 1 });
payrollBatchSchema.index({ createdAt: -1 });

// Virtual for month name
payrollBatchSchema.virtual('monthName').get(function () {
    const date = new Date(this.year, this.monthNumber - 1);
    return date.toLocaleString('default', { month: 'long', year: 'numeric' });
});

// Static method to generate batch number
payrollBatchSchema.statics.generateBatchNumber = async function (departmentId, month) {
    const Department = mongoose.model('Department');
    const dept = await Department.findById(departmentId);
    const deptCode = dept?.code || 'DEPT';

    const [year, monthNum] = month.split('-');
    const prefix = `PB-${deptCode}-${year}-${monthNum}`;

    // Find the last batch number for this department and month
    const lastBatch = await this.findOne({
        batchNumber: new RegExp(`^${prefix}`)
    }).sort({ batchNumber: -1 });

    let sequence = 1;
    if (lastBatch) {
        const lastSequence = parseInt(lastBatch.batchNumber.split('-').pop());
        sequence = lastSequence + 1;
    }

    return `${prefix}-${String(sequence).padStart(3, '0')}`;
};

// Instance method to check if recalculation permission is valid
payrollBatchSchema.methods.hasValidRecalculationPermission = function () {
    if (!this.recalculationPermission || !this.recalculationPermission.granted) {
        return false;
    }

    if (this.recalculationPermission.expiresAt && new Date() > this.recalculationPermission.expiresAt) {
        return false;
    }

    return true;
};

// Instance method to revoke recalculation permission
payrollBatchSchema.methods.revokeRecalculationPermission = function () {
    this.recalculationPermission.granted = false;
    this.recalculationPermission.grantedBy = null;
    this.recalculationPermission.grantedAt = null;
    this.recalculationPermission.expiresAt = null;
    this.recalculationPermission.reason = null;
};

// Instance method to validate batch
payrollBatchSchema.methods.validateBatch = async function () {
    const Employee = mongoose.model('Employee');
    const PayrollRecord = mongoose.model('PayrollRecord');

    // Get all active employees in department
    const allEmployees = await Employee.find({
        department_id: this.department,
        is_active: true
    }).select('_id');

    const allEmployeeIds = allEmployees.map(e => e._id.toString());

    // Get employees with payroll in this batch
    // We need to find the PayrollRecords that correspond to the IDs in this.employeePayrolls
    // and see which employeeIds they belong to.
    const payrollRecords = await PayrollRecord.find({
        _id: { $in: this.employeePayrolls }
    }).select('employeeId');

    const payrollEmployeeIds = payrollRecords.map(p => p.employeeId.toString());

    // Find missing employees
    const missingEmployeeIds = allEmployeeIds.filter(id => !payrollEmployeeIds.includes(id));

    this.validationStatus = {
        allEmployeesCalculated: missingEmployeeIds.length === 0,
        missingEmployees: missingEmployeeIds,
        lastValidatedAt: new Date()
    };

    // Save the updated validation status
    await this.save();

    return this.validationStatus;
};

// Kept for backward compatibility if called as validate() elsewhere, but standardizing naming
payrollBatchSchema.methods.validate = payrollBatchSchema.methods.validateBatch;

// Pre-save hook to update totals
// Pre-save hook to update totals
payrollBatchSchema.pre('save', async function () {
    // Add initial status to history if new
    if (this.isNew && this.statusHistory.length === 0) {
        this.statusHistory.push({
            status: this.status,
            changedBy: this.createdBy,
            changedAt: new Date(),
            reason: 'Batch created'
        });
    }
});

module.exports = mongoose.models.PayrollBatch || mongoose.model('PayrollBatch', payrollBatchSchema);
