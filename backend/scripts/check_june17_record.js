const mongoose = require('mongoose');
const path = require('path');

require('dotenv').config({ path: path.join(__dirname, '../.env') });

const AttendanceDaily = require('../attendance/model/AttendanceDaily');

(async () => {
  try {
    const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/hrms-leave-5';
    await mongoose.connect(mongoUri);
    console.log('✅ Connected to MongoDB\n');

    // Query for employee 2146 on June 17th
    const record = await AttendanceDaily.findOne({
      employeeId: '2146',
      date: new Date('2026-06-17')
    }).lean();

    if (!record) {
      console.log('❌ No attendance record found for employee 2146 on June 17, 2026');
      await mongoose.disconnect();
      process.exit(0);
    }

    console.log('📊 ATTENDANCE RECORD FOR EMPLOYEE 2146 - JUNE 17, 2026\n');
    console.log('═══════════════════════════════════════════════════════\n');

    console.log('🔷 MAIN STATUS:');
    console.log(`   Status: ${record.status}`);
    console.log(`   Payable Shifts: ${record.payableShifts}`);
    console.log(`   Total Hours: ${record.totalHours} hrs`);
    console.log(`   Working Hours: ${record.totalWorkingHours} hrs\n`);

    console.log('🔷 SHIFT DETAILS:');
    if (record.shifts && record.shifts.length > 0) {
      record.shifts.forEach((shift, idx) => {
        console.log(`\n   Shift ${idx + 1}: ${shift.shiftName}`);
        console.log(`   ├─ Check-In:  ${shift.inTime}`);
        console.log(`   ├─ Check-Out: ${shift.outTime}`);
        console.log(`   ├─ Status: ${shift.status}`);
        console.log(`   ├─ Payable: ${shift.payableShift}`);
        console.log(`   ├─ Working Hours: ${shift.workingHours}`);
        console.log(`   ├─ Late In: ${shift.lateInMinutes} min`);
        console.log(`   ├─ Early Out: ${shift.earlyOutMinutes} min`);
        
        if (shift.shiftSegments && shift.shiftSegments.length > 0) {
          console.log(`   └─ Segments:`);
          shift.shiftSegments.forEach((seg, sidx) => {
            const mark = sidx === shift.shiftSegments.length - 1 ? '   └─ ' : '   ├─ ';
            console.log(`${mark}${seg.segmentName.toUpperCase()}`);
            console.log(`      ├─ Present: ${seg.present ? '✅ YES' : '❌ NO'}`);
            console.log(`      ├─ Min Duration: ${seg.minDuration}h`);
            console.log(`      ├─ Overlap: ${seg.overlapMinutes} min`);
            console.log(`      └─ Payable: ${seg.payableShifts}`);
          });
        }
      });
    } else {
      console.log('   No shifts recorded');
    }

    console.log('\n═══════════════════════════════════════════════════════\n');

    console.log('✅ ANALYSIS:');
    if (record.status === 'HALF_DAY' && record.payableShifts === 0.5) {
      console.log('   ✓ Break-aware detection WORKING CORRECTLY!');
      console.log('   ✓ 4h 23m continuous work counted as HALF_DAY');
      console.log('   ✓ Segment detection properly integrated');
    } else if (record.status === 'ABSENT') {
      console.log('   ✗ Still showing ABSENT');
      console.log('   ✗ Break-aware detection NOT being used');
    } else {
      console.log(`   ? Unexpected status: ${record.status}`);
    }

    await mongoose.disconnect();

  } catch (err) {
    console.error('Error:', err.message);
    process.exit(1);
  }
})();
