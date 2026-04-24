/**
 * For each AttendanceDaily in [from, to], call recalculateOnAttendanceUpdate(emp, date)
 * so leave–attendance reconciliation + monthly summary run (same as single-emp test, but all employees).
 *
 *   node scripts/reconcile_attendance_all_employees.js --from 2026-03-01 --to 2026-03-31
 *   node scripts/reconcile_attendance_all_employees.js --from 2026-03-01 --to 2026-03-31 --dry-run
 *   node scripts/reconcile_attendance_all_employees.js --from 2026-03-01 --to 2026-03-31 --limit 5000
 *
 * Does not set SKIP_LEAVE_ATTENDANCE_RECONCILIATION (reconciliation is active).
 */

require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
const mongoose = require('mongoose');
const AttendanceDaily = require('../attendance/model/AttendanceDaily');
const { recalculateOnAttendanceUpdate } = require('../attendance/services/summaryCalculationService');

function parseArgs() {
  const a = process.argv.slice(2);
  const o = { from: null, to: null, dryRun: false, limit: 0 };
  for (let i = 0; i < a.length; i += 1) {
    if (a[i] === '--from' && a[i + 1]) o.from = a[++i];
    else if (a[i] === '--to' && a[i + 1]) o.to = a[++i];
    else if (a[i] === '--dry-run') o.dryRun = true;
    else if (a[i] === '--limit' && a[i + 1]) o.limit = Math.max(0, parseInt(a[++i], 10) || 0);
  }
  if (!o.from || !o.to) {
    console.error('Usage: --from YYYY-MM-DD --to YYYY-MM-DD [--dry-run] [--limit N]');
    process.exit(1);
  }
  return o;
}

async function main() {
  const opts = parseArgs();
  await mongoose.connect(process.env.MONGODB_URI);
  delete process.env.SKIP_LEAVE_ATTENDANCE_RECONCILIATION;

  const q = { date: { $gte: opts.from, $lte: opts.to } };
  const total = await AttendanceDaily.countDocuments(q);
  console.log('Date range', opts.from, '→', opts.to, '| AttendanceDaily rows:', total);
  if (opts.dryRun) {
    await mongoose.disconnect();
    return;
  }

  const lim = opts.limit > 0 ? opts.limit : Infinity;
  let done = 0;
  let reconEvents = 0;
  const orig = console.log;
  const stream = AttendanceDaily.find(q).select('employeeNumber date').lean().cursor();

  for await (const row of stream) {
    const emp = String(row.employeeNumber || '').toUpperCase();
    const date = row.date;
    if (!emp || !date) continue;

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
      reconEvents += 1;
    }

    done += 1;
    if (done % 1000 === 0) {
      orig('Progress', done, '/', total, 'reconLogDays ~', reconEvents);
    }
    if (done >= lim) {
      orig('Stopped at --limit', lim);
      break;
    }
  }

  orig('Done. recalculateOnAttendanceUpdate calls:', done, '| days with [leaveAttendanceReconciliation] log line (approx):', reconEvents);
  await mongoose.disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
