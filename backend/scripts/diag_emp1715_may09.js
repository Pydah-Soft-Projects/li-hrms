require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const mongoose = require('mongoose');
const AttendanceDaily = require('../attendance/model/AttendanceDaily');
const MonthlyAttendanceSummary = require('../attendance/model/MonthlyAttendanceSummary');
const Leave = require('../leaves/model/Leave');
const Employee = require('../employees/model/Employee');
const { createISTDate } = require('../shared/utils/dateUtils');
const {
  computeRawAttendanceHalfCreditsSync,
  partialInOutSatisfiesHalfDay,
  partialSingleShiftHalfCredits,
} = require('../attendance/utils/attendanceHalfPresence');

const DATE = '2026-05-09';
const EMP = '1715';

(async () => {
  const uri = process.env.MONGODB_URI;
  console.log('Connected to:', (uri || '').replace(/:[^:@]+@/, ':****@').slice(0, 80));
  await mongoose.connect(uri);

  const emp = await Employee.findOne({ emp_no: EMP }).lean();
  const daily = await AttendanceDaily.findOne({ employeeNumber: EMP, date: DATE }).lean();

  console.log('\n=== AttendanceDaily ===');
  if (!daily) {
    console.log('NOT FOUND');
  } else {
    console.log({
      status: daily.status,
      payableShifts: daily.payableShifts,
      totalWorkingHours: daily.totalWorkingHours,
      totalExpectedHours: daily.totalExpectedHours,
      shifts: daily.shifts?.map((s) => ({
        status: s.status,
        inTime: s.inTime,
        outTime: s.outTime,
        punchHours: s.punchHours,
        payableShift: s.payableShift,
        shiftStartTime: s.shiftStartTime,
        shiftEndTime: s.shiftEndTime,
      })),
    });
    console.log('halfDayMet:', partialInOutSatisfiesHalfDay(daily));
    console.log('partialCredits:', partialSingleShiftHalfCredits(daily));
    console.log('rawCredits:', computeRawAttendanceHalfCreditsSync(daily, [], { processingMode: 'single_shift' }));
  }

  const start = createISTDate(DATE, '00:00');
  const end = createISTDate(DATE, '23:59');
  const leaves = await Leave.find({
    employeeId: emp._id,
    status: 'approved',
    isActive: { $ne: false },
    fromDate: { $lte: end },
    toDate: { $gte: start },
  })
    .select('leaveType isHalfDay halfDayType numberOfDays leaveNature status fromDate toDate')
    .lean();
  console.log('\n=== Approved leaves ===');
  console.log(leaves);

  const sum = await MonthlyAttendanceSummary.findOne({ emp_no: EMP, month: '2026-05' }).lean();
  const cd = sum?.contributingDates || {};
  const pick = (key) =>
    (cd[key] || []).filter((x) => (typeof x === 'string' ? x : x.date) === DATE);
  console.log('\n=== Monthly summary 2026-05 (this date) ===');
  console.log('totals:', {
    present: sum?.totalPresentDays,
    payable: sum?.totalPayableShifts,
    partial: sum?.totalPartialDays,
    leaves: sum?.totalLeaves,
    absent: sum?.totalAbsentDays,
  });
  for (const k of ['present', 'partial', 'leaves', 'paidLeaves', 'lopLeaves', 'absent', 'payableShifts']) {
    const v = pick(k);
    if (v.length) console.log(k + ':', JSON.stringify(v));
  }

  await mongoose.disconnect();
})();
