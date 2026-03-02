/**
 * ============================================================
 * SYNC ATLAS BIOMETRIC LOGS → LOCAL ATTENDANCE DAILY
 * ============================================================
 *
 * READ-ONLY on Atlas. Writes only to LOCAL.
 *
 * Flow:
 *   1. Connect to Atlas (MONGODB_ATLAS_BIOMETRIC_URI) - read biometric logs
 *   2. Connect to local (MONGODB_URI) - employees, shifts, roster, AttendanceDaily
 *   3. Fetch logs from Atlas for date range (20–25 Feb)
 *   4. For each employee+date: process via processMultiShiftAttendance
 *   5. Write AttendanceDaily to LOCAL only (shifts/roster from local)
 *
 * Usage:
 *   node scripts/sync_atlas_biometric_to_attendance.js
 *
 * Env:
 *   MONGODB_URI                    - Local DB (employees, shifts, AttendanceDaily)
 *   MONGODB_ATLAS_BIOMETRIC_URI    - Atlas read-only (biometric logs)
 */

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const mongoose = require('mongoose');

const ATLAS_URI = process.env.MONGODB_ATLAS_BIOMETRIC_URI || 'mongodb+srv://teampydah:TeamPydah@teampydah.y4zj6wh.mongodb.net/biometric_logs';
const LOCAL_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/hrms';

// Date range: 20 Feb to 25 Feb (inclusive)
const START_DATE = process.env.SYNC_START_DATE || '2026-02-20';
const END_DATE = process.env.SYNC_END_DATE || '2026-02-25';

// Atlas schema (read-only) - same as biometric AttendanceLog
const attendanceLogSchema = new mongoose.Schema({
  employeeId: String,
  timestamp: Date,
  logType: String,
  rawType: Number,
  deviceId: String,
  deviceName: String,
}, { strict: false, collection: 'attendancelogs' });

function parseDateRange(startStr, endStr) {
  const start = new Date(startStr + 'T00:00:00.000Z');
  const end = new Date(endStr + 'T23:59:59.999Z');
  if (isNaN(start.getTime()) || isNaN(end.getTime())) {
    throw new Error(`Invalid date range: ${startStr} — ${endStr}`);
  }
  if (start > end) throw new Error('Start date must be before end date');
  return { start, end };
}

function formatDate(d) {
  const date = d instanceof Date ? d : new Date(d);
  return date.toISOString().slice(0, 10);
}

/**
 * Map logType to type for attendance (IN/OUT)
 */
function mapLogType(logType) {
  if (!logType) return null;
  const u = String(logType).toUpperCase();
  if (u === 'CHECK-IN') return 'IN';
  if (u === 'CHECK-OUT') return 'OUT';
  return null;
}

