/**
 * Investigate total days over-count for specific employees + scan month.
 *   node scripts/_investigate_total_days_overcount.js
 *   MONTH=2026-06 EMP_NOS=2123,2137 node scripts/_investigate_total_days_overcount.js
 */
require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
const mongoose = require('mongoose');
const dayjs = require('dayjs');
const utc = require('dayjs/plugin/utc');
const timezone = require('dayjs/plugin/timezone');
dayjs.extend(utc);
dayjs.extend(timezone);

const PayRegisterSummary = require('../pay-register/model/PayRegisterSummary');
const MonthlyAttendanceSummary = require('../attendance/model/MonthlyAttendanceSummary');
const Employee = require('../employees/model/Employee');
const { getAllDatesInRange } = require('../shared/utils/dateUtils');

const MONTH = process.env.MONTH || '2026-06';
const TARGET_EMP = (process.env.EMP_NOS || '2123,2137,2307,5006,7036')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);
const TOLERANCE = 0.05;

const round2 = (n) => Math.round(n * 100) / 100;

function getLeaveTotal(totals) {
  if (!totals) return 0;
  if (totals.totalLeaves != null) return round2(Number(totals.totalLeaves) || 0);
  return round2((Number(totals.totalPaidLeaveDays) || 0) + (Number(totals.totalLopDays) || 0));
}

function computeTotalDaysSummed(totals) {
  const present = round2(Number(totals?.totalPresentDays) || 0);
  const weekOffs = round2(Number(totals?.totalWeeklyOffs) || 0);
  const holidays = round2(Number(totals?.totalHolidays) || 0);
  const totalLeaves = getLeaveTotal(totals);
  const od = round2(Number(totals?.totalODDays ?? totals?.totalODs) || 0);
  const absent = round2(Number(totals?.totalAbsentDays) || 0);
  return round2(present + weekOffs + holidays + totalLeaves + od + absent);
}

function sumContributingDates(cd) {
  if (!cd || typeof cd !== 'object') return {};
  const keys = [
    'present', 'partial', 'weeklyOffs', 'holidays', 'leaves', 'paidLeaves', 'lopLeaves', 'ods', 'absent',
  ];
  const sums = {};
  for (const k of keys) {
    const arr = cd[k] || [];
    sums[k] = round2(arr.reduce((s, x) => s + (Number(x?.value) || 0), 0));
  }
  return sums;
}

function cdReconstructed(cdSums) {
  return round2(
    (cdSums.present || 0) +
      (cdSums.partial || 0) +
      (cdSums.weeklyOffs || 0) +
      (cdSums.holidays || 0) +
      (cdSums.leaves || 0) +
      (cdSums.ods || 0) +
      (cdSums.absent || 0)
  );
}

function fmtDate(d) {
  if (!d) return null;
  return dayjs(d).tz('Asia/Kolkata').format('YYYY-MM-DD');
}

function countEligibleDays(startDate, endDate, dojStr, leftDateStr) {
  return getAllDatesInRange(startDate, endDate).filter((d) => {
    if (dojStr && d < dojStr) return false;
    if (leftDateStr && d > leftDateStr) return false;
    return true;
  }).length;
}

function findDoubleCountDates(cd) {
  if (!cd) return [];
  const buckets = ['present', 'partial', 'weeklyOffs', 'holidays', 'leaves', 'ods', 'absent'];
  const byDate = new Map();
  for (const k of buckets) {
    for (const e of cd[k] || []) {
      const d = e?.date;
      if (!d) continue;
      if (!byDate.has(d)) byDate.set(d, []);
      byDate.get(d).push({ bucket: k, value: Number(e.value) || 0, label: e.label });
    }
  }
  const issues = [];
  for (const [date, entries] of byDate) {
    const types = [...new Set(entries.map((x) => x.bucket))];
    const sum = round2(entries.reduce((s, x) => s + x.value, 0));
    if (sum > 1 + TOLERANCE) {
      issues.push({ date, sum, entries, types });
    }
    // WO/HOL + leave same date
    const hasWoHol = entries.some((x) => x.bucket === 'weeklyOffs' || x.bucket === 'holidays');
    const hasLeave = entries.some((x) => x.bucket === 'leaves' || x.bucket === 'paidLeaves' || x.bucket === 'lopLeaves');
    if (hasWoHol && hasLeave && sum > 1 + TOLERANCE) {
      issues.push({ date, sum, entries, types, kind: 'wo_hol_plus_leave' });
    }
    // present + partial overlap
    const pres = entries.filter((x) => x.bucket === 'present').reduce((s, x) => s + x.value, 0);
    const part = entries.filter((x) => x.bucket === 'partial').reduce((s, x) => s + x.value, 0);
    if (pres > 0 && part > 0 && pres + part > 1 + TOLERANCE) {
      issues.push({ date, sum: pres + part, entries, types, kind: 'present_plus_partial' });
    }
  }
  return issues;
}

