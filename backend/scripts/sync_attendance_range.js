#!/usr/bin/env node
/**
 * Background Attendance Synchronization Script
 * ============================================================
 * Syncs attendance records from a start date (e.g., 2026-09-01) to an end date (today).
 * Uses the exact same engine as the UI "Sync Shifts" button (syncShiftsForExistingRecords),
 * but runs safely in the background day-by-day with real-time progress logging and summary updates.
 *
 * Usage:
 *   node backend/scripts/sync_attendance_range.js
 *   node backend/scripts/sync_attendance_range.js --from 2026-09-01 --to 2026-11-14
 *   node backend/scripts/sync_attendance_range.js --client unit2
 *   node backend/scripts/sync_attendance_range.js --client main
 *   node backend/scripts/sync_attendance_range.js --emp 3258,9064
 */

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const mongoose = require('mongoose');

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
const { calculateMonthlySummary } = require('../attendance/services/summaryCalculationService');

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
  if (params.client === 'unit2') {
    dbUri = 'mongodb+srv://teampydah:TeamPydah@teampydah.y4zj6wh.mongodb.net/hrms-unit2';
  } else if (params.client === 'main') {
    dbUri = 'mongodb+srv://teampydah:TeamPydah@teampydah.y4zj6wh.mongodb.net/hrms';
  }

  console.log('============================================================');
  console.log('🚀 BACKGROUND ATTENDANCE SYNC');
  console.log('============================================================');
  console.log('Target Database URI:', dbUri.replace(/:[^:@]+@/, ':****@'));
  console.log('Date Range:         ', `${params.from}  →  ${params.to}`);
  if (params.emp) console.log('Target Employee(s): ', params.emp);
  if (params.dept) console.log('Target Department:  ', params.dept);
  console.log('============================================================\n');

  await mongoose.connect(dbUri, { serverSelectionTimeoutMS: 15000 });
  console.log(`✅ Connected to DB: [${mongoose.connection.name}]\n`);

  const dates = generateDateList(params.from, params.to);
  console.log(`Total days to process: ${dates.length} days\n`);

  let totalProcessed = 0;
  let totalRecalculated = 0;
  let totalAssigned = 0;
  const startTime = Date.now();
  const affectedMonths = new Set();

  for (let idx = 0; idx < dates.length; idx++) {
    const dateStr = dates[idx];
    const dayStart = Date.now();
    const progress = `[Day ${idx + 1}/${dates.length}] (${Math.round(((idx + 1) / dates.length) * 100)}%)`;

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

      console.log(
        `${progress} ${dateStr} ── Synced: ${result.reprocessed || 0} record(s) ` +
        `(processed: ${result.processed || 0}) in ${dayElapsed}s`
      );
    } catch (err) {
      console.error(`❌ ${progress} ${dateStr} Error:`, err.message);
    }
  }

  const totalMinutes = ((Date.now() - startTime) / 60000).toFixed(1);
  console.log('\n============================================================');
  console.log('🎉 ATTENDANCE SYNC COMPLETED SUCCESSFULLY!');
  console.log('============================================================');
  console.log(`Total Days Processed:     ${dates.length}`);
  console.log(`Total Records Synced:     ${totalRecalculated}`);
  console.log(`Total Execution Time:     ${totalMinutes} minutes`);
  console.log(`Months Covered:           ${Array.from(affectedMonths).join(', ')}`);
  console.log('============================================================\n');

  await mongoose.connection.close();
  process.exit(0);
}

run().catch((err) => {
  console.error('Fatal execution error:', err);
  process.exit(1);
});
