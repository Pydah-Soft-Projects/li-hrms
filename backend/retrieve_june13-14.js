const mongoose = require('mongoose');
const AttendanceDaily = require('./attendance/model/AttendanceDaily');

(async () => {
  try {
    await mongoose.connect('mongodb://localhost:27017/hrms-leave-5');
    
    console.log('=== EMPLOYEE 2146 - JUNE 13-14 PROCESSED RECORDS ===\n');
    console.log('IN Punch: 10:15 IST | OUT Punch: 14:30 IST (4h 15m worked)\n');
    console.log('TEST: First half receives overflow from second half\n');
    
    const records = await AttendanceDaily.find({
      employeeNumber: '2146',
      date: { $in: ['2026-06-13', '2026-06-14'] }
    }).lean();
    
    records.forEach(rec => {
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.log(`📅 DATE: ${rec.date}`);
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
      
      console.log(`⏱️  OVERALL STATUS:`);
      console.log(`   Status: ${rec.status}`);
      console.log(`   Working Hours: ${rec.totalWorkingHours}h`);
      console.log(`   Payable Shifts: ${rec.payableShifts}`);
      
      if (rec.shifts && rec.shifts.length > 0) {
        const shift = rec.shifts[0];
        console.log(`\n📍 SHIFT TIMING:`);
        const inTime = shift.inTime ? new Date(shift.inTime).toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata' }) : 'N/A';
        const outTime = shift.outTime ? new Date(shift.outTime).toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata' }) : 'N/A';
        console.log(`   In: ${inTime}`);
        console.log(`   Out: ${outTime}`);
        console.log(`   Total: 4h 15m`);
        
        if (shift.shiftSegments && shift.shiftSegments.length >= 2) {
          const first = shift.shiftSegments[0];
          const second = shift.shiftSegments[1];
          
          console.log(`\n📊 SHIFT SEGMENT ANALYSIS:`);
          console.log(`\n   FIRST HALF:`);
          console.log(`     Schedule: ${first.startTime} - ${first.endTime} (3h)`);
          console.log(`     Required: ${first.minDuration}h`);
          console.log(`     Raw Overlap: ${first.overlapMinutes}m`);
          console.log(`     Status: ${first.present ? '✅ PRESENT' : '❌ ABSENT'}`);
          console.log(`     Payable: ${first.payableShifts}`);
          
          console.log(`\n   BREAK TIME:`);
          console.log(`     From: 13:00 To: 13:30 (30m)`);
          
          console.log(`\n   SECOND HALF:`);
          console.log(`     Schedule: ${second.startTime} - ${second.endTime} (7.5h)`);
          console.log(`     Required: ${second.minDuration}h`);
          console.log(`     Raw Overlap: ${second.overlapMinutes}m`);
          console.log(`     Status: ${second.present ? '✅ PRESENT' : '❌ ABSENT'}`);
          console.log(`     Payable: ${second.payableShifts}`);
          
          console.log(`\n🔍 CONTINUOUS WORK ANALYSIS:`);
          console.log(`   Total worked: 10:15 - 14:30 = 4h 15m`);
          console.log(`\n   Breakdown:`);
          console.log(`   ├─ First Half (10:15-13:00): 2h 45m`);
          console.log(`   ├─ Break (13:00-13:30): 30m (continuous, credits)`);
          console.log(`   └─ Second Half (13:30-14:30): 1h`);
          
          console.log(`\n💡 FIRST HALF SMART CREDIT:`);
          console.log(`   First Half: 2h 45m`);
          console.log(`   + Break: 30m (continuous work)`);
          console.log(`   + Overflow from Second: 30m (to reach 3h 45m minimum)`);
          console.log(`   = Total for First: 3h 45m ✅ EXACTLY MEETS MINIMUM!`);
          
          console.log(`\n📌 EXPECTED RESULT:`);
          console.log(`   First Half: ✅ PRESENT (uses overflow intelligently)`);
          console.log(`   Second Half: ❌ ABSENT (only 1h, needs 7h 10m)`);
          console.log(`   Status: HALF_DAY | Payable: 0.5`);
        }
      }
      console.log('\n');
    });
    
    await mongoose.disconnect();
    process.exit(0);
  } catch (err) {
    console.error(err.message);
    process.exit(1);
  }
})();
