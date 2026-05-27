/**
 * End-to-end simulation: loan/advance recovery in dynamic payroll
 * (uncapped vs configurable payable cap column).
 *
 * Creates: division, department, designations, employees, pay registers,
 * disbursed loans/advances, runs payroll twice (no cap / with cap), prints results.
 *
 * Usage (from backend):
 *   node scripts/test_loan_advance_payroll_simulation.js
 *   MONTH=2026-04 node scripts/test_loan_advance_payroll_simulation.js
 *   CLEANUP=1 node scripts/test_loan_advance_payroll_simulation.js   # remove test data after run
 *
 * Requires MONGODB_URI or MONGO_URI in .env
 */

require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
const mongoose = require('mongoose');
const fs = require('fs');
const path = require('path');

const backendRoot = path.resolve(__dirname, '..');
require(path.join(backendRoot, 'departments', 'model', 'Department'));
require(path.join(backendRoot, 'departments', 'model', 'Division'));
require(path.join(backendRoot, 'departments', 'model', 'Designation'));

const Division = require(path.join(backendRoot, 'departments', 'model', 'Division'));
const Department = require(path.join(backendRoot, 'departments', 'model', 'Department'));
const Designation = require(path.join(backendRoot, 'departments', 'model', 'Designation'));
const Employee = require(path.join(backendRoot, 'employees', 'model', 'Employee'));
const User = require(path.join(backendRoot, 'users', 'model', 'User'));
const Loan = require(path.join(backendRoot, 'loans', 'model', 'Loan'));
const PayRegisterSummary = require(path.join(backendRoot, 'pay-register', 'model', 'PayRegisterSummary'));
const PayrollConfiguration = require(path.join(backendRoot, 'payroll', 'model', 'PayrollConfiguration'));
const PayrollRecord = require(path.join(backendRoot, 'payroll', 'model', 'PayrollRecord'));
const payrollCalculationFromOutputColumnsService = require(path.join(
  backendRoot,
  'payroll',
  'services',
  'payrollCalculationFromOutputColumnsService'
));
const loanAdvanceService = require(path.join(backendRoot, 'payroll', 'services', 'loanAdvanceService'));

const PREFIX = 'LA_TEST';
const MONTH = process.env.MONTH || '2026-04';
const CLEANUP = process.env.CLEANUP === '1' || process.env.CLEANUP === 'true';
const PAYABLE_CAP_HEADER = 'Earned Salary';

const SCENARIOS = [
  {
    code: 'E01',
    name: 'Baseline — no loan/advance',
    gross: 40000,
    advanceBalance: 0,
    emi: 0,
    expectUncapped: { advance: 0, emi: 0 },
    expectCapped: { advance: 0, emi: 0 },
  },
  {
    code: 'E02',
    name: 'Salary advance only',
    gross: 40000,
    advanceBalance: 12000,
    emi: 0,
    expectUncapped: { advance: 12000, emi: 0 },
    expectCapped: { advance: 12000, emi: 0 },
  },
  {
    code: 'E03',
    name: 'Loan EMI only',
    gross: 40000,
    advanceBalance: 0,
    emi: 5000,
    expectUncapped: { advance: 0, emi: 5000 },
    expectCapped: { advance: 0, emi: 5000 },
  },
  {
    code: 'E04',
    name: 'Advance + EMI — pool covers both',
    gross: 50000,
    advanceBalance: 8000,
    emi: 5000,
    expectUncapped: { advance: 8000, emi: 5000 },
    expectCapped: { advance: 8000, emi: 5000 },
  },
  {
    code: 'E05',
    name: 'Advance exceeds earned (cap trims advance, no EMI)',
    gross: 20000,
    advanceBalance: 25000,
    emi: 5000,
    expectUncapped: { advance: 25000, emi: 5000 },
    expectCapped: { advance: 20000, emi: 0 },
    // Dynamic payroll cap column = prorated Earned Salary from pay register
    expectCappedEarnedApprox: { advance: 19354.84, emi: 0 },
  },
  {
    code: 'E06',
    name: 'Advance + EMI — EMI trimmed by remainder',
    gross: 22000,
    advanceBalance: 18000,
    emi: 8000,
    expectUncapped: { advance: 18000, emi: 8000 },
    expectCapped: { advance: 18000, emi: 4000 },
    expectCappedEarnedApprox: { advance: 18000, emi: 3290.32 },
  },
];

function round2(n) {
  return Math.round((Number(n) || 0) * 100) / 100;
}

