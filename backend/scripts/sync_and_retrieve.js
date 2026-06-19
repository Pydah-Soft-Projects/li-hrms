const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const logs = [
  {
    employeeId: '2146',
    timestamp: '2026-06-17T03:48:00Z',  // 9:18 IST converted to UTC
    logType: 'CHECK-IN',
    deviceId: 'DEVICE-001',
    deviceName: 'Biometric Device Main',
    rawStatus: null,
    source: 'biometric-realtime'
  },
  {
    employeeId: '2146',
    timestamp: '2026-06-17T08:11:00Z',  // 13:41 IST converted to UTC
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
    console.log('🔄 Syncing attendance logs...');
    console.log('📋 Logs being sent:');
    logs.forEach((log, idx) => {
      console.log(`  [${idx + 1}] emp=${log.employeeId}, type=${log.logType}, ts=${log.timestamp}`);
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
    console.log('\n✅ Sync Result:', syncResult);

    // Step 2: Retrieve attendance daily for employee 2146 on June 17th
    console.log('\n🔄 Retrieving attendance daily record...');
    const attendanceResponse = await fetch('http://localhost:5000/api/attendance/daily?employeeId=2146&date=2026-06-17', {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json'
      }
    });
    const attendanceResult = await attendanceResponse.json();
    console.log('\n📊 Attendance Daily Record for Employee 2146 on June 17th, 2026:');
    console.log(JSON.stringify(attendanceResult, null, 2));

  } catch (err) {
    console.error('❌ Error:', err.message);
  }
})();
