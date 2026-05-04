const mongoose = require('mongoose');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

require('../departments/model/Designation');
require('../departments/model/Department');
require('../departments/model/Division');

const Employee = require('../employees/model/Employee');
const { reconcilePoolCarryChainAfterRegisterChange } = require('../leaves/services/leaveRegisterPoolCarryReconcileService');

async function runForEmpNo(empNo) {
  const emp = await Employee.findOne({ $or: [{ emp_no: String(empNo) }, { emp_no: Number(empNo) }] })
    .select('_id emp_no employee_name')
    .lean();
  if (!emp) {
    console.log(`[reconcile] emp_no=${empNo}: not found`);
    return;
  }
  const res = await reconcilePoolCarryChainAfterRegisterChange(emp._id, { asOfDate: new Date() });
  console.log(`[reconcile] emp_no=${emp.emp_no} ${emp.employee_name || ''}`.trim());
  console.log(JSON.stringify(res, null, 2));
}

async function main() {
  await mongoose.connect(process.env.MONGODB_URI);
  for (const n of [2144, 2145, 2146]) {
    // eslint-disable-next-line no-await-in-loop
    await runForEmpNo(n);
  }
  await mongoose.disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});

