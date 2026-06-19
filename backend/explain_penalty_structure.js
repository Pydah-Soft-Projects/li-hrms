const mongoose = require('mongoose');

(async () => {
  try {
    await mongoose.connect('mongodb://localhost:27017/hrms-leave-5');
    
    console.log('=== SCENARIO: HALF-DAY SEGMENT WITH LATE-IN (20m) + EARLY-OUT (30m) ===\n');
    
    // Let me create a test document to show the structure
    const testData = {
      employeeNumber: '2146',
      date: '2026-06-13',
      status: 'HALF_DAY',
      payableShifts: 0.5,
      totalLateInMinutes: 20,        // Only from PRESENT segment
      totalEarlyOutMinutes: 30,      // Only from PRESENT segment
      shifts: [
        {
          shiftId: 'shift-1',
          inTime: new Date('2026-06-13T10:15:00Z'),
          outTime: new Date('2026-06-13T14:30:00Z'),
          status: 'HALF_DAY',
          lateInMinutes: 20,           // From segment calculation
          earlyOutMinutes: 30,         // From segment calculation
          isLateIn: true,              // Boolean flag
          isEarlyOut: true,            // Boolean flag
          shiftSegments: [
            {
              segmentName: 'firstHalf',
              startTime: '09:00',
              endTime: '13:00',
              present: true,           // MARKED PRESENT
              lateInMinutes: 20,
              earlyOutMinutes: 30,
              isLateIn: true,
              isEarlyOut: true
            },
            {
              segmentName: 'secondHalf',
              startTime: '13:30',
              endTime: '21:00',
              present: false,          // MARKED ABSENT
              lateInMinutes: null,     // NOT calculated when absent
              earlyOutMinutes: null,   // NOT calculated when absent
              isLateIn: false,
              isEarlyOut: false
            }
          ]
        }
      ]
    };
    
    console.log('📋 ATTENDANCE DAILY RECORD:\n');
    console.log(`Status: ${testData.status}`);
    console.log(`Payable Shifts: ${testData.payableShifts}`);
    
    console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
    console.log('⚠️  DAILY LEVEL PENALTIES:');
    console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
    console.log(`totalLateInMinutes: ${testData.totalLateInMinutes}m`);
    console.log(`  └─ This is the SUM of all PRESENT segment lateMins`);
    console.log(`  └─ Used for: Monthly summaries, payroll deductions\n`);
    
    console.log(`totalEarlyOutMinutes: ${testData.totalEarlyOutMinutes}m`);
    console.log(`  └─ This is the SUM of all PRESENT segment earlyOutMins`);
    console.log(`  └─ Used for: Early out deduction calculations\n`);
    
    console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
    console.log('🔧 SHIFT LEVEL (for shift in shifts array):');
    console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
    console.log(`lateInMinutes: ${testData.shifts[0].lateInMinutes}m`);
    console.log(`  └─ For multi-segment days: SUM of penalties from PRESENT segments`);
    console.log(`  └─ For single-shift days: Direct shift calculation\n`);
    
    console.log(`earlyOutMinutes: ${testData.shifts[0].earlyOutMinutes}m`);
    console.log(`  └─ For multi-segment days: SUM of penalties from PRESENT segments`);
    console.log(`  └─ For single-shift days: Direct shift calculation\n`);
    
    console.log(`isLateIn: ${testData.shifts[0].isLateIn}`);
    console.log(`  └─ BOOLEAN flag: true if lateInMinutes > 0, else false`);
    console.log(`  └─ Used for: UI indicators, sorting, filtering\n`);
    
    console.log(`isEarlyOut: ${testData.shifts[0].isEarlyOut}`);
    console.log(`  └─ BOOLEAN flag: true if earlyOutMinutes > 0, else false`);
    console.log(`  └─ Used for: UI indicators, sorting, filtering\n`);
    
    console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
    console.log('📊 SEGMENT LEVEL (in shiftSegments array):');
    console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
    
    const first = testData.shifts[0].shiftSegments[0];
    const second = testData.shifts[0].shiftSegments[1];
    
    console.log(`\nFIRST HALF (PRESENT):`);
    console.log(`  present: ${first.present} ✅`);
    console.log(`  lateInMinutes: ${first.lateInMinutes}m`);
    console.log(`  earlyOutMinutes: ${first.earlyOutMinutes}m`);
    console.log(`  isLateIn: ${first.isLateIn} (true because lateInMinutes > 0)`);
    console.log(`  isEarlyOut: ${first.isEarlyOut} (true because earlyOutMinutes > 0)`);
    
    console.log(`\nSECOND HALF (ABSENT):`);
    console.log(`  present: ${second.present} ❌`);
    console.log(`  lateInMinutes: ${second.lateInMinutes}`);
    console.log(`  earlyOutMinutes: ${second.earlyOutMinutes}`);
    console.log(`  isLateIn: ${second.isLateIn} (false, not calculated for ABSENT)`);
    console.log(`  isEarlyOut: ${second.isEarlyOut} (false, not calculated for ABSENT)`);
    
    console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
    console.log('💡 KEY POINTS:');
    console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
    console.log(`\n1️⃣ DAILY STATUS:`);
    console.log(`   - Only looks at whether ANY segment is PRESENT`);
    console.log(`   - If at least one segment is PRESENT → Status = HALF_DAY`);
    console.log(`   - If both ABSENT → Status = ABSENT\n`);
    
    console.log(`2️⃣ DAILY PENALTIES (totalLateInMinutes, totalEarlyOutMinutes):`);
    console.log(`   - SUM of penalties from ALL PRESENT segments only`);
    console.log(`   - ABSENT segment penalties are IGNORED (null/undefined)`);
    console.log(`   - Used for monthly summaries and payroll deductions\n`);
    
    console.log(`3️⃣ BOOLEAN FLAGS (isLateIn, isEarlyOut):`);
    console.log(`   At DAILY level: true if corresponding minutes > 0`);
    console.log(`   At SEGMENT level: true if segment.present AND minutes > 0`);
    console.log(`   Used for: UI display, report filtering, highlighting\n`);
    
    console.log(`4️⃣ SHIFT LEVEL (intermediate):`);
    console.log(`   - Calculates by summing PRESENT segment penalties`);
    console.log(`   - Acts as bridge between segment and daily level`);
    console.log(`   - Must match daily totals when recalculated\n`);
    
    await mongoose.disconnect();
    process.exit(0);
  } catch (err) {
    console.error(err.message);
    process.exit(1);
  }
})();
