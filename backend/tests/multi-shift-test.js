/**
 * Multi-Shift Backend Test Script
 * Tests all multi-shift scenarios with real data
 */

const mongoose = require('mongoose');
const AttendanceRawLog = require('../attendance/model/AttendanceRawLog');
const AttendanceDaily = require('../attendance/model/AttendanceDaily');
const Employee = require('../employees/model/Employee');
const { processMultiShiftAttendance } = require('../attendance/services/multiShiftProcessingService');
const Settings = require('../settings/model/Settings');

// MongoDB connection string - update with your actual connection
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/li-hrms';

// Test employee number - update with a real employee from your database
const TEST_EMPLOYEE_NUMBER = 'EMP001'; // Change this to a real employee number

// Test date
const TEST_DATE = '2026-01-25';

// Color codes for console output
const colors = {
    reset: '\x1b[0m',
    bright: '\x1b[1m',
    green: '\x1b[32m',
    red: '\x1b[31m',
    yellow: '\x1b[33m',
    blue: '\x1b[34m',
    cyan: '\x1b[36m',
};

function log(message, color = 'reset') {
    console.log(`${colors[color]}${message}${colors.reset}`);
}

function logSection(title) {
    console.log('\n' + '='.repeat(60));
    log(title, 'bright');
    console.log('='.repeat(60));
}

function logTest(testName) {
    log(`\n🧪 TEST: ${testName}`, 'cyan');
}

function logSuccess(message) {
    log(`✅ ${message}`, 'green');
}

function logError(message) {
    log(`❌ ${message}`, 'red');
}

function logWarning(message) {
    log(`⚠️  ${message}`, 'yellow');
}

function logInfo(message) {
    log(`ℹ️  ${message}`, 'blue');
}

/**
 * Create test raw logs
 */
async function createTestLogs(employeeNumber, date, scenario) {
    const logs = [];
    const baseDate = new Date(date);

    switch (scenario) {
        case 'single-shift':
            logs.push({
                employeeNumber,
                timestamp: new Date(baseDate.setHours(8, 0, 0, 0)),
                type: 'IN',
                source: 'test-script',
                date,
            });
            logs.push({
                employeeNumber,
                timestamp: new Date(baseDate.setHours(16, 0, 0, 0)),
                type: 'OUT',
                source: 'test-script',
                date,
            });
            break;

        case 'double-shift':
            logs.push({
                employeeNumber,
                timestamp: new Date(baseDate.setHours(8, 0, 0, 0)),
                type: 'IN',
                source: 'test-script',
                date,
            });
            logs.push({
                employeeNumber,
                timestamp: new Date(baseDate.setHours(16, 0, 0, 0)),
                type: 'OUT',
                source: 'test-script',
                date,
            });
            logs.push({
                employeeNumber,
                timestamp: new Date(baseDate.setHours(18, 0, 0, 0)),
                type: 'IN',
                source: 'test-script',
                date,
            });
            logs.push({
                employeeNumber,
                timestamp: new Date(baseDate.setHours(22, 0, 0, 0)),
                type: 'OUT',
                source: 'test-script',
                date,
            });
            break;

        case 'triple-shift':
            logs.push({
                employeeNumber,
                timestamp: new Date(baseDate.setHours(6, 0, 0, 0)),
                type: 'IN',
                source: 'test-script',
                date,
            });
            logs.push({
                employeeNumber,
                timestamp: new Date(baseDate.setHours(14, 0, 0, 0)),
                type: 'OUT',
                source: 'test-script',
                date,
            });
            logs.push({
                employeeNumber,
                timestamp: new Date(baseDate.setHours(14, 0, 0, 0)),
                type: 'IN',
                source: 'test-script',
                date,
            });
            logs.push({
                employeeNumber,
                timestamp: new Date(baseDate.setHours(18, 0, 0, 0)),
                type: 'OUT',
                source: 'test-script',
                date,
            });
            logs.push({
                employeeNumber,
                timestamp: new Date(baseDate.setHours(22, 0, 0, 0)),
                type: 'IN',
                source: 'test-script',
                date,
            });
            const nextDay = new Date(baseDate);
            nextDay.setDate(nextDay.getDate() + 1);
            logs.push({
                employeeNumber,
                timestamp: new Date(nextDay.setHours(2, 0, 0, 0)),
                type: 'OUT',
                source: 'test-script',
                date,
            });
            break;

        case 'duplicate-in':
            logs.push({
                employeeNumber,
                timestamp: new Date(baseDate.setHours(8, 0, 0, 0)),
                type: 'IN',
                source: 'test-script',
                date,
            });
            logs.push({
                employeeNumber,
                timestamp: new Date(baseDate.setHours(8, 30, 0, 0)), // 30 min later - should be ignored
                type: 'IN',
                source: 'test-script',
                date,
            });
            logs.push({
                employeeNumber,
                timestamp: new Date(baseDate.setHours(16, 0, 0, 0)),
                type: 'OUT',
                source: 'test-script',
                date,
            });
            break;

        case 'incomplete-shift':
            logs.push({
                employeeNumber,
                timestamp: new Date(baseDate.setHours(8, 0, 0, 0)),
                type: 'IN',
                source: 'test-script',
                date,
            });
            // No OUT punch
            break;

        case 'overnight-shift':
            logs.push({
                employeeNumber,
                timestamp: new Date(baseDate.setHours(22, 0, 0, 0)),
                type: 'IN',
                source: 'test-script',
                date,
            });
            const nextDayOut = new Date(baseDate);
            nextDayOut.setDate(nextDayOut.getDate() + 1);
            logs.push({
                employeeNumber,
                timestamp: new Date(nextDayOut.setHours(6, 0, 0, 0)),
                type: 'OUT',
                source: 'test-script',
                date,
            });
            break;
    }

    // Insert logs
    for (const log of logs) {
        try {
            await AttendanceRawLog.create(log);
            logInfo(`Created log: ${log.type} at ${log.timestamp.toLocaleTimeString()}`);
        } catch (error) {
            if (error.code === 11000) {
                logWarning(`Log already exists: ${log.type} at ${log.timestamp.toLocaleTimeString()}`);
            } else {
                throw error;
            }
        }
    }

    return logs;
}

