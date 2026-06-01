require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
const mongoose = require('mongoose');
const PreScheduledShift = require('../shifts/model/PreScheduledShift');
const MonthlyAttendanceSummary = require('../attendance/model/MonthlyAttendanceSummary');
const { parseRosterHalfNonWorking } = require('../shifts/utils/rosterHalfNonWorking');

const D = '2026-05-19';

async function main() {
  await mongoose.connect(process.env.MONGODB_URI);
  const rows = await PreScheduledShift.find({ date: D })
    .select('employeeNumber firstHalfStatus secondHalfStatus status')
    .lean();
  const empNos = [];
  for (const r of rows) {
    const p = parseRosterHalfNonWorking(r);
    if (p.secondHOL && !p.firstHOL && !p.isFullHOL) {
      empNos.push(String(r.employeeNumber || '').trim().toUpperCase());
    }
  }
  const unique = [...new Set(empNos)];
  const sums = await MonthlyAttendanceSummary.find({ month: '2026-05', emp_no: { $in: unique } })
    .select('emp_no totalHolidays contributingDates')
    .lean();
  let hol19 = 0;
  let paid19 = 0;
  let lop19 = 0;
  for (const s of sums) {
    const cd = s.contributingDates || {};
    if ((cd.holidays || []).some((x) => x.date === D)) hol19 += 1;
    if ((cd.paidLeaves || []).some((x) => x.date === D)) paid19 += 1;
    if ((cd.lopLeaves || []).some((x) => x.date === D)) lop19 += 1;
  }
  const e2161 = sums.find((s) => s.emp_no === '2161');
  const cd = e2161?.contributingDates || {};
  console.log(
    JSON.stringify(
      {
        halfHolRosterOn19May: unique.length,
        summariesFound: sums.length,
        on19May: { holCredit: hol19, paidLeave: paid19, sandwichLop: lop19 },
        emp2161: {
          totalHolidays: e2161?.totalHolidays,
          paid19: (cd.paidLeaves || []).find((x) => x.date === D),
          hol19: (cd.holidays || []).find((x) => x.date === D),
          leave19: (cd.leaves || []).find((x) => x.date === D),
        },
      },
      null,
      2
    )
  );
  await mongoose.disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
