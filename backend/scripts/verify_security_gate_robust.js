const mongoose = require('mongoose');
const dotenv = require('dotenv');
const path = require('path');
const crypto = require('crypto');

// Load environment variables
dotenv.config({ path: path.join(__dirname, '../.env') });

// Import Models
const Permission = require('../permissions/model/Permission');
const Employee = require('../employees/model/Employee');
const User = require('../users/model/User');

// Import Controllers (to call directly or mock req/res)
const securityController = require('../security/controllers/securityController');
const permissionService = require('../permissions/services/permissionService');

// Mock Request/Response Helper
const createMockReqRes = (user, params, body) => {
    const req = {
        user,
        params,
        body
    };
    const res = {
        statusCode: 200,
        jsonData: null,
        status: function (code) {
            this.statusCode = code;
            return this;
        },
        json: function (data) {
            this.jsonData = data;
            return this;
        }
    };
    return { req, res };
};

const fs = require('fs');
function log(msg) {
    console.log(msg);
    fs.appendFileSync('security_test_output.txt', msg + '\\n');
}

async function runVerification() {
    fs.writeFileSync('security_test_output.txt', '--- Starting Robust Security Gate Verification ---\\n');
    log('--- Starting Robust Security Gate Verification ---');

    // Replace all console.log with log() in the function body...
    // Actually, simpler to just replace the function body logic to use log.
    // Since I cannot do global replace easily with this tool without full file write,
    // I will just wrap the main logic or use a helper to override console.log.

    // Override console.log
    const originalLog = console.log;
    console.log = function (...args) {
        const msg = args.map(a => (typeof a === 'object' ? JSON.stringify(a) : a)).join(' ');
        fs.appendFileSync('security_test_output.txt', msg + '\\n');
        originalLog.apply(console, args);
    };

    if (!process.env.MONGODB_URI) {
        console.error('MONGODB_URI not found in env');
        process.exit(1);
    }
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to MongoDB.');

    // --- Setup Data ---
    // Create an Employee first (required for Permission populate)
    const employeeDoc = new Employee({
        emp_no: 'TEST_EMP_001',
        employee_name: 'Test Employee for Security',
        email: 'test_sec_emp@example.com',
        is_active: true
    });

    // Remove if exists
    await Employee.deleteOne({ emp_no: 'TEST_EMP_001' });
    const savedEmployeeDoc = await employeeDoc.save();
    log(`Created Employee Doc: "${savedEmployeeDoc._id}"`);

    // Create a User linked to this employee (for login simulation)
    const employeeUserDoc = new User({
        name: 'Test Employee User',
        email: 'test_security_emp@example.com',
        password: 'password123',
        role: 'employee',
        employeeRef: savedEmployeeDoc._id
    });
    await User.deleteOne({ email: 'test_security_emp@example.com' });
    const savedEmployeeUserDoc = await employeeUserDoc.save();
    log(`Created Employee User Doc: "${savedEmployeeUserDoc._id}"`);

    // Security Gate Verification Logic
    try {
        // --- DATA SETUP ---
        const testEmployeeId = savedEmployeeDoc._id; // Use the newly created employee's ID

        // Users
        const employeeUser = {
            _id: savedEmployeeUserDoc._id, // Use the newly created user's ID
            role: 'employee',
            employeeId: testEmployeeId,
            name: 'Test Employee'
        };

        const otherEmployeeUser = {
            _id: new mongoose.Types.ObjectId(),
            role: 'employee',
            employeeId: new mongoose.Types.ObjectId(), // Different employee
            name: 'Hacker Employee'
        };

        const securityUser = {
            _id: new mongoose.Types.ObjectId(),
            role: 'security',
            name: 'Security Guard'
        };

        const hrUser = {
            _id: new mongoose.Types.ObjectId(),
            role: 'hr',
            name: 'HR Admin'
        };

        console.log('\n--- Setup ---');
        console.log('Employee User ID:', employeeUser._id);
        console.log('Security User ID:', securityUser._id);

        // 1. Create & Approve Permission
        console.log('\n--- Scenario 1: Permission Setup ---');
        await Permission.deleteMany({ purpose: 'SECURITY_TEST_PERM' });

        const perm = new Permission({
            employeeId: savedEmployeeDoc._id, // Must be Employee ID, not User ID
            requestedBy: employeeUser._id,
            employeeNumber: 'SEC_001',
            date: new Date().toISOString().split('T')[0],
            permissionStartTime: new Date(),
            permissionEndTime: new Date(new Date().getTime() + 2 * 60 * 60 * 1000), // 2 hours later
            permissionHours: 2,
            purpose: 'SECURITY_TEST_PERM',
            status: 'approved',
            approvalChain: [],
            approvals: {
                manager: { status: 'approved', approvedBy: securityUser._id, approvedAt: new Date() }
            }
        });

        // Approve it (mocking service call or direct DB update)
        await perm.save();
        console.log('✅ Created Approved Permission:', perm._id);


        // 2. Unauthorized QR Generation
        console.log('\n--- Scenario 2: Unauthorized QR Generation ---');
        const { req: reqAuthFail, res: resAuthFail } = createMockReqRes(otherEmployeeUser, { id: perm._id });
        await securityController.generateGateOutQR(reqAuthFail, resAuthFail);

        if (resAuthFail.statusCode === 403) {
            console.log('✅ PASS: Unauthorized user blocked from generating QR.');
        } else {
            console.log('❌ FAIL: Unauthorized user allowed. Status:', resAuthFail.statusCode);
        }

        // 3. Valid Gate OUT Generation
        console.log('\n--- Scenario 3: Valid Gate OUT Generation ---');
        const { req: reqOut, res: resOut } = createMockReqRes(employeeUser, { id: perm._id });
        await securityController.generateGateOutQR(reqOut, resOut);

        let outSecret = '';
        if (resOut.statusCode === 200 && resOut.jsonData.success) {
            outSecret = resOut.jsonData.qrSecret;
            console.log('✅ PASS: Gate OUT QR Generated. Secret:', outSecret.substring(0, 15) + '...');
        } else {
            console.log('❌ FAIL: Failed to generate OUT QR.', resOut.jsonData);
            return;
        }

        // 4. Gate OUT Verification (Security Scan)
        console.log('\n--- Scenario 4: Gate OUT Verification (Security Scan) ---');
        const { req: reqVerifyOut, res: resVerifyOut } = createMockReqRes(securityUser, {}, { qrSecret: outSecret });
        await securityController.verifyGatePass(reqVerifyOut, resVerifyOut);

        if (resVerifyOut.statusCode === 200 && resVerifyOut.jsonData.success) {
            console.log('✅ PASS: Gate OUT Verified successfully.');
        } else {
            console.log('❌ FAIL: Verification failed.', resVerifyOut.jsonData);
        }

        // 5. Duplicate Outs (Double Scan)
        console.log('\n--- Scenario 5: Duplicate Gate OUT Scan ---');
        await securityController.verifyGatePass(reqVerifyOut, resVerifyOut); // Reuse same request
        if (resVerifyOut.statusCode === 400 && resVerifyOut.jsonData.message.includes('already verified')) {
            console.log('✅ PASS: Double scan blocked.');
        } else {
            console.log('❌ FAIL: Double scan not blocked correctly. Status:', resVerifyOut.statusCode, resVerifyOut.jsonData);
        }


        // 6. Premature Gate IN (Time Buffer Check)
        console.log('\n--- Scenario 6: Premature Gate IN (Buffer Check) ---');
        const { req: reqInTooSoon, res: resInTooSoon } = createMockReqRes(employeeUser, { id: perm._id });
        await securityController.generateGateInQR(reqInTooSoon, resInTooSoon);

        if (resInTooSoon.statusCode === 400 && resInTooSoon.jsonData.waitTime) {
            console.log('✅ PASS: Premature Gate IN blocked. Wait time:', resInTooSoon.jsonData.waitTime, 'mins');
        } else {
            console.log('❌ FAIL: Premature Gate IN allowed or wrong error.', resInTooSoon.jsonData);
        }

        // 7. Valid Gate IN Generation (Mocking Time)
        console.log('\n--- Scenario 7: Valid Gate IN Generation ---');
        // Hack: Manually backdate the gateOutTime in DB to > 5 mins ago
        const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000);
        await Permission.findByIdAndUpdate(perm._id, { gateOutTime: tenMinutesAgo });
        console.log('(Mocking time passing...)');

        const { req: reqIn, res: resIn } = createMockReqRes(employeeUser, { id: perm._id });
        await securityController.generateGateInQR(reqIn, resIn);

        let inSecret = '';
        if (resIn.statusCode === 200 && resIn.jsonData.success) {
            inSecret = resIn.jsonData.qrSecret;
            console.log('✅ PASS: Gate IN QR Generated. Secret:', inSecret.substring(0, 15) + '...');
        } else {
            console.log('❌ FAIL: Gate IN Generation failed.', resIn.jsonData);
            return;
        }

        // 8. Gate IN Verification
        console.log('\n--- Scenario 8: Gate IN Verification ---');
        const { req: reqVerifyIn, res: resVerifyIn } = createMockReqRes(securityUser, {}, { qrSecret: inSecret });
        await securityController.verifyGatePass(reqVerifyIn, resVerifyIn);

        if (resVerifyIn.statusCode === 200 && resVerifyIn.jsonData.success) {
            console.log('✅ PASS: Gate IN Verified successfully.');
        } else {
            console.log('❌ FAIL: Gate IN Verification failed.', resVerifyIn.jsonData);
        }

        // 9. Final State Check
        const finalPerm = await Permission.findById(perm._id);
        console.log('\nTerminiating Check:');
        console.log(`Gate Out Time: ${finalPerm.gateOutTime}`);
        console.log(`Gate In Time: ${finalPerm.gateInTime}`);
        if (finalPerm.gateOutTime && finalPerm.gateInTime) {
            console.log('✅ PASS: Full Cycle Completed.');
        }

        // Cleanup
        await Permission.deleteMany({ purpose: 'SECURITY_TEST_PERM' });

    } catch (error) {
        console.error('Verification Fatal Error:', error);
    } finally {
        await mongoose.disconnect();
    }
}

runVerification();
