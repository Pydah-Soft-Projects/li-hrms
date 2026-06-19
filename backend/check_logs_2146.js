const mongoose = require('mongoose');
const AttendanceRawLog = require('./attendance/model/AttendanceRawLog');
const AttendanceDaily = require('./attendance/model/AttendanceDaily');
const Shift = require('./shifts/model/Shift');

(async () => {
  try {
    await mongoose.connect('mongodb://localhost:27017/hrms-leave-5');
    
    console.log('=== EMPLOYEE 2146 - JUNE 18-19 ANALYSIS ===\n');
    
    // Get shift details
    const shift = await Shift.findOne({ 
      name: /pydah soft 9/i
    }).lean();
    
    console.log('SHIFT CONFIGURATION:');
    console.log('Name: ' + (shift?.name || 'N/A'));
    console.log('Start: ' + (shift?.startTime || 'N/A') + ', End: ' + (shift?.endTime || 'N/A'));
    if (shift?.segments && shift.segments.length > 0) {
      shift.segments.forEach((seg, idx) => {
        console.log('  Segment ' + (idx + 1) + ': ' + seg.segmentName + ' (' + seg.startTime + '-' + seg.endTime + ')');
        console.log('    Break: ' + seg.breakStart + ' - ' + seg.breakEnd + ', Min Duration: ' + seg.minDuration);
      });
    }
    console.log('\n');
    
    // Get raw logs
    const logs = await AttendanceRawLog.find({
      employeeNumber: '2146',
      timestamp: {
        $gte: new Date('2026-06-18T00:00:00'),
        $lt: new Date('2026-06-20T00:00:00')
      }
    }).sort({ timestamp: 1 }).lean();
    
    console.log('RAW PUNCHES (IN/OUT):');
    const logsByDate = {};
    logs.forEach(log => {
      const dateStr = new Date(log.timestamp).toISOString().split('T')[0];
      if (!logsByDate[dateStr]) logsByDate[dateStr] = [];
      logsByDate[dateStr].push(log);
    });
    
    Object.keys(logsByDate).sort().forEach(date => {
      console.log('\n' + date + ':');
      logsByDate[date].forEach((log, idx) => {
        const time = new Date(log.timestamp).toLocaleTimeString('en-IN');
        console.log('  ' + (idx + 1) + '. ' + time + ' - ' + log.logType + ' (' + log.source + ')');
      });
    });
    
    // Get processed attendance records
    console.log('\n\nPROCESSED ATTENDANCE RECORDS:');
    const records = await AttendanceDaily.find({
      employeeNumber: '2146',
      date: { $in: ['2026-06-18', '2026-06-19'] }
    }).lean();
    
    records.forEach(rec => {
      console.log('\n' + rec.date + ':');
      console.log('  Overall Status: ' + rec.status);
      console.log('  Total Working Hours: ' + rec.totalWorkingHours);
      console.log('  Payable Shifts: ' + rec.payableShifts);
      
      if (rec.shifts && rec.shifts.length > 0) {
        const shift = rec.shifts[0];
        console.log('  Shift In: ' + (shift.inTime ? new Date(shift.inTime).toLocaleTimeString('en-IN') : 'N/A'));
        console.log('  Shift Out: ' + (shift.outTime ? new Date(shift.outTime).toLocaleTimeString('en-IN') : 'N/A'));
        console.log('  Late In: ' + (shift.lateInMinutes || 0) + 'm, Early Out: ' + (shift.earlyOutMinutes || 0) + 'm');
        
        if (shift.shiftSegments && shift.shiftSegments.length >= 2) {
          console.log('\n  SEGMENT ANALYSIS:');
          shift.shiftSegments.forEach((seg, idx) => {
            console.log('    Segment ' + (idx + 1) + ': ' + seg.segmentName);
            console.log('      Schedule: ' + seg.startTime + ' - ' + seg.endTime);
            console.log('      Min Duration: ' + seg.minDuration + 'h, Grace: ' + seg.gracePeriod + 'm');
            console.log('      Worked: ' + seg.duration + 'h, Overlap: ' + seg.overlapMinutes + 'm');
            console.log('      Present: ' + seg.present + ' (Payable: ' + seg.payableShifts + ')');
            if (seg.lateInMinutes || seg.earlyOutMinutes) {
              console.log('      Late In: ' + (seg.lateInMinutes || 0) + 'm, Early Out: ' + (seg.earlyOutMinutes || 0) + 'm');
            }
          });
          
          // Analysis
          console.log('\n  ANALYSIS:');
          const first = shift.shiftSegments[0];
          const second = shift.shiftSegments[1];
          console.log('    First Half Present: ' + (first.present ? 'YES' : 'NO'));
          console.log('    Second Half Present: ' + (second.present ? 'YES' : 'NO'));
          console.log('    First Half Duration: ' + first.duration + 'h (min required: ' + first.minDuration + 'h)');
          console.log('    Second Half Duration: ' + second.duration + 'h (min required: ' + second.minDuration + 'h)');
          console.log('    Break Time: ' + first.endTime + ' to ' + second.startTime);
          console.log('    Gap at Transition: ' + ((new Date('2026-01-01T' + second.startTime) - new Date('2026-01-01T' + first.endTime)) / 60000) + ' minutes');
        }
      }
    });
    
    await mongoose.disconnect();
    process.exit(0);
  } catch (err) {
    console.error(err.message);
    console.error(err.stack);
    process.exit(1);
  }
})();
