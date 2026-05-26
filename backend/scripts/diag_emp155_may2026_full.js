/**
 * Full cross-check: emp 155, payroll month 2026-05 (Apr 26 – May 25).
 */
require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
const mongoose = require('mongoose');
const Leave = require('../leaves/model/Leave');
const AttendanceDaily = require('../attendance/model/AttendanceDaily');
const MonthlyAttendanceSummary = require('../attendance/model/MonthlyAttendanceSummary');
const Employee = require('../employees/model/Employee');
const dateCycleService = require('../leaves/services/dateCycleService');
const { createISTDate, extractISTComponents, getAllDatesInRange } = require('../shared/utils/dateUtils');

const EMP_NO = '155';
const MONTH_KEY = '2026-05';

function inPeriod(dateStr, start, end) {
  return dateStr >= start && dateStr <= end;
}

async function run() {
  await mongoose.connect(process.env.MONGODB_URI);
  const empNo = String(EMP_NO).toUpperCase();
  const emp = await Employee.findOne({ emp_no: empNo }).lean();
  if (!emp) throw new Error('Employee not found');

  const pc = await dateCycleService.getPayrollCycleForMonth(2026, 5);
  const start = extractISTComponents(pc.startDate).dateStr;
  const end = extractISTComponents(pc.endDate).dateStr;
  const periodDates = getAllDatesInRange(start, end);

  console.log('Employee:', emp.employee_name, empNo);
  console.log('Pay period 2026-05:', start, '..', end, `(${periodDates.length} days)\n`);

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
    };
    if (l.status === 'approved' && l.isActive !== false) approved.push(row);
    else if (['pending', 'hod_approved', 'hr_approved', 'manager_approved', 'reporting_manager_approved'].includes(l.status) || String(l.status).includes('approved') && l.status !== 'approved')
      pending.push(row);
    else other.push(row);
  }

  console.log('=== APPROVED + ACTIVE leaves overlapping period ===', approved.length);
  approved.forEach((r) => console.log(r));

  console.log('\n=== PENDING / PIPELINE leaves overlapping period ===', pending.length);
  pending.forEach((r) => console.log(r));

  console.log('\n=== OTHER (rejected/cancelled/inactive approved) ===', other.length);
  other.forEach((r) => console.log(r));

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

  const dailies = await AttendanceDaily.find({
    employeeNumber: empNo,
    date: { $gte: start, $lte: end },
  })
    .select('date status payableShifts notes')
    .sort({ date: 1 })
    .lean();

  const dailyByDate = new Map(dailies.map((d) => [d.date, d]));

  console.log('\n=== Attendance daily vs approved leave dates ===');
  let dailyLooksLikeLeave = 0;
  for (const [d, meta] of [...approvedDatesInPeriod.entries()].sort()) {
    const daily = dailyByDate.get(d);
    const status = daily?.status || '(no daily)';
    const pay = daily?.payableShifts;
    const noteHasLeave = /leave/i.test(daily?.notes || '');
    const match =
      status === 'LEAVE' ||
      (meta.halfDay && (status === 'HALF_DAY' || status === 'PARTIAL') && pay === 0.5);
    if (match || noteHasLeave) dailyLooksLikeLeave++;
    console.log({
      date: d,
      leave: `${meta.type}${meta.halfDay ? ' ½' : ''}`,
      dailyStatus: status,
      payableShifts: pay,
      reflectedInDaily: match ? 'likely' : 'no',
    });
  }

  const summary = await MonthlyAttendanceSummary.findOne({
    employeeId: emp._id,
    month: MONTH_KEY,
  }).lean();

  console.log('\n=== MonthlyAttendanceSummary 2026-05 ===');
  if (!summary) {
    console.log('(missing)');
  } else {
    const leaveContrib = summary.contributingDates?.leaves || [];
    const paid = summary.contributingDates?.paidLeaves || [];
    const lop = summary.contributingDates?.lopLeaves || [];
    console.log({
      lastCalculatedAt: summary.lastCalculatedAt,
      totalLeaves: summary.totalLeaves,
      totalPaidLeaveDays: summary.totalPaidLeaveDays,
      totalLopLeaveDays: summary.totalLopLeaveDays,
      totalPresentDays: summary.totalPresentDays,
      totalPayableShifts: summary.totalPayableShifts,
    });
    console.log('\ncontributingDates.leaves:', leaveContrib.map((x) => ({ date: x.date, value: x.value, label: x.label })));
    console.log('contributingDates.paidLeaves:', paid.map((x) => ({ date: x.date, value: x.value })));
    console.log('contributingDates.lopLeaves:', lop.map((x) => ({ date: x.date, value: x.value })));

    console.log('\n=== Summary leave dates vs approved leave dates ===');
    const summaryLeaveDates = new Set(leaveContrib.map((x) => x.date));
    for (const d of [...approvedDatesInPeriod.keys()].sort()) {
      const inSummary = summaryLeaveDates.has(d);
      console.log(d, inSummary ? 'IN summary' : 'MISSING from summary');
    }
    for (const cd of leaveContrib) {
      if (!approvedDatesInPeriod.has(cd.date)) {
        console.log('Summary has leave on', cd.date, 'but no approved leave record —', cd.label);
      }
    }
  }

  await mongoose.disconnect();
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
