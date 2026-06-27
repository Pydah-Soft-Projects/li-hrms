/**
 * Feed IN/OUT punches for emp 924 on 2026-06-15 and recalc June summary.
 * Usage: node scripts/feed_emp924_june15_punches.js
 */
require('dotenv').config();
const mongoose = require('mongoose');
const Employee = require('../employees/model/Employee');
const AttendanceDaily = require('../attendance/model/AttendanceDaily');
const AttendanceRawLog = require('../attendance/model/AttendanceRawLog');
const MonthlyAttendanceSummary = require('../attendance/model/MonthlyAttendanceSummary');
const { createISTDate } = require('../shared/utils/dateUtils');
const { reprocessAttendanceForEmployeeDate } = require('../attendance/services/attendanceSyncService');
const { calculateMonthlySummary } = require('../attendance/services/summaryCalculationService');
const { isEmployeeNumberDateLocked } = require('../shared/services/payrollPeriodLockService');

const EMP_NO = '924';
const DATE = '2026-06-15';
const IN_TIME = '09:10';
const OUT_TIME = '17:33';

async function run() {
  await mongoose.connect(process.env.MONGODB_URI);

  const emp = await Employee.findOne({ emp_no: EMP_NO }).select('_id emp_no employee_name').lean();
  if (!emp) throw new Error('Employee 924 not found');

  const locked = await isEmployeeNumberDateLocked(EMP_NO, DATE);
  if (locked) throw new Error(`Date ${DATE} is payroll-locked`);

  const beforeDaily = await AttendanceDaily.findOne({ employeeNumber: EMP_NO, date: DATE }).lean();
  const beforeJun14 = await AttendanceDaily.findOne({ employeeNumber: EMP_NO, date: '2026-06-14' })
    .select('date status policyMeta.sandwichRule')
    .lean();
  const beforeSummary = await MonthlyAttendanceSummary.findOne({ employeeId: emp._id, month: '2026-06' })
    .select('totalPresentDays totalAbsentDays totalLeaves totalLopLeaves totalWeeklyOffs')
    .lean();

  console.log('BEFORE daily Jun 15:', beforeDaily?.status, beforeDaily?.payableShifts);
  console.log('BEFORE daily Jun 14:', beforeJun14?.status, beforeJun14?.policyMeta?.sandwichRule?.effect);

  // Remove prior manual/raw logs for this day so reprocess is clean
  await AttendanceRawLog.deleteMany({ employeeNumber: EMP_NO, date: DATE });

  const inTs = createISTDate(DATE, IN_TIME);
  const outTs = createISTDate(DATE, OUT_TIME);

  await AttendanceRawLog.create([
    { employeeNumber: EMP_NO, date: DATE, timestamp: inTs, type: 'IN', source: 'manual' },
    { employeeNumber: EMP_NO, date: DATE, timestamp: outTs, type: 'OUT', source: 'manual' },
  ]);

  console.log('Created IN/OUT raw logs:', IN_TIME, OUT_TIME, 'IST');

  const reprocess = await reprocessAttendanceForEmployeeDate(EMP_NO, DATE);
  if (!reprocess.success) {
    throw new Error('Reprocess failed: ' + (reprocess.error || 'unknown'));
  }

  await calculateMonthlySummary(emp._id, EMP_NO, 2026, 6);

  const afterDaily = await AttendanceDaily.findOne({ employeeNumber: EMP_NO, date: DATE })
    .select('status payableShifts shifts policyMeta')
    .lean();
  const afterJun14 = await AttendanceDaily.findOne({ employeeNumber: EMP_NO, date: '2026-06-14' })
    .select('status payableShifts policyMeta.sandwichRule rosterFirstHalfNonWorking')
    .lean();
  const afterSummary = await MonthlyAttendanceSummary.findOne({ employeeId: emp._id, month: '2026-06' }).lean();

  console.log('\nAFTER daily Jun 15:', afterDaily?.status, 'pay=', afterDaily?.payableShifts);
  console.log('AFTER daily Jun 14:', afterJun14?.status, 'sandwich=', afterJun14?.policyMeta?.sandwichRule);
  console.log('AFTER summary:', {
    present: afterSummary?.totalPresentDays,
    absent: afterSummary?.totalAbsentDays,
    leaves: afterSummary?.totalLeaves,
    lopLeaves: afterSummary?.totalLopLeaves,
    wo: afterSummary?.totalWeeklyOffs,
  });

  const cd = afterSummary?.contributingDates || {};
  console.log('Jun 14 leaves:', (cd.leaves || []).filter((x) => x.date === '2026-06-14'));
  console.log('Jun 14 lop:', (cd.lopLeaves || []).filter((x) => x.date === '2026-06-14'));
  console.log('Jun 14 wo:', (cd.weeklyOffs || []).filter((x) => x.date === '2026-06-14'));
  console.log('Jun 15 absent:', (cd.absent || []).filter((x) => x.date === '2026-06-15'));

  await mongoose.disconnect();
  console.log('\nDone.');
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
