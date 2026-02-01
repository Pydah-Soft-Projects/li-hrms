const mongoose = require('mongoose');
const { processMultiShiftAttendance } = require('../attendance/services/multiShiftProcessingService');
const AttendanceDaily = require('../attendance/model/AttendanceDaily');
const AttendanceRawLog = require('../attendance/model/AttendanceRawLog');

async function runVerification() {
    try {
        await mongoose.connect('mongodb://localhost:27017/hrms');
        console.log('Connected to MongoDB');

        const employeeNumber = 'TEST_SURGICAL';
        const date = '2026-01-29';

        // Clear existing data
        await AttendanceDaily.deleteOne({ employeeNumber, date });

        console.log('\n--- Scenario: Gap Filling OD (Shift 9-6) ---');
        // Punches: 11:00 AM - 6:00 PM (2 hours late)
        // OD: 9:00 AM - 11:00 AM (Should fill gap and waive late)
        const logs = [
            { timestamp: new Date(`${date}T11:00:00`), type: 'IN', punch_state: 0 },
            { timestamp: new Date(`${date}T18:00:00`), type: 'OUT', punch_state: 1 },
        ];

        // We need a mock OD in DB since the service fetches from DB
        const OD = require('../leaves/model/OD');
        const Employee = require('../employees/model/Employee');
        const Shift = require('../shifts/model/Shift');

        let employee = await Employee.findOne({ emp_no: employeeNumber });

        if (!employee) {
            console.log('Creating test employee...');
            employee = await Employee.create({
                emp_no: employeeNumber,
                employee_name: 'Test Surgical Employee',
                email: 'test_surgical@example.com',
                status: 'Active',
                joining_date: new Date('2020-01-01')
            });
        }

        // Clean up all shifts to avoid ambiguity
        await Shift.deleteMany({});

        console.log('Creating test shift (9 AM - 6 PM)...');
        const testShift = await Shift.create({
            name: 'TEST_9_TO_6',
            startTime: '09:00',
            endTime: '18:00',
            duration: 9,
            isActive: true,
            gracePeriod: 15
        });

        await OD.deleteMany({ emp_no: employeeNumber });
        await OD.create({
            employeeId: employee._id,
            emp_no: employeeNumber,
            odType: 'Business',
            fromDate: new Date(date),
            toDate: new Date(date),
            numberOfDays: 0.25,
            odType_extended: 'hours',
            odStartTime: '09:00',
            odEndTime: '11:00',
            durationHours: 2,
            purpose: 'Test',
            placeVisited: 'Test',
            contactNumber: '1234567890',
            status: 'approved',
            isActive: true,
            appliedBy: employee._id
        });

        const result = await processMultiShiftAttendance(employeeNumber, date, logs, {});

        if (!result.success) {
            console.error('Processing Failed:', result.error || result.reason);
            process.exit(1);
        }

        const record = result.dailyRecord;
        const shift = record.shifts[0];

        console.log('Matched Shift:', {
            name: shift.shiftName,
            start: record.shifts[0].shiftId ? record.shifts[0].shiftStartTime : 'N/A', // I need to make sure these are in the shift object
            end: record.shifts[0].shiftId ? record.shifts[0].shiftEndTime : 'N/A'
        });

        console.log('Results:', {
            punchHours: shift.punchHours,
            odHours: shift.odHours,
            workingHours: shift.workingHours,
            extraHours: shift.extraHours,
            isLateIn: shift.isLateIn, // Should be false now
            status: record.status
        });

        if (shift.isLateIn === false && shift.workingHours === 9) {
            console.log('\nSUCCESS: Gap filled and penalty waived!');
        } else {
            console.log('\nFAILURE: Checks failed.');
        }

        process.exit(0);
    } catch (error) {
        console.error('Verification Failed with Error:');
        console.error(error);
        process.exit(1);
    }
}

runVerification();
