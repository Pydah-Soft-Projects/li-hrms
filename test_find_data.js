const mongoose = require('mongoose');
const path = require('path');

// Mocking some globals that might be needed by models if they use them in pre-save hooks etc.
global.require = require;

async function run() {
    try {
        await mongoose.connect('mongodb://localhost:27017/li-hrms');
        console.log('Connected to MongoDB');

        const Employee = require('./backend/employees/model/Employee');
        const User = require('./backend/users/model/User');

        console.log('--- Searching for Employees with Reporting Managers ---');
        const employeesWithManager = await Employee.find({
            $or: [
                { 'dynamicFields.reporting_to': { $exists: true, $not: { $size: 0 } } },
                { 'dynamicFields.reporting_to_': { $exists: true, $not: { $size: 0 } } }
            ]
        }).limit(3);

        if (employeesWithManager.length === 0) {
            console.log('No employees found with reporting managers.');
        } else {
            for (const emp of employeesWithManager) {
                console.log(`Employee: ${emp.employee_name} (${emp.emp_no})`);
                const managers = emp.dynamicFields.reporting_to || emp.dynamicFields.reporting_to_ || [];
                console.log(`Managers: ${JSON.stringify(managers)}`);

                // Find user account for this employee
                const user = await User.findOne({ employeeId: emp._id });
                console.log(`User Account: ${user ? user.email : 'None'}`);
                console.log('---');
            }
        }

        console.log('--- Searching for Employee WITHOUT Reporting Manager ---');
        const empNoManager = await Employee.findOne({
            $and: [
                { 'dynamicFields.reporting_to': { $size: 0 } },
                { 'dynamicFields.reporting_to_': { $size: 0 } }
            ]
        });

        if (empNoManager) {
            console.log(`Employee: ${empNoManager.employee_name} (${empNoManager.emp_no})`);
            const user = await User.findOne({ employeeId: empNoManager._id });
            console.log(`User Account: ${user ? user.email : 'None'}`);
        } else {
            console.log('No employees found without reporting managers.');
        }

        process.exit(0);
    } catch (error) {
        console.error('Error:', error);
        process.exit(1);
    }
}

run();
