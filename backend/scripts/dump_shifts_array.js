const mongoose = require('mongoose');
const path = require('path');

require('dotenv').config({ path: path.join(__dirname, '../.env') });

(async () => {
  try {
    const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/hrms-leave-5';
    await mongoose.connect(mongoUri);
    console.log('✅ Connected to MongoDB\n');

    const AttendanceDaily = require('../attendance/model/AttendanceDaily');
    
    const dates = ['2026-06-15', '2026-06-16', '2026-06-17'];
    
    for (const dateStr of dates) {
      const record = await AttendanceDaily.findOne({
        employeeNumber: '2146',
        date: dateStr
      }).lean();

      if (!record || !record.shifts || !record.shifts[0]) continue;

      const shift = record.shifts[0];
      
      console.log(`\n${'═'.repeat(60)}`);
      console.log(`📅 ${dateStr} - FULL SHIFTS[0] SEGMENT DATA`);
      console.log(`${'═'.repeat(60)}`);
      console.log(`Shift Status: ${shift.status}`);
      console.log(`Shift Payable: ${shift.payableShift}`);
      
      if (shift.shiftSegments && shift.shiftSegments.length > 0) {
        console.log(`\n📌 SEGMENTS IN SHIFTS[0]:`);
        shift.shiftSegments.forEach((seg, idx) => {
          console.log(`\n  [${idx+1}] ${seg.segmentName.toUpperCase()}`);
          console.log(`      Start: ${seg.startTime}`);
          console.log(`      End:   ${seg.endTime}`);
          console.log(`      Present: ${seg.present}`);
          console.log(`      Payable: ${seg.payableShifts}`);
          console.log(`      Duration: ${seg.duration}`);
          console.log(`      Min Duration: ${seg.minDuration}`);
          console.log(`      Overlap Minutes: ${seg.overlapMinutes}`);
          console.log(`      Late In: ${seg.lateInMinutes}`);
          console.log(`      Early Out: ${seg.earlyOutMinutes}`);
        });
      } else {
        console.log(`❌ NO SEGMENTS in shifts[0]`);
      }
    }

    console.log(`\n${'═'.repeat(60)}`);
    console.log(`✅ ANALYSIS:`);
    console.log(`   If 2nd half showing on frontend:`);
    console.log(`   → Check if shiftSegments data is being filtered`);
    console.log(`   → Check if display logic is reading correct segment index`);
    console.log(`   → Check if "present" field is being inverted somewhere`);

    await mongoose.disconnect();

  } catch (err) {
    console.error('Error:', err.message);
    process.exit(1);
  }
})();
