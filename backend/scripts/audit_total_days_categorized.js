require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
const mongoose = require('mongoose');
const dayjs = require('dayjs');
const utc = require('dayjs/plugin/utc');
const timezone = require('dayjs/plugin/timezone');
dayjs.extend(utc);
dayjs.extend(timezone);

const PR = require('../pay-register/model/PayRegisterSummary');
const Emp = require('../employees/model/Employee');
const { getAllDatesInRange } = require('../shared/utils/dateUtils');

const MONTH = process.env.MONTH || '2026-06';

const r2 = (n) => Math.round(n * 100) / 100;
const fmt = (d) => (d ? dayjs(d).tz('Asia/Kolkata').format('YYYY-MM-DD') : null);
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

function expectedDays(doj, lwd, sd, ed) {
  return getAllDatesInRange(sd, ed).filter((d) => (!doj || d >= doj) && (!lwd || d <= lwd)).length;
}

function category(doj, lwd, expected, total, periodDays, sd, ed) {
  if (lwd && lwd < sd) return 'stale_ex_employee';
  if (doj && doj > ed) return 'not_yet_joined';
  if (expected === 0 && total > 0) return 'out_of_scope_with_data';
  if (expected < periodDays && expected > 0 && Math.abs(total - expected) <= 0.05) return 'prorated_ok';
  if (expected < periodDays && Math.abs(total - expected) > 0.05) return 'prorated_bad';
  if (expected === periodDays && Math.abs(total - periodDays) <= 0.05) return 'full_month_ok';
  if (expected === periodDays && total === 0) return 'full_month_missing';
  if (expected === periodDays) return 'full_month_bad';
  return 'other';
}

(async () => {
  await mongoose.connect(process.env.MONGODB_URI);
  const prs = await PR.find({ month: MONTH }).select('emp_no totals startDate endDate totalDaysInMonth').lean();
  if (!prs.length) {
    console.log('No pay register data for month:', MONTH);
    await mongoose.disconnect();
    return;
  }
  const sample = prs.find((p) => p.startDate && p.endDate) || prs[0];
  const SD = sample.startDate;
  const ED = sample.endDate;
  const PERIOD_DAYS = getAllDatesInRange(SD, ED).length;

  const emps = await Emp.find({}).select('emp_no employee_name doj leftDate').lean();
  const em = new Map(emps.map((e) => [e.emp_no, e]));

  const buckets = {};
  const improper = [];

  for (const pr of prs) {
    const e = em.get(pr.emp_no) || {};
    const doj = fmt(e.doj);
    const lwd = fmt(e.leftDate);
    const sd = pr.startDate || SD;
    const ed = pr.endDate || ED;
    const expected = expectedDays(doj, lwd, sd, ed);
    const total = totalDays(pr.totals);
    const cat = category(doj, lwd, expected, total, PERIOD_DAYS, sd, ed);
    buckets[cat] = (buckets[cat] || 0) + 1;

    if (['full_month_bad', 'full_month_missing', 'prorated_bad', 'out_of_scope_with_data', 'stale_ex_employee'].includes(cat)) {
      improper.push({
        emp: pr.emp_no,
        name: e.employee_name,
        doj,
        lwd,
        expected,
        total,
        diff: r2(total - expected),
        cat,
        totalDaysInMonth: pr.totalDaysInMonth,
        t: pr.totals,
      });
    }
  }

  console.log(`=== ${MONTH} Pay Register — Total Days Audit ===`);
  console.log('Pay period:', SD, 'to', ED, `(${PERIOD_DAYS} days in cycle)`);
  console.log('Formula: Present + WO + HOL + Leaves + OD + Absent\n');
  console.log('Categories:');
  for (const [k, v] of Object.entries(buckets).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${k}: ${v}`);
  }

  improper.sort((a, b) => Math.abs(b.diff) - Math.abs(a.diff));
  console.log(`\n=== IMPROPER VALUES (${improper.length}) ===\n`);

  for (const r of improper) {
    const t = r.t || {};
    console.log(`${r.emp} | ${r.name}`);
    console.log(`  DOJ: ${r.doj || '—'} | LWD: ${r.lwd || '—'} | Expected: ${r.expected} | Total: ${r.total} | Diff: ${r.diff}`);
    console.log(
      `  P=${t.totalPresentDays || 0} WO=${t.totalWeeklyOffs || 0} HOL=${t.totalHolidays || 0} L=${getL(t)} OD=${t.totalODDays ?? t.totalODs ?? 0} A=${t.totalAbsentDays || 0}`
    );
    let reason = '';
    switch (r.cat) {
      case 'stale_ex_employee':
        reason = `Left before pay period (LWD ${r.lwd}) but still has ${r.total} days counted — stale pay-register row not cleared`;
        break;
      case 'out_of_scope_with_data':
        reason = `Not eligible in period (DOJ ${r.doj} / LWD ${r.lwd}) but totals show ${r.total} days`;
        break;
      case 'full_month_missing':
        reason = 'Full-month employee but all totals are 0 — attendance/summary not calculated or not synced';
        break;
      case 'full_month_bad':
        reason =
          r.diff > 0
            ? 'Double-counting: same calendar day counted in multiple buckets (e.g. Present + Leave, Present + OD, Present + Absent on half-days)'
            : 'Under-count: some eligible days not classified in any bucket';
        break;
      case 'prorated_bad':
        reason = `Prorated employee (expected ${r.expected} days from DOJ/LWD) but total is ${r.total}`;
        break;
      default:
        reason = r.cat;
    }
    console.log(`  REASON: ${reason}\n`);
  }

  await mongoose.disconnect();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