function diagnose(row) {
  const reasons = [];
  const diff = round2(row.totalDaysSummed - row.expectedDays);
  if (Math.abs(diff) <= TOLERANCE) return reasons;

  if (row.doubleCountDates?.length) {
    for (const dc of row.doubleCountDates) {
      reasons.push(
        `Double-count ${dc.date}: ${dc.entries.map((e) => `${e.bucket}=${e.value}`).join(' + ')} (sum ${dc.sum})`
      );
    }
  }

  const compDiff = round2(row.totalDaysSummed - row.cdReconstructed);
  if (Math.abs(compDiff) > TOLERANCE) {
    reasons.push(`Totals vs contributingDates diff ${compDiff}`);
  }

  const cd = row.cdSums || {};
  if ((cd.partial || 0) > 0 && (cd.present || 0) > 0) {
    const overlap = row.doubleCountDates?.filter((d) => d.kind === 'present_plus_partial');
    if (!overlap?.length) {
      reasons.push(`partial=${cd.partial} + present=${cd.present} may overlap in totals`);
    }
  }

  if ((cd.holidays || 0) + (cd.leaves || 0) > row.expectedDays) {
    const holLeave = row.doubleCountDates?.filter((d) => d.kind === 'wo_hol_plus_leave');
    if (holLeave?.length) {
      reasons.push(`${holLeave.length} date(s) with WO/HOL + leave both contributing`);
    }
  }

  if (reasons.length === 0) {
    reasons.push(`Over/under by ${diff} — check component breakdown`);
  }
  return reasons;
}

async function buildRow(pr, emp, mas) {
  const dojStr = fmtDate(emp?.doj);
  const leftDateStr = fmtDate(emp?.leftDate);
  const totals = pr.totals || {};
  const cd = mas?.contributingDates || pr.contributingDates || {};
  const cdSums = sumContributingDates(cd);
  const totalDaysSummed = computeTotalDaysSummed(totals);
  const expectedDays = countEligibleDays(pr.startDate, pr.endDate, dojStr, leftDateStr);
  const doubleCountDates = findDoubleCountDates(cd);

  return {
    emp_no: pr.emp_no,
    name: emp?.employee_name,
    department: emp?.department,
    startDate: pr.startDate,
    endDate: pr.endDate,
    expectedDays,
    totalDaysInMonth: pr.totalDaysInMonth,
    totalDaysSummed,
    diff: round2(totalDaysSummed - expectedDays),
    components: {
      present: round2(Number(totals.totalPresentDays) || 0),
      weekOffs: round2(Number(totals.totalWeeklyOffs) || 0),
      holidays: round2(Number(totals.totalHolidays) || 0),
      leaves: getLeaveTotal(totals),
      od: round2(Number(totals.totalODDays ?? totals.totalODs) || 0),
      absent: round2(Number(totals.totalAbsentDays) || 0),
      partial: round2(Number(totals.totalPartialDays ?? mas?.totalPartialDays) || 0),
    },
    cdSums,
    cdReconstructed: cdReconstructed(cdSums),
    doubleCountDates,
    reasons: [],
  };
}

