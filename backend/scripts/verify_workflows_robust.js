const mongoose = require('mongoose');
const dotenv = require('dotenv');
const path = require('path');

// Load environment variables
dotenv.config({ path: path.join(__dirname, '../.env') });

// Import Models
const OD = require('../leaves/model/OD');
const OT = require('../overtime/model/OT');
const Permission = require('../permissions/model/Permission');
const Employee = require('../employees/model/Employee');
const User = require('../users/model/User');

// Import Controllers/Services
const odController = require('../leaves/controllers/odController');
const otService = require('../overtime/services/otService');
const permissionService = require('../permissions/services/permissionService');

async function runVerification() {
    console.log('--- Starting Robust Workflow Verification ---');

    if (!process.env.MONGODB_URI) {
        console.error('MONGODB_URI not found in env');
        process.exit(1);
    }
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to MongoDB.');

    try {
        // --- DATA SETUP ---
        console.log('\n--- Setting up Test Data ---');
        const testUser = await User.findOne({ role: 'super_admin' }); // Find an admin to act as "system" creator if needed
        if (!testUser) throw new Error('No super_admin found to create test data');

        const managerId = new mongoose.Types.ObjectId();
        const employeeId = new mongoose.Types.ObjectId();

        // Mock Objects for Testing
        const mockManagerUser = {
            _id: managerId,
            name: 'Test Manager',
            role: 'manager',
            employeeId: managerId // Link to self for simplicity
        };

        const mockHrUser = {
            _id: new mongoose.Types.ObjectId(),
            name: 'Test HR',
            role: 'hr'
        };

        console.log('Test Manager ID:', managerId);
        console.log('Test HR ID:', mockHrUser._id);

        // --- 1. OD WORKFLOW VERIFICATION ---
        console.log('\n--- 1. OD Workflow Verification ---');

        // Clean up previous test ODs
        await OD.deleteMany({ reason: 'TEST_VERIFY_ROBUST' });

        // Scenario 1.1: Manager as Intermediate Approver
        console.log('Scenario 1.1: Manager as Intermediate Approver (OD)');
        const odIntermediate = await OD.create({
            employeeId: employeeId,
            emp_no: 'TEST_EMP_01',
            fromDate: new Date(),
            toDate: new Date(),
            reason: 'TEST_VERIFY_ROBUST',
            odType: 'full_day',
            odType_extended: 'full_day',
            numberOfDays: 1,
            status: 'pending',
            workflow: {
                currentStep: 'manager',
                bt_manager_enabled: true,
                approvalChain: [
                    { role: 'manager', status: 'pending' },
                    { role: 'hr', status: 'pending' } // HR follows Manager
                ]
            },
            approvals: {
                manager: { status: 'pending' }
            }
        });

        // Mock Request/Response for Controller
        let req = {
            params: { id: odIntermediate._id },
            user: mockManagerUser,
            body: { action: 'approve', comments: 'Approved by Manager (Intermediate)' }
        };
        let res = {
            status: function (code) { this.statusCode = code; return this; },
            json: function (data) { this.data = data; return this; }
        };

        // Call Controller
        // We need to inject the logic logic. Since we modified the file, we can use it directly.
        await odController.processODAction(req, res);

        // Verify Results
        let updatedOd = await OD.findById(odIntermediate._id);
        if (updatedOd.status === 'manager_approved' && updatedOd.workflow.currentStep === 'hr') {
            console.log('✅ PASS: OD Status is "manager_approved" and currentStep moved to "hr".');
        } else {
            console.log('❌ FAIL: OD Status:', updatedOd.status, 'Current Step:', updatedOd.workflow.currentStep);
        }


        // Scenario 1.2: Manager as Final Approver
        console.log('\nScenario 1.2: Manager as Final Approver (OD)');
        const odFinal = await OD.create({
            employeeId: employeeId,
            emp_no: 'TEST_EMP_02',
            fromDate: new Date(),
            toDate: new Date(),
            reason: 'TEST_VERIFY_ROBUST',
            odType: 'full_day',
            odType_extended: 'full_day',
            numberOfDays: 1,
            status: 'pending',
            workflow: {
                currentStep: 'manager',
                bt_manager_enabled: true,
                approvalChain: [
                    { role: 'manager', status: 'pending' } // Manager is LAST
                ]
            },
            approvals: {
                manager: { status: 'pending' }
            }
        });

        req = {
            params: { id: odFinal._id },
            user: mockManagerUser,
            body: { action: 'approve', comments: 'Approved by Manager (Final)' }
        };

        await odController.processODAction(req, res);

        updatedOd = await OD.findById(odFinal._id);
        if (updatedOd.status === 'approved' && updatedOd.workflow.currentStep === 'completed') {
            console.log('✅ PASS: OD Status is "approved" and workflow completed.');
        } else {
            console.log('❌ FAIL: OD Status:', updatedOd.status, 'Current Step:', updatedOd.workflow.currentStep);
        }

        // --- 2. OT WORKFLOW VERIFICATION ---
        console.log('\n--- 2. OT Workflow Verification ---');
        // Clean up
        await OT.deleteMany({ comments: 'TEST_VERIFY_ROBUST' });

        // Create Dummy Shift needed for OT populate
        // actually we can just create OT with minimal valid IDs, the service fetches it.
        // We'll trust the DB constraints aren't too strict on foreign keys for this rapid test unless failures occur.
        // Actually OT requires active employee and shift.
        // We'll mock the OT object lookup or create a real one. creation is safer.

        // Ensure we have a valid shift and employee
        // Using existing ones would be safer but might pollute. 
        // We will mock the OT creation by directly inserting to DB then calling service approve.

        // Scenario 2.1: Manager Approves OT
        console.log('Scenario 2.1: Manager Approves OT');
        const otManager = await OT.create({
            employeeId: employeeId,
            employeeNumber: 'TEST_EMP_OT',
            date: '2025-01-01',
            shiftId: new mongoose.Types.ObjectId(), // Dummy
            employeeInTime: new Date(),
            shiftEndTime: '18:00',
            otInTime: new Date(),
            otOutTime: new Date(),
            otHours: 2,
            status: 'pending',
            requestedBy: employeeId,
            comments: 'TEST_VERIFY_ROBUST' // For cleanup
        });

        let result = await otService.approveOTRequest(otManager._id, mockManagerUser._id, 'manager');

        if (result.success) {
            const updatedOT = await OT.findById(otManager._id);
            if (updatedOT.status === 'manager_approved') {
                console.log('✅ PASS: OT Status is "manager_approved".');
            } else {
                console.log('❌ FAIL: OT Status is', updatedOT.status);
            }
        } else {
            console.log('❌ FAIL: Service call failed:', result.message);
        }

        // Scenario 2.2: HR Approves OT (Final)
        console.log('\nScenario 2.2: HR Approves OT');
        const otHr = await OT.create({
            employeeId: employeeId,
            employeeNumber: 'TEST_EMP_OT_HR',
            date: '2025-01-02',
            shiftId: new mongoose.Types.ObjectId(),
            employeeInTime: new Date(),
            shiftEndTime: '18:00',
            otInTime: new Date(),
            otOutTime: new Date(),
            otHours: 2,
            status: 'pending', // or 'manager_approved' if HR is second step
            requestedBy: employeeId,
            comments: 'TEST_VERIFY_ROBUST'
        });

        result = await otService.approveOTRequest(otHr._id, mockHrUser._id, 'hr');

        if (result.success) {
            const updatedOT = await OT.findById(otHr._id);
            if (updatedOT.status === 'approved') {
                console.log('✅ PASS: OT Status is "approved".');
            } else {
                console.log('❌ FAIL: OT Status is', updatedOT.status);
            }
        } else {
            console.log('❌ FAIL: Service call failed:', result.message);
        }

        // --- 3. PERMISSION WORKFLOW VERIFICATION ---
        console.log('\n--- 3. Permission Workflow Verification ---');
        await Permission.deleteMany({ purpose: 'TEST_VERIFY_ROBUST' });

        // Scenario 3.1: Manager Approves Permission
        console.log('Scenario 3.1: Manager Approves Permission');
        const permManager = await Permission.create({
            employeeId: employeeId,
            employeeNumber: 'TEST_EMP_PERM',
            date: new Date(),
            permissionStartTime: new Date(),
            permissionEndTime: new Date(),
            permissionHours: 1,
            purpose: 'TEST_VERIFY_ROBUST',
            status: 'pending',
            requestedBy: employeeId
        });

        result = await permissionService.approvePermissionRequest(permManager._id, mockManagerUser._id, 'http://test.com', 'manager');

        if (result.success) {
            const updatedPerm = await Permission.findById(permManager._id);
            if (updatedPerm.status === 'manager_approved') {
                console.log('✅ PASS: Permission Status is "manager_approved".');
            } else {
                console.log('❌ FAIL: Permission Status is', updatedPerm.status);
            }
        } else {
            console.log('❌ FAIL: Service call failed:', result.message);
        }

        // Scenario 3.2: HR Approves Permission
        console.log('\nScenario 3.2: HR Approves Permission');
        const permHr = await Permission.create({
            employeeId: employeeId,
            employeeNumber: 'TEST_EMP_PERM_HR',
            date: new Date(),
            permissionStartTime: new Date(),
            permissionEndTime: new Date(),
            permissionHours: 1,
            purpose: 'TEST_VERIFY_ROBUST',
            status: 'pending',
            requestedBy: employeeId
        });

        result = await permissionService.approvePermissionRequest(permHr._id, mockHrUser._id, 'http://test.com', 'hr');

        if (result.success) {
            const updatedPerm = await Permission.findById(permHr._id);
            if (updatedPerm.status === 'approved') {
                console.log('✅ PASS: Permission Status is "approved".');
            } else {
                console.log('❌ FAIL: Permission Status is', updatedPerm.status);
            }
        } else {
            console.log('❌ FAIL: Service call failed:', result.message);
        }

        // Cleanup
        await OD.deleteMany({ reason: 'TEST_VERIFY_ROBUST' });
        await OT.deleteMany({ comments: 'TEST_VERIFY_ROBUST' });
        await Permission.deleteMany({ purpose: 'TEST_VERIFY_ROBUST' });

        console.log('\n--- Verification Completed ---');

    } catch (error) {
        console.error('Verification Fatal Error:', error);
    } finally {
        await mongoose.disconnect();
    }
}

runVerification();
