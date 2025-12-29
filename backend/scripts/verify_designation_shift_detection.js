const mongoose = require('mongoose');
require('dotenv').config(); // Load from current directory

const Employee = require('../employees/model/Employee');
const Designation = require('../departments/model/Designation');
const Shift = require('../shifts/model/Shift');
const { getShiftsForEmployee } = require('../shifts/services/shiftDetectionService');

async function runVerification() {
    console.log('Connecting to MongoDB...');
    // Ensure you have MONGODB_URI in your environment or replace here
    if (!process.env.MONGODB_URI) {
        console.error('MONGODB_URI not found in env');
        process.exit(1);
    }
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected.');

    try {
        // 1. Create a Test Shift
        const testShift = await Shift.create({
            name: 'Test Verify Shift',
            startTime: '09:00',
            endTime: '18:00',
            duration: 540,
            isActive: true
        });
        console.log('Created Test Shift:', testShift._id);

        // 2. Create a Test Designation with this Shift
        const testDesignation = await Designation.create({
            name: 'Test Verify Desig ' + Date.now(),
            shifts: [testShift._id],
            isActive: true
        });
        console.log('Created Test Designation:', testDesignation._id);

        // 3. Create a Test Employee with this Designation
        const testEmployee = await Employee.create({
            emp_no: 'TEST_VERIFY_' + Date.now(),
            employee_name: 'Test Verify Employee',
            designation_id: testDesignation._id,
            is_active: true
        });
        console.log('Created Test Employee:', testEmployee.emp_no);

        // 4. Run Shift Detection
        const today = new Date().toISOString().split('T')[0];
        console.log('Running getShiftsForEmployee...');
        const result = await getShiftsForEmployee(testEmployee.emp_no, today);

        console.log('--- Detection Result ---');
        console.log('Source:', result.source);
        console.log('Shifts Found:', result.shifts.length);
        if (result.shifts.length > 0) {
            console.log('Shift 0 Name:', result.shifts[0].name);
            console.log('Shift 0 ID:', result.shifts[0]._id);
        }

        const isSuccess = result.shifts.some(s => s._id.toString() === testShift._id.toString());

        if (isSuccess) {
            console.log('\n✅ SUCCESS: Designation Shift was correctly detected!');
        } else {
            console.log('\n❌ FAILURE: Designation Shift was NOT detected.');
        }

        // Cleanup
        await Employee.deleteOne({ _id: testEmployee._id });
        await Designation.deleteOne({ _id: testDesignation._id });
        await Shift.deleteOne({ _id: testShift._id });
        console.log('Cleanup completed.');

    } catch (error) {
        console.error('Verification Error:', error);
    } finally {
        await mongoose.disconnect();
    }
}

runVerification();
