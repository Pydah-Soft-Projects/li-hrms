const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

// IN: 10:15 IST = 04:45 UTC (10:15 - 5:30)
// OUT: 14:30 IST = 09:00 UTC (14:30 - 5:30)
// Total: 4h 15m worked
// Goal: Show first half receives overflow from second half to meet 3h45m minimum

const logs = [
  // June 13, 2026
  {
    employeeId: '2146',
    timestamp: '2026-06-13T04:45:00Z',  // 10:15 IST - IN punch
    logType: 'CHECK-IN',
    deviceId: 'DEVICE-001',
    deviceName: 'Biometric Device Main',
    rawStatus: null,
    source: 'biometric-realtime'
  },
  {
    employeeId: '2146',
    timestamp: '2026-06-13T09:00:00Z',  // 14:30 IST - OUT punch
    logType: 'CHECK-OUT',
    deviceId: 'DEVICE-001',
    deviceName: 'Biometric Device Main',
    rawStatus: null,
    source: 'biometric-realtime'
  },
  // June 14, 2026
  {
    employeeId: '2146',
    timestamp: '2026-06-14T04:45:00Z',  // 10:15 IST - IN punch
    logType: 'CHECK-IN',
    deviceId: 'DEVICE-001',
    deviceName: 'Biometric Device Main',
    rawStatus: null,
    source: 'biometric-realtime'
  },
  {
    employeeId: '2146',
    timestamp: '2026-06-14T09:00:00Z',  // 14:30 IST - OUT punch
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
    console.log('🔄 Syncing attendance logs for Employee 2146 (June 13-14)...\n');
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
    
    console.log('\n✨ Logs synced! Run retrieve_june13-14.js to see results');
  } catch (err) {
    console.error('Error:', err.message);
    process.exit(1);
  }
})();
