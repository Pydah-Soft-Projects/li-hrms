/**
 * Scope & Division Mapping Analysis Script
 *
 * 1. Connects to MongoDB
 * 2. Fetches all Employees, Users, Divisions, Departments
 * 3. Builds scope filter for each user and shows which employees match
 * 4. Verifies division mappings are correct
 * 5. Optionally updates division mappings for users
 *
 * Usage: node scripts/analyze_scope_and_division_mapping.js
 *        MONGODB_URI=mongodb://localhost:27017/hrms node scripts/analyze_scope_and_division_mapping.js
 */

const mongoose = require('mongoose');
const dotenv = require('dotenv');
const path = require('path');

dotenv.config({ path: path.join(__dirname, '../.env') });

const User = require('../users/model/User');
const Employee = require('../employees/model/Employee');
const Division = require('../departments/model/Division');
const Department = require('../departments/model/Department');
const { buildScopeFilter } = require('../shared/middleware/dataScopeMiddleware');

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/hrms';

function createDepartmentFilter(deptIds) {
  if (!deptIds || deptIds.length === 0) return { _id: null };
  return {
    $or: [
      { department_id: { $in: deptIds } },
      { department: { $in: deptIds } },
    ],
  };
}

function createDivisionFilter(divIds) {
  if (!divIds || divIds.length === 0) return { _id: null };
  return {
    $or: [
      { division_id: { $in: divIds } },
      { division: { $in: divIds } },
    ],
  };
}

async function main() {
  try {
    console.log('='.repeat(80));
    console.log('SCOPE & DIVISION MAPPING ANALYSIS');
    console.log('='.repeat(80));
    console.log(`Connecting to: ${MONGODB_URI}\n`);

    await mongoose.connect(MONGODB_URI);
    console.log('Connected.\n');

    // 1. Fetch all collections
    const [employees, users, divisions, departments] = await Promise.all([
      Employee.find({}).select('_id emp_no employee_name division_id department_id is_active').lean(),
      User.find({}).select('-password').populate('divisionMapping.division').populate('divisionMapping.departments').lean(),
      Division.find({}).select('_id name code').lean(),
      Department.find({}).select('_id name code divisions').lean(),
    ]);

    console.log('DATA COUNTS');
    console.log('-'.repeat(40));
    console.log(`Employees:  ${employees.length}`);
    console.log(`Users:      ${users.length}`);
    console.log(`Divisions:  ${divisions.length}`);
    console.log(`Departments: ${departments.length}`);
    console.log('');

    // 2. Division & Department reference
    const divMap = new Map(divisions.map((d) => [d._id.toString(), d]));
    const deptMap = new Map(departments.map((d) => [d._id.toString(), d]));

    // 3. For each user, build scope filter and count matching employees
    console.log('USER SCOPE ANALYSIS');
    console.log('='.repeat(80));

    for (const user of users) {
      const scopeFilter = buildScopeFilter(user);
      const activeFilter = { ...scopeFilter, is_active: { $ne: false } };

      const matchCount = await Employee.countDocuments(activeFilter);

      console.log(`\nUser: ${user.name} (${user.email})`);
      console.log(`  Role: ${user.role}, DataScope: ${user.dataScope || 'default'}`);
      console.log(`  EmployeeRef: ${user.employeeRef || 'none'}, EmployeeId: ${user.employeeId || 'none'}`);

      if (user.divisionMapping && user.divisionMapping.length > 0) {
        console.log(`  Division Mapping (${user.divisionMapping.length} entries):`);
        user.divisionMapping.forEach((m, i) => {
          const divId = m.division?._id || m.division;
          const divName = divId ? (divMap.get(divId.toString())?.name || divId) : '?';
          const depts = m.departments || [];
          const deptNames = depts.length === 0
            ? 'ALL departments'
            : depts.map((d) => {
                const id = d?._id || d;
                return deptMap.get(id.toString())?.name || id;
              }).join(', ');
          console.log(`    [${i + 1}] Division: ${divName} | Departments: ${deptNames}`);
        });
      } else {
        console.log(`  Division Mapping: (empty)`);
      }

      console.log(`  Scope Filter: ${JSON.stringify(scopeFilter).substring(0, 120)}${JSON.stringify(scopeFilter).length > 120 ? '...' : ''}`);
      console.log(`  Employees in scope: ${matchCount}`);
    }

    // 4. Employee distribution by division & department
    console.log('\n\nEMPLOYEE DISTRIBUTION');
    console.log('='.repeat(80));

    const empByDiv = new Map();
    const empByDept = new Map();

    for (const emp of employees) {
      const divId = emp.division_id?.toString();
      const deptId = (emp.department_id?._id || emp.department_id)?.toString();
      if (divId) {
        empByDiv.set(divId, (empByDiv.get(divId) || 0) + 1);
      }
      if (deptId) {
        empByDept.set(deptId, (empByDept.get(deptId) || 0) + 1);
      }
    }

    console.log('\nBy Division:');
    for (const div of divisions) {
      const count = empByDiv.get(div._id.toString()) || 0;
      console.log(`  ${div.name} (${div.code}): ${count} employees`);
    }

    console.log('\nBy Department (top 15):');
    const deptCounts = [...empByDept.entries()].sort((a, b) => b[1] - a[1]).slice(0, 15);
    for (const [deptId, count] of deptCounts) {
      const dept = deptMap.get(deptId);
      console.log(`  ${dept?.name || deptId}: ${count} employees`);
    }

    // 5. Summary: Users with empty divisionMapping who might need it
    console.log('\n\nUSERS POTENTIALLY NEEDING DIVISION MAPPING');
    console.log('='.repeat(80));

    const scopedRoles = ['hod', 'hr', 'manager'];
    const needsMapping = users.filter((u) =>
      scopedRoles.includes(u.role) &&
      (!u.divisionMapping || u.divisionMapping.length === 0)
    );

    if (needsMapping.length === 0) {
      console.log('All scoped users (HOD, HR, Manager) have division mappings.');
    } else {
      needsMapping.forEach((u) => {
        console.log(`  - ${u.email} (${u.role}): NO division mapping`);
      });
    }

    // 6. Cross-check: For each user, list first 5 employees they can see
    console.log('\n\nSAMPLE: First 5 employees each user can see');
    console.log('='.repeat(80));

    for (const user of users) {
      if (['super_admin', 'sub_admin'].includes(user.role)) {
        console.log(`\n${user.email}: sees ALL (admin)`);
        continue;
      }
      const scopeFilter = buildScopeFilter(user);
      const sample = await Employee.find({ ...scopeFilter, is_active: { $ne: false } })
        .select('emp_no employee_name division_id department_id')
        .limit(5)
        .populate('division_id', 'name')
        .populate('department_id', 'name')
        .lean();

      console.log(`\n${user.email} (${user.role}):`);
      sample.forEach((e, i) => {
        const div = e.division_id?.name || e.division_id || '-';
        const dept = e.department_id?.name || e.department_id || '-';
        console.log(`  ${i + 1}. ${e.emp_no} | ${e.employee_name} | Div: ${div} | Dept: ${dept}`);
      });
      if (sample.length === 0) console.log('  (none)');
    }

    console.log('\n' + '='.repeat(80));
    console.log('ANALYSIS COMPLETE');
    console.log('='.repeat(80));
    process.exit(0);
  } catch (err) {
    console.error('Error:', err);
    process.exit(1);
  }
}

main();
