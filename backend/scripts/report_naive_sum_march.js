/**
 * Optional full recalc for MONTH, then naive-sum report (same basis as before):
 *   present + partial + ods + weeklyOffs + holidays + leaves + absent
 * from contributingDates (each list summed separately; same date in multiple lists → inflates).
 *
 *   RECALC_ALL=1 MONTH=2026-03 node scripts/report_naive_sum_march.js
 *   MONTH=2026-03 node scripts/report_naive_sum_march.js
 */

require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
const mongoose = require('mongoose');
const MonthlyAttendanceSummary = require('../attendance/model/MonthlyAttendanceSummary');
const { calculateAllEmployeesSummary } = require('../attendance/services/summaryCalculationService');

const DEFAULT_EMPS = [
  '119', '5012', '71', '108', '1847', '2119', '2083', '2283', '2068', '2034', '2150', '2049', '630',
];

const NAIVE_KEYS = ['present', 'partial', 'ods', 'weeklyOffs', 'holidays', 'leaves', 'absent'];

function sumList(arr) {
  if (!Array.isArray(arr)) return 0;
  return Math.round(arr.reduce((s, x) => s + (Number(x?.value) || 0), 0) * 100) / 100;
}

function perDateStack(cd) {
  const m = new Map();
  for (const k of NAIVE_KEYS) {
    for (const x of cd[k] || []) {
      const d = x.date;
      if (!d) continue;
      m.set(d, (m.get(d) || 0) + (Number(x.value) || 0));
    }
  }
  return m;
}

function noteFor(naive, byDate) {
  if (Math.abs(naive - 28) < 0.01) return '—';
  const over = [...byDate.entries()]
    .filter(([, v]) => v > 1.0001)
    .sort((a, b) => b[1] - a[1]);
  if (over.length) {
    const top = over.slice(0, 2).map(([d, v]) => `${d} stack ${Math.round(v * 100) / 100}`);
    return `Multi-list same-day: ${top.join('; ')}`;
  }
  if (naive > 28) return 'Same date counted in more than one category (e.g. Pay+OD not in naive, but LOP+P+PT overlap).';
  return '—';
}

async function main() {
  if (!process.env.MONGODB_URI) throw new Error('MONGODB_URI');
  const month = process.env.MONTH || '2026-03';
  const [year, monthNumber] = month.split('-').map(Number);
  const emps = (process.env.EMP_LIST || DEFAULT_EMPS.join(','))
    .split(/[,;]\s*|\s+/)
    .map((s) => s.trim().toUpperCase())
    .filter(Boolean);

  await mongoose.connect(process.env.MONGODB_URI);

  if (process.env.RECALC_ALL === '1' || process.env.RECALC_ALL === 'true') {
    console.log('RECALC_ALL: calculateAllEmployeesSummary', year, monthNumber, '…\n');
    const t0 = Date.now();
    const results = await calculateAllEmployeesSummary(year, monthNumber);
    const ok = results.filter((r) => r.success).length;
    const fail = results.length - ok;
    console.log('Recalc done:', results.length, 'employees |', ok, 'ok |', fail, 'fail |', ((Date.now() - t0) / 1000).toFixed(1), 's\n');
  }

  const rows = await MonthlyAttendanceSummary.find({ month, emp_no: { $in: emps } })
    .select('emp_no contributingDates totalDaysInMonth startDate endDate')
    .lean();
  const by = new Map(rows.map((r) => [String(r.emp_no).toUpperCase(), r]));

  console.log('Month:', month, '| pay window (per summary):', rows[0] ? `${rows[0].startDate} → ${rows[0].endDate} | days: ${rows[0].totalDaysInMonth}` : 'n/a');
  console.log('');
  console.log('| emp | Naive sum | = 28? | Notes |');
  console.log('|-----|------------|-------|-------|');

  for (const e of emps) {
    const r = by.get(e);
    if (!r) {
      console.log('|', e, '|', '—', '|', '—', '|', 'No summary', '|');
      continue;
    }
    const cd = r.contributingDates || {};
    let naive = 0;
    for (const k of NAIVE_KEYS) naive += sumList(cd[k]);
    naive = Math.round(naive * 100) / 100;
    const ok28 = Math.abs(naive - 28) < 0.01;
    const tag = ok28 ? 'Yes' : 'No' + (naive > 28 ? ` (+${Math.round((naive - 28) * 100) / 100})` : ` (${naive - 28})`);
    const note = noteFor(naive, perDateStack(cd));
    console.log('|', e, '|', naive, '|', tag, '|', note, '|');
  }

  console.log('');
  console.log('Naive = sum of contributingDates values for: present, partial, ods, weeklyOffs, holidays, leaves, absent (payableShifts excluded).');
  await mongoose.disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
