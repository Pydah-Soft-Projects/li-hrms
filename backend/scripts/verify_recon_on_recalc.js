require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
const mongoose = require('mongoose');
const { calculateMonthlySummaryByEmpNo } = require('../attendance/services/summaryCalculationService');
const Employee = require('../employees/model/Employee');
const Leave = require('../leaves/model/Leave');
const { createISTDate, extractISTComponents } = require('../shared/utils/dateUtils');

const EMPS = (process.env.EMP_LIST || '925,931').split(',').map((s) => s.trim());

(async () => {
  await mongoose.connect(process.env.MONGODB_URI);
  for (const no of EMPS) {
    console.log('\n--- Recalc', no, '2026-05 ---');
    await calculateMonthlySummaryByEmpNo(no, '2026-05');
    const emp = await Employee.findOne({ emp_no: no }).lean();
    const leaves = await Leave.find({
      employeeId: emp._id,
      $or: [
        { fromDate: { $lte: createISTDate('2026-05-09', '23:59') }, toDate: { $gte: createISTDate('2026-05-09', '00:00') } },
        { fromDate: { $lte: createISTDate('2026-05-04', '23:59') }, toDate: { $gte: createISTDate('2026-05-09', '00:00') } },
      ],
    })
      .select('status fromDate toDate numberOfDays remarks')
      .lean();
    console.log(
      'Related leaves:',
      leaves.map((l) => ({
        status: l.status,
        from: extractISTComponents(l.fromDate).dateStr,
        to: extractISTComponents(l.toDate).dateStr,
        days: l.numberOfDays,
        recon: String(l.remarks || '').includes('[Auto attendance reconciliation]'),
      }))
    );
  }
  await mongoose.disconnect();
})();
