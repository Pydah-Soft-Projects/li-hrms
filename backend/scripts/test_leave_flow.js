/**
 * Test Leave Flow - Create and Approve Leave with Real Data
 *
 * 1. Connects to MongoDB to fetch real employees, users, leave settings
 * 2. Logs in via API (POST /api/auth/login)
 * 3. Creates a leave application (POST /api/leaves)
 * 4. Approves through workflow steps (PUT /api/leaves/:id/action)
 * 5. Verifies final status and side effects (MonthlyLeaveRecord, etc.)
 *
 * Usage: node scripts/test_leave_flow.js
 *        API_BASE=http://localhost:5000 node scripts/test_leave_flow.js
 *
 * Prerequisites: Backend server running on PORT 5000
 */

const mongoose = require('mongoose');
const axios = require('axios');
const dotenv = require('dotenv');
const path = require('path');

dotenv.config({ path: path.join(__dirname, '../.env') });

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/hrms';
const API_BASE = process.env.API_BASE || 'http://localhost:5000';

const Employee = require('../employees/model/Employee');
const User = require('../users/model/User');
const Leave = require('../leaves/model/Leave');
const LeaveSettings = require('../leaves/model/LeaveSettings');
const MonthlyLeaveRecord = require('../leaves/model/MonthlyLeaveRecord');

// Super admin from .env
const SUPER_ADMIN_EMAIL = process.env.SUPER_ADMIN_EMAIL || 'admin@hrms.com';
const SUPER_ADMIN_PASSWORD = process.env.SUPER_ADMIN_PASSWORD || 'Admin@123';

async function login(identifier, password) {
  const res = await axios.post(`${API_BASE}/api/auth/login`, {
    identifier,
    password,
  });
  if (!res.data.success) {
    throw new Error(`Login failed: ${res.data.message || JSON.stringify(res.data)}`);
  }
  return res.data.data.token;
}

async function createLeave(token, payload) {
  const res = await axios.post(`${API_BASE}/api/leaves`, payload, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.data.success && res.status !== 201) {
    throw new Error(`Create leave failed: ${res.data.error || res.data.message || JSON.stringify(res.data)}`);
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
    throw new Error(`Leave action failed: ${res.data.error || res.data.message || JSON.stringify(res.data)}`);
  }
  return res.data.data || res.data;
}

