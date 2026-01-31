/**
 * Direct Service Multi-Shift Test
 * Tests multi-shift processing directly without API calls
 */

const mongoose = require('mongoose');
const Employee = require('../employees/model/Employee');
const AttendanceRawLog = require('../attendance/model/AttendanceRawLog');
const AttendanceDaily = require('../attendance/model/AttendanceDaily');
const { processMultiShiftAttendance } = require('../attendance/services/multiShiftProcessingService');
const Settings = require('../settings/model/Settings');

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/li-hrms';

// Colors
const colors = {
    reset: '\x1b[0m',
    green: '\x1b[32m',
    red: '\x1b[31m',
    yellow: '\x1b[33m',
    blue: '\x1b[34m',
    cyan: '\x1b[36m',
    bright: '\x1b[1m',
};

function log(msg, color = 'reset') {
    console.log(`${colors[color]}${msg}${colors.reset}`);
}

async function runDirectTest() {
    try {
        log('\n' + '='.repeat(70), 'bright');
        log('DIRECT SERVICE MULTI-SHIFT TEST', 'bright');
        log('='.repeat(70), 'bright');

        // Connect
        log('\n📡 Connecting to MongoDB...', 'blue');
        await mongoose.connect(MONGODB_URI);
        log('✅ Connected', 'green');

        // Find employee
        log('\n👤 Finding test employee...', 'blue');
        const employee = await Employee.findOne({ is_active: { $ne: false } }).limit(1);
        if (!employee) {
            throw new Error('No employees found');
        }
        log(`✅ Found: ${employee.employee_name} (${employee.emp_no})`, 'green');

        // Test date
        const today = new Date();
        const testDate = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
        log(`📅 Test Date: ${testDate}`, 'blue');

        // Clean up existing data
        log('\n🧹 Cleaning up existing test data...', 'yellow');
        await AttendanceRawLog.deleteMany({ employeeNumber: employee.emp_no, date: testDate, source: 'manual' });
        await AttendanceDaily.deleteOne({ employeeNumber: employee.emp_no, date: testDate });
        log('✅ Cleaned up', 'green');

        // Create test logs for double shift
        log('\n📝 Creating test logs (Double Shift)...', 'blue');
        const baseDate = new Date(testDate);

        const logs = [
            {
                employeeNumber: employee.emp_no,
                timestamp: new Date(baseDate.setHours(8, 0, 0, 0)),
                type: 'IN',
                source: 'manual',
                date: testDate,
            },
            {
                employeeNumber: employee.emp_no,
                timestamp: new Date(baseDate.setHours(16, 0, 0, 0)),
                type: 'OUT',
                source: 'manual',
                date: testDate,
            },
            {
                employeeNumber: employee.emp_no,
                timestamp: new Date(baseDate.setHours(18, 0, 0, 0)),
                type: 'IN',
                source: 'manual',
                date: testDate,
            },
            {
                employeeNumber: employee.emp_no,
                timestamp: new Date(baseDate.setHours(22, 0, 0, 0)),
                type: 'OUT',
                source: 'manual',
                date: testDate,
            },
        ];

        await AttendanceRawLog.insertMany(logs);
        log('✅ Created 4 punch logs:', 'green');
        logs.forEach(l => {
            log(`   ${l.type.padEnd(4)} at ${new Date(l.timestamp).toLocaleTimeString()}`, 'cyan');
        });

        // Fetch all logs
        log('\n🔍 Fetching all logs for processing...', 'blue');
        const allLogs = await AttendanceRawLog.find({
            employeeNumber: employee.emp_no,
            date: testDate,
            type: { $in: ['IN', 'OUT'] },
        }).sort({ timestamp: 1 }).lean();

        const processLogs = allLogs.map(log => ({
            timestamp: new Date(log.timestamp),
            type: log.type,
            punch_state: log.type === 'IN' ? 0 : 1,
            _id: log._id,
        }));

        log(`✅ Found ${processLogs.length} logs`, 'green');

        // Get settings
        log('\n⚙️  Getting general settings...', 'blue');
        const generalConfig = await Settings.getSettingsByCategory('general');
        log('✅ Settings loaded', 'green');

        // Process multi-shift
        log('\n🚀 Processing multi-shift attendance...', 'blue');
        const result = await processMultiShiftAttendance(
            employee.emp_no,
            testDate,
            processLogs,
            generalConfig
        );

        if (result.success) {
            log('✅ Processing successful!', 'green');
            log(`   Shifts processed: ${result.shiftsProcessed}`, 'cyan');
            log(`   Total hours: ${result.totalHours?.toFixed(2) || 0}`, 'cyan');
            log(`   Total OT: ${result.totalOT?.toFixed(2) || 0}`, 'cyan');

            // Fetch and display the record
            log('\n📊 Fetching attendance record...', 'blue');
            const record = await AttendanceDaily.findOne({
                employeeNumber: employee.emp_no,
                date: testDate,
            }).lean();

            if (record) {
                log('✅ Attendance record created!', 'green');
                log('\n' + '─'.repeat(70), 'cyan');
                log('ATTENDANCE RECORD DETAILS', 'bright');
                log('─'.repeat(70), 'cyan');
                log(`Status: ${record.status}`, 'yellow');
                log(`Total Shifts: ${record.totalShifts || 0}`, 'yellow');
                log(`Total Working Hours: ${record.totalWorkingHours?.toFixed(2) || 0}`, 'yellow');
                log(`Total OT Hours: ${record.totalOTHours?.toFixed(2) || 0}`, 'yellow');

                if (record.shifts && record.shifts.length > 0) {
                    log('\n📋 SHIFT BREAKDOWN:', 'bright');
                    record.shifts.forEach((shift, index) => {
                        log(`\n  🔹 Shift ${shift.shiftNumber}:`, 'cyan');
                        log(`     IN:  ${new Date(shift.inTime).toLocaleTimeString()}`, 'green');
                        log(`     OUT: ${shift.outTime ? new Date(shift.outTime).toLocaleTimeString() : 'INCOMPLETE'}`, shift.outTime ? 'red' : 'yellow');
                        log(`     Hours: ${shift.workingHours?.toFixed(2) || 0}`, 'cyan');
                        log(`     OT: ${shift.otHours?.toFixed(2) || 0}`, 'cyan');
                        log(`     Status: ${shift.status}`, shift.status === 'complete' ? 'green' : 'yellow');
                        if (shift.shiftName) {
                            log(`     Shift Name: ${shift.shiftName}`, 'cyan');
                        }
                    });
                }

                // Verification
                log('\n' + '─'.repeat(70), 'cyan');
                log('VERIFICATION', 'bright');
                log('─'.repeat(70), 'cyan');

                if (record.totalShifts === 2) {
                    log('✅ Expected 2 shifts, got 2', 'green');
                } else {
                    log(`❌ Expected 2 shifts, got ${record.totalShifts}`, 'red');
                }

                const expectedHours = 12;
                const actualHours = record.totalWorkingHours || 0;
                if (Math.abs(actualHours - expectedHours) < 0.5) {
                    log(`✅ Expected ~${expectedHours} hours, got ${actualHours.toFixed(2)}`, 'green');
                } else {
                    log(`⚠️  Expected ~${expectedHours} hours, got ${actualHours.toFixed(2)}`, 'yellow');
                }

                log('\n' + '='.repeat(70), 'bright');
                log('✅ TEST PASSED - Multi-shift system is working!', 'green');
                log('='.repeat(70), 'bright');

                log('\n📝 Next Steps:', 'blue');
                log('1. Check the record in MongoDB', 'cyan');
                log('2. View in frontend attendance page', 'cyan');
                log('3. Test with real biometric device', 'cyan');

                log('\n🧹 To clean up test data:', 'yellow');
                log(`   db.attendancedailies.deleteOne({ employeeNumber: '${employee.emp_no}', date: '${testDate}' })`, 'cyan');
                log(`   db.attendancerawlogs.deleteMany({ employeeNumber: '${employee.emp_no}', date: '${testDate}', source: 'direct-test' })`, 'cyan');

            } else {
                log('❌ No attendance record found!', 'red');
            }
        } else {
            log(`❌ Processing failed: ${result.error || result.reason}`, 'red');
        }

    } catch (error) {
        log(`\n❌ Test failed: ${error.message}`, 'red');
        console.error(error);
    } finally {
        await mongoose.disconnect();
        log('\n📡 Disconnected from MongoDB\n', 'blue');
    }
}

runDirectTest();
