/**
 * Review and Test Leave Approval Flows
 *
 * 1. Identifies Pydah Engineering division and its departments
 * 2. Ensures Manager exists (creates if none) via fix_division_mappings_for_managers
 * 3. For each of 6 flows: CONFIGURE workflow in DB -> CREATE leave -> RUN full chain -> RECORD outcome
 * 4. Outputs detailed results per flow
 *
 * Usage:
 *   node scripts/review_and_test_approval_flows.js                    # Review only
 *   node scripts/review_and_test_approval_flows.js --test             # Run all 6 flow tests (config per flow)
 *   node scripts/review_and_test_approval_flows.js --test --setup     # Create manager + reset passwords first
 *   DIVISION_NAME="Engineering" node scripts/review_and_test_approval_flows.js
 */

const mongoose = require('mongoose');
const axios = require('axios');
const { execSync } = require('child_process');
const dotenv = require('dotenv');
const path = require('path');

dotenv.config({ path: path.join(__dirname, '../.env') });

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/hrms';
const API_BASE = process.env.API_BASE || 'http://localhost:5000';
const SUPER_ADMIN_EMAIL = process.env.SUPER_ADMIN_EMAIL || 'admin@hrms.com';
const SUPER_ADMIN_PASSWORD = process.env.SUPER_ADMIN_PASSWORD || 'Admin@123';
const TEST_PASSWORD = process.env.TEST_PASSWORD || 'Test@123';
const RUN_TESTS = process.argv.includes('--test');
const RUN_SETUP = process.argv.includes('--setup');
const DIVISION_SEARCH = process.env.DIVISION_NAME || 'Engineering'; // Partial match

require('../departments/model/Department');
require('../departments/model/Division');
const Employee = require('../employees/model/Employee');
const User = require('../users/model/User');
const LeaveSettings = require('../leaves/model/LeaveSettings');

function userHasScopeOverEmployee(user, empDeptId, empDivId) {
  if (!user.divisionMapping || user.divisionMapping.length === 0) return false;
  for (const m of user.divisionMapping) {
    const divId = (m.division?._id || m.division)?.toString();
    if (divId !== empDivId) continue;
    const depts = m.departments || [];
    if (depts.length === 0) return true;
    if (depts.some((d) => (d?._id || d)?.toString() === empDeptId)) return true;
  }
  return false;
}

const FLOW_CONFIGS = {
  flow1: {
    name: 'HOD → Manager → HR → Super Admin',
    steps: [
      { stepOrder: 1, stepName: 'HOD Approval', approverRole: 'hod' },
      { stepOrder: 2, stepName: 'Manager Approval', approverRole: 'manager' },
      { stepOrder: 3, stepName: 'HR Approval', approverRole: 'hr' },
      { stepOrder: 4, stepName: 'Super Admin Approval', approverRole: 'super_admin' },
    ],
    finalAuthority: { role: 'super_admin', anyHRCanApprove: false },
    chain: ['hod', 'manager', 'hr', 'super_admin'],
  },
  flow2: {
    name: 'HOD → HR → Manager → Super Admin',
    steps: [
      { stepOrder: 1, stepName: 'HOD Approval', approverRole: 'hod' },
      { stepOrder: 2, stepName: 'HR Approval', approverRole: 'hr' },
      { stepOrder: 3, stepName: 'Manager Approval', approverRole: 'manager' },
      { stepOrder: 4, stepName: 'Super Admin Approval', approverRole: 'super_admin' },
    ],
    finalAuthority: { role: 'super_admin', anyHRCanApprove: false },
    chain: ['hod', 'hr', 'manager', 'super_admin'],
  },
  flow3: {
    name: 'HOD → HR → Manager',
    steps: [
      { stepOrder: 1, stepName: 'HOD Approval', approverRole: 'hod' },
      { stepOrder: 2, stepName: 'HR Approval', approverRole: 'hr' },
      { stepOrder: 3, stepName: 'Manager Approval', approverRole: 'manager' },
    ],
    finalAuthority: { role: 'manager', anyHRCanApprove: false },
    chain: ['hod', 'hr', 'manager'],
  },
  flow4: {
    name: 'HOD → HR',
    steps: [
      { stepOrder: 1, stepName: 'HOD Approval', approverRole: 'hod' },
      { stepOrder: 2, stepName: 'HR Approval', approverRole: 'hr' },
    ],
    finalAuthority: { role: 'hr', anyHRCanApprove: true },
    chain: ['hod', 'hr'],
  },
  flow5: {
    name: 'HOD → Manager → HR',
    steps: [
      { stepOrder: 1, stepName: 'HOD Approval', approverRole: 'hod' },
      { stepOrder: 2, stepName: 'Manager Approval', approverRole: 'manager' },
      { stepOrder: 3, stepName: 'HR Approval', approverRole: 'hr' },
    ],
    finalAuthority: { role: 'hr', anyHRCanApprove: true },
    chain: ['hod', 'manager', 'hr'],
  },
  flow6: {
    name: 'HOD → Manager',
    steps: [
      { stepOrder: 1, stepName: 'HOD Approval', approverRole: 'hod' },
      { stepOrder: 2, stepName: 'Manager Approval', approverRole: 'manager' },
    ],
    finalAuthority: { role: 'manager', anyHRCanApprove: false },
    chain: ['hod', 'manager'],
  },
};

