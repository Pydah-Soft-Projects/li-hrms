/**
 * One-off check for a single employee's payroll / pay register status by emp_no.
 * Usage: node scripts/check_employee_payroll_status.js <emp_no> [YYYY-MM ...]
 */
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });
const mongoose = require('mongoose');
const Employee = require('../employees/model/Employee');
require('../departments/model/Department');
require('../departments/model/Division');
require('../departments/model/Designation');
const PayrollRecord = require('../payroll/model/PayrollRecord');
const PayRegisterSummary = require('../pay-register/model/PayRegisterSummary');
const { getPayrollDateRange } = require('../shared/utils/dateUtils');
const { buildPayrollPeriodEmployeeQuery } = require('../payroll/services/payrollEmployeeQueryHelper');
const { assertEmployeeInPayRegisterDisplayScope } = require('../pay-register/services/payRegisterEmployeeFilter');

async function main() {
  const empNo = process.argv[2];
  const months = process.argv.slice(3).filter((m) => /^\d{4}-\d{2}$/.test(m));
  if (!empNo) {
    console.log('Usage: node scripts/check_employee_payroll_status.js <emp_no> [YYYY-MM ...]');
    process.exit(1);
  }

  await mongoose.connect(process.env.MONGODB_URI);

  const emp = await Employee.findOne({ emp_no: String(empNo) })
    .populate('department_id', 'name code')
    .populate('division_id', 'name code')
    .populate('designation_id', 'name')
    .lean();

  if (!emp) {
    console.log(`Employee ${empNo} not found.`);
    await mongoose.disconnect();
    return;
  }

  console.log('=== Employee', emp.emp_no, '===');
  console.log('Name:        ', emp.employee_name);
  console.log('Department:  ', emp.department_id?.name || '—');
  console.log('Division:    ', emp.division_id?.name || '—');
  console.log('Designation: ', emp.designation_id?.name || '—');
  console.log('DOJ:         ', emp.doj ? new Date(emp.doj).toISOString().slice(0, 10) : '—');
  console.log('Active:      ', emp.is_active !== false ? 'yes' : 'no (inactive)');
  console.log('Left date:   ', emp.leftDate ? new Date(emp.leftDate).toISOString().slice(0, 10) : '—');
  console.log('Employee _id:', emp._id);
  console.log('');

  const checkMonths = months.length ? months : ['2026-05', '2026-04', '2026-03', '2026-06'];

  for (const month of checkMonths) {
    const [year, monthNum] = month.split('-').map(Number);
    const { startDate, endDate } = await getPayrollDateRange(year, monthNum);
    const rangeStart = new Date(startDate + 'T00:00:00.000Z');
    const rangeEnd = new Date(endDate + 'T23:59:59.999Z');

    const periodQuery = buildPayrollPeriodEmployeeQuery(
      emp.division_id?._id,
      emp.department_id?._id,
      rangeStart,
      rangeEnd,
      null
    );
    periodQuery._id = emp._id;
    const eligible = (await Employee.countDocuments(periodQuery)) > 0;

    let payRegisterScope = 'n/a';
    try {
      await assertEmployeeInPayRegisterDisplayScope(emp._id, month);
      payRegisterScope = 'in Pay Register display scope';
    } catch (e) {
      payRegisterScope = `OUT of Pay Register scope: ${e.message}`;
    }

    const payroll = await PayrollRecord.findOne({ employeeId: emp._id, month })
      .select('status netPay grossPay payrollBatchId calculatedAt')
      .lean();
    const pr = await PayRegisterSummary.findOne({ employeeId: emp._id, month })
      .select('dailyRecords updatedAt')
      .lean();
    const hasPr = !!pr;
    const hasGrid = !!(pr && Array.isArray(pr.dailyRecords) && pr.dailyRecords.length > 0);

    console.log(`--- ${month} (period ${startDate} → ${endDate}) ---`);
    console.log('  Eligible (payroll period rules):', eligible ? 'YES' : 'NO');
    console.log('  Pay Register list scope:      ', payRegisterScope);
    console.log('  Pay Register summary:         ', hasPr ? (hasGrid ? 'synced (has daily records)' : 'stub/empty') : 'NONE');
    console.log(
      '  Payroll record:               ',
      payroll
        ? `YES — status=${payroll.status || '—'} net=${payroll.netPay ?? '—'} gross=${payroll.grossPay ?? '—'}`
        : 'NONE (missed if eligible)'
    );
    if (eligible && !payroll) {
      console.log('  → Action: ', hasGrid ? 'Run Calculate on Pay Register' : hasPr ? 'Re-sync pay register then Calculate' : 'Sync pay register then Calculate');
    }
    console.log('');
  }

  await mongoose.disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
