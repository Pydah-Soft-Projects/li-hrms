/**
 * Seeds one employee's AttendanceDaily + approved Leave/OD + WO/HOL roster rows
 * across many edge cases handled by summaryCalculationService.js, then runs
 * calculateMonthlySummary with an explicit calendar-month period.
 *
 * Usage (from backend/):
 *   node scripts/seed-summary-calculation-sandbox.js
 *   node scripts/seed-summary-calculation-sandbox.js --emp=EMP001 --year=2026 --month=6
 *   node scripts/seed-summary-calculation-sandbox.js --clean   # also drop MonthlyAttendanceSummary row for that month
 *
 * Each run removes prior sandbox data for the scenario dates (attendance, roster, Leave/OD with this purpose).
 *
 * AttendanceDaily is written via collection.bulkWrite (no per-row Mongoose hooks). Leave.create / OD.create
 * may still trigger post-save recalcs; the script waits before calculateMonthlySummary and before disconnect.
 *
 * Env: MONGODB_URI (via .env)
 */

require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const mongoose = require('mongoose');

const Employee = require('../employees/model/Employee');
const User = require('../users/model/User');
const Shift = require('../shifts/model/Shift');
const AttendanceDaily = require('../attendance/model/AttendanceDaily');
const Leave = require('../leaves/model/Leave');
const OD = require('../leaves/model/OD');
const PreScheduledShift = require('../shifts/model/PreScheduledShift');
const MonthlyAttendanceSummary = require('../attendance/model/MonthlyAttendanceSummary');
const { calculateMonthlySummary } = require('../attendance/services/summaryCalculationService');

const SANDBOX_PURPOSE = 'Sandbox summary QC';

function pad2(n) {
  return String(n).padStart(2, '0');
}

function ymd(year, month, day) {
  return `${year}-${pad2(month)}-${pad2(day)}`;
}

function arg(name, def) {
  const p = process.argv.find((a) => a.startsWith(`--${name}=`));
  if (!p) return def;
  return p.split('=').slice(1).join('=');
}

function istDate(dateStr, hh, mm) {
  return new Date(`${dateStr}T${pad2(hh)}:${pad2(mm)}:00`);
}

