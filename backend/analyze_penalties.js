const mongoose = require('mongoose');
const AttendanceDaily = require('./attendance/model/AttendanceDaily');

(async () => {
  try {
    await mongoose.connect('mongodb://localhost:27017/hrms-leave-5');
    
    console.log('=== ANALYZING LATE-IN & EARLY-OUT FOR HALF-DAYS ===\n');
    
    const records = await AttendanceDaily.findOne({
      employeeNumber: '2146',
      date: '2026-06-13'
    }).lean();
    
    if (!records || !records.shifts || records.shifts.length === 0) {
      console.log('No records found');
      process.exit(0);
    }
    
    const shift = records.shifts[0];
    console.log(`📅 DATE: 2026-06-13`);
    console.log(`⏰ IN: ${new Date(shift.inTime).toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata' })}`);
    console.log(`⏰ OUT: ${new Date(shift.outTime).toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata' })}\n`);
    
    if (shift.shiftSegments && shift.shiftSegments.length >= 2) {
      const first = shift.shiftSegments[0];
      const second = shift.shiftSegments[1];
      
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.log('FIRST HALF (DOMINANT - MARKED PRESENT)');
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.log(`Schedule: ${first.startTime} - ${first.endTime}`);
      console.log(`Status: ${first.present ? '✅ PRESENT' : '❌ ABSENT'}`);
      console.log(`\n⏱️ PENALTIES (if applied):`);
      console.log(`  Late In: ${first.lateInMinutes}m (came at 10:15, segment starts 09:00)`);
      console.log(`  Early Out: ${first.earlyOutMinutes}m (left at 14:30, segment ends 13:00)`);
      
      console.log(`\n❓ QUESTION:`);
      console.log(`  Since PRESENT=true, should we apply these penalties?`);
      console.log(`  Or should penalties be waived when employee works continuous duration?`);
      
      console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
      console.log('SECOND HALF (RECESSIVE - MARKED ABSENT)');
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.log(`Schedule: ${second.startTime} - ${second.endTime}`);
      console.log(`Status: ${second.present ? '✅ PRESENT' : '❌ ABSENT'}`);
      console.log(`\n⏱️ PENALTIES (not calculated when ABSENT):`);
      console.log(`  Late In: ${second.lateInMinutes} (not calculated)`);
      console.log(`  Early Out: ${second.earlyOutMinutes} (not calculated)`);
      
      console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
      console.log('\n💡 CURRENT LOGIC:');
      console.log('  ✅ If PRESENT = penalties ARE calculated');
      console.log('  ❌ If ABSENT = penalties are NOT calculated (null)');
      
      console.log('\n❓ SHOULD WE:');
      console.log('  Option A: Keep penalties (strict enforcement)?');
      console.log('  Option B: Waive penalties for dominant segment with overflow credit?');
      console.log('  Option C: Apply partial penalties based on actual coverage?');
    }
    
    await mongoose.disconnect();
    process.exit(0);
  } catch (err) {
    console.error(err.message);
    process.exit(1);
  }
})();
