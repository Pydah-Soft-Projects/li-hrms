const mongoose = require('mongoose');
const path = require('path');

require('dotenv').config({ path: path.join(__dirname, '../.env') });

(async () => {
  try {
    const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/hrms-leave-5';
    await mongoose.connect(mongoUri);
    console.log('✅ Connected to MongoDB\n');

    const AttendanceDaily = require('../attendance/model/AttendanceDaily');
    
    for (let date = 15; date <= 17; date++) {
      const dateStr = `2026-06-${date}`;
      const record = await AttendanceDaily.findOne({
        employeeNumber: '2146',
        date: dateStr
      }).lean();

      if (record) {
        console.log(`📋 JUNE ${date}, 2026:`);
        console.log(`   Status: ${record.status}`);
        console.log(`   Payable: ${record.payableShifts}`);
        console.log(`   Working Hours: ${record.totalWorkingHours}`);
        
        if (record.shifts && record.shifts[0]) {
          const shift = record.shifts[0];
          if (shift.shiftSegments) {
            const firstHalf = shift.shiftSegments.find(s => s.segmentName === 'firstHalf');
            if (firstHalf) {
              console.log(`   First Half: Present=${firstHalf.present}, Payable=${firstHalf.payableShifts}`);
            }
          }
        }
        console.log();
      }
    }

    await mongoose.disconnect();

  } catch (err) {
    console.error('Error:', err.message);
    process.exit(1);
  }
})();
