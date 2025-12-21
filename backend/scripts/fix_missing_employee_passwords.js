const mongoose = require('mongoose');
const dotenv = require('dotenv');
const path = require('path');
const crypto = require('crypto');

// Load environment variables
dotenv.config({ path: path.join(__dirname, '../.env') });

const Employee = require('../employees/model/Employee');

// Simple password generator
function generateRandomPassword(length = 10) {
    return crypto.randomBytes(Math.ceil(length / 2)).toString('hex').slice(0, length);
}

async function fixPasswords() {
    try {
        await mongoose.connect(process.env.MONGODB_URI);
        console.log('Connected to MongoDB');

        const employees = await Employee.find({
            $or: [
                { password: null },
                { password: { $exists: false } }
            ]
        }).select('+password');

        console.log(`Found ${employees.length} employees missing passwords.`);

        for (const emp of employees) {
            const newPassword = generateRandomPassword();
            emp.password = newPassword;
            await emp.save();
            console.log(`Updated password for ${emp.emp_no} (${emp.employee_name}): ${newPassword}`);
        }

        console.log('All missing passwords have been set.');

    } catch (err) {
        console.error('Error:', err);
    } finally {
        await mongoose.connection.close();
    }
}

fixPasswords();
