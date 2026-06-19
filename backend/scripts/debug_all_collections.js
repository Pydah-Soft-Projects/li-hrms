const mongoose = require('mongoose');
const path = require('path');

require('dotenv').config({ path: path.join(__dirname, '../.env') });

(async () => {
  try {
    const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/hrms-leave-5';
    await mongoose.connect(mongoUri);
    console.log('✅ Connected to MongoDB\n');

    // Query all collections for employee 2146 data
    const db = mongoose.connection.db;

    console.log('🔍 Searching all collections for employee 2146 data...\n');

    // Check AttendanceRawLog
    const rawLogsCollection = db.collection('attendancerawlogs');
    const rawLogs = await rawLogsCollection
      .find({ employeeId: '2146', timestamp: { $gte: new Date('2026-06-16'), $lt: new Date('2026-06-17') } })
      .toArray();
    
    console.log(`📋 AttendanceRawLog (June 16):`);
    console.log(`   Found: ${rawLogs.length} records`);
    if (rawLogs.length > 0) {
      rawLogs.forEach((log, idx) => {
        console.log(`   [${idx + 1}] ${log.logType} - ${log.timestamp} - ${log.deviceName}`);
      });
    }
    console.log();

    // Check AttendanceDaily with different date formats
    const dailyLogsCollection = db.collection('attendancedailies');
    
    // Try different date formats
    const dateFormats = [
      { date: new Date('2026-06-16') },
      { date: '2026-06-16' },
    ];

    for (const query of dateFormats) {
      const dailyLogs = await dailyLogsCollection
        .find({ employeeId: '2146', ...query })
        .toArray();
      
      console.log(`📋 AttendanceDaily (${JSON.stringify(query)}):`);
      console.log(`   Found: ${dailyLogs.length} records`);
      if (dailyLogs.length > 0) {
        dailyLogs.forEach((log, idx) => {
          console.log(`   [${idx + 1}] Status: ${log.status} - Hours: ${log.totalHours}`);
          if (log.shifts) {
            log.shifts.forEach(s => {
              console.log(`       - ${s.shiftName}: ${s.status} (${s.inTime} to ${s.outTime})`);
            });
          }
        });
      }
    }

    // Get all dates for employee 2146
    console.log('\n🔍 All attendance dates for employee 2146:');
    const allRecords = await dailyLogsCollection
      .find({ employeeId: '2146' })
      .project({ date: 1, status: 1, totalHours: 1 })
      .limit(20)
      .toArray();
    
    console.log(`   Total records: ${allRecords.length}`);
    allRecords.forEach(rec => {
      console.log(`   - ${rec.date} (${rec.status}, ${rec.totalHours}h)`);
    });

    await mongoose.disconnect();

  } catch (err) {
    console.error('Error:', err.message);
    process.exit(1);
  }
})();
