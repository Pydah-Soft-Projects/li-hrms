const mongoose = require('mongoose');
const path = require('path');

// Load environment variables
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const MONGODB_URI = process.env.MONGODB_URI;
const MONGODB_BIOMETRIC_URI = process.env.MONGODB_BIOMETRIC_URI || 'mongodb://localhost:27017/biometric_logs';

async function main() {
  console.log('HRMS MongoDB URI:', MONGODB_URI);
  console.log('Biometric MongoDB URI:', MONGODB_BIOMETRIC_URI);

  // 1. Connect to HRMS DB
  console.log('\nConnecting to HRMS MongoDB...');
  const hrmsConn = await mongoose.connect(MONGODB_URI);
  console.log('Connected.');

  const AttendanceRawLog = require('../attendance/model/AttendanceRawLog');
  const Employee = require('../employees/model/Employee');

  const hrmsRawCount = await AttendanceRawLog.countDocuments({
    date: '2026-07-25'
  });
  console.log(`HRMS AttendanceRawLog count for 2026-07-25: ${hrmsRawCount}`);

  if (hrmsRawCount > 0) {
    const samples = await AttendanceRawLog.find({ date: '2026-07-25' }).limit(5).lean();
    console.log('Samples of AttendanceRawLog for 2026-07-25:', JSON.stringify(samples, null, 2));
  }

  // Find all employees
  const totalEmployees = await Employee.countDocuments({ is_active: true });
  console.log(`Total active employees in HRMS: ${totalEmployees}`);

  await mongoose.disconnect();

  // 2. Connect to Biometric DB
  console.log('\nConnecting to Biometric MongoDB...');
  const bioConn = mongoose.createConnection(MONGODB_BIOMETRIC_URI);
  await bioConn.asPromise();
  console.log('Connected.');

  // Check models
  const attendanceLogSchema = new mongoose.Schema({
    employeeId: String,
    timestamp: Date,
    logType: String,
    rawType: Number,
    deviceId: String,
    deviceName: String,
  }, { strict: false, collection: 'attendancelogs' });

  const AttendanceLog = bioConn.model('AttendanceLog', attendanceLogSchema);

  const start = new Date('2026-07-25T00:00:00.000Z');
  const end = new Date('2026-07-25T23:59:59.999Z');

  const bioLogCount = await AttendanceLog.countDocuments({
    timestamp: { $gte: start, $lte: end }
  });
  console.log(`Biometric AttendanceLog count for 2026-07-25 (UTC): ${bioLogCount}`);

  if (bioLogCount > 0) {
    const samples = await AttendanceLog.find({
      timestamp: { $gte: start, $lte: end }
    }).limit(5).lean();
    console.log('Samples of Biometric AttendanceLog for 2026-07-25:', JSON.stringify(samples, null, 2));
  }

  await bioConn.close();
}

main().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
