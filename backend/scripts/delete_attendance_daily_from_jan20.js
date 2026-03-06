/**
 * ============================================================
 * DELETE ATTENDANCE DAILY FROM JAN 20 TO TILL DATE
 * ============================================================
 * Removes AttendanceDaily records from 2026-01-10 up to today
 * (inclusive). Also deletes MonthlyAttendanceSummary records for
 * every pay-cycle month that overlaps this date range (e.g. 26th–25th:
 * Jan and Feb pay cycles so summaries are recalculated after re-sync).
 *
 * Run this BEFORE re-syncing biometric logs for that range so
 * dailies and monthly summaries are recreated from the sync.
 *
 * Usage (from backend folder):
 *   node scripts/delete_attendance_daily_from_jan20.js
 * ============================================================
 */

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });
const mongoose = require('mongoose');
const AttendanceDaily = require('../attendance/model/AttendanceDaily');
const MonthlyAttendanceSummary = require('../attendance/model/MonthlyAttendanceSummary');
const { getPayrollDateRange } = require('../shared/utils/dateUtils');

// Date range: Jan 10, 2026 — today (YYYY-MM-DD)
const START_DATE = '2026-01-10';

function getTodayStr() {
  const d = new Date();
  return (
    d.getFullYear() +
    '-' +
    String(d.getMonth() + 1).padStart(2, '0') +
    '-' +
    String(d.getDate()).padStart(2, '0')
  );
}

/**
 * True if two date ranges [aStart, aEnd] and [bStart, bEnd] (YYYY-MM-DD) overlap.
 */
function rangesOverlap(aStart, aEnd, bStart, bEnd) {
  return aStart <= bEnd && bStart <= aEnd;
}

/**
 * Get pay-cycle months (YYYY-MM) whose cycle overlaps [rangeStart, rangeEnd].
 * Uses payroll_cycle_start_day / payroll_cycle_end_day from Settings (e.g. 26–25).
 */
async function getPayCycleMonthsOverlappingRange(rangeStart, rangeEnd) {
  const [startY, startM] = rangeStart.split('-').map(Number);
  const [endY, endM] = rangeEnd.split('-').map(Number);
  const months = [];

  for (let y = startY; y <= endY; y++) {
    const mStart = y === startY ? startM : 1;
    const mEnd = y === endY ? endM : 12;
    for (let m = mStart; m <= mEnd; m++) {
      const { startDate, endDate } = await getPayrollDateRange(y, m);
      if (rangesOverlap(rangeStart, rangeEnd, startDate, endDate)) {
        months.push(`${y}-${String(m).padStart(2, '0')}`);
      }
    }
  }

  return months;
}

async function main() {
  const endDate = getTodayStr();
  console.log('\n🗑️ Delete AttendanceDaily and overlapping MonthlyAttendanceSummary\n');
  console.log(`   Daily range: ${START_DATE} to ${endDate} (inclusive)\n`);

  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ Connected to MongoDB\n');

    // 1. Delete AttendanceDaily in range
    const dailyFilter = { date: { $gte: START_DATE, $lte: endDate } };
    const dailyCount = await AttendanceDaily.countDocuments(dailyFilter);
    console.log(`   Found ${dailyCount} AttendanceDaily record(s) in range.`);

    if (dailyCount > 0) {
      const dailyResult = await AttendanceDaily.deleteMany(dailyFilter);
      console.log(`   ✅ Deleted ${dailyResult.deletedCount} AttendanceDaily record(s).\n`);
    } else {
      console.log('   No AttendanceDaily to delete.\n');
    }

    // 2. Pay-cycle months overlapping the range (e.g. 26th–25th → Jan & Feb)
    const payCycleMonths = await getPayCycleMonthsOverlappingRange(START_DATE, endDate);
    console.log(`   Pay-cycle months overlapping range: ${payCycleMonths.join(', ')}`);

    if (payCycleMonths.length === 0) {
      console.log('   No monthly summary months to delete.\n');
    } else {
      const summaryFilter = { month: { $in: payCycleMonths } };
      const summaryCount = await MonthlyAttendanceSummary.countDocuments(summaryFilter);
      console.log(`   Found ${summaryCount} MonthlyAttendanceSummary record(s) for those months.`);

      if (summaryCount > 0) {
        const summaryResult = await MonthlyAttendanceSummary.deleteMany(summaryFilter);
        console.log(`   ✅ Deleted ${summaryResult.deletedCount} MonthlyAttendanceSummary record(s).\n`);
      } else {
        console.log('   No MonthlyAttendanceSummary to delete.\n');
      }
    }

    console.log('   You can now run the biometric sync for this range to recreate dailies and summaries.');
  } catch (err) {
    console.error('❌ Error:', err.message);
    process.exit(1);
  } finally {
    await mongoose.disconnect();
    console.log('🔌 Disconnected.\n');
  }
}

main();
