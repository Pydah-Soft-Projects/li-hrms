const mongoose = require('mongoose');
const path = require('path');

require('dotenv').config({ path: path.join(__dirname, '../.env') });

const Shift = require('../shifts/model/Shift');
const { getShiftSegmentAssignment } = require('../shifts/services/shiftHalfSegmentService');

(async () => {
  try {
    const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/hrms-leave-5';
    await mongoose.connect(mongoUri);
    console.log('✅ Connected to MongoDB\n');

    // Find the pydahsoft 9 AM - 9 PM shift
    const shift = await Shift.findOne({
      startTime: '09:00',
      endTime: '21:00'
    }).lean();

    if (!shift) {
      console.log('❌ Shift not found');
      process.exit(1);
    }

    console.log(`📋 Testing Shift: ${shift.name}`);
    console.log(`   Hours: ${shift.startTime} - ${shift.endTime}`);
    console.log(`   First Half: ${shift.firstHalf.startTime} - ${shift.firstHalf.endTime} (Min: ${shift.firstHalf.minDuration}h)`);
    console.log(`   Break: ${shift.break.startTime} - ${shift.break.endTime}`);
    console.log(`   Second Half: ${shift.secondHalf.startTime} - ${shift.secondHalf.endTime} (Min: ${shift.secondHalf.minDuration}h)\n`);

    // Employee punch times: 09:18 IN, 13:41 OUT (June 15, 2026)
    const dateStr = '2026-06-15';
    const inTime = new Date('2026-06-15T03:48:00Z');  // 09:18 IST in UTC
    const outTime = new Date('2026-06-15T08:11:00Z'); // 13:41 IST in UTC

    console.log('👤 Employee Punch Times:');
    console.log(`   IN:  ${inTime.toISOString()} (09:18 IST)`);
    console.log(`   OUT: ${outTime.toISOString()} (13:41 IST)`);
    console.log(`   Total Work: 4h 23m (including break skip)\n`);

    // Calculate segment assignment with break-aware detection
    const result = getShiftSegmentAssignment(shift, dateStr, inTime, outTime);

    console.log('📊 Segment Assignment Results:\n');
    result.shiftSegments.forEach((seg, idx) => {
      console.log(`${idx + 1}. ${seg.segmentName.toUpperCase()}`);
      console.log(`   Window: ${seg.startTime} - ${seg.endTime}`);
      console.log(`   Min Duration: ${seg.minDuration} hours`);
      console.log(`   Present: ${seg.present ? '✅ YES' : '❌ NO'}`);
      console.log(`   Overlap Minutes: ${seg.overlapMinutes}`);
      if (seg.lateInMinutes !== null) console.log(`   Late In: ${seg.lateInMinutes} min`);
      if (seg.earlyOutMinutes !== null) console.log(`   Early Out: ${seg.earlyOutMinutes} min`);
      console.log(`   Payable: ${seg.payableShifts}\n`);
    });

    console.log('📈 Summary:');
    console.log(`   Total Payable Shifts: ${result.totalPayableShifts}`);
    console.log(`   Status: ${result.totalPayableShifts === 0.5 ? '✅ HALF_DAY (first_half)' : result.totalPayableShifts === 1 ? '✅ PRESENT' : '❌ ABSENT'}`);

    await mongoose.disconnect();

  } catch (err) {
    console.error('Error:', err.message);
    process.exit(1);
  }
})();
