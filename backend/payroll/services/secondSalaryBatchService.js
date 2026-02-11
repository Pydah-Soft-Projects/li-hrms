const SecondSalaryBatch = require('../model/SecondSalaryBatch');
const SecondSalaryRecord = require('../model/SecondSalaryRecord');

/**
 * SecondSalaryBatch Service
 * Handles business logic for 2nd Salary batch operations
 */
class SecondSalaryBatchService {
    /**
     * Create a new 2nd salary batch
     */
    static async createBatch(departmentId, divisionId, month, userId) {
        try {
            const [year, monthNum] = month.split('-').map(Number);

            const existingBatch = await SecondSalaryBatch.findOne({
                department: departmentId,
                division: divisionId,
                month
            });

            if (existingBatch) {
                return existingBatch;
            }

            const batchNumber = await SecondSalaryBatch.generateBatchNumber(departmentId, divisionId, month);

            const batch = new SecondSalaryBatch({
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
            console.error('Error creating second salary batch:', error);
            throw error;
        }
    }

    /**
     * Add employee 2nd salary to batch and update totals
     */
    static async addPayrollToBatch(batchId, secondSalaryRecordId) {
        try {
            const batch = await SecondSalaryBatch.findById(batchId);
            if (!batch) {
                throw new Error('Batch not found');
            }

            const record = await SecondSalaryRecord.findById(secondSalaryRecordId);
            if (!record) {
                throw new Error('Second salary record not found');
            }

            if (!batch.employeePayrolls.includes(secondSalaryRecordId)) {
                batch.employeePayrolls.push(secondSalaryRecordId);
                batch.totalEmployees = batch.employeePayrolls.length;

                batch.totalGrossSalary += record.earnings?.grossSalary || 0;
                batch.totalDeductions += record.deductions?.totalDeductions || 0;
                batch.totalNetSalary += record.netSalary || 0;

                await batch.save();
            }

            if (!record.secondSalaryBatchId || record.secondSalaryBatchId.toString() !== batchId.toString()) {
                record.secondSalaryBatchId = batchId;
                await record.save();
            }

            return batch;
        } catch (error) {
            console.error('Error adding to second salary batch:', error);
            throw error;
        }
    }

    /**
     * Recalculate batch totals
     */
    static async recalculateBatchTotals(batchId) {
        try {
            const batch = await SecondSalaryBatch.findById(batchId).populate('employeePayrolls');
            if (!batch) {
                throw new Error('Batch not found');
            }

            let totalGross = 0;
            let totalDeductions = 0;
            let totalNet = 0;

            batch.employeePayrolls.forEach(record => {
                totalGross += record.earnings?.grossSalary || 0;
                totalDeductions += record.deductions?.totalDeductions || 0;
                totalNet += record.netSalary || 0;
            });

            batch.totalGrossSalary = totalGross;
            batch.totalDeductions = totalDeductions;
            batch.totalNetSalary = totalNet;
            batch.totalEmployees = batch.employeePayrolls.length;

            await batch.save();
            return batch;
        } catch (error) {
            console.error('Error recalculating second salary batch totals:', error);
            throw error;
        }
    }
}

module.exports = SecondSalaryBatchService;
