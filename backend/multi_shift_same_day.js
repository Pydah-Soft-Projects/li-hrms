const mongoose = require('mongoose');

(async () => {
  try {
    await mongoose.connect('mongodb://localhost:27017/hrms-leave-5');
    
    console.log('=== SCENARIO: MULTI-SHIFT SAME DAY ===');
    console.log('Employee works 2 shifts on the same day (both HALF_DAY)\n');
    
    const testData = {
      employeeNumber: '2146',
      date: '2026-06-13',
      status: 'PRESENT',  // Will explain this
      payableShifts: 1.0,  // 0.5 + 0.5 from two shifts
      totalLateInMinutes: 80,   // 60 + 20 from both PRESENT segments
      totalEarlyOutMinutes: 30, // 0 + 30 from PRESENT segments
      shifts: [
        {
          shiftId: 'shift-1',
          inTime: new Date('2026-06-13T10:15:00Z'),
          outTime: new Date('2026-06-13T14:30:00Z'),
          status: 'HALF_DAY',
          lateInMinutes: 60,
          earlyOutMinutes: 0,
          isLateIn: true,
          isEarlyOut: false,
          shiftSegments: [
            {
              segmentName: 'firstHalf',
              present: true,    // ✅ PRESENT
              lateInMinutes: 60,
              earlyOutMinutes: 0,
              isLateIn: true,
              isEarlyOut: false
            },
            {
              segmentName: 'secondHalf',
              present: false,   // ❌ ABSENT
              lateInMinutes: null,
              earlyOutMinutes: null,
              isLateIn: false,
              isEarlyOut: false
            }
          ]
        },
        {
          shiftId: 'shift-2',
          inTime: new Date('2026-06-13T14:45:00Z'),
          outTime: new Date('2026-06-13T19:00:00Z'),
          status: 'HALF_DAY',
          lateInMinutes: 20,
          earlyOutMinutes: 30,
          isLateIn: true,
          isEarlyOut: true,
          shiftSegments: [
            {
              segmentName: 'firstHalf',
              present: false,   // ❌ ABSENT
              lateInMinutes: null,
              earlyOutMinutes: null,
              isLateIn: false,
              isEarlyOut: false
            },
            {
              segmentName: 'secondHalf',
              present: true,    // ✅ PRESENT
              lateInMinutes: 20,
              earlyOutMinutes: 30,
              isLateIn: true,
              isEarlyOut: true
            }
          ]
        }
      ]
    };
    
    console.log('📋 ATTENDANCE DAILY RECORD (SAME DAY - 2 SHIFTS):\n');
    console.log(`Date: ${testData.date}`);
    console.log(`Status: ${testData.status}`);
    console.log(`Payable Shifts: ${testData.payableShifts}`);
    
    console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
    console.log('⚠️  DAILY LEVEL PENALTIES (AGGREGATED):');
    console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
    console.log(`totalLateInMinutes: ${testData.totalLateInMinutes}m`);
    console.log(`  ├─ Shift 1 First Half (PRESENT): 60m`);
    console.log(`  └─ Shift 2 Second Half (PRESENT): 20m`);
    console.log(`  └─ TOTAL: 60 + 20 = ${testData.totalLateInMinutes}m\n`);
    
    console.log(`totalEarlyOutMinutes: ${testData.totalEarlyOutMinutes}m`);
    console.log(`  ├─ Shift 1 First Half (PRESENT): 0m`);
    console.log(`  └─ Shift 2 Second Half (PRESENT): 30m`);
    console.log(`  └─ TOTAL: 0 + 30 = ${testData.totalEarlyOutMinutes}m\n`);
    
    console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
    console.log('🔧 SHIFT 1 (10:15-14:30):');
    console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
    const shift1 = testData.shifts[0];
    console.log(`Status: ${shift1.status}`);
    console.log(`Payable Shifts: 0.5`);
    console.log(`lateInMinutes: ${shift1.lateInMinutes}m`);
    console.log(`earlyOutMinutes: ${shift1.earlyOutMinutes}m`);
    console.log(`isLateIn: ${shift1.isLateIn}`);
    console.log(`isEarlyOut: ${shift1.isEarlyOut}`);
    
    console.log(`\n  FIRST HALF (PRESENT ✅):`);
    console.log(`    present: true`);
    console.log(`    lateInMinutes: 60m ← INCLUDED in daily totals`);
    console.log(`    earlyOutMinutes: 0m ← INCLUDED in daily totals`);
    
    console.log(`\n  SECOND HALF (ABSENT ❌):`);
    console.log(`    present: false`);
    console.log(`    lateInMinutes: null ← IGNORED (not present)`);
    console.log(`    earlyOutMinutes: null ← IGNORED (not present)`);
    
    console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
    console.log('🔧 SHIFT 2 (14:45-19:00):');
    console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
    const shift2 = testData.shifts[1];
    console.log(`Status: ${shift2.status}`);
    console.log(`Payable Shifts: 0.5`);
    console.log(`lateInMinutes: ${shift2.lateInMinutes}m`);
    console.log(`earlyOutMinutes: ${shift2.earlyOutMinutes}m`);
    console.log(`isLateIn: ${shift2.isLateIn}`);
    console.log(`isEarlyOut: ${shift2.isEarlyOut}`);
    
    console.log(`\n  FIRST HALF (ABSENT ❌):`);
    console.log(`    present: false`);
    console.log(`    lateInMinutes: null ← IGNORED (not present)`);
    console.log(`    earlyOutMinutes: null ← IGNORED (not present)`);
    
    console.log(`\n  SECOND HALF (PRESENT ✅):`);
    console.log(`    present: true`);
    console.log(`    lateInMinutes: 20m ← INCLUDED in daily totals`);
    console.log(`    earlyOutMinutes: 30m ← INCLUDED in daily totals`);
    
    console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
    console.log('💡 CALCULATION LOGIC:');
    console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
    
    console.log(`\n✅ DAILY STATUS DETERMINATION:`);
    console.log(`   Loop through ALL shifts on the day`);
    console.log(`   For EACH shift, loop through shiftSegments`);
    console.log(`   If ANY segment.present === true → Status = PRESENT (or HALF_DAY if only one)`);
    console.log(`   \n   In this case:`);
    console.log(`   ├─ Shift 1 First Half: present = true ✅`);
    console.log(`   └─ Shift 2 Second Half: present = true ✅`);
    console.log(`   └─ Result: Status = PRESENT (both halves covered, even across shifts)`);
    
    console.log(`\n✅ DAILY PENALTIES AGGREGATION:`);
    console.log(`   totalLateInMinutes = SUM of all (segment.lateInMinutes WHERE segment.present = true)`);
    console.log(`   \n   Calculation:`);
    console.log(`   ├─ Shift 1 First (present=true): 60m`);
    console.log(`   ├─ Shift 1 Second (present=false): null (SKIP)`);
    console.log(`   ├─ Shift 2 First (present=false): null (SKIP)`);
    console.log(`   ├─ Shift 2 Second (present=true): 20m`);
    console.log(`   └─ TOTAL: 60 + 0 + 0 + 20 = 80m`);
    
    console.log(`\n   totalEarlyOutMinutes = SUM of all (segment.earlyOutMinutes WHERE segment.present = true)`);
    console.log(`   \n   Calculation:`);
    console.log(`   ├─ Shift 1 First (present=true): 0m`);
    console.log(`   ├─ Shift 1 Second (present=false): null (SKIP)`);
    console.log(`   ├─ Shift 2 First (present=false): null (SKIP)`);
    console.log(`   ├─ Shift 2 Second (present=true): 30m`);
    console.log(`   └─ TOTAL: 0 + 0 + 0 + 30 = 30m`);
    
    console.log(`\n✅ PAYABLE SHIFTS CALCULATION:`);
    console.log(`   For EACH shift with at least one PRESENT segment: +0.5`);
    console.log(`   \n   In this case:`);
    console.log(`   ├─ Shift 1 (has First Half PRESENT): +0.5`);
    console.log(`   └─ Shift 2 (has Second Half PRESENT): +0.5`);
    console.log(`   └─ TOTAL: 1.0 payable shifts`);
    
    console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
    console.log('📊 FINAL DAILY SUMMARY:');
    console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
    console.log(`\nStatus: ${testData.status}`);
    console.log(`  └─ Why: Has PRESENT segments from both shifts`);
    console.log(`  └─ Makes it a full PRESENT day (1.0 payable)`);
    
    console.log(`\nPayable Shifts: ${testData.payableShifts}`);
    console.log(`  └─ Shift 1: 0.5 (First half worked)`);
    console.log(`  └─ Shift 2: 0.5 (Second half worked)`);
    
    console.log(`\nTotal Late In: ${testData.totalLateInMinutes}m`);
    console.log(`  └─ For Payroll: Deduct based on 80 minutes of lateness`);
    console.log(`  └─ For Reports: Show 80m accumulated penalty`);
    
    console.log(`\nTotal Early Out: ${testData.totalEarlyOutMinutes}m`);
    console.log(`  └─ For Payroll: Deduct based on 30 minutes early out`);
    console.log(`  └─ For Reports: Show 30m accumulated penalty`);
    
    await mongoose.disconnect();
    process.exit(0);
  } catch (err) {
    console.error(err.message);
    process.exit(1);
  }
})();
