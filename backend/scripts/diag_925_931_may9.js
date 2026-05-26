require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
const mongoose = require('mongoose');
const Employee = require('../employees/model/Employee');
const AttendanceDaily = require('../attendance/model/AttendanceDaily');
const Leave = require('../leaves/model/Leave');
const OD = require('../leaves/model/OD');
const Settings = require('../settings/model/Settings');
const { createISTDate, extractISTComponents } = require('../shared/utils/dateUtils');
const { computeRawAttendanceHalfCreditsSync } = require('../attendance/utils/attendanceHalfPresence');
const { runLeaveAttendanceReconciliation } = require('../leaves/services/leaveAttendanceReconciliationService');

const DATE = '2026-05-09';
const EMPS = ['925', '931'];

(async () => {
  await mongoose.connect(process.env.MONGODB_URI);
  const s1 = await Settings.findOne({ key: 'leave_attendance_reconciliation_enabled' }).lean();
  const s2 = await Settings.findOne({ key: 'skip_leave_attendance_reconciliation' }).lean();
  console.log('Settings:', {
    enabled: s1?.value ?? '(default true)',
    skip: s2?.value ?? false,
    envSkip: process.env.SKIP_LEAVE_ATTENDANCE_RECONCILIATION,
  });

  for (const no of EMPS) {
    const emp = await Employee.findOne({ emp_no: no }).lean();
    const daily = await AttendanceDaily.findOne({ employeeNumber: no, date: DATE }).lean();
    const dayStart = createISTDate(DATE, '00:00');
    const dayEnd = createISTDate(DATE, '23:59');
    const ods = await OD.find({
      employeeId: emp._id,
      status: 'approved',
      fromDate: { $lte: dayEnd },
      toDate: { $gte: dayStart },
    })
      .select('isHalfDay halfDayType')
      .lean();
    const leaves = await Leave.find({
      employeeId: emp._id,
      status: 'approved',
      fromDate: { $lte: dayEnd },
      toDate: { $gte: dayStart },
    }).lean();

    const att = computeRawAttendanceHalfCreditsSync(daily, ods, { processingMode: 'single_shift' });
    console.log(`\n=== ${no} ${emp?.employee_name} ===`);
    console.log('Daily:', daily?.status, 'payable=', daily?.payableShifts);
    console.log('Att halves:', att);
    console.log(
      'Shifts:',
      (daily?.shifts || []).map((s) => ({
        in: !!s.inTime,
        out: !!s.outTime,
        status: s.status,
        payable: s.payableShift,
      }))
    );
    for (const l of leaves) {
      console.log('Leave:', {
        id: l._id,
        type: l.leaveType,
        nature: l.leaveNature,
        half: l.isHalfDay,
        halfType: l.halfDayType,
        days: l.numberOfDays,
        from: extractISTComponents(l.fromDate).dateStr,
        to: extractISTComponents(l.toDate).dateStr,
        reconRemark: String(l.remarks || '').includes('[Auto attendance reconciliation]'),
      });
    }

    if (daily) {
      const empDoc = await Employee.findById(emp._id);
      const recon = await runLeaveAttendanceReconciliation(empDoc, DATE, daily);
      console.log('Reconciliation NOW:', JSON.stringify(recon, null, 2));
      const leavesAfter = await Leave.find({
        employeeId: emp._id,
        fromDate: { $lte: dayEnd },
        toDate: { $gte: dayStart },
      })
        .select('status leaveType isHalfDay halfDayType numberOfDays remarks')
        .lean();
      console.log('Leaves after recon:', leavesAfter);
    }
  }
  await mongoose.disconnect();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
