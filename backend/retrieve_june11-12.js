const mongoose = require('mongoose');
const AttendanceDaily = require('./attendance/model/AttendanceDaily');

(async () => {
  try {
    await mongoose.connect('mongodb://localhost:27017/hrms-leave-5');
    
    console.log('=== EMPLOYEE 2146 - JUNE 11-12 PROCESSED RECORDS ===\n');
    console.log('IN Punch: 10:05 IST | OUT Punch: 14:10 IST (4h 5m worked)\n');
    console.log('TEST: First half overflow detection\n');
    
    const records = await AttendanceDaily.find({
      employeeNumber: '2146',
      date: { $in: ['2026-06-11', '2026-06-12'] }
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
          console.log(`   1. Employee worked: 10:05 - 14:10 = 4h 5m`);
          console.log(`   2. First Half (09:00-13:00) = 10:05 - 13:00 = 2h 55m (needs 3h 45m) ❌`);
          console.log(`   3. Break (13:00-13:30) = 30m (continuous work, should credit)`);
          console.log(`   4. Second Half (13:30-21:00) = 13:30 - 14:10 = 40m (needs 7h 10m) ❌`);
          console.log(`\n💡 CONTINUOUS WORK CREDIT TEST:`);
          console.log(`   First Half Credit: 2h 55m (actual) - NOT ENOUGH`);
          console.log(`   Can First Half overflow to Second Half? Let's see:`);
          console.log(`   - Overflow from First: 2h 55m + 30m break = 3h 25m`);
          console.log(`   - Plus Second Half work: 40m`);
          console.log(`   - Total Second: 3h 25m + 40m = 4h 5m (still needs 7h 10m) ❌`);
          console.log(`\n   Result: Both halves fail even with continuous work credit`);
          console.log(`   Expected: Status = PARTIAL or ABSENT, Payable = 0`);
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
