require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
const mongoose = require('mongoose');

const Employee = require('../employees/model/Employee');
const AttendanceDaily = require('../attendance/model/AttendanceDaily');
const PayRegisterSummary = require('../pay-register/model/PayRegisterSummary');
const Leave = require('../leaves/model/Leave');
const LeaveSplit = require('../leaves/model/LeaveSplit');
const OD = require('../leaves/model/OD');
const { createISTDate } = require('../shared/utils/dateUtils');

const DATE = process.argv[2] || '2026-05-19';
const EMP_NO_RAW = process.argv[3]; // e.g. 1823
const MONTH = process.argv[4] || '2026-05';

function pickDay(pr) {
  if (!pr?.dailyRecords) return null;
  return pr.dailyRecords.find((r) => r.date === DATE) || null;
}

async function diagOne(empNo) {
  const empNoNorm = String(empNo || '').trim().toUpperCase();
  const emp = await Employee.findOne({ emp_no: empNoNorm }).select('_id emp_no employee_name').lean();
  if (!emp) {
    console.log(`\n[${empNoNorm}] Employee not found`);
    return;
  }

  const pr = await PayRegisterSummary.findOne({ employeeId: emp._id, month: MONTH })
    .select('employeeId month dailyRecords totals summaryLocked summaryLockedAt editHistory')
    .lean();

  const dayStart = createISTDate(DATE, '00:00');
  const dayEnd = createISTDate(DATE, '23:59');

  const attendance = await AttendanceDaily.findOne({ employeeNumber: empNoNorm, date: DATE })
    .select('status payableShifts rosterFirstHalfNonWorking rosterSecondHalfNonWorking shifts shiftId')
    .lean();

  const leaves = await Leave.find({
    employeeId: emp._id,
    status: { $in: ['approved', 'hr_approved', 'hod_approved'] },
    isActive: true,
    fromDate: { $lte: dayEnd },
    toDate: { $gte: dayStart },
  })
    .select('isHalfDay halfDayType numberOfDays leaveType leaveNature')
    .lean();

  const leaveSplits = await LeaveSplit.find({
    employeeId: emp._id,
    status: 'approved',
    month: MONTH,
  })
    .select('date isHalfDay halfDayType numberOfDays leaveType leaveNature')
    .lean();

  const ods = await OD.find({
    employeeId: emp._id,
    status: { $in: ['approved', 'hr_approved', 'hod_approved'] },
    isActive: true,
    fromDate: { $lte: dayEnd },
    toDate: { $gte: dayStart },
  })
    .select('isHalfDay halfDayType numberOfDays odType')
    .lean();

  const day = pickDay(pr);
  const editsForDate = Array.isArray(pr?.editHistory)
    ? pr.editHistory.filter((e) => e && e.date === DATE)
    : [];

  console.log(`\n==================== ${empNoNorm} (${emp.employee_name || '-'}) ====================`);
  console.log(`DATE=${DATE}  MONTH=${MONTH}`);
  console.log(`PayRegister summaryLocked: ${Boolean(pr?.summaryLocked)}  editsForDate: ${editsForDate.length}`);
  console.log('\nAttendanceDaily:');
  console.log({
    status: attendance?.status || null,
    payableShifts: attendance?.payableShifts ?? null,
    rosterFirstHalfNonWorking: attendance?.rosterFirstHalfNonWorking ?? null,
    rosterSecondHalfNonWorking: attendance?.rosterSecondHalfNonWorking ?? null,
    shiftId: attendance?.shiftId?._id || attendance?.shiftId || null,
    segments: Array.isArray(attendance?.shifts)
      ? attendance.shifts.map((s) => ({
          status: s.status,
          payableShift: s.payableShift,
          shiftId: s.shiftId?._id || s.shiftId || null,
          shiftName: s.shiftName || s.shiftId?.name || null,
        }))
      : null,
  });

  console.log('\nOD docs overlapping date:');
  console.log(ods.map((o) => ({ isHalfDay: o.isHalfDay, halfDayType: o.halfDayType, numberOfDays: o.numberOfDays, odType: o.odType })));

  console.log('\nLeave docs overlapping date:');
  console.log(leaves.map((l) => ({ isHalfDay: l.isHalfDay, halfDayType: l.halfDayType, numberOfDays: l.numberOfDays, leaveType: l.leaveType, leaveNature: l.leaveNature })));

  console.log('\nLeaveSplit rows for month (showing this date only):');
  console.log(
    leaveSplits
      .filter((s) => String(s.date).slice(0, 10) === DATE)
      .map((s) => ({ date: String(s.date).slice(0, 10), isHalfDay: s.isHalfDay, halfDayType: s.halfDayType, numberOfDays: s.numberOfDays, leaveType: s.leaveType, leaveNature: s.leaveNature }))
  );

  console.log('\nPayRegister day record:');
  if (!day) {
    console.log('  (no dailyRecord for this date in pay register)');
  } else {
    console.log({
      status: day.status,
      isSplit: day.isSplit,
      isManuallyEdited: day.isManuallyEdited,
      firstHalf: day.firstHalf,
      secondHalf: day.secondHalf,
      leaveType: day.leaveType,
      leaveNature: day.leaveNature,
      isOD: day.isOD,
      payableShifts: day.payableShifts,
      shiftId: day.shiftId,
      shiftName: day.shiftName,
      shiftIds: day.shiftIds,
      shiftSelections: day.shiftSelections,
    });
  }

  console.log('\nPayRegister editHistory entries for date:');
  console.log(
    editsForDate.map((e) => ({
      field: e.field,
      oldValue: e.oldValue,
      newValue: e.newValue,
      editedByName: e.editedByName,
      editedAt: e.editedAt,
    }))
  );
}

async function main() {
  if (!EMP_NO_RAW) {
    console.log('Usage: node scripts/diag_payregister_half_holiday_day.js YYYY-MM-DD EMP_NO [YYYY-MM]');
    process.exit(1);
  }
  await mongoose.connect(process.env.MONGODB_URI);
  await diagOne(EMP_NO_RAW);
  await mongoose.disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

