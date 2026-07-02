/**
 * Audit pay-register "Total Days" column (present+WO+HOL+leaves+OD+absent).
 * Finds employees where totalDaysSummed != expected period days (after DOJ/LWD bounds).
 *
 *   node scripts/audit_total_days_summed.js
 *   MONTH=2026-03 node scripts/audit_total_days_summed.js
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

const MONTH = process.env.MONTH || '2026-03';
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

function fmtDate(d) {
  if (!d) return null;
  return dayjs(d).tz('Asia/Kolkata').format('YYYY-MM-DD');
}

function countEligibleDays(startDate, endDate, dojStr, leftDateStr) {
  const all = getAllDatesInRange(startDate, endDate);
  return all.filter((d) => {
    if (dojStr && d < dojStr) return false;
    if (leftDateStr && d > leftDateStr) return false;
    return true;
  }).length;
}

function sumContributingDates(cd) {
  if (!cd || typeof cd !== 'object') return {};
  const keys = ['present', 'partial', 'weeklyOffs', 'holidays', 'leaves', 'paidLeaves', 'lopLeaves', 'ods', 'absent'];
  const sums = {};
  for (const k of keys) {
    const arr = cd[k] || [];
    sums[k] = round2(arr.reduce((s, x) => s + (Number(x?.value) || 0), 0));
  }
  return sums;
}

function classifyDailyRecord(dr) {
  if (!dr) return { type: 'empty', value: 0 };
  const fh = dr.firstHalf?.status || '';
  const sh = dr.secondHalf?.status || '';
  const statuses = [fh, sh].filter(Boolean);
  if (!statuses.length) return { type: 'empty', value: 0 };

  const mapHalf = (st) => {
    const s = String(st).toUpperCase();
    if (s === 'PRESENT' || s === 'P' || s === 'OD') return 'present';
    if (s === 'WEEKLY_OFF' || s === 'WO') return 'wo';
    if (s === 'HOLIDAY' || s === 'HOL') return 'hol';
    if (s === 'LEAVE' || s === 'L') return 'leave';
    if (s === 'ABSENT' || s === 'A') return 'absent';
    if (s === 'PARTIAL') return 'partial';
    return 'other';
  };
  const h1 = mapHalf(fh);
  const h2 = mapHalf(sh);
  const halves = [h1, h2].filter((x) => x !== 'other');
  if (!halves.length) return { type: 'other', value: 0.5 * statuses.length };

  const unique = [...new Set(halves)];
  if (unique.length === 1) {
    const val = halves.length === 2 ? 1 : 0.5;
    return { type: unique[0], value: val };
  }
  return { type: 'mixed', value: halves.length * 0.5, halves };
}

function sumFromDailyRecords(dailyRecords, startDate, endDate, dojStr, leftDateStr) {
  const sums = { present: 0, wo: 0, hol: 0, leave: 0, absent: 0, partial: 0, empty: 0, outOfBounds: 0 };
  const byDate = new Map((dailyRecords || []).map((d) => [d.date, d]));
  for (const dStr of getAllDatesInRange(startDate, endDate)) {
    if ((dojStr && dStr < dojStr) || (leftDateStr && dStr > leftDateStr)) {
      sums.outOfBounds++;
      continue;
    }
    const dr = byDate.get(dStr);
    const c = classifyDailyRecord(dr);
    if (c.type === 'mixed') {
      for (const h of c.halves || []) sums[h] = round2(sums[h] + 0.5);
    } else if (sums[c.type] != null) {
      sums[c.type] = round2(sums[c.type] + c.value);
    }
  }
  return sums;
}

function diagnoseMismatch(row) {
  const reasons = [];
  const diff = round2(row.totalDaysSummed - row.expectedDays);

  if (row.dojStr && row.dojStr > row.startDate && row.dojStr <= row.endDate) {
    reasons.push(`Mid-month joiner (DOJ ${row.dojStr}) — expected ${row.expectedDays} eligible days, not full ${row.totalDaysInMonth}`);
  }
  if (row.leftDateStr && row.leftDateStr >= row.startDate && row.leftDateStr < row.endDate) {
    reasons.push(`Left mid-period (LWD ${row.leftDateStr}) — expected ${row.expectedDays} eligible days`);
  }

  const compDiff = round2(row.totalDaysSummed - row.cdReconstructed);
  if (Math.abs(compDiff) > TOLERANCE) {
    reasons.push(`Stored totals vs contributingDates mismatch (diff ${compDiff}): stored=${row.totalDaysSummed}, from CD=${row.cdReconstructed}`);
  }

  const dailyDiff = round2(row.totalDaysSummed - row.dailyReconstructed);
  if (Math.abs(dailyDiff) > TOLERANCE && row.dailyRecordsCount > 0) {
    reasons.push(`Stored totals vs daily grid mismatch (diff ${dailyDiff}): stored=${row.totalDaysSummed}, from daily=${row.dailyReconstructed}`);
  }

  if (row.partialDays > 0) {
    reasons.push(`Has partial days (${row.partialDays}) — may affect present rollup`);
  }
  if (row.sandwichStripped > 0) {
    reasons.push(`Sandwich stripping affected ${row.sandwichStripped} day(s) — WO/HOL stripped to absent/LOP`);
  }

  const emptyInBounds = row.dailySums?.empty || 0;
  if (emptyInBounds > 0) {
    reasons.push(`${emptyInBounds} in-bounds calendar day(s) have no daily record / empty status`);
  }

  if (diff > TOLERANCE && reasons.length === 0) {
    reasons.push(`Over-count by ${diff} — likely double-counting (partial+present overlap, or leave+absent on same day)`);
  }
  if (diff < -TOLERANCE && reasons.length <= 1) {
    reasons.push(`Under-count by ${Math.abs(diff)} — missing classification for some eligible days`);
  }

  return reasons;
}

async function main() {
  await mongoose.connect(process.env.MONGODB_URI);
  console.log('Auditing Total Days for month:', MONTH);
  console.log('Formula: present + WO + HOL + leaves + OD + absent\n');

  const prs = await PayRegisterSummary.find({ month: MONTH })
    .select('emp_no employeeId totals totalDaysInMonth startDate endDate dailyRecords contributingDates')
    .lean();

  const empIds = [...new Set(prs.map((p) => String(p.employeeId)))];
  const employees = await Employee.find({ _id: { $in: empIds } })
    .select('emp_no employee_name doj leftDate')
    .lean();
  const empMap = new Map(employees.map((e) => [String(e._id), e]));

  const masDocs = await MonthlyAttendanceSummary.find({ month: MONTH })
    .select('emp_no totalPartialDays sandwichAudit contributingDates totals totalPresentDays totalWeeklyOffs totalHolidays totalLeaves totalPaidLeaves totalLopLeaves totalODs totalAbsentDays')
    .lean();
  const masMap = new Map(masDocs.map((m) => [m.emp_no, m]));

  const mismatches = [];
  const allRows = [];

  for (const pr of prs) {
    const emp = empMap.get(String(pr.employeeId));
    const dojStr = fmtDate(emp?.doj);
    const leftDateStr = fmtDate(emp?.leftDate);
    const startDate = pr.startDate;
    const endDate = pr.endDate;
    const totalDaysInMonth = pr.totalDaysInMonth || getAllDatesInRange(startDate, endDate).length;
    const expectedDays = countEligibleDays(startDate, endDate, dojStr, leftDateStr);

    const totals = pr.totals || {};
    const totalDaysSummed = computeTotalDaysSummed(totals);

    const mas = masMap.get(pr.emp_no);
    const cd = mas?.contributingDates || pr.contributingDates || {};
    const cdSums = sumContributingDates(cd);
    const cdReconstructed = round2(
      cdSums.present +
        cdSums.partial +
        cdSums.weeklyOffs +
        cdSums.holidays +
        cdSums.leaves +
        cdSums.ods +
        cdSums.absent
    );

    const dailySums = sumFromDailyRecords(pr.dailyRecords, startDate, endDate, dojStr, leftDateStr);
    const dailyReconstructed = round2(
      dailySums.present + dailySums.partial + dailySums.wo + dailySums.hol + dailySums.leave + dailySums.absent
    );

    const sandwichStripped = (mas?.sandwichAudit || []).filter(
      (s) => s?.effect === 'strip_non_working' || s?.effect === 'strip_non_working_add_lop'
    ).length;

    const row = {
      emp_no: pr.emp_no,
      name: emp?.employee_name || '-',
      dojStr,
      leftDateStr,
      startDate,
      endDate,
      totalDaysInMonth,
      expectedDays,
      totalDaysSummed,
      present: round2(Number(totals.totalPresentDays) || 0),
      weekOffs: round2(Number(totals.totalWeeklyOffs) || 0),
      holidays: round2(Number(totals.totalHolidays) || 0),
      totalLeaves: getLeaveTotal(totals),
      od: round2(Number(totals.totalODDays ?? totals.totalODs) || 0),
      absent: round2(Number(totals.totalAbsentDays) || 0),
      partialDays: round2(Number(mas?.totalPartialDays) || cdSums.partial || 0),
      cdReconstructed,
      dailyReconstructed,
      dailyRecordsCount: (pr.dailyRecords || []).length,
      dailySums,
      sandwichStripped,
      diffFromExpected: round2(totalDaysSummed - expectedDays),
      diffFrom31: round2(totalDaysSummed - totalDaysInMonth),
    };

    allRows.push(row);

    if (Math.abs(row.diffFromExpected) > TOLERANCE || Math.abs(row.diffFrom31) > TOLERANCE) {
      row.reasons = diagnoseMismatch(row);
      mismatches.push(row);
    }
  }

  mismatches.sort((a, b) => Math.abs(b.diffFromExpected) - Math.abs(a.diffFromExpected));

  console.log(`Total employees in pay register: ${prs.length}`);
  console.log(`Employees with totalDaysSummed != expected eligible days: ${mismatches.length}\n`);

  const not31 = mismatches.filter((r) => Math.abs(r.diffFrom31) > TOLERANCE);
  console.log(`--- Employees where totalDaysSummed != totalDaysInMonth (${totalDaysInMonth(prs[0])}) ---`);
  console.log(`Count: ${not31.length}\n`);

  for (const r of not31) {
    console.log('='.repeat(80));
    console.log(`${r.emp_no} | ${r.name}`);
    console.log(`DOJ: ${r.dojStr || 'N/A'} | LWD: ${r.leftDateStr || 'N/A'}`);
    console.log(`Period: ${r.startDate} → ${r.endDate} (${r.totalDaysInMonth} calendar days, ${r.expectedDays} eligible after DOJ/LWD)`);
    console.log(
      `Components: P=${r.present} WO=${r.weekOffs} HOL=${r.holidays} L=${r.totalLeaves} OD=${r.od} A=${r.absent} => Total=${r.totalDaysSummed}`
    );
    console.log(`Expected eligible: ${r.expectedDays} | Diff from expected: ${r.diffFromExpected} | Diff from month days: ${r.diffFrom31}`);
    console.log(`From contributingDates: ${r.cdReconstructed} | From daily grid: ${r.dailyReconstructed} | Partial: ${r.partialDays} | Sandwich stripped: ${r.sandwichStripped}`);
    if (r.dailySums) {
      console.log(
        `Daily breakdown (in-bounds): P=${r.dailySums.present} partial=${r.dailySums.partial} WO=${r.dailySums.wo} HOL=${r.dailySums.hol} L=${r.dailySums.leave} A=${r.dailySums.absent} empty=${r.dailySums.empty} outOfBounds=${r.dailySums.outOfBounds}`
      );
    }
    const valid = Math.abs(r.diffFromExpected) <= TOLERANCE;
    console.log(`VALIDATION: ${valid ? '✓ SATISFIED (matches expected eligible days)' : '✗ NOT SATISFIED'}`);
    console.log('Reasons:');
    for (const reason of r.reasons || []) console.log(`  - ${reason}`);
    console.log('');
  }

  await mongoose.disconnect();
}

function totalDaysInMonth(pr) {
  return pr?.totalDaysInMonth || 31;
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