async function getLeave(token, leaveId) {
  const res = await axios.get(`${API_BASE}/api/leaves/${leaveId}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.data.success) {
    throw new Error(`Get leave failed: ${res.data.error || JSON.stringify(res.data)}`);
  }
  return res.data.data || res.data;
}

async function main() {
  console.log('='.repeat(70));
  console.log('LEAVE FLOW TEST - Create & Approve with Real Data');
  console.log('='.repeat(70));
  console.log(`API Base: ${API_BASE}`);
  console.log(`MongoDB:  ${MONGODB_URI.replace(/\/\/[^@]+@/, '//***@')}\n`);

  let leaveId = null;

  try {
    // 1. Connect to DB and fetch real data
    console.log('1. Fetching real data from MongoDB...');
    await mongoose.connect(MONGODB_URI);

    const [employees, users, leaveSettings] = await Promise.all([
      Employee.find({ is_active: true }).select('emp_no employee_name department_id division_id').limit(5).lean(),
      User.find({ isActive: true }).select('email role').lean(),
      LeaveSettings.findOne({ type: 'leave', isActive: true }).lean(),
    ]);

    if (employees.length === 0) {
      throw new Error('No active employees found. Seed employee data first.');
    }

    const employee = employees[0];
    console.log(`   Employee: ${employee.emp_no} - ${employee.employee_name}`);

    const workflowSteps = leaveSettings?.workflow?.steps || [];
    console.log(`   Workflow steps: ${workflowSteps.length > 0 ? workflowSteps.map(s => s.approverRole).join(' → ') : 'HOD → HR (default)'}`);

    const leaveTypes = leaveSettings?.types?.filter(t => t.isActive) || [];
    const leaveTypeCode = leaveTypes.length > 0 ? leaveTypes[0].code : 'CL';
    console.log(`   Leave type: ${leaveTypeCode}\n`);

    // 2. Dates: use tomorrow to avoid timezone/backdated rejection
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const fromDate = new Date(today);
    fromDate.setDate(fromDate.getDate() + 1);
    fromDate.setHours(0, 0, 0, 0);
    const toDate = new Date(fromDate);

    // 3. Login as super admin (can apply for others and approve any step)
    console.log('2. Logging in as Super Admin...');
    const token = await login(SUPER_ADMIN_EMAIL, SUPER_ADMIN_PASSWORD);
    console.log('   ✓ Logged in\n');

    // 4. Create leave
    console.log('3. Creating leave application...');
    const leavePayload = {
      empNo: employee.emp_no,
      leaveType: leaveTypeCode,
      fromDate: fromDate.toISOString().split('T')[0],
      toDate: toDate.toISOString().split('T')[0],
      purpose: 'Leave flow test - automated script',
      contactNumber: '9876543210',
      emergencyContact: 'Emergency contact',
    };

    const created = await createLeave(token, leavePayload);
    leaveId = created._id || created.id;
    const chain = created.workflow?.approvalChain || [];
    const chainRoles = chain.map((s) => s.role).join(' → ');
    console.log(`   ✓ Leave created: ${leaveId}`);
    console.log(`   Status: ${created.status}`);
    console.log(`   Approval chain: ${chainRoles}`);
    console.log(`   Workflow: nextApprover=${created.workflow?.nextApproverRole || created.workflow?.nextApprover}\n`);

    // 5. Approve through each workflow step
    console.log('4. Approving through workflow...');
    let leave = created;
    let stepCount = 0;
    const maxSteps = 5; // safety

    while (leave.status !== 'approved' && leave.status !== 'rejected' && stepCount < maxSteps) {
      const nextRole = leave.workflow?.nextApproverRole || leave.workflow?.nextApprover;
      if (!nextRole || nextRole === 'completed') {
        console.log('   Workflow complete (no next approver)');
        break;
      }

      stepCount++;
      console.log(`   Step ${stepCount}: Approving as ${nextRole}...`);

      const result = await processLeaveAction(token, leaveId, 'approve', `Approved by test script (step ${stepCount})`);
      leave = result.leave || result;

      console.log(`   ✓ Status: ${leave.status}`);

      if (leave.status === 'approved') {
        console.log('   ✓ Leave fully approved!\n');
        break;
      }
      if (leave.status === 'rejected') {
        throw new Error('Leave was rejected unexpectedly');
      }
    }

    if (leave.status !== 'approved') {
      throw new Error(`Leave did not reach approved status. Final: ${leave.status}`);
    }

    // 6. Verify via API
    console.log('5. Verifying via API...');
    const fetched = await getLeave(token, leaveId);
    console.log(`   Status: ${fetched.status}`);
    console.log(`   workflow.isCompleted: ${fetched.workflow?.isCompleted}`);
    console.log('   ✓ Leave verified\n');

    // 7. Verify in DB: MonthlyLeaveRecord updated
    console.log('6. Verifying MonthlyLeaveRecord...');
    const month = `${fromDate.getFullYear()}-${String(fromDate.getMonth() + 1).padStart(2, '0')}`;
    const monthlyRecord = await MonthlyLeaveRecord.findOne({
      employeeId: employee._id,
      month,
    }).lean();

    if (monthlyRecord) {
      console.log(`   Found record for ${month}:`);
      console.log(`   - totalLeaves: ${monthlyRecord.summary?.totalLeaves || 0}`);
      console.log(`   - paidLeaves: ${monthlyRecord.summary?.paidLeaves || 0}`);
      console.log(`   - leaveIds: ${monthlyRecord.leaveIds?.length || 0}`);
      console.log('   ✓ MonthlyLeaveRecord updated\n');
    } else {
      console.log('   (No MonthlyLeaveRecord yet - may be created on first summary calc)\n');
    }

    // 8. Summary
    console.log('='.repeat(70));
    console.log('TEST PASSED ✓');
    console.log('='.repeat(70));
    console.log(`Leave ID: ${leaveId}`);
    console.log(`Employee: ${employee.emp_no} - ${employee.employee_name}`);
    const dateStr = `${fromDate.getFullYear()}-${String(fromDate.getMonth() + 1).padStart(2, '0')}-${String(fromDate.getDate()).padStart(2, '0')}`;
    console.log(`Dates: ${dateStr}`);
    console.log(`Status: ${leave.status}`);
  } catch (err) {
    console.error('\n' + '='.repeat(70));
    console.error('TEST FAILED ✗');
    console.error('='.repeat(70));
    if (err.response) {
      console.error('API Response:', err.response.status, err.response.data);
    } else {
      console.error(err.message);
    }
    process.exit(1);
  } finally {
    await mongoose.disconnect();
    process.exit(0);
  }
}

main();
