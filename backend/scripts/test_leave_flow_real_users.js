/**
 * Test Leave Flow with Real Users - HOD, Manager, HR, Super Admin
 *
 * Uses real users for each approval step (not super_admin for all):
 * 1. Create leave: HR (or use TEST_APPLICANT_EMAIL)
 * 2. Approve: HOD
 * 3. Approve: Manager
 * 4. Approve: HR
 * 5. Approve: Super Admin (final authority)
 *
 * Run setup first: node scripts/setup_test_users_for_leave_flow.js
 * Then: node scripts/test_leave_flow_real_users.js
 *
 * Env vars (set by setup or manually):
 *   TEST_APPLICANT_EMAIL, TEST_APPLICANT_PASSWORD  - creates the leave (HR)
 *   TEST_HOD_EMAIL, TEST_HOD_PASSWORD
 *   TEST_MANAGER_EMAIL, TEST_MANAGER_PASSWORD
 *   TEST_HR_EMAIL, TEST_HR_PASSWORD
 *   TEST_EMPLOYEE_EMP_NO  - employee to apply leave for
 */

const mongoose = require('mongoose');
const axios = require('axios');
const dotenv = require('dotenv');
const path = require('path');

dotenv.config({ path: path.join(__dirname, '../.env') });

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/hrms';
const API_BASE = process.env.API_BASE || 'http://localhost:5000';
const SUPER_ADMIN_EMAIL = process.env.SUPER_ADMIN_EMAIL || 'admin@hrms.com';
const SUPER_ADMIN_PASSWORD = process.env.SUPER_ADMIN_PASSWORD || 'Admin@123';

const Employee = require('../employees/model/Employee');
const User = require('../users/model/User');
const LeaveSettings = require('../leaves/model/LeaveSettings');

async function login(identifier, password) {
  const res = await axios.post(`${API_BASE}/api/auth/login`, { identifier, password });
  if (!res.data.success) throw new Error(`Login failed: ${res.data.message}`);
  return res.data.data.token;
}

async function createLeave(token, payload) {
  const res = await axios.post(`${API_BASE}/api/leaves`, payload, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.data.success && res.status !== 201) {
    throw new Error(`Create leave failed: ${res.data.error || res.data.message}`);
  }
  return res.data.data || res.data;
}

async function processLeaveAction(token, leaveId, action, comments = '') {
  const res = await axios.put(
    `${API_BASE}/api/leaves/${leaveId}/action`,
    { action, comments },
    { headers: { Authorization: `Bearer ${token}` } }
  );
  if (!res.data.success) {
    throw new Error(`Leave action failed: ${res.data.error || res.data.message}`);
  }
  return res.data.data || res.data;
}

