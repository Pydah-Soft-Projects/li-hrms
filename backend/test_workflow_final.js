const mongoose = require('mongoose');
const path = require('path');

// Models
const Employee = require('./employees/model/Employee');
const User = require('./users/model/User');
const Leave = require('./leaves/model/Leave');
const OD = require('./leaves/model/OD');
const CCLRequest = require('./leaves/model/CCLRequest');
const Division = require('./departments/model/Division');
const Department = require('./departments/model/Department');
const Designation = require('./departments/model/Designation');
const LeaveSettings = require('./leaves/model/LeaveSettings');

const leaveController = require('./leaves/controllers/leaveController');
const odController = require('./leaves/controllers/odController');
const cclController = require('./leaves/controllers/cclController');

async function runTest() {
    try {
        await mongoose.connect('mongodb://localhost:27017/hrms');
        console.log('Connected to MongoDB');

        // Sequential Cleanup to avoid race conditions
        console.log('Cleaning up...');
        await Employee.deleteMany({ emp_no: { $in: ['TEST_MGR', 'TEST_EMP'] } });
        await User.deleteMany({ email: { $in: ['manager@test.com', 'employee@test.com', 'hod@test.com'] } });
        await Leave.deleteMany({ emp_no: 'TEST_EMP' });
        await OD.deleteMany({ emp_no: 'TEST_EMP' });
        await CCLRequest.deleteMany({ emp_no: 'TEST_EMP' });
        await Designation.deleteMany({ name: 'Test Designation' });
        await Department.deleteMany({ code: 'TESTD' });
        await Division.deleteMany({ code: 'TESTV' });

        // Setup
        let division = await Division.create({ name: 'Test Division', code: 'TESTV', isActive: true });
        let department = await Department.create({ name: 'Test Dept', code: 'TESTD', divisions: [division._id], isActive: true });
        let designation = await Designation.create({ name: 'Test Designation', code: 'TESTDS', department: department._id, isActive: true });

        // Ensure LeaveSettings exist
        await LeaveSettings.updateOne({ type: 'leave' }, {
            $set: {
                isActive: true,
                types: [{ name: 'Casual Leave', code: 'CL', isPaid: true, isActive: true, nature: 'paid' }],
                workflow: { steps: [], finalAuthority: { role: 'hr' } },
                settings: { attendanceConflictCheck: false }
            }
        }, { upsert: true });

        // Create Users
        const managerEmp = await Employee.create({ emp_no: 'TEST_MGR', employee_name: 'Test Manager', division_id: division._id, department_id: department._id, designation_id: designation._id, isActive: true });
        const managerUser = await User.create({ email: 'manager@test.com', name: 'Test Manager', role: 'manager', employeeId: 'TEST_MGR', employeeRef: managerEmp._id, password: 'Password@123', isActive: true });

        const workerEmp = await Employee.create({
            emp_no: 'TEST_EMP',
            employee_name: 'Test Worker',
            division_id: division._id,
            department_id: department._id,
            designation_id: designation._id,
            dynamicFields: { reporting_to: [managerUser._id] },
            isActive: true
        });
        const workerUser = await User.create({ email: 'employee@test.com', name: 'Test Worker', role: 'employee', employeeId: 'TEST_EMP', employeeRef: workerEmp._id, password: 'Password@123', isActive: true });

        const res = { status: (code) => ({ json: (data) => { return data; } }) };

        console.log('--- TEST RESULTS ---');
        // 1. Leave Prioritization
        await leaveController.applyLeave({ user: workerUser, body: { leaveType: 'Casual Leave', fromDate: '2026-02-10', toDate: '2026-02-10', purpose: 'test' } }, res);
        let leave = await Leave.findOne({ emp_no: 'TEST_EMP' });
        if (leave.workflow.approvalChain[0].role === 'reporting_manager') console.log('✅ Leave Prioritization: SUCCESS');

        // 2. Leave Fallback
        await Employee.updateOne({ _id: workerEmp._id }, { $set: { 'dynamicFields.reporting_to': [] } });
        await Leave.deleteMany({ emp_no: 'TEST_EMP' });
        await leaveController.applyLeave({ user: workerUser, body: { leaveType: 'Casual Leave', fromDate: '2026-02-11', toDate: '2026-02-11', purpose: 'test' } }, res);
        leave = await Leave.findOne({ emp_no: 'TEST_EMP' });
        if (leave.workflow.approvalChain[0].role === 'hod') console.log('✅ Leave Fallback (HOD): SUCCESS');

        // 3. OD Prioritization
        await Employee.updateOne({ _id: workerEmp._id }, { $set: { 'dynamicFields.reporting_to': [managerUser._id] } });
        await odController.applyOD({ user: workerUser, body: { odType: 'official', fromDate: '2026-02-12', toDate: '2026-02-12', purpose: 'test' } }, res);
        let od = await OD.findOne({ emp_no: 'TEST_EMP' });
        if (od.workflow.approvalChain[0].role === 'reporting_manager') console.log('✅ OD Prioritization: SUCCESS');

        // 4. CCL Prioritization
        await cclController.applyCCL({ user: workerUser, body: { date: '2026-02-08', reason: 'Sunday work' } }, res);
        let ccl = await CCLRequest.findOne({ emp_no: 'TEST_EMP' });
        if (ccl.workflow.approvalChain[0].role === 'reporting_manager') console.log('✅ CCL Prioritization: SUCCESS');

        console.log('Verification Complete.');
        process.exit(0);
    } catch (error) {
        console.error('Unexpected Error:', error);
        process.exit(1);
    }
}

runTest();
