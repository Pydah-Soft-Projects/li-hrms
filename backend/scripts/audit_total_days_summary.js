require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
const mongoose = require('mongoose');
const PR = require('../pay-register/model/PayRegisterSummary');
const Emp = require('../employees/model/Employee');
const MAS = require('../attendance/model/MonthlyAttendanceSummary');

const MONTH = '2026-03';
const r2 = (n) => Math.round(n * 100) / 100;
const getL = (t) =>
  t?.totalLeaves != null ? r2(+t.totalLeaves || 0) : r2((+t.totalPaidLeaveDays || 0) + (+t.totalLopDays || 0));
const totalDays = (t) =>
  r2(
    (+t?.totalPresentDays || 0) +
      (+t?.totalWeeklyOffs || 0) +
      (+t?.totalHolidays || 0) +
      getL(t) +
      (+(t?.totalODDays ?? t?.totalODs) || 0) +
      (+t?.totalAbsentDays || 0)
  );

(async () => {
  await mongoose.connect(process.env.MONGODB_URI);
  const prs = await PR.find({ month: MONTH }).select('emp_no totals totalDaysInMonth').lean();
  let not28 = 0;
  let not31 = 0;
  for (const pr of prs) {
    const total = totalDays(pr.totals);
    if (Math.abs(total - 28) > 0.05) not28++;
    if (Math.abs(total - 31) > 0.05) not31++;
  }
  console.log('Employees with totalDaysSummed != 28:', not28, 'of', prs.length);
  console.log('Employees with totalDaysSummed != 31:', not31, 'of', prs.length);
  console.log('totalDaysInMonth values:', [...new Set(prs.map((p) => p.totalDaysInMonth))]);

  const emps = await Emp.find({ leftDate: { $lt: new Date('2026-02-26') } }).select('emp_no').lean();
  const leftBefore = new Set(emps.map((e) => e.emp_no));
  const stale = prs.filter(
    (p) => leftBefore.has(p.emp_no) && totalDays(p.totals) > 0
  );
  console.log('Ex-employees (left before period) with non-zero total days:', stale.length);
  console.log('Examples:', stale.slice(0, 12).map((s) => `${s.emp_no}=${totalDays(s.totals)}`).join(', '));

  const m = await MAS.findOne({ emp_no: '5009', month: MONTH })
    .select('contributingDates totalPresentDays totalLeaves')
    .lean();
  if (m) {
    console.log('\n5009 BALASADI DURGA detail:');
    console.log('stored present:', m.totalPresentDays, 'leaves:', m.totalLeaves);
    const cd = m.contributingDates || {};
    const overlap = [];
    const byDate = new Map();
    for (const k of ['present', 'leaves', 'ods', 'partial', 'absent']) {
      for (const x of cd[k] || []) {
        if (!byDate.has(x.date)) byDate.set(x.date, {});
        byDate.get(x.date)[k] = (byDate.get(x.date)[k] || 0) + (+x.value || 0);
      }
    }
    for (const [d, v] of byDate) {
      if (Object.keys(v).length > 1) overlap.push(`${d}: ${JSON.stringify(v)}`);
    }
    console.log('Overlapping dates (' + overlap.length + '):');
    overlap.forEach((l) => console.log(' ', l));
  }

  await mongoose.disconnect();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
