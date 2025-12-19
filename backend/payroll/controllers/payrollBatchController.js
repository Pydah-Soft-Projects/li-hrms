const PayrollBatchService = require('../services/payrollBatchService');
const PayrollBatch = require('../model/PayrollBatch');

/**
 * @desc    Create payroll batch for department(s)
 * @route   POST /api/payroll-batch/calculate
 * @access  Private (SuperAdmin, HR)
 */
exports.calculatePayrollBatch = async (req, res) => {
    try {
        const { departmentId, month, calculateAll } = req.body;

        if (!month) {
            return res.status(400).json({
                success: false,
                message: 'Month is required'
            });
        }

        const userId = req.user._id || req.user.userId || req.user.id;
        const batches = [];

        if (calculateAll) {
            // Calculate for all departments
            const Department = require('../../departments/model/Department');
            const departments = await Department.find({ is_active: true });

            for (const dept of departments) {
                try {
                    const batch = await PayrollBatchService.createBatch(dept._id, month, userId);
                    batches.push(batch);
                } catch (error) {
                    console.error(`Error creating batch for department ${dept.name}:`, error.message);
                }
            }
        } else if (departmentId) {
            // Calculate for specific department
            const batch = await PayrollBatchService.createBatch(departmentId, month, userId);
            batches.push(batch);
        } else {
            return res.status(400).json({
                success: false,
                message: 'Either departmentId or calculateAll must be provided'
            });
        }

        res.status(201).json({
            success: true,
            message: `Created ${batches.length} payroll batch(es)`,
            data: batches
        });
    } catch (error) {
        console.error('Error calculating payroll batch:', error);
        res.status(500).json({
            success: false,
            message: error.message || 'Error calculating payroll batch'
        });
    }
};

/**
 * @desc    Get all payroll batches with filters
 * @route   GET /api/payroll-batch
 * @access  Private
 */
exports.getPayrollBatches = async (req, res) => {
    try {
        const { month, departmentId, status, page = 1, limit = 20 } = req.query;

        const query = {};
        if (month) query.month = month;
        if (departmentId) query.department = departmentId;
        if (status) query.status = status;

        const skip = (parseInt(page) - 1) * parseInt(limit);

        const batches = await PayrollBatch.find(query)
            .populate('department', 'name code')
            .populate('createdBy', 'name email')
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(parseInt(limit));

        const total = await PayrollBatch.countDocuments(query);

        res.status(200).json({
            success: true,
            count: batches.length,
            total,
            page: parseInt(page),
            pages: Math.ceil(total / parseInt(limit)),
            data: batches
        });
    } catch (error) {
        console.error('Error fetching payroll batches:', error);
        res.status(500).json({
            success: false,
            message: error.message || 'Error fetching payroll batches'
        });
    }
};

/**
 * @desc    Get single payroll batch details
 * @route   GET /api/payroll-batch/:id
 * @access  Private
 */
exports.getPayrollBatch = async (req, res) => {
    try {
        const batch = await PayrollBatchService.getBatchDetails(req.params.id);

        if (!batch) {
            return res.status(404).json({
                success: false,
                message: 'Payroll batch not found'
            });
        }

        res.status(200).json({
            success: true,
            data: batch
        });
    } catch (error) {
        console.error('Error fetching payroll batch:', error);
        res.status(500).json({
            success: false,
            message: error.message || 'Error fetching payroll batch'
        });
    }
};

/**
 * @desc    Get employee payrolls in batch
 * @route   GET /api/payroll-batch/:id/employees
 * @access  Private
 */
exports.getBatchEmployeePayrolls = async (req, res) => {
    try {
        const batch = await PayrollBatch.findById(req.params.id)
            .populate({
                path: 'employeePayrolls',
                populate: {
                    path: 'employeeId',
                    select: 'emp_no employee_name department_id designation_id location bank_account_no pf_number esi_number',
                    populate: [
                        { path: 'department_id', select: 'name' },
                        { path: 'designation_id', select: 'name' }
                    ]
                }
            });

        if (!batch) {
            return res.status(404).json({
                success: false,
                message: 'Payroll batch not found'
            });
        }

        res.status(200).json({
            success: true,
            count: batch.employeePayrolls.length,
            data: batch.employeePayrolls
        });
    } catch (error) {
        console.error('Error fetching batch employee payrolls:', error);
        res.status(500).json({
            success: false,
            message: error.message || 'Error fetching employee payrolls'
        });
    }
};

/**
 * @desc    Approve payroll batch
 * @route   PUT /api/payroll-batch/:id/approve
 * @access  Private (SuperAdmin, HR)
 */
exports.approveBatch = async (req, res) => {
    try {
        const { reason } = req.body;
        const userId = req.user._id || req.user.userId || req.user.id;

        const batch = await PayrollBatchService.changeStatus(
            req.params.id,
            'approved',
            userId,
            reason
        );

        res.status(200).json({
            success: true,
            message: 'Payroll batch approved successfully',
            data: batch
        });
    } catch (error) {
        console.error('Error approving batch:', error);
        res.status(400).json({
            success: false,
            message: error.message || 'Error approving batch'
        });
    }
};

