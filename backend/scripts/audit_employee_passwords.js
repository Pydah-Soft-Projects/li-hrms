const mongoose = require('mongoose');
const dotenv = require('dotenv');
const path = require('path');

// Load environment variables
dotenv.config({ path: path.join(__dirname, '../.env') });

const Employee = require('../employees/model/Employee');

async function auditPasswords() {
    try {
        await mongoose.connect(process.env.MONGODB_URI);
        console.log('Connected to MongoDB');

        const employees = await Employee.find({}).select('+password');
        const total = employees.length;
        const missing = employees.filter(e => !e.password);

        console.log(`Total Employees: ${total}`);
        console.log(`Employees missing passwords: ${missing.length}`);

        if (missing.length > 0) {
            console.log('Sample missing employees (emp_no):');
            missing.slice(0, 10).forEach(e => console.log(`- ${e.emp_no} (${e.employee_name})`));
        } else {
            console.log('All employees have some password hash set.');
        }

    } catch (err) {
        console.error('Error:', err);
    } finally {
        await mongoose.connection.close();
    }
}

auditPasswords();
