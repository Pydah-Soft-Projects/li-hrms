/**
 * Leave–attendance reconciliation + monthly summary for a fixed list of emp numbers,
 * over the payroll month window for MONTH (IST anchor: 15th of calendar month), same as 931 / bulk scripts.
 *
 *   node scripts/reconcile_employees_list_month.js
 *   MONTH=2026-03 EMP_LIST=119,71,108 node scripts/reconcile_employees_list_month.js
 *   node scripts/reconcile_employees_list_month.js --dry-run
 *
 * Does not set SKIP_LEAVE_ATTENDANCE_RECONCILIATION. Dates are YYYY-MM-DD in Asia/Kolkata (same as AttendanceDaily.date).
 */

require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
const mongoose = require('mongoose');
const { createISTDate, extractISTComponents, getAllDatesInRange } = require('../shared/utils/dateUtils');
const dateCycleService = require('../leaves/services/dateCycleService');
const AttendanceDaily = require('../attendance/model/AttendanceDaily');
const { recalculateOnAttendanceUpdate } = require('../attendance/services/summaryCalculationService');

const DEFAULT_EMP_LIST = [
  '119',
  '5012',
  '71',
  '2283',
  '2068',
  '108',
  '1847',
  '2049',
  '630',
  '2034',
  '2119',
  '2083',
  '2150',
].join(',');

function parseArgs() {
  const a = process.argv.slice(2);
  return { dryRun: a.includes('--dry-run') };
}

function normEmp(e) {
  return String(e || '')
    .trim()
    .toUpperCase();
}

async function main() {
  const { dryRun } = parseArgs();
  if (!process.env.MONGODB_URI) {
    console.error('MONGODB_URI not set');
    process.exit(1);
  }

  const monthStr = process.env.MONTH || '2026-03';
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(monthStr)) {
    console.error('Set MONTH=YYYY-MM');
    process.exit(1);
  }
  const [year, monthNumber] = monthStr.split('-').map(Number);
  const empListRaw = process.env.EMP_LIST || DEFAULT_EMP_LIST;
  const emps = empListRaw
    .split(/[,;]\s*|\s+/)
    .map(normEmp)
    .filter(Boolean);

  await mongoose.connect(process.env.MONGODB_URI);
  delete process.env.SKIP_LEAVE_ATTENDANCE_RECONCILIATION;

  const periodInfo = await dateCycleService.getPeriodInfo(
    createISTDate(`${year}-${String(monthNumber).padStart(2, '0')}-15`)
  );
  const startDateStr = extractISTComponents(periodInfo.payrollCycle.startDate).dateStr;
  const endDateStr = extractISTComponents(periodInfo.payrollCycle.endDate).dateStr;
  const inPeriod = new Set(getAllDatesInRange(startDateStr, endDateStr));

  console.log('MONTH (calendar) → payroll window (IST dates):', monthStr, '→', startDateStr, '..', endDateStr);
  console.log('Days in period:', inPeriod.size, '| Employees:', emps.length, emps.join(', '));
  if (dryRun) {
    const q = {
      employeeNumber: { $in: emps },
      date: { $gte: startDateStr, $lte: endDateStr },
    };
    const n = await AttendanceDaily.countDocuments(q);
    console.log('Dry run: would process', n, 'AttendanceDaily rows (existing dailies only).');
    await mongoose.disconnect();
    return;
  }

  const q = {
    employeeNumber: { $in: emps },
    date: { $gte: startDateStr, $lte: endDateStr },
  };
  const rows = await AttendanceDaily.find(q).select('employeeNumber date').sort({ employeeNumber: 1, date: 1 }).lean();
  const total = rows.length;
  console.log('AttendanceDaily rows to process:', total, '\n');

  const orig = console.log;
  let done = 0;
  let reconLogDays = 0;
  for (const row of rows) {
    const emp = normEmp(row.employeeNumber);
    const date = row.date;
    const lines = [];
    console.log = (...args) => {
      lines.push(args.map(String).join(' '));
    };
    try {
      await recalculateOnAttendanceUpdate(emp, date);
    } catch (e) {
      orig('Error', emp, date, e.message || e);
    }
    console.log = orig;
    if (lines.some((l) => l.includes('[leaveAttendanceReconciliation]') && l.includes('results:'))) {
      reconLogDays += 1;
    }
    done += 1;
    if (done % 50 === 0 || done === total) {
      orig('Progress', done, '/', total, '| recon log days ~', reconLogDays);
    }
  }

  orig('Done. recalculateOnAttendanceUpdate:', done, '| days with [leaveAttendanceReconciliation] (approx):', reconLogDays);
  await mongoose.disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
