const mongoose = require('mongoose');
const dotenv = require('dotenv');
const path = require('path');
const bcrypt = require('bcryptjs');

// Load env vars
dotenv.config({ path: path.join(__dirname, '../.env') });

const Division = require('../departments/model/Division');
const Department = require('../departments/model/Department');
const Designation = require('../departments/model/Designation');
const Employee = require('../employees/model/Employee');
const User = require('../users/model/User');
const Shift = require('../shifts/model/Shift');
const ShiftDuration = require('../shifts/model/ShiftDuration');

async function seedData() {
    try {
        console.log('Connecting to MongoDB...');
        await mongoose.connect(process.env.MONGODB_URI);
        console.log('Connected.');

        const admin = await User.findOne({ role: 'super_admin' });
        if (!admin) {
            console.error('No super admin found. Please create one first.');
            process.exit(1);
        }

        let division = await Division.findOne({ name: 'Pydah Group' });
        if (!division) {
            console.log('Division "Pydah Group" not found, trying to find any active division...');
            division = await Division.findOne({ isActive: true });
        }

        if (!division) {
            console.log('No division found, creating "Pydah Group" division...');
            division = await Division.create({
                name: 'Pydah Group',
                code: 'PYDAH',
                description: 'Main Division for Performance Testing',
                createdBy: admin._id
            });
        }
        console.log(`Using division: ${division.name} (${division._id})`);

        // 1. Create 20 Departments
        console.log('Creating 20 departments...');
        const depts = [];
        for (let i = 1; i <= 20; i++) {
            const name = `Department ${i}`;
            const code = `DEPT${i.toString().padStart(2, '0')}`;
            let dept = await Department.findOne({ code });
            if (!dept) {
                dept = await Department.create({
                    name,
                    code,
                    description: `Performance Test Department ${i}`,
                    divisions: [division._id],
                    createdBy: admin._id
                });
            }
            depts.push(dept);
        }
        console.log(`${depts.length} departments ready.`);

        // 2. Create 50 Designations
        console.log('Creating 50 designations...');
        const designations = [];
        for (let i = 1; i <= 50; i++) {
            const name = `Designation ${i}`;
            const code = `DSG${i.toString().padStart(3, '0')}`;
            let desig = await Designation.findOne({ name });
            if (!desig) {
                desig = await Designation.create({
                    name,
                    code,
                    description: `Performance Test Designation ${i}`,
                    createdBy: admin._id
                });
            }
            designations.push(desig);

            // Link to a random department
            const randomDept = depts[Math.floor(Math.random() * depts.length)];
            if (!randomDept.designations.includes(desig._id)) {
                randomDept.designations.push(desig._id);
                await randomDept.save();
            }
        }
        console.log(`${designations.length} designations ready.`);

        // 3. Create Shift Durations & Shifts
        console.log('Creating shifts...');
        let dur8 = await ShiftDuration.findOne({ duration: 8 });
        if (!dur8) {
            dur8 = await ShiftDuration.create({ name: '8 Hours', duration: 8, createdBy: admin._id });
        }
        let dur10 = await ShiftDuration.findOne({ duration: 10 });
        if (!dur10) {
            dur10 = await ShiftDuration.create({ name: '10 Hours', duration: 10, createdBy: admin._id });
        }

        let shift8 = await Shift.findOne({ name: 'General Shift (8h)' });
        if (!shift8) {
            shift8 = await Shift.create({
                name: 'General Shift (8h)',
                startTime: '09:00',
                endTime: '17:00',
                duration: 8,
                createdBy: admin._id
            });
        }

        let shift10 = await Shift.findOne({ name: 'Night Shift (10h)' });
        if (!shift10) {
            shift10 = await Shift.create({
                name: 'Night Shift (10h)',
                startTime: '20:00',
                endTime: '06:00',
                duration: 10,
                createdBy: admin._id
            });
        }

        // 4. Create 1000 Employees
        console.log('Creating 1000 employees...');
        const password = await bcrypt.hash('password123', 12);
        const bloodGroups = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'];
        const maritalStatuses = ['Single', 'Married', 'Divorced', 'Widowed'];
        const genders = ['Male', 'Female'];

        const employeeBatch = [];
        for (let i = 1; i <= 1000; i++) {
            const emp_no = `E${i.toString().padStart(4, '0')}`;
            const existing = await Employee.findOne({ emp_no });
            if (existing) continue;

            const dept = depts[i % 20];
            const desig = designations[i % 50];
            const gender = genders[i % 2];

            employeeBatch.push({
                emp_no,
                employee_name: `Performance Employee ${i}`,
                division_id: division._id,
                department_id: dept._id,
                designation_id: desig._id,
                gender,
                email: `emp${i}@pydahsoft.test`,
                phone_number: `90000${i.toString().padStart(5, '0')}`,
                doj: new Date(2024, 0, 1),
                dob: new Date(1990, 0, 1),
                blood_group: bloodGroups[i % 8],
                marital_status: maritalStatuses[i % 4],
                gross_salary: 30000 + (i * 10),
                is_active: true,
                password: password
            });

            if (employeeBatch.length >= 100) {
                await Employee.insertMany(employeeBatch);
                console.log(`Progress: ${i}/1000`);
                employeeBatch.length = 0;
            }
        }
        if (employeeBatch.length > 0) {
            await Employee.insertMany(employeeBatch);
        }
        console.log('1000 employees created.');

        console.log('Seeding completed successfully.');
        process.exit(0);
    } catch (error) {
        console.error('Error seeding data:', error);
        process.exit(1);
    }
}

seedData();
