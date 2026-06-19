const mongoose = require('mongoose');
const AttendanceDaily = require('./attendance/model/AttendanceDaily');

(async () => {
  try {
    await mongoose.connect('mongodb://localhost:27017/hrms-leave-5');
    
    console.log('=== PROOF: HALF-DAY PENALTY ISSUE ===\n');
    
    const record = await AttendanceDaily.findOne({
      employeeNumber: '2146',
      date: '2026-06-13'
    }).lean();
    
    if (!record) {
      console.log('No record found');
      process.exit(0);
    }
    
    console.log('📅 ATTENDANCE DAILY RECORD (2026-06-13)');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
    
    console.log(`Status: ${record.status}`);
    console.log(`Payable Shifts: ${record.payableShifts}`);
    console.log(`\n⚠️ DAILY LEVEL PENALTIES:`);
    console.log(`  totalLateInMinutes: ${record.totalLateInMinutes}`);
    console.log(`  totalEarlyOutMinutes: ${record.totalEarlyOutMinutes}`);
    
    console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`);
    
    if (record.shifts && record.shifts.length > 0) {
      const shift = record.shifts[0];
      
      console.log('SHIFT LEVEL DATA:');
      console.log(`  Shift Status: ${shift.status || 'N/A'}`);
      console.log(`  Shift lateInMinutes: ${shift.lateInMinutes}m`);
      console.log(`  Shift earlyOutMinutes: ${shift.earlyOutMinutes}m`);
      
      console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`);
      
      if (shift.shiftSegments && shift.shiftSegments.length >= 2) {
        const first = shift.shiftSegments[0];
        const second = shift.shiftSegments[1];
        
        console.log('SEGMENT LEVEL DATA:');
        console.log(`\nFIRST HALF:`);
        console.log(`  Status: ${first.present ? '✅ PRESENT' : '❌ ABSENT'}`);
        console.log(`  lateInMinutes: ${first.lateInMinutes}m`);
        console.log(`  earlyOutMinutes: ${first.earlyOutMinutes}m`);
        
        console.log(`\nSECOND HALF:`);
        console.log(`  Status: ${second.present ? '✅ PRESENT' : '❌ ABSENT'}`);
        console.log(`  lateInMinutes: ${second.lateInMinutes}m`);
        console.log(`  earlyOutMinutes: ${second.earlyOutMinutes}m`);
        
        console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`);
        
        console.log('🔍 THE PROBLEM:\n');
        
        console.log(`❌ UNRELIABLE DAILY DATA:`);
        console.log(`   Daily totalLateInMinutes = ${record.totalLateInMinutes}m`);
        console.log(`   This comes from: shift.lateInMinutes = ${shift.lateInMinutes}m\n`);
        
        console.log(`❌ ISSUE - This penalty is from a PRESENT segment:`);
        console.log(`   First Half is PRESENT, and has lateInMinutes = ${first.lateInMinutes}m`);
        console.log(`   Second Half is ABSENT, and has lateInMinutes = ${second.lateInMinutes}m\n`);
        
        console.log(`❌ PROBLEM - Shift-level calculation just sums them:`);
        console.log(`   shift.lateInMinutes = first.lateInMinutes + second.lateInMinutes`);
        console.log(`   shift.lateInMinutes = ${first.lateInMinutes}m + ${second.lateInMinutes}m = ${shift.lateInMinutes}m\n`);
        
        console.log(`✅ SOLUTION NEEDED:`);
        console.log(`   Only include penalties from segments marked PRESENT`);
        console.log(`   Correct calculation should be:`);
        console.log(`   totalLateInMinutes = (${first.present ? first.lateInMinutes : '0'}) + (${second.present ? second.lateInMinutes : '0'}) = ${(first.present ? first.lateInMinutes : 0) + (second.present ? second.lateInMinutes : 0)}m`);
        
        console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`);
        console.log('📌 IMPACT:');
        console.log('   - Monthly summary counts incorrect late-ins for half-days');
        console.log('   - Payroll deductions based on wrong penalty values');
        console.log('   - Reports show penalties even when employee was actually present');
      }
    }
    
    await mongoose.disconnect();
    process.exit(0);
  } catch (err) {
    console.error(err.message);
    process.exit(1);
  }
})();
