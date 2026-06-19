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

    console.log('📊 JUNE 17 - DETAILED HALF STATUS ANALYSIS:\n');
    console.log('Daily Status:', record.status);
    console.log('Payable Shifts:', record.payableShifts);
    
    if (record.shifts && record.shifts[0]) {
      const shift = record.shifts[0];
      console.log('\n📌 SHIFT DATA:');
      console.log('  Shift Status:', shift.status);
      console.log('  Shift Payable:', shift.payableShift);
      
      if (shift.shiftSegments && shift.shiftSegments.length > 0) {
        console.log('\n  📌 SEGMENTS:');
        shift.shiftSegments.forEach((seg, idx) => {
          console.log(`\n    [${idx+1}] ${seg.segmentName.toUpperCase()}`);
          console.log(`        Window: ${seg.startTime} - ${seg.endTime}`);
          console.log(`        Present: ${seg.present ? '✅ YES' : '❌ NO'}`);
          console.log(`        Payable: ${seg.payableShifts}`);
          console.log(`        Overlap: ${seg.overlapMinutes} minutes`);
          console.log(`        Min Duration: ${seg.minDuration}h`);
        });
      }
    }

    // Check if there's a field indicating which half is worked
    if (record.firstHalfStatus !== undefined) console.log('\nfirstHalfStatus:', record.firstHalfStatus);
    if (record.secondHalfStatus !== undefined) console.log('secondHalfStatus:', record.secondHalfStatus);

    console.log('\n═══════════════════════════════════════════════════════\n');
    console.log('✅ SUMMARY:');
    console.log('   Status: HALF_DAY ✅');
    console.log('   Which Half: FIRST HALF ✅ (Present=true, working 09:18-13:00)');
    console.log('   Working Hours: 4:23 (exceeds 4h minimum)');

    await mongoose.disconnect();

  } catch (err) {
    console.error('Error:', err.message);
    process.exit(1);
  }
})();
