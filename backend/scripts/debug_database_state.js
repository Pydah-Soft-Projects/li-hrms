const mongoose = require('mongoose');
const path = require('path');

require('dotenv').config({ path: path.join(__dirname, '../.env') });

(async () => {
  try {
    const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/hrms-leave-5';
    await mongoose.connect(mongoUri);
    console.log('✅ Connected to MongoDB\n');

    const db = mongoose.connection.db;

    // Check AttendanceRawLog for June 17
    console.log('📋 CHECKING RAW LOGS FOR JUNE 17:\n');
    const rawLogsCollection = db.collection('attendancerawlogs');
    const rawLogs = await rawLogsCollection
      .find({ 
        employeeNumber: '2146', 
        date: '2026-06-17'
      })
      .toArray();
    
    console.log(`   Found ${rawLogs.length} raw logs`);
    if (rawLogs.length > 0) {
      rawLogs.forEach((log, idx) => {
        console.log(`   [${idx + 1}] ${log.type} - ${log.timestamp} - ${log.source}`);
      });
    } else {
      console.log('   ❌ NO RAW LOGS FOUND');
    }

    // Check AttendanceDaily
    console.log('\n📋 CHECKING ATTENDANCE DAILY FOR JUNE 17:\n');
    const dailyCollection = db.collection('attendancedailies');
    const dailyRecords = await dailyCollection
      .find({ 
        employeeNumber: '2146', 
        date: '2026-06-17'
      })
      .toArray();
    
    console.log(`   Found ${dailyRecords.length} daily records`);
    if (dailyRecords.length > 0) {
      dailyRecords.forEach((rec, idx) => {
        console.log(`   [${idx + 1}] Status: ${rec.status}, Payable: ${rec.payableShifts}`);
        console.log(`       Updated: ${rec.updatedAt}`);
      });
    } else {
      console.log('   ❌ NO DAILY RECORDS FOUND');
    }

    // Check all recent raw logs (last 10)
    console.log('\n📋 LAST 10 RAW LOGS IN DATABASE:\n');
    const allRawLogs = await rawLogsCollection
      .find({})
      .sort({ createdAt: -1 })
      .limit(10)
      .toArray();
    
    allRawLogs.forEach((log, idx) => {
      console.log(`   [${idx + 1}] Emp: ${log.employeeNumber}, Date: ${log.date}, Type: ${log.type}, Time: ${log.createdAt}`);
    });

    // Check all recent daily records (last 5)
    console.log('\n📋 LAST 5 ATTENDANCE DAILY RECORDS:\n');
    const allDailyRecords = await dailyCollection
      .find({})
      .sort({ updatedAt: -1 })
      .limit(5)
      .toArray();
    
    allDailyRecords.forEach((rec, idx) => {
      console.log(`   [${idx + 1}] Emp: ${rec.employeeNumber}, Date: ${rec.date}, Status: ${rec.status}, Updated: ${rec.updatedAt}`);
    });

    await mongoose.disconnect();

  } catch (err) {
    console.error('Error:', err.message);
    process.exit(1);
  }
})();