(async () => {
  await mongoose.connect(process.env.MONGODB_URI);
  console.log(`\n=== Total days investigation (${MONTH}) ===\n`);

  const prs = await PayRegisterSummary.find({ month: MONTH })
    .select('emp_no employeeId totals startDate endDate totalDaysInMonth contributingDates')
    .lean();
  const empIds = [...new Set(prs.map((p) => String(p.employeeId)))];
  const employees = await Employee.find({ _id: { $in: empIds } })
    .select('emp_no employee_name department doj leftDate')
    .lean();
  const empMap = new Map(employees.map((e) => [String(e._id), e]));
  const masDocs = await MonthlyAttendanceSummary.find({ month: MONTH })
    .select('emp_no contributingDates totalPartialDays')
    .lean();
  const masMap = new Map(masDocs.map((m) => [m.emp_no, m]));

  const allRows = [];
  for (const pr of prs) {
    const emp = empMap.get(String(pr.employeeId));
    const mas = masMap.get(pr.emp_no);
    const row = await buildRow(pr, emp, mas);
    row.reasons = diagnose(row);
    allRows.push(row);
  }

  const overCount = allRows
    .filter((r) => r.diff > TOLERANCE)
    .sort((a, b) => b.diff - a.diff);

  console.log(`Total employees in PR: ${allRows.length}`);
  console.log(`Over-count (totalDays > expected): ${overCount.length}\n`);

  const targets = allRows.filter((r) => TARGET_EMP.includes(String(r.emp_no)));
  console.log('--- TARGET EMPLOYEES ---');
  for (const r of targets) {
    console.log(`\n${r.emp_no} ${r.name} (${r.department || '—'})`);
    console.log(`  Period: ${r.startDate} → ${r.endDate} | Expected: ${r.expectedDays} | Summed: ${r.totalDaysSummed} | Diff: +${r.diff}`);
    console.log(
      `  Stored: P=${r.components.present} WO=${r.components.weekOffs} HOL=${r.components.holidays} L=${r.components.leaves} OD=${r.components.od} A=${r.components.absent} partial=${r.components.partial}`
    );
    console.log(
      `  ContributingDates: P=${r.cdSums.present} partial=${r.cdSums.partial} WO=${r.cdSums.weeklyOffs} HOL=${r.cdSums.holidays} L=${r.cdSums.leaves} OD=${r.cdSums.ods} A=${r.cdSums.absent} => ${r.cdReconstructed}`
    );
  if (r.doubleCountDates.length) {
      console.log('  Problem dates:');
      for (const dc of r.doubleCountDates) {
        console.log(`    ${dc.date}: ${dc.entries.map((e) => `${e.bucket}=${e.value}(${e.label || ''})`).join(' + ')} = ${dc.sum}`);
      }
    }
    if (r.reasons.length) {
      console.log('  Diagnosis:');
      r.reasons.forEach((x) => console.log(`    - ${x}`));
    }
  }

  console.log('\n--- ALL OVER-COUNT (top 30) ---');
  for (const r of overCount.slice(0, 30)) {
    const dc = r.doubleCountDates[0];
    const hint = dc
      ? `${dc.date} ${dc.entries.map((e) => e.bucket).join('+')}`
      : r.reasons[0] || 'unknown';
    console.log(
      `  ${r.emp_no} ${(r.name || '').slice(0, 28).padEnd(28)} summed=${r.totalDaysSummed} expected=${r.expectedDays} diff=+${r.diff} | ${hint}`
    );
  }

  console.log('\n--- contributingDates sum > 31 ---');
  const cdOver = allRows
    .filter((r) => r.cdReconstructed > 31 + TOLERANCE)
    .sort((a, b) => b.cdReconstructed - a.cdReconstructed);
  console.log(`Count: ${cdOver.length}`);
  for (const r of cdOver) {
    console.log(
      `  ${r.emp_no} ${(r.name || '').slice(0, 28).padEnd(28)} PR=${r.totalDaysSummed} CD=${r.cdReconstructed} diffCD=+${round2(r.cdReconstructed - 31)}`
    );
  }

  await mongoose.disconnect();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
