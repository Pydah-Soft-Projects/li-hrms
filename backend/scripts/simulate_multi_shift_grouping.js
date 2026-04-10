/**
 * Simulate one employee-day in multi_shift mode and restore settings.
 *
 * Usage:
 *   node scripts/simulate_multi_shift_grouping.js <EMP_NO> <YYYY-MM-DD>
 */

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const mongoose = require('mongoose');
const AttendanceSettings = require('../attendance/model/AttendanceSettings');
const AttendanceRawLog = require('../attendance/model/AttendanceRawLog');
const { processMultiShiftAttendance } = require('../attendance/services/multiShiftProcessingService');

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/hrms';

async function main() {
  const empNo = process.argv[2];
  const date = process.argv[3];
  if (!empNo || !date) {
    console.error('Usage: node scripts/simulate_multi_shift_grouping.js <EMP_NO> <YYYY-MM-DD>');
    process.exit(1);
  }

  await mongoose.connect(MONGODB_URI, { serverSelectionTimeoutMS: 10000 });
  const settings = await AttendanceSettings.getSettings();
  const prevMode = settings?.processingMode?.mode || 'multi_shift';
  const prevStrict = settings?.processingMode?.strictCheckInOutOnly;

  settings.processingMode = settings.processingMode || {};
  settings.processingMode.mode = 'multi_shift';
  await settings.save();

  try {
    const start = new Date(`${date}T00:00:00+05:30`);
    const end = new Date(`${date}T23:59:59+05:30`);
    const logs = await AttendanceRawLog.find({
      employeeNumber: String(empNo).toUpperCase(),
      timestamp: { $gte: start, $lte: end },
    }).sort({ timestamp: 1 }).lean();

    console.log(`[Simulation] employee=${empNo}, date=${date}, logs=${logs.length}`);
    const result = await processMultiShiftAttendance(String(empNo).toUpperCase(), date, logs, {});
    console.log('[Simulation] success=', result.success);
    console.log('[Simulation] shiftsProcessed=', result.shiftsProcessed || 0);
    console.log('[Simulation] totalHours=', result.totalHours || 0);
    console.log('[Simulation] totalOT=', result.totalOT || 0);
    if (!result.success) {
      console.log('[Simulation] error=', result.error || 'unknown');
    }
  } finally {
    settings.processingMode.mode = prevMode;
    settings.processingMode.strictCheckInOutOnly = prevStrict;
    await settings.save();
    await mongoose.disconnect();
  }
}

main().catch(async (err) => {
  console.error('Simulation failed:', err.message);
  try {
    await mongoose.disconnect();
  } catch (_) {}
  process.exit(1);
});

// Some background listeners (redis/job clients from hooks) may keep event loop alive.
// Force close once script work is done.
process.on('beforeExit', () => {
  process.exit(0);
});