function buildSandboxOutputColumns() {
  return [
    { header: 'Emp No', source: 'field', field: 'employee.emp_no', order: 0 },
    { header: 'Name', source: 'field', field: 'employee.name', order: 1 },
    { header: 'Basic Pay', source: 'field', field: 'earnings.basicPay', order: 2 },
    { header: 'Paid Days', source: 'field', field: 'attendance.totalPaidDays', order: 3 },
    { header: 'Earned Salary', source: 'field', field: 'earnings.payableAmount', order: 4 },
    { header: 'Salary Advance', source: 'field', field: 'loanAdvance.advanceDeduction', order: 5 },
    { header: 'Loan EMI', source: 'field', field: 'loanAdvance.totalEMI', order: 6 },
    { header: 'Net Salary', source: 'field', field: 'netSalary', order: 7 },
  ];
}

async function upsertPayRegister(employeeId, empNo, grossSalary) {
  const [year, monthNum] = MONTH.split('-').map(Number);
  const pr = await PayRegisterSummary.getOrCreate(employeeId, empNo, year, monthNum);
  const paidDays = 30;
  const perDay = grossSalary / 30;
  pr.totals = pr.totals || {};
  pr.totals.presentDays = paidDays;
  pr.totals.totalPresentDays = paidDays;
  pr.totals.totalPayableShifts = paidDays;
  pr.totals.paidLeaveDays = 0;
  pr.totals.absentDays = 0;
  pr.totals.totalOTHours = 0;
  pr.totals.extraDays = 0;
  pr.status = 'draft';
  pr.department_id = pr.department_id || undefined;
  await pr.save();
  return { payRegisterId: pr._id.toString(), paidDays, perDay };
}

async function createDisbursedAdvance(employeeId, empNo, balance, firstMonth, appliedBy) {
  return Loan.create({
    employeeId,
    emp_no: empNo,
    appliedBy,
    requestType: 'salary_advance',
    amount: balance,
    originalAmount: balance,
    reason: `${PREFIX} salary advance test`,
    duration: 2,
    interestAmount: 0,
    status: 'disbursed',
    workflow: { currentStep: 'completed', isCompleted: true },
    advanceConfig: { deductionStartCycle: firstMonth },
    repayment: {
      remainingBalance: balance,
      totalPaid: 0,
      installmentsPaid: 0,
      totalInstallments: 2,
    },
    approvals: { final: { firstDeductionPayrollMonth: firstMonth } },
    disbursement: { disbursedAt: new Date(), disbursementMethod: 'bank_transfer' },
    appliedAt: new Date(),
  });
}

async function createDisbursedLoan(employeeId, empNo, emiAmount, remainingBalance, firstMonth, appliedBy) {
  const principal = remainingBalance + emiAmount;
  return Loan.create({
    employeeId,
    emp_no: empNo,
    appliedBy,
    requestType: 'loan',
    amount: principal,
    originalAmount: principal,
    reason: `${PREFIX} loan test`,
    duration: 10,
    interestAmount: 0,
    status: 'disbursed',
    workflow: { currentStep: 'completed', isCompleted: true },
    loanConfig: {
      emiAmount,
      interestRate: 0,
      totalAmount: principal,
      totalInterest: 0,
    },
    repayment: {
      remainingBalance,
      totalPaid: 0,
      installmentsPaid: 0,
      totalInstallments: 10,
    },
    approvals: { final: { firstDeductionPayrollMonth: firstMonth } },
    disbursement: { disbursedAt: new Date(), disbursementMethod: 'bank_transfer' },
    appliedAt: new Date(),
  });
}

function assertClose(actual, expected, label) {
  const ok = Math.abs(round2(actual) - round2(expected)) < 0.02;
  return { ok, label, actual: round2(actual), expected: round2(expected) };
}

async function runPayrollForEmployee(employeeId, userId) {
  return payrollCalculationFromOutputColumnsService.calculatePayrollFromOutputColumns(
    employeeId,
    MONTH,
    userId,
    { source: 'payregister', arrearsSettlements: [] }
  );
}

async function cleanupTestData(ids = {}) {
  const empNos = SCENARIOS.map((s) => `${PREFIX}_${s.code}`);
  await PayrollRecord.deleteMany({ emp_no: { $in: empNos }, month: MONTH });
  await PayRegisterSummary.deleteMany({ emp_no: { $in: empNos }, month: MONTH });
  await Loan.deleteMany({ emp_no: { $in: empNos } });
  await Employee.deleteMany({ emp_no: { $in: empNos } });
  if (ids.designationId) await Designation.deleteOne({ _id: ids.designationId }).catch(() => {});
  if (ids.departmentId) await Department.deleteOne({ _id: ids.departmentId }).catch(() => {});
  if (ids.divisionId) await Division.deleteOne({ _id: ids.divisionId }).catch(() => {});
}

