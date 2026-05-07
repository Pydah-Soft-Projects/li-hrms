const { reprocessAttendanceForEmployeeDate } = require('./attendance/services/attendanceSyncService');

async function testReprocess() {
  const employeeNumber = 'YOUR_EMPLOYEE_NUMBER'; // Replace with actual
  const date = '2026-05-07'; // Replace with date where late occurred
  try {
    await reprocessAttendanceForEmployeeDate(employeeNumber, date);
    console.log('Reprocessed successfully');
  } catch (error) {
    console.error('Error:', error.message);
  }
}

testReprocess();