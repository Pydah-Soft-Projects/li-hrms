require('dotenv').config({ path: '.env' });
const mongoose = require('mongoose');

(async () => {
  try {
    await mongoose.connect('mongodb://localhost:27017/hrms-leave-5');
    
    console.log('🧹 Cleaning up existing logs for Employee 2146 (June 11-12)...\n');
    
    const rawLogDel = await mongoose.connection.collection('attendancerawlogs').deleteMany({
      employeeNumber: '2146',
      date: { $in: ['2026-06-11', '2026-06-12'] }
    });
    console.log(`✅ Deleted ${rawLogDel.deletedCount} raw log records`);
    
    const dailyDel = await mongoose.connection.collection('attendancedailies').deleteMany({
      employeeNumber: '2146',
      date: { $in: ['2026-06-11', '2026-06-12'] }
    });
    console.log(`✅ Deleted ${dailyDel.deletedCount} daily attendance records`);
    
    console.log('\n✨ Ready for new punches at 10:05 IN / 14:10 OUT\n');
    
    await mongoose.disconnect();
    process.exit(0);
  } catch (err) {
    console.error('❌ Error:', err.message);
    process.exit(1);
  }
})();
