const { Worker } = require('bullmq');
const { redisConfig } = require('../../config/redis');
const { extractISTComponents, createISTDate } = require('../../shared/utils/dateUtils');

/**
 * Build the pre-fetched department context (optimization reused by per-employee calculation).
 *
 * departmentId / divisionId may be a single id, a comma-separated string (multi-select), or 'all'.
 * The shared department context only makes sense for a SINGLE department (per-employee calc falls back
 * to resolving its own department otherwise), so when zero or multiple departments are selected we skip
 * the prefetch. This also avoids `Department.findById('id1,id2')` throwing a Cast to ObjectId error.
 */
async function buildSharedDepartmentContext(departmentId, divisionId) {
    const empty = { department: null, includeMissing: undefined };
    const { parseQueryIdList } = require('../../pay-register/services/payRegisterEmployeeFilter');

    const deptIds = parseQueryIdList(departmentId);
    if (deptIds.length !== 1) return empty;

    const divIds = parseQueryIdList(divisionId);
    const singleDivId = divIds.length === 1 ? divIds[0] : null;

    const Department = require('../../departments/model/Department');
    const allowanceDeductionResolverService = require('../../payroll/services/allowanceDeductionResolverService');

    const [department, includeMissing] = await Promise.all([
        Department.findById(deptIds[0]),
        allowanceDeductionResolverService.getIncludeMissingFlag(deptIds[0], singleDivId),
    ]);

    return { department, includeMissing };
}

