const SecondSalaryBatch = require('../model/SecondSalaryBatch');
const SecondSalaryRecord = require('../model/SecondSalaryRecord');
const Employee = require('../../employees/model/Employee');
const Department = require('../../departments/model/Department');
const mongoose = require('mongoose');
const { calculateSecondSalary } = require('./secondSalaryCalculationService');
const SecondSalaryBatchService = require('./secondSalaryBatchService');
const { getSecondSalaryEmployeeQuery } = require('./payrollEmployeeQueryHelper');

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
            const { payrollQueue } = require('../../shared/jobs/queueManager');

            // 1. Fetch Department and Division (if provided)
            let department = null;
            if (departmentId && departmentId !== 'all') {
                department = await Department.findById(departmentId);
                if (!department) throw new Error('Department not found');
            }

            // 2. Find eligible employees (same set as regular payroll: active or left this month)
            const { getPayrollDateRange } = require('../../shared/utils/dateUtils');
            const [year, monthNum] = month ? String(month).split('-').map(Number) : [new Date().getFullYear(), new Date().getMonth() + 1];
            const { startDate, endDate } = month ? await getPayrollDateRange(year, monthNum) : { startDate: null, endDate: null };
            const leftDateRange = (startDate && endDate) ? { start: new Date(startDate), end: new Date(endDate) } : undefined;
            const query = getSecondSalaryEmployeeQuery({ departmentId, divisionId, leftDateRange });
            const employeesCount = await Employee.countDocuments(query);

            if (employeesCount === 0) {
                throw new Error('No employees found matching the filters');
            }

            // 3. Queue the job for background processing
            const job = await payrollQueue.add('second_salary_calculation', {
                action: 'second_salary_batch',
                departmentId: departmentId === 'all' ? null : departmentId,
                divisionId: divisionId === 'all' ? null : divisionId,
                month,
                userId
            }, {
                jobId: `second_salary_${month}_${departmentId || 'all'}_${divisionId || 'all'}`
            });

            console.log(`[SecondSalaryService] Queued background job ${job.id} for ${employeesCount} employees`);

            return {
                queued: true,
                jobId: job.id,
                totalEmployees: employeesCount,
                message: `Calculation for ${employeesCount} employees has been queued in the background.`
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
