require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
const mongoose = require('mongoose');
const Employee = require('../employees/model/Employee');
const MonthlyAttendanceSummary = require('../attendance/model/MonthlyAttendanceSummary');

const EMP_NO = String(process.argv[2] || '').trim().toUpperCase();
const MONTH = process.argv[3] || '2026-05';
const DATE = process.argv[4] || '2026-05-19';

async function main() {
  if (!EMP_NO) {
    console.log('Usage: node scripts/diag_monthly_summary_payregister_snapshot.js EMP_NO [YYYY-MM] [YYYY-MM-DD]');
    process.exit(1);
  }
  await mongoose.connect(process.env.MONGODB_URI);
  const emp = await Employee.findOne({ emp_no: EMP_NO }).select('_id emp_no employee_name').lean();
  if (!emp) {
    console.log('Employee not found:', EMP_NO);
    process.exit(1);
  }
  const sum = await MonthlyAttendanceSummary.findOne({ employeeId: emp._id, month: MONTH })
    .select('month totalODs totalPresentDays totalPayableShifts contributingDates payRegisterDaySnapshots')
    .lean();
  if (!sum) {
    console.log('MonthlyAttendanceSummary not found for', EMP_NO, MONTH);
    process.exit(0);
  }
  const snap = Array.isArray(sum.payRegisterDaySnapshots)
    ? sum.payRegisterDaySnapshots.find((s) => String(s.date) === DATE)
    : null;

  console.log({ EMP_NO, name: emp.employee_name, MONTH, DATE });
  console.log('Summary totals:', {
    totalPresentDays: sum.totalPresentDays,
    totalODs: sum.totalODs,
    totalPayableShifts: sum.totalPayableShifts,
  });
  console.log('ContributingDates (date entries for this day):', {
    holidays: (sum.contributingDates?.holidays || []).filter((e) => e?.date === DATE),
    ods: (sum.contributingDates?.ods || []).filter((e) => e?.date === DATE),
    present: (sum.contributingDates?.present || []).filter((e) => e?.date === DATE),
    payableShifts: (sum.contributingDates?.payableShifts || []).filter((e) => e?.date === DATE),
    conflicts: (sum.contributingDates?.conflicts || []).filter((e) => e?.date === DATE),
  });
  console.log('payRegisterDaySnapshot:', snap || null);
  await mongoose.disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

