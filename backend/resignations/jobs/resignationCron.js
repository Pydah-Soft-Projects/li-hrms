const cron = require('node-cron');
const ResignationRequest = require('../model/ResignationRequest');
const Employee = require('../../employees/model/Employee');
const EmployeeHistory = require('../../employees/model/EmployeeHistory');
const {
  runBiometricDeviceOffboard,
  isPastLastWorkingDay,
} = require('../../attendance/services/biometricDeviceLifecycleService');

/**
 * Daily cron: after LWD+1, deactivate HRMS account (if still active) and
 * remove the user from all biometric devices they belonged to.
 * Runs daily at 00:05 IST.
 */
const startResignationCron = () => {
  cron.schedule('5 0 * * *', async () => {
    console.log('[ResignationCron] Running daily employee deactivation check...');
    try {
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const resignationRequests = await ResignationRequest.find({
        status: 'approved',
        leftDate: { $lt: today },
      }).lean();

      console.log(`[ResignationCron] Found ${resignationRequests.length} approved resignations with past LWD.`);

      const processedEmpNos = new Set();

      for (const req of resignationRequests) {
        const employee = await Employee.findOne({
          _id: req.employeeId,
        });

        if (!employee) continue;

        if (employee.is_active) {
          console.log(`[ResignationCron] Deactivating employee: ${employee.emp_no} (${employee.employee_name})`);

          employee.is_active = false;
          if (!employee.leftDate) employee.leftDate = req.leftDate;
          if (!employee.leftReason) employee.leftReason = req.remarks;

          await employee.save();

          try {
            await EmployeeHistory.create({
              emp_no: employee.emp_no,
              event: 'system_auto_deactivation',
              performedBy: null,
              performedByName: 'System (Cron Job)',
              performedByRole: 'system',
              details: {
                resignationId: req._id,
                leftDate: req.leftDate,
              },
              comments: `Automated deactivation after Last Working Day (${req.leftDate.toISOString().split('T')[0]})`,
            });
          } catch (historyErr) {
            console.error(`[ResignationCron] Failed to log history for ${employee.emp_no}:`, historyErr.message);
          }
        }

        // Biometric offboard on LWD+1 (resign + terminate + already-inactive accounts)
        if (!employee.biometricOffboardedAt) {
          try {
            const bio = await runBiometricDeviceOffboard(employee.emp_no, { force: false });
            if (!bio.skipped) {
              console.log(
                `[ResignationCron] Biometric offboard ${employee.emp_no}: devices=${(bio.deviceIds || []).join(',') || 'none'}`
              );
            } else if (bio.reason && bio.reason !== 'already_offboarded' && bio.reason !== 'lwd_not_reached') {
              console.log(`[ResignationCron] Biometric offboard skipped ${employee.emp_no}: ${bio.reason}`);
            }
          } catch (bioErr) {
            console.error(`[ResignationCron] Biometric offboard error for ${employee.emp_no}:`, bioErr.message);
          }
        }

        processedEmpNos.add(String(employee.emp_no).toUpperCase());
      }

      // Manual left-date / edge cases: employees with past LWD not yet biometric-offboarded
      const leftover = await Employee.find({
        leftDate: { $lt: today },
        biometricOffboardedAt: null,
        emp_no: { $nin: [...processedEmpNos] },
      }).select('emp_no leftDate').lean();

      for (const emp of leftover) {
        if (!isPastLastWorkingDay(emp.leftDate)) continue;
        try {
          const bio = await runBiometricDeviceOffboard(emp.emp_no, { force: false });
          if (!bio.skipped) {
            console.log(
              `[ResignationCron] Biometric offboard (manual/left) ${emp.emp_no}: devices=${(bio.deviceIds || []).join(',') || 'none'}`
            );
          }
        } catch (bioErr) {
          console.error(`[ResignationCron] Biometric offboard error for ${emp.emp_no}:`, bioErr.message);
        }
      }

      console.log('[ResignationCron] Daily check completed.');
    } catch (error) {
      console.error('[ResignationCron] Error during daily deactivation check:', error);
    }
  }, {
    scheduled: true,
    timezone: 'Asia/Kolkata',
  });
};

module.exports = { startResignationCron };
