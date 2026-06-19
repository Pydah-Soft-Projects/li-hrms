const mongoose = require('mongoose');
const path = require('path');

require('dotenv').config({ path: path.join(__dirname, '../.env') });

(async () => {
  try {
    const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/hrms-leave-5';
    await mongoose.connect(mongoUri);
    console.log('✅ Connected to MongoDB\n');

    const db = mongoose.connection.db;

    // Check for raw logs on June 17
    const rawLogsCollection = db.collection('attendancerawlogs');
    const rawLogs = await rawLogsCollection
      .find({ 
        employeeId: '2146', 
        timestamp: { 
          $gte: new Date('2026-06-17T00:00:00Z'), 
          $lt: new Date('2026-06-17T23:59:59Z') 
        } 
      })
      .toArray();
    
    console.log('📋 RAW LOGS (June 17):');
    console.log(`   Found: ${rawLogs.length} records\n`);
    
    if (rawLogs.length > 0) {
      rawLogs.forEach((log, idx) => {
        console.log(`   [${idx + 1}] ${log.logType}`);
        console.log(`       Timestamp: ${log.timestamp}`);
        console.log(`       Device: ${log.deviceName}`);
        console.log(`       Status: ${log.processed ? '✅ Processed' : '❌ Not Processed'}`);
      });
    }

    // Check all collection names
    console.log('\n📊 Database Collections:');
    const collections = await db.listCollections().toArray();
    const attendanceCollections = collections.filter(c => c.name.includes('attendance'));
    console.log(`   Attendance-related collections: ${attendanceCollections.length}`);
    attendanceCollections.forEach(c => {
      console.log(`   - ${c.name}`);
    });

    await mongoose.disconnect();

  } catch (err) {
    console.error('Error:', err.message);
    process.exit(1);
  }
})();
