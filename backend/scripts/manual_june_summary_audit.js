/**
 * INDEPENDENT manual monthly summary for June 2026 — does NOT call calculateMonthlySummary.
 * Reimplements single-shift day logic from raw AttendanceDaily + roster + leave + OD.
 *
 * Usage: node scripts/manual_june_summary_audit.js
 */

require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
const Employee = require('../employees/model/Employee');
const AttendanceDaily = require('../attendance/model/AttendanceDaily');
const Leave = require('../leaves/model/Leave');
const LeaveSplit = require('../leaves/model/LeaveSplit');
const OD = require('../leaves/model/OD');
const PreScheduledShift = require('../shifts/model/PreScheduledShift');
const MonthlyAttendanceSummary = require('../attendance/model/MonthlyAttendanceSummary');
const dateCycleService = require('../leaves/services/dateCycleService');
const { createISTDate, extractISTComponents, getAllDatesInRange } = require('../shared/utils/dateUtils');
const { parseRosterHalfNonWorking } = require('../shifts/utils/rosterHalfNonWorking');

const MONTH_STR = process.env.MONTH || '2026-06';
const [YEAR, MONTH_NUM] = MONTH_STR.split('-').map(Number);

function toDateStr(v) {
  if (!v) return '';
  if (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}/.test(v)) return v.slice(0, 10);
  return extractISTComponents(new Date(v)).dateStr;
}

function leaveUnit(l) {
  if (!l) return 0;
  if (l.isHalfDay) return 0.5;
  const nd = Number(l.numberOfDays);
  if (Number.isFinite(nd) && nd > 0 && nd < 1) return nd;
  return 1;
}

function isOutsideEmployment(dStr, dojStr, leftStr) {
  if (dojStr && dStr < dojStr) return true;
  if (leftStr && dStr > leftStr) return true;
  return false;
}

