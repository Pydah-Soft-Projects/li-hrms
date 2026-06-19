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
    // Delete existing record first
    const mongoose = require('mongoose');
    const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/hrms-leave-5';
    await mongoose.connect(mongoUri);
    
    const AttendanceDaily = require('../attendance/model/AttendanceDaily');
    await AttendanceDaily.deleteOne({
      employeeId: '2146',
      date: new Date('2026-06-17')
    });
    
    await mongoose.disconnect();
    
    console.log('✅ Deleted old record');
    console.log('🔄 Syncing attendance logs...\n');
    
    const syncResponse = await fetch('http://localhost:5000/api/internal/attendance/sync', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-system-key': SYSTEM_KEY
      },
      body: JSON.stringify(logs)
    });
    const syncResult = await syncResponse.json();
    console.log('✅ Sync Result:', syncResult);

  } catch (err) {
    console.error('❌ Error:', err.message);
  }
})();
