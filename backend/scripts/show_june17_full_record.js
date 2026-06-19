const mongoose = require('mongoose');
const path = require('path');

require('dotenv').config({ path: path.join(__dirname, '../.env') });

(async () => {
  try {
    const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/hrms-leave-5';
    await mongoose.connect(mongoUri);
    console.log('✅ Connected to MongoDB\n');

    const AttendanceDaily = require('../attendance/model/AttendanceDaily');
    
    const record = await AttendanceDaily.findOne({
      employeeNumber: '2146',
      date: '2026-06-17'
    }).lean();

    if (!record) {
      console.log('❌ No record found');
      process.exit(0);
    }

    console.log('📊 COMPLETE RECORD FOR JUNE 17:\n');
    console.log('Status:', record.status);
    console.log('Payable Shifts:', record.payableShifts);
    console.log('Total Working Hours:', record.totalWorkingHours);
    
    if (record.shifts && record.shifts.length > 0) {
      console.log('\n📌 SHIFT DETAILS:');
      record.shifts.forEach((shift, idx) => {
        console.log(`\n  Shift ${idx + 1}:`);
        console.log(`    Status: ${shift.status}`);
        console.log(`    Payable: ${shift.payableShift}`);
        console.log(`    Working Hours: ${shift.workingHours}`);
        console.log(`    Expected Hours: ${shift.expectedHours}`);
        
        if (shift.shiftSegments && shift.shiftSegments.length > 0) {
          console.log(`    Segments:`);
          shift.shiftSegments.forEach(seg => {
            console.log(`      - ${seg.segmentName}: Present=${seg.present}, Payable=${seg.payableShifts}, Overlap=${seg.overlapMinutes}min`);
          });
        }
      });
    }

    await mongoose.disconnect();

  } catch (err) {
    console.error('Error:', err.message);
    process.exit(1);
  }
})();
