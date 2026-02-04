/**
 * Real-Time Multi-Shift Test with Actual Employee Data
 * Simulates biometric punches for real employees with real shift assignments
 */

const axios = require('axios');
const mongoose = require('mongoose');
const Employee = require('../employees/model/Employee');
const PreScheduledShift = require('../shifts/model/PreScheduledShift');
const AttendanceDaily = require('../attendance/model/AttendanceDaily');

// Configuration
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/li-hrms';
const API_BASE_URL = 'http://localhost:5000'; // Your backend URL
const SYSTEM_KEY = 'hrms-microservice-secret-key-999'; // From realtimeLogController
const AUTH_TOKEN = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiI2OTI1OTE1MmMxMmVhYWJhZWU1Y2MwMzIiLCJpYXQiOjE3NjkyNDM3MDksImV4cCI6MTc2OTg0ODUwOX0.Ck1Ke872QLWVuYxgknOMyKfvadoVMBEruDeqBRgdQIc';

// Colors for console
const colors = {
    reset: '\x1b[0m',
    bright: '\x1b[1m',
    green: '\x1b[32m',
    red: '\x1b[31m',
    yellow: '\x1b[33m',
    blue: '\x1b[34m',
    cyan: '\x1b[36m',
    magenta: '\x1b[35m',
};

function log(message, color = 'reset') {
    console.log(`${colors[color]}${message}${colors.reset}`);
}

function logSection(title) {
    console.log('\n' + '='.repeat(70));
    log(title, 'bright');
    console.log('='.repeat(70));
}

function logSuccess(message) {
    log(`✅ ${message}`, 'green');
}

function logError(message) {
    log(`❌ ${message}`, 'red');
}

function logInfo(message) {
    log(`ℹ️  ${message}`, 'blue');
}

function logWarning(message) {
    log(`⚠️  ${message}`, 'yellow');
}

/**
 * Find a real employee with shift assignment
 */
async function findTestEmployee() {
    logInfo('Searching for employee with shift assignment...');

    // Find an active employee
    const employee = await Employee.findOne({
        is_active: { $ne: false }
    }).select('emp_no employee_name department_id designation_id').limit(1);

    if (!employee) {
        throw new Error('No active employees found in database');
    }

    logSuccess(`Found employee: ${employee.employee_name} (${employee.emp_no})`);

    return employee;
}

/**
 * Get shift assignment for employee on a date
 */
async function getShiftAssignment(empNo, date) {
    logInfo(`Checking shift assignment for ${date}...`);

    const assignment = await PreScheduledShift.findOne({
        emp_no: empNo,
        date: date,
    }).populate('shiftId');

    if (assignment && assignment.shiftId) {
        logSuccess(`Shift assigned: ${assignment.shiftId.name}`);
        logInfo(`  Start: ${assignment.shiftId.startTime}`);
        logInfo(`  End: ${assignment.shiftId.endTime}`);
        logInfo(`  Duration: ${assignment.shiftId.duration} hours`);
        return assignment.shiftId;
    } else {
        logWarning('No shift assignment found for this date');
        return null;
    }
}

/**
 * Send biometric punch to real-time API
 */
async function sendBiometricPunch(employeeId, timestamp, logType) {
    const payload = [{
        employeeId: employeeId,
        timestamp: timestamp.toISOString(),
        logType: logType,
        deviceId: 'TEST-DEVICE-001',
        deviceName: 'Test Device',
    }];

    try {
        const response = await axios.post(
            `${API_BASE_URL}/api/attendance/internal/sync`,
            payload,
            {
                headers: {
                    'x-system-key': SYSTEM_KEY,
                    'Authorization': `Bearer ${AUTH_TOKEN}`,
                    'Content-Type': 'application/json',
                },
            }
        );

        if (response.data.success) {
            logSuccess(`${logType} punch sent: ${timestamp.toLocaleTimeString()}`);
            return true;
        } else {
            logError(`Failed to send punch: ${response.data.message}`);
            return false;
        }
    } catch (error) {
        logError(`API Error: ${error.message}`);
        if (error.response) {
            logError(`Response: ${JSON.stringify(error.response.data)}`);
        }
        return false;
    }
}

