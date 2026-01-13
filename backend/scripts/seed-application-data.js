const mongoose = require('mongoose');
const dotenv = require('dotenv');
const path = require('path');

console.log('__dirname:', __dirname);
console.log('ENV PATH:', path.join(__dirname, '../.env'));
dotenv.config({ path: path.join(__dirname, '../.env') });
console.log('MONGODB_URI exists:', !!process.env.MONGODB_URI);

console.log('Requiring Division...');
const Division = require('../departments/model/Division');
console.log('Requiring Department...');
const Department = require('../departments/model/Department');
console.log('Requiring Designation...');
const Designation = require('../departments/model/Designation');
console.log('Requiring EmployeeApplication...');
const EmployeeApplication = require('../employee-applications/model/EmployeeApplication');
console.log('Requiring User...');
const User = require('../users/model/User');

async function seedApplications() {
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
            division = await Division.findOne({ isActive: true });
        }
        if (!division) {
            division = await Division.findOne({});
        }

        if (!division) {
            console.error('No division found. Run seed-performance-data.js first.');
            process.exit(1);
        }

        const depts = await Department.find({ divisions: division._id });
        const designations = await Designation.find({});

        if (!division || depts.length === 0 || designations.length === 0) {
            console.error('Foundational data missing. Run seed-performance-data.js first.');
            process.exit(1);
        }

        console.log(`Using division: ${division.name}`);
        console.log(`Using ${depts.length} departments and ${designations.length} designations.`);

        // Clear existing applications to have a clean slate for the test
        console.log('Clearing existing applications...');
        await EmployeeApplication.deleteMany({});

        console.log('Creating 500 applications...');
        const applicationBatch = [];
        for (let i = 1; i <= 500; i++) {
            const emp_no = `APP${i.toString().padStart(4, '0')}`;
            const dept = depts[i % depts.length];
            const desig = designations[i % designations.length];

            applicationBatch.push({
                status: 'pending',
                emp_no,
                employee_name: `Applicant ${i}`,
                division_id: division._id,
                department_id: dept._id,
                designation_id: desig._id,
                proposedSalary: 25000 + (i * 10),
                gender: i % 2 === 0 ? 'Male' : 'Female',
                email: `app${i}@pydahsoft.test`,
                phone_number: `80000${i.toString().padStart(5, '0')}`,
                doj: new Date(2026, 2, 1), // March 2026
                dob: new Date(1995, 0, 1),
                createdBy: admin._id
            });

            if (applicationBatch.length >= 100) {
                await EmployeeApplication.insertMany(applicationBatch);
                console.log(`Progress: ${i}/500`);
                applicationBatch.length = 0;
            }
        }
        if (applicationBatch.length > 0) {
            await EmployeeApplication.insertMany(applicationBatch);
        }

        console.log('500 applications created successfully.');
        process.exit(0);
    } catch (error) {
        console.error('Error seeding applications:', error);
        process.exit(1);
    }
}

seedApplications();