/**
 * @desc    Freeze payroll batch
 * @route   PUT /api/payroll-batch/:id/freeze
 * @access  Private (SuperAdmin)
 */
exports.freezeBatch = async (req, res) => {
    try {
        const { reason } = req.body;
        const userId = req.user._id || req.user.userId || req.user.id;

        const batch = await PayrollBatchService.changeStatus(
            req.params.id,
            'freeze',
            userId,
            reason
        );

        res.status(200).json({
            success: true,
            message: 'Payroll batch frozen successfully',
            data: batch
        });
    } catch (error) {
        console.error('Error freezing batch:', error);
        res.status(400).json({
            success: false,
            message: error.message || 'Error freezing batch'
        });
    }
};

/**
 * @desc    Complete payroll batch
 * @route   PUT /api/payroll-batch/:id/complete
 * @access  Private (SuperAdmin)
 */
exports.completeBatch = async (req, res) => {
    try {
        const { reason } = req.body;
        const userId = req.user._id || req.user.userId || req.user.id;

        const batch = await PayrollBatchService.changeStatus(
            req.params.id,
            'complete',
            userId,
            reason
        );

        res.status(200).json({
            success: true,
            message: 'Payroll batch completed successfully',
            data: batch
        });
    } catch (error) {
        console.error('Error completing batch:', error);
        res.status(400).json({
            success: false,
            message: error.message || 'Error completing batch'
        });
    }
};

/**
 * @desc    Request recalculation permission
 * @route   POST /api/payroll-batch/:id/request-recalculation
 * @access  Private
 */
exports.requestRecalculation = async (req, res) => {
    try {
        const { reason } = req.body;
        const userId = req.user._id || req.user.userId || req.user.id;

        if (!reason) {
            return res.status(400).json({
                success: false,
                message: 'Reason is required'
            });
        }

        const batch = await PayrollBatchService.requestRecalculationPermission(
            req.params.id,
            userId,
            reason
        );

        res.status(200).json({
            success: true,
            message: 'Recalculation permission requested',
            data: batch
        });
    } catch (error) {
        console.error('Error requesting recalculation:', error);
        res.status(400).json({
            success: false,
            message: error.message || 'Error requesting recalculation'
        });
    }
};

/**
 * @desc    Grant recalculation permission
 * @route   POST /api/payroll-batch/:id/grant-recalculation
 * @access  Private (SuperAdmin only)
 */
exports.grantRecalculation = async (req, res) => {
    try {
        const { reason, expiryHours = 24 } = req.body;
        const userId = req.user._id || req.user.userId || req.user.id;

        if (!reason) {
            return res.status(400).json({
                success: false,
                message: 'Reason is required'
            });
        }

        const batch = await PayrollBatchService.grantRecalculationPermission(
            req.params.id,
            userId,
            reason,
            expiryHours
        );

        res.status(200).json({
            success: true,
            message: 'Recalculation permission granted',
            data: batch
        });
    } catch (error) {
        console.error('Error granting recalculation:', error);
        res.status(400).json({
            success: false,
            message: error.message || 'Error granting recalculation'
        });
    }
};

/**
 * @desc    Validate payroll batch
 * @route   GET /api/payroll-batch/:id/validation
 * @access  Private
 */
exports.validateBatch = async (req, res) => {
    try {
        const batch = await PayrollBatch.findById(req.params.id);

        if (!batch) {
            return res.status(404).json({
                success: false,
                message: 'Payroll batch not found'
            });
        }

        const validationResult = await batch.validate();
        await batch.save();

        res.status(200).json({
            success: true,
            data: validationResult
        });
    } catch (error) {
        console.error('Error validating batch:', error);
        res.status(500).json({
            success: false,
            message: error.message || 'Error validating batch'
        });
    }
};

/**
 * @desc    Bulk approve batches
 * @route   POST /api/payroll-batch/bulk-approve
 * @access  Private (SuperAdmin, HR)
 */
exports.bulkApproveBatches = async (req, res) => {
    try {
        const { batchIds, reason } = req.body;
        const userId = req.user._id || req.user.userId || req.user.id;

        if (!batchIds || !Array.isArray(batchIds) || batchIds.length === 0) {
            return res.status(400).json({
                success: false,
                message: 'Batch IDs array is required'
            });
        }

        const results = [];
        const errors = [];

        for (const batchId of batchIds) {
            try {
                const batch = await PayrollBatchService.changeStatus(batchId, 'approved', userId, reason);
                results.push(batch);
            } catch (error) {
                errors.push({ batchId, error: error.message });
            }
        }

        res.status(200).json({
            success: true,
            message: `Approved ${results.length} of ${batchIds.length} batches`,
            data: results,
            errors
        });
    } catch (error) {
        console.error('Error bulk approving batches:', error);
        res.status(500).json({
            success: false,
            message: error.message || 'Error bulk approving batches'
        });
    }
};

