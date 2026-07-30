require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const mongoose = require('mongoose');
const AttendanceDaily = require('../attendance/model/AttendanceDaily');
const MonthlyAttendanceSummary = require('../attendance/model/MonthlyAttendanceSummary');

(async () => {
  await mongoose.connect((process.env.MONGODB_URI || '').trim());
  const rows = await AttendanceDaily.find({
    date: { $gte: '2026-07-26', $lte: '2026-07-31' },
    employeeNumber: '2181',
  }).lean();
  for (const d of rows) {
    console.log(
      JSON.stringify(
        {
          date: d.date,
          status: d.status,
          payableShifts: d.payableShifts,
          partial: d.policyMeta?.partialDayRule,
          sandwich: d.policyMeta?.sandwichRule,
          shifts: (d.shifts || []).map((s) => ({
            status: s.status,
            payable: s.payableShift,
            wh: s.workingHours,
            segPay: s.segmentTotalPayableShifts,
          })),
        },
        null,
        2
      )
    );
  }

  // Monthly summaries for July / August
  const sums = await MonthlyAttendanceSummary.find({
    employeeNumber: '2181',
    $or: [
      { year: 2026, month: 7 },
      { year: 2026, month: 8 },
      { payrollYear: 2026, payrollMonth: 7 },
      { payrollYear: 2026, payrollMonth: 8 },
    ],
  }).lean();
  console.log('SUMMARIES', JSON.stringify(sums.map((s) => {
    const keys = Object.keys(s);
    return {
      keys,
      year: s.year,
      month: s.month,
      payrollYear: s.payrollYear,
      payrollMonth: s.payrollMonth,
      presentDays: s.presentDays,
      lopDays: s.lopDays,
      paidDays: s.paidDays,
      halfDays: s.halfDays,
      totals: s.totals,
      summary: s.summary,
    };
  }), null, 2));

  await mongoose.disconnect();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
