const mongoose = require('mongoose');
const path = require('path');

// Load environment variables
require('dotenv').config({ path: path.join(__dirname, '../.env') });

// Import AttendanceRawLog model
const AttendanceRawLog = require('../attendance/model/AttendanceRawLog');

(async () => {
  try {
    // Connect to MongoDB
    const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/hrms-leave-5';
    console.log('🔄 Connecting to MongoDB...');
    await mongoose.connect(mongoUri);
    console.log('✅ Connected to MongoDB');

    // Check raw logs for employee 2146 on June 13th
    console.log('\n🔄 Checking AttendanceRawLog for employee 2146...');
    
    const rawLogs = await AttendanceRawLog.find({
      employeeId: '2146',
      timestamp: {
        $gte: new Date('2026-06-13T00:00:00Z'),
        $lt: new Date('2026-06-14T00:00:00Z')
      }
    }).lean();

    console.log(`\n📊 Found ${rawLogs.length} raw logs:`);
    if (rawLogs.length > 0) {
      console.log(JSON.stringify(rawLogs, null, 2));
    } else {
      console.log('❌ No raw logs found');
    }

    // Also check for any logs with employeeId 2146
    console.log('\n🔄 Checking all logs for employee 2146...');
    const allLogs = await AttendanceRawLog.find({
      employeeId: '2146'
    }).sort({ timestamp: -1 }).limit(5).lean();

    console.log(`\n📊 Latest 5 logs for employee 2146:`);
    console.log(JSON.stringify(allLogs, null, 2));

    await mongoose.disconnect();
    console.log('\n✅ MongoDB disconnected');

  } catch (err) {
    console.error('❌ Error:', err.message);
    process.exit(1);
  }
})();
