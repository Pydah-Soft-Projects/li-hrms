require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const mongoose = require('mongoose');

(async () => {
  await mongoose.connect(process.env.MONGODB_URI);
  const PR = require('../payroll/model/PayrollRecord');
  const Loan = require('../loans/model/Loan');

  const total = await PR.countDocuments();
  const withEmi = await PR.countDocuments({ 'loanAdvance.totalEMI': { $gt: 0 } });
  const withAdv = await PR.countDocuments({ 'loanAdvance.advanceDeduction': { $gt: 0 } });
  const withBreakdown = await PR.countDocuments({ 'loanAdvance.emiBreakdown.0': { $exists: true } });

  console.log({ totalPayrollRecords: total, withEmi, withAdv, withEmiBreakdown: withBreakdown });

  const months = await PR.aggregate([
    { $group: { _id: '$month', n: { $sum: 1 } } },
    { $sort: { _id: -1 } },
    { $limit: 10 },
  ]);
  console.log('Months:', months);

  const sample = await PR.findOne({ month: { $exists: true } }).select('month emp_no loanAdvance netSalary').lean();
  console.log('Sample:', JSON.stringify(sample, null, 2));

  const activeLoans = await Loan.countDocuments({
    requestType: 'loan',
    status: { $in: ['active', 'disbursed'] },
  });
  const activeAdv = await Loan.countDocuments({
    requestType: 'salary_advance',
    status: { $in: ['active', 'disbursed'] },
  });
  console.log({ activeLoans, activeAdv });

  const loanSample = await Loan.findOne({
    requestType: 'loan',
    status: { $in: ['active', 'disbursed'] },
  })
    .select('employeeId requestType status repayment')
    .populate('employeeId', 'emp_no')
    .lean();
  console.log('Loan sample:', loanSample ? { emp: loanSample.employeeId?.emp_no, repayment: loanSample.repayment } : null);

  await mongoose.disconnect();
})();
