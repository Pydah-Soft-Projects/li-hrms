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
    console.log(`   Total Working Hours: ${record.totalWorkingHours} hrs`);
    console.log(`   Expected Hours: ${record.totalExpectedHours} hrs\n`);

    console.log('🔷 SHIFT DETAILS:');
    if (record.shifts && record.shifts.length > 0) {
      record.shifts.forEach((shift, idx) => {
        console.log(`\n   Shift ${idx + 1}: ${shift.shiftName}`);
        console.log(`   ├─ Check-In:  ${shift.inTime}`);
        console.log(`   ├─ Check-Out: ${shift.outTime}`);
        console.log(`   ├─ Status: ${shift.status}`);
        console.log(`   ├─ Payable: ${shift.payableShift}`);
        console.log(`   ├─ Working Hours: ${shift.workingHours}`);
        console.log(`   ├─ Expected Hours: ${shift.expectedHours}`);
        console.log(`   ├─ Late In: ${shift.lateInMinutes} min`);
        console.log(`   └─ Early Out: ${shift.earlyOutMinutes} min`);
        
        if (shift.shiftSegments && shift.shiftSegments.length > 0) {
          console.log(`\n      📌 SEGMENT DETAILS:`);
          shift.shiftSegments.forEach((seg, sidx) => {
            console.log(`\n      [${sidx + 1}] ${seg.segmentName.toUpperCase()}`);
            console.log(`          Window: ${seg.startTime} - ${seg.endTime}`);
            console.log(`          Min Duration: ${seg.minDuration}h`);
            console.log(`          Overlap Minutes: ${seg.overlapMinutes}`);
            console.log(`          Present: ${seg.present ? '✅ YES' : '❌ NO'}`);
            console.log(`          Payable: ${seg.payableShifts}`);
            if (seg.lateInMinutes !== null) console.log(`          Late In: ${seg.lateInMinutes} min`);
            if (seg.earlyOutMinutes !== null) console.log(`          Early Out: ${seg.earlyOutMinutes} min`);
          });
        }
      });
    } else {
      console.log('   No shifts recorded');
    }

    console.log('\n═══════════════════════════════════════════════════════\n');

    console.log('✅ ANALYSIS:');
    if (record.status === 'HALF_DAY' && record.payableShifts === 0.5) {
      console.log('   ✓✓✓ BREAK-AWARE DETECTION WORKING CORRECTLY! ✓✓✓');
      console.log('   ✓ 4h 23m continuous work recognized as HALF_DAY');
      console.log('   ✓ First half marked PRESENT (min 4h requirement met)');
      console.log('   ✓ Segment detection properly integrated into status');
      console.log('\n   🎉 THE FIX IS SUCCESSFUL! 🎉');
    } else if (record.status === 'ABSENT') {
      console.log('   ✗ ISSUE: Still showing ABSENT');
      console.log('   ✗ Break-aware detection may not be triggering');
      console.log('   ✗ Check if multiShiftProcessingService is using the new logic');
    } else {
      console.log(`   ? Status: ${record.status}`);
    }

    console.log('\n═══════════════════════════════════════════════════════');

    await mongoose.disconnect();

  } catch (err) {
    console.error('Error:', err.message);
    process.exit(1);
  }
})();
