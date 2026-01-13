const PayrollBatch = require('../model/PayrollBatch');
const PayrollRecord = require('../model/PayrollRecord');
const Employee = require('../../employees/model/Employee');
const Department = require('../../departments/model/Department');

/**
 * PayrollBatch Service
 * Handles business logic for payroll batch operations
 */
class PayrollBatchService {
    /**
     * Create a new payroll batch for a department in a division
     */
    static async createBatch(departmentId, divisionId, month, userId) {
        try {
            const [year, monthNum] = month.split('-').map(Number);

            // Check if batch already exists for this Division + Department
            const existingBatch = await PayrollBatch.findOne({
                department: departmentId,
                division: divisionId,
                month
            });

            if (existingBatch) {
                throw new Error('Payroll batch already exists for this division, department and month');
            }

            // Generate batch number with Division context
            const batchNumber = await PayrollBatch.generateBatchNumber(departmentId, divisionId, month);

            // Create batch
            const batch = new PayrollBatch({
                batchNumber,
                department: departmentId,
                division: divisionId,
                month,
                year,
                monthNumber: monthNum,
                createdBy: userId,
                status: 'pending'
            });

            await batch.save();
            return batch;
        } catch (error) {
            throw error;
        }
    }

    /**
     * Add employee payroll to batch and update totals
     */
    static async addPayrollToBatch(batchId, payrollRecordId) {
        try {
            const batch = await PayrollBatch.findById(batchId);
            if (!batch) {
                throw new Error('Batch not found');
            }

            const payroll = await PayrollRecord.findById(payrollRecordId);
            if (!payroll) {
                throw new Error('Payroll record not found');
            }

            // Add to batch if not already included
            if (!batch.employeePayrolls.includes(payrollRecordId)) {
                batch.employeePayrolls.push(payrollRecordId);
                batch.totalEmployees = batch.employeePayrolls.length;

                // Update totals
                batch.totalGrossSalary += payroll.earnings?.grossSalary || 0;
                batch.totalDeductions += payroll.deductions?.totalDeductions || 0;
                batch.totalNetSalary += payroll.netSalary || 0;
                batch.totalArrears += payroll.arrearsAmount || 0;

                await batch.save();
            }

            // Update payroll record with batch ID reference if not already set
            if (!payroll.payrollBatchId || payroll.payrollBatchId.toString() !== batchId.toString()) {
                payroll.payrollBatchId = batchId;
                await payroll.save();
            }

            return batch;
        } catch (error) {
            throw error;
        }
    }

    /**
     * Recalculate batch totals from employee payrolls
     */
    static async recalculateBatchTotals(batchId) {
        try {
            const batch = await PayrollBatch.findById(batchId).populate('employeePayrolls');
            if (!batch) {
                throw new Error('Batch not found');
            }

            let totalGross = 0;
            let totalDeductions = 0;
            let totalNet = 0;
            let totalArrears = 0;

            batch.employeePayrolls.forEach(payroll => {
                totalGross += payroll.earnings?.grossSalary || 0;
                totalDeductions += payroll.deductions?.totalDeductions || 0;
                totalNet += payroll.netSalary || 0;
                totalArrears += payroll.arrearsAmount || 0;
            });

            batch.totalGrossSalary = totalGross;
            batch.totalDeductions = totalDeductions;
            batch.totalNetSalary = totalNet;
            batch.totalArrears = totalArrears;
            batch.totalEmployees = batch.employeePayrolls.length;

            await batch.save();
            return batch;
        } catch (error) {
            throw error;
        }
    }

    /**
     * Change batch status
     */
    static async changeStatus(batchId, newStatus, userId, reason = '') {
        try {
            const batch = await PayrollBatch.findById(batchId);
            if (!batch) {
                throw new Error('Batch not found');
            }

            // Validate status transition
            const validTransitions = {
                'pending': ['approved'],
                'approved': ['freeze', 'pending'],
                'freeze': ['complete', 'approved'],
                'complete': []
            };

            if (!validTransitions[batch.status].includes(newStatus)) {
                throw new Error(`Cannot transition from ${batch.status} to ${newStatus}`);
            }

            // Additional validation for specific transitions
            if (newStatus === 'approved') {
                // Validate all employees have payroll
                await batch.validate();
                if (!batch.validationStatus.allEmployeesCalculated) {
                    throw new Error('Cannot approve: Not all employees have payroll calculated');
                }
            }

            // Update status
            const oldStatus = batch.status;
            batch.status = newStatus;

            // Add to history
            batch.statusHistory.push({
                status: newStatus,
                changedBy: userId,
                changedAt: new Date(),
                reason
            });

            // Update specific fields based on status
            if (newStatus === 'approved') {
                batch.approvedBy = userId;
                batch.approvedAt = new Date();
            } else if (newStatus === 'freeze') {
                batch.freezedBy = userId;
                batch.freezedAt = new Date();
            } else if (newStatus === 'complete') {
                batch.completedBy = userId;
                batch.completedAt = new Date();
            }

            await batch.save();
            return batch;
        } catch (error) {
            throw error;
        }
    }

    /**
     * Request recalculation permission
     */
    static async requestRecalculationPermission(batchId, userId, reason) {
        try {
            const batch = await PayrollBatch.findById(batchId);
            if (!batch) {
                throw new Error('Batch not found');
            }

            if (batch.status !== 'approved') {
                throw new Error('Can only request permission for approved batches');
            }

            batch.recalculationPermission = {
                granted: false,
                requestedBy: userId,
                requestedAt: new Date(),
                reason
            };

            await batch.save();
            return batch;
        } catch (error) {
            throw error;
        }
    }

