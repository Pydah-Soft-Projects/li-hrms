require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const mongoose = require('mongoose');
const AttendanceDaily = require('../attendance/model/AttendanceDaily');
const MonthlyAttendanceSummary = require('../attendance/model/MonthlyAttendanceSummary');

(async () => {
  await mongoose.connect((process.env.MONGODB_URI || '').trim());

  for (const emp of ['2181', '2149']) {
    const d = await AttendanceDaily.findOne({ employeeNumber: emp, date: '2026-07-25' })
      .select('status payableShifts totalWorkingHours updatedAt lastSyncedAt policyMeta.partialDayRule createdAt')
      .lean();
    console.log(emp, 'daily', JSON.stringify(d, null, 2));
  }

  // Find summaries that mention these dates in contributingDates or daySnapshots
  const sums = await MonthlyAttendanceSummary.find({
    employeeNumber: { $in: ['2181', '2149'] },
  })
    .select('employeeNumber year month payrollYear payrollMonth periodStart periodEnd totalPresentDays totalLopLeaves totalLeaveDays contributingDates.lopLeaves contributingDates.present contributingDates.partial payRegisterDaySnapshots updatedAt')
    .lean();

  for (const s of sums) {
    const lop = (s.contributingDates?.lopLeaves || []).filter((x) => String(x.date).startsWith('2026-07-2'));
    const present = (s.contributingDates?.present || []).filter((x) => String(x.date).startsWith('2026-07-2'));
    const partial = (s.contributingDates?.partial || []).filter((x) => String(x.date).startsWith('2026-07-2'));
    const snaps = (s.payRegisterDaySnapshots || []).filter((x) =>
      ['2026-07-25', '2026-07-27', '2026-07-29'].includes(String(x.date))
    );
    if (!lop.length && !partial.length && !snaps.length) continue;
    console.log(
      '\nSUMMARY',
      s.employeeNumber,
      s.year,
      s.month,
      s.payrollYear,
      s.payrollMonth,
      s.periodStart,
      s.periodEnd,
      'updatedAt',
      s.updatedAt
    );
    console.log('lopLeaves late july', JSON.stringify(lop));
    console.log('present late july', JSON.stringify(present));
    console.log('partial late july', JSON.stringify(partial));
    console.log('snaps', JSON.stringify(snaps, null, 2));
  }

  await mongoose.disconnect();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
