const mongoose = require('mongoose');
require('dotenv').config();

const Employee = require('../employees/model/Employee');
const Department = require('../departments/model/Department');
const Designation = require('../departments/model/Designation');
const Shift = require('../shifts/model/Shift');
const { getShiftsForEmployee } = require('../shifts/services/shiftDetectionService');

async function runVerification() {
    console.log('Connecting to MongoDB...');
    if (!process.env.MONGODB_URI) {
        console.error('MONGODB_URI not found in env');
        process.exit(1);
    }
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected.');

    try {
        // 1. Create Shifts
        const globalShift = await Shift.create({
            name: 'Global Shift',
            startTime: '09:00',
            endTime: '18:00',
            duration: 540,
            isActive: true
        });
        const deptShift = await Shift.create({
            name: 'ICU Shift',
            startTime: '20:00',
            endTime: '08:00',
            duration: 720,
            isActive: true
        });

        // 2. Create Departments
        const deptA = await Department.create({ name: 'Dept A (Global)', code: 'DEPTA' });
        const deptB = await Department.create({ name: 'Dept B (Override)', code: 'DEPTB' });

        // 3. Create Designation with Overrides
        const designation = await Designation.create({
            name: 'Nurse ' + Date.now(),
            shifts: [globalShift._id], // Global Default
            departmentShifts: [
                {
                    department: deptB._id,
                    shifts: [deptShift._id] // Override for Dept B
                }
            ],
            isActive: true
        });

        // 4. Create Employees
        const empA = await Employee.create({
            emp_no: 'TEST_EMP_A_' + Date.now(),
            employee_name: 'Employee A',
            department_id: deptA._id,
            designation_id: designation._id,
            is_active: true
        });

        const empB = await Employee.create({
            emp_no: 'TEST_EMP_B_' + Date.now(),
            employee_name: 'Employee B',
            department_id: deptB._id,
            designation_id: designation._id,
            is_active: true
        });

        const today = new Date().toISOString().split('T')[0];

        // 5. Verify Emp A (Should get Global Shift)
        console.log('\n--- Verify Emp A (Dept A - Global) ---');
        const resA = await getShiftsForEmployee(empA.emp_no, today);
        console.log('Found Shifts:', resA.shifts.map(s => s.name).join(', '));
        if (resA.shifts.some(s => s._id.toString() === globalShift._id.toString())) {
            console.log('✅ Correct: Got Global Shift');
        } else {
            console.log('❌ Failed: Expected Global Shift');
        }

        // 6. Verify Emp B (Should get Dept Shift)
        console.log('\n--- Verify Emp B (Dept B - Override) ---');
        const resB = await getShiftsForEmployee(empB.emp_no, today);
        console.log('Found Shifts:', resB.shifts.map(s => s.name).join(', '));
        if (resB.shifts.some(s => s._id.toString() === deptShift._id.toString())) {
            console.log('✅ Correct: Got Department Override Shift');
        } else {
            console.log('❌ Failed: Expected Department Override Shift');
        }

        // Cleanup
        await Employee.deleteMany({ _id: { $in: [empA._id, empB._id] } });
        await Designation.deleteOne({ _id: designation._id });
        await Department.deleteMany({ _id: { $in: [deptA._id, deptB._id] } });
        await Shift.deleteMany({ _id: { $in: [globalShift._id, deptShift._id] } });
        console.log('\nCleanup completed.');

    } catch (error) {
        console.error('Verification Error:', error);
    } finally {
        await mongoose.disconnect();
    }
}

runVerification();
