/**
 * List employees eligible for payroll in a month but without a PayrollRecord (missed payroll).
 *
 * Usage:
 *   node scripts/list_payroll_missed_eligible_employees.js 2026-03
 *   node scripts/list_payroll_missed_eligible_employees.js 2026-03 --departmentId=<id>
 *   node scripts/list_payroll_missed_eligible_employees.js 2026-03 --divisionId=<id>
 */
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });
const mongoose = require('mongoose');

const Employee = require('../employees/model/Employee');
require('../departments/model/Department');
require('../departments/model/Division');
const PayrollRecord = require('../payroll/model/PayrollRecord');
const PayRegisterSummary = require('../pay-register/model/PayRegisterSummary');
const PayrollBatch = require('../payroll/model/PayrollBatch');
const { getPayrollDateRange } = require('../shared/utils/dateUtils');
const { buildPayrollPeriodEmployeeQuery } = require('../payroll/services/payrollEmployeeQueryHelper');
const { resolveMissingEmployeeDetails } = require('../payroll/utils/payrollBatchValidationMessages');

function parseArgs() {
  const args = process.argv.slice(2);
  const month = args.find((a) => /^\d{4}-\d{2}$/.test(a));
  let departmentId;
  let divisionId;
  for (const a of args) {
    if (a.startsWith('--departmentId=')) departmentId = a.split('=')[1];
    if (a.startsWith('--divisionId=')) divisionId = a.split('=')[1];
  }
  return { month, departmentId, divisionId };
}

function formatLeft(d) {
  if (!d) return '';
  const x = d instanceof Date ? d : new Date(d);
  if (Number.isNaN(x.getTime())) return '';
  return x.toISOString().slice(0, 10);
}

async function main() {
  const { month, departmentId, divisionId } = parseArgs();
  if (!month) {
    console.log('Usage: node scripts/list_payroll_missed_eligible_employees.js <YYYY-MM> [--departmentId=] [--divisionId=]');
    process.exit(1);
  }

  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error('MONGODB_URI not set');

  await mongoose.connect(uri);
  console.log('Connected to database\n');

  const [year, monthNum] = month.split('-').map(Number);
  const { startDate, endDate } = await getPayrollDateRange(year, monthNum);
  const rangeStart = new Date(startDate + 'T00:00:00.000Z');
  const rangeEnd = new Date(endDate + 'T23:59:59.999Z');

  console.log(`Payroll month: ${month}`);
  console.log(`Pay period:    ${startDate} to ${endDate}`);
  if (departmentId) console.log(`Department filter: ${departmentId}`);
  if (divisionId) console.log(`Division filter:   ${divisionId}`);
  console.log('');

  const empQuery = buildPayrollPeriodEmployeeQuery(divisionId, departmentId, rangeStart, rangeEnd, null);

  const eligible = await Employee.find(empQuery)
    .select('emp_no employee_name department_id division_id is_active leftDate doj')
    .populate('department_id', 'name code')
    .populate('division_id', 'name code')
    .sort({ emp_no: 1 })
    .lean();

  const eligibleIds = eligible.map((e) => e._id);

  const payrollRecords = await PayrollRecord.find({
    month,
    employeeId: { $in: eligibleIds },
  })
    .select('employeeId payrollBatchId')
    .lean();

  const payrollByEmp = new Map(payrollRecords.map((r) => [String(r.employeeId), r]));

  const payRegisters = await PayRegisterSummary.find({
    month,
    employeeId: { $in: eligibleIds },
  })
    .select('employeeId dailyRecords')
    .lean();

  const prByEmp = new Map(payRegisters.map((pr) => [String(pr.employeeId), pr]));

  const missed = [];
  for (const emp of eligible) {
    const id = String(emp._id);
    if (!payrollByEmp.has(id)) {
      const pr = prByEmp.get(id);
      const hasPr = !!pr;
      const hasGrid = !!(pr && Array.isArray(pr.dailyRecords) && pr.dailyRecords.length > 0);
      missed.push({
        emp,
        hasPayRegister: hasPr,
        hasPayRegisterGrid: hasGrid,
      });
    }
  }

  console.log(`Eligible employees (pay period rules): ${eligible.length}`);
  console.log(`With payroll calculated:              ${payrollRecords.length}`);
  console.log(`Missed payroll (no PayrollRecord):  ${missed.length}`);
  console.log('');

  if (missed.length === 0) {
    console.log('No missed employees — all eligible staff have payroll for this month.');
    await mongoose.disconnect();
    return;
  }

  const byDept = new Map();
  for (const row of missed) {
    const deptName = row.emp.department_id?.name || 'Unknown dept';
    const divName = row.emp.division_id?.name || 'Unknown div';
    const key = `${divName} | ${deptName}`;
    if (!byDept.has(key)) byDept.set(key, []);
    byDept.get(key).push(row);
  }

  for (const [key, rows] of [...byDept.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
    console.log(`--- ${key} (${rows.length}) ---`);
    for (const { emp, hasPayRegister, hasPayRegisterGrid } of rows) {
      const active = emp.is_active === false ? 'inactive' : 'active';
      const left = formatLeft(emp.leftDate);
      const prNote = !hasPayRegister
        ? 'no pay register'
        : hasPayRegisterGrid
          ? 'pay register synced'
          : 'pay register stub/empty';
      console.log(
        `  ${emp.emp_no} | ${emp.employee_name} | ${active}${left ? ` | left ${left}` : ''} | ${prNote}`
      );
    }
    console.log('');
  }

  // Batch validation view (pending batches): who would block approval
  const batchQuery = { month, status: 'pending' };
  if (departmentId) batchQuery.department = departmentId;
  if (divisionId) batchQuery.division = divisionId;

  const pendingBatches = await PayrollBatch.find(batchQuery).lean();
  if (pendingBatches.length) {
    console.log('--- Pending batches: missing from batch validation ---');
    for (const batch of pendingBatches) {
      await batch.validateBatch();
      const missingIds = batch.validationStatus?.missingEmployees || [];
      if (!missingIds.length) continue;
      const details = await resolveMissingEmployeeDetails(missingIds);
      const Department = mongoose.model('Department');
      const dept = await Department.findById(batch.department).select('name').lean();
      console.log(`Batch ${batch.batchNumber} | ${dept?.name || batch.department} | ${missingIds.length} missing`);
      for (const d of details) {
        console.log(`  ${d.emp_no} | ${d.employee_name}`);
      }
    }
  }

  await mongoose.disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
