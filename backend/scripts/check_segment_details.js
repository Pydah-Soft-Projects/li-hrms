const mongoose = require('mongoose');
const path = require('path');

require('dotenv').config({ path: path.join(__dirname, '../.env') });

(async () => {
  try {
    const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/hrms-leave-5';
    await mongoose.connect(mongoUri);
    console.log('✅ Connected to MongoDB\n');

    const AttendanceDaily = require('../attendance/model/AttendanceDaily');
    
    // Check all three days
    const dates = ['2026-06-15', '2026-06-16', '2026-06-17'];
    
    for (const dateStr of dates) {
      const record = await AttendanceDaily.findOne({
        employeeNumber: '2146',
        date: dateStr
      }).lean();

      if (!record) {
        console.log(`❌ No record found for ${dateStr}`);
        continue;
      }

      console.log(`\n═══════════════════════════════════════════════`);
      console.log(`📅 ${dateStr}`);
      console.log(`═══════════════════════════════════════════════`);
      console.log(`Daily Status: ${record.status}`);
      console.log(`Payable Shifts: ${record.payableShifts}`);
      
      if (record.shifts && record.shifts[0]) {
        const shift = record.shifts[0];
        console.log(`\n  Shift Status: ${shift.status}`);
        console.log(`  Shift Payable: ${shift.payableShift}`);
        console.log(`  In Time: ${shift.inTime}`);
        console.log(`  Out Time: ${shift.outTime}`);
        
        if (shift.shiftSegments && shift.shiftSegments.length > 0) {
          console.log(`\n  📌 SEGMENTS:`);
          shift.shiftSegments.forEach((seg, idx) => {
            console.log(`\n    [${idx+1}] ${seg.segmentName.toUpperCase()}`);
            console.log(`        Window: ${seg.startTime} - ${seg.endTime}`);
            console.log(`        Present: ${seg.present ? '✅ YES' : '❌ NO'}`);
            console.log(`        Payable: ${seg.payableShifts}`);
            console.log(`        Overlap: ${seg.overlapMinutes} minutes`);
          });
        }
      }
    }

    console.log(`\n═══════════════════════════════════════════════`);
    console.log(`\n❓ ISSUE ANALYSIS:`);
    console.log(`   Employee works: 09:18 - 13:41 (4h 23m)`);
    console.log(`   This is WITHIN first half (09:00-13:00) + break overlap`);
    console.log(`   Should mark: FIRST HALF present ✅`);
    console.log(`   But marking: SECOND HALF present ❌`);
    console.log(`\n   Root cause: Check segment calculation logic`);

    await mongoose.disconnect();

  } catch (err) {
    console.error('Error:', err.message);
    process.exit(1);
  }
})();
