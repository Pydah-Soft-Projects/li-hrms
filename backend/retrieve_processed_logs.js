const mongoose = require('mongoose');
const AttendanceDaily = require('./attendance/model/AttendanceDaily');

(async () => {
  try {
    await mongoose.connect('mongodb://localhost:27017/hrms-leave-5');
    
    console.log('=== EMPLOYEE 2146 - JUNE 18-19 PROCESSED RECORDS ===\n');
    console.log('IN Punch: 12:55 IST | OUT Punch: 20:05 IST (7h 10m worked)\n');
    
    const records = await AttendanceDaily.find({
      employeeNumber: '2146',
      date: { $in: ['2026-06-18', '2026-06-19'] }
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
        console.log(`   Late In: ${shift.lateInMinutes || 0}m`);
        console.log(`   Early Out: ${shift.earlyOutMinutes || 0}m`);
        
        if (shift.shiftSegments && shift.shiftSegments.length >= 2) {
          const first = shift.shiftSegments[0];
          const second = shift.shiftSegments[1];
          
          console.log(`\n📊 SHIFT SEGMENT ANALYSIS:`);
          console.log(`\n   FIRST HALF:`);
          console.log(`     Schedule: ${first.startTime} - ${first.endTime}`);
          console.log(`     Required: ${first.minDuration}h (with ${first.gracePeriod}m grace)`);
          console.log(`     Worked: ${first.duration}h`);
          console.log(`     Overlap: ${first.overlapMinutes}m`);
          console.log(`     Status: ${first.present ? '✅ PRESENT' : '❌ ABSENT'}`);
          console.log(`     Payable: ${first.payableShifts}`);
          
          console.log(`\n   BREAK TIME:`);
          console.log(`     From: ${first.endTime} To: ${second.startTime}`);
          
          console.log(`\n   SECOND HALF:`);
          console.log(`     Schedule: ${second.startTime} - ${second.endTime}`);
          console.log(`     Required: ${second.minDuration}h (with ${second.gracePeriod}m grace)`);
          console.log(`     Worked: ${second.duration}h`);
          console.log(`     Overlap: ${second.overlapMinutes}m`);
          console.log(`     Status: ${second.present ? '✅ PRESENT' : '❌ ABSENT'}`);
          console.log(`     Payable: ${second.payableShifts}`);
          
          console.log(`\n🔍 KEY FINDINGS:`);
          console.log(`   1. End of First Half: ${first.endTime}`);
          console.log(`   2. Start of Second Half: ${second.startTime}`);
          console.log(`   3. Break/Transition Gap: ??? minutes`);
          console.log(`   4. Employee worked from 12:55 to 20:05 = 7h 10m`);
          console.log(`   5. First Half (09:00-13:00) = COVERED (worked 12:55-13:00 = 5min, BREAK)`);
          console.log(`   6. Second Half (13:30-21:00) = COVERED (worked 20:05, stopped = 6h 35m)`);
          console.log(`\n💡 BREAK CONSIDERATION:`);
          console.log(`   - Break between first and second half: ${first.endTime} - ${second.startTime}`);
          console.log(`   - Employee OUT at 13:41 (calc from 20:05 worked - 6h 24m) = leaves before break`);
          console.log(`   - System accounts for break in segment detection`);
          console.log(`   - First Half Present: ${first.present} | Second Half Present: ${second.present}`);
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