async function cleanupStaleTestOrg() {
  const empNos = SCENARIOS.map((s) => `${PREFIX}_${s.code}`);
  await PayrollRecord.deleteMany({ emp_no: { $in: empNos } });
  await PayRegisterSummary.deleteMany({ emp_no: { $in: empNos } });
  await Loan.deleteMany({ emp_no: { $in: empNos } });
  await Employee.deleteMany({ emp_no: { $in: empNos } });
  const staleDiv = await Division.findOne({ code: `${PREFIX}_DIV` });
  const staleDept = await Department.findOne({ code: `${PREFIX}_DEPT` });
  const staleDesig = await Designation.findOne({ code: `${PREFIX}_DES` });
  if (staleDesig) await Designation.deleteOne({ _id: staleDesig._id });
  if (staleDept) await Department.deleteOne({ _id: staleDept._id });
  if (staleDiv) await Division.deleteOne({ _id: staleDiv._id });
}

async function main() {
  const mongoUri = process.env.MONGODB_URI || process.env.MONGO_URI || 'mongodb://localhost:27017/hrms';
  console.log('Connecting to MongoDB...');
  await mongoose.connect(mongoUri);
  console.log('Connected.\n');

  const configBefore = await PayrollConfiguration.get();
  const configBackup = {
    enabled: configBefore.enabled,
    outputColumns: configBefore.outputColumns,
    loanAdvancePayableColumnHeader: configBefore.loanAdvancePayableColumnHeader,
    statutoryProratePaidDaysColumnHeader: configBefore.statutoryProratePaidDaysColumnHeader,
    statutoryProrateTotalDaysColumnHeader: configBefore.statutoryProrateTotalDaysColumnHeader,
    professionTaxSlabEarningsColumnHeader: configBefore.professionTaxSlabEarningsColumnHeader,
  };

  const sandboxColumns = buildSandboxOutputColumns();
  const ids = { employees: [] };

  try {
    await cleanupStaleTestOrg();

    // —— Org setup ——
    const div = await Division.create({
      name: `${PREFIX} Division`,
      code: `${PREFIX}_DIV`,
      description: 'Loan/advance payroll simulation',
    });
    ids.divisionId = div._id;

    const dept = await Department.create({
      name: `${PREFIX} Department`,
      code: `${PREFIX}_DEPT`,
      divisions: [div._id],
    });
    ids.departmentId = dept._id;
    div.departments = [dept._id];
    await div.save();

    const desig = await Designation.create({
      name: `${PREFIX} Staff`,
      code: `${PREFIX}_DES`,
      department_id: dept._id,
    });
    ids.designationId = desig._id;

    let userId = (await User.findOne({ isActive: true }).select('_id').lean())?._id;
    if (!userId) userId = new mongoose.Types.ObjectId();

    console.log('========== TEST SETUP ==========');
    console.log('Month:', MONTH);
    console.log('Division:', div._id.toString(), div.name);
    console.log('Department:', dept._id.toString(), dept.name);
    console.log('');

    // —— Employees, pay register, loans ——
    for (const sc of SCENARIOS) {
      const empNo = `${PREFIX}_${sc.code}`;
      let emp = await Employee.findOne({ emp_no: empNo });
      if (emp) await Employee.deleteOne({ _id: emp._id });

      emp = await Employee.create({
        emp_no: empNo,
        employee_name: `${PREFIX} ${sc.name}`,
        division_id: div._id,
        department_id: dept._id,
        designation_id: desig._id,
        gross_salary: sc.gross,
        doj: new Date('2024-01-01'),
        is_active: true,
        gender: 'Male',
      });

      await upsertPayRegister(emp._id, empNo, sc.gross);

      await Loan.deleteMany({ emp_no: empNo });
      if (sc.advanceBalance > 0) {
        await createDisbursedAdvance(emp._id, empNo, sc.advanceBalance, MONTH, userId);
      }
      if (sc.emi > 0) {
        await createDisbursedLoan(emp._id, empNo, sc.emi, sc.emi * 9, MONTH, userId);
      }

      ids.employees.push({
        code: sc.code,
        empNo,
        employeeId: emp._id.toString(),
        gross: sc.gross,
        advanceBalance: sc.advanceBalance,
        emi: sc.emi,
      });
    }

    const report = {
      month: MONTH,
      prefix: PREFIX,
      divisionId: ids.divisionId.toString(),
      departmentId: ids.departmentId.toString(),
      employees: ids.employees,
      runs: [],
      serviceChecks: [],
    };

    // —— Direct service checks (uncapped vs capped) ——
    console.log('========== SERVICE-LEVEL CHECKS ==========');
    for (const sc of SCENARIOS) {
      const emp = ids.employees.find((e) => e.code === sc.code);
      const record = {};
      await loanAdvanceService.applyDynamicPayrollLoanAdvance(
        record,
        emp.employeeId,
        MONTH,
        await Employee.findById(emp.employeeId),
        {}
      );
      const uncappedAdv = record.loanAdvance?.advanceDeduction ?? 0;
      const uncappedEmi = record.loanAdvance?.totalEMI ?? 0;

      const recordCapped = {};
      await loanAdvanceService.applyDynamicPayrollLoanAdvance(
        recordCapped,
        emp.employeeId,
        MONTH,
        await Employee.findById(emp.employeeId),
        { payableAmountFromColumn: sc.gross, payableColumnHeader: PAYABLE_CAP_HEADER }
      );
      const cappedAdv = recordCapped.loanAdvance?.advanceDeduction ?? 0;
      const cappedEmi = recordCapped.loanAdvance?.totalEMI ?? 0;

      const expectCappedService = sc.expectCapped || sc.expectUncapped;
      const checks = [
        assertClose(uncappedAdv, sc.expectUncapped.advance, 'uncapped advance'),
        assertClose(uncappedEmi, sc.expectUncapped.emi, 'uncapped EMI'),
        assertClose(cappedAdv, expectCappedService.advance, 'capped advance (service/gross pool)'),
        assertClose(cappedEmi, expectCappedService.emi, 'capped EMI (service/gross pool)'),
      ];
      report.serviceChecks.push({ code: sc.code, checks, uncapped: { advance: uncappedAdv, emi: uncappedEmi }, capped: { advance: cappedAdv, emi: cappedEmi } });

      console.log(`\n${sc.code} — ${sc.name}`);
      checks.forEach((c) => {
        console.log(`  ${c.ok ? 'PASS' : 'FAIL'} ${c.label}: got ${c.actual}, expected ${c.expected}`);
      });
    }

    // —— Run A: dynamic payroll, NO cap column ——
    console.log('\n\n========== RUN A: DYNAMIC PAYROLL (no cap column) ==========');
    await PayrollConfiguration.updateOne(
      {},
      {
        $set: {
          enabled: true,
          outputColumns: sandboxColumns,
          loanAdvancePayableColumnHeader: '',
        },
      },
      { upsert: true }
    );

    const runA = { mode: 'uncapped', results: [] };
    for (const sc of SCENARIOS) {
      const emp = ids.employees.find((e) => e.code === sc.code);
      try {
        const result = await runPayrollForEmployee(emp.employeeId, userId);
        const row = result.row || {};
        const la = result.payrollRecord?.loanAdvance || {};
        const earned = row['Earned Salary'] ?? row.earned_salary;
        const adv = Number(la.advanceDeduction ?? row['Salary Advance']) || 0;
        const emi = Number(la.totalEMI ?? row['Loan EMI']) || 0;
        const checks = [
          assertClose(adv, sc.expectUncapped.advance, 'payroll advance'),
          assertClose(emi, sc.expectUncapped.emi, 'payroll EMI'),
        ];
          code: sc.code,
          empNo: emp.empNo,
          payrollRecordId: result.payrollRecord?._id?.toString(),
          earned,
          advanceDeduction: adv,
          loanEMI: emi,
          netSalary: result.payrollRecord?.netSalary,
          checks,
          row,
        });
        console.log(`\n${sc.code} ${emp.empNo}`);
        console.log(`  Earned: ${earned} | Advance: ${adv} | EMI: ${emi} | Net: ${result.payrollRecord?.netSalary}`);
        checks.forEach((c) => console.log(`  ${c.ok ? 'PASS' : 'FAIL'} ${c.label}: ${c.actual} vs ${c.expected}`));
      } catch (err) {
        runA.results.push({ code: sc.code, error: err.message });
        console.log(`\n${sc.code} ERROR:`, err.message);
      }
    }
    report.runs.push(runA);

    // —— Run B: dynamic payroll WITH cap column = Earned Salary ——
    console.log('\n\n========== RUN B: DYNAMIC PAYROLL (cap column = Earned Salary) ==========');
    await PayrollConfiguration.updateOne(
      {},
      {
        $set: {
          enabled: true,
          outputColumns: sandboxColumns,
          loanAdvancePayableColumnHeader: PAYABLE_CAP_HEADER,
        },
      },
      { upsert: true }
    );

    const runB = { mode: 'capped', capColumn: PAYABLE_CAP_HEADER, results: [] };
    for (const sc of SCENARIOS) {
      const emp = ids.employees.find((e) => e.code === sc.code);
      try {
        const result = await runPayrollForEmployee(emp.employeeId, userId);
        const row = result.row || {};
        const la = result.payrollRecord?.loanAdvance || {};
        const earned = row['Earned Salary'] ?? row.earned_salary;
        const pool = la.payableBeforeAdvance ?? la.payablePool;
        const adv = Number(la.advanceDeduction ?? row['Salary Advance']) || 0;
        const emi = Number(la.totalEMI ?? row['Loan EMI']) || 0;
        const expectCapped = sc.expectCappedEarnedApprox || sc.expectCapped || sc.expectUncapped;
        const checks = [
          assertClose(adv, expectCapped.advance, 'payroll advance'),
          assertClose(emi, expectCapped.emi, 'payroll EMI'),
        ];
        runB.results.push({
          code: sc.code,
          empNo: emp.empNo,
          payrollRecordId: result.payrollRecord?._id?.toString(),
          earned,
          payablePool: pool,
          remainingAfterAdvance: la.remainingAfterAdvance,
          advanceDeduction: adv,
          loanEMI: emi,
          scheduledTotalEMI: la.scheduledTotalEMI,
          netSalary: result.payrollRecord?.netSalary,
          checks,
          row,
        });
        console.log(`\n${sc.code} ${emp.empNo}`);
        console.log(`  Earned(pool): ${earned} | Pool meta: ${pool} | Advance: ${adv} | EMI: ${emi} (sched ${la.scheduledTotalEMI}) | Net: ${result.payrollRecord?.netSalary}`);
        checks.forEach((c) => console.log(`  ${c.ok ? 'PASS' : 'FAIL'} ${c.label}: ${c.actual} vs ${c.expected}`));
      } catch (err) {
        runB.results.push({ code: sc.code, error: err.message });
        console.log(`\n${sc.code} ERROR:`, err.message);
      }
    }
    report.runs.push(runB);

    // Summary
    const allChecks = [
      ...report.serviceChecks.flatMap((s) => s.checks),
      ...runA.results.flatMap((r) => r.checks || []),
      ...runB.results.flatMap((r) => r.checks || []),
    ];
    const passed = allChecks.filter((c) => c && c.ok).length;
    const failed = allChecks.filter((c) => c && !c.ok).length;

    report.summary = { passed, failed, total: passed + failed };
    const outPath = path.join(__dirname, `loan_advance_simulation_${MONTH.replace('-', '')}.json`);
    fs.writeFileSync(outPath, JSON.stringify(report, null, 2));

    console.log('\n\n========== SUMMARY ==========');
    console.log(`Assertions: ${passed} passed, ${failed} failed`);
    console.log('Report written:', outPath);
    console.log('\nDB lookup (employees):');
    ids.employees.forEach((e) => console.log(`  ${e.empNo} → ${e.employeeId}`));
    console.log(`\nPayroll records month=${MONTH}, emp_no prefix ${PREFIX}_`);
    console.log('Loans: requestType loan/salary_advance, emp_no prefix', PREFIX + '_');

    if (CLEANUP) {
      console.log('\nCLEANUP=1 — removing test data...');
      await cleanupTestData(ids);
      console.log('Test data removed.');
    } else {
      console.log('\nTest data LEFT in database (set CLEANUP=1 to remove).');
    }
  } finally {
    await PayrollConfiguration.updateOne(
      {},
      {
        $set: {
          enabled: configBackup.enabled,
          outputColumns: configBackup.outputColumns,
          loanAdvancePayableColumnHeader: configBackup.loanAdvancePayableColumnHeader,
          statutoryProratePaidDaysColumnHeader: configBackup.statutoryProratePaidDaysColumnHeader,
          statutoryProrateTotalDaysColumnHeader: configBackup.statutoryProrateTotalDaysColumnHeader,
          professionTaxSlabEarningsColumnHeader: configBackup.professionTaxSlabEarningsColumnHeader,
        },
      },
      { upsert: true }
    );
    console.log('\nPayroll configuration restored to pre-test state.');
    await mongoose.disconnect();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
