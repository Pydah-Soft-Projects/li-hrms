/**
 * Diagnose why OD (or Leave) requests may not show for a scoped user.
 * Lists OD and Leave documents for an employee and their department_id / division_id.
 * If these are null on OD but set on Leave, the list API (which filters by document scope)
 * will show leaves but not ODs until we add employee-in-scope fallback.
 *
 * Usage: EMP_NO=1613 node backend/scripts/diagnose_od_scope_emp.js
 *        (or set MONGO_URI if needed)
 */

require('dotenv').config();
const mongoose = require('mongoose');

async function run() {
  const empNo = process.env.EMP_NO || '1613';
  await mongoose.connect(process.env.MONGODB_URI || process.env.MONGO_URI);

  const Employee = require('../employees/model/Employee');
  const OD = require('../leaves/model/OD');
  const Leave = require('../leaves/model/Leave');

  const employee = await Employee.findOne({ emp_no: empNo })
    .select('_id emp_no employee_name department_id division_id')
    .lean();
  if (!employee) {
    console.log('Employee not found for emp_no:', empNo);
    await mongoose.disconnect();
    return;
  }
  const empId = employee._id;
  console.log('Employee:', employee.emp_no, employee.employee_name);
  console.log('  department_id:', employee.department_id || '(null)');
  console.log('  division_id:  ', employee.division_id || '(null)');
  console.log('');

  const ods = await OD.find({ $or: [{ employeeId: empId }, { emp_no: empNo }] })
    .select('_id status fromDate toDate department department_id division_id appliedAt')
    .sort({ appliedAt: -1 })
    .limit(20)
    .lean();
  console.log('ODs for this employee:', ods.length);
  ods.forEach((od, i) => {
    const dept = od.department_id || od.department;
    const div = od.division_id;
    const missing = (!dept || !div) ? '  <-- MISSING dept/division (hidden by document scope)' : '';
    console.log(
      `  ${i + 1}. id=${od._id} status=${od.status} from=${od.fromDate?.toISOString?.()?.slice(0, 10)} department_id=${dept || '(null)'} division_id=${div || '(null)'}${missing}`
    );
  });
  const odsMissingScope = ods.filter(od => !(od.department_id || od.department) || !od.division_id);
  if (odsMissingScope.length > 0) {
    console.log('');
    console.log('Reason ODs were not displayed: %s OD(s) have null department_id or division_id.', odsMissingScope.length);
    console.log('The list API filters by document scope (division_id/department). Records with null do not match.');
    console.log('Fix: backend now also includes records where employeeId is in user scope (see getODs/getLeaves).');
  }
  console.log('');

  const leaves = await Leave.find({ $or: [{ employeeId: empId }, { emp_no: empNo }] })
    .select('_id status fromDate toDate department department_id division_id appliedAt')
    .sort({ appliedAt: -1 })
    .limit(20)
    .lean();
  console.log('Leaves for this employee:', leaves.length);
  leaves.forEach((lv, i) => {
    const dept = lv.department_id || lv.department;
    const div = lv.division_id;
    const missing = (!dept || !div) ? '  <-- MISSING dept/division' : '';
    console.log(
      `  ${i + 1}. id=${lv._id} status=${lv.status} from=${lv.fromDate?.toISOString?.()?.slice(0, 10)} department_id=${dept || '(null)'} division_id=${div || '(null)'}${missing}`
    );
  });

  await mongoose.disconnect();
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
