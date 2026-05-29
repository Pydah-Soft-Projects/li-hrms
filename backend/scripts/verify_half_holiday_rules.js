/**
 * Verify half-day holiday rules against live DB:
 * 1) Half HOL + full-day-looking present → HALF_DAY, payable <= 0.5
 * 2) Half HOL + half OD on holiday half → rejected (or blocked)
 * 3) Half HOL + full-day OD → narrowed to working half
 *
 * Run: node scripts/verify_half_holiday_rules.js
 * Optional: VERIFY_REPROCESS=1 to reprocess + recalc before check
 */
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });

const mongoose = require('mongoose');
const { connectMongoDB, closeMongoDB } = require('../config/database');
const PreScheduledShift = require('../shifts/model/PreScheduledShift');
const AttendanceDaily = require('../attendance/model/AttendanceDaily');
const OD = require('../leaves/model/OD');
const Employee = require('../employees/model/Employee');
const AttendanceSettings = require('../attendance/model/AttendanceSettings');
const { parseRosterHalfNonWorking } = require('../shifts/utils/rosterHalfNonWorking');
const { reprocessAttendanceForEmployeeDate } = require('../attendance/services/attendanceSyncService');
const summaryCalculationService = require('../attendance/services/summaryCalculationService');
const { runLeaveAttendanceReconciliation } = require('../leaves/services/leaveAttendanceReconciliationService');
const {
  getRosterHalfHolidayForEmployeeDate,
  NARROW_REMARK,
  REJECT_SAME_HALF_REMARK,
} = require('../leaves/services/odHalfHolidayRosterService');
const { extractISTComponents } = require('../shared/utils/dateUtils');

const DO_REPROCESS = process.env.VERIFY_REPROCESS === '1';
const LIMIT = Number(process.env.VERIFY_LIMIT) || 80;

function holidayHalfLabel(parsed) {
  if (parsed.firstHOL) return 'first_half';
  if (parsed.secondHOL) return 'second_half';
  return null;
}

function workingHalf(holHalf) {
  return holHalf === 'first_half' ? 'second_half' : 'first_half';
}

async function findHalfHolidayRosterRows() {
  const rows = await PreScheduledShift.find({
    $or: [{ firstHalfStatus: 'HOL' }, { secondHalfStatus: 'HOL' }],
    status: { $nin: ['HOL'] },
  })
    .select('employeeNumber date shiftId firstHalfStatus secondHalfStatus status')
    .sort({ date: -1 })
    .limit(LIMIT * 3)
    .lean();

  return rows.filter((r) => {
    const p = parseRosterHalfNonWorking(r);
    return (p.firstHOL || p.secondHOL) && !p.isFullHOL;
  }).slice(0, LIMIT);
}

async function inspectCase(row) {
  const empNo = String(row.employeeNumber || '').toUpperCase();
  const dateStr = String(row.date || '').substring(0, 10);
  const parsed = parseRosterHalfNonWorking(row);
  const holHalf = holidayHalfLabel(parsed);
  const workHalf = workingHalf(holHalf);

  const daily = await AttendanceDaily.findOne({ employeeNumber: empNo, date: dateStr })
    .select('status payableShifts totalWorkingHours notes rosterFirstHalfNonWorking rosterSecondHalfNonWorking policyMeta')
    .lean();

  const dayStart = new Date(`${dateStr}T00:00:00+05:30`);
  const dayEnd = new Date(`${dateStr}T23:59:59+05:30`);
  const emp = await Employee.findOne({ emp_no: empNo }).select('_id emp_no').lean();

  const ods = emp
    ? await OD.find({
        employeeId: emp._id,
        fromDate: { $lte: dayEnd },
        toDate: { $gte: dayStart },
        isActive: { $ne: false },
      })
        .select('status isHalfDay halfDayType odType_extended numberOfDays remarks fromDate toDate')
        .lean()
    : [];

  const ctx = await getRosterHalfHolidayForEmployeeDate(empNo, dateStr);

  return {
    empNo,
    dateStr,
    holHalf,
    workHalf,
    hasShift: !!row.shiftId,
    daily: daily
      ? {
          status: daily.status,
          payable: daily.payableShifts,
          hours: daily.totalWorkingHours,
          notes: (daily.notes || '').slice(0, 120),
        }
      : null,
    ods: ods.map((o) => ({
      status: o.status,
      half: o.halfDayType,
      ext: o.odType_extended,
      days: o.numberOfDays,
      remarkHasNarrow: String(o.remarks || '').includes('Narrowed due to half-day holiday'),
      remarkHasReject: String(o.remarks || '').includes(REJECT_SAME_HALF_REMARK.slice(0, 20)),
    })),
    ctxOk: ctx.hasHalfHoliday,
  };
}

