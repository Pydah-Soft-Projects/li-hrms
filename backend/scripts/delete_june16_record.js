const mongoose = require('mongoose');
const path = require('path');

require('dotenv').config({ path: path.join(__dirname, '../.env') });

const AttendanceDaily = require('../attendance/model/AttendanceDaily');

(async () => {
  try {
    const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/hrms-leave-5';
    await mongoose.connect(mongoUri);
    console.log('✅ Connected to MongoDB\n');

    // Delete existing record for June 16, 2026
    console.log('🗑️  Deleting existing AttendanceDaily record for employee 2146 on June 16...');
    const result = await AttendanceDaily.deleteOne({
      employeeId: '2146',
      date: new Date('2026-06-16')
    });

    console.log(`✅ Deleted ${result.deletedCount} record(s)\n`);

    await mongoose.disconnect();
    console.log('✅ Disconnected from MongoDB');

  } catch (err) {
    console.error('Error:', err.message);
    process.exit(1);
  }
})();
