/**
 * Full cross-check: emp 1434, payroll month 2026-07.
 * Read-only. Run against LOCAL copy:
 *   MONGODB_URI=mongodb://127.0.0.1:27017/ravi-1 node scripts/diag_emp1434_july2026_full.js
 */
require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
const mongoose = require('mongoose');
const Leave = require('../leaves/model/Leave');
const OD = require('../leaves/model/OD');
const AttendanceDaily = require('../attendance/model/AttendanceDaily');
const MonthlyAttendanceSummary = require('../attendance/model/MonthlyAttendanceSummary');
const PayRegisterSummary = require('../pay-register/model/PayRegisterSummary');
const Employee = require('../employees/model/Employee');
const dateCycleService = require('../leaves/services/dateCycleService');
const { createISTDate, extractISTComponents, getAllDatesInRange } = require('../shared/utils/dateUtils');

const EMP_NO = '1434';
const YEAR = 2026;
const MONTH = 7;
const MONTH_KEY = `${YEAR}-${String(MONTH).padStart(2, '0')}`;

function inPeriod(dateStr, start, end) {
  return dateStr >= start && dateStr <= end;
}

function fmtTime(d) {
  if (!d) return '--';
  const c = extractISTComponents(new Date(d));
  return `${c.dateStr} ${String(c.hours).padStart(2, '0')}:${String(c.minutes).padStart(2, '0')}`;
}

