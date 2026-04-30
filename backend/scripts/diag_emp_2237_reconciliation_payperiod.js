/**
 * Diagnose leave vs attendance reconciliation for one employee + one payroll month.
 * Highlights partial-cycle effects (join after cycle start) and days where approved leave
 * still overlaps "physical" attendance credits (reconciliation should reject/narrow).
 *
 * Usage (from backend folder):
 *   node scripts/diag_emp_2237_reconciliation_payperiod.js [YYYY-MM]
 * Example:
 *   node scripts/diag_emp_2237_reconciliation_payperiod.js 2026-03
 *
 * Env: MONGODB_URI (see other scripts). Set SKIP_LEAVE_ATTENDANCE_RECONCILIATION only affects
 * actual recalc jobs, not this read-only script.
 */

require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
const mongoose = require('mongoose');
const Employee = require('../employees/model/Employee');
const AttendanceDaily = require('../attendance/model/AttendanceDaily');
const MonthlyAttendanceSummary = require('../attendance/model/MonthlyAttendanceSummary');
const Leave = require('../leaves/model/Leave');
const OD = require('../leaves/model/OD');
const Settings = require('../settings/model/Settings');
const AttendanceSettings = require('../attendance/model/AttendanceSettings');
const dateCycleService = require('../leaves/services/dateCycleService');
const { createISTDate, extractISTComponents, getAllDatesInRange } = require('../shared/utils/dateUtils');
const {
  computeRawAttendanceHalfCredits,
  _REMARK_PREFIX: REMARK_PREFIX,
} = require('../leaves/services/leaveAttendanceReconciliationService');
const { isEsiLeaveType } = require('../overtime/services/esiLeaveOtService');

const EMP_NO = process.env.DIAG_EMP_NO || '2237';

async function loadReconSettingEnabled() {
  try {
    const s = await Settings.findOne({ key: 'leave_attendance_reconciliation_enabled' }).lean();
    if (!s) return true;
    return s.value !== false;
  } catch {
    return true;
  }
}

async function findApprovedOdsForDate(employeeId, dateStr) {
  const start = createISTDate(dateStr, '00:00');
  const end = createISTDate(dateStr, '23:59');
  return OD.find({
    employeeId,
    status: 'approved',
    fromDate: { $lte: end },
    toDate: { $gte: start },
  })
    .select('isHalfDay halfDayType odType_extended fromDate toDate')
    .lean();
}

function isSingleCalendarDayLeave(leave) {
  if (!leave?.fromDate || !leave?.toDate) return false;
  const a = extractISTComponents(leave.fromDate).dateStr;
  const b = extractISTComponents(leave.toDate).dateStr;
  return a === b;
}

function leaveHalfMask(leave) {
  if (leave.isHalfDay) {
    if (String(leave.halfDayType) === 'second_half') {
      return { l1: 0, l2: 0.5 };
    }
    return { l1: 0.5, l2: 0 };
  }
  return { l1: 0.5, l2: 0.5 };
}

function physicalMask(attFirst, attSecond) {
  return {
    p1: attFirst >= 0.5 - 1e-6 ? 0.5 : 0,
    p2: attSecond >= 0.5 - 1e-6 ? 0.5 : 0,
  };
}

/** Read-only: expected reconciliation action vs approved leave + daily (same rules as service v1). */
function expectedReconAction(leaveLean, daily, ods) {
  if (String(leaveLean.splitStatus || '') === 'split_approved') return { action: 'skip', reason: 'split_approved' };
  if (isEsiLeaveType(leaveLean.leaveType)) return { action: 'skip', reason: 'esi' };
  if (!isSingleCalendarDayLeave(leaveLean)) return { action: 'skip', reason: 'multi_day' };
  if (leaveLean.status !== 'approved') return { action: 'skip', reason: 'not_approved' };

  const { attFirst, attSecond } = computeRawAttendanceHalfCredits(daily, ods);
  const { p1, p2 } = physicalMask(attFirst, attSecond);
  const physTotal = p1 + p2;
  if (physTotal < 0.5 - 1e-6) {
    return { action: 'none', reason: 'no_physical_coverage', attFirst, attSecond, p1, p2 };
  }

  const { l1, l2 } = leaveHalfMask(leaveLean);
  if (leaveLean.isHalfDay) {
    const onFirst = l1 > 0;
    const physConflicts = (onFirst && p1 >= 0.5) || (!onFirst && p2 >= 0.5);
    if (!physConflicts) return { action: 'none', reason: 'no_conflict_half_leave', attFirst, attSecond, p1, p2 };
    return { action: 'rejected_half', detail: 'Half-day leave auto-rejected', attFirst, attSecond, p1, p2 };
  }

  if (!leaveLean.isHalfDay && Number(leaveLean.numberOfDays) >= 1 - 1e-6) {
    if (p1 >= 0.5 && p2 >= 0.5) {
      return { action: 'rejected_full', detail: 'Full-day leave auto-rejected', attFirst, attSecond, p1, p2 };
    }
    if (p1 >= 0.5 && p2 < 0.5) {
      return { action: 'narrowed_second', detail: 'Narrow to second half', attFirst, attSecond, p1, p2 };
    }
    if (p2 >= 0.5 && p1 < 0.5) {
      return { action: 'narrowed_first', detail: 'Narrow to first half', attFirst, attSecond, p1, p2 };
    }
  }
  return { action: 'none', reason: 'no_rule_matched', attFirst, attSecond, p1, p2 };
}

