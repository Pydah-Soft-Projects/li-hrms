const mongoose = require('mongoose');
const { processMultiShiftAttendance } = require('../attendance/services/multiShiftProcessingService');
const AttendanceDaily = require('../attendance/model/AttendanceDaily');
const AttendanceRawLog = require('../attendance/model/AttendanceRawLog');

// MOCK DB connection for testing if needed or just use real if available
// For this script, we'll assume a real connection is available via an environment or just run in the backend context

async function runVerification() {
    try {
        // Connect to MongoDB (Adjust URI as needed)
        await mongoose.connect('mongodb://localhost:27017/hrms');
        console.log('Connected to MongoDB');

        const employeeNumber = 'TEST001';
        const date = '2026-01-28';

        // Clear existing data for test
        await AttendanceDaily.deleteOne({ employeeNumber, date });
        await AttendanceRawLog.deleteMany({ employeeNumber });

        console.log('\n--- Scenario 1: Split Shift (Multi-Shift) ---');
        const logs1 = [
            { timestamp: new Date(`${date}T09:00:00`), type: 'IN', punch_state: 0 },
            { timestamp: new Date(`${date}T13:00:00`), type: 'OUT', punch_state: 1 },
            { timestamp: new Date(`${date}T14:00:00`), type: 'IN', punch_state: 0 },
            { timestamp: new Date(`${date}T18:00:00`), type: 'OUT', punch_state: 1 },
        ];

        const result1 = await processMultiShiftAttendance(employeeNumber, date, logs1, {});
        console.log('Result 1 (Split):', {
            totalShifts: result1.dailyRecord.shifts.length,
            totalWorkingHours: result1.dailyRecord.totalWorkingHours,
            extraHours: result1.dailyRecord.extraHours,
            status: result1.dailyRecord.status
        });

        console.log('\n--- Scenario 2: Overnight Shift ---');
        const nextDate = '2026-01-29';
        const logs2 = [
            { timestamp: new Date(`${date}T22:00:00`), type: 'IN', punch_state: 0 },
            { timestamp: new Date(`${nextDate}T06:00:00`), type: 'OUT', punch_state: 1 },
        ];

        const result2 = await processMultiShiftAttendance(employeeNumber, date, logs2, {});
        console.log('Result 2 (Overnight):', {
            totalShifts: result2.dailyRecord.shifts.length,
            totalWorkingHours: result2.dailyRecord.totalWorkingHours,
            status: result2.dailyRecord.status
        });

        console.log('\nVerification Complete');
        process.exit(0);
    } catch (error) {
        console.error('Verification Failed:', error);
        process.exit(1);
    }
}

runVerification();
