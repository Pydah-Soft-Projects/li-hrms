const mongoose = require('mongoose');
const path = require('path');

require('dotenv').config({ path: path.join(__dirname, '../.env') });

(async () => {
  try {
    const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/hrms-leave-5';
    await mongoose.connect(mongoUri);
    console.log('✅ Connected to MongoDB\n');

    const AttendanceDaily = require('../attendance/model/AttendanceDaily');
    
    // Fetch June 2026 data for employee 2146 - same date range as the API request
    const records = await AttendanceDaily.find({
      employeeNumber: '2146',
      date: {
        $gte: '2026-05-26',
        $lte: '2026-06-25'
      }
    }).lean().sort({ date: 1 });

    console.log(`📊 Total Records for Employee 2146 (May 26 - Jun 25): ${records.length}\n`);

    if (records.length === 0) {
      console.log('❌ No records found');
      await mongoose.disconnect();
      process.exit(0);
    }

    // Check June 15, 16, 17
    const targetDates = ['2026-06-15', '2026-06-16', '2026-06-17'];
    
    console.log('═══════════════════════════════════════════════════════════');
    console.log('✅ FRONTEND DISPLAY DATA VERIFICATION');
    console.log('═══════════════════════════════════════════════════════════\n');

    let allReady = true;

    targetDates.forEach(date => {
      const record = records.find(r => r.date === date);
      
      if (!record) {
        console.log(`❌ ${date}: NO RECORD FOUND`);
        allReady = false;
        return;
      }

      console.log(`📅 ${date}`);
      console.log(`   Status: ${record.status}`);
      console.log(`   Payable Shifts: ${record.payableShifts}`);
      console.log(`   Working Hours: ${record.totalHours || record.totalWorkingHours}`);
      
      // Check if shifts array exists
      if (!record.shifts || !record.shifts.length) {
        console.log(`   ❌ NO SHIFTS ARRAY - Frontend cannot display!`);
        allReady = false;
        console.log('');
        return;
      }

      const shift = record.shifts[0];
      console.log(`   ✅ Shift Present: Status=${shift.status}, Payable=${shift.payableShift}`);

      // Check if segments exist (CRITICAL FOR FRONTEND DISPLAY FIX)
      if (!shift.shiftSegments || !shift.shiftSegments.length) {
        console.log(`   ❌ NO SEGMENTS - Frontend display will use old heuristic!`);
        allReady = false;
      } else {
        console.log(`   ✅ Segments Present:`);
        shift.shiftSegments.forEach((seg, idx) => {
          console.log(`      [${idx+1}] ${seg.segmentName} (${seg.startTime}-${seg.endTime})`);
          console.log(`          Present: ${seg.present ? '✅ YES' : '❌ NO'}`);
          console.log(`          Payable: ${seg.payableShifts}`);
        });
      }

      console.log('');
    });

    console.log('═══════════════════════════════════════════════════════════');
    console.log('📋 FRONTEND DISPLAY READINESS\n');

    if (allReady) {
      console.log('✅ ALL DATA READY - Frontend will display FIRST HALF correctly!');
      console.log('   Reason: Using new shiftSegments-based logic');
    } else {
      console.log('⚠️  SOME DATA MISSING - Frontend may have issues');
    }

    console.log('\n✅ Summary for Frontend:');
    targetDates.forEach(date => {
      const record = records.find(r => r.date === date);
      if (record && record.shifts && record.shifts[0]) {
        const shift = record.shifts[0];
        if (shift.shiftSegments && shift.shiftSegments.length >= 2) {
          const firstHalf = shift.shiftSegments[0];
          const secondHalf = shift.shiftSegments[1];
          const displayText = firstHalf.present ? 'HD/A' : 'A/HD';
          console.log(`   ${date}: Will display as "${displayText}" ✅`);
        }
      }
    });

    await mongoose.disconnect();

  } catch (err) {
    console.error('Error:', err.message);
    process.exit(1);
  }
})();
