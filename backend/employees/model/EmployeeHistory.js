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
                'employee_updated',
                // Resignation lifecycle
                'resignation_submitted',
                'resignation_step_approved',
                'resignation_step_rejected',
                'resignation_final_approved',
                'resignation_rejected',
                // Left date / separation changes
                'left_date_set',
                'left_date_cleared',
                // Leave lifecycle
                'leave_applied',
                'leave_approved',
                'leave_rejected',
                // OD lifecycle
                'od_applied',
                'od_approved',
                'od_rejected',
                // Credentials & access
                'credentials_resent',
                'password_reset',
                // User / role lifecycle
                'user_promoted',
                'user_demoted',
                'user_activated',
                'user_deactivated',
                'user_deleted',
            ],
            required: true,
        },
        performedBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
            required: true,
        },
        performedByName: {
            type: String,
            trim: true,
            default: null,
        },
        performedByRole: {
            type: String,
            trim: true,
            default: null,
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
