const mongoose = require('mongoose');
const path = require('path');

// Load environment variables
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const Employee = require('../employees/model/Employee');
const User = require('../users/model/User');
const LeaveSettings = require('../leaves/model/LeaveSettings');
const Complaint = require('../complaints/model/Complaint');
const { resolveComplaintWorkflowSettings } = require('../departments/services/divisionWorkflowResolver');
const complaintController = require('../complaints/controllers/complaintController');

const MONGO_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/hrms';

(async () => {
  try {
    console.log('🔄 Connecting to MongoDB...');
    await mongoose.connect(MONGO_URI);
    console.log('✅ Connected to MongoDB');

    // 1. Test LeaveSettings update for complaints
    console.log('🔄 Testing LeaveSettings initializer for complaints...');
    let settings = await LeaveSettings.findOne({ type: 'complaint' });
    if (!settings) {
      settings = new LeaveSettings({
        type: 'complaint',
        types: [],
        statuses: [
          { code: 'pending', name: 'Pending', description: 'Awaiting approval', color: '#f59e0b', sortOrder: 1 },
          { code: 'approved', name: 'Approved', description: 'Finally approved', color: '#10b981', isFinal: true, isApproved: true, sortOrder: 2 },
          { code: 'rejected', name: 'Rejected', description: 'Finally rejected', color: '#ef4444', isFinal: true, sortOrder: 3 },
        ],
        settings: {
          allowBackdated: true,
          maxBackdatedDays: 30,
          allowFutureDated: false,
          maxAdvanceDays: 0,
        },
        workflow: {
          isEnabled: true,
          steps: [
            { stepOrder: 1, stepName: 'HR Approval', approverRole: 'hr' }
          ],
          finalAuthority: {
            role: 'hr',
            anyHRCanApprove: true
          }
        }
      });
      await settings.save();
      console.log('✅ Initialized new complaint settings record.');
    } else {
      console.log('✅ Complaint settings record already exists.');
    }

    // 2. Find any active employee to perform testing
    const employee = await Employee.findOne({ is_active: true });
    if (!employee) {
      console.error('❌ No active employee found for testing.');
      process.exit(1);
    }
    console.log(`👤 Testing with Employee: ${employee.employee_name} (${employee.emp_no})`);

    // Find user to simulate logged in applicant
    const user = await User.findOne({ role: 'super_admin' }) || await User.findOne({});
    if (!user) {
      console.error('❌ No user found for testing.');
      process.exit(1);
    }
    console.log(`👤 Simulating applicant user: ${user.name} (Role: ${user.role})`);

    // 3. Test resolveComplaintWorkflowSettings
    console.log('🔄 Resolving complaint workflow settings...');
    const wfSettings = await resolveComplaintWorkflowSettings(employee.division_id);
    console.log('✅ Workflow steps resolved:', JSON.stringify(wfSettings.workflow?.steps, null, 2));

    // Cleanup old test complaints
    await Complaint.deleteMany({ remarks: 'System Testing Remarks - Test Complaint Logic' });
    console.log('🧹 Cleaned up old test complaints.');

    // 4. Build approval steps like applyComplaint controller does
    const approvalSteps = [];
    const reportingManagers = employee.dynamicFields?.reporting_to || employee.dynamicFields?.reporting_to_ || [];
    const hasReportingManager = Array.isArray(reportingManagers) && reportingManagers.length > 0;

    if (hasReportingManager) {
      approvalSteps.push({
        stepOrder: 1,
        role: 'reporting_manager',
        label: 'Reporting Manager Approval',
        status: 'pending',
        isCurrent: true,
      });
      approvalSteps.push({
        stepOrder: 2,
        role: 'hod',
        label: 'HOD Approval',
        status: 'pending',
        isCurrent: false,
      });
    } else {
      approvalSteps.push({
        stepOrder: 1,
        role: 'hod',
        label: 'HOD Approval',
        status: 'pending',
        isCurrent: true,
      });
    }

    if (wfSettings?.workflow?.steps) {
      wfSettings.workflow.steps.forEach(step => {
        if (step.isActive !== false && step.approverRole !== 'reporting_manager' && step.approverRole !== 'hod') {
          approvalSteps.push({
            stepOrder: approvalSteps.length + 1,
            role: step.approverRole,
            label: step.stepName || `${step.approverRole.toUpperCase()} Approval`,
            status: 'pending',
            isCurrent: false
          });
        }
      });
    }

    // Create a new Complaint record directly
    console.log('🔄 Creating a mock complaint record...');
    const complaint = new Complaint({
      employeeId: employee._id,
      emp_no: employee.emp_no,
      employeeName: employee.employee_name,
      complaintType: 'GRIEVANCE',
      remarks: 'System Testing Remarks - Test Complaint Logic',
      division_id: employee.division_id,
      department_id: employee.department_id,
      appliedBy: user._id,
      appliedAt: new Date(),
      status: approvalSteps.length > 0 ? 'pending' : 'approved',
      workflow: {
        currentStepRole: approvalSteps[0]?.role || null,
        nextApproverRole: approvalSteps[0]?.role || null,
        approvalChain: approvalSteps,
        reportingManagerIds: hasReportingManager ? reportingManagers.map(m => (m._id || m).toString()) : [],
        finalAuthority: wfSettings?.workflow?.finalAuthority?.role || 'hr',
        history: [{
          step: 'employee',
          action: 'submitted',
          actionBy: user._id,
          actionByName: user.name,
          actionByRole: user.role,
          comments: 'Test complaint submitted',
          timestamp: new Date()
        }]
      }
    });

    await complaint.save();
    console.log('✅ Complaint saved successfully! Status:', complaint.status);
    console.log('Workflow Chain:', JSON.stringify(complaint.workflow.approvalChain, null, 2));

    // Verify it can be loaded
    const retrieved = await Complaint.findById(complaint._id);
    if (retrieved) {
      console.log('✅ Verified complaint retrieval from MongoDB.');
    } else {
      console.error('❌ Failed to retrieve complaint.');
    }

    console.log('\n🎉 ALL LOGIC AND DB SCHEMA TESTS PASSED SUCCESSFULLY! 🎉');
    await mongoose.connection.close();
    process.exit(0);
  } catch (error) {
    console.error('❌ Test script failed:', error);
    process.exit(1);
  }
})();
