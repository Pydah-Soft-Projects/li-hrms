/**
 * Run payroll using the new calculatePayrollFromOutputColumns for the first 10 employees.
 * Prints complete results: row (output column values), payslip summary, and saved record.
 *
 * Usage (from backend):
 *   node scripts/test_payroll_from_output_columns.js
 *   MONTH=2025-01 node scripts/test_payroll_from_output_columns.js
 *   LIMIT=5 node scripts/test_payroll_from_output_columns.js
 *
 * Requires: MONGODB_URI or MONGO_URI in .env
 * Pay Register must exist for the chosen month for each employee.
 */

require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
const mongoose = require('mongoose');
const path = require('path');
const backendRoot = path.resolve(__dirname, '..');

require(path.join(backendRoot, 'departments', 'model', 'Department'));
require(path.join(backendRoot, 'departments', 'model', 'Division'));
require(path.join(backendRoot, 'departments', 'model', 'Designation'));
const Employee = require(path.join(backendRoot, 'employees', 'model', 'Employee'));
const User = require(path.join(backendRoot, 'users', 'model', 'User'));
const PayrollConfiguration = require(path.join(backendRoot, 'payroll', 'model', 'PayrollConfiguration'));
const payrollCalculationFromOutputColumnsService = require(path.join(backendRoot, 'payroll', 'services', 'payrollCalculationFromOutputColumnsService'));

const MONTH = process.env.MONTH || (() => {
  const d = new Date();
  const y = d.getFullYear();
  if (d.getMonth() === 0) return `${y - 1}-12`;
  return `${y}-${String(d.getMonth()).padStart(2, '0')}`;
})();
const LIMIT = parseInt(process.env.LIMIT, 10) || 10;

function formatNum(n) {
  if (n == null || Number.isNaN(n)) return '—';
  return Number(n).toLocaleString('en-IN', { maximumFractionDigits: 2 });
}

function formatRow(row) {
  const out = {};
  for (const [k, v] of Object.entries(row)) {
    out[k] = typeof v === 'number' && !Number.isNaN(v) ? formatNum(v) : v;
  }
  return out;
}

async function run() {
  const mongoUri = process.env.MONGODB_URI || process.env.MONGO_URI || 'mongodb://localhost:27017/hrms';
  console.log('Connecting to MongoDB...');
  await mongoose.connect(mongoUri);
  console.log('Connected.\n');

  const config = await PayrollConfiguration.get();
  const outputColumns = Array.isArray(config?.outputColumns) ? config.outputColumns : [];
  const sortedCols = [...outputColumns].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));

  console.log('========== CONFIG ==========');
  console.log('Month:', MONTH);
  console.log('Output columns:', sortedCols.length);
  sortedCols.forEach((c, i) => console.log(`  ${i + 1}. ${c.header || 'Column'} (${c.source || 'field'}) ${c.field || ''} ${c.formula ? 'formula' : ''}`));
  console.log('');

  const employees = await Employee.find({ is_active: true })
    .select('_id emp_no employee_name department_id division_id designation_id gross_salary')
    .populate('department_id', 'name')
    .populate('division_id', 'name')
    .populate('designation_id', 'name')
    .limit(10)
    .lean();

  if (employees.length === 0) {
    console.log('No active employees found.');
    await mongoose.disconnect();
    process.exit(0);
  }

  let userId;
  try {
    const user = await User.findOne({ isActive: true }).select('_id').lean();
    userId = user?._id;
  } catch (_) {}
  if (!userId) userId = employees[0]._id;

  console.log('========== EMPLOYEES (first ' + LIMIT + ') ==========');
  employees.forEach((e, i) => {
    console.log(`  ${i + 1}. ${e.emp_no} – ${e.employee_name} (${e.department_id?.name ?? '—'})`);
  });
  console.log('');

  const results = { success: [], failed: [] };

  for (let index = 0; index < employees.length; index++) {
    const emp = employees[index];
    const empId = emp._id;
    const label = `${emp.emp_no} ${emp.employee_name}`;
    try {
      const result = await payrollCalculationFromOutputColumnsService.calculatePayrollFromOutputColumns(
        empId,
        MONTH,
        userId,
        { source: 'payregister', arrearsSettlements: [] }
      );

      const row = result.row || {};
      const payslip = result.payslip || {};
      const pr = result.payrollRecord;

      results.success.push({
        index: index + 1,
        emp: label,
        result: { row, payslip, payrollRecordId: pr?._id?.toString() },
      });

      // —— Complete details per member (full JSON) ——
      console.log('\n' + '='.repeat(80));
      console.log(`MEMBER ${index + 1}: ${label}`);
      console.log('='.repeat(80));

      console.log('\n--- ROW (all output column values) ---');
      console.log(JSON.stringify(row, null, 2));

      console.log('\n--- PAYSLIP (complete) ---');
      console.log(JSON.stringify(payslip, null, 2));

      console.log('\n--- SAVED PAYROLL RECORD (complete) ---');
      const prPlain = pr && typeof pr.toObject === 'function' ? pr.toObject() : (pr && typeof pr.toJSON === 'function' ? pr.toJSON() : pr);
      console.log(JSON.stringify(prPlain, null, 2));

      console.log('');
    } catch (err) {
      results.failed.push({ emp: label, error: err.message });
      console.error(`\n--- FAILED: ${label} ---`);
      console.error(err.message);
      console.error(err.stack);
    }
  }

  console.log('\n' + '='.repeat(80));
  console.log('========== SUMMARY ==========');
  console.log('Succeeded:', results.success.length);
  console.log('Failed:', results.failed.length);
  if (results.failed.length) {
    results.failed.forEach(({ emp, error }) => console.log('  -', emp, ':', error));
  }

  await mongoose.disconnect();
  process.exit(results.failed.length > 0 ? 1 : 0);
}

run().catch((err) => {
  console.error('Script error:', err);
  process.exit(1);
});
