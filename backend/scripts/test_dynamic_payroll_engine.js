/**
 * Test Dynamic Payroll Engine – first 10 real employees, real config
 *
 * Runs calculatePayrollNew for the first 10 active employees (with department)
 * using real Payroll Configuration, Statutory Config, allowances/deductions.
 * Logs how the engine behaves: basic, allowances, deductions, statutory, cumulatives, net.
 *
 * Usage (from backend):
 *   node scripts/test_dynamic_payroll_engine.js
 *   MONTH=2025-01 node scripts/test_dynamic_payroll_engine.js
 *   LIMIT=5 node scripts/test_dynamic_payroll_engine.js
 *
 * Requires: MONGODB_URI or MONGO_URI in .env
 * Note: Pay Register must exist for the chosen month for each employee (source=payregister).
 *       Default MONTH is last calendar month; set MONTH=YYYY-MM if needed.
 */

require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
const mongoose = require('mongoose');
const path = require('path');
const backendRoot = path.resolve(__dirname, '..');

// Register refs so Employee.populate() works when run standalone
require(path.join(backendRoot, 'departments', 'model', 'Department'));
require(path.join(backendRoot, 'departments', 'model', 'Division'));
require(path.join(backendRoot, 'departments', 'model', 'Designation'));
const Employee = require(path.join(backendRoot, 'employees', 'model', 'Employee'));
const User = require(path.join(backendRoot, 'users', 'model', 'User'));
const PayrollRecord = require(path.join(backendRoot, 'payroll', 'model', 'PayrollRecord'));
const PayrollConfiguration = require(path.join(backendRoot, 'payroll', 'model', 'PayrollConfiguration'));
const StatutoryDeductionConfig = require(path.join(backendRoot, 'payroll', 'model', 'StatutoryDeductionConfig'));
const payrollCalculationService = require(path.join(backendRoot, 'payroll', 'services', 'payrollCalculationService'));

const MONTH = process.env.MONTH || (() => {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth()).padStart(2, '0'); // current month (0-indexed), so we need next month? No - getMonth() is 0-11, so for "this month" we need d.getMonth()+1 for human month. For previous month: d.getMonth() (current is 1-indexed month = d.getMonth()+1). So current YYYY-MM = y + '-' + String(d.getMonth() + 1).padStart(2,'0'). But if we're in Feb, we might not have Feb payroll yet; so last month is safer. Last month: new Date(y, d.getMonth()-1, 1) -> y, m-1. So month = d.getMonth() === 0 ? (y-1) + '-12' : y + '-' + String(d.getMonth()).padStart(2,'0'). 
  if (d.getMonth() === 0) return `${y - 1}-12`;
  return `${y}-${String(d.getMonth()).padStart(2, '0')}`;
})();
const LIMIT = parseInt(process.env.LIMIT, 10) || 10;

function formatNum(n) {
  if (n == null || Number.isNaN(n)) return '—';
  return Number(n).toLocaleString('en-IN', { maximumFractionDigits: 2 });
}

