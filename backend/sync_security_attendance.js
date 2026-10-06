const mongoose = require('mongoose');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });

const {
  runSecurityDivisionAttendanceEngine,
  getPayrollCycleRange
} = require('./attendance/services/securityDivisionAttendanceService');

async function main() {
  try {
    const mongoUri = process.env.MONGO_URI || process.env.MONGODB_URI;
    console.log('Connecting to Mongo URI:', mongoUri);
    await mongoose.connect(mongoUri);
    console.log('Connected to DB successfully!');

    // Read optional date range from command line arguments
    const args = process.argv.slice(2);
    let startDate = args[0];
    let endDate = args[1];

    if (!startDate || !endDate) {
      const cycle = getPayrollCycleRange(new Date());
      startDate = startDate || cycle.startDate;
      endDate = endDate || cycle.endDate;
    }

    console.log(`\n--- Running Dynamic Security Division Attendance Engine ---`);
    console.log(`Period: ${startDate} to ${endDate}\n`);

    const result = await runSecurityDivisionAttendanceEngine({
      startDate,
      endDate,
      overrideWithThumbs: true
    });

    console.log(`\n================ DYNAMIC SYNC COMPLETE ================`);
    console.log(`Total Security Employees Processed: ${result.totalEmployees}`);
    console.log(`Total Days Processed: ${result.processedDays}`);
    console.log(`AttendanceDaily Records Upserted: ${result.dailyRecordsUpserted}`);
    console.log(`Discrepancies Identified: ${result.discrepancyCount}`);

    console.log('\n--- Employee Attendance Summary ---');
    result.employeeSummaries.forEach(s => {
      console.log(`Emp ${s.empNo} (${s.empName}): Days=${s.totalDays}, ThumbPresent=${s.thumbPresentDays}, Leave=${s.leaveDays}, Absent=${s.absentDays}, Hours=${s.totalWorkingHours}, Shifts=${s.totalPayableShifts}, LateIns=${s.lateInsCount || 0} (${s.totalLateInMinutes || 0}m), EarlyOuts=${s.earlyOutsCount || 0} (${s.totalEarlyOutMinutes || 0}m)`);
    });

    // Allow async post-save hooks to settle cleanly
    await new Promise(r => setTimeout(r, 4000));
    await mongoose.disconnect();
    process.exit(0);
  } catch (err) {
    console.error('Error during security division sync:', err);
    process.exit(1);
  }
}

main();