/** Manual single-shift day engine (no service imports). */
function processDay(dStr, ctx) {
  const { day, todayIstStr, dojStr, leftStr } = ctx;
  if (isOutsideEmployment(dStr, dojStr, leftStr)) {
    return { present: 0, payable: 0, absent: 0, leave: 0, od: 0, wo: 0, hol: 0, partial: 0 };
  }

  const att = day.attendance;
  const leaves = day.leaves || [];
  const ods = day.ods || [];
  let wo = day.isWO ? 1 : 0;
  let hol = day.isHOL ? 1 : 0;
  if (!day.isHOL) {
    if (day.rosterFirstHalfHOL) hol += 0.5;
    if (day.rosterSecondHalfHOL) hol += 0.5;
  }

  // Leave on WO/HOL strips non-working for that day (summary rule)
  if (leaves.length > 0 && (day.isWO || day.isHOL)) {
    wo = 0;
    hol = 0;
  }

  let leaveContrib = Math.min(1, leaves.reduce((s, l) => s + leaveUnit(l), 0));

  let attFirst = 0;
  let attSecond = 0;
  if (att && !day.isWO && !day.isHOL) {
    const st = String(att.status || '').toUpperCase();
    if (st === 'PRESENT') {
      attFirst = 0.5;
      attSecond = 0.5;
    } else if (st === 'HALF_DAY') {
      attFirst = 0.5;
      attSecond = 0;
    } else if (st === 'PARTIAL') {
      const pay = Number(att.payableShifts) || 0;
      if (pay >= 0.5) {
        attFirst = 0.5;
        attSecond = 0;
      }
    }
  }

  let odFirst = 0;
  let odSecond = 0;
  let hasFullOd = false;
  if (ods.length > 0 && !day.isWO && !day.isHOL) {
    for (const od of ods) {
      if (od.odType_extended === 'hours') continue;
      const full = !od.isHalfDay && String(od.odType_extended || '') !== 'hours';
      if (full || od.odType_extended === 'full_day') {
        odFirst = 0.5;
        odSecond = 0.5;
        hasFullOd = true;
      } else if (od.halfDayType === 'second_half') odSecond = 0.5;
      else odFirst = 0.5;
    }
  }
  if (hasFullOd) {
    attFirst = 0;
    attSecond = 0;
  }

  // Half roster holiday cap
  if (day.rosterFirstHalfHOL && !day.isHOL) odFirst = 0;
  if (day.rosterSecondHalfHOL && !day.isHOL) odSecond = 0;

  let dayPresent = Math.min(Math.max(0, attFirst - odFirst) + Math.max(0, attSecond - odSecond), 1);
  if (att && String(att.status).toUpperCase() === 'PARTIAL') dayPresent = Math.min(dayPresent, 0.5);

  const odCredit = Math.min(1, odFirst + odSecond);
  let dayPayable = Math.min(Math.max(attFirst, odFirst) + Math.max(attSecond, odSecond), 1);
  if (att && !day.isWO && !day.isHOL) {
    const ap = Number(att.payableShifts);
    if (Number.isFinite(ap) && ap >= 0) dayPayable = Math.max(dayPayable, ap);
    dayPayable = Math.min(dayPayable, 1);
  }

  let partialLop = 0;
  let partialPay = 0;
  const isPartial = att && String(att.status).toUpperCase() === 'PARTIAL' && !day.isWO && !day.isHOL;
  if (isPartial && leaveContrib < 0.999 && !hasFullOd) {
    const punchLeave = Math.min(1, dayPayable + leaveContrib);
    partialLop = Math.round(Math.max(0, 1 - punchLeave) * 100) / 100;
    partialPay = Math.round(dayPayable * 100) / 100;
    leaveContrib += partialLop;
  }

  if (isPartial && leaveContrib >= 0.999) dayPayable = 0;

  let absent = 0;
  if (!day.isWO && !day.isHOL && dStr <= todayIstStr) {
    const lf = 0;
    const ls = 0;
    let leaveFirst = 0;
    let leaveSecond = 0;
    for (const l of leaves) {
      const u = leaveUnit(l);
      if (u < 1) {
        if (l.halfDayType === 'second_half') leaveSecond = 0.5;
        else leaveFirst = 0.5;
      } else {
        leaveFirst = 0.5;
        leaveSecond = 0.5;
      }
    }
    const mergedFirst = Math.max(attFirst, odFirst, leaveFirst, day.rosterFirstHalfHOL ? 0.5 : 0, day.rosterFirstHalfWO ? 0.5 : 0);
    const mergedSecond = Math.max(attSecond, odSecond, leaveSecond, day.rosterSecondHalfHOL ? 0.5 : 0, day.rosterSecondHalfWO ? 0.5 : 0);
    let covered = Math.min(mergedFirst + mergedSecond, 1);
    if (isPartial) covered = Math.min(1, covered + dayPayable + partialLop);
    absent = Math.round(Math.max(0, 1 - covered) * 100) / 100;
  }

  return {
    present: Math.round(dayPresent * 100) / 100,
    payable: Math.round(dayPayable * 100) / 100,
    absent,
    leave: Math.round(leaveContrib * 100) / 100,
    od: Math.round(odCredit * 100) / 100,
    wo: Math.round(wo * 100) / 100,
    hol: Math.round(hol * 100) / 100,
    partial: partialPay,
  };
}