function buildShiftBlock(dateStr, shiftId, inH, inM, outH, outM, lateIn = 0, earlyOut = 0) {
  const inTime = istDate(dateStr, inH, inM);
  const outTime = istDate(dateStr, outH, outM);
  const workingHours = Math.max(0, (outTime - inTime) / 3600000);
  return {
    shiftNumber: 1,
    inTime,
    outTime,
    duration: Math.round(workingHours * 60),
    workingHours,
    punchHours: workingHours,
    odHours: 0,
    otHours: 0,
    shiftId,
    shiftName: 'Sandbox',
    lateInMinutes: lateIn,
    earlyOutMinutes: earlyOut,
    isLateIn: lateIn > 0,
    isEarlyOut: earlyOut > 0,
    status: 'complete',
    payableShift: 1,
    basePayable: 1,
  };
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
  const year = parseInt(arg('year', new Date().getFullYear()), 10);
  const month = parseInt(arg('month', new Date().getMonth() + 1), 10);
  const empNoArg = arg('emp', '');
  const doClean = process.argv.includes('--clean');

  const lastDay = new Date(year, month, 0).getDate();
  const startStr = ymd(year, month, 1);
  const endStr = ymd(year, month, lastDay);

  console.log(`\n=== Summary calculation sandbox ===`);
  console.log(`Calendar month: ${year}-${pad2(month)} (${startStr} .. ${endStr})`);
  console.log(`Purpose tag: "${SANDBOX_PURPOSE}"\n`);

  await mongoose.connect(process.env.MONGODB_URI);
  console.log('MongoDB connected.\n');

  const user = await User.findOne().select('_id').lean();
  if (!user) {
    console.error('No User found (need scheduledBy for PreScheduledShift). Seed users first.');
    process.exit(1);
  }

  let emp;
  if (empNoArg) {
    emp = await Employee.findOne({ emp_no: empNoArg.toUpperCase() });
  } else {
    emp = await Employee.findOne({ is_active: { $ne: false } }).sort({ emp_no: 1 });
  }
  if (!emp) {
    console.error('No employee found. Pass --emp=EMP_NO or seed employees.');
    process.exit(1);
  }

  const shift =
    (await Shift.findOne({ name: /general|8h/i })) ||
    (await Shift.findOne({ isActive: { $ne: false } })) ||
    (await Shift.findOne());
  if (!shift) {
    console.error('No Shift found. Seed shifts first.');
    process.exit(1);
  }

  const normEmp = String(emp.emp_no).toUpperCase();

  /** Scenario day numbers (must exist in month) */
  const D = {
    presentFull: 3,
    absentPlain: 4,
    partial: 5,
    halfDayEarly: 6,
    halfDayLate: 7,
    leaveFullNoAtt: 8,
    leaveFullAbsent: 9,
    leaveHalfFirst: 10,
    leaveHalfSecond: 11,
    odFullAbsent: 12,
    odHalfFirstAbsent: 13,
    odHalfSecondAbsent: 14,
    presentPlusOdHalfFirst: 15,
    presentPlusLeaveHalfFirst: 16,
    weekOff: 17,
    holiday: 18,
    presentLate: 19,
    extraHours: 20,
  };

  const usedDays = Object.values(D).filter((d) => d >= 1 && d <= lastDay);
  if (usedDays.length !== Object.keys(D).length) {
    console.error('Some scenario days fall outside month length:', { lastDay, D });
    process.exit(1);
  }

  const dates = usedDays.map((d) => ymd(year, month, d));

  console.log('Removing prior sandbox rows (scenario dates + tagged Leave/OD)...');
  await AttendanceDaily.deleteMany({ employeeNumber: normEmp, date: { $in: dates } });
  await Leave.deleteMany({ employeeId: emp._id, purpose: SANDBOX_PURPOSE });
  await OD.deleteMany({ employeeId: emp._id, purpose: SANDBOX_PURPOSE });
  await PreScheduledShift.deleteMany({ employeeNumber: normEmp, date: { $in: dates } });
  if (doClean) {
    const monthKey = `${year}-${pad2(month)}`;
    await MonthlyAttendanceSummary.deleteMany({ employeeId: emp._id, month: monthKey });
    console.log('Also cleared MonthlyAttendanceSummary for', monthKey);
  }
  console.log('Ready to seed.\n');

  const dailyDocs = [];
  const leaveDocs = [];
  const odDocs = [];
  const rosterOps = [];

  const pushDaily = (dayKey, doc) => {
    dailyDocs.push({ key: dayKey, doc });
  };

  // --- Attendance-only scenarios ---
  pushDaily('presentFull', {
    employeeNumber: normEmp,
    date: ymd(year, month, D.presentFull),
    status: 'PRESENT',
    totalShifts: 1,
    shifts: [buildShiftBlock(ymd(year, month, D.presentFull), shift._id, 9, 0, 18, 0)],
    totalWorkingHours: 8,
    totalLateInMinutes: 0,
    totalEarlyOutMinutes: 0,
    payableShifts: 1,
    source: ['manual'],
  });

  pushDaily('absentPlain', {
    employeeNumber: normEmp,
    date: ymd(year, month, D.absentPlain),
    status: 'ABSENT',
    totalShifts: 0,
    shifts: [],
    totalWorkingHours: 0,
    totalLateInMinutes: 0,
    totalEarlyOutMinutes: 0,
    payableShifts: 0,
    source: ['manual'],
  });

  pushDaily('partial', {
    employeeNumber: normEmp,
    date: ymd(year, month, D.partial),
    status: 'PARTIAL',
    totalShifts: 1,
    shifts: [buildShiftBlock(ymd(year, month, D.partial), shift._id, 9, 0, 13, 0)],
    totalWorkingHours: 4,
    totalLateInMinutes: 0,
    totalEarlyOutMinutes: 0,
    payableShifts: 0.5,
    source: ['manual'],
  });

  const dHalfE = ymd(year, month, D.halfDayEarly);
  pushDaily('halfDayEarly', {
    employeeNumber: normEmp,
    date: dHalfE,
    status: 'HALF_DAY',
    totalShifts: 1,
    shifts: [buildShiftBlock(dHalfE, shift._id, 9, 0, 13, 0)],
    totalWorkingHours: 4,
    totalLateInMinutes: 0,
    totalEarlyOutMinutes: 180,
    payableShifts: 0.5,
    source: ['manual'],
  });

  const dHalfL = ymd(year, month, D.halfDayLate);
  pushDaily('halfDayLate', {
    employeeNumber: normEmp,
    date: dHalfL,
    status: 'HALF_DAY',
    totalShifts: 1,
    shifts: [buildShiftBlock(dHalfL, shift._id, 14, 0, 18, 0)],
    totalWorkingHours: 4,
    totalLateInMinutes: 150,
    totalEarlyOutMinutes: 0,
    payableShifts: 0.5,
    source: ['manual'],
  });

  // --- Leave (no attendance row): full day leave still counts in engine ---
  leaveDocs.push({
    employeeId: emp._id,
    emp_no: normEmp,
    leaveType: 'CL',
    fromDate: new Date(ymd(year, month, D.leaveFullNoAtt)),
    toDate: new Date(ymd(year, month, D.leaveFullNoAtt)),
    numberOfDays: 1,
    isHalfDay: false,
    halfDayType: null,
    purpose: SANDBOX_PURPOSE,
    contactNumber: '9999999999',
    status: 'approved',
    isActive: true,
    splitStatus: null,
    leaveNature: 'paid',
  });

  pushDaily('leaveFullAbsent', {
    employeeNumber: normEmp,
    date: ymd(year, month, D.leaveFullAbsent),
    status: 'ABSENT',
    totalShifts: 0,
    shifts: [],
    totalWorkingHours: 0,
    payableShifts: 0,
    source: ['manual'],
  });
  leaveDocs.push({
    employeeId: emp._id,
    emp_no: normEmp,
    leaveType: 'CL',
    fromDate: new Date(ymd(year, month, D.leaveFullAbsent)),
    toDate: new Date(ymd(year, month, D.leaveFullAbsent)),
    numberOfDays: 1,
    isHalfDay: false,
    halfDayType: null,
    purpose: SANDBOX_PURPOSE,
    contactNumber: '9999999999',
    status: 'approved',
    isActive: true,
    splitStatus: null,
    leaveNature: 'paid',
  });

  pushDaily('leaveHalfFirst', {
    employeeNumber: normEmp,
    date: ymd(year, month, D.leaveHalfFirst),
    status: 'ABSENT',
    totalShifts: 0,
    shifts: [],
    totalWorkingHours: 0,
    payableShifts: 0,
    source: ['manual'],
  });
  leaveDocs.push({
    employeeId: emp._id,
    emp_no: normEmp,
    leaveType: 'CL',
    fromDate: new Date(ymd(year, month, D.leaveHalfFirst)),
    toDate: new Date(ymd(year, month, D.leaveHalfFirst)),
    numberOfDays: 0.5,
    isHalfDay: true,
    halfDayType: 'first_half',
    purpose: SANDBOX_PURPOSE,
    contactNumber: '9999999999',
    status: 'approved',
    isActive: true,
    splitStatus: null,
    leaveNature: 'paid',
  });

  pushDaily('leaveHalfSecond', {
    employeeNumber: normEmp,
    date: ymd(year, month, D.leaveHalfSecond),
    status: 'ABSENT',
    totalShifts: 0,
    shifts: [],
    totalWorkingHours: 0,
    payableShifts: 0,
    source: ['manual'],
  });
  leaveDocs.push({
    employeeId: emp._id,
    emp_no: normEmp,
    leaveType: 'CL',
    fromDate: new Date(ymd(year, month, D.leaveHalfSecond)),
    toDate: new Date(ymd(year, month, D.leaveHalfSecond)),
    numberOfDays: 0.5,
    isHalfDay: true,
    halfDayType: 'second_half',
    purpose: SANDBOX_PURPOSE,
    contactNumber: '9999999999',
    status: 'approved',
    isActive: true,
    splitStatus: null,
    leaveNature: 'lop',
  });

  // --- OD + attendance merge ---
  pushDaily('odFullAbsent', {
    employeeNumber: normEmp,
    date: ymd(year, month, D.odFullAbsent),
    status: 'ABSENT',
    totalShifts: 0,
    shifts: [],
    totalWorkingHours: 0,
    payableShifts: 0,
    source: ['manual'],
  });
  odDocs.push({
    employeeId: emp._id,
    emp_no: normEmp,
    odType: 'Official',
    fromDate: new Date(ymd(year, month, D.odFullAbsent)),
    toDate: new Date(ymd(year, month, D.odFullAbsent)),
    numberOfDays: 1,
    isHalfDay: false,
    halfDayType: null,
    odType_extended: 'full_day',
    purpose: SANDBOX_PURPOSE,
    placeVisited: 'Client',
    contactNumber: '9999999999',
    status: 'approved',
    isActive: true,
  });

  pushDaily('odHalfFirstAbsent', {
    employeeNumber: normEmp,
    date: ymd(year, month, D.odHalfFirstAbsent),
    status: 'ABSENT',
    totalShifts: 0,
    shifts: [],
    totalWorkingHours: 0,
    payableShifts: 0,
    source: ['manual'],
  });
  odDocs.push({
    employeeId: emp._id,
    emp_no: normEmp,
    odType: 'Official',
    fromDate: new Date(ymd(year, month, D.odHalfFirstAbsent)),
    toDate: new Date(ymd(year, month, D.odHalfFirstAbsent)),
    numberOfDays: 0.5,
    isHalfDay: true,
    halfDayType: 'first_half',
    odType_extended: 'half_day',
    purpose: SANDBOX_PURPOSE,
    placeVisited: 'Client',
    contactNumber: '9999999999',
    status: 'approved',
    isActive: true,
  });

  pushDaily('odHalfSecondAbsent', {
    employeeNumber: normEmp,
    date: ymd(year, month, D.odHalfSecondAbsent),
    status: 'ABSENT',
    totalShifts: 0,
    shifts: [],
    totalWorkingHours: 0,
    payableShifts: 0,
    source: ['manual'],
  });
  odDocs.push({
    employeeId: emp._id,
    emp_no: normEmp,
    odType: 'Official',
    fromDate: new Date(ymd(year, month, D.odHalfSecondAbsent)),
    toDate: new Date(ymd(year, month, D.odHalfSecondAbsent)),
    numberOfDays: 0.5,
    isHalfDay: true,
    halfDayType: 'second_half',
    odType_extended: 'half_day',
    purpose: SANDBOX_PURPOSE,
    placeVisited: 'Client',
    contactNumber: '9999999999',
    status: 'approved',
    isActive: true,
  });

  const dPOd = ymd(year, month, D.presentPlusOdHalfFirst);
  pushDaily('presentPlusOdHalfFirst', {
    employeeNumber: normEmp,
    date: dPOd,
    status: 'PRESENT',
    totalShifts: 1,
    shifts: [buildShiftBlock(dPOd, shift._id, 9, 0, 18, 0)],
    totalWorkingHours: 8,
    totalLateInMinutes: 0,
    totalEarlyOutMinutes: 0,
    payableShifts: 1,
    source: ['manual'],
  });
  odDocs.push({
    employeeId: emp._id,
    emp_no: normEmp,
    odType: 'Official',
    fromDate: new Date(dPOd),
    toDate: new Date(dPOd),
    numberOfDays: 0.5,
    isHalfDay: true,
    halfDayType: 'first_half',
    odType_extended: 'half_day',
    purpose: SANDBOX_PURPOSE,
    placeVisited: 'Client',
    contactNumber: '9999999999',
    status: 'approved',
    isActive: true,
  });

  const dPL = ymd(year, month, D.presentPlusLeaveHalfFirst);
  pushDaily('presentPlusLeaveHalfFirst', {
    employeeNumber: normEmp,
    date: dPL,
    status: 'PRESENT',
    totalShifts: 1,
    shifts: [buildShiftBlock(dPL, shift._id, 9, 0, 18, 0)],
    totalWorkingHours: 8,
    totalLateInMinutes: 0,
    totalEarlyOutMinutes: 0,
    payableShifts: 1,
    source: ['manual'],
  });
  leaveDocs.push({
    employeeId: emp._id,
    emp_no: normEmp,
    leaveType: 'CL',
    fromDate: new Date(dPL),
    toDate: new Date(dPL),
    numberOfDays: 0.5,
    isHalfDay: true,
    halfDayType: 'first_half',
    purpose: SANDBOX_PURPOSE,
    contactNumber: '9999999999',
    status: 'approved',
    isActive: true,
    splitStatus: null,
    leaveNature: 'paid',
  });

  // --- Roster non-working (no attendance required) ---
  rosterOps.push({ date: ymd(year, month, D.weekOff), status: 'WO' });
  rosterOps.push({ date: ymd(year, month, D.holiday), status: 'HOL' });

  const dLate = ymd(year, month, D.presentLate);
  pushDaily('presentLate', {
    employeeNumber: normEmp,
    date: dLate,
    status: 'PRESENT',
    totalShifts: 1,
    shifts: [buildShiftBlock(dLate, shift._id, 9, 30, 18, 0, 30, 0)],
    totalWorkingHours: 8,
    totalLateInMinutes: 30,
    totalEarlyOutMinutes: 0,
    payableShifts: 1,
    source: ['manual'],
  });

  const dEx = ymd(year, month, D.extraHours);
  pushDaily('extraHours', {
    employeeNumber: normEmp,
    date: dEx,
    status: 'PRESENT',
    totalShifts: 1,
    shifts: [buildShiftBlock(dEx, shift._id, 9, 0, 19, 30, 0, 0)],
    totalWorkingHours: 10.5,
    totalLateInMinutes: 0,
    totalEarlyOutMinutes: 0,
    payableShifts: 1,
    extraHours: 2.5,
    source: ['manual'],
  });

  console.log(`Employee: ${emp.employee_name} (${normEmp})`);
  console.log(`Shift: ${shift.name || shift._id}\n`);

  console.log('Inserting AttendanceDaily rows (bulkWrite, skips Mongoose hooks)...');
  const bulkOps = dailyDocs.map(({ doc }) => ({
    updateOne: {
      filter: { employeeNumber: doc.employeeNumber, date: doc.date },
      update: { $set: doc },
      upsert: true,
    },
  }));
  if (bulkOps.length) {
    await AttendanceDaily.collection.bulkWrite(bulkOps, { ordered: false });
  }
  for (const { key, doc } of dailyDocs) {
    console.log(`  ${key}: ${doc.date} status=${doc.status}`);
  }

  console.log('\nInserting Leave documents...');
  for (const lv of leaveDocs) {
    await Leave.create({ ...lv, appliedBy: user._id });
    const dStr = lv.fromDate instanceof Date ? lv.fromDate.toISOString().slice(0, 10) : String(lv.fromDate).slice(0, 10);
    console.log(`  ${lv.leaveType} ${lv.numberOfDays}d ${dStr} half=${lv.isHalfDay} ${lv.halfDayType || ''} nature=${lv.leaveNature}`);
  }

  console.log('\nInserting OD documents...');
  for (const od of odDocs) {
    await OD.create({ ...od, appliedBy: user._id });
    const dStr = od.fromDate instanceof Date ? od.fromDate.toISOString().slice(0, 10) : String(od.fromDate).slice(0, 10);
    console.log(`  OD ext=${od.odType_extended} half=${od.isHalfDay} ${od.halfDayType || ''} ${dStr}`);
  }

  console.log('\nUpserting PreScheduledShift WO/HOL...');
  for (const r of rosterOps) {
    await PreScheduledShift.findOneAndUpdate(
      { employeeNumber: normEmp, date: r.date },
      {
        $set: {
          employeeNumber: normEmp,
          date: r.date,
          status: r.status,
          shiftId: null,
          scheduledBy: user._id,
          notes: SANDBOX_PURPOSE,
        },
      },
      { upsert: true, new: true }
    );
    console.log(`  ${r.date} ${r.status}`);
  }

  console.log('\nWaiting for Leave/OD post-save recalcs to finish...');
  await sleep(5000);

  console.log('\nRunning calculateMonthlySummary (calendar month override)...');
  const summary = await calculateMonthlySummary(emp._id, normEmp, year, month, {
    startDateStr: startStr,
    endDateStr: endStr,
  });

  console.log('\n--- Result summary (spot-check vs expectations) ---');
  const s = typeof summary.toObject === 'function' ? summary.toObject() : { ...summary };
  console.log({
    month: s.month,
    totalDaysInMonth: s.totalDaysInMonth,
    totalPresentDays: s.totalPresentDays,
    totalAbsentDays: s.totalAbsentDays,
    totalLeaves: s.totalLeaves,
    totalODs: s.totalODs,
    totalWeeklyOffs: s.totalWeeklyOffs,
    totalHolidays: s.totalHolidays,
    totalPayableShifts: s.totalPayableShifts,
    lateOrEarlyCount: s.lateOrEarlyCount,
    totalExtraHours: s.totalExtraHours,
    totalLateInMinutes: s.totalLateInMinutes,
    totalEarlyOutMinutes: s.totalEarlyOutMinutes,
    totalAttendanceDeductionDays: s.totalAttendanceDeductionDays,
    attendanceDeductionBreakdown: s.attendanceDeductionBreakdown,
  });

  const cd = s.contributingDates || {};
  console.log('\ncontributingDates counts:', {
    present: cd.present?.length,
    absent: cd.absent?.length,
    leaves: cd.leaves?.length,
    ods: cd.ods?.length,
    weeklyOffs: cd.weeklyOffs?.length,
    holidays: cd.holidays?.length,
    payableShifts: cd.payableShifts?.length,
    lateIn: cd.lateIn?.length,
    extraHours: cd.extraHours?.length,
  });

  console.log('\nScenario map (day → case):');
  Object.entries(D).forEach(([k, d]) => console.log(`  ${ymd(year, month, d)} — ${k}`));

  console.log(
    '\nTip: open workspace/superadmin attendance for this employee/month; click totals to verify contributingDates highlights.'
  );
  console.log('Re-run with --clean to wipe and re-seed the same dates.\n');

  await sleep(2000);
  await mongoose.disconnect();
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  mongoose.disconnect().finally(() => process.exit(1));
});
