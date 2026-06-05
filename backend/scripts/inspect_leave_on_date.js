/**
 * Debug leave coverage for one employee on one calendar date.
 * Usage: node scripts/inspect_leave_on_date.js 2146 2026-05-04
 */
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });
const mongoose = require('mongoose');
const Leave = require('../leaves/model/Leave');
const LeaveSplit = require('../leaves/model/LeaveSplit');
const Employee = require('../employees/model/Employee');
const MonthlyAttendanceSummary = require('../attendance/model/MonthlyAttendanceSummary');
const { extractISTComponents } = require('../shared/utils/dateUtils');
const {
  expandLeaveToDailySegments,
  buildAttendanceLeaveInfoForDate,
  leaveDailyCreditUnit,
  normalizeLeaveBoundaries,
} = require('../shared/utils/leaveDayRangeUtils');

async function main() {
  const empNo = String(process.argv[2] || '2146').trim();
  const dateStr = String(process.argv[3] || '2026-05-04').trim();

  await mongoose.connect(process.env.MONGODB_URI);
  const employee = await Employee.findOne({ emp_no: empNo }).lean();
  if (!employee) {
    console.error('Employee not found');
    process.exit(1);
  }

  const dayStart = new Date(`${dateStr}T00:00:00+05:30`);
  const dayEnd = new Date(`${dateStr}T23:59:59+05:30`);

  const leaves = await Leave.find({
    employeeId: employee._id,
    status: 'approved',
    isActive: true,
    fromDate: { $lte: dayEnd },
    toDate: { $gte: dayStart },
  }).lean();

  const splits = await LeaveSplit.find({
    employeeId: employee._id,
    status: 'approved',
    date: dateStr,
  }).lean();

  const monthStr = dateStr.slice(0, 7);
  const summary = await MonthlyAttendanceSummary.findOne({
    employeeId: employee._id,
    month: monthStr,
  }).lean();
  const contrib = (summary?.contributingDates?.leaves || []).find((c) => String(c.date) === dateStr);

  console.log('\n===', empNo, employee.employee_name, '|', dateStr, '===\n');

  if (!leaves.length) console.log('No approved Leave overlapping this date.');
  for (const lv of leaves) {
    const from = extractISTComponents(lv.fromDate).dateStr;
    const to = extractISTComponents(lv.toDate).dateStr;
    const norm = normalizeLeaveBoundaries({
      fromDate: lv.fromDate,
      toDate: lv.toDate,
      isHalfDay: lv.isHalfDay,
      halfDayType: lv.halfDayType,
      fromIsHalfDay: lv.fromIsHalfDay,
      fromHalfDayType: lv.fromHalfDayType,
      toIsHalfDay: lv.toIsHalfDay,
      toHalfDayType: lv.toHalfDayType,
    });
    console.log('Leave', lv._id);
    console.log('  type:', lv.leaveType, '| span:', from, '→', to, '| request days:', lv.numberOfDays);
    console.log('  stored: isHalfDay=', lv.isHalfDay, 'halfDayType=', lv.halfDayType);
    console.log('  boundary: fromIsHalfDay=', lv.fromIsHalfDay, 'fromHalfDayType=', lv.fromHalfDayType);
    console.log('           toIsHalfDay=', lv.toIsHalfDay, 'toHalfDayType=', lv.toHalfDayType);
    console.log('  normalized:', JSON.stringify(norm));

    const seg = expandLeaveToDailySegments(lv).find((s) => s.dateStr === dateStr);
    const info = buildAttendanceLeaveInfoForDate(lv, dateStr);
    console.log('  segment on', dateStr + ':', seg ? JSON.stringify(seg) : 'none');
    console.log('  attendance leaveInfo credit:', info ? leaveDailyCreditUnit(info) : 'n/a');
    console.log('  role on this date:',
      from === to ? 'single-day' : dateStr === from ? 'START of multi-day (half = 2nd half only)' : dateStr === to ? 'END of multi-day (half = 1st half only)' : 'MIDDLE (full day)');
  }

  if (splits.length) {
    console.log('\nApproved LeaveSplit on this date:');
    for (const s of splits) console.log(' ', JSON.stringify(s));
  }

  console.log('\nMonthly summary contributingDates.leaves entry:', contrib || '(none)');

  await mongoose.disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
