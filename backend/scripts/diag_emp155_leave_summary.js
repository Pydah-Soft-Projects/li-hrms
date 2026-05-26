/**
 * Diagnose employee 155: leaves, attendance dailies, monthly summaries (Apr 27 focus).
 * Usage: node scripts/diag_emp155_leave_summary.js
 */
require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
const mongoose = require('mongoose');
const AttendanceDaily = require('../attendance/model/AttendanceDaily');
const MonthlyAttendanceSummary = require('../attendance/model/MonthlyAttendanceSummary');
const Leave = require('../leaves/model/Leave');
const Employee = require('../employees/model/Employee');
const dateCycleService = require('../leaves/services/dateCycleService');
const { createISTDate, extractISTComponents } = require('../shared/utils/dateUtils');

const EMP_NO = '155';
const FOCUS_DATE = '2026-04-27';

async function periodForDate(dateStr) {
  const info = await dateCycleService.getPeriodInfo(createISTDate(dateStr));
  const pc = info.payrollCycle;
  return {
    year: pc.year,
    month: pc.month,
    monthKey: `${pc.year}-${String(pc.month).padStart(2, '0')}`,
    start: extractISTComponents(pc.startDate).dateStr,
    end: extractISTComponents(pc.endDate).dateStr,
  };
}

async function run() {
  await mongoose.connect(process.env.MONGODB_URI);
  const empNoNorm = String(EMP_NO).toUpperCase().trim();
  const employee = await Employee.findOne({ emp_no: empNoNorm }).lean();
  if (!employee) {
    console.log('Employee not found:', EMP_NO);
    process.exit(1);
  }
  console.log('Employee:', employee.employee_name, `emp_no=${employee.emp_no}`, `id=${employee._id}\n`);

  const focusPeriod = await periodForDate(FOCUS_DATE);
  console.log(`=== Payroll month for ${FOCUS_DATE} ===`);
  console.log(focusPeriod);
  console.log('');

  const allLeavesEver = await Leave.find({
    $or: [{ emp_no: empNoNorm }, { employeeId: employee._id }],
  })
    .sort({ updatedAt: -1 })
    .select('fromDate toDate status leaveType updatedAt isActive')
    .lean();
  console.log('=== Any leave covering Apr 27 (all statuses) ===');
  const covering27 = allLeavesEver.filter((l) => {
    const from = extractISTComponents(l.fromDate).dateStr;
    const to = extractISTComponents(l.toDate).dateStr;
    return from <= FOCUS_DATE && to >= FOCUS_DATE;
  });
  if (!covering27.length) console.log('(none found)\n');
  else covering27.forEach((l) => console.log(l));

  console.log('=== 3 most recently updated leaves ===');
  allLeavesEver.slice(0, 3).forEach((l) => {
    console.log({
      from: extractISTComponents(l.fromDate).dateStr,
      to: extractISTComponents(l.toDate).dateStr,
      status: l.status,
      type: l.leaveType,
      updatedAt: l.updatedAt,
      isActive: l.isActive,
    });
  });
  console.log('');

  const leaves = await Leave.find({
    $or: [{ emp_no: empNoNorm }, { employeeId: employee._id }],
    isActive: { $ne: false },
    fromDate: { $lte: createISTDate('2026-05-31') },
    toDate: { $gte: createISTDate('2026-03-01') },
  })
    .sort({ updatedAt: -1 })
    .select(
      'fromDate toDate status leaveType leaveNature numberOfDays isHalfDay halfDayType appliedAt updatedAt workflow.isCompleted splitStatus'
    )
    .lean();

  console.log(`=== Leaves (Mar–May 2026 window) count=${leaves.length} ===`);
  for (const l of leaves) {
    const from = extractISTComponents(l.fromDate).dateStr;
    const to = extractISTComponents(l.toDate).dateStr;
    const covers27 = from <= FOCUS_DATE && to >= FOCUS_DATE;
    console.log({
      id: String(l._id),
      from,
      to,
      status: l.status,
      type: l.leaveType,
      nature: l.leaveNature,
      days: l.numberOfDays,
      halfDay: l.isHalfDay,
      coversApr27: covers27,
      updatedAt: l.updatedAt,
      workflowDone: l.workflow?.isCompleted,
    });
  }
  console.log('');

  const daily = await AttendanceDaily.findOne({ employeeNumber: empNoNorm, date: FOCUS_DATE })
    .select('date status payableShifts shifts notes policyMeta totalWorkingHours')
    .lean();
  console.log(`=== AttendanceDaily ${FOCUS_DATE} ===`);
  console.log(daily ? JSON.stringify(daily, null, 2) : '(none)');
  console.log('');

  const monthKeys = ['2026-04', '2026-05'];
  for (const mk of monthKeys) {
    const s = await MonthlyAttendanceSummary.findOne({ employeeId: employee._id, month: mk }).lean();
    console.log(`=== MonthlyAttendanceSummary ${mk} ===`);
    if (!s) {
      console.log('(none)\n');
      continue;
    }
    console.log({
      month: s.month,
      startDate: s.startDate,
      endDate: s.endDate,
      totalLeaves: s.totalLeaves,
      paidLeaves: s.paidLeaves,
      lopLeaves: s.lopLeaves,
      totalPresentDays: s.totalPresentDays,
      totalPayableShifts: s.totalPayableShifts,
      absentDays: s.absentDays,
      lastCalculatedAt: s.lastCalculatedAt,
      contributingDatesLeaves: (s.contributingDates?.leaves || []).slice(0, 20),
      hasApr27InLeaves: (s.contributingDates?.leaves || []).includes(FOCUS_DATE),
    });
    console.log('');
  }

  const dailiesAround = await AttendanceDaily.find({
    employeeNumber: empNoNorm,
    date: { $gte: '2026-04-24', $lte: '2026-04-30' },
  })
    .sort({ date: 1 })
    .select('date status payableShifts')
    .lean();
  console.log('=== Dailies Apr 24–30 ===');
  dailiesAround.forEach((d) => console.log(d.date, d.status, 'payableShifts=', d.payableShifts));

  await mongoose.disconnect();
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