async function manualCalcForEmployee(emp, startDate, endDate, allDates) {
  const empNo = String(emp.emp_no).trim().toUpperCase();
  const dojStr = emp.doj ? toDateStr(emp.doj) : null;
  const leftStr = emp.leftDate ? toDateStr(emp.leftDate) : null;
  const todayIstStr = extractISTComponents(new Date()).dateStr;
  const payrollStart = createISTDate(startDate);
  const payrollEnd = createISTDate(endDate, '23:59');

  const [dailies, rosterRows, leaves, leaveSplits, ods] = await Promise.all([
    AttendanceDaily.find({ employeeNumber: empNo, date: { $gte: startDate, $lte: endDate } })
      .select('date status payableShifts shifts')
      .lean(),
    PreScheduledShift.find({ employeeNumber: empNo, date: { $gte: startDate, $lte: endDate } })
      .select('date status firstHalfStatus secondHalfStatus')
      .lean(),
    Leave.find({
      employeeId: emp._id,
      status: 'approved',
      isActive: true,
      fromDate: { $lte: payrollEnd },
      toDate: { $gte: payrollStart },
    })
      .select('fromDate toDate isHalfDay halfDayType numberOfDays leaveNature')
      .lean(),
    LeaveSplit.find({
      employeeId: emp._id,
      status: 'approved',
      date: { $gte: payrollStart, $lte: payrollEnd },
    })
      .select('leaveId date isHalfDay halfDayType numberOfDays leaveNature')
      .lean(),
    OD.find({
      employeeId: emp._id,
      status: 'approved',
      isActive: true,
      fromDate: { $lte: payrollEnd },
      toDate: { $gte: payrollStart },
    })
      .select('fromDate toDate isHalfDay odType_extended halfDayType numberOfDays')
      .lean(),
  ]);

  const dayMap = new Map();
  for (const d of allDates) {
    dayMap.set(d, {
      attendance: null,
      leaves: [],
      ods: [],
      isWO: false,
      isHOL: false,
      rosterFirstHalfHOL: false,
      rosterSecondHalfHOL: false,
      rosterFirstHalfWO: false,
      rosterSecondHalfWO: false,
    });
  }

  for (const r of rosterRows) {
    const dk = toDateStr(r.date);
    const day = dayMap.get(dk);
    if (!day) continue;
    const p = parseRosterHalfNonWorking(r);
    if (p.isFullWO) day.isWO = true;
    if (p.isFullHOL) day.isHOL = true;
    if (p.firstHOL) day.rosterFirstHalfHOL = true;
    if (p.secondHOL) day.rosterSecondHalfHOL = true;
    if (p.firstWO) day.rosterFirstHalfWO = true;
    if (p.secondWO) day.rosterSecondHalfWO = true;
  }

  for (const d of dailies) {
    const dk = toDateStr(d.date);
    const day = dayMap.get(dk);
    if (day) day.attendance = d;
  }

  const splitKeys = new Set(leaveSplits.map((s) => `${String(s.leaveId)}_${toDateStr(s.date)}`));
  for (const lv of leaves) {
    const range = getAllDatesInRange(toDateStr(lv.fromDate), toDateStr(lv.toDate));
    const lid = String(lv._id);
    for (const d of range) {
      if (!dayMap.has(d)) continue;
      if (splitKeys.has(`${lid}_${d}`)) continue;
      dayMap.get(d).leaves.push(lv);
    }
  }
  for (const sp of leaveSplits) {
    const d = toDateStr(sp.date);
    if (dayMap.has(d)) dayMap.get(d).leaves.push(sp);
  }

  for (const od of ods) {
    if (od.odType_extended === 'hours') continue;
    const range = getAllDatesInRange(toDateStr(od.fromDate), toDateStr(od.toDate));
    for (const d of range) {
      if (dayMap.has(d)) dayMap.get(d).ods.push(od);
    }
  }

  const totals = {
    totalDaysInMonth: allDates.length,
    totalPresentDays: 0,
    totalPartialDays: 0,
    totalAbsentDays: 0,
    totalPayableShifts: 0,
    totalLeaves: 0,
    totalODs: 0,
    totalWeeklyOffs: 0,
    totalHolidays: 0,
  };

  for (const [dStr, day] of dayMap) {
    const r = processDay(dStr, { day, todayIstStr, dojStr, leftStr });
    totals.totalPresentDays += r.present;
    totals.totalPartialDays += r.partial;
    totals.totalAbsentDays += r.absent;
    totals.totalPayableShifts += r.payable;
    totals.totalLeaves += r.leave;
    totals.totalODs += r.od;
    totals.totalWeeklyOffs += r.wo;
    totals.totalHolidays += r.hol;
  }

  for (const k of Object.keys(totals)) {
    if (k === 'totalDaysInMonth') continue;
    totals[k] = Math.round(totals[k] * 100) / 100;
  }

  // Frontend "Total" column formula (payRegisterAllSummaryRow.ts)
  const presentMerged = Math.round((totals.totalPresentDays + totals.totalPartialDays) * 100) / 100;
  totals.totalDaysSummed = Math.round(
    (presentMerged + totals.totalWeeklyOffs + totals.totalHolidays + totals.totalLeaves + totals.totalODs + totals.totalAbsentDays) * 100
  ) / 100;

  return totals;
}