async function run() {
  await mongoose.connect(process.env.MONGODB_URI);
  console.log('DB:', mongoose.connection.name);
  const empNo = String(EMP_NO).toUpperCase();
  const emp = await Employee.findOne({ emp_no: empNo }).lean();
  if (!emp) throw new Error('Employee not found');

  const pc = await dateCycleService.getPayrollCycleForMonth(YEAR, MONTH);
  const start = extractISTComponents(pc.startDate).dateStr;
  const end = extractISTComponents(pc.endDate).dateStr;
  const periodDates = getAllDatesInRange(start, end);

  console.log('Employee:', emp.employee_name, empNo, '| active:', emp.is_active, '| doj:', emp.doj ? extractISTComponents(emp.doj).dateStr : null);
  console.log(`Pay period ${MONTH_KEY}:`, start, '..', end, `(${periodDates.length} days)\n`);

  // ---------- LEAVES ----------
  const allLeaves = await Leave.find({
    $or: [{ emp_no: empNo }, { employeeId: emp._id }],
    fromDate: { $lte: createISTDate(end) },
    toDate: { $gte: createISTDate(start) },
  })
    .sort({ fromDate: 1 })
    .lean();

  const approved = [];
  const pending = [];
  const other = [];

  for (const l of allLeaves) {
    const f = extractISTComponents(l.fromDate).dateStr;
    const t = extractISTComponents(l.toDate).dateStr;
    const row = {
      id: String(l._id),
      from: f,
      to: t,
      type: l.leaveType,
      nature: l.leaveNature,
      days: l.numberOfDays,
      halfDay: l.isHalfDay,
      halfDayType: l.halfDayType,
      status: l.status,
      isActive: l.isActive,
      workflowDone: l.workflow?.isCompleted,
      currentStep: l.workflow?.currentStepRole,
      appliedAt: l.createdAt,
    };
    if (l.status === 'approved' && l.isActive !== false) approved.push(row);
    else if (String(l.status || '').includes('pending') || (String(l.status || '').includes('approved') && l.status !== 'approved'))
      pending.push(row);
    else other.push(row);
  }

  console.log('=== APPROVED + ACTIVE leaves overlapping period ===', approved.length);
  approved.forEach((r) => console.log(r));

  console.log('\n=== PENDING / PIPELINE leaves overlapping period ===', pending.length);
  pending.forEach((r) => console.log(r));

  console.log('\n=== OTHER (rejected/cancelled/inactive approved) ===', other.length);
  other.forEach((r) => console.log(r));

  // ---------- ODs ----------
  const allODs = await OD.find({
    $or: [{ emp_no: empNo }, { employeeId: emp._id }],
    fromDate: { $lte: createISTDate(end) },
    toDate: { $gte: createISTDate(start) },
  })
    .sort({ fromDate: 1 })
    .lean();

  console.log('\n=== ODs overlapping period ===', allODs.length);
  allODs.forEach((o) =>
    console.log({
      id: String(o._id),
      from: extractISTComponents(o.fromDate).dateStr,
      to: extractISTComponents(o.toDate).dateStr,
      type: o.odType,
      extended: o.odType_extended,
      days: o.numberOfDays,
      status: o.status,
      isActive: o.isActive,
    })
  );

  // Expand approved leave dates in period
  const approvedDatesInPeriod = new Map();
  for (const l of allLeaves.filter((x) => x.status === 'approved' && x.isActive !== false)) {
    const f = extractISTComponents(l.fromDate).dateStr;
    const t = extractISTComponents(l.toDate).dateStr;
    for (const d of getAllDatesInRange(f, t)) {
      if (inPeriod(d, start, end)) {
        approvedDatesInPeriod.set(d, {
          leaveId: String(l._id),
          type: l.leaveType,
          nature: l.leaveNature,
          halfDay: l.isHalfDay,
          halfDayType: l.halfDayType,
        });
      }
    }
  }
  console.log('\n=== Approved leave calendar dates inside period ===', approvedDatesInPeriod.size);
  for (const [d, meta] of [...approvedDatesInPeriod.entries()].sort()) {
    console.log(d, meta);
  }

  // ---------- ATTENDANCE DAILIES (full period listing) ----------
  const dailies = await AttendanceDaily.find({
    employeeNumber: empNo,
    date: { $gte: start, $lte: end },
  })
    .sort({ date: 1 })
    .lean();

  const dailyByDate = new Map(dailies.map((d) => [d.date, d]));

  console.log('\n=== Attendance dailies, full period ===', dailies.length, 'docs');
  for (const d of periodDates) {
    const daily = dailyByDate.get(d);
    if (!daily) {
      console.log(d, '(no daily doc)', approvedDatesInPeriod.has(d) ? `<-- approved leave: ${approvedDatesInPeriod.get(d).type}` : '');
      continue;
    }
    const s0 = (daily.shifts || [])[0];
    console.log(d, {
      status: daily.status,
      payableShifts: daily.payableShifts,
      in: s0 ? fmtTime(s0.inTime) : '--',
      out: s0 ? fmtTime(s0.outTime) : '--',
      workHrs: s0?.workingHours ?? null,
      shifts: (daily.shifts || []).length,
      notes: daily.notes || undefined,
      leave: approvedDatesInPeriod.has(d) ? `${approvedDatesInPeriod.get(d).type}${approvedDatesInPeriod.get(d).halfDay ? ' ½' : ''}` : undefined,
    });
  }

  // ---------- MONTHLY ATTENDANCE SUMMARY ----------
  const summary = await MonthlyAttendanceSummary.findOne({
    $or: [{ employeeId: emp._id }, { emp_no: empNo }],
    month: MONTH_KEY,
  }).lean();

  console.log(`\n=== MonthlyAttendanceSummary ${MONTH_KEY} ===`);
  if (!summary) {
    console.log('(missing)');
  } else {
    console.log({
      lastCalculatedAt: summary.lastCalculatedAt,
      totalDaysInMonth: summary.totalDaysInMonth,
      totalPresentDays: summary.totalPresentDays,
      totalLeaves: summary.totalLeaves,
      totalPaidLeaveDays: summary.totalPaidLeaveDays,
      totalLopLeaveDays: summary.totalLopLeaveDays,
      totalODDays: summary.totalODDays,
      totalWeekOffDays: summary.totalWeekOffDays,
      totalHolidays: summary.totalHolidays,
      totalAbsentDays: summary.totalAbsentDays,
      totalPayableShifts: summary.totalPayableShifts,
    });
    const leaveContrib = summary.contributingDates?.leaves || [];
    const paid = summary.contributingDates?.paidLeaves || [];
    const lop = summary.contributingDates?.lopLeaves || [];
    const absents = summary.contributingDates?.absents || summary.contributingDates?.absentDays || [];
    console.log('\ncontributingDates.leaves:', leaveContrib.map((x) => ({ date: x.date, value: x.value, label: x.label })));
    console.log('contributingDates.paidLeaves:', paid.map((x) => ({ date: x.date, value: x.value, label: x.label })));
    console.log('contributingDates.lopLeaves:', lop.map((x) => ({ date: x.date, value: x.value, label: x.label })));
    console.log('contributingDates.absents:', (absents || []).map((x) => ({ date: x.date, value: x.value, label: x.label })));

    console.log('\n=== Summary leave dates vs approved leave dates ===');
    const summaryLeaveDates = new Set(leaveContrib.map((x) => x.date));
    for (const d of [...approvedDatesInPeriod.keys()].sort()) {
      console.log(d, summaryLeaveDates.has(d) ? 'IN summary' : 'MISSING from summary');
    }
    for (const cd of leaveContrib) {
      if (!approvedDatesInPeriod.has(cd.date)) {
        console.log('Summary has leave on', cd.date, 'but no approved leave record —', cd.label);
      }
    }
  }

  // ---------- PAY REGISTER ----------
  const payReg = await PayRegisterSummary.findOne({
    $or: [{ employeeId: emp._id }, { emp_no: empNo }],
    month: MONTH_KEY,
  }).lean();

  console.log(`\n=== PayRegisterSummary ${MONTH_KEY} ===`);
  if (!payReg) {
    console.log('(missing)');
  } else {
    console.log({
      status: payReg.status,
      totalDaysInMonth: payReg.totalDaysInMonth,
      totals: payReg.monthlyTotals || payReg.totals || undefined,
      contributingDatesSource: payReg.contributingDatesSource,
      updatedAt: payReg.updatedAt,
    });
    const recs = payReg.dailyRecords || [];
    console.log('\nPay register daily grid (period):');
    for (const r of recs) {
      const dateStr = r.date ? (typeof r.date === 'string' ? r.date : extractISTComponents(r.date).dateStr) : '?';
      if (!inPeriod(dateStr, start, end)) continue;
      console.log(dateStr, {
        status: r.status,
        split: r.isSplit,
        firstHalf: r.firstHalf?.status,
        fhLeaveType: r.firstHalf?.leaveType,
        secondHalf: r.secondHalf?.status,
        shLeaveType: r.secondHalf?.leaveType,
        leaveType: r.leaveType,
        payableShifts: r.payableShifts,
      });
    }
  }

  await mongoose.disconnect();
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
