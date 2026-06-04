/**
 * Report: eligible employees vs payroll records vs paysheet visibility for a month.
 * Usage: node scripts/payroll_eligibility_report.js YYYY-MM [--departmentId=] [--divisionId=]
 */
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });
const mongoose = require('mongoose');
const Employee = require('../employees/model/Employee');
require('../departments/model/Department');
require('../departments/model/Division');
const PayrollRecord = require('../payroll/model/PayrollRecord');
const PayRegisterSummary = require('../pay-register/model/PayRegisterSummary');
const { getPayrollDateRange } = require('../shared/utils/dateUtils');
const { buildPayrollPeriodEmployeeQuery, isEmployeeLeftDateInPayrollPeriodScope } = require('../payroll/services/payrollEmployeeQueryHelper');

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
    console.log('Usage: node scripts/payroll_eligibility_report.js <YYYY-MM> [--departmentId=] [--divisionId=]');
    process.exit(1);
  }

  await mongoose.connect(process.env.MONGODB_URI);
  const [year, monthNum] = month.split('-').map(Number);
  const { startDate, endDate } = await getPayrollDateRange(year, monthNum);
  const rangeStart = new Date(startDate + 'T00:00:00.000Z');
  const rangeEnd = new Date(endDate + 'T23:59:59.999Z');

  console.log(`\n=== Payroll eligibility report: ${month} ===`);
  console.log(`Pay period: ${startDate} → ${endDate}\n`);

  const empQuery = buildPayrollPeriodEmployeeQuery(divisionId, departmentId, rangeStart, rangeEnd, null);
  const eligible = await Employee.find(empQuery)
    .select('emp_no employee_name department_id division_id is_active leftDate doj')
    .populate('department_id', 'name')
    .populate('division_id', 'name')
    .sort({ emp_no: 1 })
    .lean();

  const eligibleIds = eligible.map((e) => e._id);
  const payrollRecords = await PayrollRecord.find({ month, employeeId: { $in: eligibleIds } })
    .select('employeeId netSalary payableAmountBeforeAdvance status')
    .lean();
  const payrollByEmp = new Map(payrollRecords.map((r) => [String(r.employeeId), r]));

  const payRegisters = await PayRegisterSummary.find({ month, employeeId: { $in: eligibleIds } })
    .select('employeeId dailyRecords totals')
    .lean();
  const prByEmp = new Map(payRegisters.map((pr) => [String(pr.employeeId), pr]));

  const missed = [];
  const hasPayroll = [];
  const hiddenOnPaysheetOldRule = [];

  for (const emp of eligible) {
    const id = String(emp._id);
    const pr = payrollByEmp.get(id);
    const preg = prByEmp.get(id);
    const hasGrid = !!(preg && Array.isArray(preg.dailyRecords) && preg.dailyRecords.length > 0);
    const row = {
      emp_no: emp.emp_no,
      name: emp.employee_name,
      dept: emp.department_id?.name || '—',
      div: emp.division_id?.name || '—',
      active: emp.is_active !== false ? 'active' : 'inactive',
      left: formatLeft(emp.leftDate),
      payRegister: !preg ? 'none' : hasGrid ? 'synced' : 'stub',
      payableShifts: preg?.totals?.totalPayableShifts ?? '—',
    };

    if (!pr) {
      missed.push(row);
    } else {
      row.netSalary = pr.netSalary ?? pr.payableAmountBeforeAdvance ?? '—';
      row.status = pr.status || '—';
      hasPayroll.push(row);
      const oldPaysheetShow =
        !emp.leftDate ||
        (new Date(emp.leftDate) >= rangeStart && new Date(emp.leftDate) <= rangeEnd);
      const newPaysheetShow = isEmployeeLeftDateInPayrollPeriodScope(emp.leftDate, rangeStart, rangeEnd);
      if (!oldPaysheetShow && newPaysheetShow) {
        hiddenOnPaysheetOldRule.push(row);
      }
    }
  }

  console.log(`Eligible (pay period rules):     ${eligible.length}`);
  console.log(`With payroll record:             ${hasPayroll.length}`);
  console.log(`Missed (eligible, no payroll):   ${missed.length}`);
  console.log(
    `Had payroll but hidden on paysheet (old leftDate rule, now fixed): ${hiddenOnPaysheetOldRule.length}`
  );
  console.log('');

  if (missed.length) {
    console.log(`--- MISSED PAYROLL (${missed.length}) — eligible but no PayrollRecord ---`);
    for (const r of missed) {
      console.log(
        `  ${r.emp_no} | ${r.name} | ${r.div} | ${r.dept} | ${r.active}${r.left ? ` | left ${r.left}` : ''} | PR: ${r.payRegister}${r.payableShifts !== '—' ? ` | shifts ${r.payableShifts}` : ''}`
      );
    }
    console.log('');
  }

  if (hiddenOnPaysheetOldRule.length) {
    console.log(`--- PAYROLL EXISTS, WAS HIDDEN ON PAYSHEET (${hiddenOnPaysheetOldRule.length}) ---`);
    for (const r of hiddenOnPaysheetOldRule) {
      console.log(
        `  ${r.emp_no} | ${r.name} | left ${r.left} | net ${r.netSalary} | ${r.dept}`
      );
    }
    console.log('');
  }

  const zeroNet = hasPayroll.filter((r) => Number(r.netSalary) === 0);
  if (zeroNet.length) {
    console.log(`--- ELIGIBLE, PAYROLL EXISTS, NET SALARY = 0 (${zeroNet.length}) ---`);
    for (const r of zeroNet) {
      console.log(`  ${r.emp_no} | ${r.name} | ${r.dept} | PR: ${r.payRegister} | shifts ${r.payableShifts}`);
    }
    console.log('');
  }

  if (hasPayroll.length && missed.length === 0 && hiddenOnPaysheetOldRule.length === 0 && zeroNet.length === 0) {
    console.log('All eligible employees have payroll and should show on paysheet (with current rules).');
  }

  await mongoose.disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
