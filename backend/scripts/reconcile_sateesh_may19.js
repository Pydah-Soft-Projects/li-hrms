require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const { connectMongoDB, closeMongoDB } = require('../config/database');
const Employee = require('../employees/model/Employee');
const Leave = require('../leaves/model/Leave');
const AttendanceDaily = require('../attendance/model/AttendanceDaily');
const { runLeaveAttendanceReconciliation } = require('../leaves/services/leaveAttendanceReconciliationService');
const summaryCalculationService = require('../attendance/services/summaryCalculationService');
const { createISTDate } = require('../shared/utils/dateUtils');

const DATE = '2026-05-19';

(async () => {
  await connectMongoDB();
  const e = await Employee.findOne({ employee_name: /SABBI SATEESH/i })
    .select('emp_no employee_name _id')
    .lean();
  if (!e) {
    console.log('Employee SABBI SATEESH not found');
    await closeMongoDB();
    return;
  }
  console.log('Employee:', e.emp_no, e.employee_name);

  const dayStart = createISTDate(DATE, '00:00');
  const dayEnd = createISTDate(DATE, '23:59');
  const before = await Leave.find({
    employeeId: e._id,
    fromDate: { $lte: dayEnd },
    toDate: { $gte: dayStart },
  })
    .select('isHalfDay halfDayType numberOfDays remarks status leaveType')
    .lean();
  console.log('\nLeave BEFORE:', before);

  const daily = await AttendanceDaily.findOne({
    employeeNumber: String(e.emp_no).toUpperCase(),
    date: DATE,
  });
  const recon = await runLeaveAttendanceReconciliation(e, DATE, daily);
  console.log('\nReconciliation:', recon?.results?.filter((x) => x.leaveId));

  const after = await Leave.find({
    employeeId: e._id,
    fromDate: { $lte: dayEnd },
    toDate: { $gte: dayStart },
  })
    .select('isHalfDay halfDayType numberOfDays remarks status leaveType')
    .lean();
  console.log('\nLeave AFTER:', after);

  await summaryCalculationService.recalculateOnAttendanceUpdate(e.emp_no, DATE);
  console.log('\nSummary recalculated for', DATE);

  await closeMongoDB();
})();
