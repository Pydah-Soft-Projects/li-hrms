const mongoose = require('mongoose');
const path = require('path');

require('dotenv').config({ path: path.join(__dirname, '../.env') });

// Load Shift model
const Shift = require('../shifts/model/Shift');

(async () => {
  try {
    const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/hrms-leave-5';
    await mongoose.connect(mongoUri);
    console.log('✅ Connected to MongoDB\n');

    // Find shift(s) in Pydahsoft
    const shifts = await Shift.find({}).lean();
    
    console.log('📊 All Shifts in System:\n');
    shifts.slice(0, 10).forEach((shift, idx) => {
      console.log(`${idx + 1}. Name: ${shift.name}`);
      console.log(`   Start-End: ${shift.startTime} - ${shift.endTime}`);
      console.log(`   Payable Shifts: ${shift.payableShifts}`);
      
      if (shift.firstHalf) {
        console.log(`   First Half: ${shift.firstHalf.startTime} - ${shift.firstHalf.endTime}`);
        if (shift.firstHalf.minDuration) console.log(`     Min Duration: ${shift.firstHalf.minDuration} min`);
        if (shift.firstHalf.gracePeriod) console.log(`     Grace: ${shift.firstHalf.gracePeriod} min`);
        if (shift.firstHalf.payableShifts) console.log(`     Payable: ${shift.firstHalf.payableShifts}`);
      }
      
      if (shift.secondHalf) {
        console.log(`   Second Half: ${shift.secondHalf.startTime} - ${shift.secondHalf.endTime}`);
        if (shift.secondHalf.minDuration) console.log(`     Min Duration: ${shift.secondHalf.minDuration} min`);
        if (shift.secondHalf.gracePeriod) console.log(`     Grace: ${shift.secondHalf.gracePeriod} min`);
        if (shift.secondHalf.payableShifts) console.log(`     Payable: ${shift.secondHalf.payableShifts}`);
      }
      
      console.log(`   Late In Grace: ${shift.lateInGracePeriod || 'N/A'} min`);
      console.log(`   Early Out Grace: ${shift.earlyOutGracePeriod || 'N/A'} min`);
      console.log();
    });

    // Look for 9 AM to 9 PM shift specifically
    console.log('\n🔍 Looking for 9 AM - 9 PM shift...');
    const nineToNine = shifts.find(s => 
      s.startTime === '09:00' && s.endTime === '21:00'
    );
    
    if (nineToNine) {
      console.log('\n✅ Found 9 AM - 9 PM Shift:');
      console.log(JSON.stringify(nineToNine, null, 2));
    } else {
      console.log('\n❌ 9 AM - 9 PM shift not found');
      console.log('\nAvailable shift timings:');
      shifts.forEach(s => {
        console.log(`  - ${s.startTime} to ${s.endTime}: ${s.name}`);
      });
    }

    await mongoose.disconnect();

  } catch (err) {
    console.error('Error:', err.message);
    process.exit(1);
  }
})();
