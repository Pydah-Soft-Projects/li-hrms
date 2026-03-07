const { payrollQueue } = require('../../shared/jobs/queueManager');
const Employee = require('../../employees/model/Employee');

/**
 * Service to synchronize Second Salary by triggering background recalculations.
 */
class SecondSalarySyncService {
    /**
     * Sync a single employee's second salary for a specific month.
     * @param {string} employeeId - Employee ID
     * @param {string} month - Month (YYYY-MM)
     * @param {string} userId - User ID who triggered the sync
     */
    async syncEmployee(employeeId, month, userId) {
        try {
            if (!employeeId || !month) return;

            const employee = await Employee.findById(employeeId).select('division_id department_id employee_name');
            if (!employee) return;

            const jobId = `sync_second_salary_${employeeId}_${month}_${Date.now()}`;
            await payrollQueue.add('second_salary_calculation', {
                action: 'second_salary_batch',
                departmentId: employee.department_id,
                divisionId: employee.division_id,
                month,
                userId,
                employeeIds: [employeeId]
            }, { jobId });

            console.log(`[SecondSalarySyncService] Queued sync for ${employee.employee_name} (${month})`);
        } catch (error) {
            console.error('[SecondSalarySyncService] Error syncing employee:', error);
        }
    }

    /**
     * Sync multiple employees' second salary for a specific month.
     * @param {string[]} employeeIds - Array of employee IDs
     * @param {string} month - Month (YYYY-MM)
     * @param {string} userId - User ID who triggered the sync
     */
    async syncMultipleEmployees(employeeIds, month, userId) {
        try {
            if (!employeeIds || !employeeIds.length || !month) return;

            // Group by division/department if needed, but for simplicity of sync, we can just queue them
            // The worker handles a list of employeeIds efficiently.

            // We'll peek at the first employee to get division/dept for the job metadata
            const firstEmp = await Employee.findById(employeeIds[0]).select('division_id department_id');

            const jobId = `sync_second_salary_bulk_${month}_${Date.now()}`;
            await payrollQueue.add('second_salary_calculation', {
                action: 'second_salary_batch',
                departmentId: firstEmp?.department_id,
                divisionId: firstEmp?.division_id,
                month,
                userId,
                employeeIds
            }, { jobId });

            console.log(`[SecondSalarySyncService] Queued bulk sync for ${employeeIds.length} employees (${month})`);
        } catch (error) {
            console.error('[SecondSalarySyncService] Error syncing multiple employees:', error);
        }
    }
}

module.exports = new SecondSalarySyncService();
