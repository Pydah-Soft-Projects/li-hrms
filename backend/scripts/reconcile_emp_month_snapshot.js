/**
 * Snapshot + optional apply reconciliation for one employee / payroll month.
 * Usage:
 *   node scripts/reconcile_emp_month_snapshot.js --emp=1613 --month=2026-04
 *   node scripts/reconcile_emp_month_snapshot.js --emp=1613 --month=2026-04 --apply
 */
require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
const mongoose = require('mongoose');
const Employee = require('../employees/model/Employee');
const AttendanceDaily = require('../attendance/model/AttendanceDaily');
const MonthlyAttendanceSummary = require('../attendance/model/MonthlyAttendanceSummary');
const Leave = require('../leaves/model/Leave');
const OD = require('../leaves/model/OD');
const AttendanceSettings = require('../attendance/model/AttendanceSettings');
const dateCycleService = require('../leaves/services/dateCycleService');
const { createISTDate, extractISTComponents } = require('../shared/utils/dateUtils');
const { computeRawAttendanceHalfCreditsSync } = require('../attendance/utils/attendanceHalfPresence');
const { _REMARK_PREFIX: REMARK_PREFIX } = require('../leaves/services/leaveAttendanceReconciliationService');
const { recalculateOnAttendanceUpdate } = require('../attendance/services/summaryCalculationService');

function parseArgs() {
  const out = { emp: '1613', month: '2026-04', apply: false };
  for (const raw of process.argv.slice(2)) {
    if (raw.startsWith('--emp=')) out.emp = raw.slice(6);
    else if (raw.startsWith('--month=')) out.month = raw.slice(8);
    else if (raw === '--apply') out.apply = true;
  }
  return out;
}

async function buildSnapshot(employeeId, empNo, startDateStr, endDateStr, processingMode) {
  const dayStart = createISTDate(startDateStr, '00:00');
  const dayEnd = createISTDate(endDateStr, '23:59');

  const leaves = await Leave.find({
    employeeId,
    fromDate: { $lte: dayEnd },
    toDate: { $gte: dayStart },
  })
    .select('fromDate toDate status isHalfDay halfDayType numberOfDays leaveType remarks')
    .lean();

  const dailies = await AttendanceDaily.find({
    employeeNumber: empNo,
    date: { $gte: startDateStr, $lte: endDateStr },
  })
    .select('date status payableShifts shifts totalLateInMinutes totalEarlyOutMinutes')
    .sort({ date: 1 })
    .lean();

  const conflicts = [];
  for (const d of dailies) {
    const ods = await OD.find({
      employeeId,
      status: 'approved',
      fromDate: { $lte: createISTDate(d.date, '23:59') },
      toDate: { $gte: createISTDate(d.date, '00:00') },
    })
      .select('isHalfDay halfDayType odType_extended')
      .lean();
    const { attFirst, attSecond } = computeRawAttendanceHalfCreditsSync(d, ods, { processingMode });
    const p1 = attFirst >= 0.5 ? 0.5 : 0;
    const p2 = attSecond >= 0.5 ? 0.5 : 0;

    for (const L of leaves) {
      if (L.status !== 'approved') continue;
      const fs = extractISTComponents(L.fromDate).dateStr;
      const ts = extractISTComponents(L.toDate).dateStr;
      if (d.date < fs || d.date > ts) continue;

      const l1 = L.isHalfDay ? (L.halfDayType === 'second_half' ? 0 : 0.5) : 0.5;
      const l2 = L.isHalfDay ? (L.halfDayType === 'second_half' ? 0.5 : 0) : 0.5;
      let action = 'none';
      if (L.isHalfDay) {
        const onFirst = l1 > 0;
        if ((onFirst && p1 >= 0.5) || (!onFirst && p2 >= 0.5)) action = 'rejected_half';
      } else if (p1 >= 0.5 && p2 >= 0.5) action = 'rejected_full';
      else if (p1 >= 0.5 && p2 < 0.5) action = 'narrowed_second';
      else if (p2 >= 0.5 && p1 < 0.5) action = 'narrowed_first';

      if (action !== 'none') {
        conflicts.push({
          date: d.date,
          leaveType: L.leaveType,
          leaveHalf: L.isHalfDay ? L.halfDayType : 'full',
          leaveStatus: L.status,
          dailyStatus: d.status,
          attFirst,
          attSecond,
          expectedAction: action,
          hasReconRemark: String(L.remarks || '').includes(REMARK_PREFIX),
        });
      }
    }
  }

  return {
    leaves: leaves.map((L) => ({
      from: extractISTComponents(L.fromDate).dateStr,
      to: extractISTComponents(L.toDate).dateStr,
      status: L.status,
      type: L.leaveType,
      half: L.isHalfDay ? L.halfDayType : null,
      days: L.numberOfDays,
      hasReconRemark: String(L.remarks || '').includes(REMARK_PREFIX),
    })),
    partialDays: dailies
      .filter((d) => d.status === 'PARTIAL')
      .map((d) => {
        const { attFirst, attSecond } = computeRawAttendanceHalfCreditsSync(d, [], { processingMode });
        return { date: d.date, attFirst, attSecond, payable: d.payableShifts };
      }),
    conflicts,
  };
}

