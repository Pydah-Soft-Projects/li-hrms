#!/usr/bin/env node
/**
 * Background Attendance Synchronization Script (High-Performance Silent Mode)
 * ===========================================================================
 * Syncs attendance records day-by-day in strict chronological order.
 * Suppresses internal service debug logs to run at maximum speed without
 * cluttering the terminal.
 *
 * Usage:
 *   node backend/scripts/sync_attendance_range.js
 *   node backend/scripts/sync_attendance_range.js --client unit2
 *   node backend/scripts/sync_attendance_range.js --client main
 *   node backend/scripts/sync_attendance_range.js --from 2026-09-01 --to 2026-11-14
 *   node backend/scripts/sync_attendance_range.js --emp 3258,9064
 */

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const mongoose = require('mongoose');

// Preserve original console functions for clean progress reporting
const realLog = console.log.bind(console);
const realWarn = console.warn.bind(console);
const realError = console.error.bind(console);

// Silence internal service chatter ([Deduction], cache, candidate shifts, etc.)
function silenceInternalLogs() {
  console.log = function (...args) {
    // Drop noisy internal logs
  };
  console.info = function (...args) {};
  console.debug = function (...args) {};
  console.warn = function (...args) {
    const msg = args[0] ? String(args[0]) : '';
    if (msg.includes('[Deduction]') || msg.includes('MonthlyAttendanceSummary')) return;
    realWarn(...args);
  };
}

// Ensure models are registered
require('../departments/model/Division');
require('../departments/model/Department');
require('../departments/model/Designation');
require('../employees/model/EmployeeGroup');
require('../employees/model/Employee');
require('../attendance/model/AttendanceDaily');
require('../attendance/model/AttendanceRawLog');
require('../attendance/model/MonthlyAttendanceSummary');

const { syncShiftsForExistingRecords } = require('../shifts/services/shiftDetectionService');

function parseArgs() {
  const args = process.argv.slice(2);
  const params = {
    from: '2026-09-01',
    to: new Date().toISOString().slice(0, 10),
    client: null,
    emp: null,
    dept: null,
    div: null,
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--from' && args[i + 1]) {
      params.from = args[++i];
    } else if (arg === '--to' && args[i + 1]) {
      params.to = args[++i];
    } else if (arg === '--client' && args[i + 1]) {
      params.client = args[++i].toLowerCase();
    } else if (arg === '--emp' && args[i + 1]) {
      params.emp = args[++i];
    } else if (arg === '--dept' && args[i + 1]) {
      params.dept = args[++i];
    } else if (arg === '--div' && args[i + 1]) {
      params.div = args[++i];
    }
  }
  return params;
}

function generateDateList(startDateStr, endDateStr) {
  const dates = [];
  let curr = new Date(startDateStr + 'T12:00:00+05:30');
  const end = new Date(endDateStr + 'T12:00:00+05:30');

  while (curr <= end) {
    const y = curr.getFullYear();
    const m = String(curr.getMonth() + 1).padStart(2, '0');
    const d = String(curr.getDate()).padStart(2, '0');
    dates.push(`${y}-${m}-${d}`);
    curr.setDate(curr.getDate() + 1);
  }
  return dates;
}

async function run() {
  const params = parseArgs();

  // Resolve DB URI
  let dbUri = process.env.MONGODB_URI;
  let clientLabel = 'Default (.env)';
  if (params.client === 'unit2') {
    dbUri = 'mongodb+srv://teampydah:TeamPydah@teampydah.y4zj6wh.mongodb.net/hrms-unit2';
    clientLabel = 'Client 2 (Unit-2)';
  } else if (params.client === 'main') {
    dbUri = 'mongodb+srv://teampydah:TeamPydah@teampydah.y4zj6wh.mongodb.net/hrms';
    clientLabel = 'Client 1 (Main Campus)';
  }

  realLog('================================================================');
  realLog('🚀 BACKGROUND ATTENDANCE SYNCHRONIZATION');
  realLog('================================================================');
  realLog(`Target Database:    ${clientLabel}`);
  realLog(`URI Endpoint:       ${dbUri.replace(/:[^:@]+@/, ':****@')}`);
  realLog(`Date Range:         ${params.from}  →  ${params.to}`);
  if (params.emp) realLog(`Target Employee(s): ${params.emp}`);
  if (params.dept) realLog(`Target Department:  ${params.dept}`);
  realLog('Execution Mode:     Fast Silent Mode (Ordered Day-by-Day)');
  realLog('================================================================\n');

  await mongoose.connect(dbUri, { serverSelectionTimeoutMS: 15000 });
  realLog(`✅ Connected to DB: [${mongoose.connection.name}]\n`);

  const dates = generateDateList(params.from, params.to);
  realLog(`Total Days in Queue: ${dates.length} days (Sequential Processing)\n`);

  // Activate log silencing before heavy processing
  silenceInternalLogs();

  let totalProcessed = 0;
  let totalRecalculated = 0;
  let totalAssigned = 0;
  const startTime = Date.now();
  const affectedMonths = new Set();

  for (let idx = 0; idx < dates.length; idx++) {
    const dateStr = dates[idx];
    const dayStart = Date.now();
    const progress = `[Day ${String(idx + 1).padStart(2, '0')}/${dates.length}] (${Math.round(((idx + 1) / dates.length) * 100)}%)`;

    affectedMonths.add(dateStr.slice(0, 7));

    try {
      const syncOpts = {
        startDate: dateStr,
        endDate: dateStr,
        employeeNumber: params.emp || undefined,
        departmentId: params.dept || undefined,
        divisionId: params.div || undefined,
      };

      const result = await syncShiftsForExistingRecords(syncOpts);
      const dayElapsed = ((Date.now() - dayStart) / 1000).toFixed(1);

      totalProcessed += result.processed || 0;
      totalRecalculated += result.reprocessed || 0;
      totalAssigned += result.assigned || 0;

      const totalElapsedSec = (Date.now() - startTime) / 1000;
      const avgSecPerDay = totalElapsedSec / (idx + 1);
      const remainingDays = dates.length - (idx + 1);
      const remainingMin = ((remainingDays * avgSecPerDay) / 60).toFixed(1);

      realLog(
        `${progress} ${dateStr} ── Synced: ${result.reprocessed || 0} recs ` +
        `in ${dayElapsed}s | Remaining: ~${remainingMin}m`
      );
    } catch (err) {
      realError(`❌ ${progress} ${dateStr} Error:`, err.message);
    }
  }

  const totalMinutes = ((Date.now() - startTime) / 60000).toFixed(1);
  realLog('\n================================================================');
  realLog('🎉 ATTENDANCE SYNC COMPLETED SUCCESSFULLY!');
  realLog('================================================================');
  realLog(`Total Days Processed:     ${dates.length}`);
  realLog(`Total Records Synced:     ${totalRecalculated}`);
  realLog(`Total Execution Time:     ${totalMinutes} minutes`);
  realLog(`Months Covered:           ${Array.from(affectedMonths).join(', ')}`);
  realLog('================================================================\n');

  await mongoose.connection.close();
  process.exit(0);
}

run().catch((err) => {
  realError('Fatal execution error:', err);
  process.exit(1);
});
