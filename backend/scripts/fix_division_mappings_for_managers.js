/**
 * Fix Division Mappings for Managers (and create Manager if none exists)
 *
 * 1. For each Manager user: set divisionMapping from their linked employee (like HODs)
 * 2. If no Manager has scope over the target division: CREATE a new Manager user
 *    with divisionMapping covering that division (all departments)
 *
 * Usage:
 *   node scripts/fix_division_mappings_for_managers.js
 *   DIVISION_NAME="Engineering" node scripts/fix_division_mappings_for_managers.js
 *   MANAGER_EMAIL=manager.pyde@hrms.test MANAGER_PASSWORD=Test@123 node scripts/fix_division_mappings_for_managers.js
 */

const mongoose = require('mongoose');
const dotenv = require('dotenv');
const path = require('path');

dotenv.config({ path: path.join(__dirname, '../.env') });

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/hrms';
const DIVISION_SEARCH = process.env.DIVISION_NAME || 'Engineering';
const MANAGER_EMAIL = process.env.MANAGER_EMAIL || 'manager.pydah.engineering@hrms.test';
const MANAGER_PASSWORD = process.env.MANAGER_PASSWORD || 'Test@123';

require('../departments/model/Division');
const User = require('../users/model/User');
const Employee = require('../employees/model/Employee');

function userHasScopeOverDivision(user, divId) {
  if (!user.divisionMapping || user.divisionMapping.length === 0) return false;
  return user.divisionMapping.some((m) => (m.division?._id || m.division)?.toString() === divId);
}

async function main() {
  try {
    console.log('Connecting to:', MONGODB_URI.replace(/\/\/[^@]+@/, '//***@'));
    await mongoose.connect(MONGODB_URI);

    const Division = mongoose.model('Division');
    const divisions = await Division.find({ isActive: true }).lean();
    const targetDiv = divisions.find(
      (d) => d.name && d.name.toLowerCase().includes(DIVISION_SEARCH.toLowerCase())
    );
    if (!targetDiv) {
      console.log('Divisions:', divisions.map((d) => d.name).join(', '));
      throw new Error(`No division matching "${DIVISION_SEARCH}" found`);
    }
    const divId = targetDiv._id;
    console.log('Target division:', targetDiv.name, '(' + targetDiv.code + ')\n');

    const managerUsers = await User.find({ role: 'manager', isActive: true })
      .select('_id email name employeeRef employeeId divisionMapping')
      .lean();

    let updated = 0;

    // 1. Fix existing managers - set divisionMapping from linked employee
    for (const user of managerUsers) {
      let emp = null;
      if (user.employeeRef) {
        emp = await Employee.findById(user.employeeRef).select('division_id department_id').lean();
      } else if (user.employeeId) {
        emp = await Employee.findOne({ emp_no: user.employeeId }).select('division_id department_id').lean();
      }
      if (!emp || !emp.division_id || !emp.department_id) {
        console.log('  SKIP', user.email, ': No linked employee or missing division/department');
        continue;
      }
      await User.updateOne(
        { _id: user._id },
        { $set: { divisionMapping: [{ division: emp.division_id, departments: [emp.department_id] }] } }
      );
      updated++;
      console.log('  OK', user.email, '-> Division:', emp.division_id, 'Dept:', emp.department_id);
    }

    // 2. Check if any manager has scope over target division
    const managersWithScope = await User.find({ role: 'manager', isActive: true })
      .select('_id email divisionMapping')
      .populate('divisionMapping.division')
      .lean();

    const hasManagerForDiv = managersWithScope.some((u) => userHasScopeOverDivision(u, divId.toString()));

    if (!hasManagerForDiv) {
      console.log('\nNo Manager has scope over', targetDiv.name, '- creating Manager user...');
      const existing = await User.findOne({ email: MANAGER_EMAIL });
      if (existing) {
        await User.updateOne(
          { _id: existing._id },
          {
            $set: {
              divisionMapping: [{ division: divId, departments: [] }],
              role: 'manager',
              isActive: true,
            },
          }
        );
        console.log('  Updated existing user', MANAGER_EMAIL, 'with divisionMapping for', targetDiv.name);
      } else {
        const bcrypt = require('bcryptjs');
        const hashedPassword = await bcrypt.hash(MANAGER_PASSWORD, 10);
        await User.create({
          email: MANAGER_EMAIL,
          password: hashedPassword,
          name: 'Manager Pydah Engineering',
          role: 'manager',
          roles: ['manager'],
          dataScope: 'division',
          divisionMapping: [{ division: divId, departments: [] }],
          isActive: true,
        });
        console.log('  Created Manager:', MANAGER_EMAIL);
        console.log('  Password:', MANAGER_PASSWORD);
        console.log('  divisionMapping: all departments in', targetDiv.name);
      }
    } else {
      console.log('\nManager(s) with scope found - no creation needed.');
    }

    console.log('\nDone.');
    process.exit(0);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
}

main();