async function run() {
  const mongoUri = process.env.MONGODB_URI || process.env.MONGO_URI || 'mongodb://localhost:27017/hrms';
  console.log('Connecting to MongoDB...');
  await mongoose.connect(mongoUri);
  console.log('Connected.\n');

  // ——— 1. Real configured settings ———
  console.log('========== REAL CONFIGURED SETTINGS ==========');
  let payrollConfig, statutoryConfig;
  try {
    payrollConfig = await PayrollConfiguration.get();
    statutoryConfig = await StatutoryDeductionConfig.get();
  } catch (e) {
    console.error('Failed to load config:', e.message);
    await mongoose.disconnect();
    process.exit(1);
  }

  console.log('Payroll flow steps:', payrollConfig.steps?.length ?? 0);
  if (Array.isArray(payrollConfig.steps)) {
    payrollConfig.steps.forEach((s, i) => {
      console.log(`  ${i + 1}. ${s.label || s.type} (${s.type})${s.enabled === false ? ' [disabled]' : ''}`);
    });
  }
  console.log('Output columns (paysheet):', payrollConfig.outputColumns?.length ?? 0);
  console.log('');

  console.log('Statutory:');
  console.log('  ESI:', statutoryConfig.esi?.enabled ? `ON (emp ${statutoryConfig.esi.employeePercent}%, empr ${statutoryConfig.esi.employerPercent}%, ${statutoryConfig.esi.wageBasePercentOfBasic ?? 50}% of basic, ceiling ${statutoryConfig.esi.wageCeiling})` : 'OFF');
  console.log('  PF:', statutoryConfig.pf?.enabled ? `ON (emp ${statutoryConfig.pf.employeePercent}%, empr ${statutoryConfig.pf.employerPercent}%, base ${statutoryConfig.pf.base}, ceiling ${statutoryConfig.pf.wageCeiling})` : 'OFF');
  console.log('  Profession Tax:', statutoryConfig.professionTax?.enabled ? `ON (${statutoryConfig.professionTax.slabs?.length ?? 0} slabs)` : 'OFF');
  console.log('');

  // ——— 2. First N employees with department ———
  const employees = await Employee.find({ is_active: true, department_id: { $exists: true, $ne: null } })
    .select('_id emp_no employee_name department_id division_id designation_id gross_salary')
    .populate('department_id', 'name')
    .populate('division_id', 'name')
    .populate('designation_id', 'name')
    .limit(LIMIT)
    .lean();

  if (employees.length === 0) {
    console.log('No active employees with department found.');
    await mongoose.disconnect();
    process.exit(0);
  }

  let userId;
  try {
    const user = await User.findOne({ isActive: true }).select('_id').lean();
    userId = user?._id;
  } catch (_) {}
  if (!userId) {
    console.warn('No user found for calculation; using first employee id as placeholder (metadata only).');
    userId = employees[0]._id;
  }

  console.log('========== PAYROLL MONTH & EMPLOYEES ==========');
  console.log('Month:', MONTH);
  console.log('Employees to run:', employees.length);
  employees.forEach((e, i) => {
    console.log(`  ${i + 1}. ${e.emp_no} – ${e.employee_name} (Dept: ${e.department_id?.name ?? '—'}, Div: ${e.division_id?.name ?? '—'})`);
  });
  console.log('');

  // ——— 3. Run payroll for each ———
  const results = { success: [], failed: [] };
  const options = { source: 'payregister', arrearsSettlements: [] };

  for (const emp of employees) {
    const empId = emp._id;
    const label = `${emp.emp_no} ${emp.employee_name}`;
    try {
      const { payrollRecord: savedRecord } = await payrollCalculationService.calculatePayrollNew(empId, MONTH, userId, options);
      const record = savedRecord ? savedRecord.toObject ? savedRecord.toObject() : savedRecord : await PayrollRecord.findOne({ employeeId: empId, month: MONTH }).select('earnings deductions loanAdvance netSalary roundOff status').lean();
      if (!record) {
        results.failed.push({ emp: label, error: 'No payroll record after calculation' });
        continue;
      }
      const e = record.earnings || {};
      const d = record.deductions || {};
      const loan = record.loanAdvance || {};
      const net = Number(record.netSalary);
      const gross = Number(e.grossSalary);
      const totalDed = Number(d.totalDeductions);
      const expectedNet = gross - totalDed + (Number(record.roundOff) || 0);
      const netOk = !Number.isNaN(net) && Math.abs(net - expectedNet) < 1;
      const hasNaN = [e.basicPay, e.totalAllowances, e.allowancesCumulative, e.grossSalary, d.totalDeductions, d.deductionsCumulative, d.statutoryCumulative, d.totalStatutoryEmployee].some(
        (x) => Number.isNaN(Number(x))
      );
      results.success.push({
        emp: label,
        record,
        netOk,
        hasNaN,
      });
    } catch (err) {
      results.failed.push({ emp: label, error: err.message });
    }
  }

  // ——— 4. Report ———
  console.log('========== ENGINE RUN RESULTS ==========');
  results.success.forEach(({ emp, record, netOk, hasNaN }) => {
    const e = record.earnings || {};
    const d = record.deductions || {};
    const loan = record.loanAdvance || {};
    console.log(`\n--- ${emp} ---`);
    console.log('  Earnings: Basic', formatNum(e.basicPay), '| Allowances', formatNum(e.totalAllowances), '| Allowances cumulative', formatNum(e.allowancesCumulative), '| Gross', formatNum(e.grossSalary));
    if (Array.isArray(e.allowances) && e.allowances.length) {
      e.allowances.forEach((a) => console.log('    Allowance:', a.name, formatNum(a.amount)));
    }
    console.log('  Deductions: Attendance', formatNum(d.attendanceDeduction), '| Other', formatNum(d.totalOtherDeductions), '| Statutory (employee)', formatNum(d.totalStatutoryEmployee), '| Deductions cumulative', formatNum(d.deductionsCumulative), '| Statutory cumulative', formatNum(d.statutoryCumulative), '| Total', formatNum(d.totalDeductions));
    if (Array.isArray(d.statutoryDeductions) && d.statutoryDeductions.length) {
      d.statutoryDeductions.forEach((s) => console.log('    Statutory:', s.name, 'emp', formatNum(s.employeeAmount), 'empr', formatNum(s.employerAmount)));
    }
    console.log('  Loan/Advance: EMI', formatNum(loan.totalEMI), '| Advance', formatNum(loan.advanceDeduction));
    console.log('  Net salary:', formatNum(record.netSalary), '| Round-off:', formatNum(record.roundOff), netOk ? '✓' : '⚠ net vs gross-ded mismatch', hasNaN ? '| ⚠ NaN present' : '');
  });

  console.log('\n========== SUMMARY ==========');
  console.log('Succeeded:', results.success.length);
  console.log('Failed:', results.failed.length);
  if (results.failed.length) {
    results.failed.forEach(({ emp, error }) => console.log('  -', emp, ':', error));
  }
  const allOk = results.failed.length === 0 && results.success.every((r) => r.netOk && !r.hasNaN);
  console.log(allOk ? '\n✅ Dynamic payroll engine check passed.' : '\n⚠ Review failures or mismatches above.');

  await mongoose.disconnect();
  process.exit(results.failed.length > 0 ? 1 : 0);
}

run().catch((err) => {
  console.error('Script error:', err);
  process.exit(1);
});
