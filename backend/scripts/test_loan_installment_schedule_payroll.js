/**
 * Test loan installment schedule + payroll EMI deduction.
 * Run: node scripts/test_loan_installment_schedule_payroll.js
 */
require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
const mongoose = require('mongoose');
const path = require('path');
const backendRoot = path.resolve(__dirname, '..');

require(path.join(backendRoot, 'departments', 'model', 'Department'));
require(path.join(backendRoot, 'departments', 'model', 'Division'));
const Employee = require(path.join(backendRoot, 'employees', 'model', 'Employee'));
const User = require(path.join(backendRoot, 'users', 'model', 'User'));
const Loan = require(path.join(backendRoot, 'loans', 'model', 'Loan'));
const { calculateEMI } = require(path.join(backendRoot, 'loans', 'services/loanHistoryRepairService'));
const { getDueInstallmentAmount, buildLoanInstallmentPlan } = require(path.join(backendRoot, 'loans', 'services/loanInstallmentScheduleService'));
const loanAdvanceService = require(path.join(backendRoot, 'payroll', 'services/loanAdvanceService'));

const PREFIX = 'LA_INST';
const MONTH = process.env.MONTH || '2026-04';

async function main() {
  await mongoose.connect(process.env.MONGODB_URI || process.env.MONGO_URI);
  const user = await User.findOne({ isActive: true }).select('_id').lean();
  const userId = user?._id || new mongoose.Types.ObjectId();

  const empNo = `${PREFIX}_E01`;
  await Loan.deleteMany({ emp_no: empNo });
  let emp = await Employee.findOne({ emp_no: empNo });
  if (!emp) {
    emp = await Employee.create({
      emp_no: empNo,
      employee_name: `${PREFIX} Installment test`,
      gross_salary: 50000,
      is_active: true,
      gender: 'Male',
    });
  }

  const principal = 50003;
  const duration = 10;
  const emiResult = calculateEMI(principal, 0, duration);
  const plan = buildLoanInstallmentPlan(principal, duration);

  console.log('Plan for ₹50003 / 10 months:');
  console.log('  regular EMI:', plan.emiAmount);
  console.log('  total installments:', plan.totalInstallments);
  console.log('  final EMI:', plan.finalEmiAmount);
  plan.installmentSchedule.forEach((s) => console.log(`    #${s.installmentNumber}: ₹${s.amount} (${s.type})`));

  await Loan.create({
    employeeId: emp._id,
    emp_no: empNo,
    appliedBy: userId,
    requestType: 'loan',
    amount: principal,
    originalAmount: principal,
    reason: 'Installment schedule test',
    duration,
    interestAmount: 0,
    status: 'disbursed',
    workflow: { currentStep: 'completed', isCompleted: true },
    loanConfig: {
      emiAmount: emiResult.emiAmount,
      finalEmiAmount: emiResult.finalEmiAmount,
      installmentSchedule: emiResult.installmentSchedule,
      regularInstallmentCount: emiResult.regularInstallmentCount,
      requestedDuration: emiResult.requestedDuration,
      totalAmount: emiResult.totalAmount,
      totalInterest: 0,
    },
    repayment: {
      remainingBalance: emiResult.totalAmount,
      totalPaid: 0,
      installmentsPaid: 0,
      totalInstallments: emiResult.totalInstallments,
    },
    approvals: { final: { firstDeductionPayrollMonth: MONTH } },
    disbursement: { disbursedAt: new Date() },
    appliedAt: new Date(),
  });

  const emiPayroll = await loanAdvanceService.calculateTotalEMI(emp._id, MONTH);
  console.log('\nPayroll month 1 EMI due:', emiPayroll.totalEMI, '(expected', plan.emiAmount, ')');

  // Simulate 9 payments
  const loan = await Loan.findOne({ emp_no: empNo });
  loan.repayment.installmentsPaid = 9;
  loan.repayment.totalPaid = plan.emiAmount * 9;
  loan.repayment.remainingBalance = emiResult.totalAmount - loan.repayment.totalPaid;
  await loan.save();

  const emi10 = getDueInstallmentAmount(loan);
  console.log('After 9 paid, next due:', emi10, '(expected 5000 — extension regular)');

  loan.repayment.installmentsPaid = 10;
  loan.repayment.totalPaid += 5000;
  loan.repayment.remainingBalance = emiResult.totalAmount - loan.repayment.totalPaid;
  await loan.save();
  const emi11 = getDueInstallmentAmount(loan);
  console.log('After 10 paid, final due:', emi11, '(expected 3 — final_adjustment)');

  const ok =
    emiPayroll.totalEMI === plan.emiAmount &&
    emi10 === 5000 &&
    emi11 === 3;
  console.log(ok ? '\nPASS: installment + payroll integration' : '\nFAIL: check values above');

  await mongoose.disconnect();
  process.exit(ok ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
