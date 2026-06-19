const mongoose = require('mongoose');
const path = require('path');

require('dotenv').config({ path: path.join(__dirname, '../.env') });

const AttendanceDaily = require('../attendance/model/AttendanceDaily');

(async () => {
  try {
    const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/hrms-leave-5';
    await mongoose.connect(mongoUri);
    console.log('✅ Connected to MongoDB\n');

    // Query for employee 2146 on June 16th
    const record = await AttendanceDaily.findOne({
      employeeId: '2146',
      date: new Date('2026-06-16')
    }).lean();

    if (!record) {
      console.log('❌ No attendance record found for employee 2146 on June 16, 2026');
      process.exit(1);
    }

    console.log('📊 Attendance Daily Record for Employee 2146 (June 16, 2026):\n');
    console.log('Basic Info:');
    console.log(`  Employee ID: ${record.employeeId}`);
    console.log(`  Date: ${record.date}`);
    console.log(`  Status: ${record.status}`);
    console.log(`  Total Hours: ${record.totalHours}`);
    console.log(`  OT Hours: ${record.otHours}\n`);

    console.log('Shift Details:');
    if (record.shifts && record.shifts.length > 0) {
      record.shifts.forEach((shift, idx) => {
        console.log(`\n  Shift ${idx + 1}:`);
        console.log(`    Shift ID: ${shift.shiftId}`);
        console.log(`    Shift Name: ${shift.shiftName}`);
        console.log(`    IN: ${shift.inTime}`);
        console.log(`    OUT: ${shift.outTime}`);
        console.log(`    Status: ${shift.status}`);
        console.log(`    Payable: ${shift.payableShift}`);
        console.log(`    Working Hours: ${shift.workingHours}`);
        console.log(`    Expected Hours: ${shift.expectedHours}`);
        console.log(`    Late In: ${shift.lateInMinutes} min`);
        console.log(`    Early Out: ${shift.earlyOutMinutes} min`);
        
        if (shift.shiftSegments && shift.shiftSegments.length > 0) {
          console.log(`    Segments:`);
          shift.shiftSegments.forEach((seg, sidx) => {
            console.log(`      ${sidx + 1}. ${seg.segmentName}`);
            console.log(`         Present: ${seg.present}`);
            console.log(`         Payable: ${seg.payableShifts}`);
          });
        }
      });
    }

    console.log('\n📋 Full Record:');
    console.log(JSON.stringify(record, null, 2));

    await mongoose.disconnect();

  } catch (err) {
    console.error('Error:', err.message);
    process.exit(1);
  }
})();