async function main() {
  const args = parseArgs();
  await mongoose.connect(process.env.MONGODB_URI);

  const employee = await Employee.findOne({
    $or: [{ emp_no: args.emp }, { emp_no: String(args.emp).toUpperCase() }],
  }).lean();
  if (!employee) {
    console.error('Employee not found:', args.emp);
    process.exit(1);
  }

  const anchor = createISTDate(`${args.month}-15`, '12:00');
  const { payrollCycle } = await dateCycleService.getPeriodInfo(anchor);
  const startDateStr = extractISTComponents(payrollCycle.startDate).dateStr;
  const endDateStr = extractISTComponents(payrollCycle.endDate).dateStr;
  const empNo = String(employee.emp_no).trim().toUpperCase();

  const attSettings = await AttendanceSettings.getSettings();
  const processingMode =
    attSettings?.processingMode?.mode === 'single_shift' ? 'single_shift' : 'multi_shift';

  const summaryBefore = await MonthlyAttendanceSummary.findOne({
    employeeId: employee._id,
    month: args.month,
  })
    .select('totalPresentDays totalPayableShifts totalLeaves totalPartialDays lastCalculatedAt')
    .lean();

  const before = await buildSnapshot(employee._id, empNo, startDateStr, endDateStr, processingMode);

  console.log('=== Employee 1613 — April 2026 pay period ===');
  console.log('Window:', startDateStr, 'to', endDateStr, '| mode:', processingMode);
  console.log('\n--- BEFORE apply ---');
  console.log('Summary:', summaryBefore || '(none)');
  console.log('Leaves:', JSON.stringify(before.leaves, null, 2));
  console.log('Partial days (new half rules):', before.partialDays);
  console.log('Expected reconciliation actions:', before.conflicts);

  if (!args.apply) {
    console.log('\nPass --apply to run reconciliation for all attendance days in this window.');
    await mongoose.disconnect();
    return;
  }

  const rows = await AttendanceDaily.find({
    employeeNumber: empNo,
    date: { $gte: startDateStr, $lte: endDateStr },
  })
    .select('date')
    .lean();

  console.log('\nApplying reconciliation on', rows.length, 'attendance day(s)...');
  for (const row of rows) {
    await recalculateOnAttendanceUpdate(empNo, row.date);
  }

  const summaryAfter = await MonthlyAttendanceSummary.findOne({
    employeeId: employee._id,
    month: args.month,
  })
    .select('totalPresentDays totalPayableShifts totalLeaves totalPartialDays lastCalculatedAt')
    .lean();

  const after = await buildSnapshot(employee._id, empNo, startDateStr, endDateStr, processingMode);

  console.log('\n--- AFTER apply ---');
  console.log('Summary:', summaryAfter || '(none)');
  console.log('Leaves:', JSON.stringify(after.leaves, null, 2));
  console.log('Partial days:', after.partialDays);
  console.log('Remaining expected conflicts:', after.conflicts);

  console.log('\n--- DIFF ---');
  console.log('Summary change:', {
    present: [summaryBefore?.totalPresentDays, summaryAfter?.totalPresentDays],
    payable: [summaryBefore?.totalPayableShifts, summaryAfter?.totalPayableShifts],
    leaves: [summaryBefore?.totalLeaves, summaryAfter?.totalLeaves],
  });
  for (const b of before.leaves) {
    const a = after.leaves.find(
      (x) => x.from === b.from && x.to === b.to && x.type === b.type && x.half === b.half
    );
    if (a && a.status !== b.status) {
      console.log('Leave status changed:', b.from, b.type, b.half, b.status, '->', a.status);
    }
  }

  await mongoose.disconnect();
  console.log('\nDone.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
