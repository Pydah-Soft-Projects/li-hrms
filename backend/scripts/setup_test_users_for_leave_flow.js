/**
 * Setup Test Users for Leave Flow - Set known passwords for real HOD, Manager, HR
 *
 * 1. Finds an employee with department + division
 * 2. Finds real HOD, Manager, HR users who have scope over that employee
 * 3. Resets their passwords to TEST_PASSWORD (default: Test@123) via API
 * 4. Outputs credentials for test_leave_flow_real_users.js
 *
 * Usage: node scripts/setup_test_users_for_leave_flow.js
 *        TEST_PASSWORD=Test@123 node scripts/setup_test_users_for_leave_flow.js
 */

const mongoose = require('mongoose');
const axios = require('axios');
const dotenv = require('dotenv');
const path = require('path');

dotenv.config({ path: path.join(__dirname, '../.env') });

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/hrms';
const API_BASE = process.env.API_BASE || 'http://localhost:5000';
const TEST_PASSWORD = process.env.TEST_PASSWORD || 'Test@123';
const SUPER_ADMIN_EMAIL = process.env.SUPER_ADMIN_EMAIL || 'admin@hrms.com';
const SUPER_ADMIN_PASSWORD = process.env.SUPER_ADMIN_PASSWORD || 'Admin@123';

require('../departments/model/Department');
require('../departments/model/Division');
const Employee = require('../employees/model/Employee');
const User = require('../users/model/User');

function userHasScopeOverEmployee(user, empDeptId, empDivId) {
  if (!user.divisionMapping || user.divisionMapping.length === 0) return false;
  for (const m of user.divisionMapping) {
    const divId = (m.division?._id || m.division)?.toString();
    if (divId !== empDivId) continue;
    const depts = m.departments || [];
    if (depts.length === 0) return true; // All depts in division
    const hasDept = depts.some((d) => (d?._id || d)?.toString() === empDeptId);
    if (hasDept) return true;
  }
  return false;
}

async function resetUserPassword(token, userId, newPassword) {
  const res = await axios.put(
    `${API_BASE}/api/users/${userId}/reset-password`,
    { newPassword },
    { headers: { Authorization: `Bearer ${token}` } }
  );
  if (!res.data.success) throw new Error(res.data.message || 'Reset failed');
}

