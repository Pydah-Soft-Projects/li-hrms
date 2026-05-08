require('dotenv').config();
const mongoose = require('mongoose');
const { calculateMonthlySummaryByEmpNo } = require('../attendance/services/summaryCalculationService');

(async () => {
  const empNos = ['2144', '2145', '2146'];
  const month = '2026-04';
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Recalculating MonthlyAttendanceSummary for', { empNos, month });
    for (const empNo of empNos) {
      try {
        await calculateMonthlySummaryByEmpNo(empNo, month);
        console.log('OK', empNo);
      } catch (e) {
        console.error('FAIL', empNo, e.message);
      }
    }
    await mongoose.disconnect();
    console.log('Done');
  } catch (err) {
    console.error(err);
    process.exitCode = 1;
    try { await mongoose.disconnect(); } catch (_) {}
  }
})();