/**
 * Run a test scenario
 */
async function runTestScenario(employeeNumber, date, scenario, expectedShifts) {
    logTest(`Scenario: ${scenario.toUpperCase()}`);

    try {
        // Step 1: Create test logs
        logInfo('Step 1: Creating test logs...');
        await createTestLogs(employeeNumber, date, scenario);

        // Step 2: Fetch all logs for this employee
        logInfo('Step 2: Fetching all logs...');
        const allLogs = await AttendanceRawLog.find({
            employeeNumber,
            date,
            type: { $in: ['IN', 'OUT'] },
        }).sort({ timestamp: 1 }).lean();

        logInfo(`Found ${allLogs.length} logs`);

        // Step 3: Process multi-shift attendance
        logInfo('Step 3: Processing multi-shift attendance...');
        const generalConfig = await Settings.getSettingsByCategory('general');

        const logs = allLogs.map(log => ({
            timestamp: new Date(log.timestamp),
            type: log.type,
            punch_state: log.type === 'IN' ? 0 : 1,
            _id: log._id,
        }));

        const result = await processMultiShiftAttendance(
            employeeNumber,
            date,
            logs,
            generalConfig
        );

        // Step 4: Verify results
        logInfo('Step 4: Verifying results...');

        if (result.success) {
            logSuccess(`Processing successful!`);
            logInfo(`Shifts detected: ${result.shiftsProcessed}`);
            logInfo(`Total hours: ${result.totalHours?.toFixed(2) || 0}`);
            logInfo(`Total OT: ${result.totalOT?.toFixed(2) || 0}`);

            // Fetch the daily record
            const dailyRecord = await AttendanceDaily.findOne({
                employeeNumber,
                date,
            }).lean();

            if (dailyRecord) {
                logSuccess('Daily record created/updated');
                logInfo(`Total shifts: ${dailyRecord.totalShifts}`);
                logInfo(`Total working hours: ${dailyRecord.totalWorkingHours?.toFixed(2)}`);
                logInfo(`Status: ${dailyRecord.status}`);

                // Display shift details
                if (dailyRecord.shifts && dailyRecord.shifts.length > 0) {
                    console.log('\n📊 Shift Details:');
                    dailyRecord.shifts.forEach((shift, index) => {
                        console.log(`\n  Shift ${shift.shiftNumber}:`);
                        console.log(`    IN:  ${new Date(shift.inTime).toLocaleTimeString()}`);
                        console.log(`    OUT: ${shift.outTime ? new Date(shift.outTime).toLocaleTimeString() : 'INCOMPLETE'}`);
                        console.log(`    Hours: ${shift.workingHours?.toFixed(2) || 0}`);
                        console.log(`    OT: ${shift.otHours?.toFixed(2) || 0}`);
                        console.log(`    Status: ${shift.status}`);
                    });
                }

                // Verify expected shifts
                if (dailyRecord.totalShifts === expectedShifts) {
                    logSuccess(`✓ Expected ${expectedShifts} shift(s), got ${dailyRecord.totalShifts}`);
                } else {
                    logError(`✗ Expected ${expectedShifts} shift(s), got ${dailyRecord.totalShifts}`);
                }
            } else {
                logError('Daily record not found!');
            }
        } else {
            logError(`Processing failed: ${result.error || result.reason}`);
        }

    } catch (error) {
        logError(`Test failed: ${error.message}`);
        console.error(error);
    }
}

