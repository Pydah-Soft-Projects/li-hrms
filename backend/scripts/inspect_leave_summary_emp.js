/**
 * Inspect approved leaves + monthly summary leave totals for one employee / pay month.
 * Usage: node scripts/inspect_leave_summary_emp.js 2146 2025 6
 */
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });
const mongoose = require('mongoose');
const Leave = require('../leaves/model/Leave');
const Employee = require('../employees/model/Employee');
const MonthlyAttendanceSummary = require('../attendance/model/MonthlyAttendanceSummary');
const dateCycleService = require('../leaves/services/dateCycleService');
const { extractISTComponents } = require('../shared/utils/dateUtils');
const {
  expandLeaveToDailySegments,
  leaveDailyCreditUnit,
  buildAttendanceLeaveInfoForDate,
} = require('../shared/utils/leaveDayRangeUtils');
const { calculateMonthlySummary } = require('../attendance/services/summaryCalculationService');

async function main() {
  const empNo = String(process.argv[2] || '2146').trim();
  const year = parseInt(process.argv[3] || '2025', 10);
  const month = parseInt(process.argv[4] || '6', 10);
  const monthStr = `${year}-${String(month).padStart(2, '0')}`;

  await mongoose.connect(process.env.MONGODB_URI);
  const employee = await Employee.findOne({ emp_no: empNo }).lean();
  if (!employee) {
    console.error('Employee not found:', empNo);
    process.exit(1);
  }

  const anchor = `${year}-${String(month).padStart(2, '0')}-15`;
  const period = await dateCycleService.getPeriodInfo(new Date(anchor));
  const startStr = extractISTComponents(period.payrollCycle.startDate).dateStr;
  const endStr = extractISTComponents(period.payrollCycle.endDate).dateStr;

  console.log('\n=== Employee', empNo, employee.employee_name || '', '===');
  console.log('Payroll month:', monthStr);
  console.log('Period:', startStr, '→', endStr);

  const leaves = await Leave.find({
    employeeId: employee._id,
    status: 'approved',
    isActive: true,
    fromDate: { $lte: period.payrollCycle.endDate },
    toDate: { $gte: period.payrollCycle.startDate },
  })
    .select(
      'fromDate toDate leaveType numberOfDays isHalfDay halfDayType fromIsHalfDay toIsHalfDay fromHalfDayType toHalfDayType'
    )
    .lean();

  console.log('\n--- Approved leaves in period ---');
  let expectedTotal = 0;
  for (const lv of leaves) {
    const from = extractISTComponents(lv.fromDate).dateStr;
    const to = extractISTComponents(lv.toDate).dateStr;
    console.log(`\nLeave ${lv._id} ${lv.leaveType} | ${from} → ${to} | request days=${lv.numberOfDays}`);
    console.log(
      `  boundaries: fromHalf=${!!lv.fromIsHalfDay} toHalf=${!!lv.toIsHalfDay} legacyHalf=${!!lv.isHalfDay}`
    );
    const segments = expandLeaveToDailySegments(lv);
    for (const seg of segments) {
      if (seg.dateStr < startStr || seg.dateStr > endStr) continue;
      const info = buildAttendanceLeaveInfoForDate(lv, seg.dateStr);
      const unit = leaveDailyCreditUnit(info);
      expectedTotal += unit;
      console.log(
        `  ${seg.dateStr}: segment=${seg.numberOfDays} isHalf=${seg.isHalfDay} half=${seg.halfDayType || '-'} → credit ${unit}`
      );
    }
  }
  expectedTotal = Math.round(expectedTotal * 100) / 100;
  console.log('\nExpected totalLeaves in period (sum of daily credits):', expectedTotal);

  let summary = await MonthlyAttendanceSummary.findOne({
    employeeId: employee._id,
    month: monthStr,
  }).lean();
  console.log('\n--- Stored monthly summary (before recalc) ---');
  if (summary) {
    console.log('  totalLeaves:', summary.totalLeaves);
    console.log('  totalPaidLeaves:', summary.totalPaidLeaves);
    console.log('  totalLopLeaves:', summary.totalLopLeaves);
    const leaveContrib = (summary.contributingDates?.leaves || []).filter((c) => {
      const d = String(c.date || '');
      return d >= startStr && d <= endStr;
    });
    console.log('  contributingDates.leaves in period:');
    for (const c of leaveContrib) {
      console.log(`    ${c.date}: value=${c.value} label=${c.label}`);
    }
  } else {
    console.log('  (none)');
  }

  console.log('\n--- Recalculating summary now ---');
  await calculateMonthlySummary(employee._id, employee.emp_no, year, month);
  summary = await MonthlyAttendanceSummary.findOne({
    employeeId: employee._id,
    month: monthStr,
  }).lean();
  console.log('  totalLeaves:', summary?.totalLeaves);
  console.log('  totalPaidLeaves:', summary?.totalPaidLeaves);
  const leaveContrib = (summary?.contributingDates?.leaves || []).filter((c) => {
    const d = String(c.date || '');
    return d >= startStr && d <= endStr;
  });
  console.log('  contributingDates.leaves in period:');
  for (const c of leaveContrib) {
    console.log(`    ${c.date}: value=${c.value} label=${c.label}`);
  }

  await mongoose.disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
