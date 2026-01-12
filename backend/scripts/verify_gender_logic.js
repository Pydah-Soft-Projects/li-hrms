const mongoose = require('mongoose');
const dotenv = require('dotenv');
const path = require('path');

// Load env vars
dotenv.config({ path: path.join(__dirname, '../.env') });

// Load Models
const Division = require('../departments/model/Division');
const Department = require('../departments/model/Department');
const Designation = require('../departments/model/Designation');
const Shift = require('../shifts/model/Shift');
const Employee = require('../employees/model/Employee');

// Load Service (mocking needed? No, we want integration test logic)
// We will test `filterShiftsByGender` logic by simulating the data structure 
// or simpler, we can just use the function if we exported it, but I didn't export it.
// So I will create a test data scenario.

// Hardcoded fallback based on user provided env
const FALLBACK_URI = 'mongodb://localhost:27017/hrms';

const connectDB = async () => {
    try {
        const uri = process.env.MONGODB_URI || FALLBACK_URI;
        console.log(`Connecting to MongoDB at: ${uri}`);
        await mongoose.connect(uri);
        console.log(`MongoDB Connected: ${mongoose.connection.host}`);
    } catch (error) {
        console.error(`Error: ${error.message}`);
        process.exit(1);
    }
};

const runTest = async () => {
    await connectDB();

    console.log('--- Verifying Gender Based Shift Logic ---');

    try {
        // Pre-cleanup in case of previous failures
        await Shift.deleteOne({ name: 'Gender Test Shift' });
        await Division.deleteOne({ name: 'Gender Test Division' });
        await Employee.deleteOne({ emp_no: 'TEST_MALE' });
        await Employee.deleteOne({ emp_no: 'TEST_FEMALE' });

        // 1. Create a dummy Shift
        const testShift = await Shift.create({
            name: 'Gender Test Shift',
            startTime: '09:00',
            endTime: '18:00',
            duration: 9,
            isActive: true
        });
        console.log('Created Test Shift:', testShift._id);

        // 2. Create a dummy Division with Gender Restriction (Female Only)
        // Note: Using raw object to bypass potentially strictly typed Mongoose if schema wasn't reloaded (but it requires restart usually)
        // Since we are running a standalone script, it will load the NEW schema.
        const testDivision = await Division.create({
            name: 'Gender Test Division',
            code: 'GTD',
            shifts: [{
                shiftId: testShift._id,
                gender: 'Female' // <--- RESTRICTION
            }]
        });
        console.log('Created Test Division:', testDivision._id);

        // 3. Create Male Employee
        const maleEmployee = await Employee.create({
            emp_no: 'TEST_MALE',
            employee_name: 'Test Male',
            gender: 'Male',
            division_id: testDivision._id,
            doj: new Date(),
            dob: new Date(),
            // Minimum required fields...
        });
        console.log('Created Male Employee:', maleEmployee._id);

        // 4. Create Female Employee
        const femaleEmployee = await Employee.create({
            emp_no: 'TEST_FEMALE',
            employee_name: 'Test Female',
            gender: 'Female',
            division_id: testDivision._id,
            doj: new Date(),
            dob: new Date(),
        });
        console.log('Created Female Employee:', femaleEmployee._id);

        console.log('\n--- Running Detection Logic (via Service) ---');
        // We need to require the service here to use it
        const shiftService = require('../shifts/services/shiftDetectionService');

        // TEST ACTION 1: Male Employee
        console.log('Checking shifts for Male Employee...');
        const maleResult = await shiftService.getShiftsForEmployee('TEST_MALE', '2025-01-01');
        console.log('Male Result Shifts Count:', maleResult.shifts?.length);

        if (maleResult.shifts.length === 0) {
            console.log('PASS: Male employee correctly denied Female-only shift.');
        } else {
            console.error('FAIL: Male employee assigned restricted shift!');
        }

        // TEST ACTION 2: Female Employee
        console.log('Checking shifts for Female Employee...');
        const femaleResult = await shiftService.getShiftsForEmployee('TEST_FEMALE', '2025-01-01');
        console.log('Female Result Shifts Count:', femaleResult.shifts?.length);
        if (femaleResult.shifts.length > 0) {
            console.log('PASS: Female employee correctly assigned Female-only shift.');
        } else {
            console.error('FAIL: Female employee NOT assigned allowed shift!');
        }

        // CLEANUP
        console.log('\n--- Cleaning up Test Data ---');
        await Employee.deleteOne({ _id: maleEmployee._id });
        await Employee.deleteOne({ _id: femaleEmployee._id });
        await Division.deleteOne({ _id: testDivision._id });
        await Shift.deleteOne({ _id: testShift._id });
        console.log('Cleanup complete.');

    } catch (err) {
        console.error('Test Failed:', JSON.stringify(err, null, 2));
    }

    process.exit();
};

runTest();
