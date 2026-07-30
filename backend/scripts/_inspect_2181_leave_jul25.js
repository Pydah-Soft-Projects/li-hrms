require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const mongoose = require('mongoose');
const AttendanceDaily = require('../attendance/model/AttendanceDaily');
const Leave = require('../leaves/model/Leave');

(async () => {
  await mongoose.connect((process.env.MONGODB_URI || '').trim());

  for (const emp of ['2181', '2149']) {
    for (const date of ['2026-07-25', '2026-07-27']) {
      const d = await AttendanceDaily.findOne({ employeeNumber: emp, date }).lean();
      if (!d) {
        console.log(emp, date, 'NO_ATT');
        continue;
      }
      console.log(
        '\n====',
        emp,
        date,
        '====',
        JSON.stringify(
          {
            status: d.status,
            payableShifts: d.payableShifts,
            totalWorkingHours: d.totalWorkingHours,
            partial: d.policyMeta?.partialDayRule,
            sandwich: d.policyMeta?.sandwichRule,
            shifts: d.shifts,
            odDetails: d.odDetails,
            notes: d.notes,
          },
          null,
          2
        )
      );
    }
  }

  // Leaves overlapping July 25 for these emps
  const leaves = await Leave.find({
    emp_no: { $in: ['2181', '2149'] },
    status: { $in: ['approved', 'pending', 'Approved', 'Pending'] },
    $or: [
      { fromDate: { $lte: new Date('2026-07-26T00:00:00.000Z') }, toDate: { $gte: new Date('2026-07-24T00:00:00.000Z') } },
      { startDate: { $lte: '2026-07-25' }, endDate: { $gte: '2026-07-25' } },
      { from_date: { $lte: '2026-07-25' }, to_date: { $gte: '2026-07-25' } },
    ],
  })
    .select('emp_no status leaveType leaveNature fromDate toDate startDate endDate halfDayType session isHalfDay durationDays')
    .lean();

  console.log('\nLEAVES_NEAR_JUL25', JSON.stringify(leaves, null, 2));

  // Also list Leave collection field sample
  const sample = await Leave.findOne({ emp_no: '2181' }).lean();
  console.log('\nLEAVE_SAMPLE_KEYS', sample ? Object.keys(sample).sort().join(',') : null);

  await mongoose.disconnect();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
