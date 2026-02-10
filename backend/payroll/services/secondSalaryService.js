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
     * @param {Object} params - { departmentId, divisionId, month, userId, scopeFilter }
     */
    async runSecondSalaryPayroll({ departmentId, divisionId, month, userId, scopeFilter = {} }) {
        try {
            const { payrollQueue } = require('../../shared/jobs/queueManager');

            // 1. Fetch Department and Division (if provided)
            let department = null;
            if (departmentId && departmentId !== 'all') {
                department = await Department.findById(departmentId);
                if (!department) throw new Error('Department not found');
            }

            // 2. Find eligible employees (same set as regular payroll: scope + active or left this month)
            const { getPayrollDateRange } = require('../../shared/utils/dateUtils');
            const [year, monthNum] = month ? String(month).split('-').map(Number) : [new Date().getFullYear(), new Date().getMonth() + 1];
            const { startDate, endDate } = month ? await getPayrollDateRange(year, monthNum) : { startDate: null, endDate: null };
            // Use UTC boundaries so "26 Dec–25 Jan" excludes 25 Dec left (avoids TZ shifting 26 Dec 00:00 local into 25 Dec UTC).
            const leftStart = startDate ? new Date(startDate + 'T00:00:00.000Z') : null;
            const leftEnd = endDate ? new Date(endDate + 'T23:59:59.999Z') : null;

            const query = { ...scopeFilter };
            if (divisionId && divisionId !== 'all') query.division_id = divisionId;
            if (departmentId && departmentId !== 'all') query.department_id = departmentId;
            if (leftStart && leftEnd) {
                query.$or = [
                    { is_active: true, leftDate: null },
                    { leftDate: { $gte: leftStart, $lte: leftEnd } },
                ];
            } else {
                query.is_active = true;
            }

            const employees = await Employee.find(query).select('_id');
            const employeesCount = employees.length;
            const employeeIds = employees.map((e) => e._id.toString());

            if (employeesCount === 0) {
                throw new Error('No employees found matching the filters (active or left in this payroll month)');
            }

            // 3. Queue the job for background processing (pass employeeIds so worker uses same list)
            // Use unique jobId per run so a new job is always created (avoids stuck "waiting" job blocking new runs)
            const job = await payrollQueue.add('second_salary_calculation', {
                action: 'second_salary_batch',
                departmentId: departmentId === 'all' ? null : departmentId,
                divisionId: divisionId === 'all' ? null : divisionId,
                month,
                userId,
                employeeIds
            }, {
                jobId: `second_salary_${month}_${departmentId || 'all'}_${divisionId || 'all'}_${Date.now()}`
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
