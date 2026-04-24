/**
 * For MONTH (YYYY-MM): snapshot MonthlyAttendanceSummary totals for all active employees, then
 * calculateAllEmployeesSummary, then report what changed.
 *
 *   node scripts/recalc_month_with_diff_report.js
 *   MONTH=2026-03 node scripts/recalc_month_with_diff_report.js
 *   RECALC_ONLY=1 node scripts/recalc_month_with_diff_report.js   # skip diff (only recalc) — not implemented; always diffs
 */

require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
const mongoose = require('mongoose');
const Employee = require('../employees/model/Employee');
const MonthlyAttendanceSummary = require('../attendance/model/MonthlyAttendanceSummary');
const { calculateAllEmployeesSummary } = require('../attendance/services/summaryCalculationService');
const dateCycleService = require('../leaves/services/dateCycleService');
const { createISTDate, extractISTComponents } = require('../shared/utils/dateUtils');

const FIELDS = [
  'totalDaysInMonth',
  'totalPresentDays',
  'totalPayableShifts',
  'totalPartialDays',
  'totalPartialPresentPayableOverlap',
  'totalLeaves',
  'totalPaidLeaves',
  'totalLopLeaves',
  'totalODs',
  'totalWeeklyOffs',
  'totalHolidays',
  'totalAbsentDays',
  'lateInCount',
  'totalLateInMinutes',
  'earlyOutCount',
  'totalEarlyOutMinutes',
  'lateOrEarlyCount',
  'totalLateOrEarlyMinutes',
];

function pick(s) {
  if (!s) return null;
  const o = {};
  for (const f of FIELDS) {
    const v = s[f];
    o[f] = typeof v === 'number' ? v : v == null ? 0 : Number(v) || 0;
  }
  return o;
}

function round2(n) {
  return Math.round(n * 100) / 100;
}

function diff(before, after) {
  const d = {};
  if (!before && !after) return d;
  const a = after || {};
  const b = before || {};
  for (const f of FIELDS) {
    const x = round2(b[f] ?? 0);
    const y = round2(a[f] ?? 0);
    if (Math.abs(x - y) > 0.001) d[f] = { from: x, to: y, delta: round2(y - x) };
  }
  return d;
}

async function run() {
  if (!process.env.MONGODB_URI) {
    console.error('MONGODB_URI not set');
    process.exit(1);
  }

  let monthStr = process.env.MONTH || '2026-03';
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(monthStr)) {
    console.error('Set MONTH=YYYY-MM');
    process.exit(1);
  }
  const [year, monthNumber] = monthStr.split('-').map(Number);

  await mongoose.connect(process.env.MONGODB_URI);
  console.log('Connected. MONTH =', monthStr, '\n');

  const periodInfo = await dateCycleService.getPeriodInfo(
    createISTDate(`${year}-${String(monthNumber).padStart(2, '0')}-15`)
  );
  const sd = extractISTComponents(periodInfo.payrollCycle.startDate).dateStr;
  const ed = extractISTComponents(periodInfo.payrollCycle.endDate).dateStr;
  console.log('Payroll cycle (anchor 15th of calendar month):', sd, '→', ed, '\n');

  const emps = await Employee.find({ is_active: { $ne: false } })
    .select('_id emp_no')
    .lean();
  const empNos = emps.map((e) => String(e.emp_no || '').toUpperCase());

  const beforeDocs = await MonthlyAttendanceSummary.find({ month: monthStr, emp_no: { $in: empNos } })
    .lean();
  const beforeByEmp = new Map();
  for (const s of beforeDocs) {
    beforeByEmp.set(String(s.emp_no), pick(s));
  }
  console.log('Loaded pre-recalc snapshots:', beforeByEmp.size, 'of', emps.length, 'active employees\n');
  console.log('Recalculating (calculateAllEmployeesSummary)…\n');
  const t0 = Date.now();
  const results = await calculateAllEmployeesSummary(year, monthNumber);
  const ok = results.filter((r) => r.success).length;
  const fail = results.filter((r) => !r.success).length;
  console.log('Recalc finished in', ((Date.now() - t0) / 1000).toFixed(1), 's. Success:', ok, 'Failed:', fail, '\n');

  if (fail) {
    results
      .filter((r) => !r.success)
      .forEach((r) => console.error('  Failed', r.employee, r.error));
  }

  const afterDocs = await MonthlyAttendanceSummary.find({ month: monthStr, emp_no: { $in: empNos } })
    .lean();
  const afterByEmp = new Map();
  for (const s of afterDocs) {
    afterByEmp.set(String(s.emp_no), pick(s));
  }

  let anyChange = 0;
  let newSummary = 0;
  const changes = [];
  for (const e of emps) {
    const no = String(e.emp_no || '').toUpperCase();
    const b = beforeByEmp.get(no);
    const a = afterByEmp.get(no);
    if (!a) continue; // no summary for this month after (edge)
    if (!b) {
      newSummary += 1;
      continue;
    }
    const d = diff(b, a);
    if (Object.keys(d).length) {
      anyChange += 1;
      changes.push({ emp_no: no, diff: d });
    }
  }

  const fieldDeltaSums = {};
  for (const c of changes) {
    for (const [f, o] of Object.entries(c.diff)) {
      if (!fieldDeltaSums[f]) fieldDeltaSums[f] = { sum: 0, n: 0, absSum: 0 };
      fieldDeltaSums[f].sum += o.delta;
      fieldDeltaSums[f].absSum += Math.abs(o.delta);
      fieldDeltaSums[f].n += 1;
    }
  }

  console.log('========== POST-RECALC SUMMARY (vs stored totals before this run) ==========');
  console.log('Active employees processed:', emps.length);
  console.log('Summaries that existed before:', beforeByEmp.size);
  console.log('Summaries after recalc:', afterByEmp.size);
  console.log('New summaries (none before, now present):', newSummary);
  console.log('Employees with at least one changed field:', anyChange, '\n');

  console.log('--- Aggregate absolute movement (sum of |delta|) where field changed ---');
  const sorted = Object.entries(fieldDeltaSums).sort((a, b) => b[1].absSum - a[1].absSum);
  for (const [f, o] of sorted) {
    console.log(
      `  ${f}: ${o.n} employees, sum|Δ| = ${round2(o.absSum)}, sum(Δ) = ${round2(o.sum)}`
    );
  }
  console.log('');

  const showLimit = Math.min(Number(process.env.CHANGE_SAMPLE_LIMIT) || 40, 500);
  if (changes.length) {
    console.log('--- Sample: first', showLimit, 'employees with any change (emp_no, fields) ---');
    changes.sort((a, b) => String(a.emp_no).localeCompare(String(b.emp_no)));
    for (const c of changes.slice(0, showLimit)) {
      const parts = Object.entries(c.diff).map(([f, o]) => `${f}:${o.from}→${o.to}`);
      console.log(c.emp_no, parts.join(' | '));
    }
    if (changes.length > showLimit) {
      console.log('... and', changes.length - showLimit, 'more. Set CHANGE_SAMPLE_LIMIT to show more lines.');
    }
  } else {
    console.log('No numeric diffs from stored snapshot (or no prior summaries to compare).');
  }

  await mongoose.disconnect();
  process.exit(0);
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
