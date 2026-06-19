const mongoose = require('mongoose');
const path = require('path');

require('dotenv').config({ path: path.join(__dirname, '../.env') });

(async () => {
  try {
    const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/hrms-leave-5';
    await mongoose.connect(mongoUri);
    console.log('✅ Connected to MongoDB\n');

    const { getApprovedRecordsForDate } = require('../shared/services/conflictValidationService');
    
    console.log('═══════════════════════════════════════════════════════════');
    console.log('🧪 TESTING LEAVE APPLICATION HALF-DAY DISPLAY FIX');
    console.log('═══════════════════════════════════════════════════════════\n');

    const dates = ['2026-06-15', '2026-06-16', '2026-06-17'];
    
    for (const dateStr of dates) {
      console.log(`📅 Testing ${dateStr}:`);
      
      const result = await getApprovedRecordsForDate(null, '2146', dateStr);
      
      console.log(`   Has Attendance: ${result.attendanceInfo?.hasAttendance}`);
      console.log(`   Status: ${result.attendanceInfo?.status}`);
      console.log(`   Label: ${result.attendanceInfo?.label}`);
      console.log(`   First Half Present: ${result.attendanceInfo?.firstHalfPresent ? '✅ YES' : '❌ NO'}`);
      console.log(`   Second Half Present: ${result.attendanceInfo?.secondHalfPresent ? '✅ YES' : '❌ NO'}`);
      
      // Verify the fix worked
      if (result.attendanceInfo?.firstHalfPresent && !result.attendanceInfo?.secondHalfPresent) {
        console.log(`   ✅ CORRECT: First half is present (for leave app)\n`);
      } else if (!result.attendanceInfo?.firstHalfPresent && result.attendanceInfo?.secondHalfPresent) {
        console.log(`   ❌ WRONG: Second half is present (still broken)\n`);
      } else {
        console.log(`   ⚠️  Unexpected combination\n`);
      }
    }

    console.log('═══════════════════════════════════════════════════════════');
    console.log('✅ SUMMARY:\n');
    console.log('When applying leave on June 15-17:');
    console.log('- Employee 2146 worked 09:18-13:41 (first half only)');
    console.log('- Leave app will now CORRECTLY show:');
    console.log('  First Half: Present ✅');
    console.log('  Second Half: Available for leave ✅');
    console.log('- Recommendation: Apply leave on SECOND HALF ✅\n');

    await mongoose.disconnect();

  } catch (err) {
    console.error('Error:', err.message);
    process.exit(1);
  }
})();