// Start the workers
const startWorkers = () => {
    console.log('🚀 Starting BullMQ Workers...');

    // Payroll Worker
    const payrollWorker = new Worker('payrollQueue', async (job) => {
        console.log(`[Worker] Processing payroll job: ${job.id} (Name: ${job.name}, action: ${job.data?.action || 'n/a'})`);

        const { employeeId, month, userId, batchId, action, departmentId, divisionId } = job.data;

        try {
            const PayrollCalculationService = require('../../payroll/services/payrollCalculationService');

            if (action === 'recalculate_batch') {
                const PayrollBatch = require('../../payroll/model/PayrollBatch');
                const batch = await PayrollBatch.findById(batchId).populate('employeePayrolls');

                if (!batch) throw new Error('Batch not found');

                console.log(`[Worker] Recalculating batch ${batchId} with ${batch.employeePayrolls.length} employees`);

                for (let i = 0; i < batch.employeePayrolls.length; i++) {
                    const payroll = batch.employeePayrolls[i];
                    const empId = payroll.employeeId?._id || payroll.employeeId;
                    await PayrollCalculationService.calculatePayrollNew(empId, batch.month, userId, {
                        source: 'payregister',
                        consumeRecalculationPermission: false
                    });

                    // Update progress
                    await job.updateProgress({
                        processed: i + 1,
                        total: batch.employeePayrolls.length,
                        percentage: Math.round(((i + 1) / batch.employeePayrolls.length) * 100)
                    });
                }

                if (['approved', 'freeze', 'complete'].includes(batch.status) && batch.hasValidRecalculationPermission()) {
                    batch.consumeRecalculationPermission?.();
                    await batch.save();
                }

                console.log(`[Worker] Batch ${batchId} recalculation complete`);
            } else if (action === 'second_salary_batch') {
                const { isSecondSalaryGloballyEnabled } = require('../../settings/secondSalaryFeatureGate');
                if (!(await isSecondSalaryGloballyEnabled())) {
                    console.log('[Worker] Skipping second_salary_batch: disabled in Payroll settings');
                    return { skipped: true, reason: 'second_salary_disabled' };
                }
                const { calculateSecondSalary } = require('../../payroll/services/secondSalaryCalculationService');
                const SecondSalaryBatchService = require('../../payroll/services/secondSalaryBatchService');
                const Employee = require('../../employees/model/Employee');

                let employees;
                if (job.data.employeeIds && Array.isArray(job.data.employeeIds) && job.data.employeeIds.length > 0) {
                    employees = await Employee.find({ _id: { $in: job.data.employeeIds } });
                    console.log(`[Worker] Calculating 2nd salary for ${employees.length} employees (from controller list)`);
                } else {
                    const { getSecondSalaryEmployeeQuery } = require('../../payroll/services/payrollEmployeeQueryHelper');
                    const { getPayrollDateRange } = require('../../shared/utils/dateUtils');
                    const { year: curYear, month: curMonth } = extractISTComponents(new Date());
                    const [year, monthNum] = month ? month.split('-').map(Number) : [curYear, curMonth];
                    const { startDate, endDate } = month ? await getPayrollDateRange(year, monthNum) : { startDate: null, endDate: null };
                    const leftDateRange = (startDate && endDate) ? { start: new Date(startDate), end: new Date(endDate) } : undefined;
                    const query = getSecondSalaryEmployeeQuery({ departmentId, divisionId, leftDateRange });
                    employees = await Employee.find(query);
                    console.log(`[Worker] Calculating 2nd salary for ${employees.length} employees (from query)`);
                }

                // Optimization: Pre-fetch department and settings for context (single-department selection only)
                const sharedContext = await buildSharedDepartmentContext(departmentId, divisionId);

                const batchIds = new Set();

                for (let i = 0; i < employees.length; i++) {
                    const employee = employees[i];
                    try {
                        const result = await calculateSecondSalary(employee._id, month, userId, sharedContext);
                        if (result.batchId) batchIds.add(result.batchId.toString());
                    } catch (err) {
                        console.error(`[Worker] Failed 2nd salary for ${employee.emp_no}:`, err.message);
                    }

                    // Update progress
                    await job.updateProgress({
                        processed: i + 1,
                        total: employees.length,
                        percentage: Math.round(((i + 1) / employees.length) * 100),
                        currentEmployee: employee.employee_name
                    });
                }

                // Recalculate totals for all affected batches
                for (const bId of batchIds) {
                    await SecondSalaryBatchService.recalculateBatchTotals(bId);
                }
                console.log(`[Worker] 2nd Salary batch calculation complete`);
            } else if (action === 'payroll_bulk_calculate') {
                const Employee = require('../../employees/model/Employee');
                const PayrollBatchService = require('../../payroll/services/payrollBatchService');
                const { buildPayRegisterEmployeeFilter } = require('../../pay-register/services/payRegisterEmployeeFilter');
                const { ensurePayRegisterForPayroll } = require('../../pay-register/services/autoSyncService');
                const { EJSON } = require('bson');
                const { getPayrollDateRange } = require('../../shared/utils/dateUtils');

                let employees;
                const { year: curYear, month: curMonth } = extractISTComponents(new Date());
                const [year, monthNum] = month ? month.split('-').map(Number) : [curYear, curMonth];
                const { startDate, endDate } = month ? await getPayrollDateRange(year, monthNum) : { startDate: null, endDate: null };
                const leftStart = startDate && endDate ? new Date(startDate + 'T00:00:00.000Z') : null;
                const leftEnd = startDate && endDate ? new Date(endDate + 'T23:59:59.999Z') : null;

                const legacyEmployeeIds =
                    job.data.employeeIds && Array.isArray(job.data.employeeIds) && job.data.employeeIds.length > 0;
                if (!legacyEmployeeIds && leftStart && leftEnd) {
                    const scopeDeserialized =
                        job.data.scopeFilter != null ? EJSON.deserialize(job.data.scopeFilter) : null;
                    const searchTrim =
                        job.data.search && String(job.data.search).trim() ? String(job.data.search).trim() : undefined;
                    const groupF =
                        job.data.employeeGroupId && job.data.employeeGroupId !== 'all'
                            ? job.data.employeeGroupId
                            : undefined;
                    const empQuery = await buildPayRegisterEmployeeFilter(leftStart, leftEnd, {
                        departmentId,
                        divisionId,
                        employeeGroupId: groupF,
                        search: searchTrim,
                        scopeFilter: scopeDeserialized,
                    });
                    employees = await Employee.find(empQuery);
                    console.log(
                        `[Worker] Bulk calculating payroll for ${employees.length} employees (pay register filters${searchTrim ? `, search="${searchTrim}"` : ''})`
                    );
                } else if (legacyEmployeeIds) {
                    employees = await Employee.find({ _id: { $in: job.data.employeeIds } });
                    console.log(`[Worker] Bulk calculating payroll for ${employees.length} employees (legacy job: employeeIds)`);
                } else {
                    const { getRegularPayrollEmployeeQuery } = require('../../payroll/services/payrollEmployeeQueryHelper');
                    const leftDateRange = (startDate && endDate) ? { start: new Date(startDate), end: new Date(endDate) } : undefined;
                    const query = getRegularPayrollEmployeeQuery({ departmentId, divisionId, leftDateRange });
                    employees = await Employee.find(query);
                    console.log(`[Worker] Bulk calculating payroll for ${employees.length} employees (legacy job: dept/div query)`);
                }

                // Optimization: Pre-fetch department and settings for context (single-department selection only)
                const sharedContext = await buildSharedDepartmentContext(departmentId, divisionId);

                const batchIds = new Set();
                const useLegacy = job.data.strategy === 'legacy';
                const useDynamic = job.data.strategy === 'dynamic';
                const opts = { source: useLegacy ? 'all' : 'payregister' };

                let useOutputColumnsEngine = false;
                if (useDynamic) {
                    const PayrollConfiguration = require('../../payroll/model/PayrollConfiguration');
                    const config = await PayrollConfiguration.get();
                    useOutputColumnsEngine = Array.isArray(config?.outputColumns) && config.outputColumns.length > 0;
                }

                const payrollFromOutputColumns = useOutputColumnsEngine
                    ? require('../../payroll/services/payrollCalculationFromOutputColumnsService')
                    : null;

                const { settlementsForEmployee } = require('../../payroll/utils/bulkPayrollSettlements');
                const bulkArrears = job.data.arrears;
                const bulkDeductions = job.data.deductions;

                const secondSalaryEmployees = employees.filter((e) => Number(e.second_salary) > 0);
                const overallTotal = employees.length + secondSalaryEmployees.length;

                for (let i = 0; i < employees.length; i++) {
                    const employee = employees[i];
                    try {
                        if (opts.source === 'payregister' || !useLegacy) {
                            await ensurePayRegisterForPayroll(employee._id.toString(), month);
                        }
                        const { arrearsSettlements, deductionSettlements } = settlementsForEmployee(
                            employee._id,
                            bulkArrears,
                            bulkDeductions
                        );
                        let result;
                        if (useOutputColumnsEngine && payrollFromOutputColumns) {
                            result = await payrollFromOutputColumns.calculatePayrollFromOutputColumns(
                                employee._id.toString(),
                                month,
                                userId,
                                {
                                    source: 'payregister',
                                    arrearsSettlements,
                                    deductionSettlements,
                                }
                            );
                        } else {
                            result = await PayrollCalculationService.calculatePayrollNew(
                                employee._id.toString(),
                                month,
                                userId,
                                {
                                    ...opts,
                                    consumeRecalculationPermission: false,
                                    arrearsSettlements,
                                    deductionSettlements,
                                },
                                sharedContext
                            );
                        }
                        if (result.batchId) batchIds.add(result.batchId.toString());
                    } catch (err) {
                        console.error(`[Worker] Failed bulk payroll for ${employee.emp_no || employee._id}:`, err.message);
                    }

                    const overallProcessed = i + 1;
                    await job.updateProgress({
                        phase: 'regular',
                        processed: i + 1,
                        total: employees.length,
                        overallProcessed,
                        overallTotal,
                        percentage: overallTotal ? Math.round((overallProcessed / overallTotal) * 100) : 100,
                        currentEmployee: employee.employee_name,
                    });
                }

                // Recalculate totals for all affected batches
                for (const bId of batchIds) {
                    await PayrollBatchService.recalculateBatchTotals(bId);
                    const batchDoc = await require('../../payroll/model/PayrollBatch').findById(bId);
                    if (batchDoc && ['approved', 'freeze', 'complete'].includes(batchDoc.status) && batchDoc.hasValidRecalculationPermission()) {
                        batchDoc.consumeRecalculationPermission?.();
                        await batchDoc.save();
                    }
                }
                console.log(`[Worker] Bulk regular payroll calculation complete`);

                const { isSecondSalaryGloballyEnabled } = require('../../settings/secondSalaryFeatureGate');
                const { isSuperAdmin } = require('../../employees/utils/employeeFeatureAccess');
                const User = require('../../users/model/User');
                const bulkUser = userId ? await User.findById(userId).select('role roles featureControl').lean() : null;
                const bulkUserForAuth = bulkUser
                  ? { role: bulkUser.role, roles: bulkUser.roles, featureControl: bulkUser.featureControl }
                  : null;
                const secondSalaryGloballyOn = await isSecondSalaryGloballyEnabled();
                const mayPostSecondSalary = secondSalaryGloballyOn && isSuperAdmin(bulkUserForAuth);
                const { calculateSecondSalaryForPayRegister } = require('../../payroll/services/secondSalaryCalculationService');
                const SecondSalaryBatchService = require('../../payroll/services/secondSalaryBatchService');
                const secondBatchIds = new Set();

                for (let j = 0; mayPostSecondSalary && j < secondSalaryEmployees.length; j++) {
                    const employee = secondSalaryEmployees[j];
                    try {
                        const { arrearsSettlements, deductionSettlements } = settlementsForEmployee(
                            employee._id,
                            bulkArrears,
                            bulkDeductions
                        );
                        const regularUsedDynamicOutputColumns = !!(useOutputColumnsEngine && payrollFromOutputColumns);
                        const result = await calculateSecondSalaryForPayRegister(
                            employee._id.toString(),
                            month,
                            userId,
                            job.data.strategy || 'new',
                            sharedContext,
                            { arrearsSettlements, deductionSettlements },
                            { regularUsedDynamicOutputColumns }
                        );
                        const bid = result?.batchId;
                        if (bid) secondBatchIds.add(bid.toString());
                    } catch (err) {
                        console.error(`[Worker] Failed 2nd salary after bulk for ${employee.emp_no || employee._id}:`, err.message);
                    }

                    const overallProcessed = employees.length + j + 1;
                    await job.updateProgress({
                        phase: 'second_salary',
                        processed: j + 1,
                        total: secondSalaryEmployees.length,
                        overallProcessed,
                        overallTotal,
                        percentage: overallTotal ? Math.round((overallProcessed / overallTotal) * 100) : 100,
                        currentEmployee: employee.employee_name,
                    });
                }

                for (const bId of secondBatchIds) {
                    await SecondSalaryBatchService.recalculateBatchTotals(bId);
                }
                console.log(`[Worker] Bulk payroll + 2nd salary calculation complete`);
            } else {
                await PayrollCalculationService.calculatePayrollNew(employeeId, month, userId, { source: 'payregister' });
            }
        } catch (error) {
            console.error(`[Worker] Payroll job ${job.id} failed:`, error.message);
            throw error;
        }
    }, { connection: redisConfig });

    // Application Action Worker
    const applicationWorker = new Worker('applicationQueue', async (job) => {
        const { type, applicationIds, bulkSettings, approverId, comments } = job.data;
        console.log(`[Worker] Processing ${type} for ${applicationIds.length} applications`);

        const EmployeeApplication = require('../../employee-applications/model/EmployeeApplication');
        const Employee = require('../../employees/model/Employee');
        const EmployeeApplicationFormSettings = require('../../employee-applications/model/EmployeeApplicationFormSettings');
        const { resolveQualificationLabels, transformApplicationToEmployee } = require('../../employee-applications/services/fieldMappingService');
        const { generatePassword, sendCredentials } = require('../../shared/services/passwordNotificationService');
        const results = {
            successCount: 0,
            failCount: 0,
            errors: []
        };

        for (let i = 0; i < applicationIds.length; i++) {
            const id = applicationIds[i];
            try {
                if (type === 'approve-bulk') {
                    // Approval logic - use bulkSettings instead of approvalData
                    const { approvedSalary, doj, comments: bulkComments, employeeAllowances, employeeDeductions, ctcSalary, calculatedSalary } = bulkSettings || {};
                    const application = await EmployeeApplication.findById(id);

                    if (!application) throw new Error(`Application ${id} not found`);
                    if (application.status !== 'pending') throw new Error(`Application ${id} is already ${application.status}`);

                    const finalSalary = approvedSalary !== undefined ? approvedSalary : application.proposedSalary;
                    const finalDOJ = doj ? createISTDate(extractISTComponents(doj).dateStr) : createISTDate(extractISTComponents(new Date()).dateStr);

                    application.status = 'approved';
                    application.approvedSalary = finalSalary;
                    application.doj = finalDOJ;
                    application.approvedBy = approverId;
                    application.approvedAt = new Date();
                    application.approvalComments = bulkComments || comments || 'Bulk approved';

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

    // Attendance Upload Worker
    const attendanceUploadWorker = new Worker('attendanceUploadQueue', async (job) => {
        const { fileBuffer, userId, originalName, rowCount } = job.data;
        console.log(`[Worker] Processing attendance upload: ${originalName} (${rowCount} rows) for User ${userId}`);

        const XLSX = require('xlsx');
        const AttendanceRawLog = require('../../attendance/model/AttendanceRawLog');
        const { processAndAggregateLogs } = require('../../attendance/services/attendanceSyncService');
        const { detectExtraHoursForEmployeeDates } = require('../../attendance/services/extraHoursService');
        const { io } = require('../../server'); // Import io from server.js

        try {
            // Reconstruct buffer
            const buffer = Buffer.from(fileBuffer, 'base64');
            const workbook = XLSX.read(buffer, { type: 'buffer', cellDates: true, cellNF: true });
            const worksheet = workbook.Sheets[workbook.SheetNames[0]];
            const data = XLSX.utils.sheet_to_json(worksheet);

            // Need to reconstruct the parsing logic from controller
            // For simplicity, we'll implement a robust parser here or ideally move it to a service
            // Re-using the parseLegacyRows/parseSimpleRows logic would be better if they were in a service
            // Since they are currently in the controller, I will implement a basic version or 
            // Better: Move parsing logic to a service if possible. 
            // For now, I'll copy the essentials to ensure functionality.

            const rows = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
            let isLegacy = false;
            let headerIdx = -1;
            for (let i = 0; i < 10; i++) {
                if (rows[i] && rows[i].includes('SNO') && rows[i].includes('E .NO') && rows[i].includes('PDate')) {
                    isLegacy = true; headerIdx = i; break;
                }
            }

            const { parseLegacyRows, parseSimpleRows } = require('../../attendance/services/attendanceUploadService');

            let rawLogs = [];
            if (isLegacy) {
                const legacyResult = parseLegacyRows(rows, headerIdx);
                rawLogs = legacyResult.rawLogs;
            } else {
                const simpleResult = parseSimpleRows(data);
                rawLogs = simpleResult.rawLogs;
            }

            // Parsing handled above via attendanceUploadService


            // Bulk Insert
            if (rawLogs.length > 0) {
                const bulkOps = rawLogs.map(log => ({
                    updateOne: {
                        filter: { employeeNumber: log.employeeNumber, timestamp: log.timestamp, type: log.type },
                        update: { $setOnInsert: log },
                        upsert: true
                    }
                }));
                await AttendanceRawLog.bulkWrite(bulkOps, { ordered: false });

                // Aggregate
                const stats = await processAndAggregateLogs(rawLogs, false);

                // Extra hours: only for (employee, date) we just processed (+ yesterday/tomorrow for overnight)
                const entries = rawLogs.map(log => ({
                    employeeNumber: log.employeeNumber,
                    date: log.date || (log.timestamp ? new Date(log.timestamp).toISOString().slice(0, 10) : null),
                })).filter(e => e.date);
                if (entries.length > 0) {
                    await detectExtraHoursForEmployeeDates(entries, { includeAdjacentDays: true });
                }

                const { app, io } = require('../../server'); // Import from server.js
                const activeIo = io || (app && typeof app.get === 'function' ? app.get('io') : null);

                // Notify User
                if (activeIo) {
                    activeIo.to(`user_${userId}`).emit('toast_notification', {
                        type: 'success',
                        message: `Attendance upload of "${originalName}" completed successfully! ${rawLogs.length} logs processed.`,
                        title: 'Attendance Upload Complete'
                    });
                }
            }

            return { success: true, count: rawLogs.length };
        } catch (error) {
            console.error(`[Worker] Attendance upload failed:`, error);
            const { app, io } = require('../../server');
            const activeIo = io || (app && typeof app.get === 'function' ? app.get('io') : null);

            if (activeIo) {
                activeIo.to(`user_${userId}`).emit('toast_notification', {
                    type: 'error',
                    message: `Attendance upload of "${originalName}" failed: ${error.message}`,
                    title: 'Attendance Upload Failed'
                });
            }
            throw error;
        }
    }, { connection: redisConfig });

    // Roster Sync Worker
    const rosterSyncWorker = new Worker('rosterSyncQueue', async (job) => {
        const { entries, userId } = job.data;
        console.log(`[Worker] Processing roster sync job: ${job.id} with ${entries.length} entries`);

        try {
            const { syncRosterEntriesToAttendance } = require('../../attendance/services/rosterAttendanceSyncService');
            const stats = await syncRosterEntriesToAttendance(entries);
            const syncedCount = stats.synced || 0;
            const removedCount = 0;

            console.log(
                `[Worker] Roster sync complete: ${syncedCount} synced, ${stats.reprocessed || 0} reprocessed, ${stats.errors || 0} errors`
            );

            // Notify user via socket if available
            try {
                const { app, io } = require('../../server'); // Import from server.js
                const activeIo = io || (app && typeof app.get === 'function' ? app.get('io') : null);

                if (activeIo) {
                    activeIo.to(`user_${userId}`).emit('toast_notification', {
                        type: 'success',
                        message: `Roster sync complete: ${syncedCount} days updated.`,
                        title: 'Roster Sync Complete'
                    });
                }
            } catch (notifyErr) {
                console.warn('[Worker] Failed to notify user:', notifyErr.message);
            }

            return { success: true, synced: syncedCount, removed: removedCount };

        } catch (error) {
            console.error(`[Worker] Roster sync failed:`, error);
            throw error;
        }
    }, { connection: redisConfig });

    payrollWorker.on('error', (err) => {
        console.error('[Worker] Payroll worker error (check Redis):', err.message);
    });

    payrollWorker.on('completed', (job) => {
        console.log(`[Worker] Job ${job.id} has completed!`);
    });

    payrollWorker.on('failed', (job, err) => {
        console.error(`[Worker] Job ${job.id} has failed with ${err.message}`);
    });

    applicationWorker.on('completed', (job) => {
        console.log(`[Worker] Application Job ${job.id} (${job.data.type}) completed successfully`);
    });

    applicationWorker.on('failed', (job, err) => {
        console.error(`[Worker] Application Job ${job.id} failed: ${err.message}`);
    });

    rosterSyncWorker.on('completed', (job) => {
        console.log(`[Worker] Roster Sync Job ${job.id} completed successfully`);
    });

    rosterSyncWorker.on('failed', (job, err) => {
        console.error(`[Worker] Roster Sync Job ${job.id} failed: ${err.message}`);
    });

    console.log('✅ BullMQ Workers are ready');
};

module.exports = { startWorkers };
