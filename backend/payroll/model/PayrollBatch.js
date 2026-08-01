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

// Missing employee snapshot for validation UI / approval errors
const missingEmployeeDetailSchema = new mongoose.Schema({
    employeeId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Employee'
    },
    emp_no: String,
    employee_name: String,
    department_name: String,
    designation_name: String,
    doj: String,
}, { _id: false });

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
    missingEmployeeDetails: [missingEmployeeDetailSchema],
    approvedWithExclusions: {
        type: Boolean,
        default: false
    },
    excludedEmployeeCount: Number,
    excludedEmployeeDetails: [missingEmployeeDetailSchema],
    salaryPendingEmployees: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Employee'
    }],
    salaryPendingEmployeeDetails: [missingEmployeeDetailSchema],
    salaryHeldEmployees: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Employee'
    }],
    salaryHeldEmployeeDetails: [missingEmployeeDetailSchema],
    continuousAbsentEmployees: [{
        emp_no: String,
        employee_name: String,
        employeeId: { type: mongoose.Schema.Types.ObjectId, ref: 'Employee' },
        fromDate: String,
        toDate: String,
        days: Number,
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
    // Division Context (New Hierarchy Support)
    division: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Division',
        index: true
    },
    department: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Department',
        required: [true, 'Department context is required'],
        index: true
    },
    scope: {
        type: String,
        enum: ['department', 'division'], // Future-proofing: currently strictly 'department' (dept-in-div)
        default: 'department'
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
// Compound index to ensure one batch per department per division per month
// Updated for Division Hierarchy integration
payrollBatchSchema.index({ division: 1, department: 1, month: 1, year: 1 }, { unique: true });
payrollBatchSchema.index({ status: 1, month: 1 });
payrollBatchSchema.index({ createdAt: -1 });

// Virtual for month name
payrollBatchSchema.virtual('monthName').get(function () {
    const date = new Date(this.year, this.monthNumber - 1);
    return date.toLocaleString('default', { month: 'long', year: 'numeric' });
});

// Static method to generate batch number
payrollBatchSchema.statics.generateBatchNumber = async function (departmentId, divisionId, month) {
    const Department = mongoose.model('Department');
    const Division = mongoose.model('Division');

    const [dept, div] = await Promise.all([
        Department.findById(departmentId),
        Division.findById(divisionId)
    ]);

    const deptCode = dept?.code || 'DEPT';
    const divCode = div?.code || 'DIV';

    const [year, monthNum] = month.split('-');
    // Batch Number Format: PB-DIV-DEPT-YYYY-MM-SEQ
    const prefix = `PB-${divCode}-${deptCode}-${year}-${monthNum}`;

    // Find the last batch number for this prefix
    const lastBatch = await this.findOne({
        batchNumber: new RegExp(`^${prefix}`)
    }).sort({ batchNumber: -1 });

    let sequence = 1;
    if (lastBatch) {
        // Extract sequence from the end
        const parts = lastBatch.batchNumber.split('-');
        const lastSequence = parseInt(parts[parts.length - 1]);
        if (!isNaN(lastSequence)) {
            sequence = lastSequence + 1;
        }
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

// Instance method to consume recalculation permission (single-use)
payrollBatchSchema.methods.consumeRecalculationPermission = function () {
    if (!this.recalculationPermission) return;
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
    const { getPayrollDateRange } = require('../../shared/utils/dateUtils');
    const { buildPayrollPeriodEmployeeQuery } = require('../services/payrollEmployeeQueryHelper');

    const [year, monthNum] = String(this.month || '').split('-').map(Number);
    const { startDate, endDate } = await getPayrollDateRange(year, monthNum);
    const rangeStart = new Date(startDate + 'T00:00:00.000Z');
    const rangeEnd = new Date(endDate + 'T23:59:59.999Z');

    // Same scope as pay register / bulk payroll: active or left in period, DOJ/leftDate bounds
    const empQuery = buildPayrollPeriodEmployeeQuery(
        this.division,
        this.department,
        rangeStart,
        rangeEnd
    );

    const allEmployees = await Employee.find(empQuery).select('_id emp_no employee_name salaryStatus');

    const salaryPendingEmployeeIds = allEmployees
        .filter((e) => e.salaryStatus !== 'approved')
        .map((e) => e._id.toString());
    const eligibleEmployeeIds = allEmployees
        .filter((e) => e.salaryStatus === 'approved')
        .map((e) => e._id.toString());

    // Get employees with payroll in this batch
    // We need to find the PayrollRecords that correspond to the IDs in this.employeePayrolls
    // and see which employeeIds they belong to.
    const payrollRecords = await PayrollRecord.find({
        _id: { $in: this.employeePayrolls }
    })
        .select('employeeId salaryOnHold salaryHoldReason salaryHeldAt emp_no')
        .populate({
            path: 'employeeId',
            select: 'emp_no employee_name department_id designation_id doj',
            populate: [
                { path: 'department_id', select: 'name' },
                { path: 'designation_id', select: 'name' },
            ],
        });

    const payrollEmployeeIds = payrollRecords.map(p => p.employeeId?._id?.toString?.() || p.employeeId.toString());

    // Missing payroll only among salary-approved employees in scope
    const missingEmployeeIds = eligibleEmployeeIds.filter((id) => !payrollEmployeeIds.includes(id));

    const {
        resolveMissingEmployeeDetails,
    } = require('../utils/payrollBatchValidationMessages');
    const { resolveSalaryPendingEmployeeDetails } = require('../../shared/utils/salaryPendingUtils');
    const { resolveSalaryHeldDetailsFromRecords } = require('../../shared/utils/salaryHoldUtils');
    const {
        buildIncompleteBatchAbsentScanRange,
        mapContinuousAbsentForEmployees,
    } = require('../../shared/utils/continuousAbsentUtils');

    const missingEmployeeDetails = await resolveMissingEmployeeDetails(missingEmployeeIds);
    const salaryPendingEmployeeDetails = await resolveSalaryPendingEmployeeDetails(salaryPendingEmployeeIds);
    const salaryHeldEmployeeDetails = await resolveSalaryHeldDetailsFromRecords(payrollRecords);
    const salaryHeldEmployeeIds = salaryHeldEmployeeDetails.map((d) => d.employeeId).filter(Boolean);

    let continuousAbsentEmployees = [];
    if (this.status !== 'complete') {
        const scan = buildIncompleteBatchAbsentScanRange(startDate, endDate);
        if (scan) {
            const absentMap = await mapContinuousAbsentForEmployees(
                allEmployees.map((e) => e.emp_no),
                scan.scanFrom,
                scan.scanTo,
                3
            );
            continuousAbsentEmployees = allEmployees
                .map((e) => {
                    const w = absentMap.get(String(e.emp_no || '').toUpperCase());
                    if (!w?.active) return null;
                    return {
                        emp_no: e.emp_no,
                        employee_name: e.employee_name,
                        employeeId: e._id,
                        fromDate: w.fromDate,
                        toDate: w.toDate,
                        days: w.days,
                    };
                })
                .filter(Boolean)
                .sort((a, b) => String(a.emp_no).localeCompare(String(b.emp_no)));
        }
    }

    this.validationStatus = {
        allEmployeesCalculated: missingEmployeeIds.length === 0,
        missingEmployees: missingEmployeeIds,
        missingEmployeeDetails,
        salaryPendingEmployees: salaryPendingEmployeeIds,
        salaryPendingEmployeeDetails,
        salaryHeldEmployees: salaryHeldEmployeeIds,
        salaryHeldEmployeeDetails,
        continuousAbsentEmployees,
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