async function main() {
  const monthArg = process.argv[2];
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    console.error('MONGODB_URI is not set in backend/.env');
    process.exit(1);
  }

  await mongoose.connect(uri);
  const empNoNorm = String(EMP_NO).trim().toUpperCase();
  const employee = await Employee.findOne({ emp_no: empNoNorm })
    .select('_id emp_no employee_name doj')
    .lean();
  if (!employee) {
    console.error('Employee not found:', empNoNorm);
    process.exit(1);
  }

  let year;
  let month;
  if (monthArg && /^\d{4}-\d{2}$/.test(monthArg)) {
    [year, month] = monthArg.split('-').map(Number);
  } else {
    const last = await MonthlyAttendanceSummary.findOne({ emp_no: empNoNorm })
      .sort({ year: -1, monthNumber: -1 })
      .select('year monthNumber month')
      .lean();
    if (!last) {
      console.error('No MonthlyAttendanceSummary for employee; pass YYYY-MM e.g. 2026-03');
      process.exit(1);
    }
    year = last.year;
    month = last.monthNumber;
    console.log('No YYYY-MM arg: using latest summary month:', last.month, '\n');
  }

  const payrollSettings = await dateCycleService.getPayrollCycleSettings();
  const cycle = await dateCycleService.getPayrollCycleForMonth(year, month);
  const startDateStr = extractISTComponents(cycle.startDate).dateStr;
  const endDateStr = extractISTComponents(cycle.endDate).dateStr;
  const monthStr = `${year}-${String(month).padStart(2, '0')}`;
  const dojStr = employee.doj ? extractISTComponents(employee.doj).dateStr : null;

  const periodDates = getAllDatesInRange(startDateStr, endDateStr);
  const effectiveStart = dojStr && dojStr > startDateStr ? dojStr : startDateStr;
  const effectiveDates =
    dojStr && dojStr > startDateStr
      ? periodDates.filter((d) => d >= dojStr)
      : periodDates;

  console.log('=== Payroll / period ===');
  console.log(
    JSON.stringify(
      {
        payroll_cycle_start_day: payrollSettings.startDay,
        payroll_cycle_end_day: payrollSettings.endDay,
        summary_month_key: monthStr,
        cycle_start: startDateStr,
        cycle_end: endDateStr,
        calendar_days_in_cycle: periodDates.length,
        employee_doj_ist: dojStr,
        effective_days_after_doj: effectiveDates.length,
        partial_first_cycle:
          dojStr && dojStr > startDateStr && dojStr <= endDateStr
            ? `DOJ ${dojStr} is inside cycle — ${periodDates.length - effectiveDates.length} cycle day(s) before join are out of scope for this employee`
            : null,
      },
      null,
      2
    )
  );

  const [reconEnabled, attSettings] = await Promise.all([
    loadReconSettingEnabled(),
    AttendanceSettings.getSettings().catch(() => ({})),
  ]);
  console.log('\n=== Reconciliation gate ===');
  console.log(
    JSON.stringify(
      {
        leave_attendance_reconciliation_enabled: reconEnabled,
        attendance_processing_mode: attSettings?.processingMode?.mode ?? null,
        remark_prefix: REMARK_PREFIX,
      },
      null,
      2
    )
  );

  const summary = await MonthlyAttendanceSummary.findOne({
    employeeId: employee._id,
    month: monthStr,
  }).lean();

  console.log('\n=== MonthlyAttendanceSummary ===');
  if (!summary) {
    console.log('(no document for', monthStr, ')');
  } else {
    console.log(
      JSON.stringify(
        {
          month: summary.month,
          startDate: summary.startDate,
          endDate: summary.endDate,
          totalDaysInMonth: summary.totalDaysInMonth,
          totalPresentDays: summary.totalPresentDays,
          totalPayableShifts: summary.totalPayableShifts,
          totalLeaves: summary.totalLeaves,
          totalPartialDays: summary.totalPartialDays,
          lastCalculatedAt: summary.lastCalculatedAt,
        },
        null,
        2
      )
    );
    if (summary.startDate && summary.endDate) {
      const sMismatch =
        summary.startDate !== startDateStr || summary.endDate !== endDateStr;
      if (sMismatch) {
        console.log(
          '\nNOTE: Summary stored bounds differ from dateCycleService for this month key:',
          { stored: [summary.startDate, summary.endDate], expected: [startDateStr, endDateStr] }
        );
      }
    }
  }

  const dayStart = createISTDate(startDateStr, '00:00');
  const dayEnd = createISTDate(endDateStr, '23:59');
  const leaves = await Leave.find({
    employeeId: employee._id,
    fromDate: { $lte: dayEnd },
    toDate: { $gte: dayStart },
  })
    .select(
      'fromDate toDate status isHalfDay halfDayType numberOfDays leaveType leaveNature splitStatus remarks workflow.isCompleted'
    )
    .sort({ fromDate: 1 })
    .lean();

  console.log('\n=== Leaves overlapping pay cycle (count:', leaves.length, ') ===');
  for (const L of leaves) {
    const from = extractISTComponents(L.fromDate).dateStr;
    const to = extractISTComponents(L.toDate).dateStr;
    const rem = String(L.remarks || '');
    const hasReconRemark = rem.includes(REMARK_PREFIX);
    console.log(
      JSON.stringify(
        {
          status: L.status,
          from,
          to,
          isHalfDay: L.isHalfDay,
          halfDayType: L.halfDayType,
          numberOfDays: L.numberOfDays,
          leaveType: L.leaveType,
          splitStatus: L.splitStatus,
          has_auto_reconciliation_remark: hasReconRemark,
          remarks_preview: rem.slice(0, 200) + (rem.length > 200 ? '…' : ''),
        },
        null,
        2
      )
    );
  }

  const dailies = await AttendanceDaily.find({
    employeeNumber: empNoNorm,
    date: { $gte: startDateStr, $lte: endDateStr },
  })
    .sort({ date: 1 })
    .lean();

  const dailyByDate = new Map(dailies.map((d) => [d.date, d]));
  console.log('\n=== AttendanceDaily in cycle ===');
  console.log('rows:', dailies.length, '(expected calendar span:', periodDates.length, ')');

  const conflicts = [];
  for (const dateStr of periodDates) {
    const daily = dailyByDate.get(dateStr);
    const ods = await findApprovedOdsForDate(employee._id, dateStr);
    const dayLeaves = leaves.filter((L) => {
      const fs = extractISTComponents(L.fromDate).dateStr;
      const ts = extractISTComponents(L.toDate).dateStr;
      return dateStr >= fs && dateStr <= ts;
    });
    for (const L of dayLeaves) {
      if (L.status !== 'approved') continue;
      const exp = expectedReconAction(L, daily, ods);
      if (['rejected_full', 'rejected_half', 'narrowed_first', 'narrowed_second'].includes(exp.action)) {
        conflicts.push({
          date: dateStr,
          leave_status: L.status,
          leave_id: String(L._id),
          daily_status: daily?.status ?? '(no daily row)',
          expected_reconciliation: exp,
        });
      }
    }
  }

  console.log('\n=== Reconciliation simulation (approved leave + daily status) ===');
  if (conflicts.length === 0) {
    console.log(
      'No dates where an APPROVED leave overlaps the cycle AND raw attendance credits imply reject/narrow.'
    );
    console.log(
      '(If leave was already rejected, remarks should show',
      REMARK_PREFIX,
      '.)'
    );
  } else {
    console.log('Potential/stale conflicts (approved leave still on file but punches warrant auto action):');
    for (const c of conflicts) {
      console.log(JSON.stringify(c, null, 2));
    }
    console.log(
      '\nInterpretation: If `expected_reconciliation` shows reject/narrow but leave_status is still approved,',
      'reconciliation did not run for that day (e.g. no recalculateOnAttendanceUpdate after punches, PARTIAL daily,',
      'payroll lock, recon disabled, or SKIP_LEAVE_ATTENDANCE_RECONCILIATION=1 on workers).'
    );
  }

  console.log('\n=== Daily rows where status is PRESENT or HALF_DAY (sample) ===');
  const interesting = dailies.filter((d) =>
    ['PRESENT', 'HALF_DAY', 'PARTIAL', 'OD'].includes(String(d.status || '').toUpperCase())
  );
  for (const d of interesting.slice(0, 40)) {
    const ods = await findApprovedOdsForDate(employee._id, d.date);
    const { attFirst, attSecond } = computeRawAttendanceHalfCredits(d, ods);
    console.log({
      date: d.date,
      status: d.status,
      payableShifts: d.payableShifts,
      raw_half_credits: { attFirst, attSecond },
    });
  }
  if (interesting.length > 40) {
    console.log('... and', interesting.length - 40, 'more PRESENT/HALF_DAY/PARTIAL/OD rows (truncated).');
  }

  await mongoose.disconnect();
  console.log('\nDone.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
