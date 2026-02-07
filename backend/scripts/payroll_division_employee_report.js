/**
 * Payroll division employee report using the same logic as:
 * - backend/shared/jobs/worker.js (payroll_bulk_calculate, second_salary_batch)
 * - backend/payroll/services/secondSalaryService.js
 *
 * Uses payrollEmployeeQueryHelper + Employee model against the live DB.
 * Division: PYDAH PHARMACY = 6957b10390c14ea32bbe4fb7
 *
 * Run from backend: node scripts/payroll_division_employee_report.js
 * Optional: DIVISION_ID=xxx DEPARTMENT_ID=yyy MONTH=YYYY-MM node scripts/payroll_division_employee_report.js
 * When MONTH is set, includes employees who left in that payroll month (same as worker).
 */

require('dotenv').config();
const mongoose = require('mongoose');
const path = require('path');

// Run from backend directory so requires resolve correctly
const backendRoot = path.resolve(__dirname, '..');
const Employee = require(path.join(backendRoot, 'employees', 'model', 'Employee'));
const {
  getRegularPayrollEmployeeQuery,
  getSecondSalaryEmployeeQuery,
} = require(path.join(backendRoot, 'payroll', 'services', 'payrollEmployeeQueryHelper'));
const { getPayrollDateRange } = require(path.join(backendRoot, 'shared', 'utils', 'dateUtils'));

const PHARMACY_DIVISION_ID = process.env.DIVISION_ID || '6957b10390c14ea32bbe4fb7';
const DEPARTMENT_ID = process.env.DEPARTMENT_ID || null; // or 'all' to skip
const MONTH = process.env.MONTH || null; // YYYY-MM; when set, include employees who left this month

async function run() {
  const mongoURI = process.env.MONGODB_URI || 'mongodb://localhost:27017/hrms';
  console.log('Connecting to MongoDB...');
  await mongoose.connect(mongoURI);
  console.log('Connected.\n');

  const divisionId = PHARMACY_DIVISION_ID;
  const departmentId = DEPARTMENT_ID;

  let leftDateRange;
  if (MONTH && /^\d{4}-\d{2}$/.test(MONTH)) {
    const [year, monthNum] = MONTH.split('-').map(Number);
    const { startDate, endDate } = await getPayrollDateRange(year, monthNum);
    leftDateRange = { start: new Date(startDate), end: new Date(endDate) };
    console.log('Month (include left this period):', MONTH, '→', startDate, 'to', endDate);
  }

  // Same queries as worker.js and secondSalaryService.js (via payrollEmployeeQueryHelper)
  const regularQuery = getRegularPayrollEmployeeQuery({ divisionId, departmentId, leftDateRange });
  const secondQuery = getSecondSalaryEmployeeQuery({ divisionId, departmentId, leftDateRange });

  console.log('Division ID:', divisionId, '(PYDAH PHARMACY)');
  if (departmentId) console.log('Department ID:', departmentId);
  console.log('Regular payroll query:', JSON.stringify(regularQuery, null, 2));
  console.log('Second salary query:', JSON.stringify(secondQuery, null, 2));
  console.log('');

  const [regularEmployees, secondEmployees] = await Promise.all([
    Employee.find(regularQuery).select('emp_no').lean(),
    Employee.find(secondQuery).select('emp_no').lean(),
  ]);

  const regularEmpNos = regularEmployees.map((e) => e.emp_no).filter(Boolean);
  const secondEmpNos = secondEmployees.map((e) => e.emp_no).filter(Boolean);

  const setRegular = new Set(regularEmpNos);
  const setSecond = new Set(secondEmpNos);

  const intersection = regularEmpNos.filter((no) => setSecond.has(no)).sort();
  const onlyRegular = regularEmpNos.filter((no) => !setSecond.has(no)).sort(); // A - B
  const onlySecond = secondEmpNos.filter((no) => !setRegular.has(no)).sort(); // B - A

  const regSorted = [...regularEmpNos].sort();
  const secSorted = [...secondEmpNos].sort();
  const maxRows = Math.max(
    regSorted.length,
    secSorted.length,
    intersection.length,
    onlyRegular.length,
    onlySecond.length,
    1
  );
  const pad = (arr, len) => {
    const a = [...arr];
    while (a.length < len) a.push('');
    return a;
  };
  const w = 18;
  const headers = ['Regular payroll', 'Second salary', 'Both (A∩B)', 'Only Regular (A-B)', 'Only Second (B-A)'];
  console.log(headers.map((h) => h.padEnd(w)).join(' | '));
  console.log('-'.repeat(90));
  const regCol = pad(regSorted, maxRows);
  const secCol = pad(secSorted, maxRows);
  const bothCol = pad(intersection, maxRows);
  const onlyRegCol = pad(onlyRegular, maxRows);
  const onlySecCol = pad(onlySecond, maxRows);
  for (let i = 0; i < maxRows; i++) {
    console.log(
      [regCol[i], secCol[i], bothCol[i], onlyRegCol[i], onlySecCol[i]].map((c) => String(c).padEnd(w)).join(' | ')
    );
  }

  console.log('\n--- Counts ---');
  console.log('Regular payroll employees:', regularEmployees.length);
  console.log('Second salary employees:', secondEmployees.length);
  console.log('Both (intersection):', intersection.length);
  console.log('Only in Regular (A-B):', onlyRegular.length);
  console.log('Only in Second (B-A):', onlySecond.length);

  const fs = require('fs');
  const outPath = path.join(backendRoot, '..', 'payroll-division-report.csv');
  const lines = [
    'Regular payroll (emp_no),Second salary (emp_no),Both (intersection),Only Regular (A-B),Only Second (B-A)',
    ...Array.from({ length: maxRows }, (_, i) =>
      [regCol[i], secCol[i], bothCol[i], onlyRegCol[i], onlySecCol[i]].join(',')
    ),
  ];
  fs.writeFileSync(outPath, lines.join('\n'), 'utf8');
  console.log('\nCSV written to', outPath);

  await mongoose.connection.close();
  console.log('Done.');
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
