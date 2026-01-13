const { Worker } = require('bullmq');
const { redisConfig } = require('../../config/redis');

// Start the workers
const startWorkers = () => {
    console.log('🚀 Starting BullMQ Workers...');

    // Payroll Worker
    const payrollWorker = new Worker('payrollQueue', async (job) => {
        console.log(`[Worker] Processing payroll job: ${job.id} (Name: ${job.name})`);

        const { employeeId, month, userId, batchId, action } = job.data;

        try {
            const PayrollCalculationService = require('../../payroll/services/payrollCalculationService');

            if (action === 'recalculate_batch') {
                const PayrollBatch = require('../../payroll/model/PayrollBatch');
                const batch = await PayrollBatch.findById(batchId).populate('employeePayrolls');

                if (!batch) throw new Error('Batch not found');

                console.log(`[Worker] Recalculating batch ${batchId} with ${batch.employeePayrolls.length} employees`);

                for (let i = 0; i < batch.employeePayrolls.length; i++) {
                    const payroll = batch.employeePayrolls[i];
                    await PayrollCalculationService.calculatePayrollNew(payroll.employeeId, batch.month, userId);

                    // Update progress
                    await job.updateProgress({
                        processed: i + 1,
                        total: batch.employeePayrolls.length,
                        percentage: Math.round(((i + 1) / batch.employeePayrolls.length) * 100)
                    });
                }

                console.log(`[Worker] Batch ${batchId} recalculation complete`);
            } else {
                // Single employee calculation
                await PayrollCalculationService.calculatePayrollNew(employeeId, month, userId);
            }
        } catch (error) {
            console.error(`[Worker] Payroll job ${job.id} failed:`, error.message);
            throw error;
        }
    }, { connection: redisConfig });

    // Attendance Sync Worker
    const attendanceSyncWorker = new Worker('attendanceSyncQueue', async (job) => {
        console.log(`[Worker] Processing attendance sync job: ${job.id}`);

        try {
            const { syncAttendanceFromMSSQL } = require('../../attendance/services/attendanceSyncService');
            const stats = await syncAttendanceFromMSSQL();
            console.log(`[Worker] Attendance sync complete: ${stats.message}`);
            return stats;
        } catch (error) {
            console.error(`[Worker] Attendance sync job ${job.id} failed:`, error.message);
            throw error;
        }
    }, { connection: redisConfig });

    payrollWorker.on('completed', (job) => {
        console.log(`[Worker] Job ${job.id} has completed!`);
    });

    payrollWorker.on('failed', (job, err) => {
        console.error(`[Worker] Job ${job.id} has failed with ${err.message}`);
    });

    attendanceSyncWorker.on('completed', (job) => {
        console.log(`[Worker] Attendance Sync Job ${job.id} completed successfully`);
    });

    console.log('✅ BullMQ Workers are ready');
};

module.exports = { startWorkers };
