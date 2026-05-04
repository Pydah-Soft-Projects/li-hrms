const mongoose = require('mongoose');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });
require('../departments/model/Designation');
require('../departments/model/Department');
require('../departments/model/Division');
const Employee = require('../employees/model/Employee');
const leaveRegisterService = require('../leaves/services/leaveRegisterService');

async function main() {
  await mongoose.connect(process.env.MONGODB_URI);
  const emp = await Employee.findOne({ $or: [{ emp_no: '2144' }, { emp_no: 2144 }] }).lean();
  const grouped = await leaveRegisterService.getLeaveRegister({ employeeId: emp._id, financialYear: '2026' }, null, null);
  const row = Array.isArray(grouped) ? grouped[0] : grouped;
  console.log('hasMonths=', Array.isArray(row.months));
  console.log('hasRegisterMonths=', Array.isArray(row.registerMonths));
  console.log('monthCount', row.months?.length, row.registerMonths?.length);
  if (row.months && row.months.length > 0) {
    for (let i = 0; i < Math.min(3, row.months.length); i++) {
      const m = row.months[i];
      console.log('----', m.label, m.month, m.year, 'txCount', (m.transactions || []).length);
      console.log(JSON.stringify((m.transactions || []).slice(0, 5), null, 2));
    }
  }
  await mongoose.disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
