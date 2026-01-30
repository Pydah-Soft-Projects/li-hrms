const SecondSalaryBatch = require('../model/SecondSalaryBatch');
const SecondSalaryRecord = require('../model/SecondSalaryRecord');
const Employee = require('../../employees/model/Employee');
const Department = require('../../departments/model/Department');
const mongoose = require('mongoose');
const { calculateSecondSalary } = require('./secondSalaryCalculationService');
const SecondSalaryBatchService = require('./secondSalaryBatchService');

/**
 * Service to handle 2nd Salary operations
 */
class SecondSalaryService {
    /**
     * Calculate and generate 2nd salary for a department
     * @param {Object} params - { departmentId, divisionId, month, userId }
     */
    async runSecondSalaryPayroll({ departmentId, divisionId, month, userId }) {
        try {
            // 1. Fetch Department and Division (if provided)
            let department = null;
            if (departmentId && departmentId !== 'all') {
                department = await Department.findById(departmentId);
                if (!department) throw new Error('Department not found');
            }

            // 2. Find eligible employees (must have second_salary > 0)
            const query = {
                is_active: true,
                second_salary: { $gt: 0 }
            };
            if (departmentId && departmentId !== 'all') query.department_id = departmentId;
            if (divisionId && divisionId !== 'all') query.division_id = divisionId;

            const employees = await Employee.find(query);

            if (employees.length === 0) {
                throw new Error('No employees with 2nd salary found matching the filters');
            }

            // 3. Create or Update Batch (using service)
            // Note: If departmentId is 'all', batch creation might need logic change.
            // But usually batches are per department.
            // For "Calculate All", we might need to handle batching per department inside the loop.

            // To maintain parity with regular payroll, we loop departments if "all" is selected?
            // Actually, calculateSecondSalary handles batch creation per employee's department.
            // So we don't strictly need a "main" batch here if calculating for all.

            let mainBatch = null;
            if (departmentId && departmentId !== 'all') {
                mainBatch = await SecondSalaryBatchService.createBatch(departmentId, divisionId, month, userId);
                if (mainBatch && ['approved', 'freeze', 'complete'].includes(mainBatch.status)) {
                    throw new Error(`Batch is already ${mainBatch.status} and cannot be recalculated.`);
                }
            }

            // 4. Calculate for each employee using the new robust calculation service
            const results = {
                successCount: 0,
                failCount: 0,
                success: [],
                failed: []
            };

            const batchIds = new Set();

            for (const employee of employees) {
                try {
                    const result = await calculateSecondSalary(employee._id, month, userId);
                    results.successCount++;
                    results.success.push({
                        employeeId: employee._id,
                        emp_no: employee.emp_no,
                        name: employee.employee_name
                    });
                    if (result.batchId) batchIds.add(result.batchId.toString());
                } catch (err) {
                    console.error(`Failed to calculate second salary for ${employee.emp_no}:`, err);
                    results.failCount++;
                    results.failed.push({
                        employeeId: employee._id,
                        emp_no: employee.emp_no,
                        error: err.message
                    });
                }
            }

            // 5. Finalize Batch Totals for all involved batches
            for (const batchId of batchIds) {
                await SecondSalaryBatchService.recalculateBatchTotals(batchId);
            }

            return {
                batch: mainBatch,
                batchIds: Array.from(batchIds),
                successCount: results.successCount,
                failCount: results.failCount,
                results
            };
        } catch (error) {
            console.error('Error in runSecondSalaryPayroll:', error);
            throw error;
        }
    }

    /**
     * Get all 2nd salary batches with filters
     */
    async getBatches(filters = {}) {
        return await SecondSalaryBatch.find(filters)
            .populate('department', 'name code')
            .populate('division', 'name code')
            .sort({ createdAt: -1 });
    }

    /**
     * Get a specific batch with its records
     */
    async getBatchDetails(batchId) {
        return await SecondSalaryBatch.findById(batchId)
            .populate('department', 'name code')
            .populate('division', 'name code')
            .populate({
                path: 'employeePayrolls',
                populate: {
                    path: 'employeeId',
                    select: 'employee_name emp_no designation_id'
                }
            });
    }

    /**
     * Update batch status
     */
    async updateBatchStatus(batchId, status, userId, reason = '') {
        const batch = await SecondSalaryBatch.findById(batchId);
        if (!batch) throw new Error('Batch not found');

        batch.status = status;
        batch.statusHistory.push({
            status,
            changedBy: userId,
            reason
        });

        if (status === 'approved') {
            batch.approvedBy = userId;
            batch.approvedAt = new Date();
        } else if (status === 'complete') {
            batch.completedBy = userId;
            batch.completedAt = new Date();
        }

        await batch.save();
        return batch;
    }
    /**
     * Get 2nd salary records with filters
     */
    async getRecords(filters = {}) {
        const query = {};

        if (filters.month) {
            query.month = filters.month;
        }

        if (filters.divisionId) {
            query.division_id = filters.divisionId;
        }

        // If department filter is present, we need to find employees first
        if (filters.departmentId) {
            const employees = await Employee.find({
                department_id: filters.departmentId,
                is_active: true
            }).select('_id');
            const employeeIds = employees.map(e => e._id);
            query.employeeId = { $in: employeeIds };
        }

        const records = await SecondSalaryRecord.find(query)
            .populate('employeeId', 'employee_name emp_no designation_id department_id')
            .populate('division_id', 'name')
            .sort({ 'emp_no': 1 }); // Sort by emp_no usually

        return records;
    }
    async getRecordById(id) {
        return await SecondSalaryRecord.findById(id)
            .populate('employeeId', 'employee_name emp_no designation_id department_id bank_account_no location pf_number esi_number uan_number pan_number')
            .populate('division_id', 'code name')
            .populate({
                path: 'employeeId',
                populate: {
                    path: 'designation_id',
                    select: 'name'
                }
            })
            .populate({
                path: 'employeeId',
                populate: {
                    path: 'department_id',
                    select: 'name'
                }
            });
    }
}

module.exports = new SecondSalaryService();
