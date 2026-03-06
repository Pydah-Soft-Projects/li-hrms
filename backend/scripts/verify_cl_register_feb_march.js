/**
 * Verify CL (Casual Leave) register and monthly limit for all employees for a given month.
 * Use to ensure Feb/March (or any month) show correct balance and monthly limit from payroll cycle.
 *
 * Usage (from backend directory):
 *   node scripts/verify_cl_register_feb_march.js
 *   MONTH=2 YEAR=2025 node scripts/verify_cl_register_feb_march.js   # February 2025
 *   MONTH=3 YEAR=2025 node scripts/verify_cl_register_feb_march.js   # March 2025
 *   SAMPLE=20 node scripts/verify_cl_register_feb_march.js           # Only first 20 employees (faster)
 *   MONTHS=1,2,3 YEAR=2026 node scripts/verify_cl_register_feb_march.js  # Check Jan, Feb, Mar 2026
 *
 * Uses leaveRegisterService.getLeaveRegister with balanceAsOf for the given month/year,
 * then compares with Employee.casualLeaves and reports mismatches or anomalies.
 */
require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
const mongoose = require('mongoose');
// Ensure refs used by leaveRegisterService (Employee → designation_id, department_id, division_id) are registered
require('../departments/model/Designation');
require('../departments/model/Department');
require('../departments/model/Division');
const Employee = require('../employees/model/Employee');
const dateCycleService = require('../leaves/services/dateCycleService');
const leaveRegisterService = require('../leaves/services/leaveRegisterService');

async function runOneMonth(month, year, employees, sampleSize) {
  const periodInfo = await dateCycleService.getPeriodInfo(new Date(year, month - 1, 15));
  const issues = [];
  const results = [];
  const list = sampleSize ? employees.slice(0, Math.min(sampleSize, employees.length)) : employees;

  for (const emp of list) {
    try {
      const registerData = await leaveRegisterService.getLeaveRegister(
        { employeeId: emp._id, leaveType: 'CL', balanceAsOf: true },
        String(month),
        String(year)
      );
      const entry = Array.isArray(registerData) ? registerData.find((e) => e.casualLeave) : null;
      const regBalance = entry ? Number(entry.casualLeave?.balance) || 0 : null;
      const empBalance = typeof emp.casualLeaves === 'number' ? emp.casualLeaves : 0;
      const monthlyLimit = entry ? (entry.casualLeave?.monthlyCLLimit ?? null) : null;
      const allowedRemaining = entry ? (entry.casualLeave?.allowedRemaining ?? null) : null;
      const fromEmployee = entry?.casualLeave?._balanceFromEmployee === true;
      const mismatch = regBalance !== null && regBalance !== empBalance;
      if (mismatch) issues.push({ empNo: emp.emp_no, name: emp.employee_name, registerBalance: regBalance, employeeBalance: empBalance, fromEmployee });
      results.push({ empNo: emp.emp_no, name: emp.employee_name, registerBalance: regBalance, employeeBalance: empBalance, monthlyCLLimit: monthlyLimit, allowedRemaining, fromEmployee, mismatch });
    } catch (err) {
      issues.push({ empNo: emp.emp_no, name: emp.employee_name, error: err.message });
      results.push({ empNo: emp.emp_no, name: emp.employee_name, error: err.message });
    }
  }
  return { periodInfo, issues, results };
}

async function run() {
  const month = process.env.MONTH != null ? Number(process.env.MONTH) : new Date().getMonth() + 1;
  const year = process.env.YEAR != null ? Number(process.env.YEAR) : new Date().getFullYear();
  const sampleSize = process.env.SAMPLE != null ? Math.max(0, parseInt(process.env.SAMPLE, 10)) : null;
  const monthsStr = process.env.MONTHS;
  const monthsToRun = monthsStr ? monthsStr.split(',').map((m) => parseInt(m.trim(), 10)).filter((m) => m >= 1 && m <= 12) : [month];

  await mongoose.connect(process.env.MONGODB_URI || process.env.MONGO_URI);
  const employees = await Employee.find({ is_active: true }).select('_id emp_no employee_name casualLeaves').lean();
  console.log('Active employees:', employees.length, sampleSize ? `(checking first ${sampleSize} per month)` : '', '\n');

  for (const m of monthsToRun) {
    const yr = year;
    console.log('========== Payroll month', m, 'year', yr, '==========');
    const periodInfo = await dateCycleService.getPeriodInfo(new Date(yr, m - 1, 15));
    const startStr = periodInfo.payrollCycle.startDate.toISOString().slice(0, 10);
    const endStr = periodInfo.payrollCycle.endDate.toISOString().slice(0, 10);
    console.log('Cycle:', startStr, 'to', endStr, '\n');

    const { issues, results } = await runOneMonth(m, yr, employees, sampleSize);
    const mismatchCount = issues.filter((i) => i.mismatch === true).length;
    const errorCount = issues.filter((i) => i.error).length;
    console.log('Checked:', results.length, '| Mismatches:', mismatchCount, '| Errors:', errorCount);
    if (issues.length > 0) {
      issues.slice(0, 10).forEach((i) => {
        if (i.error) console.log('  ', i.empNo, i.name, 'ERROR:', i.error);
        else if (i.mismatch) console.log('  ', i.empNo, 'reg:', i.registerBalance, 'emp:', i.employeeBalance);
      });
      if (issues.length > 10) console.log('  ... and', issues.length - 10, 'more');
    }
    console.log('Sample:', results.slice(0, 3).map((r) => (r.error ? `${r.empNo} ERR` : `${r.empNo} reg=${r.registerBalance} lim=${r.monthlyCLLimit}`)).join(' | '));
    console.log('');
  }

  await mongoose.disconnect();
  console.log('Done.');
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