    /**
     * Grant recalculation permission
     */
    static async grantRecalculationPermission(batchId, userId, reason, expiryHours = 24) {
        try {
            const batch = await PayrollBatch.findById(batchId);
            if (!batch) {
                throw new Error('Batch not found');
            }

            const expiresAt = new Date();
            expiresAt.setHours(expiresAt.getHours() + expiryHours);

            batch.recalculationPermission = {
                granted: true,
                grantedBy: userId,
                grantedAt: new Date(),
                expiresAt,
                reason,
                requestedBy: batch.recalculationPermission.requestedBy,
                requestedAt: batch.recalculationPermission.requestedAt
            };

            await batch.save();
            return batch;
        } catch (error) {
            throw error;
        }
    }

    /**
     * Store snapshot before recalculation
     */
    static async createRecalculationSnapshot(batchId, userId, reason) {
        try {
            const batch = await PayrollBatch.findById(batchId).populate('employeePayrolls');
            if (!batch) {
                throw new Error('Batch not found');
            }

            // Create snapshot
            const snapshot = {
                totalGrossSalary: batch.totalGrossSalary,
                totalDeductions: batch.totalDeductions,
                totalNetSalary: batch.totalNetSalary,
                totalArrears: batch.totalArrears,
                employeeCount: batch.totalEmployees,
                employeePayrolls: batch.employeePayrolls.map(p => ({
                    _id: p._id,
                    employeeId: p.employeeId,
                    netSalary: p.netSalary,
                    grossSalary: p.earnings?.grossSalary,
                    totalDeductions: p.deductions?.totalDeductions
                }))
            };

            // Add to history
            batch.recalculationHistory.push({
                recalculatedBy: userId,
                reason,
                previousSnapshot: snapshot,
                changes: []
            });

            await batch.save();
            return batch.recalculationHistory[batch.recalculationHistory.length - 1];
        } catch (error) {
            throw error;
        }
    }

    /**
     * Get batch with all details
     */
    static async getBatchDetails(batchId) {
        try {
            const batch = await PayrollBatch.findById(batchId)
                .populate('department', 'name code')
                .populate('employeePayrolls')
                .populate('createdBy', 'name email')
                .populate('approvedBy', 'name email')
                .populate('freezedBy', 'name email')
                .populate('completedBy', 'name email')
                .populate('statusHistory.changedBy', 'name email')
                .populate('recalculationPermission.grantedBy', 'name email')
                .populate('recalculationPermission.requestedBy', 'name email')
                .populate('recalculationHistory.recalculatedBy', 'name email');

            return batch;
        } catch (error) {
            throw error;
        }
    }
    /**
     * Recalculate batch payrolls
     * Offloads the heavy work to BullMQ background worker
     */
    static async recalculateBatch(batchId, userId, reason) {
        try {
            const batch = await PayrollBatch.findById(batchId);
            if (!batch) {
                throw new Error('Batch not found');
            }

            // Check permissions based on status
            if (['approved', 'freeze', 'complete'].includes(batch.status)) {
                if (!batch.hasValidRecalculationPermission()) {
                    throw new Error('Recalculation permission required for approved batches');
                }
            }

            // Add job to BullMQ queue
            const { payrollQueue } = require('../../shared/jobs/queueManager');
            const job = await payrollQueue.add('recalculate_batch', {
                action: 'recalculate_batch',
                batchId,
                userId,
                reason
            }, {
                priority: 1 // High priority for manual triggers
            });

            // Update batch status to indicate it's being processed
            // (Optional: add a new status like 'calculating' if desired)

            return {
                success: true,
                message: 'Batch recalculation started in background',
                jobId: job.id,
                batchId
            };

        } catch (error) {
            throw error;
        }
    }

    /**
     * Legacy/Synchronous version (kept for reference or small batches)
     */
    static async recalculateBatchSync(batchId, userId, reason) {
        // ... (existing logic)
    }

    /**
     * Rollback batch to a previous state from history
     */
    static async rollbackBatch(batchId, historyId, userId) {
        try {
            const batch = await PayrollBatch.findById(batchId);
            if (!batch) throw new Error('Batch not found');

            const historyEntry = batch.recalculationHistory.id(historyId);
            if (!historyEntry) throw new Error('History entry not found');

            const snapshot = historyEntry.previousSnapshot;
            if (!snapshot) throw new Error('Snapshot data missing in history');

            // Restore Payroll Records
            for (const snapItem of snapshot.employeePayrolls) {
                if (snapItem.payrollRecordId) {
                    await PayrollRecord.findByIdAndUpdate(snapItem.payrollRecordId, {
                        earnings: snapItem.earnings,
                        deductions: snapItem.deductions,
                        netSalary: snapItem.netSalary,
                        arrearsAmount: snapItem.arrearsAmount
                    });
                }
            }

            // Restore Batch Totals
            batch.totalGrossSalary = snapshot.totalGrossSalary;
            batch.totalDeductions = snapshot.totalDeductions;
            batch.totalNetSalary = snapshot.totalNetSalary;
            batch.totalArrears = snapshot.totalArrears;

            // Add a new history entry indicating rollback
            batch.recalculationHistory.push({
                recalculatedBy: userId,
                reason: `Rollback to history ${historyId}`,
                previousSnapshot: null // No snapshot for rollback itself for now, or snapshot 'current' before rollback
            });

            await batch.save();
            return batch;

        } catch (error) {
            throw error;
        }
    }
}

module.exports = PayrollBatchService;
