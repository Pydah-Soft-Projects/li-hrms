const mongoose = require('mongoose');
const path = require('path');

// Models
const Employee = require('./employees/model/Employee');
const User = require('./users/model/User');
const Leave = require('./leaves/model/Leave');
const Division = require('./departments/model/Division');
const Department = require('./departments/model/Department');
const Designation = require('./departments/model/Designation');
const LeaveSettings = require('./leaves/model/LeaveSettings');

const leaveController = require('./leaves/controllers/leaveController');

async function runTest() {
    try {
        await mongoose.connect('mongodb://localhost:27017/hrms');
        console.log('Connected to MongoDB');

        // 1. Cleanup
        console.log('Cleaning up old test data...');
        await Promise.all([
            Employee.deleteMany({ emp_no: { $in: ['TEST_MGR', 'TEST_EMP'] } }),
            User.deleteMany({ email: { $in: ['manager@test.com', 'employee@test.com'] } }),
            Leave.deleteMany({ emp_no: 'TEST_EMP' }),
            Division.deleteMany({ code: 'TESTV' }),
            Department.deleteMany({ code: 'TESTD' }),
            Designation.deleteMany({ name: 'Test Designation' })
        ]).catch(e => console.log('Cleanup error (ignored):', e.message));

        // 2. Setup
        let division = await Division.create({ name: 'Test Division', code: 'TESTV', isActive: true });
        let department = await Department.create({ name: 'Test Dept', code: 'TESTD', divisions: [division._id], isActive: true });
        let designation = await Designation.create({ name: 'Test Designation', code: 'TESTDS', department: department._id, isActive: true });

        let settings = await LeaveSettings.findOne({ type: 'leave' });
        if (!settings) {
            settings = await LeaveSettings.create({
                type: 'leave',
                isActive: true,
                types: [{ name: 'Casual Leave', code: 'CL', isPaid: true, isActive: true, nature: 'paid' }],
                workflow: { steps: [], finalAuthority: { role: 'hr' } },
                settings: { attendanceConflictCheck: false }
            });
        }

        // 3. Create Users
        const managerEmp = await Employee.create({
            emp_no: 'TEST_MGR',
            employee_name: 'Test Manager',
            division_id: division._id,
            department_id: department._id,
            designation_id: designation._id,
            isActive: true
        });
        const managerUser = await User.create({
            email: 'manager@test.com',
            name: 'Test Manager',
            role: 'manager',
            employeeId: 'TEST_MGR',
            employeeRef: managerEmp._id,
            password: 'Password@123',
            isActive: true
        });

        const workerEmp = await Employee.create({
            emp_no: 'TEST_EMP',
            employee_name: 'Test Worker',
            division_id: division._id,
            department_id: department._id,
            designation_id: designation._id,
            dynamicFields: { reporting_to: [managerUser._id] },
            isActive: true
        });
        const workerUser = await User.create({
            email: 'employee@test.com',
            name: 'Test Worker',
            role: 'employee',
            employeeId: 'TEST_EMP',
            employeeRef: workerEmp._id,
            password: 'Password@123',
            isActive: true
        });

        console.log('--- TEST 1: Applying Leave with Reporting Manager ---');
        const req = {
            user: {
                _id: workerUser._id,
                role: 'employee',
                name: 'Test Worker',
                employeeId: 'TEST_EMP',
                employeeRef: workerEmp._id
            },
            body: {
                leaveType: 'Casual Leave',
                fromDate: new Date().toISOString().split('T')[0],
                toDate: new Date().toISOString().split('T')[0],
                purpose: 'Testing prioritization',
                contactNumber: '1234567890'
            }
        };
        const res = {
            status: (code) => ({
                json: (data) => {
                    console.log(`Response Code: ${code}`);
                    if (!data.success) console.error('ApplyLeave Error:', data.error);
                    return data;
                }
            })
        };

        await leaveController.applyLeave(req, res);

        const leave = await Leave.findOne({ emp_no: 'TEST_EMP' });
        if (leave) {
            console.log('✅ SUCCESS: Leave created');
            console.log('First Step Role:', leave.workflow.approvalChain[0].role);
            console.log('Reporting Manager IDs:', leave.workflow.reportingManagerIds);

            if (leave.workflow.approvalChain[0].role === 'reporting_manager' && leave.workflow.reportingManagerIds.includes(managerUser._id.toString())) {
                console.log('✅ SUCCESS: Prioritization works!');
            } else {
                console.error('❌ FAILURE: Prioritization logic failed');
            }
        }

        console.log('--- TEST 2: Processing Approval as Reporting Manager ---');
        if (leave) {
            const reqApprove = {
                user: {
                    _id: managerUser._id,
                    role: 'manager',
                    name: 'Test Manager',
                    employeeId: 'TEST_MGR',
                    employeeRef: managerEmp._id
                },
                params: { id: leave._id },
                body: { action: 'approve', comments: 'Approved by manager' }
            };
            await leaveController.processLeaveAction(reqApprove, res);
            const approvedLeave = await Leave.findById(leave._id);
            console.log('Updated Status:', approvedLeave.status);
            if (approvedLeave.status === 'reporting_manager_approved') {
                console.log('✅ SUCCESS: Status updated correctly');
            } else {
                console.error('❌ FAILURE: Status incorrect');
            }
        }

        process.exit(0);
    } catch (error) {
        console.error('Unexpected Error:', error);
        process.exit(1);
    }
}

runTest();