function near(a, b, tol = 0.05) {
  return Math.abs((a || 0) - (b || 0)) <= tol;
}

async function run() {
  await mongoose.connect(process.env.MONGODB_URI);
  const period = await dateCycleService.getPayrollCycleForMonth(YEAR, MONTH_NUM);
  const startDate = toDateStr(period.startDate);
  const endDate = toDateStr(period.endDate);
  const allDates = getAllDatesInRange(startDate, endDate);
  const expectedPeriodDays = allDates.length;

  console.log(`\n=== MANUAL audit (no service) — ${MONTH_STR} ===`);
  console.log(`Pay period: ${startDate} → ${endDate} = ${expectedPeriodDays} days\n`);

  const employees = await Employee.find({ is_active: { $ne: false } })
    .select('_id emp_no employee_name doj leftDate')
    .sort({ emp_no: 1 })
    .lean();

  const summaries = await MonthlyAttendanceSummary.find({ month: MONTH_STR }).lean();
  const summaryByEmp = new Map(summaries.map((s) => [String(s.emp_no), s]));

  const regular = employees.filter((e) => {
    const left = e.leftDate ? toDateStr(e.leftDate) : null;
    const doj = e.doj ? toDateStr(e.doj) : null;
    if (left && left < startDate) return false;
    if (doj && doj > endDate) return false;
    return true;
  });

  console.log(`Active employees: ${employees.length} | Regular (in period): ${regular.length}\n`);

  const issues = [];
  let periodDaysWrong = 0;
  let summedNot31 = 0;
  let manualVsStored = 0;

  for (let i = 0; i < regular.length; i++) {
    const emp = regular[i];
    const stored = summaryByEmp.get(String(emp.emp_no));
    const manual = await manualCalcForEmployee(emp, startDate, endDate, allDates);

    const storedPeriod = stored?.totalDaysInMonth ?? null;
    if (storedPeriod != null && storedPeriod !== expectedPeriodDays) periodDaysWrong++;

    const storedSummed = stored
      ? Math.round(
          ((stored.totalPresentDays || 0) +
            (stored.totalWeeklyOffs || 0) +
            (stored.totalHolidays || 0) +
            (stored.totalLeaves || 0) +
            (stored.totalODs || 0) +
            (stored.totalAbsentDays || 0)) *
            100
        ) / 100
      : null;

    if (Math.abs(manual.totalDaysSummed - expectedPeriodDays) > 0.1) summedNot31++;

    const fieldDiffs = {};
    for (const k of [
      'totalPresentDays',
      'totalAbsentDays',
      'totalPayableShifts',
      'totalLeaves',
      'totalODs',
      'totalWeeklyOffs',
      'totalHolidays',
    ]) {
      const sv = stored?.[k];
      const mv = manual[k];
      if (stored && !near(sv, mv)) {
        fieldDiffs[k] = { stored: sv, manual: mv, delta: Math.round((mv - sv) * 100) / 100 };
        manualVsStored++;
      }
    }

    const storedPeriodWrong = storedPeriod != null && storedPeriod !== expectedPeriodDays;
    const summedWrong = Math.abs(manual.totalDaysSummed - expectedPeriodDays) > 0.1;
    const storedSummedWrong = storedSummed != null && Math.abs(storedSummed - expectedPeriodDays) > 0.1;

    if (storedPeriodWrong || summedWrong || storedSummedWrong || Object.keys(fieldDiffs).length > 0) {
      issues.push({
        emp_no: emp.emp_no,
        name: emp.employee_name,
        expectedPeriodDays,
        storedPeriodDays: storedPeriod,
        manualTotalDaysSummed: manual.totalDaysSummed,
        storedTotalDaysSummed: storedSummed,
        manual,
        stored: stored
          ? {
              totalPresentDays: stored.totalPresentDays,
              totalAbsentDays: stored.totalAbsentDays,
              totalPayableShifts: stored.totalPayableShifts,
              totalLeaves: stored.totalLeaves,
              totalODs: stored.totalODs,
              totalWeeklyOffs: stored.totalWeeklyOffs,
              totalHolidays: stored.totalHolidays,
              totalDaysInMonth: stored.totalDaysInMonth,
            }
          : null,
        fieldDiffs,
      });
    }

    if ((i + 1) % 50 === 0) console.log(`  processed ${i + 1}/${regular.length}`);
  }

  const report = {
    month: MONTH_STR,
    period: { start: startDate, end: endDate, days: expectedPeriodDays },
    regularCount: regular.length,
    storedPeriodDaysNot31: periodDaysWrong,
    manualTotalDaysSummedNot31: summedNot31,
    issuesCount: issues.length,
    issues,
  };

  const out = path.resolve(__dirname, '../../tmp/manual-june-summary-audit.json');
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, JSON.stringify(report, null, 2));

  console.log('\n========== RESULTS ==========');
  console.log(`Expected period days: ${expectedPeriodDays}`);
  console.log(`Stored totalDaysInMonth ≠ ${expectedPeriodDays}: ${periodDaysWrong}`);
  console.log(`Manual totalDaysSummed ≠ ${expectedPeriodDays}: ${summedNot31} regular employees`);
  console.log(`Employees with any manual vs stored field diff: ${issues.filter((x) => Object.keys(x.fieldDiffs).length).length}`);
  console.log(`Total issue rows: ${issues.length}`);
  console.log(`Report: ${out}\n`);

  const periodOnly = issues.filter((x) => x.storedPeriodDays != null && x.storedPeriodDays !== expectedPeriodDays);
  if (periodOnly.length) {
    console.log(`--- totalDaysInMonth wrong in DB (should be ${expectedPeriodDays}) ---`);
    for (const r of periodOnly.slice(0, 15)) {
      console.log(`  ${r.emp_no}: stored=${r.storedPeriodDays}`);
    }
  }

  const summed = issues.filter((x) => Math.abs(x.manualTotalDaysSummed - expectedPeriodDays) > 0.1);
  console.log(`\n--- Manual totalDaysSummed ≠ ${expectedPeriodDays} (regular) ---`);
  for (const r of summed.slice(0, 15)) {
    console.log(
      `  ${r.emp_no} manual=${r.manualTotalDaysSummed} storedSummed=${r.storedTotalDaysSummed}`,
      `P=${r.manual.totalPresentDays} WO=${r.manual.totalWeeklyOffs} H=${r.manual.totalHolidays} L=${r.manual.totalLeaves} OD=${r.manual.totalODs} A=${r.manual.totalAbsentDays}`
    );
  }

  const diffs = issues.filter((x) => Object.keys(x.fieldDiffs).length > 0);
  console.log(`\n--- Manual vs stored field diffs (top 15) ---`);
  for (const r of diffs.slice(0, 15)) {
    console.log(`  ${r.emp_no}:`, JSON.stringify(r.fieldDiffs));
  }

  await mongoose.disconnect();
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