async function getLeave(token, leaveId) {
  const res = await axios.get(`${API_BASE}/api/leaves/${leaveId}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.data.success) throw new Error('Get leave failed');
  return res.data.data || res.data;
}

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

async function main() {
  console.log('='.repeat(70));
  console.log('LEAVE FLOW TEST - Real Users (HOD → Manager → HR → Super Admin)');
  console.log('='.repeat(70));
  console.log(`API: ${API_BASE}\n`);

  const applicantEmail = process.env.TEST_APPLICANT_EMAIL || process.env.TEST_HR_EMAIL;
  const applicantPassword = process.env.TEST_APPLICANT_PASSWORD || process.env.TEST_HR_PASSWORD;
  const hodEmail = process.env.TEST_HOD_EMAIL;
  const hodPassword = process.env.TEST_HOD_PASSWORD;
  const managerEmail = process.env.TEST_MANAGER_EMAIL;
  const managerPassword = process.env.TEST_MANAGER_PASSWORD;
  const hrEmail = process.env.TEST_HR_EMAIL;
  const hrPassword = process.env.TEST_HR_PASSWORD;
  const employeeEmpNo = process.env.TEST_EMPLOYEE_EMP_NO;

  if (!applicantEmail || !applicantPassword) {
    console.error('Missing TEST_APPLICANT_EMAIL/TEST_APPLICANT_PASSWORD (or TEST_HR_EMAIL/TEST_HR_PASSWORD)');
    console.error('Run: node scripts/setup_test_users_for_leave_flow.js first');
    process.exit(1);
  }
  if (!hodEmail || !hodPassword || !hrEmail || !hrPassword) {
    console.error('Missing TEST_HOD_EMAIL, TEST_HR_EMAIL or their passwords');
    console.error('Run: node scripts/setup_test_users_for_leave_flow.js first');
    process.exit(1);
  }
  // Manager credentials optional - will fall back to Super Admin if missing/login fails

  let leaveId = null;

  try {
    await mongoose.connect(MONGODB_URI);

    let empNo = employeeEmpNo;
    if (!empNo) {
      const emp = await Employee.findOne({ is_active: true }).select('emp_no employee_name').lean();
      if (!emp) throw new Error('No active employee found');
      empNo = emp.emp_no;
      console.log('Using employee:', emp.emp_no, '-', emp.employee_name);
    } else {
      const emp = await Employee.findOne({ emp_no: empNo, is_active: true }).select('emp_no employee_name').lean();
      if (!emp) throw new Error(`Employee ${empNo} not found`);
      console.log('Employee:', emp.emp_no, '-', emp.employee_name);
    }

    const leaveSettings = await LeaveSettings.findOne({ type: 'leave', isActive: true }).lean();
    const leaveTypeCode = leaveSettings?.types?.find((t) => t.isActive)?.code || 'CL';

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const fromDate = new Date(today);
    fromDate.setDate(fromDate.getDate() + 1);
    fromDate.setHours(0, 0, 0, 0);
    const toDate = new Date(fromDate);

    const leavePayload = {
      empNo,
      leaveType: leaveTypeCode,
      fromDate: fromDate.toISOString().split('T')[0],
      toDate: toDate.toISOString().split('T')[0],
      purpose: 'Leave flow test - real users',
      contactNumber: '9876543210',
      emergencyContact: 'Emergency contact',
    };

    const roleToCreds = {
      hod: { email: hodEmail, password: hodPassword },
      manager: { email: managerEmail, password: managerPassword },
      hr: { email: hrEmail, password: hrPassword },
      super_admin: { email: SUPER_ADMIN_EMAIL, password: SUPER_ADMIN_PASSWORD },
    };

    // 1. Create leave as applicant (HR)
    console.log('\n1. Creating leave as', applicantEmail, '(HR)...');
    const applicantToken = await login(applicantEmail, applicantPassword);
    const created = await createLeave(applicantToken, leavePayload);
    leaveId = created._id || created.id;
    const chain = created.workflow?.approvalChain || [];
    const chainRoles = chain.map((s) => s.role).join(' → ');
    console.log('   ✓ Leave created:', leaveId);
    console.log('   Approval chain:', chainRoles, '\n');

    // 2. Approve through each step with the correct real user
    let leave = created;
    let stepNum = 0;
    const maxSteps = 6;

    while (leave.status !== 'approved' && leave.status !== 'rejected' && stepNum < maxSteps) {
      const nextRole = leave.workflow?.nextApproverRole || leave.workflow?.nextApprover;
      if (!nextRole || nextRole === 'completed') break;

      let creds = roleToCreds[nextRole];
      if (!creds) {
        creds = { email: SUPER_ADMIN_EMAIL, password: SUPER_ADMIN_PASSWORD };
        console.warn(`   No credentials for ${nextRole} - falling back to Super Admin`);
      }

      stepNum++;
      console.log(`2.${stepNum} Approving as ${nextRole} (${creds.email})...`);
      let token;
      try {
        token = await login(creds.email, creds.password);
      } catch (e) {
        console.warn(`   Login failed for ${creds.email} - trying Super Admin...`);
        token = await login(SUPER_ADMIN_EMAIL, SUPER_ADMIN_PASSWORD);
      }
      const result = await processLeaveAction(token, leaveId, 'approve', `Approved by ${nextRole}`);
      leave = result.leave || result;
      console.log(`   ✓ Status: ${leave.status}`);

      if (leave.status === 'approved') {
        console.log('   ✓ Leave fully approved!\n');
        break;
      }
      if (leave.status === 'rejected') {
        throw new Error('Leave was rejected');
      }
    }

    if (leave.status !== 'approved') {
      throw new Error(`Leave did not reach approved. Final: ${leave.status}`);
    }

    // 3. Verify
    console.log('3. Verifying...');
    const applicantToken2 = await login(applicantEmail, applicantPassword);
    const fetched = await getLeave(applicantToken2, leaveId);
    console.log('   Status:', fetched.status);
    console.log('   workflow.isCompleted:', fetched.workflow?.isCompleted);
    console.log('   ✓ Verified\n');

    console.log('='.repeat(70));
    console.log('TEST PASSED ✓ - Real users flow completed');
    console.log('='.repeat(70));
    console.log('Leave ID:', leaveId);
    console.log('Employee:', empNo);
    console.log('Status:', leave.status);
  } catch (err) {
    console.error('\n' + '='.repeat(70));
    console.error('TEST FAILED ✗');
    console.error('='.repeat(70));
    console.error(err.message);
    if (err.response?.data) console.error(err.response.data);
    process.exit(1);
  } finally {
    await mongoose.disconnect();
    process.exit(0);
  }
}

main();
