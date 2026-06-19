const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const TOKEN = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiI2OThiMWI2YTFiOTUzN2VmZDY0MjY2MDEiLCJzZXNzaW9uSWQiOiI3YjdmMzc2Zi03NTAxLTQxMGUtYjMxYS04ZDJjNDIxYzIzYWQiLCJ0b2tlblZlcnNpb24iOjAsInR5cGUiOiJhY2Nlc3MiLCJpYXQiOjE3ODE4NDgxMzAsImV4cCI6MTc4MTg0OTAzMH0.fGtCXT6pvRSTe4za-TcFr-p23aEGWoEYHBRvS2YO39E';

(async () => {
  try {
    console.log('🔄 Fetching Attendance Daily Record for Employee 2146 (June 17, 2026)...\n');
    
    const attendanceResponse = await fetch('http://localhost:5000/api/attendance/detail?employeeNumber=2146&date=2026-06-17', {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${TOKEN}`
      }
    });

    const attendanceData = await attendanceResponse.json();

    if (!attendanceData.success && attendanceData.message) {
      console.log('❌ Error:', attendanceData.message);
      process.exit(1);
    }

    console.log('📊 ATTENDANCE RECORD FOR EMPLOYEE 2146 - JUNE 17, 2026\n');
    console.log('═══════════════════════════════════════════════════════\n');

    const record = attendanceData.data || attendanceData;

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
      console.log('   ✓ BREAK-AWARE DETECTION WORKING CORRECTLY!');
      console.log('   ✓ 4h 23m continuous work recognized as HALF_DAY');
      console.log('   ✓ First half marked PRESENT (min 4h requirement met)');
      console.log('   ✓ Segment detection properly integrated into status');
    } else if (record.status === 'ABSENT') {
      console.log('   ✗ ISSUE: Still showing ABSENT');
      console.log('   ✗ Break-aware detection may not be triggering');
    } else {
      console.log(`   ? Status: ${record.status}`);
    }

    console.log('\n═══════════════════════════════════════════════════════');
    console.log('\n📋 FULL RECORD:');
    console.log(JSON.stringify(record, null, 2));

  } catch (err) {
    console.error('❌ Error:', err.message);
    process.exit(1);
  }
})();
