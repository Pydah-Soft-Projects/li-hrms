const cron = require('node-cron');
const Employee = require('../../employees/model/Employee');
const { applyDueTimelineToMaster } = require('../../employees/services/employeeTimelineService');

/**
 * Apply deferred org/salary timeline segments to Employee master (effectDate reached).
 * Runs daily at 00:10 IST.
 */
const startEmployeeTimelineCron = () => {
  cron.schedule(
    '10 0 * * *',
    async () => {
      console.log('[EmployeeTimelineCron] Applying due org/salary timeline segments…');
      try {
        const employees = await Employee.find({
          $or: [
            { 'orgHistory.0': { $exists: true } },
            { 'salaryHistory.0': { $exists: true } },
          ],
        });
        let updated = 0;
        for (const emp of employees) {
          const changed = applyDueTimelineToMaster(emp);
          if (changed) {
            await emp.save();
            updated += 1;
          }
        }
        console.log(`[EmployeeTimelineCron] Updated ${updated} employee master(s).`);
      } catch (err) {
        console.error('[EmployeeTimelineCron] Error:', err);
      }
    },
    { scheduled: true, timezone: 'Asia/Kolkata' }
  );
};

module.exports = { startEmployeeTimelineCron };
