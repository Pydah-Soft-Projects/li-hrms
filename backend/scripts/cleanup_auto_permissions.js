
const { initializeAllDatabases } = require('../config/init');
const Permission = require('../permissions/model/Permission');
const AttendanceDaily = require('../attendance/model/AttendanceDaily');
const { refreshAttendanceEdgePermissions } = require('../permissions/services/permissionEdgeAttendanceService');
const mongoose = require('mongoose');

async function run() {
  try {
    console.log('Starting cleanup of auto-permissions and traces...');
    await initializeAllDatabases();
    console.log('✅ Databases initialized');

    // 1. Find auto-permissions
    const autoPermissions = await Permission.find({ creationSource: 'auto_edge' }).select('employeeNumber date');
    console.log(`🔍 Found ${autoPermissions.length} auto-permissions to delete`);

    if (autoPermissions.length === 0) {
      console.log('✨ No auto-permissions found. Nothing to clean up.');
      process.exit(0);
    }

    const affectedDays = new Map(); // employeeNumber -> Set of dates
    for (const p of autoPermissions) {
      if (!affectedDays.has(p.employeeNumber)) {
        affectedDays.set(p.employeeNumber, new Set());
      }
      affectedDays.get(p.employeeNumber).add(p.date);
    }

    // Delete them
    const deleteResult = await Permission.deleteMany({ creationSource: 'auto_edge' });
    console.log(`🗑️  Deleted ${deleteResult.deletedCount} permission records`);

    // 2. Clean up AttendanceDaily traces
    console.log(`🧹 Cleaning up traces in AttendanceDaily for ${affectedDays.size} employees...`);
    let dailyCleanCount = 0;
    let errorCount = 0;

    for (const [empNo, dates] of affectedDays.entries()) {
      for (const date of dates) {
        try {
          const daily = await AttendanceDaily.findOne({ employeeNumber: empNo, date });
          if (daily) {
            // Reset edgePermissionHours and penalty flags to force raw re-calculation
            if (daily.shifts && daily.shifts.length > 0) {
              for (const shift of daily.shifts) {
                shift.edgePermissionHours = 0;
                shift.isLateIn = false;
                shift.lateInMinutes = null;
                shift.isEarlyOut = false;
                shift.earlyOutMinutes = null;
              }
              daily.markModified('shifts');
            }
            
            // Save to clear the fields
            await daily.save(); 
            
            // Re-run the edge permission refresh (which will now see 0 permissions and set raw values)
            // This also triggers monthly summary recalculation
            await refreshAttendanceEdgePermissions(empNo, date);
            
            dailyCleanCount++;
          }
        } catch (err) {
          console.error(`❌ Error cleaning up ${empNo} on ${date}:`, err.message);
          errorCount++;
        }
      }
    }

    console.log(`\n✅ Cleanup Summary:`);
    console.log(`- Permissions deleted: ${deleteResult.deletedCount}`);
    console.log(`- Attendance records restored to raw state: ${dailyCleanCount}`);
    if (errorCount > 0) {
      console.log(`- Errors encountered: ${errorCount}`);
    }
    console.log(`\nMonthly summaries have been triggered for recalculation.`);
    console.log('You can now "push the logs again" to re-process attendance.');
    
    process.exit(0);
  } catch (error) {
    console.error('💥 Fatal error during cleanup:', error);
    process.exit(1);
  }
}

run();
