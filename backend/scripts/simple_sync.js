const logs = [
  {
    employeeId: '2146',
    timestamp: '2026-06-16T09:18:00+05:30',
    logType: 'CHECK-IN',
    source: 'biometric-realtime'
  },
  {
    employeeId: '2146',
    timestamp: '2026-06-16T13:41:00+05:30',
    logType: 'CHECK-OUT',
    source: 'biometric-realtime'
  }
];

(async () => {
  try {
    const response = await fetch('http://localhost:5000/api/internal/attendance/sync', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-system-key': process.env.HRMS_MICROSERVICE_SECRET_KEY || 'hrms-secret-key-2024-abc123xyz789'
      },
      body: JSON.stringify(logs)
    });
    const result = await response.json();
    console.log('Result:', result);
  } catch (err) {
    console.error('Error:', err);
  }
})();
