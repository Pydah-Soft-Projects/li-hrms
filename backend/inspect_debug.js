
const mongoose = require('mongoose');
const dotenv = require('dotenv');
const path = require('path');

// Load env vars
dotenv.config({ path: path.join(__dirname, '.env') });

const connectDB = async () => {
    try {
        // Suppress strictQuery warning
        mongoose.set('strictQuery', false);
        const conn = await mongoose.connect(process.env.MONGO_URI);
        console.log(`MongoDB Connected: ${conn.connection.host}`);
    } catch (error) {
        console.error(`Error: ${error.message}`);
        process.exit(1);
    }
};

const run = async () => {
    await connectDB();

    // Register models to avoid missing schema errors
    require('./users/model/User');
    require('./departments/model/Department');
    require('./departments/model/Designation');
    require('./settings/model/Settings');

    // 1. Inspect Settings
    try {
        const Settings = require('./employee-applications/model/EmployeeApplicationFormSettings');
        const activeSettings = await Settings.getActiveSettings();
        console.log('\n=== Active Form Settings ===');
        if (activeSettings) {
            console.log('ID:', activeSettings._id);
            console.log('Version:', activeSettings.version);
            console.log('Qualifications Config:', JSON.stringify(activeSettings.qualifications, null, 2));
        } else {
            console.log('NO ACTIVE SETTINGS FOUND');
        }

        // 2. Inspect Employees with weird qualifications
        const Employee = require('./employees/model/Employee');
        const employees = await Employee.find({}).sort({ updated_at: -1 }).limit(5);

        console.log('\n=== Recent Employees Qualifications ===');
        employees.forEach(emp => {
            console.log(`Emp: ${emp.emp_no} (${emp.employee_name})`);
            console.log('Quals:', JSON.stringify(emp.qualifications, null, 2));
            console.log('---');
        });

    } catch (err) {
        console.error('Error executing script:', err);
    } finally {
        await mongoose.connection.close();
        process.exit();
    }
};

run();
