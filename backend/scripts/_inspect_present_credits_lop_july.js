/**
 * Inspect emp 2181 on 2026-07-27 and scan July pay period for Present days
 * with suspicious credits / LOP (e.g. both 0.5).
 */
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const mongoose = require('mongoose');
const Settings = require('../settings/model/Settings');
const AttendanceDaily = require('../attendance/model/AttendanceDaily');
const Employee = require('../employees/model/Employee');

const EMP = String(process.argv[2] || '2181').toUpperCase();
const FOCUS_DATE = process.argv[3] || '2026-07-27';

function round2(n) {
  return Math.round((Number(n) || 0) * 100) / 100;
}

async function getPayrollWindowForJuly2026() {
  const startRow = await Settings.findOne({ key: 'payroll_cycle_start_day' }).lean();
  const endRow = await Settings.findOne({ key: 'payroll_cycle_end_day' }).lean();
  const startDay = Number(startRow?.value) || 1;
  const endDay = Number(endRow?.value) || 31;
  // July 2026 payroll batch typically covers startDay of June → endDay of July when start > 1
  let from;
  let to;
  if (startDay === 1) {
    from = '2026-07-01';
    to = '2026-07-31';
  } else {
    const prevMonth = 6; // June
    const prevYear = 2026;
    from = `${prevYear}-${String(prevMonth).padStart(2, '0')}-${String(startDay).padStart(2, '0')}`;
    to = `2026-07-${String(Math.min(endDay, 31)).padStart(2, '0')}`;
  }
  return { startDay, endDay, from, to };
}

function summarizeDay(d) {
  const shifts = Array.isArray(d.shifts) ? d.shifts : [];
  return {
    employeeNumber: d.employeeNumber,
    date: d.date,
    status: d.status,
    dayStatus: d.dayStatus,
    finalStatus: d.finalStatus,
    payableDays: d.payableDays,
    presentDays: d.presentDays,
    lopDays: d.lopDays,
    leaveDays: d.leaveDays,
    odDays: d.odDays,
    credits: d.credits,
    attendanceCredits: d.attendanceCredits,
    halfDayCredits: d.halfDayCredits,
    firstHalf: d.firstHalf,
    secondHalf: d.secondHalf,
    halves: d.halves,
    leaveInfo: d.leaveInfo,
    sandwich: d.sandwich,
    totalWorkingHours: d.totalWorkingHours,
    shiftCount: shifts.length,
    shifts: shifts.map((s) => ({
      n: s.shiftNumber,
      status: s.status,
      payableShift: s.payableShift,
      in: s.inTime,
      out: s.outTime,
      workingHours: s.workingHours,
      lateIn: s.lateInMinutes,
      earlyOut: s.earlyOutMinutes,
      segments: s.shiftSegments,
    })),
    rawKeysHint: Object.keys(d).filter((k) =>
      /credit|lop|present|status|half|payable|leave|deduct/i.test(k)
    ),
  };
}

