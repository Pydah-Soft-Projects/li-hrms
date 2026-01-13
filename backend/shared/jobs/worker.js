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

    // Application Action Worker
    const applicationWorker = new Worker('applicationQueue', async (job) => {
        const { type, applicationIds, approvalData, approverId, comments } = job.data;
        console.log(`[Worker] Processing ${type} for ${applicationIds.length} applications`);

        const EmployeeApplication = require('../../employee-applications/model/EmployeeApplication');
        const Employee = require('../../employees/model/Employee');
        const EmployeeApplicationFormSettings = require('../../employee-applications/model/EmployeeApplicationFormSettings');
        const { resolveQualificationLabels, transformApplicationToEmployee } = require('../../employee-applications/services/fieldMappingService');
        const { generatePassword, sendCredentials } = require('../../shared/services/passwordNotificationService');
        const sqlHelper = require('../../employees/config/sqlHelper');

        const results = {
            successCount: 0,
            failCount: 0,
            errors: []
        };

        for (let i = 0; i < applicationIds.length; i++) {
            const id = applicationIds[i];
            try {
                if (type === 'approve-bulk') {
                    // Approval logic
                    const { approvedSalary, doj, employeeAllowances, employeeDeductions, ctcSalary, calculatedSalary } = approvalData || {};
                    const application = await EmployeeApplication.findById(id);

                    if (!application) throw new Error(`Application ${id} not found`);
                    if (application.status !== 'pending') throw new Error(`Application ${id} is already ${application.status}`);

                    const finalSalary = approvedSalary !== undefined ? approvedSalary : application.proposedSalary;
                    const finalDOJ = doj ? new Date(doj) : new Date();

                    application.status = 'approved';
                    application.approvedSalary = finalSalary;
                    application.doj = finalDOJ;
                    application.approvedBy = approverId;
                    application.approvedAt = new Date();
                    application.approvalComments = comments || 'Bulk approved';

                    // Normalization logic
                    const normalize = (list) => Array.isArray(list) ? list.filter(item => item && (item.masterId || item.name)).map(item => ({ ...item, isOverride: true })) : [];
                    application.employeeAllowances = employeeAllowances ? normalize(employeeAllowances) : (application.employeeAllowances || []);
                    application.employeeDeductions = employeeDeductions ? normalize(employeeDeductions) : (application.employeeDeductions || []);

                    // Transform to Employee
                    const appObj = application.toObject();
                    const settings = await EmployeeApplicationFormSettings.getActiveSettings();
                    if (settings && appObj.qualifications) appObj.qualifications = resolveQualificationLabels(appObj.qualifications, settings);

                    const { permanentFields, dynamicFields } = transformApplicationToEmployee(appObj, { gross_salary: finalSalary, doj: finalDOJ });
                    const employeeData = { ...permanentFields, dynamicFields: dynamicFields || {}, password: await generatePassword(permanentFields, null), is_active: true };

                    await Employee.create(employeeData);
                    await application.save();

                    // Optional MSSQL Sync
                    if (sqlHelper.isHRMSConnected?.() && !await sqlHelper.employeeExistsMSSQL(employeeData.emp_no)) {
                        await sqlHelper.createEmployeeMSSQL(employeeData).catch(e => console.error(`MSSQL Error for ${employeeData.emp_no}:`, e.message));
                    }

                    // Send Credentials
                    await sendCredentials(employeeData, employeeData.password, { email: true, sms: true }).catch(e => console.error(`Notification Error:`, e.message));

                } else if (type === 'reject-bulk') {
                    // Rejection logic
                    const application = await EmployeeApplication.findById(id);
                    if (!application) throw new Error(`Application ${id} not found`);
                    if (application.status !== 'pending') throw new Error(`Application ${application.emp_no} is already ${application.status}`);

                    application.status = 'rejected';
                    application.rejectedBy = approverId;
                    application.rejectionComments = comments || 'Bulk rejected';
                    application.rejectedAt = new Date();
                    await application.save();
                }

                results.successCount++;
            } catch (err) {
                results.failCount++;
                results.errors.push({ id, message: err.message });
            }

            // Update Progress
            await job.updateProgress({
                processed: i + 1,
                total: applicationIds.length,
                percentage: Math.round(((i + 1) / applicationIds.length) * 100)
            });
        }

        console.log(`[Worker] ${type} complete: ${results.successCount} success, ${results.failCount} fail`);
        return results;
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

    applicationWorker.on('completed', (job) => {
        console.log(`[Worker] Application Job ${job.id} (${job.data.type}) completed successfully`);
    });

    applicationWorker.on('failed', (job, err) => {
        console.error(`[Worker] Application Job ${job.id} failed: ${err.message}`);
    });

    console.log('✅ BullMQ Workers are ready');
};

module.exports = { startWorkers };