/**
 * Wait for processing
 */
async function wait(ms, message) {
    if (message) {
        logInfo(message);
    }
    return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Check attendance record
 */
async function checkAttendanceRecord(empNo, date) {
    const record = await AttendanceDaily.findOne({
        employeeNumber: empNo,
        date: date,
    }).lean();

    if (!record) {
        logWarning('No attendance record found yet');
        return null;
    }

    logSuccess('Attendance record found!');
    console.log('\n📊 Record Details:');
    console.log(`  Status: ${record.status}`);
    console.log(`  Total Shifts: ${record.totalShifts || 0}`);
    console.log(`  Total Working Hours: ${record.totalWorkingHours?.toFixed(2) || 0}`);
    console.log(`  Total OT Hours: ${record.totalOTHours?.toFixed(2) || 0}`);

    if (record.shifts && record.shifts.length > 0) {
        console.log('\n  Shifts:');
        record.shifts.forEach((shift, index) => {
            console.log(`\n    Shift ${shift.shiftNumber}:`);
            console.log(`      IN:  ${new Date(shift.inTime).toLocaleTimeString()}`);
            console.log(`      OUT: ${shift.outTime ? new Date(shift.outTime).toLocaleTimeString() : 'INCOMPLETE'}`);
            console.log(`      Hours: ${shift.workingHours?.toFixed(2) || 0}`);
            console.log(`      OT: ${shift.otHours?.toFixed(2) || 0}`);
            console.log(`      Status: ${shift.status}`);
            if (shift.shiftName) {
                console.log(`      Shift Name: ${shift.shiftName}`);
            }
        });
    }

    return record;
}

/**
 * Test Scenario: Double Shift
 */
async function testDoubleShift(employee, date) {
    logSection('TEST: DOUBLE SHIFT WITH REAL EMPLOYEE');

    const empNo = employee.emp_no;
    const baseDate = new Date(date);

    // Shift 1: Morning (8 AM - 4 PM)
    logInfo('\n📍 Simulating Shift 1 (Morning)...');

    const shift1In = new Date(baseDate);
    shift1In.setHours(8, 0, 0, 0);
    await sendBiometricPunch(empNo, shift1In, 'CHECK-IN');
    await wait(1000, 'Processing...');

    const shift1Out = new Date(baseDate);
    shift1Out.setHours(16, 0, 0, 0);
    await sendBiometricPunch(empNo, shift1Out, 'CHECK-OUT');
    await wait(2000, 'Processing shift 1...');

    // Check record after shift 1
    logInfo('\n🔍 Checking attendance after Shift 1...');
    await checkAttendanceRecord(empNo, date);

    // Shift 2: Evening (6 PM - 10 PM)
    logInfo('\n📍 Simulating Shift 2 (Evening)...');

    const shift2In = new Date(baseDate);
    shift2In.setHours(18, 0, 0, 0);
    await sendBiometricPunch(empNo, shift2In, 'CHECK-IN');
    await wait(1000, 'Processing...');

    const shift2Out = new Date(baseDate);
    shift2Out.setHours(22, 0, 0, 0);
    await sendBiometricPunch(empNo, shift2Out, 'CHECK-OUT');
    await wait(2000, 'Processing shift 2...');

    // Final check
    logInfo('\n🔍 Final Attendance Record:');
    const finalRecord = await checkAttendanceRecord(empNo, date);

    // Verify
    if (finalRecord) {
        console.log('\n✨ Verification:');
        if (finalRecord.totalShifts === 2) {
            logSuccess('✓ Expected 2 shifts, got 2');
        } else {
            logError(`✗ Expected 2 shifts, got ${finalRecord.totalShifts}`);
        }

        const expectedHours = 12; // 8 + 4
        const actualHours = finalRecord.totalWorkingHours || 0;
        if (Math.abs(actualHours - expectedHours) < 0.5) {
            logSuccess(`✓ Expected ~${expectedHours} hours, got ${actualHours.toFixed(2)}`);
        } else {
            logWarning(`⚠ Expected ~${expectedHours} hours, got ${actualHours.toFixed(2)}`);
        }
    }
}

/**
 * Test Scenario: Duplicate IN Detection
 */
async function testDuplicateIN(employee, date) {
    logSection('TEST: DUPLICATE IN DETECTION (< 1 HOUR)');

    const empNo = employee.emp_no;
    const baseDate = new Date(date);

    // First IN
    const firstIn = new Date(baseDate);
    firstIn.setHours(8, 0, 0, 0);
    await sendBiometricPunch(empNo, firstIn, 'CHECK-IN');
    await wait(1000, 'Processing...');

    // Duplicate IN (30 minutes later - should be ignored)
    const duplicateIn = new Date(baseDate);
    duplicateIn.setHours(8, 30, 0, 0);
    logWarning('Sending duplicate IN (30 min gap - should be ignored)...');
    await sendBiometricPunch(empNo, duplicateIn, 'CHECK-IN');
    await wait(1000, 'Processing...');

    // OUT
    const out = new Date(baseDate);
    out.setHours(16, 0, 0, 0);
    await sendBiometricPunch(empNo, out, 'CHECK-OUT');
    await wait(2000, 'Processing...');

    // Check record
    logInfo('\n🔍 Checking attendance record...');
    const record = await checkAttendanceRecord(empNo, date);

    if (record) {
        console.log('\n✨ Verification:');
        if (record.totalShifts === 1) {
            logSuccess('✓ Duplicate IN correctly ignored - only 1 shift created');
        } else {
            logError(`✗ Expected 1 shift, got ${record.totalShifts}`);
        }
    }
}

/**
 * Main test runner
 */
async function runRealTimeTests() {
    try {
        // Connect to database
        logSection('CONNECTING TO DATABASE');
        await mongoose.connect(MONGODB_URI);
        logSuccess('Connected to MongoDB');

        // Find test employee
        logSection('FINDING TEST EMPLOYEE');
        const employee = await findTestEmployee();

        // Use today's date
        const today = new Date();
        const testDate = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
        logInfo(`Test Date: ${testDate}`);

        // Check shift assignment
        await getShiftAssignment(employee.emp_no, testDate);

        // Ask user which test to run
        logSection('SELECT TEST SCENARIO');
        console.log('\n1. Double Shift Test (2 shifts in one day)');
        console.log('2. Duplicate IN Detection Test');
        console.log('\nNote: This will create real attendance records!');
        console.log('Make sure to clean up test data afterwards.\n');

        // For automated testing, run double shift
        logInfo('Running: Double Shift Test');
        await wait(2000, 'Starting in 2 seconds...');

        await testDoubleShift(employee, testDate);

        logSection('TEST COMPLETE');
        logSuccess('Real-time multi-shift test completed!');

        console.log('\n📋 Next Steps:');
        console.log('1. Check the attendance record in the database');
        console.log('2. View in the frontend attendance page');
        console.log('3. Verify shifts are displayed correctly');
        console.log('\n💡 To clean up test data:');
        console.log(`   db.attendancedailies.deleteOne({ employeeNumber: '${employee.emp_no}', date: '${testDate}' })`);
        console.log(`   db.attendancerawlogs.deleteMany({ employeeNumber: '${employee.emp_no}', date: '${testDate}' })`);

    } catch (error) {
        logError(`Test failed: ${error.message}`);
        console.error(error);
    } finally {
        await mongoose.disconnect();
        logInfo('Disconnected from MongoDB');
    }
}

// Run tests
runRealTimeTests();
