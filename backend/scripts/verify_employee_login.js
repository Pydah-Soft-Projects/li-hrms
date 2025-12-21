const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const dotenv = require('dotenv');
const path = require('path');

// Load environment variables
dotenv.config({ path: path.join(__dirname, '../.env') });

const Employee = require('../employees/model/Employee');

async function verifyLogin(identifier, password) {
    try {
        await mongoose.connect(process.env.MONGODB_URI);
        console.log('Connected to MongoDB');

        const emp = await Employee.findOne({
            $or: [
                { email: identifier.toLowerCase() },
                { emp_no: identifier.toUpperCase() }
            ]
        }).select('+password');

        if (!emp) {
            console.log(`Employee not found for identifier: ${identifier}`);
            return;
        }

        console.log(`Found Employee: ${emp.employee_name} (${emp.emp_no})`);
        console.log(`Email: ${emp.email}`);
        console.log(`Password set: ${!!emp.password}`);

        if (!emp.password) {
            console.error('CRITICAL: Password is NULL in database for this employee.');
            return;
        }

        console.log(`Attempting to compare password: ${password}`);
        const isValid = await emp.comparePassword(password);
        console.log(`Password is valid: ${isValid}`);

        if (!isValid) {
            // Double check bcrypt manually
            console.log('Double checking with manual bcrypt comparison...');
            const manualValid = await bcrypt.compare(password, emp.password);
            console.log(`Manual bcrypt comparison: ${manualValid}`);
        }

    } catch (err) {
        console.error('Error:', err);
    } finally {
        await mongoose.connection.close();
    }
}

// Get args from command line
const args = process.argv.slice(2);
if (args.length < 2) {
    console.log('Usage: node verify_employee_login.js <identifier> <password>');
    process.exit(1);
}

verifyLogin(args[0], args[1]);
