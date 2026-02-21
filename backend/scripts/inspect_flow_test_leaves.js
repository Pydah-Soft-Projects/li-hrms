/**
 * Inspect leave records created during flow tests
 */
const mongoose = require('mongoose');
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
require('../employees/model/Employee');
require('../users/model/User');
require('../departments/model/Department');
const Leave = require('../leaves/model/Leave');

const ids = [
  '69896abe0c0e744f79687f76', '69896ac10c0e744f79688029', '69896ac30c0e744f796880d9',
  '69896ac50c0e744f79688162', '69896ac60c0e744f796881cb', '69896ac80c0e744f79688254'
];

async function run() {
  await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/hrms');
  const leaves = await Leave.find({ _id: { $in: ids } })
    .populate('employeeId', 'emp_no employee_name department_id')
    .populate('department', 'name')
    .populate('appliedBy', 'email name role')
    .sort({ createdAt: 1 })
    .lean();
  console.log(JSON.stringify(leaves, null, 2));
  process.exit(0);
}
run().catch(e => { console.error(e); process.exit(1); });
