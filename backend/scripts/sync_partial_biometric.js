const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const mongoose = require('mongoose');

const TARGET_DATE = '2026-07-25';

// Atlas schema (read-only) - matches biometric AttendanceLog
const attendanceLogSchema = new mongoose.Schema({
  employeeId: String,
  timestamp: Date,
  logType: String,
  rawType: Number,
  deviceId: String,
  deviceName: String,
}, { strict: false, collection: 'attendancelogs' });

function formatDate(d) {
  const date = d instanceof Date ? d : new Date(d);
  return date.toISOString().slice(0, 10);
}

function formatTime(d) {
  if (!d) return 'N/A';
  const date = new Date(d);
  // Format as IST time
  return date.toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit', hour12: false });
}

function mapLogType(logType) {
  if (!logType) return null;
  const u = String(logType).toUpperCase();
  if (u === 'CHECK-IN') return 'IN';
  if (u === 'CHECK-OUT') return 'OUT';
  return null;
}

// Mask username and password in connection string for safe logs
function maskUri(uri) {
  if (!uri) return 'undefined';
  return uri.replace(/:[^:@]+@/, ':****@');
}

async function run() {
  const args = process.argv.slice(2);
  const bioSourceArg = args.find(a => a.startsWith('--biometric-source='));
  
  let ATLAS_URI = bioSourceArg ? bioSourceArg.split('=')[1] : null;
  if (!ATLAS_URI) {
    if (process.env.MONGODB_ATLAS_BIOMETRIC_URI) {
      ATLAS_URI = process.env.MONGODB_ATLAS_BIOMETRIC_URI;
    } else if (process.env.MONGODB_BIOMETRIC_URI && process.env.MONGODB_BIOMETRIC_URI.startsWith('mongodb+srv://')) {
      ATLAS_URI = process.env.MONGODB_BIOMETRIC_URI;
    } else {
      ATLAS_URI = 'mongodb+srv://teampydah:TeamPydah@teampydah.y4zj6wh.mongodb.net/biometric_logs';
    }
  }

  const LOCAL_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/hrms';

  console.log('==================================================');
  console.log('    SYNC BIOMETRIC LOGS FOR PARTIAL EMPLOYEES     ');
  console.log('==================================================');
  console.log(`Local DB:    ${maskUri(LOCAL_URI)}`);
  console.log(`Atlas DB:    ${maskUri(ATLAS_URI)}`);
  console.log(`Target Date: ${TARGET_DATE}`);
  console.log('==================================================\n');

  // 1. Connect to Local DB
  console.log('Connecting to Local DB...');
  await mongoose.connect(LOCAL_URI);
  console.log('✅ Connected to Local DB.');

  const AttendanceDaily = require('../attendance/model/AttendanceDaily');
  const AttendanceRawLog = require('../attendance/model/AttendanceRawLog');
  const { reprocessAttendanceForEmployeeDate } = require('../attendance/services/attendanceSyncService');

  // 2. Find employees with PARTIAL attendance on TARGET_DATE
  console.log(`\nSearching for employees with status: "PARTIAL" on ${TARGET_DATE}...`);
  const partialRecords = await AttendanceDaily.find({
    date: TARGET_DATE,
    status: 'PARTIAL',
  }).select('employeeNumber status totalWorkingHours shifts').lean();

  console.log(`Found ${partialRecords.length} employee(s) with PARTIAL status.`);

  if (partialRecords.length === 0) {
    console.log('No partial attendance records found. Exiting.');
    await mongoose.disconnect();
    return;
  }

  const empNos = partialRecords.map(r => r.employeeNumber);
  console.log('Employees to process:', empNos.join(', '));

  // 3. Connect to Atlas Biometric DB
  console.log('\nConnecting to Atlas Biometric DB...');
  const atlasConn = mongoose.createConnection(ATLAS_URI, {
    readPreference: 'primary',
  });
  await atlasConn.asPromise();
  console.log('✅ Connected to Atlas Biometric DB.');

  const AtlasAttendanceLog = atlasConn.model('AttendanceLog', attendanceLogSchema);

  // Time window for TARGET_DATE (allowing +/- 1 day to cover timezone offsets / overnight shifts)
  const targetDateObj = new Date(TARGET_DATE);
  const minDate = new Date(targetDateObj);
  minDate.setDate(minDate.getDate() - 1);
  const maxDate = new Date(targetDateObj);
  maxDate.setDate(maxDate.getDate() + 1);

  const windowStart = new Date(`${formatDate(minDate)}T00:00:00.000Z`);
  const windowEnd = new Date(`${formatDate(maxDate)}T23:59:59.999Z`);

  console.log(`Biometric log fetch window: ${windowStart.toISOString()} — ${windowEnd.toISOString()}`);

  let totalSynced = 0;

  for (const empNo of empNos) {
    const originalRecord = partialRecords.find(r => r.employeeNumber === empNo);
    console.log(`\n──────────────────────────────────────────────────`);
    console.log(`Processing Employee: ${empNo}`);
    console.log(`──────────────────────────────────────────────────`);
    console.log(`  Original Status: ${originalRecord.status} (${originalRecord.totalWorkingHours || 0}h)`);
    if (originalRecord.shifts) {
      originalRecord.shifts.forEach((s) => {
        console.log(`    - Shift ${s.shiftNumber}: IN=${formatTime(s.inTime)}, OUT=${formatTime(s.outTime)} status=${s.status}`);
      });
    }

    // 4. Fetch logs from Atlas for this employee
    console.log(`\n  Fetching raw logs from Atlas...`);
    const atlasLogs = await AtlasAttendanceLog.find({
      employeeId: empNo,
      timestamp: { $gte: windowStart, $lte: windowEnd },
    }).sort({ timestamp: 1 }).lean();

    console.log(`  Found ${atlasLogs.length} logs in Atlas.`);

    if (atlasLogs.length === 0) {
      console.log(`  ⚠️ No biometric logs found in Atlas for ${empNo} in this window.`);
      continue;
    }

    // Log the fetched logs
    console.log(`  Punches in Atlas:`);
    atlasLogs.forEach(log => {
      console.log(`    ➔ [${log.logType}] at ${new Date(log.timestamp).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })} (Device: ${log.deviceName || 'N/A'})`);
    });

    // 5. Insert/upsert into local DB
    console.log(`\n  Syncing punches to local AttendanceRawLog...`);
    const ops = atlasLogs.map(log => {
      const type = mapLogType(log.logType);
      const employeeNumber = String(log.employeeId).toUpperCase().trim();
      const timestamp = new Date(log.timestamp);
      const source = 'biometric-realtime';

      const mapped = {
        employeeNumber,
        timestamp,
        type,
        punch_state: type === 'IN' ? 0 : type === 'OUT' ? 1 : null,
        source,
        date: formatDate(log.timestamp),
        deviceId: log.deviceId || null,
        deviceName: log.deviceName || null,
      };

      return {
        replaceOne: {
          filter: { employeeNumber, timestamp, source },
          replacement: mapped,
          upsert: true,
        }
      };
    });

    const writeRes = await AttendanceRawLog.bulkWrite(ops, { ordered: false });
    console.log(`  ✓ Synced. Matched: ${writeRes.matchedCount}, Upserted: ${writeRes.upsertedCount}, Modified: ${writeRes.modifiedCount}`);

    // 6. Reprocess attendance daily status
    console.log(`  Reprocessing daily attendance...`);
    const reprocessRes = await reprocessAttendanceForEmployeeDate(empNo, TARGET_DATE);
    
    if (reprocessRes && reprocessRes.success) {
      const updatedDaily = await AttendanceDaily.findOne({ employeeNumber: empNo, date: TARGET_DATE }).lean();
      console.log(`\n  🎉 Sync Results for ${empNo}:`);
      console.log(`    Status Transition:  ${originalRecord.status} ➔ ${updatedDaily?.status || 'UNKNOWN'}`);
      console.log(`    Total Working Hours: ${originalRecord.totalWorkingHours || 0}h ➔ ${updatedDaily?.totalWorkingHours || 0}h`);
      
      if (updatedDaily?.shifts) {
        console.log(`    Updated Shifts:`);
        updatedDaily.shifts.forEach((s) => {
          console.log(`      - Shift ${s.shiftNumber}: IN=${formatTime(s.inTime)}, OUT=${formatTime(s.outTime)} status=${s.status}`);
        });
      }
      totalSynced++;
    } else {
      console.error(`  ❌ Failed to reprocess attendance:`, reprocessRes?.error || reprocessRes?.reason);
    }
  }

  console.log(`\n==================================================`);
  console.log(`🎉 Process finished! Reprocessed ${totalSynced}/${empNos.length} employees.`);
  console.log(`==================================================`);

  // Wait for 5 seconds to let async hooks complete
  console.log('\nWaiting 5 seconds for async hooks and summaries to persist...');
  await new Promise(r => setTimeout(r, 5000));

  await atlasConn.close();
  await mongoose.disconnect();
  console.log('✅ Connections closed.');
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
