require('dotenv').config();
const mongoose = require('mongoose');
const MonthlyAttendanceSummary = require('./attendance/model/MonthlyAttendanceSummary');
const AttendanceDaily = require('./attendance/model/AttendanceDaily');
(async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI, { useNewUrlParser: true, useUnifiedTopology: true });
    const empNos = ['2144','2145','2146'];
    const month = '2026-04';
    const summaries = await MonthlyAttendanceSummary.find({ emp_no: { $in: empNos }, month }).lean();
    console.log('SUMMARIES:', JSON.stringify(summaries.map(s => ({ emp_no: s.emp_no, totalPermissionCount: s.totalPermissionCount, totalPermissionDeductionDays: s.totalPermissionDeductionDays, totalAttendanceDeductionDays: s.totalAttendanceDeductionDays, permissionDeductionBreakdown: s.permissionDeductionBreakdown, totalDaysInMonth: s.totalDaysInMonth })), null, 2));
    const daily = await AttendanceDaily.find({ employeeNumber: { $in: empNos }, date: { $gte: '2026-04-01', $lte: '2026-04-30' } }).select('employeeNumber date permissionCount permissionHours permissionDeduction status shifts').lean().sort({ employeeNumber:1, date:1 });
    const grouped = {};
    daily.forEach(d => { grouped[d.employeeNumber] = grouped[d.employeeNumber] || []; grouped[d.employeeNumber].push(d); });
    console.log('DAILY_COUNTS:');
    for (const empNo of empNos) {
      const recs = grouped[empNo] || [];
      const totalCount = recs.reduce((a,r) => a + (Number(r.permissionCount)||0), 0);
      const totalDed = recs.reduce((a,r) => a + (Number(r.permissionDeduction)||0), 0);
      console.log(empNo, 'daily count', totalCount, 'daily ded', totalDed, 'rows', recs.length);
    }
    await mongoose.disconnect();
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
})();
