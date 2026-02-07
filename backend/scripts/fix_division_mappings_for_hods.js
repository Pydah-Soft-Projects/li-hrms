/**
 * Fix Division Mappings for HODs
 *
 * For each HOD user with empty divisionMapping:
 * - Get their linked employee (employeeRef)
 * - Use employee's division_id and department_id to set:
 *   divisionMapping: [{ division: emp.division_id, departments: [emp.department_id] }]
 *
 * This gives each HOD access to their department's employees (and their own record).
 *
 * Usage: MONGODB_URI=mongodb://localhost:27017/hrms node scripts/fix_division_mappings_for_hods.js
 */

const mongoose = require('mongoose');
const dotenv = require('dotenv');
const path = require('path');

dotenv.config({ path: path.join(__dirname, '../.env') });

const User = require('../users/model/User');
const Employee = require('../employees/model/Employee');

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/hrms';

async function main() {
  try {
    console.log('Connecting to:', MONGODB_URI);
    await mongoose.connect(MONGODB_URI);

    const hodUsers = await User.find({ role: 'hod' }).select('_id email name employeeRef employeeId').lean();
    console.log(`Found ${hodUsers.length} HOD users.\n`);

    let updated = 0;
    for (const user of hodUsers) {
      let emp = null;
      if (user.employeeRef) {
        emp = await Employee.findById(user.employeeRef).select('division_id department_id').lean();
      } else if (user.employeeId) {
        emp = await Employee.findOne({ emp_no: user.employeeId }).select('division_id department_id').lean();
      }

      if (!emp) {
        console.log(`  SKIP ${user.email}: No linked employee`);
        continue;
      }

      const divId = emp.division_id;
      const deptId = emp.department_id;

      if (!divId || !deptId) {
        console.log(`  SKIP ${user.email}: Employee has no division_id or department_id`);
        continue;
      }

      await User.updateOne(
        { _id: user._id },
        { $set: { divisionMapping: [{ division: divId, departments: [deptId] }] } }
      );

      updated++;
      console.log(`  OK ${user.email} -> Division: ${divId}, Dept: ${deptId}`);
    }

    console.log(`\nUpdated ${updated} HOD users.`);
    process.exit(0);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
}

main();
