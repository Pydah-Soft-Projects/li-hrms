const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

// IN: 12:55 IST = 07:25 UTC (12:55 - 5:30)
// OUT: 20:20 IST = 14:50 UTC (20:20 - 5:30)

const logs = [
  // June 18, 2026
  {
    employeeId: '2146',
    timestamp: '2026-06-18T07:25:00Z',  // 12:55 IST - IN punch
    logType: 'CHECK-IN',
    deviceId: 'DEVICE-001',
    deviceName: 'Biometric Device Main',
    rawStatus: null,
    source: 'biometric-realtime'
  },
  {
    employeeId: '2146',
    timestamp: '2026-06-18T14:50:00Z',  // 20:20 IST - OUT punch
    logType: 'CHECK-OUT',
    deviceId: 'DEVICE-001',
    deviceName: 'Biometric Device Main',
    rawStatus: null,
    source: 'biometric-realtime'
  },
  // June 19, 2026
  {
    employeeId: '2146',
    timestamp: '2026-06-19T07:25:00Z',  // 12:55 IST - IN punch
    logType: 'CHECK-IN',
    deviceId: 'DEVICE-001',
    deviceName: 'Biometric Device Main',
    rawStatus: null,
    source: 'biometric-realtime'
  },
  {
    employeeId: '2146',
    timestamp: '2026-06-19T14:50:00Z',  // 20:20 IST - OUT punch
    logType: 'CHECK-OUT',
    deviceId: 'DEVICE-001',
    deviceName: 'Biometric Device Main',
    rawStatus: null,
    source: 'biometric-realtime'
  }
];

const SYSTEM_KEY = process.env.HRMS_MICROSERVICE_SECRET_KEY || 'hrms-secret-key-2024-abc123xyz789';

(async () => {
  try {
    // Step 1: Sync logs
    console.log('🔄 Syncing attendance logs for Employee 2146 (June 18-19)...\n');
    console.log('📋 Logs being sent:');
    logs.forEach((log, idx) => {
      const istTime = new Date(log.timestamp).toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata' });
      console.log(`  [${idx + 1}] ${log.timestamp.split('T')[0]} - ${istTime} (${log.logType})`);
    });
    
    const syncResponse = await fetch('http://localhost:5000/api/internal/attendance/sync', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-system-key': SYSTEM_KEY
      },
      body: JSON.stringify(logs)
    });
    const syncResult = await syncResponse.json();
    console.log('\n✅ Sync Result:');
    console.log(JSON.stringify(syncResult, null, 2));

    // Step 2: Retrieve attendance daily for both dates
    console.log('\n\n📊 RETRIEVING ATTENDANCE RECORDS:\n');
    
    for (const date of ['2026-06-18', '2026-06-19']) {
      console.log(`🔄 Retrieving attendance for ${date}...`);
      const attendanceResponse = await fetch(`http://localhost:5000/api/attendance/daily?employeeNumber=2146&date=${date}`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json'
        }
      });
      const attendanceResult = await attendanceResponse.json();
      console.log(`\n📋 Attendance Record for ${date}:`);
      
      if (attendanceResult.success && attendanceResult.data) {
        const record = attendanceResult.data;
        console.log(`  Status: ${record.status}`);
        console.log(`  Working Hours: ${record.totalWorkingHours}`);
        console.log(`  Payable Shifts: ${record.payableShifts}`);
        
        if (record.shifts && record.shifts.length > 0) {
          const shift = record.shifts[0];
          console.log(`\n  Shift Details:`);
          console.log(`    In Time: ${shift.inTime ? new Date(shift.inTime).toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata' }) : 'N/A'}`);
          console.log(`    Out Time: ${shift.outTime ? new Date(shift.outTime).toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata' }) : 'N/A'}`);
          console.log(`    Late In: ${shift.lateInMinutes || 0}m`);
          console.log(`    Early Out: ${shift.earlyOutMinutes || 0}m`);
          
          if (shift.shiftSegments && shift.shiftSegments.length >= 2) {
            console.log(`\n  Segment Analysis:`);
            shift.shiftSegments.forEach((seg, idx) => {
              console.log(`    Segment ${idx + 1} (${seg.segmentName}):`);
              console.log(`      Schedule: ${seg.startTime} - ${seg.endTime} (${seg.duration}h)`);
              console.log(`      Min Required: ${seg.minDuration}h`);
              console.log(`      Present: ${seg.present ? '✅ YES' : '❌ NO'}`);
              console.log(`      Payable: ${seg.payableShifts}`);
            });
          }
        }
      } else {
        console.log(`  Error: ${attendanceResult.message}`);
      }
      console.log('\n---\n');
    }

  } catch (err) {
    console.error('❌ Error:', err.message);
  }
})();
