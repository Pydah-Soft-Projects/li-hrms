require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const { connectMongoDB, closeMongoDB } = require('../config/database');
const AttendanceDaily = require('../attendance/model/AttendanceDaily');
const OD = require('../leaves/model/OD');
const MonthlyAttendanceSummary = require('../attendance/model/MonthlyAttendanceSummary');
const Employee = require('../employees/model/Employee');
const { createISTDate } = require('../shared/utils/dateUtils');

const EMPS = ['111123', '2228', '628', '247', '1564'];
const DATE = '2026-05-19';

(async () => {
  await connectMongoDB();
  for (const emp of EMPS) {
    const d = await AttendanceDaily.findOne({ employeeNumber: emp, date: DATE }).lean();
    console.log('\n---', emp);
    console.log('  daily:', d?.status, 'payable', d?.payableShifts);
    console.log('  notes:', (d?.notes || '').slice(0, 100));
    const e = await Employee.findOne({ emp_no: emp }).lean();
    if (e) {
      const ods = await OD.find({
        employeeId: e._id,
        fromDate: { $lte: createISTDate(DATE, '23:59') },
        toDate: { $gte: createISTDate(DATE, '00:00') },
      })
        .select('status isHalfDay halfDayType numberOfDays odType_extended remarks')
        .lean();
      for (const o of ods) {
        console.log('  OD:', o.status, o.odType_extended, o.halfDayType, o.numberOfDays, (o.remarks || '').includes('Narrowed') ? 'NARROWED' : '');
      }
    }
    const sum = await MonthlyAttendanceSummary.findOne({ emp_no: emp, month: '2026-05' })
      .select('contributingDates totalPresentDays totalPayableShifts totalHolidays')
      .lean();
    const pres = sum?.contributingDates?.present?.find((x) => x.date === DATE);
    const pay = sum?.contributingDates?.payableShifts?.find((x) => x.date === DATE);
    const hol = sum?.contributingDates?.holidays?.find((x) => x.date === DATE);
    console.log('  contrib present:', pres, 'payable:', pay, 'holiday:', hol);
  }
  await closeMongoDB();
})();
