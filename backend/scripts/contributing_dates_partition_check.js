/**
 * For EMP_LIST + MONTH: show contributingDates sums + whether days in period are "covered" once.
 *
 *   node scripts/contributing_dates_partition_check.js
 */
require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
const mongoose = require('mongoose');
const { getAllDatesInRange } = require('../shared/utils/dateUtils');
const MonthlyAttendanceSummary = require('../attendance/model/MonthlyAttendanceSummary');

const DEFAULT_EMPS =
  '119,5012,71,2283,2068,108,1847,2049,630,2034,2119,2083,2150'
    .split(',')
    .map((s) => s.trim().toUpperCase());

const SUM_KEYS = [
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

function sumList(arr) {
  if (!Array.isArray(arr)) return 0;
  return Math.round(arr.reduce((s, x) => s + (Number(x?.value) || 0), 0) * 100) / 100;
}

function collectDateUnits(cd) {
  const byDate = new Map();
  const add = (d, v) => {
    if (!d) return;
    const t = Math.round((Number(v) || 0) * 100) / 100;
    byDate.set(d, (byDate.get(d) || 0) + t);
  };
  for (const k of ['weeklyOffs', 'holidays']) {
    for (const x of cd[k] || []) add(x.date, x.value);
  }
  for (const k of ['present', 'leaves', 'ods', 'partial', 'absent']) {
    for (const x of cd[k] || []) add(x.date, x.value);
  }
  return byDate;
}

function main() {
  const month = process.env.MONTH || '2026-03';
  const emps = (process.env.EMP_LIST || DEFAULT_EMPS.join(','))
    .split(/[,;]\s*|\s+/)
    .map((s) => s.trim().toUpperCase())
    .filter(Boolean);

  return (async () => {
    await mongoose.connect(process.env.MONGODB_URI);
    for (const emp of emps) {
      const s = await MonthlyAttendanceSummary.findOne({ month, emp_no: emp })
        .select('emp_no startDate endDate totalDaysInMonth totalPresentDays totalLeaves totalPaidLeaves totalLopLeaves totalODs totalPartialDays totalWeeklyOffs totalHolidays totalAbsentDays totalPayableShifts contributingDates')
        .lean();
      if (!s) {
        console.log('NO DOC', emp);
        continue;
      }
      const periodDates = new Set(getAllDatesInRange(s.startDate, s.endDate));
      const nPeriod = periodDates.size;
      const cd = s.contributingDates || {};
      const sums = {};
      for (const k of SUM_KEYS) sums[k] = sumList(cd[k]);

      const byDate = collectDateUnits(cd);
      let sumPerDateOverlapping = 0;
      for (const [, v] of byDate) sumPerDateOverlapping += v;
      const datesWithAny = [...byDate.keys()].filter((d) => periodDates.has(d));
      const unionSum = datesWithAny.length;

      // Non-overlapping proxy: WO+HOL are usually full 1.0; work-day rows may stack on same date.
      const wh = sums.weeklyOffs + sums.holidays;

      console.log('---', s.emp_no, '|', month, '|', s.startDate, '->', s.endDate, '---');
      console.log('totalDaysInMonth (DB):', s.totalDaysInMonth, '| days in [start,end]:', nPeriod);
      console.log('Top-level stored totals — present', s.totalPresentDays, 'payable', s.totalPayableShifts, 'partial', s.totalPartialDays, 'leaves', s.totalLeaves, 'paid', s.totalPaidLeaves, 'LOP', s.totalLopLeaves, 'OD', s.totalODs, 'WO', s.totalWeeklyOffs, 'HOL', s.totalHolidays, 'absent', s.totalAbsentDays);
      console.log('Sum of contributingDates.value:');
      console.log(' ', JSON.stringify(sums));
      console.log('  WO + HOL (sum of those lists only):', wh, '(not necessarily disjoint from other days)');
      console.log('  Naive: present+partial+ods+wo+hol+leaves+absent =', [sums.present, sums.partial, sums.ods, sums.weeklyOffs, sums.holidays, sums.leaves, sums.absent].reduce((a, b) => a + b, 0));
      console.log('  Unique period dates with >=1 entry in (present|leaves|ods|partial|wo|hol|absent):', new Set(datesWithAny).size);
      console.log('  If we SUM value per calendar date (same date in multiple lists stacks):', Math.round(sumPerDateOverlapping * 100) / 100, '— this can exceed', nPeriod, 'because of overlap (e.g. same day: Pay + LOP + P).');
      console.log('contributingDates (compact):');
      for (const k of SUM_KEYS) {
        const arr = cd[k] || [];
        if (!arr.length) continue;
        const line = arr
          .map((x) => `${x.date}:${x.value}${x.label ? `(${x.label})` : ''}`)
          .join(' | ');
        console.log(' ', k + ':', line);
      }
      console.log('');
    }
    await mongoose.disconnect();
  })();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
