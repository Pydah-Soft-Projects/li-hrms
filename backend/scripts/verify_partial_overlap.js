require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
const mongoose = require('mongoose');
const { calculateMonthlySummaryByEmpNo } = require('../attendance/services/summaryCalculationService');
const MonthlyAttendanceSummary = require('../attendance/model/MonthlyAttendanceSummary');
const Employee = require('../employees/model/Employee');

const EMPS = (process.env.EMP_LIST || '1962,1730,1715').split(',').map((s) => s.trim());

(async () => {
  await mongoose.connect(process.env.MONGODB_URI);
  for (const no of EMPS) {
    await calculateMonthlySummaryByEmpNo(no, '2026-05');
    const e = await Employee.findOne({ emp_no: no }).lean();
    const s = await MonthlyAttendanceSummary.findOne({ employeeId: e._id, month: '2026-05' }).lean();
    const overlap = Number(s.totalPartialPresentPayableOverlap) || 0;
    const merged = Math.round((s.totalPresentDays + s.totalPartialDays - overlap) * 100) / 100;
    console.log(no, {
      present: s.totalPresentDays,
      partial: s.totalPartialDays,
      overlap,
      payRegisterPresent: merged,
      partialRows: s.contributingDates?.partial,
    });
  }
  await mongoose.disconnect();
})();