/**
 * Clean up test data
 */
async function cleanupTestData(employeeNumber, date) {
    logInfo('Cleaning up test data...');

    await AttendanceRawLog.deleteMany({
        employeeNumber,
        date,
        source: 'test-script',
    });

    await AttendanceDaily.deleteOne({
        employeeNumber,
        date,
    });

    logSuccess('Test data cleaned up');
}

/**
 * Main test runner
 */
async function runTests() {
    try {
        // Connect to MongoDB
        logSection('CONNECTING TO DATABASE');
        await mongoose.connect(MONGODB_URI);
        logSuccess('Connected to MongoDB');

        // Verify test employee exists
        logSection('VERIFYING TEST EMPLOYEE');
        const employee = await Employee.findOne({ emp_no: TEST_EMPLOYEE_NUMBER });

        if (!employee) {
            logError(`Employee ${TEST_EMPLOYEE_NUMBER} not found!`);
            logWarning('Please update TEST_EMPLOYEE_NUMBER in the script with a real employee number');
            process.exit(1);
        }

        logSuccess(`Found employee: ${employee.employee_name} (${employee.emp_no})`);

        // Run test scenarios
        const scenarios = [
            { name: 'single-shift', expectedShifts: 1 },
            { name: 'double-shift', expectedShifts: 2 },
            { name: 'triple-shift', expectedShifts: 3 },
            { name: 'duplicate-in', expectedShifts: 1 },
            { name: 'incomplete-shift', expectedShifts: 1 },
            { name: 'overnight-shift', expectedShifts: 1 },
        ];

        for (const scenario of scenarios) {
            logSection(`TEST SCENARIO: ${scenario.name.toUpperCase()}`);

            // Clean up before test
            await cleanupTestData(TEST_EMPLOYEE_NUMBER, TEST_DATE);

            // Run test
            await runTestScenario(
                TEST_EMPLOYEE_NUMBER,
                TEST_DATE,
                scenario.name,
                scenario.expectedShifts
            );

            // Wait a bit between tests
            await new Promise(resolve => setTimeout(resolve, 1000));
        }

        // Final cleanup
        logSection('FINAL CLEANUP');
        await cleanupTestData(TEST_EMPLOYEE_NUMBER, TEST_DATE);

        logSection('ALL TESTS COMPLETE');
        logSuccess('Multi-shift backend testing completed successfully!');

    } catch (error) {
        logError(`Test suite failed: ${error.message}`);
        console.error(error);
    } finally {
        await mongoose.disconnect();
        logInfo('Disconnected from MongoDB');
    }
}

// Run tests
runTests();