function classifyExpectations(c) {
  const issues = [];
  const ok = [];

  if (!c.ctxOk) issues.push('getRosterHalfHolidayForEmployeeDate returned false');

  if (c.daily) {
    const st = String(c.daily.status || '').toUpperCase();
    const pay = Number(c.daily.payable) || 0;
    const hrs = Number(c.daily.hours) || 0;

    if (st === 'HOLIDAY' && pay === 0) {
      ok.push('worked holiday half → HOLIDAY/0');
    } else if (st === 'HALF_DAY' && pay <= 0.5 + 1e-6) {
      ok.push('working half → HALF_DAY/0.5');
    } else if (st === 'PRESENT' && pay > 0.5 + 1e-6 && hrs > 0) {
      issues.push(`full-day-looking PRESENT payable=${pay} (expected <=0.5 or HALF_DAY)`);
    } else if (st === 'PARTIAL' && pay === 0 && hrs === 0) {
      ok.push('no punch half-hol → PARTIAL/0');
    } else if (pay > 0.5 + 1e-6) {
      issues.push(`payable=${pay} > 0.5 on half-hol day`);
    } else {
      ok.push(`daily ${st} pay=${pay}`);
    }
  }

  for (const o of c.ods) {
    const st = String(o.status || '');
    if (st === 'approved' || st === 'pending' || st.includes('approved')) {
      if (!o.half && Number(o.days) >= 1 - 1e-6) {
        issues.push(`full-day OD still full (status=${st}, days=${o.days})`);
      } else if (o.half === c.holHalf && st !== 'rejected') {
        issues.push(`half OD on holiday half not rejected (${o.half}, status=${st})`);
      } else if (o.half === c.workHalf || o.remarkHasNarrow) {
        ok.push(`OD on working half or narrowed (${o.half}, ${st})`);
      } else if (Number(o.days) === 0.5 && o.half === c.workHalf) {
        ok.push('half OD working half');
      }
    }
    if (st === 'rejected' && o.half === c.holHalf) {
      ok.push('half OD on hol half rejected');
    }
  }

  return { issues, ok };
}

async function reprocessCase(empNo, dateStr) {
  const emp = await Employee.findOne({ emp_no: empNo }).lean();
  if (!emp) return { reprocess: 'no_employee' };

  if (DO_REPROCESS) {
    try {
      await reprocessAttendanceForEmployeeDate(empNo, dateStr);
    } catch (e) {
      return { reprocess: `err:${e.message}` };
    }
    const daily = await AttendanceDaily.findOne({ employeeNumber: empNo, date: dateStr });
    if (daily && emp) {
      await runLeaveAttendanceReconciliation(emp, dateStr, daily);
    }
    try {
      await summaryCalculationService.recalculateOnAttendanceUpdate(empNo, dateStr);
    } catch (e) {
      return { reprocess: `recalc_err:${e.message}` };
    }
    return { reprocess: 'done' };
  }
  return { reprocess: 'skipped' };
}

async function main() {
  console.log('=== Half-holiday rule verification (live DB) ===\n');
  console.log(`VERIFY_REPROCESS=${DO_REPROCESS ? '1 (will reprocess+recalc)' : '0 (inspect only)'}`);
  console.log(`VERIFY_LIMIT=${LIMIT}\n`);

  await connectMongoDB();
  const mode = AttendanceSettings.getProcessingMode(await AttendanceSettings.getSettings());
  console.log(`Attendance processing mode: ${mode.mode}\n`);

  const rosterRows = await findHalfHolidayRosterRows();
  console.log(`Found ${rosterRows.length} half-holiday roster row(s) to inspect.\n`);

  if (rosterRows.length === 0) {
    console.log('No half-holiday roster rows in DB. Nothing to verify.');
    await closeMongoDB();
    return;
  }

  const buckets = {
    withDaily: [],
    withOd: [],
    fullDayPresentIssue: [],
    odIssue: [],
    allOk: [],
  };

  let reprocessed = 0;

  for (const row of rosterRows) {
    const empNo = String(row.employeeNumber || '').toUpperCase();
    const dateStr = String(row.date || '').substring(0, 10);

    if (DO_REPROCESS) {
      await reprocessCase(empNo, dateStr);
      reprocessed += 1;
    }

    const c = await inspectCase(row);
    const { issues, ok } = classifyExpectations(c);

    const line = {
      ...c,
      issues,
      ok,
    };

    if (c.daily) buckets.withDaily.push(line);
    if (c.ods.length) buckets.withOd.push(line);

    const hasPresentIssue = issues.some((i) => i.includes('full-day-looking') || i.includes('payable='));
    const hasOdIssue = issues.some((i) => i.includes('OD'));

    if (hasPresentIssue) buckets.fullDayPresentIssue.push(line);
    if (hasOdIssue) buckets.odIssue.push(line);
    if (issues.length === 0) buckets.allOk.push(line);
  }

  console.log('--- Summary ---');
  console.log(`Roster half-HOL rows inspected: ${rosterRows.length}`);
  console.log(`With AttendanceDaily: ${buckets.withDaily.length}`);
  console.log(`With OD record(s): ${buckets.withOd.length}`);
  console.log(`Fully OK (no issues): ${buckets.allOk.length}`);
  console.log(`Present/payable issues: ${buckets.fullDayPresentIssue.length}`);
  console.log(`OD issues: ${buckets.odIssue.length}`);
  if (DO_REPROCESS) console.log(`Reprocessed+reconciled+recalc: ${reprocessed}`);

  const printSample = (title, arr, n = 8) => {
    if (!arr.length) return;
    console.log(`\n--- ${title} (up to ${n}) ---`);
    for (const x of arr.slice(0, n)) {
      console.log(
        JSON.stringify({
          emp: x.empNo,
          date: x.dateStr,
          holHalf: x.holHalf,
          daily: x.daily,
          ods: x.ods,
          issues: x.issues,
          ok: x.ok,
        })
      );
    }
  };

  printSample('ISSUES: full-day present / payable', buckets.fullDayPresentIssue);
  printSample('ISSUES: OD', buckets.odIssue);
  printSample('OK samples', buckets.allOk);

  if (buckets.fullDayPresentIssue.length > 0 && !DO_REPROCESS) {
    console.log('\nTip: Re-run with VERIFY_REPROCESS=1 to reprocess attendance + recalc summary for these rows.');
  }

  await closeMongoDB();
  process.exit(
    buckets.fullDayPresentIssue.length + buckets.odIssue.length > 0 ? 1 : 0
  );
}

main().catch(async (e) => {
  console.error(e);
  try {
    await closeMongoDB();
  } catch (_) {}
  process.exit(1);
});