async function main() {
  console.log('\n═══ SYNC ATLAS BIOMETRIC → LOCAL ATTENDANCE DAILY ═══\n');
  console.log('  Atlas (read-only):', ATLAS_URI.replace(/:[^:@]+@/, ':****@'));
  console.log('  Local (writes):   ', LOCAL_URI.replace(/:[^:@]+@/, ':****@') || 'mongodb://localhost:27017/hrms');
  console.log('  Date range:       ', START_DATE, '—', END_DATE);
  console.log('');

  const { start, end } = parseDateRange(START_DATE, END_DATE);

  // 1. Connect to LOCAL first (default connection for all models)
  console.log('Connecting to local MongoDB...');
  await mongoose.connect(LOCAL_URI, { serverSelectionTimeoutMS: 10000 });
  console.log('✅ Local connected.\n');

  // 2. Create separate connection to Atlas (read-only)
  console.log('Connecting to Atlas (read-only)...');
  const atlasConn = mongoose.createConnection(ATLAS_URI, {
    serverSelectionTimeoutMS: 15000,
    readPreference: 'primary',
  });
  await atlasConn.asPromise();
  console.log('✅ Atlas connected.\n');

  const AtlasAttendanceLog = atlasConn.model('AttendanceLog', attendanceLogSchema);

  const Employee = require('../employees/model/Employee');
  const Settings = require('../settings/model/Settings');
  const { processMultiShiftAttendance } = require('../attendance/services/multiShiftProcessingService');
  const AttendanceDaily = require('../attendance/model/AttendanceDaily');

  // 3. Fetch logs from Atlas for date range
  console.log('Fetching logs from Atlas...');
  const atlasLogs = await AtlasAttendanceLog.find({
    timestamp: { $gte: start, $lte: end },
  })
    .sort({ timestamp: 1 })
    .lean();

  console.log(`   Found ${atlasLogs.length} logs.\n`);

  if (atlasLogs.length === 0) {
    console.log('No logs to process. Exiting.');
    await atlasConn.close();
    await mongoose.disconnect();
    return;
  }

  // 4. Get valid local employees
  const empIds = [...new Set(atlasLogs.map(l => String(l.employeeId || '').toUpperCase().trim()).filter(Boolean))];
  const localEmployees = await Employee.find({ emp_no: { $in: empIds } }).select('emp_no').lean();
  const validEmpSet = new Set(localEmployees.map(e => e.emp_no));
  console.log(`   Employees in Atlas logs: ${empIds.length}`);
  console.log(`   Employees in local DB:  ${validEmpSet.size}`);
  const skippedEmp = empIds.filter(e => !validEmpSet.has(e));
  if (skippedEmp.length > 0) {
    console.log(`   Skipped (no local match): ${skippedEmp.slice(0, 10).join(', ')}${skippedEmp.length > 10 ? '...' : ''}`);
  }
  console.log('');

  // 5. Group logs by employee; for each date we need that date + next day (overnight OUT)
  const logsByEmp = {};
  for (const log of atlasLogs) {
    const empId = String(log.employeeId || '').toUpperCase().trim();
    if (!validEmpSet.has(empId)) continue;
    const d = formatDate(log.timestamp);
    if (d < START_DATE || d > END_DATE) continue;
    if (!logsByEmp[empId]) logsByEmp[empId] = [];
    logsByEmp[empId].push(log);
  }
  // Sort each employee's logs by timestamp
  for (const emp of Object.keys(logsByEmp)) {
    logsByEmp[emp].sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
  }

  // 6. Process each employee+date
  const generalConfig = (await Settings.getSettingsByCategory?.('general')) || {};
  let processed = 0;
  let errors = 0;

  const dates = [];
  for (let d = new Date(START_DATE); d <= new Date(END_DATE); d.setDate(d.getDate() + 1)) {
    dates.push(formatDate(d));
  }

  console.log('Processing attendance...\n');

  for (const empNo of Object.keys(logsByEmp)) {
    const allLogs = logsByEmp[empNo];
    const rawLogsAll = allLogs.map(log => {
      const type = mapLogType(log.logType);
      return {
        timestamp: log.timestamp,
        type,
        punch_state: type === 'IN' ? 0 : type === 'OUT' ? 1 : null,
        _id: log._id,
      };
    });

    for (const date of dates) {
      const hasPunchOnDate = allLogs.some(l => formatDate(l.timestamp) === date);
      if (!hasPunchOnDate) continue;

      try {
        const result = await processMultiShiftAttendance(empNo, date, rawLogsAll, generalConfig);
        if (result?.success) {
          processed++;
          const dr = result.dailyRecord;
          const shiftCount = dr?.shifts?.length ?? 0;
          const wh = dr?.totalWorkingHours ?? 0;
          process.stdout.write(`  ✓ ${empNo} ${date} — ${shiftCount} shift(s), ${wh}h\n`);
        }
      } catch (err) {
        errors++;
        console.error(`  ✗ ${empNo} ${date}: ${err.message}`);
      }
    }
  }

  console.log(`\n═══ DONE ═══`);
  console.log(`  Processed: ${processed} employee-days`);
  if (errors > 0) console.log(`  Errors:    ${errors}`);

  await atlasConn.close();
  await mongoose.disconnect();
  console.log('\nConnections closed.');
}

main().catch((err) => {
  console.error('Script failed:', err);
  process.exit(1);
});
