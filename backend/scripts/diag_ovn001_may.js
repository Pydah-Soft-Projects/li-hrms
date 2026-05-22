/**
 * One-off diagnostic: OVN001 + May 2026 dailies + raw log count.
 * Usage: node scripts/diag_ovn001_may.js
 */
require('dotenv').config();
const mongoose = require('mongoose');
const Employee = require('../employees/model/Employee');
const AttendanceDaily = require('../attendance/model/AttendanceDaily');
const AttendanceRawLog = require('../attendance/model/AttendanceRawLog');
const AttendanceSettings = require('../attendance/model/AttendanceSettings');

async function main() {
  const uri = process.env.MONGODB_URI || process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/li-hrms';
  await mongoose.connect(uri);

  const emp = await Employee.findOne({ emp_no: /^OVN001$/i }).lean();
  console.log('EMP', emp ? { emp_no: emp.emp_no, name: `${emp.firstName || ''} ${emp.lastName || ''}`.trim(), dept: String(emp.department_id) } : null);

  const s = await AttendanceSettings.findOne().sort({ updatedAt: -1 }).lean().catch(() => null);
  console.log('ATT_SETTINGS_MODE', s?.processingMode?.mode || '(no doc)');

  const dailies = await AttendanceDaily.find({ employeeNumber: /^OVN001$/i, date: /^2026-05/ }).sort({ date: 1 }).lean();
  console.log('DAILIES_MAY_2026', dailies.length);
  for (const d of dailies) {
    console.log(d.date, d.status, 'payable', d.payableShifts, 'in', d.inTime, 'out', d.outTime, 'source', (d.source || []).join(','));
  }

  const logs = await AttendanceRawLog.find({
    employeeNumber: /^OVN001$/i,
    timestamp: { $gte: new Date('2026-05-01T00:00:00.000Z'), $lte: new Date('2026-05-31T23:59:59.999Z') },
  })
    .sort({ timestamp: 1 })
    .limit(40)
    .lean();
  console.log('RAW_LOGS_MAY_sample', logs.length);
  for (const l of logs) {
    console.log(String(l.timestamp), l.punchType || l.type || l.direction || '');
  }

  await mongoose.disconnect();
}

main().catch((e) => {
  console.error('ERR', e.message);
  process.exit(1);
});
