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

      if (!record) continue;

      console.log(`\n${'═'.repeat(60)}`);
      console.log(`📅 ${dateStr}`);
      console.log(`${'═'.repeat(60)}`);
      
      // Check policyMeta for partial day rules
      if (record.policyMeta?.partialDayRule) {
        console.log(`\n📌 POLICY META - Partial Day Rule:`);
        console.log(`   firstHalfStatus: ${record.policyMeta.partialDayRule.firstHalfStatus}`);
        console.log(`   secondHalfStatus: ${record.policyMeta.partialDayRule.secondHalfStatus}`);
      }

      // Check shifts[0] for segment info
      if (record.shifts && record.shifts[0]) {
        const shift = record.shifts[0];
        console.log(`\n📌 SHIFTS[0] - Which half is PRESENT?`);
        
        if (shift.shiftSegments && shift.shiftSegments.length >= 2) {
          const first = shift.shiftSegments[0];
          const second = shift.shiftSegments[1];
          
          console.log(`   First Half (${first.startTime}-${first.endTime}): Present=${first.present}`);
          console.log(`   Second Half (${second.startTime}-${second.endTime}): Present=${second.present}`);
          
          // Determine which is actually marked as present
          if (first.present && !second.present) {
            console.log(`   ✅ CORRECT: First half marked as present`);
          } else if (!first.present && second.present) {
            console.log(`   ❌ WRONG: Second half marked as present`);
          } else if (first.present && second.present) {
            console.log(`   ⚠️  BOTH marked as present`);
          }
        }
      }
      
      // Also check for any half-related fields
      console.log(`\n📌 OTHER HALF FIELDS:`);
      if (record.firstHalfStatus) console.log(`   firstHalfStatus: ${record.firstHalfStatus}`);
      if (record.secondHalfStatus) console.log(`   secondHalfStatus: ${record.secondHalfStatus}`);
      if (record.rosterFirstHalfNonWorking) console.log(`   rosterFirstHalfNonWorking: ${record.rosterFirstHalfNonWorking}`);
      if (record.rosterSecondHalfNonWorking) console.log(`   rosterSecondHalfNonWorking: ${record.rosterSecondHalfNonWorking}`);
      if (!record.firstHalfStatus && !record.secondHalfStatus && !record.rosterFirstHalfNonWorking && !record.rosterSecondHalfNonWorking) {
        console.log(`   (None found)`);
      }
    }

    await mongoose.disconnect();

  } catch (err) {
    console.error('Error:', err.message);
    process.exit(1);
  }
})();
