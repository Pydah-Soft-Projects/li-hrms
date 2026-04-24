/**
 * For MONTH, list contributingDates breakdown per emp_no (sums + per-date lines).
 *   node scripts/report_contributing_dates_march.js
 *   EMP_LIST=119,71 MONTH=2026-03 node scripts/report_contributing_dates_march.js
 */
require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
const mongoose = require('mongoose');
const MonthlyAttendanceSummary = require('../attendance/model/MonthlyAttendanceSummary');

const DEFAULT_EMPS = [
  '119', '5012', '71', '2283', '2068', '108', '1847', '2049', '630', '2034', '2119', '2083', '2150',
];

const KEYS = [
  'present',
  'leaves',
  'paidLeaves',
  'lopLeaves',
  'ods',
  'partial',
  'weeklyOffs',
  'holidays',
  'payableShifts',
  'absent',
];

function sumArr(arr) {
  if (!Array.isArray(arr)) return 0;
  return Math.round(arr.reduce((s, x) => s + (Number(x?.value) || 0), 0) * 100) / 100;
}

function main() {
  const month = process.env.MONTH || '2026-03';
  const list = (process.env.EMP_LIST || DEFAULT_EMPS.join(','))
    .split(',')
    .map((s) => s.trim().toUpperCase())
    .filter(Boolean);

  return (async () => {
    if (!process.env.MONGODB_URI) throw new Error('MONGODB_URI');
    await mongoose.connect(process.env.MONGODB_URI);
    const rows = await MonthlyAttendanceSummary.find({ month, emp_no: { $in: list } })
      .select('emp_no month startDate endDate totalDaysInMonth contributingDates')
      .lean();

    const by = new Map(rows.map((r) => [String(r.emp_no).toUpperCase(), r]));

    for (const emp of list) {
      const r = by.get(emp);
      if (!r) {
        console.log('\n###', emp, '— NO SUMMARY FOR', month);
        continue;
      }
      const cd = r.contributingDates || {};
      console.log('\n###', r.emp_no, '|', month, '| period', r.startDate, '→', r.endDate, '| totalDaysInMonth:', r.totalDaysInMonth);
      console.log('--- Sums from contributingDates.value (each list is its own basis; same date can appear in multiple lists) ---');
      for (const k of KEYS) {
        const s = sumArr(cd[k]);
        if (s > 0 || (cd[k] && cd[k].length)) {
          console.log(k + ':', s, 'from', (cd[k] || []).length, 'entries');
        }
      }
      for (const k of KEYS) {
        const items = cd[k] || [];
        if (!items.length) continue;
        const lines = items
          .map((x) => `${x.date}=${x.value} ${x.label != null && x.label !== '' ? `(${x.label})` : ''}`.trim())
          .sort();
        console.log('  ' + k + ':', lines.join('; '));
      }
    }

    await mongoose.disconnect();
  })();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
