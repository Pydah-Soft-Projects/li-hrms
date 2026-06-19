const mongoose = require('mongoose');
const path = require('path');

// Load environment variables
require('dotenv').config({ path: path.join(__dirname, '../.env') });

// Import AttendanceDaily model
const AttendanceDaily = require('../attendance/model/AttendanceDaily');

(async () => {
  try {
    // Connect to MongoDB
    const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/hrms-leave-5';
    console.log('🔄 Connecting to MongoDB...');
    await mongoose.connect(mongoUri);
    console.log('✅ Connected to MongoDB');

    // Query attendance daily for employee 2146 on June 13th, 2026
    console.log('\n🔄 Querying attendance daily for Employee 2146 on June 15th, 2026...');
    
    const attendanceRecord = await AttendanceDaily.findOne({
      employeeNumber: '2146',
      date: new Date('2026-06-15')
    }).lean();

    console.log('\n📊 Attendance Daily Record Found:');
    if (attendanceRecord) {
      console.log(JSON.stringify(attendanceRecord, null, 2));
    } else {
      console.log('❌ No attendance record found for this employee on this date');
    }

    await mongoose.disconnect();
    console.log('\n✅ MongoDB disconnected');

  } catch (err) {
    console.error('❌ Error:', err.message);
    process.exit(1);
  }
})();
