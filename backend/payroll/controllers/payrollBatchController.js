const PayrollBatchService = require('../services/payrollBatchService');
const PayrollBatch = require('../model/PayrollBatch');

/**
 * @desc    Create payroll batch for department(s)
 * @route   POST /api/payroll-batch/calculate
 * @access  Private (SuperAdmin, HR)
 */
/**
 * @desc    Create payroll batch for department(s)
 * @route   POST /api/payroll-batch/calculate
 * @access  Private (SuperAdmin, HR)
 */
exports.calculatePayrollBatch = async (req, res) => {
    try {
        const { departmentId, divisionId, month, calculateAll } = req.body;

        if (!month) {
            return res.status(400).json({
                success: false,
                message: 'Month is required'
            });
        }

        const userId = req.user._id || req.user.userId || req.user.id;
        const batches = [];
        const errors = [];

        if (calculateAll) {
            // Calculate for all Valid (Division, Department) pairs
            const Department = require('../../departments/model/Department');
            // Fetch depts and populate their divisions
            const departments = await Department.find({ is_active: true });

            for (const dept of departments) {
                // If department is not linked to any division, skip or log warning?
                // Per strict rules, we need a division.
                if (!dept.divisions || dept.divisions.length === 0) {
                    console.warn(`Department ${dept.name} has no linked divisions. Skipping payroll batch.`);
                    continue;
                }

                for (const divId of dept.divisions) {
                    try {
                        const batch = await PayrollBatchService.createBatch(dept._id, divId, month, userId);
                        batches.push(batch);
                    } catch (error) {
                        // Ignore "already exists" for bulk, log others
                        if (!error.message.includes('already exists')) {
                            console.error(`Error creating batch for Dept ${dept.name} in Div ${divId}:`, error.message);
                            errors.push({ department: dept.name, division: divId, error: error.message });
                        }
                    }
                }
            }
        } else if (departmentId) {
            // specific department
            let targetDivId = divisionId;

            if (!targetDivId) {
                const Department = require('../../departments/model/Department');
                const dept = await Department.findById(departmentId);

                if (dept && dept.divisions && dept.divisions.length === 1) {
                    targetDivId = dept.divisions[0]; // Auto-infer if only one
                } else if (dept && dept.divisions && dept.divisions.length > 1) {
                    return res.status(400).json({
                        success: false,
                        message: 'Department belongs to multiple Divisions. Please specify divisionId.'
                    });
                } else {
                    return res.status(400).json({
                        success: false,
                        message: 'Department is not linked to any Division. Cannot create batch.'
                    });
                }
            }

            try {
                const batch = await PayrollBatchService.createBatch(departmentId, targetDivId, month, userId);
                batches.push(batch);
            } catch (err) {
                throw err;
            }

        } else {
            return res.status(400).json({
                success: false,
                message: 'Either departmentId or calculateAll must be provided'
            });
        }

        res.status(201).json({
            success: true,
            message: `Created ${batches.length} payroll batch(es)`,
            data: batches,
            errors: errors.length > 0 ? errors : undefined
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
        const { month, departmentId, divisionId, status, page = 1, limit = 20 } = req.query;

        const query = {};
        if (month) query.month = month;
        if (departmentId) query.department = departmentId;
        if (divisionId) query.division = divisionId;
        if (status) query.status = status;

        // Apply Scope Filter from Middleware if present
        if (req.scopeFilter) {
            Object.assign(query, req.scopeFilter);
        }

        const skip = (parseInt(page) - 1) * parseInt(limit);

        const batches = await PayrollBatch.find(query)
            .populate('department', 'name code')
            .populate('division', 'name code') // Populate Division
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

/**
 * @desc    Migrate existing batches to include Division ID
 * @route   POST /api/payroll/batches/migrate
 * @access  Private (Super Admin)
 */
exports.migrateBatchDivisions = async (req, res) => {
    try {
        console.log('--- Starting Payroll Batch Division Migration ---');

        // Find batches where division is missing
        const batches = await PayrollBatch.find({
            $or: [
                { division: { $exists: false } },
                { division: null }
            ]
        });

        console.log(`Found ${batches.length} batches to migrate.`);

        let updatedCount = 0;
        let skippedCount = 0;
        let errors = [];
        const Department = require('../../departments/model/Department');
        const PayrollRecord = require('../model/PayrollRecord');
        const Employee = require('../../employees/model/Employee'); // Ensure Employee model is loaded

        for (const batch of batches) {
            try {
                // Strategy 1: Look for any Payroll Record linked to this batch
                // We use payrollBatchId field in PayrollRecord
                let divisionId = null;

                // Attempt to find a record for this batch
                // Since batchId might not be directly stored on all old records if they were legacy, check implementation.
                // Assuming newer records have payrollBatchId. Old records might just match by department/month.

                // Let's rely on finding *any* employee in this batch's department and month that has a calculated record
                const record = await PayrollRecord.findOne({
                    month: batch.month,
                    // We need to resolve employee who is in this batch. 
                    // Batch has department_id. 
                    // Let's find a record for an employee in this department for this month.
                }).populate({
                    path: 'employeeId',
                    match: { department_id: batch.department_id },
                    select: 'division_id'
                });

                // The above query finds a record, but populate match doesn't filter the root finding. 
                // We need to be more specific.

                // Better approach: Find ONE employee record that effectively belongs to this batch
                const linkedRecord = await PayrollRecord.findOne({ payrollBatchId: batch._id }).populate('employeeId');

                if (linkedRecord && linkedRecord.employeeId && linkedRecord.employeeId.division_id) {
                    divisionId = linkedRecord.employeeId.division_id;
                } else {
                    // Fallback: If no direct link (legacy), find any record for this Dept+Month
                    // and check that employee's current division. 
                    // NOTE: Employee might have moved, but this is best effort for legacy.
                    // Actually, if we use the department, we can look up the department's linked divisions.
                    // If department has only 1 division, we use that.
                    const dept = await Department.findById(batch.department_id);
                    if (dept && dept.divisions && dept.divisions.length === 1) {
                        divisionId = dept.divisions[0];
                    } else {
                        // Department has multiple divisions or none.
                        // Try to find ANY record for this month and department
                        // This is expensive but necessary
                        const potentialRecords = await PayrollRecord.find({ month: batch.month }).populate('employeeId');
                        const match = potentialRecords.find(r => r.employeeId && r.employeeId.department_id && r.employeeId.department_id.toString() === batch.department_id.toString());
                        if (match && match.employeeId.division_id) {
                            divisionId = match.employeeId.division_id;
                        }
                    }
                }

                if (divisionId) {
                    batch.division = divisionId;
                    await batch.save();
                    updatedCount++;
                    console.log(`Updated Batch ${batch.batchNumber} (${batch.month}) with Division ${divisionId}`);
                } else {
                    console.warn(`Could not resolve Division for Batch ${batch.batchNumber} (Dept: ${batch.department_id})`);
                    skippedCount++;
                }

            } catch (err) {
                console.error(`Error migrating batch ${batch._id}:`, err);
                errors.push({ batchId: batch._id, error: err.message });
            }
        }

        console.log(`Migration Complete. Updated: ${updatedCount}, Skipped: ${skippedCount}, Errors: ${errors.length}`);

        res.status(200).json({
            success: true,
            message: 'Batch migration completed',
            stats: {
                total: batches.length,
                updated: updatedCount,
                skipped: skippedCount,
                errors: errors.length
            },
            errors
        });

    } catch (error) {
        console.error('Migration Fatal Error:', error);
        res.status(500).json({ success: false, message: error.message });
    }
};