async function updateLeaveWorkflow(token, workflow) {
  const getRes = await axios.get(`${API_BASE}/api/leaves/settings/leave`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const current = getRes.data.data || {};
  const payload = {
    types: current.types,
    statuses: current.statuses,
    settings: current.settings,
    workflow: { isEnabled: true, steps: workflow.steps, finalAuthority: workflow.finalAuthority },
  };
  await axios.post(`${API_BASE}/api/leaves/settings/leave`, payload, {
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
  });
}

async function resetUserPassword(token, userId, newPassword) {
  const res = await axios.put(
    `${API_BASE}/api/users/${userId}/reset-password`,
    { newPassword },
    { headers: { Authorization: `Bearer ${token}` } }
  );
  if (!res.data.success) throw new Error(res.data.message || 'Reset failed');
}

async function login(identifier, password) {
  const res = await axios.post(`${API_BASE}/api/auth/login`, { identifier, password });
  if (!res.data.success) throw new Error(`Login failed: ${res.data.message}`);
  return res.data.data.token;
}

async function createLeave(token, payload) {
  try {
    const res = await axios.post(`${API_BASE}/api/leaves`, payload, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.data.success && res.status !== 201) throw new Error(res.data.error || res.data.message);
    return res.data.data || res.data;
  } catch (e) {
    const d = e.response?.data;
    const msg = d?.error || d?.message || e.message || `Create leave failed: ${e.response?.status}`;
    throw new Error(typeof msg === 'string' ? msg : JSON.stringify(d || msg));
  }
}

async function processLeaveAction(token, leaveId, action, comments = '') {
  try {
    const res = await axios.put(
      `${API_BASE}/api/leaves/${leaveId}/action`,
      { action, comments },
      { headers: { Authorization: `Bearer ${token}` } }
    );
    if (!res.data.success) throw new Error(res.data.error || res.data.message);
    return res.data.data || res.data;
  } catch (e) {
    const d = e.response?.data;
    const msg = d?.error || d?.message || e.message || `Action failed: ${e.response?.status}`;
    throw new Error(typeof msg === 'string' ? msg : JSON.stringify(d || msg));
  }
}

async function runFlowTest(flowKey, config, creds, basePayload, dayOffset, token) {
  const { chain } = config;

  // STEP 1: Configure this flow's workflow in DB
  await updateLeaveWorkflow(token, config);

  // STEP 2: Create leave with unique dates (offset to avoid conflicts)
  const from = new Date(basePayload.fromDate);
  from.setDate(from.getDate() + dayOffset);
  const to = new Date(basePayload.toDate);
  to.setDate(to.getDate() + dayOffset);
  const leavePayload = {
    ...basePayload,
    fromDate: from.toISOString().split('T')[0],
    toDate: to.toISOString().split('T')[0],
    purpose: `${flowKey} test - ${config.name}`,
  };

  const createEmail = creds.createAs?.email || creds.applicant?.email || creds.hr?.email || SUPER_ADMIN_EMAIL;
  const createPassword = creds.createAs?.password || creds.applicant?.password || creds.hr?.password || SUPER_ADMIN_PASSWORD;

  const applicantToken = await login(createEmail, createPassword);
  const created = await createLeave(applicantToken, leavePayload);
  const leaveId = created._id || created.id;
  let leave = created;

  const approverLog = [];

  // STEP 3: Run full approval chain
  for (const role of chain) {
    let roleToken;
    let usedFallback = false;
    const c = creds[role];
    if (c?.email && c?.password) {
      try {
        roleToken = await login(c.email, c.password);
      } catch {
        roleToken = await login(SUPER_ADMIN_EMAIL, SUPER_ADMIN_PASSWORD);
        usedFallback = true;
      }
    } else {
      roleToken = await login(SUPER_ADMIN_EMAIL, SUPER_ADMIN_PASSWORD);
      usedFallback = true;
    }
    leave = await processLeaveAction(roleToken, leaveId, 'approve', `Approved by ${role}`);
    approverLog.push({ role, user: c?.email || 'super_admin', usedFallback });
    if (leave.status === 'rejected') throw new Error('Leave rejected');
    if (leave.status === 'approved') break;
  }

  if (leave.status !== 'approved') throw new Error(`Flow did not complete. Status: ${leave.status}`);
  return { leaveId, approverLog };
}

async function main() {
  try {
    console.log('='.repeat(80));
    console.log('LEAVE APPROVAL FLOWS - COMPREHENSIVE REVIEW');
    console.log('='.repeat(80));
    console.log(`DB: ${MONGODB_URI.replace(/\/\/[^@]+@/, '//***@')}`);
    console.log(`API: ${API_BASE}`);
    console.log(`Division search: "${DIVISION_SEARCH}"\n`);

    await mongoose.connect(MONGODB_URI);

    // 1. Find Pydah Engineering (or matching) division
    const divisions = await mongoose.model('Division').find({ isActive: true }).lean();
    const targetDiv = divisions.find(
      (d) => d.name && d.name.toLowerCase().includes(DIVISION_SEARCH.toLowerCase())
    );
    if (!targetDiv) {
      console.log('DIVISIONS FOUND:', divisions.map((d) => d.name).join(', '));
      throw new Error(`No division matching "${DIVISION_SEARCH}" found`);
    }
    const divId = targetDiv._id.toString();
    console.log('1. PYDAH ENGINEERING DIVISION');
    console.log('   Division:', targetDiv.name, '(' + targetDiv.code + ')');
    console.log('   ID:', divId, '\n');

    // 2. Departments under this division (Division.departments or from employees)
    let departments = [];
    const divPopulated = await mongoose.model('Division').findById(targetDiv._id).populate('departments', '_id name code').lean();
    if (divPopulated?.departments?.length > 0) {
      departments = divPopulated.departments.map((d) => ({ _id: d._id, name: d.name, code: d.code || '-' }));
    }
    if (departments.length === 0) {
      const empDepts = await Employee.find({ division_id: targetDiv._id }).select('department_id').populate('department_id', 'name code').lean();
      const seen = new Set();
      for (const e of empDepts) {
        const d = e.department_id;
        if (d && !seen.has(d._id.toString())) {
          seen.add(d._id.toString());
          departments.push({ _id: d._id, name: d.name, code: d.code || '-' });
        }
      }
    }
    console.log('2. DEPARTMENTS IN DIVISION');
    departments.forEach((d) => console.log('   -', d.name, '(' + (d.code || '-') + ')'));
    if (departments.length === 0) console.log('   (None linked directly; check employees)');
    console.log('');

    // 3. Employees in division
    const empFilter = { is_active: true, division_id: targetDiv._id };
    const employees = await Employee.find(empFilter)
      .select('_id emp_no employee_name department_id division_id')
      .populate('department_id', '_id name')
      .populate('division_id', '_id name')
      .limit(20)
      .lean();
    console.log('3. EMPLOYEES IN DIVISION (sample)', employees.length);
    employees.slice(0, 5).forEach((e) => {
      const dept = e.department_id?.name || e.department_id || '-';
      console.log('   -', e.emp_no, e.employee_name, '| Dept:', dept);
    });
    if (employees.length > 5) console.log('   ... and', employees.length - 5, 'more');
    console.log('');

    // 4. Users (HOD, Manager, HR) with scope
    const users = await User.find({ isActive: true })
      .select('_id email name role divisionMapping')
      .populate('divisionMapping.division')
      .populate('divisionMapping.departments')
      .lean();

    const hods = users.filter((u) => u.role === 'hod');
    const managers = users.filter((u) => u.role === 'manager');
    const hrs = users.filter((u) => u.role === 'hr' || (u.roles && u.roles.includes('hr')));
    const subAdmins = users.filter((u) => u.role === 'sub_admin');

    const hodsWithScope = [];
    const managersWithScope = [];
    const hrsWithScope = [];

    for (const e of employees) {
      const empDeptId = (e.department_id?._id || e.department_id)?.toString();
      const empDivId = (e.division_id?._id || e.division_id)?.toString();
      if (!empDeptId || !empDivId) continue;
      for (const h of hods) {
        if (userHasScopeOverEmployee(h, empDeptId, empDivId)) {
          if (!hodsWithScope.find((x) => x.email === h.email)) hodsWithScope.push(h);
        }
      }
      for (const m of managers) {
        if (userHasScopeOverEmployee(m, empDeptId, empDivId)) {
          if (!managersWithScope.find((x) => x.email === m.email)) managersWithScope.push(m);
        }
      }
      for (const h of hrs) {
        if (userHasScopeOverEmployee(h, empDeptId, empDivId)) {
          if (!hrsWithScope.find((x) => x.email === h.email)) hrsWithScope.push(h);
        }
      }
    }
    if (hrsWithScope.length === 0 && subAdmins.length > 0) {
      hrsWithScope.push(...subAdmins);
    }

    console.log('4. USERS WITH SCOPE OVER DIVISION');
    console.log('   HODs:', hodsWithScope.length, hodsWithScope.map((u) => u.email).join(', ') || '(none)');
    console.log('   Managers:', managersWithScope.length, managersWithScope.map((u) => u.email).join(', ') || '(none)');
    console.log('   HR:', hrsWithScope.length, hrsWithScope.map((u) => u.email).join(', ') || '(none)');
    console.log('');

    // 5. Issues
    console.log('5. ISSUES / RECOMMENDATIONS');
    const issues = [];
    if (hodsWithScope.length === 0) issues.push('No HOD with scope - run fix_division_mappings_for_hods.js');
    if (managersWithScope.length === 0) issues.push('No Manager with scope - assign divisionMapping to Manager users');
    if (hrsWithScope.length === 0) issues.push('No HR with scope - use sub_admin or assign HR divisionMapping');
    if (employees.length === 0) issues.push('No employees in division - cannot test');
    if (issues.length === 0) console.log('   None - all roles have scope');
    else issues.forEach((i) => console.log('   -', i));
    console.log('');

    // 6. Current LeaveSettings
    const leaveSettings = await LeaveSettings.findOne({ type: 'leave', isActive: true }).lean();
    const steps = leaveSettings?.workflow?.steps || [];
    const chain = ['hod', ...steps.filter((s) => s.approverRole !== 'hod').map((s) => s.approverRole)];
    console.log('6. CURRENT LEAVE WORKFLOW (LeaveSettings)');
    console.log('   Chain:', chain.join(' → '));
    console.log('   Final authority:', leaveSettings?.workflow?.finalAuthority?.role || 'hr');
    console.log('');

    // 7. Setup (--setup): Create manager if needed, re-fetch users, reset passwords
    if (RUN_TESTS && RUN_SETUP) {
      console.log('7. SETUP: Creating manager + resetting passwords...');
      try {
        execSync(`node "${path.join(__dirname, 'fix_division_mappings_for_managers.js')}"`, {
          stdio: 'inherit',
          env: { ...process.env, DIVISION_NAME: DIVISION_SEARCH },
        });
      } catch {
        console.warn('  fix_division_mappings_for_managers failed - continuing');
      }
      // Re-fetch users (new manager may exist now)
      const usersAfter = await User.find({ isActive: true })
        .select('_id email name role divisionMapping')
        .populate('divisionMapping.division')
        .populate('divisionMapping.departments')
        .lean();
      managersWithScope.length = 0;
      for (const m of usersAfter.filter((u) => u.role === 'manager')) {
        for (const e of employees) {
          const empDeptId = (e.department_id?._id || e.department_id)?.toString();
          const empDivId = (e.division_id?._id || e.division_id)?.toString();
          if (empDeptId && empDivId && userHasScopeOverEmployee(m, empDeptId, empDivId)) {
            if (!managersWithScope.find((x) => x.email === m.email)) managersWithScope.push(m);
            break;
          }
        }
      }
      const token = await login(SUPER_ADMIN_EMAIL, SUPER_ADMIN_PASSWORD);
      const toReset = [
        ['HOD', hodsWithScope[0]],
        ['Manager', managersWithScope[0]],
        ['HR', hrsWithScope[0]],
      ].filter(([, u]) => u);
      for (const [role, user] of toReset) {
        try {
          await resetUserPassword(token, user._id, TEST_PASSWORD);
          console.log(`  ✓ ${role} password set (${user.email})`);
        } catch (e) {
          console.warn(`  ⚠ ${role}: ${e.message}`);
        }
      }
      console.log('');
    }

    // 8. Run tests for all 6 flows (CONFIGURE per flow -> CREATE leave -> RUN chain -> RECORD)
    if (RUN_TESTS && employees.length > 0 && (hodsWithScope.length > 0 || hrsWithScope.length > 0)) {
      console.log('8. RUNNING TESTS FOR ALL 6 FLOWS (configure workflow per flow, then test)');
      // Pick employee that HOD and HR (applicant) both have scope over
      const applicant = hrsWithScope[0];
      let emp = null;
      for (const e of employees) {
        const empDeptId = (e.department_id?._id || e.department_id)?.toString();
        const empDivId = (e.division_id?._id || e.division_id)?.toString();
        if (!empDeptId || !empDivId) continue;
        const hodHasScope = hodsWithScope.some((h) => userHasScopeOverEmployee(h, empDeptId, empDivId));
        const hrHasScope = applicant && userHasScopeOverEmployee(applicant, empDeptId, empDivId);
        const subAdminApplicant = applicant?.role === 'sub_admin';
        if (hodHasScope && (hrHasScope || subAdminApplicant)) {
          emp = e;
          break;
        }
      }
      if (!emp) {
        for (const e of employees) {
          const empDeptId = (e.department_id?._id || e.department_id)?.toString();
          const empDivId = (e.division_id?._id || e.division_id)?.toString();
          if (!empDeptId || !empDivId) continue;
          if (hodsWithScope.some((h) => userHasScopeOverEmployee(h, empDeptId, empDivId))) {
            emp = e;
            break;
          }
        }
      }
      if (!emp) emp = employees[0];
      console.log('   Using employee:', emp.emp_no, emp.employee_name, '-', emp.department_id?.name || emp.department_id);
      const creds = {
        hod: hodsWithScope[0] ? { email: hodsWithScope[0].email, password: TEST_PASSWORD } : null,
        manager: managersWithScope[0] ? { email: managersWithScope[0].email, password: TEST_PASSWORD } : null,
        hr: hrsWithScope[0] ? { email: hrsWithScope[0].email, password: TEST_PASSWORD } : null,
        super_admin: { email: SUPER_ADMIN_EMAIL, password: SUPER_ADMIN_PASSWORD },
        applicant: hrsWithScope[0]
          ? { email: hrsWithScope[0].email, password: TEST_PASSWORD }
          : { email: SUPER_ADMIN_EMAIL, password: SUPER_ADMIN_PASSWORD },
        // Use Super Admin for create to avoid HR scope issues; real users for approvals
        createAs: { email: SUPER_ADMIN_EMAIL, password: SUPER_ADMIN_PASSWORD },
      };

      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const fromDate = new Date(today);
      fromDate.setDate(fromDate.getDate() + 14);
      fromDate.setHours(0, 0, 0, 0);
      const toDate = new Date(fromDate);
      const basePayload = {
        empNo: emp.emp_no,
        leaveType: leaveSettings?.types?.find((t) => t.isActive)?.code || 'CL',
        fromDate: fromDate.toISOString().split('T')[0],
        toDate: toDate.toISOString().split('T')[0],
        contactNumber: '9876543210',
        emergencyContact: 'Emergency',
      };

      const token = await login(SUPER_ADMIN_EMAIL, SUPER_ADMIN_PASSWORD);
      const results = {};
      const flowKeys = Object.keys(FLOW_CONFIGS);
      for (let i = 0; i < flowKeys.length; i++) {
        const key = flowKeys[i];
        const config = FLOW_CONFIGS[key];
        const dayOffset = i * 7;
        try {
          const { leaveId, approverLog } = await runFlowTest(key, config, creds, basePayload, dayOffset, token);
          results[key] = { pass: true, leaveId, approverLog };
          console.log(`   ✓ ${key}: ${config.name} | Leave ${leaveId} | Approvers: ${approverLog.map((a) => a.role).join('→')}`);
        } catch (e) {
          const errMsg = e?.message || String(e);
          results[key] = { pass: false, error: errMsg, approverLog: [] };
          console.log(`   ✗ ${key}: ${config.name} | ${errMsg}`);
        }
      }
      const passed = Object.values(results).filter((r) => r.pass).length;
      console.log(`\n   RESULT: ${passed}/6 flows passed`);

      // Detailed results table
      console.log('\n   DETAILED OUTCOMES:');
      console.log('   ' + '-'.repeat(76));
      for (const [key, r] of Object.entries(results)) {
        const cfg = FLOW_CONFIGS[key];
        const status = r.pass ? 'PASS' : 'FAIL';
        const leaveId = r.leaveId || '-';
        const detail = r.pass
          ? r.approverLog?.map((a) => `${a.role}(${a.usedFallback ? 'SA' : 'real'})`).join(' → ') || ''
          : r.error || '';
        console.log(`   ${key.padEnd(8)} ${status.padEnd(6)} ${String(leaveId).padEnd(26)} ${detail}`);
      }
      console.log('   ' + '-'.repeat(76));
    } else if (RUN_TESTS) {
      console.log('8. SKIPPING TESTS - run with --setup first: node scripts/review_and_test_approval_flows.js --test --setup');
    }

    console.log('\n' + '='.repeat(80));
    console.log('REVIEW COMPLETE - See docs/LEAVE_APPROVAL_FLOWS_REVIEW.md for full details');
    console.log('='.repeat(80));
  } catch (err) {
    console.error('Error:', err.message);
    if (err.response?.data) console.error('Response:', err.response.data);
    if (err.stack) console.error(err.stack);
    process.exit(1);
  } finally {
    await mongoose.disconnect();
    process.exit(0);
  }
}

main();
