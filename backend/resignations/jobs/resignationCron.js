const cron = require('node-cron');
const ResignationRequest = require('../model/ResignationRequest');
const Employee = require('../../employees/model/Employee');
const EmployeeHistory = require('../../employees/model/EmployeeHistory');

/**
 * Daily cron job to deactivate employees whose Last Working Day (LWD) has passed.
 * Runs daily at 00:05 IST.
 */
const startResignationCron = () => {
  // 00:05 everyday
  cron.schedule('5 0 * * *', async () => {
    console.log('[ResignationCron] Running daily employee deactivation check...');
    try {
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      // We look for approved resignations where leftDate is in the past (e.g. yesterday or -2 days)
      // to ensure we deactivate them on LWD + 1.
      // Filter: status is 'approved' and leftDate < today.
      const resignationRequests = await ResignationRequest.find({
        status: 'approved',
        leftDate: { $lt: today },
      }).lean();

      console.log(`[ResignationCron] Found ${resignationRequests.length} approved resignations with past LWD.`);

      for (const req of resignationRequests) {
        const employee = await Employee.findOne({ 
          _id: req.employeeId,
          is_active: true // Only process those still active
        });

        if (employee) {
          console.log(`[ResignationCron] Deactivating employee: ${employee.emp_no} (${employee.employee_name})`);
          
          employee.is_active = false;
          // Ensure leftDate and reason are mirrored if not already done during approval
          if (!employee.leftDate) employee.leftDate = req.leftDate;
          if (!employee.leftReason) employee.leftReason = req.remarks;
          
          await employee.save();

          // Log to Employee History
          try {
            await EmployeeHistory.create({
              emp_no: employee.emp_no,
              event: 'system_auto_deactivation',
              performedBy: null, // System action
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
      }

      console.log('[ResignationCron] Daily check completed.');
    } catch (error) {
      console.error('[ResignationCron] Error during daily deactivation check:', error);
    }
  }, {
    scheduled: true,
    timezone: "Asia/Kolkata"
  });
};

module.exports = { startResignationCron };