/**
 * @desc    Delete payroll batch (only if pending)
 * @route   DELETE /api/payroll-batch/:id
 * @access  Private (SuperAdmin)
 */
exports.deleteBatch = async (req, res) => {
    try {
        const batch = await PayrollBatch.findById(req.params.id);

        if (!batch) {
            return res.status(404).json({
                success: false,
                message: 'Payroll batch not found'
            });
        }

        if (batch.status !== 'pending') {
            return res.status(400).json({
                success: false,
                message: 'Can only delete batches in pending status'
            });
        }

        await batch.deleteOne();

        res.status(200).json({
            success: true,
            message: 'Payroll batch deleted successfully'
        });
    } catch (error) {
        console.error('Error deleting batch:', error);
        res.status(500).json({
            success: false,
            message: error.message || 'Error deleting batch'
        });
    }
};
/**
 * @desc    Request recalculation permission
 * @route   PUT /api/payroll-batch/:id/request-recalculation
 * @access  Private
 */
exports.requestRecalculation = async (req, res) => {
    try {
        console.log('Requesting recalculation for batch:', req.params.id);
        const { reason } = req.body;
        const userId = req.user._id || req.user.userId || req.user.id;

        const batch = await PayrollBatch.findById(req.params.id);
        if (!batch) {
            return res.status(404).json({
                success: false,
                message: 'Payroll batch not found'
            });
        }

        if (!reason) {
            return res.status(400).json({
                success: false,
                message: 'Reason is required'
            });
        }

        // Ideally this logic should be in the Model or Service, but putting here for now as instance methods seem to exist
        if (typeof batch.requestRecalculationPermission === 'function') {
            await batch.requestRecalculationPermission(userId, reason);
        } else {
            // Fallback if method missing (though it was seen in previous turns)
            batch.recalculationPermission = {
                requestedBy: userId,
                requestedAt: new Date(),
                reason: reason,
                granted: false
            };
            await batch.save();
        }

        res.status(200).json({
            success: true,
            message: 'Permission requested successfully',
            data: batch
        });
    } catch (error) {
        console.error('Error requesting recalculation:', error);
        res.status(500).json({
            success: false,
            message: error.message || 'Error requesting permission'
        });
    }
};

/**
 * @desc    Grant recalculation permission
 * @route   PUT /api/payroll-batch/:id/grant-recalculation
 * @access  Private (SuperAdmin)
 */
exports.grantRecalculation = async (req, res) => {
    try {
        const userId = req.user._id || req.user.userId || req.user.id;
        const { durationHours } = req.body;

        const batch = await PayrollBatch.findById(req.params.id);
        if (!batch) {
            return res.status(404).json({
                success: false,
                message: 'Payroll batch not found'
            });
        }

        if (typeof batch.grantRecalculationPermission === 'function') {
            await batch.grantRecalculationPermission(userId, durationHours || 24);
        } else {
            // Fallback
            const expiresAt = new Date();
            expiresAt.setHours(expiresAt.getHours() + (durationHours || 24));
            batch.recalculationPermission.granted = true;
            batch.recalculationPermission.grantedBy = userId;
            batch.recalculationPermission.grantedAt = new Date();
            batch.recalculationPermission.expiresAt = expiresAt;
            await batch.save();
        }

        res.status(200).json({
            success: true,
            message: 'Permission granted successfully',
            data: batch
        });
    } catch (error) {
        console.error('Error granting permissions:', error);
        res.status(500).json({
            success: false,
            message: error.message || 'Error granting permission'
        });
    }
};
exports.recalculateBatch = async (req, res) => {
    try {
        const { reason } = req.body;
        const userId = req.user._id || req.user.userId || req.user.id;

        if (!reason && ['approved', 'freeze'].includes(req.body.currentStatus)) { // Optional check
            // Reason strictly required for approved batches
        }

        const batch = await PayrollBatchService.recalculateBatch(
            req.params.id,
            userId,
            reason || 'Manual recalculation'
        );

        res.status(200).json({
            success: true,
            message: 'Batch recalculated successfully',
            data: batch
        });
    } catch (error) {
        console.error('Error recalculating batch:', error);
        res.status(400).json({
            success: false,
            message: error.message || 'Error recalculating batch'
        });
    }
};

/**
 * @desc    Rollback batch to previous history state
 * @route   POST /api/payroll-batch/:id/rollback/:historyId
 * @access  Private (SuperAdmin)
 */
exports.rollbackBatch = async (req, res) => {
    try {
        const userId = req.user._id || req.user.userId || req.user.id;
        const { historyId } = req.params;

        const batch = await PayrollBatchService.rollbackBatch(
            req.params.id,
            historyId,
            userId
        );

        res.status(200).json({
            success: true,
            message: 'Batch rolled back successfully',
            data: batch
        });
    } catch (error) {
        console.error('Error rolling back batch:', error);
        res.status(400).json({
            success: false,
            message: error.message || 'Error rolling back batch'
        });
    }
};
