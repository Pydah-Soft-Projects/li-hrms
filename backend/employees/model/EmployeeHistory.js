/**
 * Employee History Model
 * Tracks lifecycle events related to an employee, identified by emp_no.
 * This includes application creation, verification, and salary approval.
 */

const mongoose = require('mongoose');

const employeeHistorySchema = new mongoose.Schema(
    {
        emp_no: {
            type: String,
            required: [true, 'Employee number is required'],
            trim: true,
            uppercase: true,
        },
        event: {
            type: String,
            enum: [
                'application_created',
                'employee_verified',
                'salary_approved',
                'data_updated',
                'status_changed',
            ],
            required: true,
        },
        performedBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
            required: true,
        },
        details: {
            type: mongoose.Schema.Types.Mixed,
            default: {},
        },
        comments: {
            type: String,
            trim: true,
            default: null,
        },
        timestamp: {
            type: Date,
            default: Date.now,
        },
    },
    {
        timestamps: {
            createdAt: 'created_at',
            updatedAt: 'updated_at',
        },
    }
);

// Indexes for fast lookup by employee number
employeeHistorySchema.index({ emp_no: 1 });
employeeHistorySchema.index({ event: 1 });
employeeHistorySchema.index({ performedBy: 1 });
employeeHistorySchema.index({ timestamp: -1 });

module.exports = mongoose.models.EmployeeHistory || mongoose.model('EmployeeHistory', employeeHistorySchema);