async function main() {
  try {
    console.log('='.repeat(70));
    console.log('SETUP TEST USERS FOR LEAVE FLOW');
    console.log('='.repeat(70));
    console.log(`API: ${API_BASE}, DB: ${MONGODB_URI.replace(/\/\/[^@]+@/, '//***@')}\n`);

    await mongoose.connect(MONGODB_URI);

    const users = await User.find({ isActive: true })
      .select('_id email name role divisionMapping')
      .populate('divisionMapping.division')
      .populate('divisionMapping.departments')
      .lean();

    const hods = users.filter((u) => u.role === 'hod');
    if (hods.length === 0) throw new Error('No HOD user found');

    const employees = await Employee.find({ is_active: true })
      .select('_id emp_no employee_name department_id division_id')
      .populate('department_id', '_id')
      .populate('division_id', '_id')
      .lean();

    // Find (HOD, employee) pair where HOD has scope over employee
    let hod = null;
    let emp = null;
    for (const h of hods) {
      for (const e of employees) {
        const empDeptId = (e.department_id?._id || e.department_id)?.toString();
        const empDivId = (e.division_id?._id || e.division_id)?.toString();
        if (!empDeptId || !empDivId) continue;
        if (userHasScopeOverEmployee(h, empDeptId, empDivId)) {
          hod = h;
          emp = e;
          break;
        }
      }
      if (hod) break;
    }

    if (!hod || !emp) {
      throw new Error('No HOD has scope over any employee. Run fix_division_mappings_for_hods.js first, or ensure HODs have divisionMapping with correct division+departments.');
    }

    const empDeptId = (emp.department_id?._id || emp.department_id)?.toString();
    const empDivId = (emp.division_id?._id || emp.division_id)?.toString();

    let managerCandidates = users.filter((u) => u.role === 'manager' && userHasScopeOverEmployee(u, empDeptId, empDivId));
    if (managerCandidates.length === 0) managerCandidates = users.filter((u) => u.role === 'manager');
    let manager = managerCandidates[0] || null;

    let hr = users.find((u) => u.role === 'hr' && userHasScopeOverEmployee(u, empDeptId, empDivId));
    if (!hr) hr = users.find((u) => u.role === 'hr' || (u.roles && u.roles.includes('hr')));
    if (!hr) {
      const subAdmin = users.find((u) => u.role === 'sub_admin');
      if (subAdmin) {
        hr = subAdmin;
        console.warn('  No HR user - using sub_admin for HR step:', subAdmin.email);
      } else {
        throw new Error('No HR or sub_admin user found for HR approval step');
      }
    }

    if (!manager) console.warn('  No Manager user - test will fall back to Super Admin for manager step');

    console.log('Found users for employee', emp.emp_no, '-', emp.employee_name);
    console.log('  HOD:     ', hod.email, hod && userHasScopeOverEmployee(hod, empDeptId, empDivId) ? '(scope ✓)' : '(scope ?)');
    console.log('  Manager: ', manager.email, manager && userHasScopeOverEmployee(manager, empDeptId, empDivId) ? '(scope ✓)' : '(scope ?)');
    console.log('  HR:      ', hr.email, hr && userHasScopeOverEmployee(hr, empDeptId, empDivId) ? '(scope ✓)' : '(scope ?)');
    console.log('');

    const loginRes = await axios.post(`${API_BASE}/api/auth/login`, {
      identifier: SUPER_ADMIN_EMAIL,
      password: SUPER_ADMIN_PASSWORD,
    });
    if (!loginRes.data.success) throw new Error('Super admin login failed');
    const token = loginRes.data.data.token;

    console.log('Resetting passwords to', TEST_PASSWORD, '...');
    const toReset = [['HOD', hod], ['Manager', manager], ['HR', hr]].filter(([, u]) => u);
    for (const [role, user] of toReset) {
      try {
        await resetUserPassword(token, user._id, TEST_PASSWORD);
        console.log(`  ✓ ${role} password set (${user.email})`);
      } catch (e) {
        console.warn(`  ⚠ ${role} (${user.email}): ${e.response?.status === 404 ? 'User not in User collection - test will fall back to Super Admin for this step' : e.message}`);
      }
    }
    console.log('');

    console.log('Add these to your .env or run with env vars:\n');
    console.log(`TEST_APPLICANT_EMAIL=${hr.email}`);
    console.log(`TEST_APPLICANT_PASSWORD=${TEST_PASSWORD}`);
    console.log(`TEST_HOD_EMAIL=${hod.email}`);
    console.log(`TEST_HOD_PASSWORD=${TEST_PASSWORD}`);
    if (manager) {
      console.log(`TEST_MANAGER_EMAIL=${manager.email}`);
      console.log(`TEST_MANAGER_PASSWORD=${TEST_PASSWORD}`);
    } else {
      console.log('# TEST_MANAGER_EMAIL= (no manager - will use Super Admin)');
    }
    console.log(`TEST_HR_EMAIL=${hr.email}`);
    console.log(`TEST_HR_PASSWORD=${TEST_PASSWORD}`);
    console.log(`TEST_EMPLOYEE_EMP_NO=${emp.emp_no}`);
    console.log('');
    console.log('Then run: node scripts/test_leave_flow_real_users.js');
  } catch (err) {
    console.error('Error:', err.message);
    if (err.response?.data) console.error(err.response.data);
    process.exit(1);
  } finally {
    await mongoose.disconnect();
    process.exit(0);
  }
}

main();