async function run() {
  const uri = (process.env.MONGODB_URI || '').trim();
  await mongoose.connect(uri);
  const window = await getPayrollWindowForJuly2026();
  console.log('PAYROLL_WINDOW', JSON.stringify(window));

  const emp = await Employee.findOne({ emp_no: EMP }).select('emp_no employee_name division_id department_id').lean();
  console.log('EMPLOYEE', JSON.stringify(emp));

  const focus = await AttendanceDaily.findOne({ employeeNumber: EMP, date: FOCUS_DATE }).lean();
  if (!focus) {
    // try without uppercase mismatch
    const alt = await AttendanceDaily.findOne({
      employeeNumber: new RegExp(`^${EMP}$`, 'i'),
      date: FOCUS_DATE,
    }).lean();
    console.log('FOCUS_RAW', alt ? JSON.stringify(summarizeDay(alt), null, 2) : 'NOT_FOUND');
    if (alt) {
      console.log('FOCUS_FULL_KEYS', Object.keys(alt).sort().join(','));
      console.log('FOCUS_DOC', JSON.stringify(alt, null, 2).slice(0, 12000));
    }
  } else {
    console.log('FOCUS_SUMMARY', JSON.stringify(summarizeDay(focus), null, 2));
    console.log('FOCUS_FULL_KEYS', Object.keys(focus).sort().join(','));
    console.log('FOCUS_DOC', JSON.stringify(focus, null, 2).slice(0, 15000));
  }

  // Scan July pay period for present-like status with non-zero LOP
  const rows = await AttendanceDaily.find({
    date: { $gte: window.from, $lte: window.to },
  })
    .select(
      'employeeNumber date status dayStatus finalStatus payableDays presentDays lopDays leaveDays credits attendanceCredits halves firstHalf secondHalf leaveInfo sandwich shifts.status shifts.payableShift shifts.workingHours totalWorkingHours'
    )
    .lean();

  console.log('PERIOD_ROWS', rows.length);

  const suspicious = [];
  for (const d of rows) {
    const status = String(d.status || d.dayStatus || d.finalStatus || '').toUpperCase();
    const isPresentLike =
      status.includes('PRESENT') ||
      status === 'P' ||
      status === 'FULL_DAY' ||
      status === 'COMPLETE';

    const lop =
      d.lopDays != null
        ? Number(d.lopDays)
        : d.leaveInfo?.lopPortion != null
          ? Number(d.leaveInfo.lopPortion)
          : d.sandwich?.lopPortion != null
            ? Number(d.sandwich.lopPortion)
            : null;

    const credits =
      d.credits != null
        ? Number(d.credits)
        : d.attendanceCredits != null
          ? Number(d.attendanceCredits)
          : d.payableDays != null
            ? Number(d.payableDays)
            : d.presentDays != null
              ? Number(d.presentDays)
              : null;

    // User said credits=5 and lop=5 — likely 0.5 displayed oddly, or literally 5.
    // Flag: present-like AND (lop > 0 OR credits looks wrong vs present)
    const shiftsPayable = (d.shifts || []).reduce((s, x) => s + (Number(x.payableShift) || 0), 0);

    const flagReasons = [];
    if (isPresentLike && lop != null && lop > 0) flagReasons.push('present_with_lop');
    if (isPresentLike && credits != null && credits > 0 && lop != null && Math.abs(credits - lop) < 1e-6 && lop > 0) {
      flagReasons.push('credits_equals_lop');
    }
    // Also catch 0.5 / 0.5 or 5 / 5 style
    if (
      isPresentLike &&
      ((credits === 0.5 && lop === 0.5) ||
        (credits === 5 && lop === 5) ||
        (String(credits) === '5' && String(lop) === '5'))
    ) {
      flagReasons.push('half_and_half_or_5_5');
    }
    // Present status but payable/credits not full day
    if (isPresentLike && credits != null && credits > 0 && credits < 1 && (lop == null || lop > 0)) {
      flagReasons.push('present_partial_credit');
    }

    if (flagReasons.length) {
      suspicious.push({
        employeeNumber: d.employeeNumber,
        date: d.date,
        status: d.status,
        dayStatus: d.dayStatus,
        finalStatus: d.finalStatus,
        credits,
        payableDays: d.payableDays,
        presentDays: d.presentDays,
        lop,
        leaveDays: d.leaveDays,
        shiftsPayable: round2(shiftsPayable),
        reasons: flagReasons,
      });
    }
  }

  console.log('SUSPICIOUS_COUNT', suspicious.length);
  console.log('SUSPICIOUS', JSON.stringify(suspicious.slice(0, 200), null, 2));

  // Specifically find 2181 all days in window
  const empDays = rows
    .filter((r) => String(r.employeeNumber).toUpperCase() === EMP)
    .map((r) => summarizeDay(r));
  console.log('EMP_PERIOD_DAYS', JSON.stringify(empDays, null, 2));

  await mongoose.disconnect();
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
